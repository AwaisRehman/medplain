#!/usr/bin/env python3
"""
agreement.py -- inter-annotator agreement (Cohen's kappa) for two independently filled copies of a sheet.

usage (from repo root):
  python experiments/scripts/agreement.py sheets_A/error_audit.csv sheets_B/error_audit.csv
  python experiments/scripts/agreement.py sheets_A/flag_audit.csv  sheets_B/flag_audit.csv
  python experiments/scripts/agreement.py sheets_A/drug_names.csv  sheets_B/drug_names.csv

Compares the judgement column (occurred / real_error / judgement) row by row, matched on the first
column (the row id). Report the kappa in the paper, then resolve disagreements by discussion and
use the resolved sheet for score_results.py.
"""
import csv
import sys
from collections import Counter


def load(p):
    with open(p, encoding="utf-8-sig") as fh:
        rows = list(csv.reader(fh))
    hdr = [h.strip().lower() for h in rows[0]]
    idx = next(i for i, h in enumerate(hdr) if h.startswith(("occurred", "real_error", "judgement")))
    key = 0
    if hdr[0].startswith("output_id") and "drug_en" in hdr:      # drug sheet: id = output + drug
        d = hdr.index("drug_en")
        return {(r[0], r[d]): r[idx].strip().lower() for r in rows[1:] if len(r) > idx and r[idx].strip()}, hdr[idx]
    return {r[key]: r[idx].strip().lower() for r in rows[1:] if len(r) > idx and r[idx].strip()}, hdr[idx]


def kappa(a, b):
    keys = sorted(set(a) & set(b))
    n = len(keys)
    if n == 0:
        return None, 0, 0
    agree = sum(a[k] == b[k] for k in keys)
    po = agree / n
    ca, cb = Counter(a[k] for k in keys), Counter(b[k] for k in keys)
    pe = sum((ca[c] / n) * (cb[c] / n) for c in set(ca) | set(cb))
    return (1.0 if pe == 1 else (po - pe) / (1 - pe)), agree, n


def main():
    a, col = load(sys.argv[1])
    b, _ = load(sys.argv[2])
    k, agree, n = kappa(a, b)
    if k is None:
        sys.exit("No rows judged by both annotators.")
    print(f"Column: {col}")
    print(f"Rows judged by both: {n}; raw agreement: {agree}/{n} = {100 * agree / n:.1f}%")
    print(f"Cohen's kappa: {k:.2f}")
    dis = [x for x in sorted(set(a) & set(b)) if a[x] != b[x]]
    if dis:
        print(f"\n{len(dis)} disagreements to resolve:")
        for x in dis:
            print(f"  {x}: A={a[x]}  B={b[x]}")


if __name__ == "__main__":
    main()
