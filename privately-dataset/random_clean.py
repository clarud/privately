#!/usr/bin/env python3
import csv, json, uuid, pathlib, random, re
from typing import List, Dict, Tuple, Optional

# ====== Config ======
PII_CSV      = "./privately-dataset/pii_database.csv"
OUTPUT_FILE  = "./privately-dataset/clean2.jsonl"
NUM_SAMPLES  = 4744
RANDOM_SEED  = 42  # set to None for full randomness

# Probabilities
P_SPLIT_NAME    = 0.20   # chance to insert a separator inside name
P_SPLIT_ADDR    = 0.20   # chance to insert a separator inside address
P_PARTIAL_NAME  = 0.5   # NEW: chance to only use a part of the name
P_PARTIAL_ADDR  = 0.5   # NEW: chance to only use a part of the address
P_ONLY_NAME     = 0.10
P_ONLY_ADDR     = 0.10
P_CASE_UPPER    = 0.15
P_CASE_TITLE    = 0.15
P_DOUBLE_SP     = 0.05

# ====== Helpers ======
def pick_headers(headers: List[str]) -> Tuple[str, str]:
    """Return (name_col, address_col) from headers (case-insensitive)."""
    lower2orig = {h.lower(): h for h in headers}
    for k in ("name",):
        if k in lower2orig:
            name_col = lower2orig[k]
            break
    else:
        raise KeyError(f"CSV must include a 'name' column (found: {headers})")

    for k in ("address",):
        if k in lower2orig:
            addr_col = lower2orig[k]
            break
    else:
        raise KeyError(f"CSV must include an 'address' column (found: {headers})")

    return name_col, addr_col

def normalize_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()\

# ---- Light fuzz (single '-' or '_' outside entities) ----
LIGHT_FUZZ_PROB = 0.15            # lower probability
LIGHT_FUZZ_TOKENS = ["-", "_"]    # only common separators

def _overlaps(i: int, spans: List[Tuple[int,int]]) -> bool:
    # i is an index in the original text for the space char position
    for s, e in spans:
        if s <= i < e:
            return True
    return False

def apply_light_fuzz_outside_entities(text: str, protected_spans: List[Tuple[int,int]],
                                      p: float = LIGHT_FUZZ_PROB):
    """
    Replace a single space between word chars with '-' or '_' at low probability.
    Never modify inside any protected span (entities).
    Returns (text2, fuzz_info | None).
    """
    import re, random
    if random.random() >= p:
        return text, None

    # candidates: positions of spaces between \w and \w (simple & safe)
    candidates = []
    for m in re.finditer(r'(?<=\w) (?=\w)', text):
        i = m.start() + 1  # index of the space character
        if not _overlaps(i, protected_spans):
            candidates.append(i)

    if not candidates:
        return text, None

    pos = random.choice(candidates)
    token = random.choice(LIGHT_FUZZ_TOKENS)
    text2 = text[:pos] + token + text[pos+1:]  # replace that ONE space

    return text2, {"pos": pos, "inserted": token}


def maybe_split_tokens(text: str) -> str:
    """Replace one whitespace with a random separator to simulate splits (one split)."""
    parts = re.split(r"(\s+)", text)
    gaps = [i for i in range(1, len(parts)-1, 2)]
    if not gaps:
        return text
    i = random.choice(gaps)
    parts[i] = random.choice([" ", "  ", "   ", "\n", "\t", " - ", " _ ", ".", " · "])
    return "".join(parts)

def maybe_jitter_case(s: str) -> str:
    r = random.random()
    if r < P_CASE_UPPER:
        return s.upper()
    if r < P_CASE_UPPER + P_CASE_TITLE:
        return s.title()
    return s

def maybe_double_spaces(s: str) -> str:
    if random.random() < P_DOUBLE_SP:
        # double a few whitespace occurrences
        return re.sub(r"\s", lambda m: m.group(0)*2, s, count=random.randint(1, 3))
    return s

# ---------- NEW: partials ----------
def partial_name(full: str) -> str:
    """
    Choose a sub-span of the name:
    - first token, last token, first+last, first two, middle, etc.
    """
    toks = [t for t in re.split(r"[\s\-_/]+", full) if t]
    if not toks:
        return full
    strategies = []
    if len(toks) >= 1:
        strategies += [
            lambda ts: ts[0],            # first
            lambda ts: ts[-1],           # last
        ]
    if len(toks) >= 2:
        strategies += [
            lambda ts: " ".join(ts[:2]), # first two
            lambda ts: " ".join([ts[0], ts[-1]]),  # first + last
        ]
    if len(toks) >= 3:
        mid = len(toks)//2
        strategies += [
            lambda ts: " ".join(ts[mid:mid+2]) if mid+1 < len(ts) else ts[mid],
            lambda ts: " ".join(ts[1:-1]),      # drop first/last
        ]
    pick = random.choice(strategies) if strategies else (lambda ts: " ".join(ts))
    return pick(toks)

_STREET_KEYS = {
    "ST","ST.","STREET","AVE","AVENUE","RD","ROAD","DR","DRIVE","CRES","CRESCENT",
    "LOR","LORONG","JLN","JALAN","LINK","CLOSE","CL","PL","PLACE","LANE","LN","TER","TERRACE","CIR","CIRCLE"
}

def strip_addr_noise(s: str) -> str:
    """Drop common SG address add-ons: unit, postal, BLK."""
    s = re.sub(r"#\s*\d{1,3}[-–]\d{1,4}", "", s)  # unit
    s = re.sub(r"\bS(?:ingapore)?\s*[\( ]?\d{5,6}\)?", "", s, flags=re.IGNORECASE)  # postal
    s = re.sub(r"\bBLK\s*\d+\b", "", s, flags=re.IGNORECASE)  # BLK
    return normalize_ws(s)

def keep_street_core(s: str) -> str:
    """Try to keep just the street + number (e.g., ANG MO KIO AVE 3)."""
    toks = s.split()
    if not toks:
        return s
    idx = None
    for i,t in enumerate(toks):
        if t.upper() in _STREET_KEYS:
            idx = i; break
    if idx is None and len(toks) >= 2:
        # heuristic: last 2–4 tokens often are the street core
        n = random.choice([2,3,4])
        return " ".join(toks[-n:])
    # include the keyword and a couple tokens around it
    end = min(len(toks), idx+3)
    start = max(0, idx-2)
    return " ".join(toks[start:end])

def partial_addr(full: str) -> str:
    """
    Choose a sub-span of the address:
    - drop unit/postal/BLK
    - keep only street core
    - keep first N tokens
    """
    options = []
    s0 = normalize_ws(full)
    s1 = strip_addr_noise(s0)
    options.append(s1)
    options.append(keep_street_core(s1))
    toks = s1.split()
    if len(toks) >= 2:
        options.append(" ".join(toks[:2]))
    if len(toks) >= 3:
        options.append(" ".join(toks[:3]))
    if len(toks) >= 4:
        options.append(" ".join(toks[:4]))
    # fall back to original if all else fails
    options.append(s0)
    # return a random non-empty choice
    cand = random.choice([o for o in options if o.strip()] or [s0])
    return cand

def transform_entity_with_partials(s: str, p_partial: float, p_split: float, kind: str) -> str:
    """Apply partial selection (by kind) then case/space jitter and optional one split."""
    if not s:
        return s
    out = s
    if random.random() < p_partial:
        if kind == "name":
            out = partial_name(out)
        elif kind == "addr":
            out = partial_addr(out)
    out = maybe_jitter_case(out)
    out = maybe_double_spaces(out)
    if random.random() < p_split:
        out = maybe_split_tokens(out)
    return out

def find_all_spans(text: str, needle: str) -> List[Tuple[int, int]]:
    spans = []
    if not needle:
        return spans
    start = 0
    n = len(needle)
    while True:
        i = text.find(needle, start)
        if i == -1:
            break
        spans.append((i, i+n))
        start = i + n
    return spans

def build_variants(name_ins: str, addr_ins: str) -> List[str]:
    bag: List[str] = []

    if name_ins and addr_ins:
        bag += [
            # clean anchors
            f"Meet {name_ins} at {addr_ins} tomorrow.",
            f"Delivery for {name_ins} at {addr_ins} has been scheduled.",
            f"{name_ins} recently moved to {addr_ins}.",
            f'console.error("export", "{name_ins}", "{addr_ins}");',
            # longer ones (kept from your set)
            f"Hello ops-team, please schedule a delivery for valued customer {name_ins}, currently registered under residential address {addr_ins}, ensure you confirm by phone and log into CRM with a timestamp for compliance purposes.",
            f"Audit trail requires storing the following: full legal name {name_ins}, official correspondence address {addr_ins}, last login, current IP, MFA state, and document verification status.",
            f"[2025-08-30 17:42:19Z] EVENT=USER_UPDATE :: user={name_ins} :: addr={addr_ins} :: status=pending_review :: flag=postal_mismatch",
            f'{{"event":"shipment","payload":{{"name":"{name_ins}","addr":"{addr_ins}","priority":"HIGH","tags":["sg","manual_check"]}}}}',
            f"SQL> INSERT INTO recipients(full_name, address, status, created_at) VALUES ('{name_ins}','{addr_ins}','active','2025-08-30T12:33:00'); -- logID=34992",
            f"<recipient><fullName>{name_ins}</fullName><addressLine>{addr_ins}</addressLine><region>Singapore</region><postal>???</postal><flag>review</flag></recipient>",
            f"/* SECURITY WARNING */ validateRecipient(name='{name_ins}', addr='{addr_ins}', mode='strict', retries=3, trace=True)",
            f"DEBUG -- preparing export job: recipient={name_ins} at destination={addr_ins}, packaging=fragile, insurance=YES, SLA=24h window",
            f"INFO 2025-08-30T08:22Z -- Completed onboarding for {name_ins}, default delivery location {addr_ins}, subscription=PREMIUM, invoice cycle=monthly",
        ]

    elif name_ins:
        bag += [
            f"{name_ins} signed in.",
            f"Contact person is {name_ins}.",
            f"Recipient: {name_ins}",
            f'const name = "{name_ins}";',
            f"System log event captured: user {name_ins} authenticated successfully with multi-factor override, assigned elevated privileges to resource-group=admin-core, session expiry=2h, security flag=review.",
            f"Customer record update required → identity holder: {name_ins}, outstanding orders exist, ensure KYC forms are attached before next payment cycle.",
            f"TRACE: user={name_ins} attempted login with MFA disabled, geo=SG, device=Android, browser=Chrome/119.0, ip=203.0.113.45",
            f'{{"user":"{name_ins}","role":"owner","status":"active","groups":["sg-admin","beta-testers"],"lastSeen":"2025-08-30T07:15:00Z"}}',
            f"/* Assign new ACL */ grantAccess(user='{name_ins}', role='viewer', expiry='2025-12-31T23:59:59')",
            f"CRITICAL ALERT: Suspicious activity detected for account holder {name_ins}, triggered anomaly detection threshold=0.87, notify SOC immediately.",
            f"commit 9f2c45 -- feat(auth): add session hook for user {name_ins}, track token revocation across clusters",
        ]

    elif addr_ins:
        bag += [
            f"Ship to {addr_ins}.",
            f"Meeting location: {addr_ins}.",
            f"New address on file: {addr_ins}",
            f'const address = "{addr_ins}";',
            f"Maintenance ticket created: physical site {addr_ins}, severity=2, reported by IoT-sensor cluster #443, ETA technician dispatch=3h, SLA target=12h window.",
            f"Logistics planning requires accurate mapping: primary hub={addr_ins}, route optimized for fuel efficiency, fallback depot=Jurong, geo-coordinates attached.",
            f"[WARN] address={addr_ins} failed geocode lookup; fallback triggered to external service; verify manually before committing to ERP system.",
            f'{{"deliveryPoint":"{addr_ins}","region":"SG","geocoded":false,"priority":"MEDIUM","sla":"48h"}}',
            f"SQL> UPDATE addresses SET verified=true, updated_at=NOW() WHERE addr='{addr_ins}' AND country='SG';",
            f"<location><address>{addr_ins}</address><zone>North-East</zone><postal>unknown</postal><status>pending</status></location>",
            f"curl -X POST https://api.ship/validate -d 'addr={addr_ins}&country=SG' -H 'Authorization: Bearer ...'",
            f"# TODO: verify {addr_ins} with Singapore Land Authority dataset; ensure lat/long precision < 30m",
        ]

    return bag


# ====== Main ======
def main():
    if RANDOM_SEED is not None:
        random.seed(RANDOM_SEED)

    pathlib.Path(OUTPUT_FILE).parent.mkdir(parents=True, exist_ok=True)

    # Read CSV
    with open(PII_CSV, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        name_col, addr_col = pick_headers(headers)

        rows: List[Dict[str, str]] = []
        for row in reader:
            name = (row.get(name_col) or "").strip()
            addr = (row.get(addr_col) or "").strip()
            if name or addr:
                rows.append({"name": name, "address": addr})
    if not rows:
        raise RuntimeError("No usable rows found. Ensure CSV has 'name' and 'address' with data.")

    out_lines: List[str] = []

    for _ in range(NUM_SAMPLES):
        r = random.choice(rows)
        base_name = r["name"]
        base_addr = r["address"]

        # Decide inclusion
        include_name = True
        include_addr = True
        roll = random.random()
        if roll < P_ONLY_NAME:
            include_addr = False
        elif roll < P_ONLY_NAME + P_ONLY_ADDR:
            include_name = False

        # Transform inserted strings (partials -> jitter -> optional split)
        name_ins = transform_entity_with_partials(
            base_name, P_PARTIAL_NAME, P_SPLIT_NAME, kind="name"
        ) if (include_name and base_name) else ""

        addr_ins = transform_entity_with_partials(
            base_addr, P_PARTIAL_ADDR, P_SPLIT_ADDR, kind="addr"
        ) if (include_addr and base_addr) else ""

        # Build candidates; ensure at least something is produced
        bag = build_variants(name_ins, addr_ins)
        if not bag:
            # if both empty after inclusion rules, fallback to a simple one
            if base_name:
                name_ins = transform_entity_with_partials(base_name, P_PARTIAL_NAME, P_SPLIT_NAME, "name")
                bag = build_variants(name_ins, "")
            elif base_addr:
                addr_ins = transform_entity_with_partials(base_addr, P_PARTIAL_ADDR, P_SPLIT_ADDR, "addr")
                bag = build_variants("", addr_ins)

        text = random.choice(bag)

        # Build protected spans (all occurrences of entities in the clean text)
        protected = []
        protected += find_all_spans(text, name_ins)
        protected += find_all_spans(text, addr_ins)

        # Apply one light fuzz outside protected spans (low probability)
        text, fuzz_info = apply_light_fuzz_outside_entities(text, protected, p=LIGHT_FUZZ_PROB)
        # (Optional) you can log fuzz_info if you want to audit where it happened

        # Auto-annotate after fuzz, using the exact inserted strings
        spans: List[Dict] = []
        for s, e in find_all_spans(text, name_ins):
            spans.append({"start": s, "end": e, "label": "NAME"})
        for s, e in find_all_spans(text, addr_ins):
            spans.append({"start": s, "end": e, "label": "ADDR"})


        # De-overlap just in case
        spans.sort(key=lambda x: (x["start"], x["end"]))
        dedup = []
        last_end = -1
        for sp in spans:
            if sp["start"] >= last_end:
                dedup.append(sp)
                last_end = sp["end"]

        ex = {"id": str(uuid.uuid4()), "text": text, "spans": dedup}
        out_lines.append(json.dumps(ex, ensure_ascii=False))

    pathlib.Path(OUTPUT_FILE).write_text("\n".join(out_lines), encoding="utf-8")
    print(f"Wrote {len(out_lines)} examples to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
