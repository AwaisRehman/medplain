// app/api/simplify/route.ts
import { askOllama } from "@/lib/ollama";
import { buildSimplifyPrompt, READING_LEVELS, LANGUAGES } from "@/lib/prompts";
import type { ReadingLevelKey, LanguageKey } from "@/lib/prompts";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text: string = (body.text ?? "").trim();
    const level: ReadingLevelKey = body.level ?? "grade8";
    const language: LanguageKey = body.language ?? "en";

    if (!text) {
      return Response.json({ ok: false, error: "No text provided." }, { status: 400 });
    }
    if (text.length > 5000) {
      return Response.json({ ok: false, error: "Text too long (max 5000 characters)." }, { status: 400 });
    }

    const levelLabel = READING_LEVELS[level] ?? READING_LEVELS.grade8;
    const langLabel = LANGUAGES[language] ?? LANGUAGES.en;

    const system = buildSimplifyPrompt(levelLabel, langLabel);
    const result = await askOllama(system, text);

    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 502 });
    }

    return Response.json({ ok: true, original: text, simplified: result.text });
  } catch {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
}