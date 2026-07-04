#!/usr/bin/env python3
"""
eval/run_eval.py

Drives the running MedPlain app over the gold-standard dataset and reports:
  - Readability BEFORE vs AFTER  (Flesch-Kincaid grade, Flesch reading ease)
  - Fact preservation            (how many 'known_facts' survive in the output)
  - Guardrail behaviour          (how many flags the /api/verify layer raised)

This measures the SYSTEM end-to-end, exactly as a user experiences it.
It does NOT auto-judge the subtle 'known_traps' (meaning-level errors) — those
still need human review, which is itself one of the paper's findings. The script
prints the traps next to each case so you can score them by hand into results/.

Usage:
  1. Make sure the app is running:  npm run dev   (http://localhost:3000)
  2. Make sure Ollama is running with your model.
  3. python eval/run_eval.py
     (optional)  python eval/run_eval.py --lang ar   to evaluate Arabic output
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

import requests
import pandas as pd
import textstat

APP = "http://localhost:3000"
HERE = Path(__file__).resolve().parent
DATA = HERE / "dataset.json"
OUT = HERE / "results"
OUT.mkdir(exist_ok=True)


def normalize(s: str) -> str:
    """Lowercase and convert Arabic-Indic digits so fact matching is fair."""
    trans = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
    return s.translate(trans).lower()


def fact_survives(fact: str, output: str) -> bool:
    """A fact 'survives' if its core number(s), or its text, appear in the output."""
    out = normalize(output)
    f = normalize(fact)
    nums = re.findall(r"\d+(?:\.\d+)?", f)
    if nums:
        # every number in the fact must appear somewhere in the output
        return all(n in out for n in nums)
    # non-numeric fact: check the key word appears
    key = re.sub(r"[^a-z ]", "", f).strip().split(" ")[0]
    return key in out if key else False


def call_simplify(text: str, level: str, language: str) -> str:
    r = requests.post(
        f"{APP}/api/simplify",
        json={"text": text, "level": level, "language": language},
        timeout=180,
    )
    r.raise_for_status()
    data = r.json()
    if not data.get("ok"):
        raise RuntimeError(data.get("error", "simplify failed"))
    return data["simplified"], data["original"]


def call_verify(original: str, simplified: str) -> list:
    r = requests.post(
        f"{APP}/api/verify",
        json={"original": original, "simplified": simplified},
        timeout=180,
    )
    r.raise_for_status()
    data = r.json()
    return data.get("flags", []) if data.get("ok") else []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", default="en", choices=["en", "ar"])
    ap.add_argument("--level", default="grade8")
    args = ap.parse_args()

    cases = json.loads(DATA.read_text(encoding="utf-8"))["cases"]
    rows = []
    print(f"\nRunning {len(cases)} cases  |  language={args.lang}  level={args.level}\n")

    for c in cases:
        cid, original = c["id"], c["original"]
        print(f"→ {cid}  ({c['specialty']})")
        t0 = time.time()
        try:
            simplified, echoed = call_simplify(original, args.level, args.lang)
            flags = call_verify(echoed, simplified)
        except Exception as e:
            print(f"   ERROR: {e}\n")
            continue
        secs = round(time.time() - t0, 1)

        facts = c["known_facts"]
        survived = [f for f in facts if fact_survives(f, simplified)]
        missed = [f for f in facts if f not in survived]

        # Readability only meaningful for English text.
        if args.lang == "en":
            fkgl_before = textstat.flesch_kincaid_grade(original)
            fkgl_after = textstat.flesch_kincaid_grade(simplified)
            ease_after = textstat.flesch_reading_ease(simplified)
        else:
            fkgl_before = fkgl_after = ease_after = None

        rows.append({
            "id": cid,
            "specialty": c["specialty"],
            "facts_total": len(facts),
            "facts_survived": len(survived),
            "facts_missed": "; ".join(missed) if missed else "",
            "fkgl_before": fkgl_before,
            "fkgl_after": fkgl_after,
            "flesch_ease_after": ease_after,
            "guardrail_flags": len(flags),
            "known_traps": len(c["known_traps"]),
            "seconds": secs,
        })

        # Save the full text pair + traps for human trap-scoring.
        (OUT / f"{cid}_{args.lang}.txt").write_text(
            "ORIGINAL:\n" + original +
            "\n\nSIMPLIFIED:\n" + simplified +
            "\n\nGUARDRAIL FLAGS:\n" + json.dumps(flags, ensure_ascii=False, indent=2) +
            "\n\nKNOWN TRAPS TO CHECK BY HAND:\n- " + "\n- ".join(c["known_traps"]),
            encoding="utf-8",
        )
        print(f"   facts {len(survived)}/{len(facts)} kept | flags {len(flags)} | {secs}s\n")

    if not rows:
        print("No results — is the app running at localhost:3000?")
        sys.exit(1)

    df = pd.DataFrame(rows)
    csv_path = OUT / f"summary_{args.lang}.csv"
    df.to_csv(csv_path, index=False)

    print("=" * 64)
    print(df.to_string(index=False))
    print("=" * 64)
    if args.lang == "en":
        print(f"Mean grade level: {df.fkgl_before.mean():.1f} -> {df.fkgl_after.mean():.1f}")
    tf = df.facts_survived.sum()
    tt = df.facts_total.sum()
    print(f"Fact preservation: {tf}/{tt}  ({100*tf/tt:.0f}%)")
    print(f"Saved table -> {csv_path}")
    print(f"Per-case text + traps -> {OUT}/  (score the traps by hand)\n")


if __name__ == "__main__":
    main()
