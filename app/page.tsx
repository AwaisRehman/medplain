// app/page.tsx
"use client";

import { useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------ *
 * MedPlain — compare-and-verify workspace for plain-language medical
 * text. Upload a prescription (PDF/photo) or paste text, choose a
 * language and reading level, and get a plain-language version with a
 * built-in faithfulness check. Runs fully locally.
 * ------------------------------------------------------------------ */

const MODEL_LABEL = "qwen2.5:14b"; // cosmetic; change if you swap models

const LEVELS = [
  { key: "grade6", label: "Grade 6 — simplest" },
  { key: "grade8", label: "Grade 8" },
  { key: "adult", label: "General adult" },
];

const MAX_CHARS = 5000;

const EXAMPLE =
  "Patient presents with acute exacerbation of chronic obstructive pulmonary disease. " +
  "Prescribed prednisone 40mg daily for 5 days and albuterol inhaler 2 puffs every 4 hours as needed. " +
  "Advised to avoid tobacco smoke and return if dyspnea worsens.";

interface Flag {
  type: string;
  detail: string;
}

export default function Home() {
  const [text, setText] = useState("");
  const [level, setLevel] = useState("grade8");
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [result, setResult] = useState("");
  const [resultLang, setResultLang] = useState<"en" | "ar">("en");
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [blocked, setBlocked] = useState(false);

  // Document upload state
  const [extracting, setExtracting] = useState(false);
  const [docNote, setDocNote] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const charCount = text.length;
  const over = charCount > MAX_CHARS;
  const resultIsArabic = resultLang === "ar";

  const canSubmit = useMemo(
    () => text.trim().length > 0 && !over && !loading && !extracting,
    [text, over, loading, extracting]
  );


  async function handleFiles(files: FileList | null) {
    if (!files || !files[0]) return;
    const file = files[0];
    setError("");
    setDocNote("");
    setBlocked(false);
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("ocrLang", "eng+ara");
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Could not read the file.");
        return;
      }

      // Safety gate: if OCR was unreliable (handwriting/blur), do NOT let the
      // user simplify what was read — it will hallucinate. Block and warn.
      if (data.reliable === false) {
        setText("");
        setBlocked(true);
        setDocNote(
          (data.warning ||
            "This document could not be read reliably. Please type the text yourself.") +
            (typeof data.confidence === "number" ? ` (read confidence: ${data.confidence}%)` : "")
        );
        return;
      }

      setText(data.text);
      setResult("");
      setFlags([]);
      setChecked(false);
      setDocNote(
        data.method === "ocr"
          ? `Text read from an image by OCR (confidence ${data.confidence}%). Check it against your document before simplifying.`
          : "Text extracted from the PDF. Check it against your document before simplifying."
      );
    } catch {
      setError("Could not read the file. Try a clearer photo or a text-based PDF.");
    } finally {
      setExtracting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

 

  async function handleSimplify() {
    setError("");
    setResult("");
    setFlags([]);
    setChecked(false);
    setCopied(false);

    if (!text.trim()) {
      setError("Paste some medical text, or upload a document, to simplify.");
      return;
    }
    if (over) {
      setError(`Text is too long. Keep it under ${MAX_CHARS} characters.`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/simplify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, level, language }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "The model could not process this text. Try again.");
        return;
      }
      setResult(data.simplified);
      setResultLang(language);

      setVerifying(true);
      try {
        const vres = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ original: data.original, simplified: data.simplified }),
        });
        const vdata = await vres.json();
        if (vdata.ok) setFlags(vdata.flags);
      } catch {
        /* check is a safety aid; result still stands if it fails */
      } finally {
        setVerifying(false);
        setChecked(true);
      }
    } catch {
      setError("Can't reach the local server. Make sure the app and Ollama are running.");
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setText("");
    setResult("");
    setFlags([]);
    setChecked(false);
    setError("");
    setDocNote("");
    setBlocked(false);
    setCopied(false);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked; ignore */
    }
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="top">
        <div className="top-inner">
          <div className="brand">
            <div className="mark" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M2 5.5 L5 4 L8 6.5 L11 4.5 L14 6 L18 5" stroke="#0B5D50" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 14.5 H18" stroke="#0E7C6B" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M2 10 H14" stroke="#0E7C6B" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
              </svg>
            </div>
            <div className="brand-text">
              <span className="brand-name">Med<b>Plain</b></span>
              <span className="brand-sub">Clinical text, in plain language</span>
            </div>
          </div>
          <div className="top-meta">
            <span className="pill"><span className="dot" />On-device · Private</span>
            <span className="pill model">{MODEL_LABEL}</span>
          </div>
        </div>
      </header>

      {/* Workspace */}
      <main className="workspace">
        {/* Input panel */}
        <section className="panel" aria-label="Original text">
          <div className="panel-head">
            <span className="panel-title">Original</span>
            <span className={"count" + (over ? " over" : "")}>
              {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </span>
          </div>
          <div className="panel-body">
            {/* Upload zone */}
            <div
              className={"drop" + (dragOver ? " drag" : "")}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            >
              <div className="up-ic" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M12 16V4m0 0L7 9m5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="up-main">
                <div className="up-title">Upload a prescription</div>
                <div className="up-sub">Drag a PDF or photo here, or browse. Read on your device.</div>
              </div>
              <button
                className="btn btn-ghost sm"
                onClick={() => fileRef.current?.click()}
                disabled={extracting}
              >
                {extracting ? <><span className="spinner dark" aria-hidden="true" />Reading…</> : "Browse"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/*"
                hidden
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

          {docNote && (
              <div className={"extract-note" + (blocked ? " blocked" : "")} role="status">
                {docNote}
              </div>
            )}

            <label className="field-label" htmlFor="src">
              Or paste a discharge note, lab result, or medication leaflet
            </label>
            <textarea
              id="src"
              className="input"
              value={text}
              onChange={(e) => { setText(e.target.value); if (blocked) setBlocked(false); }}
              placeholder="e.g. Patient presents with acute exacerbation of chronic obstructive pulmonary disease…"
            />

            <div className="controls">
              <div className="control">
                <span>Output language</span>
                <div className="seg" role="group" aria-label="Output language">
                  <button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")} aria-pressed={language === "en"}>English</button>
                  <button className={language === "ar" ? "active" : ""} onClick={() => setLanguage("ar")} aria-pressed={language === "ar"}><span className="ar">العربية</span></button>
                </div>
              </div>

              <div className="control">
                <span>Reading level</span>
                <select className="select" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Reading level">
                  {LEVELS.map((l) => (<option key={l.key} value={l.key}>{l.label}</option>))}
                </select>
              </div>

              <button className="linklike" onClick={() => setText(EXAMPLE)}>Load example</button>
            </div>

            <div className="actions">
              <button className="btn btn-primary" onClick={handleSimplify} disabled={!canSubmit}>
                {loading ? <><span className="spinner" aria-hidden="true" />Simplifying…</> : "Simplify"}
              </button>
              <button className="btn btn-ghost" onClick={handleClear} disabled={loading}>Clear</button>
            </div>

            {error && <div className="notice" role="alert">{error}</div>}
          </div>
        </section>

        {/* Output panel */}
        <section className="panel" aria-label="Plain-language result">
          <div className="panel-head">
            <span className="panel-title">Plain-language result</span>
            {result && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="tag-lang">{resultIsArabic ? "العربية · RTL" : "English"}</span>
                <button className="icon-btn" onClick={handleCopy}>{copied ? "Copied" : "Copy"}</button>
              </div>
            )}
          </div>
          <div className="panel-body">
            {result ? (
              <div className={"result-body" + (resultIsArabic ? " is-arabic" : "")} dir={resultIsArabic ? "rtl" : "ltr"} aria-live="polite">
                {result}
              </div>
            ) : (
              <div className="empty">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M4 6h16M4 12h10M4 18h13" strokeLinecap="round" />
                </svg>
                <p>The simplified version appears here, with a faithfulness check underneath.</p>
              </div>
            )}

            {(verifying || checked) && result && (
              <div className="integrity">
                <div className="integrity-head">
                  <svg className="shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinejoin="round" />
                  </svg>
                  <span className="lbl">Faithfulness check</span>
                </div>
                <div className="integrity-body">
                  {verifying ? (
                    <>
                      <div className="scan" aria-hidden="true" />
                      <div className="scan-label">Comparing against the original for changed, added, or missing facts…</div>
                    </>
                  ) : flags.length === 0 ? (
                    <div className="verified" aria-live="polite">
                      <span className="check-wrap">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                          <path className="check-path" d="M5 12.5l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <div>
                        <div className="v-title">No issues detected</div>
                        <div className="v-sub">Doses and facts appear preserved. Always review important text yourself.</div>
                      </div>
                    </div>
                  ) : (
                    <div aria-live="polite">
                      <div className="flags">
                        {flags.map((f, i) => (
                          <div className="flag" key={i}>
                            <span className="chip">{f.type}</span>
                            <span className="flag-text">{f.detail}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flags-note">
                        These are prompts for review, not verdicts. Check each against the original before trusting the result.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="foot">
        <div className="foot-inner">
          <p className="disc">
            Research prototype. MedPlain simplifies language only — it does not give medical advice, diagnose, or interpret results. Always consult a healthcare professional.
          </p>
          <p>Runs locally via Ollama · Documents never leave your device</p>
        </div>
      </footer>
    </div>
  );
}
