from fastapi import FastAPI
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List, Optional
from pathlib import Path
import json
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

BASE_DIR      = Path(__file__).resolve().parent
TOKENIZER_DIR = BASE_DIR / "onnx_int8"
ONNX_PATH     = TOKENIZER_DIR / "model.onnx"

if not TOKENIZER_DIR.exists():
    raise FileNotFoundError(f"Model folder not found: {TOKENIZER_DIR}")
if not ONNX_PATH.exists():
    raise FileNotFoundError(f"ONNX file not found: {ONNX_PATH}")
if not (TOKENIZER_DIR / "config.json").exists():
    raise FileNotFoundError(f"config.json not found in: {TOKENIZER_DIR}")

with open(TOKENIZER_DIR / "config.json", "r", encoding="utf-8") as f:
    cfg = json.load(f)

id2label = cfg.get("id2label")
if isinstance(id2label, dict):  # keys like "0","1",...
    LABELS = [id2label[str(i)] for i in range(len(id2label))]
elif isinstance(id2label, list):
    LABELS = id2label
else:
    LABELS = ["O", "B-NAME", "I-NAME", "B-ADDR", "I-ADDR"]  # fallback

tok = AutoTokenizer.from_pretrained(str(TOKENIZER_DIR))

so = ort.SessionOptions()
so.intra_op_num_threads = 1
so.inter_op_num_threads = 1
sess = ort.InferenceSession(str(ONNX_PATH), sess_options=so, providers=["CPUExecutionProvider"])
ACTIVE_PROVIDER = sess.get_providers()[0]


def np_softmax(x: np.ndarray, axis: int = -1) -> np.ndarray:
    x = x - np.max(x, axis=axis, keepdims=True)
    e = np.exp(x)
    return e / np.sum(e, axis=axis, keepdims=True)

def decode_chunk(text: str, threshold: float, per_type: Dict[str, float], max_len: int):
    enc = tok(
        text,
        return_offsets_mapping=True,
        return_tensors="np",
        truncation=True,
        max_length=max_len,
    )
    inputs = {
        "input_ids":      enc["input_ids"].astype(np.int64),
        "attention_mask": enc["attention_mask"].astype(np.int64),
    }
    if "token_type_ids" in enc:
        inputs["token_type_ids"] = enc["token_type_ids"].astype(np.int64)

    outputs = sess.run(None, inputs)
    logits = outputs[0]  # (1, seq, num_labels) or (seq, num_labels)
    if logits.ndim == 3:
        logits = logits[0]
    probs  = np_softmax(logits, axis=-1)
    ids    = probs.argmax(-1)
    offs   = enc["offset_mapping"][0]

    spans: List[Dict] = []
    cur: Optional[Dict] = None

    chosen = probs[np.arange(len(ids)), ids]

    for i, (lab_id, p) in enumerate(zip(ids, chosen)):
        s, e = map(int, offs[i])
        if (s == 0 and e == 0) or e <= s:
            continue

        lab = LABELS[int(lab_id)]
        if lab == "O":
            if cur:
                spans.append(cur)
                cur = None
            continue

        typ = lab.split("-", 1)[1] if "-" in lab else lab
        thr = per_type.get(typ, threshold)
        if p < thr:
            if cur:
                spans.append(cur)
                cur = None
            continue

        start_new = (cur is None) or (typ != cur["label"]) or lab.startswith("B-")
        if start_new:
            if cur:
                spans.append(cur)
            cur = {"start": s, "end": e, "label": typ, "score": float(p)}
        else:
            cur["end"] = max(cur["end"], e)
            cur["score"] = max(cur["score"], float(p))

    if cur:
        spans.append(cur)

    for s in spans:
        s["text"] = text[s["start"]:s["end"]]
    return spans

def detect(text: str, threshold: float, per_label_threshold: Optional[Dict[str, float]],
           max_len: int, stride_chars: int):
    # defaults for your two classes; caller can override
    per_type = {"NAME": threshold, "ADDR": max(threshold, 0.70)}
    if per_label_threshold:
        per_type.update(per_label_threshold)

    # Fast path: short input
    if len(tok(text)["input_ids"]) <= max_len:
        return decode_chunk(text, threshold, per_type, max_len)

    # Long input: slide over chars, then merge overlapping spans
    spans_all: List[Dict] = []
    i = 0
    CHUNK = 2000  # char window; tokenizer will clamp to max_len
    n = len(text)
    while i < n:
        piece = text[i:i + CHUNK]
        spans = decode_chunk(piece, threshold, per_type, max_len)
        for s in spans:
            s["start"] += i
            s["end"]   += i
            s["text"]   = text[s["start"]:s["end"]]
        spans_all.extend(spans)
        step = max(CHUNK - stride_chars, 1)
        i += step


    spans_all.sort(key=lambda x: (x["start"], x["end"]))
    merged: List[Dict] = []
    for s in spans_all:
        if not merged:
            merged.append(s)
            continue
        m = merged[-1]
        if s["label"] == m["label"] and s["start"] <= m["end"]:
            m["end"]  = max(m["end"], s["end"])
            m["score"] = max(m["score"], s["score"])
            m["text"]  = text[m["start"]:m["end"]]
        else:
            merged.append(s)
    return merged

app = FastAPI(title="PII NER (ONNX INT8, CPU)", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

class DetectReq(BaseModel):
    text: str = Field(..., description="Raw text")
    threshold: float = Field(0.65, ge=0.0, le=0.99)
    per_label_threshold: Optional[Dict[str, float]] = Field(
        default=None, description='Per-type thresholds, e.g. {"NAME":0.65,"ADDR":0.70}'
    )
    max_len: int = Field(256, description="Tokenizer max length (tokens)")
    stride_chars: int = Field(512, description="Char overlap for long text chunking")

class Span(BaseModel):
    start: int
    end: int
    label: str
    score: float
    text: str

class DetectResp(BaseModel):
    spans: List[Span]
    provider: str
    labels: List[str]

@app.get("/health")
def health():
    return {"ok": True, "provider": ACTIVE_PROVIDER, "labels": LABELS}

@app.post("/detect", response_model=DetectResp)
def detect_endpoint(req: DetectReq):
    spans = detect(req.text, req.threshold, req.per_label_threshold, req.max_len, req.stride_chars)
    return {"spans": spans, "provider": ACTIVE_PROVIDER, "labels": LABELS}
