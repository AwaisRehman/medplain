---
title: 'MedPlain: Local, bilingual plain-language simplification of clinical text with a faithfulness check'
tags:
  - clinical NLP
  - text simplification
  - health literacy
  - large language models
  - faithfulness
  - Arabic NLP
  - TypeScript
authors:
  - name: Awais Ur Rehman
    orcid: 0009-0005-1069-9219
    affiliation: 1
affiliations:
  - name: Independent Researcher, Jeddah, Saudi Arabia
    index: 1
date: 10 July 2026
bibliography: paper.bib
---

# Summary

Clinical documents — discharge summaries, laboratory reports, medication
leaflets, and prescriptions — are written for clinicians, not patients.
Limited health literacy is associated with poorer comprehension, adherence,
and outcomes [@berkman2011], and the barrier is compounded in multilingual
settings. Large language models (LLMs) can rewrite clinical text in plain
language, but their fluency masks a safety-critical weakness: they can
silently alter clinically material facts while producing text that reads as
confident and authoritative.

`MedPlain` is an open-source web application that simplifies clinical text
at a selectable reading level (Grade 6, Grade 8, or general adult), in
English and Arabic, entirely on the user's device via a local LLM served by
the Ollama runtime [@qwen2025]. Each simplification is paired with a
two-layer faithfulness check: a deterministic dose/number verifier that is
robust to Arabic-Indic numerals and Arabic number-words, and an LLM semantic
verifier that reports changed, added, or removed clinical facts. Printed
prescriptions can be ingested from PDF or image; an OCR confidence gate
refuses low-confidence reads (handwriting, poor scans) to close an
OCR-to-hallucination failure mode that downstream verification cannot
detect. Because inference and extraction run locally, clinical text never
leaves the device, making privacy an architectural property rather than a
policy promise.

The repository includes a documented gold-standard evaluation set of five
synthetic prescriptions across oncology, cardiology, and general practice
(41 known facts, 24 known meaning-level traps) and an automated evaluation
harness that reports readability [@kincaid1975; @flesch1948], fact
preservation, and guardrail behaviour.

# Statement of need

Research on medical text simplification has produced datasets and metrics
[@attal2023; @xu2016; @zhang2020], with a recurring caution that
model-generated simplifications may introduce factual errors. What is
missing is open, inspectable software that (a) instantiates simplification
together with faithfulness verification in a working pipeline, (b) supports
an under-resourced language (Arabic) alongside English, (c) runs fully
locally so that researchers can process sensitive text without transmitting
it to third-party APIs, and (d) ships with a reproducible evaluation
framework for studying where automated faithfulness checking fails.

`MedPlain` targets researchers and educators in clinical NLP, health
literacy, and human-AI interaction who need a concrete testbed for
faithfulness verification rather than a black-box service. Its evaluation
framework is designed around "known traps" — documented meaning-level
distortions such as dropped qualifiers ("palliative"), conditional
instructions, and controller-versus-rescue medication roles — enabling
systematic study of verifier behaviour. Using this framework, we found that
while readability improved from a mean Flesch–Kincaid grade of ~21.5 to
~7.4 and 95% of numeric facts were preserved, a lightweight LLM semantic
verifier detected almost none of the subtle meaning-level distortions, and
low-confidence OCR fed to an LLM produced fluent but fabricated clinical
content. These honestly reported negative results — described in the
accompanying preprint [@rehman2026medplain] — motivate the system's
conservative design (mandatory human review, refusal of unreliable input)
and delineate open problems the software makes accessible to the community.

`MedPlain` is a research and educational prototype, not a medical device:
it provides no advice, diagnosis, or interpretation. All evaluation data
are synthetic; no real patient data are distributed.

# Acknowledgements

MedPlain builds on the open-source Ollama runtime, the Qwen2.5 model
family, Tesseract.js, pdf.js, and Next.js.

# References
