# Experiments: reproducing the paper's results

This folder contains everything behind the evaluation in the MedPlain paper: the scripts that
run the app, the raw outputs of all 216 runs, the human annotation sheets, the OCR study, and the
figures. Every number in the paper's Tables 1–5 can be regenerated from these files with one
command (Step 5).

```
experiments/
  scripts/
    run_experiments.py        runs every condition through the running MedPlain app
    make_annotation_sheets.py turns the runs into CSV sheets for human annotation
    agreement.py              Cohen's kappa between two annotators
    make_printed.py           renders the test documents as clean and scan-like images
    ocr_conf.js               OCR confidence with MedPlain's own Tesseract.js configuration
    find_duplicates.py        finds near-duplicate images (average hash)
    score_results.py          computes all table values and writes LaTeX rows
    export_csv.py             exports all results as plain CSV files of numerical metrics
  results/
    runs.jsonl                216 runs: outputs, flags per layer, facts, readability, latency, memory
    ocr_confidence.csv        OCR mean word confidence per image (printed and handwritten)
    ocr_duplicates.txt        near-duplicate handwritten images excluded from Table 4
    paper_tables.tex          generated table rows (output of score_results.py)
    csv/                      all metrics as CSV (one row per run, per-condition summaries, Tables 2-4, OCR)
  sheets/
    drug_names.csv            Arabic drug-name judgments (Table 2)
    error_audit.csv           confirmed errors per output (Table 3, recall)
    flag_audit.csv            true/false-positive judgment per flag (Table 3, precision)
    outputs_to_read.txt       the audited outputs with their flags, for reading
  figures/
    fkgl_before_after.pdf     Figure: English reading grade, source vs. output
    detection_by_layer.pdf    Figure: confirmed errors vs. errors detected per layer
```

## Setup used in the paper

| Item | Value |
|---|---|
| Hardware | Intel Core i9-12900H, NVIDIA GeForce RTX 3080 Laptop GPU (16 GB), 32 GB RAM |
| Software | Windows 11, Node.js 22.18, Python 3.13, Ollama 0.5.11, Next.js 16, Tesseract.js 7 |
| Models | `qwen2.5:14b` (reference) and `qwen2.5:3b`, temperature 0.2 |
| Design | 6 documents × 2 languages × 3 reading levels × 3 runs × 2 models = 216 runs |
| Test set | `eval/dataset.json`: 5 synthetic prescriptions + 1 MTSamples operative note; 49 facts, 32 traps |

## Reproduce

All commands run from the repository root. On Windows Git Bash, run `export PYTHONUTF8=1` first.

**1. Install**

```bash
npm install
pip install -r eval/requirements.txt pillow
ollama pull qwen2.5:14b
ollama pull qwen2.5:3b
```

**2. Run the app and the experiments (once per model)**

```bash
# terminal 1
echo "MODEL=qwen2.5:14b" > .env.local
npm run dev

# terminal 2
python experiments/scripts/run_experiments.py --model qwen2.5:14b --out experiments/results/runs_new.jsonl
```

Then set `MODEL=qwen2.5:3b`, restart `npm run dev`, and repeat with `--model qwen2.5:3b`.
Add `--resume` to continue an interrupted run. Writing to a new file keeps the released
`runs.jsonl` intact.

**3. OCR study (Table 4)**

```bash
python experiments/scripts/make_printed.py eval/dataset.json experiments/results/printed
node experiments/scripts/ocr_conf.js tessdata experiments/results/ocr_new.csv printed experiments/results/printed/clean
node experiments/scripts/ocr_conf.js tessdata experiments/results/ocr_new.csv printed_scan experiments/results/printed/scan
node experiments/scripts/ocr_conf.js tessdata experiments/results/ocr_new.csv handwritten /path/to/handwritten_images
python experiments/scripts/find_duplicates.py /path/to/handwritten_images experiments/results/ocr_dups_new.txt
```

The handwritten prescription images are publicly available specimen, educational and historical
examples collected from third-party sources; they are **not redistributed** here. Only their
aggregate OCR confidences are released in `results/ocr_confidence.csv`.

**4. Annotation (Tables 2 and 3)**

```bash
python experiments/scripts/make_annotation_sheets.py --runs experiments/results/runs_new.jsonl --models qwen2.5:14b --outdir experiments/sheets_new
```

Annotation rules used in the paper:

- **Drug names:** `correct` = a standard Arabic spelling, or the original Latin name kept unchanged
  (the prompt asks to keep drug names); otherwise `misspelled`, `wrong`, `missing` or `wrong_script`.
- **Errors:** an error is a clinically relevant omission, change or addition relative to the source.
  A meaning-preserving paraphrase (e.g. "12 months" → "1 year") is not an error. Each documented trap
  is marked as occurred or not; other errors are added as extra rows.
- **Flags:** each flag is a true positive if it points to a confirmed error. Recall counts each
  confirmed error once.

With a second annotator: `python experiments/scripts/agreement.py sheetsA/error_audit.csv sheetsB/error_audit.csv`.

**5. Compute all table values**

```bash
python experiments/scripts/score_results.py
```

Prints every value of Tables 2–5 and writes LaTeX rows to `results/paper_tables.tex`.
Use `--runs`, `--sheets`, `--ocr` and `--ocr-dups` to score a new run instead of the released one.

**6. Export the metrics as CSV**

```bash
python experiments/scripts/export_csv.py
```

Writes `results/csv/`: `runs_metrics.csv` (one row per run, 216 rows), `summary_by_condition.csv`,
`table2_models.csv`, `table3_detection.csv`, `table4_ocr.csv`, `ocr_threshold_sweep.csv` and
`ocr_per_image.csv`. These files contain numerical metrics only; no images are released.

## Main results (from the released files)

| Measure | Qwen2.5 3B | Qwen2.5 14B |
|---|---|---|
| English facts kept (Grade 8) | 53.1% | 79.6% |
| Arabic facts kept (digit-bearing, Grade 8) | 69.2% | 75.0% |
| Arabic drug names correct | 2/12 | 6/12 |
| Arabic outputs containing Chinese/Korean text (all levels) | 42/54 | 19/54 |
| Latency, simplify + verify (s) | 3.1 ± 1.9 | 8.7 ± 4.5 |
| Model memory (GB) | 2.9 | 10.8 |

| Checker (14B, 26 confirmed errors) | TP | FP | Precision | Recall |
|---|---|---|---|---|
| Numerical only | 4 | 2 | 0.67 | 0.12 |
| Semantic only | 2 | 0 | 1.00 | 0.08 |
| Combined | 6 | 2 | 0.75 | 0.19 |
| Script check (Layer 0) | 4 | 0 | 1.00 | 0.15 |

OCR gate at τ = 0.60: all 12 printed controls accepted; 113 of 123 handwritten images refused (91.9%).
