// app/api/extract/route.ts
// Reads an uploaded prescription document and returns its text.
//  - PDF (with a text layer)  -> extracted directly via pdfjs
//  - Image (photo/scan)       -> OCR via tesseract.js (English + Arabic)
// Runs on the local Node server, so the document stays on the user's machine.
// (Only OCR language files are fetched from a CDN the first time — never the user's document.)

import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

// OCR confidence gate. Tesseract reports a mean word confidence (0-100).
// Below this threshold (typical of handwriting or poor scans) the read is
// refused, because low-confidence OCR fed to an LLM yields fluent but
// fabricated clinical text that the downstream guardrail cannot detect.
const OCR_CONFIDENCE_THRESHOLD = 60;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const ocrLang = (form.get("ocrLang") as string) || "eng+ara";

    if (!file || typeof file === "string") {
      return Response.json({ ok: false, error: "No file uploaded." }, { status: 400 });
    }

    const blob = file as File;
    const buf = Buffer.from(await blob.arrayBuffer());
    const name = (blob.name || "").toLowerCase();
    const type = blob.type || "";

    if (buf.length > MAX_BYTES) {
      return Response.json({ ok: false, error: "File is too large (max 15 MB)." }, { status: 400 });
    }

    let text = "";
    let method = "";
    let confidence: number | undefined;

    if (type.includes("pdf") || name.endsWith(".pdf")) {
      text = await extractPdfText(buf);
      method = "pdf-text";
      if (text.trim().length < 15) {
        return Response.json(
          {
            ok: false,
            error:
              "This looks like a scanned PDF with no text layer. Upload a clear photo of the page instead, so it can be read by OCR.",
          },
          { status: 422 }
        );
      }
    } else if (type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|tiff?)$/.test(name)) {
      const ocr = await ocrImage(buf, ocrLang);
      text = ocr.text;
      confidence = ocr.confidence;
      method = "ocr";
      if (text.trim().length < 3) {
        return Response.json(
          { ok: false, error: "No readable text found in the image. Try a clearer, well-lit photo." },
          { status: 422 }
        );
      }
    } else {
      return Response.json(
        { ok: false, error: "Unsupported file type. Upload a PDF or an image (PNG or JPG)." },
        { status: 415 }
      );
    }

    if (method === "ocr" && confidence !== undefined && confidence < OCR_CONFIDENCE_THRESHOLD) {
      // The UI (app/page.tsx) blocks simplification when reliable === false.
      return Response.json({
        ok: true,
        reliable: false,
        text: "",
        method,
        confidence,
        warning:
          "This document could not be read reliably (it may be handwritten or blurry). Please type the text yourself.",
      });
    }

    return Response.json({ ok: true, reliable: true, text: text.trim(), method, confidence });
  } catch {
    return Response.json(
      { ok: false, error: "Could not read the file. Try a clearer image or a text-based PDF." },
      { status: 500 }
    );
  }
}

async function extractPdfText(buf: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(buf);
  const params: Record<string, unknown> = { data, useSystemFonts: true };
  const doc = await pdfjs.getDocument(params as Parameters<typeof pdfjs.getDocument>[0]).promise;
  let out = "";
  const maxPages = Math.min(doc.numPages, 10);
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    out += content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ") + "\n";
  }
  return out;
}

async function ocrImage(buf: Buffer, lang: string): Promise<{ text: string; confidence: number }> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(lang);
  try {
    const { data } = await worker.recognize(buf);
    return { text: data.text || "", confidence: Math.round(data.confidence ?? 0) };
  } finally {
    await worker.terminate();
  }
}
