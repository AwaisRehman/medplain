#!/usr/bin/env python3
"""
run_experiments.py  --  runs every condition of the paper's evaluation through the MedPlain app.

Runs every (case x language x reading level x repeat) through the RUNNING MedPlain app,
exactly as a user would, and records for each run:
  - the simplified output and all guardrail flags (split by layer: L0 script, L1 numeric, L2 semantic)
  - fact preservation (same strict matcher as eval/run_eval.py)
  - English readability (FKGL, FRE)
  - end-to-end latency (simplify + verify), in seconds
  - GPU/total memory of the loaded model, read from Ollama's /api/ps

The app reads its model from MODEL in .env.local, so run this script ONCE PER MODEL:
    1. set MODEL=qwen2.5:14b in .env.local, restart `npm run dev`, then:
       python run_experiments.py --model qwen2.5:14b
    2. set MODEL=qwen2.5:3b, restart `npm run dev`, then:
       python run_experiments.py --model qwen2.5:3b
The script checks that the model Ollama actually loaded matches --model and stops if not.

Results are APPENDED to results/runs.jsonl, so an interrupted run can be resumed (--resume).
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

import requests
import textstat

HERE = Path(__file__).resolve().parent
KIT = HERE.parent
DEFAULT_DATASET = KIT.parent / "eval" / "dataset.json"   # when the kit sits inside the repo


# ---- identical to eval/run_eval.py (do not change: keeps results comparable) ----
def normalize(s: str) -> str:
    trans = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
    return s.translate(trans).lower()


def fact_survives(fact: str, output: str) -> bool:
    out = normalize(output)
    f = normalize(fact)
    nums = re.findall(r"\d+(?:\.\d+)?", f)
    if nums:
        return all(re.search(rf"(?<![\d.]){re.escape(n)}(?![\d.])", out) for n in nums)
    words = re.sub(r"[^a-z ]", " ", f).split()
    if not words:
        return False
    return all(re.search(rf"\b{re.escape(w)}\b", out) for w in words)


def is_numeric_fact(fact: str) -> bool:
    return bool(re.search(r"\d", fact))
# -------------------------------------------------------------------------------

LAYER = {"script": "L0", "number": "L1", "changed": "L2", "added": "L2", "removed": "L2"}


def ollama_loaded(ollama_url: str):
    """Return (model_name, size_gb, size_vram_gb) of the loaded model, or (None, None, None)."""
    try:
        r = requests.get(f"{ollama_url}/api/ps", timeout=10)
        r.raise_for_status()
        models = r.json().get("models", [])
        if not models:
            return None, None, None
        m = models[0]
        gb = 1024 ** 3
        return m.get("name") or m.get("model"), round(m.get("size", 0) / gb, 2), round(m.get("size_vram", 0) / gb, 2)
    except Exception:
        return None, None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, help="model the app is serving, e.g. qwen2.5:14b")
    ap.add_argument("--dataset", default=str(DEFAULT_DATASET))
    ap.add_argument("--app", default="http://localhost:3000")
    ap.add_argument("--ollama", default="http://localhost:11434")
    ap.add_argument("--langs", default="en,ar")
    ap.add_argument("--levels", default="grade6,grade8,adult")
    ap.add_argument("--runs", type=int, default=3, help="repeats per condition (paper: 3)")
    ap.add_argument("--out", default=str(KIT / "results" / "runs.jsonl"))
    ap.add_argument("--resume", action="store_true", help="skip conditions already in the output file")
    args = ap.parse_args()

    cases = json.loads(Path(args.dataset).read_text(encoding="utf-8"))["cases"]
    langs = args.langs.split(","); levels = args.levels.split(",")
    out = Path(args.out); out.parent.mkdir(parents=True, exist_ok=True)

    done = set()
    if args.resume and out.exists():
        for line in out.read_text(encoding="utf-8").splitlines():
            r = json.loads(line)
            done.add((r["model"], r["case"], r["lang"], r["level"], r["run"]))

    total = len(cases) * len(langs) * len(levels) * args.runs
    print(f"\n{total} runs planned | model={args.model} | cases={len(cases)} | langs={langs} | levels={levels} | runs={args.runs}\n")
    checked_model = False
    n = 0
    for run in range(1, args.runs + 1):
        for lang in langs:
            for level in levels:
                for c in cases:
                    n += 1
                    key = (args.model, c["id"], lang, level, run)
                    if key in done:
                        continue
                    t0 = time.time()
                    try:
                        r = requests.post(f"{args.app}/api/simplify",
                                          json={"text": c["original"], "level": level, "language": lang}, timeout=600)
                        r.raise_for_status(); d = r.json()
                        if not d.get("ok"):
                            raise RuntimeError(d.get("error"))
                        t1 = time.time()
                        v = requests.post(f"{args.app}/api/verify",
                                          json={"original": d["original"], "simplified": d["simplified"]}, timeout=600)
                        v.raise_for_status(); flags = v.json().get("flags", [])
                    except Exception as e:
                        print(f"  [{n}/{total}] {c['id']} {lang} {level} run{run}: ERROR {e}")
                        rec = {"model": args.model, "case": c["id"], "lang": lang, "level": level, "run": run,
                               "error": str(e)}
                        with out.open("a", encoding="utf-8") as fh:
                            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                        continue
                    t2 = time.time()

                    loaded, size_gb, vram_gb = ollama_loaded(args.ollama)
                    if not checked_model:
                        if loaded and not loaded.startswith(args.model):
                            sys.exit(f"\nSTOP: Ollama has '{loaded}' loaded, not '{args.model}'. "
                                     f"Set MODEL={args.model} in .env.local and restart `npm run dev`.")
                        checked_model = True

                    simplified = d["simplified"]
                    facts = c["known_facts"] if lang == "en" else [f for f in c["known_facts"] if is_numeric_fact(f)]
                    kept = [f for f in facts if fact_survives(f, simplified)]
                    rec = {
                        "model": args.model, "case": c["id"], "lang": lang, "level": level, "run": run,
                        "simplified": simplified,
                        "flags": flags,
                        "flags_L0": sum(LAYER.get(f.get("type"), "L2") == "L0" for f in flags),
                        "flags_L1": sum(LAYER.get(f.get("type"), "L2") == "L1" for f in flags),
                        "flags_L2": sum(LAYER.get(f.get("type"), "L2") == "L2" for f in flags),
                        "facts_total": len(facts), "facts_kept": len(kept),
                        "facts_missed": [f for f in facts if f not in kept],
                        "fkgl_src": textstat.flesch_kincaid_grade(c["original"]) if lang == "en" else None,
                        "fkgl_out": textstat.flesch_kincaid_grade(simplified) if lang == "en" else None,
                        "fre_out": textstat.flesch_reading_ease(simplified) if lang == "en" else None,
                        "sec_simplify": round(t1 - t0, 2), "sec_total": round(t2 - t0, 2),
                        "ollama_model": loaded, "mem_total_gb": size_gb, "mem_vram_gb": vram_gb,
                        "known_traps": c["known_traps"],
                    }
                    with out.open("a", encoding="utf-8") as fh:
                        fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                    print(f"  [{n}/{total}] {c['id']:22s} {lang} {level:6s} run{run}: "
                          f"facts {len(kept)}/{len(facts)} | flags L0/L1/L2 {rec['flags_L0']}/{rec['flags_L1']}/{rec['flags_L2']} "
                          f"| {rec['sec_total']}s | vram {vram_gb} GB")
    print(f"\nDone. Raw results -> {out}\nNext: python experiments/scripts/make_annotation_sheets.py\n")


if __name__ == "__main__":
    main()
