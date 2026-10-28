#!/usr/bin/env python3
"""
make_annotation_sheets.py  --  turns results/runs.jsonl into three CSV sheets for human annotation.

Precision/recall (Table 3) and Arabic drug-name accuracy (Table 2) need human judgement; no script
can decide them honestly. Open the sheets in Excel/LibreOffice/Google Sheets, fill the empty
columns, save as CSV (UTF-8), then run score_results.py.

  sheets/drug_names.csv   one row per drug per Arabic output    -> fill: judgement
  sheets/error_audit.csv  one row per known trap per output     -> fill: occurred, output_span
                          (+ add your own rows for errors that are not in the trap list)
  sheets/flag_audit.csv   one row per guardrail flag            -> fill: real_error, error_id

Default scope: reading level grade8, run 1, both languages, every model in runs.jsonl.
"""
import argparse
import csv
import json
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent

# Drug names that appear in each source document (taken from eval/dataset.json texts).
DRUGS = {
    "onco-nsclc-01": ["osimertinib"],
    "onco-headneck-02": ["cisplatin", "carboplatin"],
    "cardio-mi-03": ["aspirin", "ticagrelor", "atorvastatin", "metoprolol succinate", "lisinopril"],
    "gp-diabetes-htn-04": ["metformin", "amlodipine"],
    "gp-peds-asthma-05": ["fluticasone propionate", "albuterol"],
    "mts-adrenalectomy-06": [],
}
LAYER = {"script": "L0", "number": "L1", "changed": "L2", "added": "L2", "removed": "L2"}


def oid(r):
    return f"{r['model']}|{r['case']}|{r['lang']}|{r['level']}|run{r['run']}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", default=str(KIT / "results" / "runs.jsonl"))
    ap.add_argument("--level", default="grade8")
    ap.add_argument("--run", type=int, default=1)
    ap.add_argument("--outdir", default=str(KIT / "sheets"))
    ap.add_argument("--models", default="", help="comma-separated models to include (default: all), e.g. qwen2.5:14b")
    args = ap.parse_args()

    rows = [json.loads(l) for l in Path(args.runs).read_text(encoding="utf-8").splitlines() if l.strip()]
    rows = [r for r in rows if "error" not in r and r["level"] == args.level and r["run"] == args.run]
    if args.models:
        keep = set(args.models.split(","))
        rows = [r for r in rows if r["model"] in keep]
    if not rows:
        raise SystemExit("No matching runs found. Did run_experiments.py finish?")
    out = Path(args.outdir); out.mkdir(parents=True, exist_ok=True)

    # outputs file so annotators can read every text in one place
    with (out / "outputs_to_read.txt").open("w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(f"===== {oid(r)} =====\n{r['simplified']}\n\nFLAGS:\n")
            for i, f in enumerate(r["flags"], 1):
                fh.write(f"  F{i} [{LAYER.get(f.get('type'),'L2')}/{f.get('type')}] {f.get('detail')}\n")
            fh.write("\n")

    with (out / "drug_names.csv").open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["output_id", "model", "case", "drug_en", "judgement (correct / misspelled / wrong / missing / wrong_script)", "note"])
        for r in rows:
            if r["lang"] != "ar":
                continue
            for d in DRUGS.get(r["case"], []):
                w.writerow([oid(r), r["model"], r["case"], d, "", ""])

    with (out / "error_audit.csv").open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["error_id", "output_id", "source", "description (trap text or your own)",
                    "occurred (yes/no)", "output_span (copy the wrong words)", "type (omission/distortion/addition/terminology/script)"])
        for r in rows:
            for j, t in enumerate(r["known_traps"], 1):
                w.writerow([f"{oid(r)}|T{j}", oid(r), "trap", t, "", "", ""])
            for k in range(1, 4):   # spare rows for errors that are not in the trap list
                w.writerow([f"{oid(r)}|X{k}", oid(r), "other", "", "", "", ""])

    with (out / "flag_audit.csv").open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["flag_id", "output_id", "layer", "type", "detail",
                    "real_error (yes/no)", "error_id (from error_audit.csv, if real)"])
        for r in rows:
            for i, f in enumerate(r["flags"], 1):
                w.writerow([f"{oid(r)}|F{i}", oid(r), LAYER.get(f.get("type"), "L2"), f.get("type"), f.get("detail"), "", ""])

    print(f"Sheets written to {out}:")
    for n in ("outputs_to_read.txt", "drug_names.csv", "error_audit.csv", "flag_audit.csv"):
        print("  -", n)
    print("\nFill the empty columns, save as CSV (UTF-8), then run: python experiments/scripts/score_results.py\n")


if __name__ == "__main__":
    main()
