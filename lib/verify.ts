// lib/verify.ts
// The faithfulness guardrail. Two layers:
//   1. Deterministic number/dose check (reliable, language-agnostic)
//   2. LLM-based semantic check (catches changed facts, added info)
// Output is "flags" — warnings for a human to review. This is a
// human-in-the-loop safety aid, NOT an automatic approval system.

import { askOllama } from "@/lib/ollama";

export interface Flag {
  type: "number" | "changed" | "added" | "removed";
  detail: string;
}

// --- Layer 1: deterministic number check ---


// Convert Arabic-Indic / Persian digits to Western, so "٤٠" == "40".
function normalizeDigits(text: string): string {
  const map: Record<string, string> = {
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
    "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  };
  return text.replace(/[٠-٩۰-۹]/g, (d) => map[d] ?? d);
}

// Arabic number-words for 0-10, so "خمسة" counts as "5".
const ARABIC_NUMBER_WORDS: Record<string, string> = {
  "صفر": "0", "واحد": "1", "اثنان": "2", "اثنين": "2", "ثلاثة": "3",
  "أربعة": "4", "اربعة": "4", "خمسة": "5", "ستة": "6", "سبعة": "7",
  "ثمانية": "8", "تسعة": "9", "عشرة": "10",
};

// Pull out dose-like numbers: a number that is meaningful (has 2+ digits,
// OR is followed/preceded by a unit or dose word). This avoids flagging
// every stray "2" or "4" and cuts false alarms massively.
function extractDoseNumbers(text: string): Set<string> {
  const norm = normalizeDigits(text);
  const found = new Set<string>();

  // 1. Numbers attached to a unit or dose context (mg, ml, mcg, puff, day, hour,
  //    and their Arabic equivalents).
  const unitPattern =
    /(\d+(?:\.\d+)?)\s*(mg|ml|mcg|g|puffs?|days?|hours?|times?|ملغ|مغ|مل|رشفة|رشفات|أيام|يوم|ساعات|ساعة|مرات|مرة)/gi;
  let m;
  while ((m = unitPattern.exec(norm)) !== null) {
    found.add(m[1]);
  }

  // 2. Any number with 2+ digits (like 40) is almost always a real dose/value.
  const bigNums = norm.match(/\d{2,}(?:\.\d+)?/g);
  if (bigNums) bigNums.forEach((n) => found.add(n));

  // 3. Arabic number-words.
  for (const [word, digit] of Object.entries(ARABIC_NUMBER_WORDS)) {
    if (norm.includes(word)) found.add(digit);
  }

  return found;
}

// Flag any dose value in the original that is missing from the simplified text.
export function checkNumbers(original: string, simplified: string): Flag[] {
  const flags: Flag[] = [];
  const originalNums = extractDoseNumbers(original);
  const simplifiedNums = extractDoseNumbers(simplified);

  for (const num of originalNums) {
    if (!simplifiedNums.has(num)) {
      flags.push({
        type: "number",
        detail: `The dose/value "${num}" from the original may be missing or changed in the simplified text.`,
      });
    }
  }
  return flags;
}

// --- Layer 2: LLM-based semantic check ---

const VERIFY_SYSTEM = `You are a medical faithfulness checker. Compare an ORIGINAL medical text with a SIMPLIFIED version and find places where the simplified version is unfaithful. The simplified version may be in a different language (for example Arabic) — check the MEANING across languages, not the words.

Report these problems:
- CHANGED: a diagnosis, drug name, drug FORM (e.g. inhaler vs tablets), dose, or instruction changed to something different. Example: original "COPD" but simplified "asthma"; or "inhaler" became "tablets".
- ADDED: any information, advice, cause, symptom, drug explanation, or drug INDICATION not in the original. Example: original does not say what a drug treats, but simplified adds "for cough".
- REMOVED: a warning, instruction, dose, or important fact present in the original but missing from the simplified.

Do NOT report simpler wording, shorter sentences, or translation into another language as problems — those are the goal. Only report real changes to medical meaning.

Respond with ONLY valid JSON, no other text:
{"issues":[{"type":"changed","detail":"..."},{"type":"added","detail":"..."}]}
If there are no problems: {"issues":[]}`;

export async function checkSemantics(original: string, simplified: string): Promise<Flag[]> {
  const user = `ORIGINAL:\n${original}\n\nSIMPLIFIED:\n${simplified}`;
  const result = await askOllama(VERIFY_SYSTEM, user);
  if (!result.ok) return [];
  return safeParseIssues(result.text);
}

function safeParseIssues(raw: string): Flag[] {
  try {
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return [];
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(obj.issues)) return [];
    return obj.issues
      .filter((i: any) => i && typeof i.detail === "string")
      .map((i: any) => ({
        type: ["changed", "added", "removed"].includes(i.type) ? i.type : "changed",
        detail: i.detail,
      }));
  } catch {
    return [];
  }
}

// --- Combine both layers ---
export async function verifyFaithfulness(original: string, simplified: string): Promise<Flag[]> {
  const numberFlags = checkNumbers(original, simplified);
  const semanticFlags = await checkSemantics(original, simplified);
  return [...numberFlags, ...semanticFlags];
}