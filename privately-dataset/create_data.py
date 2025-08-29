# --- CONFIG ---
CSV_PATH = "./ner_dataset.csv"   # <-- change this
OUT_DIR  = "./data"              # where JSONL files go
N_SAMPLES = 1000                # total examples to generate
POS_RATIO = 0.65                # fraction positives (rest negatives)
INCLUDE_ORG = True              # set False if you don't have enough orgs

import pandas as pd, numpy as np, json, random, re, pathlib, uuid
random.seed(7); np.random.seed(7)

# ----- load & clean -----
df = pd.read_csv(CSV_PATH)
# allow alternative spellings
col_map = {c.lower(): c for c in df.columns}
name_col = col_map.get("name")
addr_col = col_map.get("address")
org_col  = col_map.get("organisation") or col_map.get("organization")

if name_col is None or addr_col is None:
    raise ValueError("CSV must contain 'name' and 'address' columns (case-insensitive).")

# basic cleanup
for c in [name_col, addr_col, org_col] if org_col else [name_col, addr_col]:
    df[c] = df[c].astype(str).str.strip()

names  = [x for x in df[name_col].dropna().unique().tolist() if x and x.lower()!="nan"]
addrs  = [x for x in df[addr_col].dropna().unique().tolist() if x and x.lower()!="nan"]
orgs   = [x for x in (df[org_col].dropna().unique().tolist() if (INCLUDE_ORG and org_col) else []) if x and x.lower()!="nan"]

if not names or not addrs:
    raise ValueError("Need non-empty 'name' and 'address' lists after cleaning.")
if INCLUDE_ORG and not orgs:
    print("⚠️ No usable organisation names found — setting INCLUDE_ORG=False")
    INCLUDE_ORG = False

# ----- positive templates -----
POS_TEMPLATES = [
    '// Contact {PER} for access',
    '# Ship to {ADDR}',
    'const owner = "{PER}";',
    '"shipTo": "{ADDR}"',
    '/* Assigned to {PER} at {ADDR} */',
    'address = "{ADDR}"  # point person: {PER}',
]
if INCLUDE_ORG:
    POS_TEMPLATES += [
        'const vendor = "{ORG}";',
        '"company": "{ORG}"',
        '// Partner: {ORG} (POC: {PER})',
        '/* Delivery to {ADDR} billed to {ORG} */'
    ]

# ----- negatives (hardcoded & all-O) -----
# Pure-code negatives (static snippets; every token -> 'O')
PURE_NEG_SNIPPETS = [
    "import os, sys",
    "from collections import defaultdict",
    "package com.acme.backend.core;",
    "#include <vector>\nint main(){return 0;}",
    "def handle_request(req):\n    return {'ok': True}",
    "class DataService:\n    def __init__(self, url):\n        self.url = url",
    "for (let i=0; i<n; i++) { process(items[i]); }",
    "PATH=/usr/local/bin\nPORT=8080\nDEBUG=false",
    "url = 'https://api.example.com/v1/health'",
    "commit = '4fd3a1c9e3b5'\nchecksum = 0xdeadbeef",
    "{\n  \"service\": \"router-prod\",\n  \"replicas\": 3\n}",
    "const user_name = getUserName();",
    "resource \"aws_s3_bucket\" \"logs\" {\n  bucket = \"acme-logs\"\n}",
    "try { client.connect(); } catch (e) { logger.error(e); }",
    "fn main() { println!(\"hello\"); }",
    "SELECT id, created_at FROM orders WHERE status='PAID';",
    "kubectl get pods -n default",
    "pip install -r requirements.txt",
    "git fetch --all --prune",
    "make build && make test",
]

# Hard negatives: look-alikes (generated text; still all 'O')
HARD_NEG_TEMPLATES = [
    "class {ID} {{ }}",
    "from {id1} import {id2}",
    "{id1}.{id2}.{id3}",
    "/users/{id1}.{id2}/docs",
    "https://{domain}/{id1}-{id2}",
    "addr = 0x{HEX}",
    "etag = \"{HEX}\"",
    "\"name\": \"{svc}\"",
    "\"company\": \"{svc}\"",
    "const {id1} = {id2}Name;",
    "namespace {Ns1}.{Ns2};",
    "public class {ID}Controller {{ }}",
    "let {id1} = new {ID}();",
    "using {Ns1}.{Ns2};",
    "#define {ID} 1024",
]

ID_PIECES = ["john","tan","wei","ming","priya","rahman","garcia","sato","lee","chen","nair","dubois","tobi","anna","karin","rahul","sara"]
SVC_PIECES = ["service","router","backend","core","ingest","auth","gateway","payments","orders","users"]
DOMAINS = ["acme.com","internal.example","corp.local","svc.cluster.local","example.com"]

def rand_ident():
    a,b = random.choice(ID_PIECES), random.choice(ID_PIECES)
    forms = [f"{a}_{b}", a.title()+b.title(), f"{a}{b.title()}"]
    return random.choice(forms)

def rand_hex(n=12): return "".join(random.choices("0123456789abcdef", k=n))
def rand_svc():      return random.choice(SVC_PIECES) + "-" + random.choice(["prod","stage","dev"])
def rand_domain():   return random.choice(DOMAINS)

# ----- tokenization + BIO tagging -----
TOK_RX = re.compile(r"\w+|[^\w\s]", re.UNICODE)

def tokenize(text: str):
    return TOK_RX.findall(text)

def token_offsets(text: str, tokens):
    offs=[]; pos=0
    for t in tokens:
        i = text.find(t, pos)
        if i < 0: i = pos
        offs.append((i, i+len(t))); pos = i+len(t)
    return offs

def bio_tags(tokens, text, spans):
    """
    spans: list of (start, end, label) with labels in {"PER","ADDR","ORG"}
    """
    tags = ["O"]*len(tokens)
    offs = token_offsets(text, tokens)
    for (s,e,lab) in spans:
        begun=False
        for i,(ts,te) in enumerate(offs):
            if te <= s or ts >= e: continue
            tags[i] = ("B-"+lab) if not begun else ("I-"+lab)
            begun = True
    return tags

# ----- generators -----
def pick_pos_template():
    candidates = POS_TEMPLATES if INCLUDE_ORG else [t for t in POS_TEMPLATES if "{ORG}" not in t]
    return random.choice(candidates)

def make_positive():
    tmpl = pick_pos_template()
    per = random.choice(names)   if "{PER}"  in tmpl else None
    addr = random.choice(addrs)  if "{ADDR}" in tmpl else None
    org  = (random.choice(orgs)  if (INCLUDE_ORG and "{ORG}" in tmpl) else None)

    text = tmpl
    if per  is not None: text = text.replace("{PER}",  per)
    if addr is not None: text = text.replace("{ADDR}", addr)
    if org  is not None: text = text.replace("{ORG}",  org)

    spans=[]
    if per  is not None:
        s = text.find(per);  spans.append((s, s+len(per),  "PER"))
    if addr is not None:
        s = text.find(addr); spans.append((s, s+len(addr), "ADDR"))
    if org  is not None:
        s = text.find(org);  spans.append((s, s+len(org),  "ORG"))

    tokens = tokenize(text)
    tags   = bio_tags(tokens, text, spans)
    return {"id": str(uuid.uuid4()), "text": text, "tokens": tokens, "ner_tags": tags}

def make_pure_code_negative():
    text = random.choice(PURE_NEG_SNIPPETS)
    tokens = tokenize(text)
    tags = ["O"] * len(tokens)   # all O
    return {"id": str(uuid.uuid4()), "text": text, "tokens": tokens, "ner_tags": tags}

def make_hard_negative():
    t = random.choice(HARD_NEG_TEMPLATES)
    text = t.format(
        ID = rand_ident().title().split("_")[0],
        id1 = rand_ident(), id2 = rand_ident(), id3 = rand_ident(),
        HEX = rand_hex(12),
        svc = rand_svc(),
        domain = rand_domain(),
        Ns1 = rand_ident().title(),
        Ns2 = rand_ident().title(),
    )
    tokens = tokenize(text)
    tags = ["O"] * len(tokens)   # all O
    return {"id": str(uuid.uuid4()), "text": text, "tokens": tokens, "ner_tags": tags}

# ----- synthesize with target percentages -----
N_POS = int(N_SAMPLES * POS_RATIO)            # e.g., 650
N_NEG = N_SAMPLES - N_POS                     # e.g., 350
PURE_WITHIN_NEG = 0.70                        # ~70% of negatives are pure-code
N_PURE_NEG = int(N_NEG * PURE_WITHIN_NEG)     # e.g., 245 (~24.5% overall)
N_HARD_NEG = N_NEG - N_PURE_NEG               # e.g., 105 (~10.5% overall)

rows = (
    [make_positive()         for _ in range(N_POS)] +
    [make_pure_code_negative() for _ in range(N_PURE_NEG)] +
    [make_hard_negative()      for _ in range(N_HARD_NEG)]
)
random.shuffle(rows)

# ----- split & write JSONL -----
outdir = pathlib.Path(OUT_DIR); outdir.mkdir(parents=True, exist_ok=True)
n = len(rows); n_tr = int(0.8*n); n_va = int(0.1*n)
splits = {"train": rows[:n_tr], "val": rows[n_tr:n_tr+n_va], "test": rows[n_tr+n_va:]}

for name, arr in splits.items():
    with open(outdir/f"{name}.jsonl","w",encoding="utf-8") as f:
        for ex in arr:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

print("✅ Done.")
print(f"Total: {n} | Pos: {N_POS} | Neg: {N_NEG} (Pure: {N_PURE_NEG}, Hard: {N_HARD_NEG})")
for k,v in {k:len(v) for k,v in splits.items()}.items(): print(k, v)
print("Example:", rows[0])
