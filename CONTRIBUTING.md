# Contributing to MedPlain

Thank you for your interest in contributing! MedPlain is a research
prototype for studying faithfulness in medical text simplification, and
contributions of all kinds are welcome.

## Reporting bugs

Open an issue at
[github.com/AwaisRehman/medplain/issues](https://github.com/AwaisRehman/medplain/issues)
and include:

- What you did, what you expected, and what happened instead
- Your environment (OS, Node.js version, Ollama version, model used)
- For simplification/verification problems: the input text (synthetic or
  de-identified only — **never post real patient data**), the output, and
  the guardrail flags

## Suggesting features

Open an issue describing the use case. Particularly welcome areas:

- Stronger faithfulness verifiers (the current LLM semantic check misses
  most subtle meaning-level distortions — see the paper)
- Additional languages beyond English and Arabic
- New gold-standard evaluation cases with documented known facts and traps
- Input-side hallucination detection

## Contributing code

1. Fork the repository and create a feature branch
2. Follow the existing code style (TypeScript, modules under `lib/`,
   API routes under `app/api/`)
3. If you change simplification or verification logic, run the evaluation
   harness (`python eval/run_eval.py`) and include before/after results in
   your pull request
4. Open a pull request describing what changed and why

## Contributing evaluation cases

New cases live in `eval/`. Each case must be **synthetic** (no real patient
data), clinically realistic, and documented with its known facts (values
that must survive simplification) and known traps (meaning-level errors the
case is designed to expose). See the existing five cases for the format.

## Scope and safety

MedPlain is a research and educational prototype, **not a medical device**.
Contributions that add clinical advice, diagnosis, or interpretation are
out of scope, as they would change the system's regulatory character.
Handwriting OCR is deliberately out of scope (see the paper's Section 6.5).

## Questions

Open an issue, or contact the maintainer: Awais Ur Rehman
([@AwaisRehman](https://github.com/AwaisRehman),
[ORCID 0009-0005-1069-9219](https://orcid.org/0009-0005-1069-9219)).
