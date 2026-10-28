#!/usr/bin/env python3
"""
export_csv.py -- exports the evaluation results as plain CSV files of numerical metrics.

usage (from repo root):
  python experiments/scripts/export_csv.py

Reads   experiments/results/runs.jsonl, experiments/results/ocr_confidence.csv,
        experiments/results/ocr_duplicates.txt, experiments/sheets/*.csv
Writes  experiments/results/csv/
  runs_metrics.csv          one row per run (216 rows): facts, flags per layer, readability, latency, memory
  summary_by_condition.csv  mean/SD per model x language x reading level over the 3 runs
  table2_models.csv         Table 2: Arabic name accuracy, facts kept, latency, memory per model
  table3_detection.csv      Table 3: TP, FP, precision, recall per checking layer
  table4_ocr.csv            Table 4: OCR acceptance per input type at tau = 0.60
  ocr_threshold_sweep.csv   acceptance of printed vs. refusal of handwritten images per threshold
  ocr_per_image.csv         OCR confidence per image (numbers only; no images are released)
"""
import csv
import json
import statistics as st
from collections import defaultdict
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent
RES, SHEETS = KIT / "results", KIT / "sheets"
OUT = RES / "csv"


def write(name, header, rows):
    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / name).open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)
    print(f"  {name:28s} {len(rows)} rows")


def r3(x):
    return None if x is None else round(x, 3)


def mean_sd(xs):
    xs = [x for x in xs if x is not None]
    if not xs:
        return None, None
    return r3(st.mean(xs)), r3(st.stdev(xs)) if len(xs) > 1 else 0.0


def read_csv(p):
    if not p.exists():
        return []
    with p.open(encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def col(row, prefix):
    for k, v in row.items():
        if k and k.strip().lower().startswith(prefix):
            return (v or "").strip().lower()
    return ""


def main():
    runs = [json.loads(l) for l in (RES / "runs.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    runs = [r for r in runs if "error" not in r]
    print(f"Writing CSV files to {OUT}")

    # 1. one row per run
    hdr = ["model", "case", "language", "reading_level", "run", "facts_kept", "facts_total", "facts_kept_pct",
           "flags_L0_script", "flags_L1_numeric", "flags_L2_semantic", "flags_total",
           "fkgl_source", "fkgl_output", "fre_output", "latency_simplify_s", "latency_total_s",
           "memory_vram_gb", "memory_total_gb"]
    rows = []
    for r in runs:
        en = r["lang"] == "en"
        rows.append([r["model"], r["case"], r["lang"], r["level"], r["run"], r["facts_kept"], r["facts_total"],
                     r3(100 * r["facts_kept"] / r["facts_total"]) if r["facts_total"] else None,
                     r["flags_L0"], r["flags_L1"], r["flags_L2"], r["flags_L0"] + r["flags_L1"] + r["flags_L2"],
                     r3(r["fkgl_src"]) if en else None, r3(r["fkgl_out"]) if en else None, r3(r["fre_out"]) if en else None,
                     r3(r["sec_simplify"]), r3(r["sec_total"]), r3(r["mem_vram_gb"]), r3(r["mem_total_gb"])])
    write("runs_metrics.csv", hdr, rows)

    # 2. summary per condition
    g = defaultdict(list)
    for r in runs:
        g[(r["model"], r["lang"], r["level"])].append(r)
    rows = []
    for (m, lang, lv), rs in sorted(g.items()):
        kept, tot = sum(r["facts_kept"] for r in rs), sum(r["facts_total"] for r in rs)
        per_run = defaultdict(lambda: [0, 0])
        for r in rs:
            per_run[r["run"]][0] += r["facts_kept"]; per_run[r["run"]][1] += r["facts_total"]
        pm, psd = mean_sd([100 * k / t for k, t in per_run.values() if t])
        fk = mean_sd([r["fkgl_out"] for r in rs]) if lang == "en" else (None, None)
        lat = mean_sd([r["sec_total"] for r in rs])
        rows.append([m, lang, lv, len(rs), kept, tot, r3(100 * kept / tot), pm, psd, *fk, *lat,
                     sum(r["flags_L0"] for r in rs), sum(r["flags_L1"] for r in rs), sum(r["flags_L2"] for r in rs),
                     sum(r["flags_L0"] > 0 for r in rs)])
    write("summary_by_condition.csv",
          ["model", "language", "reading_level", "n_runs", "facts_kept", "facts_total", "facts_kept_pct_pooled",
           "facts_kept_pct_mean_over_runs", "facts_kept_pct_sd_over_runs", "fkgl_output_mean", "fkgl_output_sd",
           "latency_total_s_mean", "latency_total_s_sd", "flags_L0_sum", "flags_L1_sum", "flags_L2_sum",
           "outputs_with_L0_flag"], rows)

    # 3. Table 2
    drugs = read_csv(SHEETS / "drug_names.csv")
    rows = []
    for m in sorted({r["model"] for r in runs}):
        g8 = [r for r in runs if r["model"] == m and r["level"] == "grade8"]
        en = [r for r in g8 if r["lang"] == "en"]; ar = [r for r in g8 if r["lang"] == "ar"]
        judged = [d for d in drugs if d["model"] == m and col(d, "judgement")]
        correct = sum(col(d, "judgement") == "correct" for d in judged)
        lat = mean_sd([r["sec_total"] for r in g8])
        rows.append([m, correct, len(judged), r3(100 * correct / len(judged)) if judged else None,
                     r3(100 * sum(r["facts_kept"] for r in en) / sum(r["facts_total"] for r in en)),
                     r3(100 * sum(r["facts_kept"] for r in ar) / sum(r["facts_total"] for r in ar)), *lat,
                     r3(max(r["mem_vram_gb"] or 0 for r in g8)), r3(max(r["mem_total_gb"] or 0 for r in g8))])
    write("table2_models.csv", ["model", "arabic_names_correct", "arabic_names_judged", "arabic_name_accuracy_pct",
                                "facts_kept_en_pct", "facts_kept_ar_pct", "latency_s_mean", "latency_s_sd",
                                "memory_vram_gb", "memory_total_gb"], rows)

    # 4. Table 3
    errs, flags = read_csv(SHEETS / "error_audit.csv"), read_csv(SHEETS / "flag_audit.csv")
    E = {e["error_id"].lower() for e in errs if col(e, "occurred") == "yes"}
    rows = []
    for name, layers in (("numerical_only", {"L1"}), ("semantic_only", {"L2"}), ("combined_L1_L2", {"L1", "L2"}),
                         ("script_check_L0", {"L0"}), ("all_layers", {"L0", "L1", "L2"})):
        fl = [f for f in flags if f["layer"] in layers and col(f, "real_error") in ("yes", "no")]
        tp = sum(col(f, "real_error") == "yes" for f in fl); fp = len(fl) - tp
        det = {col(f, "error_id") for f in fl if col(f, "real_error") == "yes"} & E
        rows.append([name, tp, fp, r3(tp / (tp + fp)) if tp + fp else None, len(det), len(E),
                     r3(len(det) / len(E)) if E else None])
    write("table3_detection.csv", ["checker", "true_positives", "false_positives", "precision",
                                   "errors_detected", "confirmed_errors", "recall"], rows)

    # 5. OCR
    dups = set((RES / "ocr_duplicates.txt").read_text(encoding="utf-8").split()) if (RES / "ocr_duplicates.txt").exists() else set()
    ocr = read_csv(RES / "ocr_confidence.csv")
    for o in ocr:
        o["_dup"] = o["group"] == "handwritten" and o["file"] in dups
    write("ocr_per_image.csv", ["group", "image_id", "mean_word_confidence_0_100", "duplicate_excluded"],
          [[o["group"], o["file"], o["confidence"], int(o["_dup"])] for o in ocr])
    keep = [o for o in ocr if not o["_dup"]]
    labels = {"printed": "clean_print", "printed_scan": "degraded_print", "handwritten": "handwriting"}
    rows = []
    for grp in ("printed", "printed_scan", "handwritten"):
        xs = [float(o["confidence"]) for o in keep if o["group"] == grp]
        acc = sum(x >= 60 for x in xs)
        should_accept = grp != "handwritten"
        rows.append([labels[grp], len(xs), acc, 0 if should_accept else acc, len(xs) - acc if should_accept else 0])
    write("table4_ocr.csv", ["input_type", "documents", "accepted", "wrongly_accepted", "wrongly_refused"], rows)
    pr = [float(o["confidence"]) for o in keep if o["group"] != "handwritten"]
    hw = [float(o["confidence"]) for o in keep if o["group"] == "handwritten"]
    rows = [[t / 100, sum(x >= t for x in pr), len(pr), r3(100 * sum(x < t for x in hw) / len(hw)), len(hw)]
            for t in range(30, 95, 5)]
    write("ocr_threshold_sweep.csv", ["tau", "printed_accepted", "printed_total", "handwriting_refused_pct",
                                      "handwriting_total"], rows)


if __name__ == "__main__":
    main()
