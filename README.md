# MedPlain

Simplify clinical text into plain language — locally, privately, in English and Arabic — with a built-in faithfulness check.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Runs locally](https://img.shields.io/badge/Runs-locally-success)](https://ollama.com/)
[![Paper DOI](https://img.shields.io/badge/Paper%20DOI-10.5281%2Fzenodo.21194927-blue)](https://doi.org/10.5281/zenodo.21194927)
[![Code DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21188314.svg)](https://doi.org/10.5281/zenodo.21188314)

## 📌 Research Paper

This project accompanies the research paper:

> **"MedPlain: Local, Bilingual Plain-Language Simplification of Clinical Text with a Faithfulness Check"**
> Awais Ur Rehman · Preprint · July 2026

📄 **Read the paper:** [https://doi.org/10.5281/zenodo.21194927](https://doi.org/10.5281/zenodo.21194927)
💾 **Archived code release:** [https://doi.org/10.5281/zenodo.21188314](https://doi.org/10.5281/zenodo.21188314)

If you use MedPlain in academic work, please cite the paper:

```bibtex
@misc{rehman2026medplain,
  author    = {Rehman, Awais Ur},
  title     = {MedPlain: Local, Bilingual Plain-Language Simplification of
               Clinical Text with a Faithfulness Check},
  year      = {2026},
  month     = {7},
  publisher = {Zenodo},
  doi       = {10.5281/zenodo.21194927},
  url       = {https://doi.org/10.5281/zenodo.21194927},
  note      = {Preprint}
}
```

To cite the software itself, see [`CITATION.cff`](CITATION.cff) or use GitHub's "Cite this repository" button.

## What it does

Patients often can't understand their own discharge notes, lab results, or medication leaflets — a health-literacy gap linked to worse outcomes. MedPlain rewrites clinical text at a chosen reading level, in English or Arabic, and runs a faithfulness check that flags changed, added, or missing facts.

Everything runs on your own machine through a local model (via Ollama). No API keys, no cloud, no cost — clinical text never leaves the device.

> ⚠️ **Research prototype.** MedPlain simplifies language only. It does not give medical advice, diagnose, or interpret results, and is not a medical device. Always consult a healthcare professional.

## Key features

- **Plain-language simplification** at Grade 6 / Grade 8 / general-adult reading levels.
- **Bilingual output** — English (LTR) and Arabic (RTL), with a matched IBM Plex type system.
- **Faithfulness guardrail** — a two-layer check (a deterministic dose/number check plus an LLM semantic check) that surfaces meaning-level errors for human review.
- **Document upload** — read printed prescriptions from PDF (text layer) or image (OCR).
- **OCR safety gate** — low-confidence reads (handwriting, blur) are refused, not simplified, to prevent OCR→hallucination.
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

- Node.js 20 or 22
- [Ollama](https://ollama.com/) running locally
- A local model — recommended: `qwen2.5:14b` (strong English and Arabic). Smaller machines can use `qwen2.5:3b`.

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

```env
OLLAMA_URL=http://localhost:11434
MODEL=qwen2.5:14b
```

## Evaluation

A small gold-standard set across five specialties (oncology, cardiology, general practice) lives in `eval/`, with documented "known facts" and "known traps."

```bash
pip install -r eval/requirements.txt --break-system-packages
python eval/run_eval.py            # English
python eval/run_eval.py --lang ar  # Arabic
```

It reports readability (Flesch-Kincaid grade before/after), fact preservation, and guardrail behaviour, and writes a table to `eval/results/`.

### Findings (summary)

- Readability drops sharply (roughly grade ~21 → ~7 across the set).
- ~95% of numeric facts are preserved.
- The semantic checker misses most subtle meaning-level distortions — a deliberately reported limitation. Fluency and preserved numbers can create false confidence; robust semantic faithfulness for medical simplification remains open.
- On handwritten documents, OCR failure can combine with model hallucination to produce fluent but fabricated output. MedPlain mitigates this with the confidence gate, and treats handwriting as out of scope.

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

MIT © 2026 Awais Ur Rehman. Built with Next.js, Ollama, Tesseract.js, and pdf.js.

## 👤 Author

**Awais Ur Rehman**

- GitHub: [@AwaisRehman](https://github.com/AwaisRehman)
- ORCID: [0009-0005-1069-9219](https://orcid.org/0009-0005-1069-9219)
- Website: [awaisrehman.com](https://awaisrehman.com)
