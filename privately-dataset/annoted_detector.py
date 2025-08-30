import json
import sys

def read_jsonl(path):
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)

def main(infile):
    for record in read_jsonl(infile):
        text = record["text"]
        substrings = [text[s["start"]:s["end"]] for s in record.get("spans", [])]
        print(text)
        if substrings:
            print("  →", ", ".join(substrings))
        else:
            print("  → (no spans)")
        print("________")

if __name__ == "__main__":
    main("./privately-dataset/annotated.jsonl")
