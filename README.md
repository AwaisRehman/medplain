<div align="center">

<img src="docs/logo.svg" alt="MedPlain" width="360" />

**Simplify clinical text into plain language — locally, privately, in English and Arabic — with a built-in faithfulness check.**

[![License: MIT](https://img.shields.io/badge/License-MIT-0E7C6B.svg)](LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Runs locally](https://img.shields.io/badge/LLM-local%20via%20Ollama-0B5D50)

</div>

---

## What it does

Patients often can't understand their own discharge notes, lab results, or medication leaflets — a health-literacy gap linked to worse outcomes. **MedPlain** rewrites clinical text at a chosen reading level, in English or Arabic, and runs a **faithfulness check** that flags changed, added, or missing facts.

Everything runs **on your own machine** through a local model (via [Ollama](https://ollama.com)). No API keys, no cloud, no cost — clinical text never leaves the device.

> ⚠️ **Research prototype.** MedPlain simplifies language only. It does **not** give medical advice, diagnose, or interpret results, and is **not** a medical device. Always consult a healthcare professional.

## Key features

- **Plain-language simplification** at Grade 6 / Grade 8 / general-adult reading levels.
- **Bilingual output** — English (LTR) and Arabic (RTL), with a matched IBM Plex type system.
- **Faithfulness guardrail** — a two-layer check (a deterministic dose/number check plus an LLM semantic check) that surfaces meaning-level errors for human review.
- **Document upload** — read printed prescriptions from PDF (text layer) or image (OCR).
- **OCR safety gate** — low-confidence reads (handwriting, blur) are **refused**, not simplified, to prevent OCR→hallucination.
- **Fully local & private** — model inference and document reading happen on-device.

## How it works

```
          ┌────────────┐      ┌──────────────┐      ┌────────────────┐
Upload /  │  /extract  │ ---> │   /simplify  │ ---> │    /verify     │
paste ->  │ PDF or OCR │      │ local model  │      │ faithfulness   │ -> result + flags
          │ + conf gate│      │ (Ollama)     │      │ check          │
          └────────────┘      └──────────────┘      └────────────────┘
```

## Requirements

- **Node.js** 20 or 22
- **[Ollama](https://ollama.com)** running locally
- A local model — recommended: `qwen2.5:14b` (strong English **and** Arabic). Smaller machines can use `qwen2.5:3b`.

## Quick start

```bash
# 1. Pull a model (once)
ollama pull qwen2.5:14b

# 2. Install and configure
npm install
cp .env.example .env.local        # then edit if needed

# 3. Run
npm run dev
# open http://localhost:3000
```

`.env.local`:

```dotenv
OLLAMA_URL=http://localhost:11434
MODEL=qwen2.5:14b
```

## Evaluation

A small gold-standard set across five specialties (oncology, cardiology, general practice) lives in [`eval/`](eval/), with documented "known facts" and "known traps."

```bash
pip install -r eval/requirements.txt --break-system-packages
python eval/run_eval.py            # English
python eval/run_eval.py --lang ar  # Arabic
```

It reports readability (Flesch-Kincaid grade before/after), fact preservation, and guardrail behaviour, and writes a table to `eval/results/`.

### Findings (summary)

- Readability drops sharply (roughly grade ~21 → ~7 across the set).
- ~95% of numeric facts are preserved.
- **The semantic checker misses most subtle meaning-level distortions** — a deliberately reported limitation. Fluency and preserved numbers can create false confidence; robust semantic faithfulness for medical simplification remains open.
- On **handwritten** documents, OCR failure can combine with model hallucination to produce fluent but fabricated output. MedPlain mitigates this with the confidence gate, and treats handwriting as **out of scope**.

## Project structure

```
app/
  api/extract/route.ts   PDF text + image OCR + confidence gate
  api/simplify/route.ts  local-model simplification
  api/verify/route.ts    faithfulness check
  page.tsx               UI (compare-and-verify workspace)
lib/
  ollama.ts              local model client
  prompts.ts             simplification prompts (per level & language)
  verify.ts              two-layer faithfulness guardrail
eval/                    gold-standard dataset + runner
```

## Limitations

MedPlain is a prototype for research and education, not clinical use. It does not handle handwriting reliably, the faithfulness check is an aid (not a guarantee), and small local models vary in quality — especially for Arabic. See the paper/eval for details.

## License

[MIT](LICENSE) © 2026 Awais. Built with Next.js, Ollama, Tesseract.js, and pdf.js.

## Citation

If you use MedPlain, please cite it — see [`CITATION.cff`](CITATION.cff).
