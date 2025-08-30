// src/background.js
import * as ort from "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js";
import { AutoTokenizer } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.1";

const MODEL_URL = chrome.runtime.getURL("assets/model.onnx");
const TOK_URL   = chrome.runtime.getURL("assets/tokenizer.json");
const LAB_URL   = chrome.runtime.getURL("assets/labels.json");

const MAX_LEN = 256; // adjust as needed

let sessionP, tokenizerP, labelsP;

function webgpuOK() { return "gpu" in navigator; }
const SPECIAL = new Set(["[CLS]", "[SEP]", "[PAD]"]);

async function getLabels() {
  labelsP ||= fetch(LAB_URL).then(r => r.json());
  return labelsP;
}
async function getTokenizer() {
  tokenizerP ||= AutoTokenizer.from_pretrained(TOK_URL, {
    config: { _name_or_path: "local", model_max_length: MAX_LEN }
  });
  return tokenizerP;
}
async function getSession() {
  if (sessionP) return sessionP;

  const eps = [];
  if (webgpuOK()) eps.push("webgpu");
  eps.push("wasm");
  ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
  ort.env.wasm.simd = true;
  ort.env.wasm.numThreads = Math.max(2, (navigator.hardwareConcurrency || 4) - 2);

  sessionP = (async () => {
    const buf = await fetch(MODEL_URL).then(r => r.arrayBuffer());
    const session = await ort.InferenceSession.create(buf, { executionProviders: eps });

    // Warm up
    const ids = new BigInt64Array(MAX_LEN).fill(0n);
    const att = new BigInt64Array(MAX_LEN).fill(1n);
    const inNames = session.inputNames.map(n => n.toLowerCase());
    const feeds = {};
    feeds[session.inputNames[inNames.findIndex(n => n.includes("input"))] || "input_ids"]
      = new ort.Tensor("int64", ids, [1, MAX_LEN]);
    feeds[session.inputNames[inNames.findIndex(n => n.includes("mask"))] || "attention_mask"]
      = new ort.Tensor("int64", att, [1, MAX_LEN]);
    await session.run(feeds);
    console.log("[PII] ORT ready:", session.inputNames, "->", session.outputNames);
    return session;
  })();

  return sessionP;
}

function argmaxFlat(flat, rows, cols) {
  const out = new Int32Array(rows);
  for (let r = 0; r < rows; r++) {
    let best = 0, bestVal = -Infinity, base = r * cols;
    for (let c = 0; c < cols; c++) {
      const v = flat[base + c];
      if (v > bestVal) { bestVal = v; best = c; }
    }
    out[r] = best;
  }
  return out;
}

async function runBert(text) {
  const [tok, sess, labels] = await Promise.all([getTokenizer(), getSession(), getLabels()]);
  const enc = await tok.encode(text, { truncation: true, max_length: MAX_LEN });

  // IMPORTANT: if your ONNX expects int32, swap to Int32Array and "int32"
  const ids  = BigInt64Array.from(enc.ids.map(BigInt));
  const mask = BigInt64Array.from(enc.attention_mask.map(BigInt));

  const inNames = sess.inputNames.map(n => n.toLowerCase());
  const feeds = {};
  const idName   = sess.inputNames[inNames.findIndex(n => n.includes("input"))] || "input_ids";
  const maskName = sess.inputNames[inNames.findIndex(n => n.includes("mask"))]  || "attention_mask";
  feeds[idName]   = new ort.Tensor("int64", ids,  [1, enc.ids.length]);
  feeds[maskName] = new ort.Tensor("int64", mask, [1, enc.attention_mask.length]);

  const outputs = await sess.run(feeds);
  const outName = sess.outputNames[0];
  const logits = outputs[outName].data; // Float32Array of length seq*num_labels

  const seq = enc.ids.length;
  const numLabels = (await getLabels()).length;
  const pred = argmaxFlat(logits, seq, numLabels);

  // BIO → spans (with offsets if available)
  const toks = enc.tokens;
  const offs = enc.offsets || [];
  const spans = [];
  let cur = null;

  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    if (SPECIAL.has(tok)) { if (cur) { spans.push(cur); cur = null; } continue; }

    const lab = (await getLabels())[pred[i]] || "O";
    if (lab === "O") { if (cur) { spans.push(cur); cur = null; } continue; }
    const [pre, typ] = lab.includes("-") ? lab.split("-", 2) : ["B", lab];

    const hasOff = Array.isArray(offs[i]) && offs[i][0] != null && offs[i][1] != null;
    const s = hasOff ? offs[i][0] : null;
    const e = hasOff ? offs[i][1] : null;

    if (!cur || cur.label !== typ || pre === "B") {
      if (cur) spans.push(cur);
      cur = { label: typ, start: s, end: e, tokenStart: i, tokenEnd: i + 1, confidence: 0.85 };
    } else {
      cur.tokenEnd = i + 1;
      if (hasOff) cur.end = e;
    }
  }
  if (cur) spans.push(cur);

  for (const s of spans) {
    if (s.start != null && s.end != null) s.text = text.slice(s.start, s.end);
  }
  return spans;
}

// Message API used by content.js
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "PII_INFER_BERT") {
      try {
        const t0 = performance.now();
        const spans = await runBert(msg.text || "");
        sendResponse({ ok: true, latency_ms: Math.round(performance.now() - t0), spans });
      } catch (e) {
        console.error("[PII] BERT error", e);
        sendResponse({ ok: false, error: String(e) });
      }
    }
  })();
  return true;
});
