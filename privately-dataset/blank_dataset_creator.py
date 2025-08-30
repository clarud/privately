import json, uuid, pathlib

# Path to your text file with one sentence per line
INPUT_FILE = "./privately-dataset/sentences.txt"
OUTPUT_FILE = "./privately-dataset/to_annotate.jsonl"

# Read all non-empty lines
with open(INPUT_FILE, "r", encoding="utf-8") as f:
    sentences = [line.strip() for line in f if line.strip()]

# Convert to JSONL with empty spans
pathlib.Path(OUTPUT_FILE).write_text(
    "\n".join(
        json.dumps({"id": str(uuid.uuid4()), "text": s, "spans": []}, ensure_ascii=False)
        for s in sentences
    ),
    encoding="utf-8"
)

print(f"Wrote {len(sentences)} examples to {OUTPUT_FILE}")

