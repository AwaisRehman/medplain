// medplain/lib/ollama.ts
// This file is the single connection point between our app and the
// local Ollama model. Every request to the AI goes through here.

// Read config from environment variables, with safe fallbacks.
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL = process.env.MODEL || "llama3.2:3b";

// The shape of what our function returns.
export interface OllamaResult {
  text: string;      // the model's reply
  ok: boolean;       // did it succeed?
  error?: string;    // an error message, if any
}

/**
 * Sends a prompt to the local Ollama model and returns its reply.
 * @param system - instructions that set the model's behavior (the "rules")
 * @param user - the actual text we want the model to work on
 */
export async function askOllama(
  system: string,
  user: string
): Promise<OllamaResult> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        stream: false, // get the whole answer at once, not word-by-word
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        options: {
          temperature: 0.2, // low = stays faithful, doesn't get creative
        },
      }),
    });

    if (!response.ok) {
      return { text: "", ok: false, error: `Ollama returned ${response.status}` };
    }

    const data = await response.json();
    const cleaned = stripPreamble(data.message?.content ?? "");
    return { text: cleaned, ok: true };
  } catch (err) {
    // This usually means Ollama isn't running.
    return {
      text: "",
      ok: false,
      error: "Could not reach Ollama. Is it running? Try: ollama serve",
    };
  }

/**
 * Removes common preamble lines a model sometimes adds before the real answer,
 * e.g. "Here's the simplified text:". Belt-and-suspenders for prompt rule compliance.
 */
function stripPreamble(text: string): string {
  const trimmed = text.trim();
  // Match a leading line like "Here is the simplified text:" / "Simplified:" etc.
  const preamblePattern = /^(here('|’)?s?\s+(is\s+)?the\s+simplified\s+text|simplified\s+text|simplified)\s*[:\-]?\s*/i;
  return trimmed.replace(preamblePattern, "").trim();
}
}