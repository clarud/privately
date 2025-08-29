from fastapi import FastAPI
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List, Optional
from pathlib import Path
import json, numpy as np
from scipy.special import softmax
import onnxruntime as ort
from transformers import AutoTokenizer

# -------- Config --------
BASE_DIR   = Path(__file__).resolve().parent
TOKENIZER_DIR = BASE_DIR / "best"
ONNX_PATH     = BASE_DIR / "onnx" / "model-int8.onnx"   # or "model.onnx"

# Load labels + tokenizer
LABELS = json.load(open(TOKENIZER_DIR / "labels.json"))["labels"]
tok    = AutoTokenizer.from_pretrained(str(TOKENIZER_DIR))

# Choose ONNX provider
_avail = ort.get_available_providers()
_provider = "CUDAExecutionProvider" if "CUDAExecutionProvider" in _avail else "CPUExecutionProvider"
sess = ort.InferenceSession(str(ONNX_PATH), providers=[_provider])

# -------- FastAPI app --------
app = FastAPI(title="PII NER (ONNX)", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

class DetectReq(BaseModel):
    text: str = Field(..., description="Raw text or code")
    threshold: float = Field(0.65, ge=0.0, le=0.99)
    per_label_threshold: Optional[Dict[str, float]] = Field(
        default=None,
        description='Optional per-type thresholds, e.g. {"PER":0.65,"ADDR":0.70,"ORG":0.75}'
    )
    max_len: int = Field(256, description="Tokenizer max length (tokens)")
    stride_chars: int = Field(512, description="Char overlap between long text chunks")

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

def _decode_chunk(text: str, threshold: float, per_type: dict, max_len: int):
    enc = tok(text, return_offsets_mapping=True, return_tensors="np",
              truncation=True, max_length=max_len)
    inputs = {k: v for k, v in enc.items() if k in ("input_ids", "attention_mask")}
    logits = sess.run(None, inputs)[0][0]  # [seq_len, num_labels]
    probs  = softmax(logits, axis=-1)
    ids    = probs.argmax(-1)
    offs   = enc["offset_mapping"][0]

    spans = []
    cur = None

    for i, (lab_id, p) in enumerate(zip(ids, probs[np.arange(len(ids)), ids])):
        s, e = map(int, offs[i])

        # Skip special/pad and weird zero-length offsets
        if (s == 0 and e == 0) or e <= s:
            continue

        lab = LABELS[lab_id]  # e.g., "O", "B-PER", "I-ADDR"
        if lab == "O":
            if cur:
                spans.append(cur)
                cur = None
            continue

        # Entity type (PER/ADDR/ORG), regardless of B-/I-
        typ = lab.split("-", 1)[1] if "-" in lab else lab
        thr = per_type.get(typ, threshold)
        if p < thr:
            # Below threshold → terminate any open span
            if cur:
                spans.append(cur)
                cur = None
            continue

        # Decide whether to start a new span
        start_new = False
        if cur is None:
            # orphan I-xxx or first B-xxx
            start_new = True
        elif typ != cur["label"]:
            # type switched mid-stream
            start_new = True
        elif lab.startswith("B-"):
            # explicit B- begins a new entity even if same type
            start_new = True

        if start_new:
            if cur:
                spans.append(cur)
            cur = {"start": s, "end": e, "label": typ, "score": float(p)}
        else:
            # extend current span
            cur["end"] = max(cur["end"], e)
            cur["score"] = max(cur["score"], float(p))

    if cur:
        spans.append(cur)

    # Attach text slices
    for s in spans:
        s["text"] = text[s["start"]:s["end"]]
    return spans


def _detect(text: str, threshold: float, per_label_threshold: Optional[Dict[str,float]],
            max_len: int, stride_chars: int):
    # default per-type thresholds; caller overrides via per_label_threshold
    per_type = {"PER": threshold, "ADDR": max(threshold, 0.70), "ORG": max(threshold, 0.75)}
    if per_label_threshold: per_type.update(per_label_threshold)

    # Short text → single pass
    if len(tok(text)["input_ids"]) <= max_len:
        return _decode_chunk(text, threshold, per_type, max_len)

    # Long text → slide in char space, then merge
    spans_all=[]; i=0; CHUNK = 2000  # rough char window; tokenizer will clamp to max_len
    while i < len(text):
        piece = text[i:i+CHUNK]
        spans = _decode_chunk(piece, threshold, per_type, max_len)
        for s in spans:
            s["start"] += i; s["end"] += i; s["text"] = text[s["start"]:s["end"]]
        spans_all.extend(spans)
        step = max(CHUNK - stride_chars, 1)
        i += step

    # Merge overlapping/adjacent same-type spans
    spans_all.sort(key=lambda x: (x["start"], x["end"]))
    merged=[]
    for s in spans_all:
        if not merged: 
            merged.append(s); continue
        m = merged[-1]
        if s["label"] == m["label"] and s["start"] <= m["end"]:
            m["end"] = max(m["end"], s["end"])
            m["score"] = max(m["score"], s["score"])
            m["text"]  = text[m["start"]:m["end"]]
        else:
            merged.append(s)
    return merged

@app.get("/health")
def health():
    return {"ok": True, "provider": _provider, "labels": LABELS}

@app.post("/detect", response_model=DetectResp)
def detect(req: DetectReq):
    spans = _detect(req.text, req.threshold, req.per_label_threshold, req.max_len, req.stride_chars)
    return {"spans": spans, "provider": _provider, "labels": LABELS}
