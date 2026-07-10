// lib/verify.test.ts
// Unit tests for the faithfulness guardrail (lib/verify.ts).
//
// Layer 1 (checkNumbers) is deterministic and tested directly.
// Layer 2 (checkSemantics) calls the local LLM, so the Ollama client is
// mocked — these tests cover the response-parsing and error-handling
// logic, not model quality (model behaviour is evaluated in eval/).

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Ollama client before importing the module under test.
vi.mock("@/lib/ollama", () => ({
  askOllama: vi.fn(),
}));

import { checkNumbers, checkSemantics, verifyFaithfulness, Flag } from "@/lib/verify";
import { askOllama } from "@/lib/ollama";

const mockedAsk = vi.mocked(askOllama);

beforeEach(() => {
  mockedAsk.mockReset();
});

// ---------------------------------------------------------------
// Layer 1 — deterministic dose/number check
// ---------------------------------------------------------------

describe("checkNumbers — English doses", () => {
  it("raises no flags when all doses are preserved", () => {
    const original = "Take amoxicillin 500 mg three times daily for 7 days.";
    const simplified = "Take 500 mg of amoxicillin 3 times a day for 7 days.";
    expect(checkNumbers(original, simplified)).toEqual([]);
  });

  it("flags a dropped dose with a unit", () => {
    const original = "Take amoxicillin 500 mg twice daily.";
    const simplified = "Take amoxicillin twice daily.";
    const flags = checkNumbers(original, simplified);
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe("number");
    expect(flags[0].detail).toContain("500");
  });

  it("flags a dropped duration (the cardiology case from the paper)", () => {
    // Real error observed in evaluation: "12 months" (ticagrelor) dropped.
    const original = "Continue ticagrelor 90 mg twice daily for 12 months.";
    const simplified = "Keep taking ticagrelor 90 mg twice a day.";
    const flags = checkNumbers(original, simplified);
    expect(flags.map((f) => f.detail).join(" ")).toContain("12");
  });

  it("flags each missing value independently", () => {
    const original = "Aspirin 81 mg daily and ticagrelor 90 mg for 12 months.";
    const simplified = "Take aspirin and ticagrelor every day.";
    const flags = checkNumbers(original, simplified);
    const flagged = flags.map((f) => f.detail).join(" ");
    expect(flagged).toContain("81");
    expect(flagged).toContain("90");
    expect(flagged).toContain("12");
  });

  it("catches multi-digit values even without an adjacent unit", () => {
    const original = "Reduce the dose by 40 if side effects occur.";
    const simplified = "Reduce the dose if side effects occur.";
    const flags = checkNumbers(original, simplified);
    expect(flags).toHaveLength(1);
    expect(flags[0].detail).toContain("40");
  });

  it("preserves decimal doses attached to units", () => {
    const original = "Take bisoprolol 2.5 mg every morning.";
    const missing = checkNumbers(original, "Take bisoprolol every morning.");
    expect(missing.map((f) => f.detail).join(" ")).toContain("2.5");

    const kept = checkNumbers(original, "Take 2.5 mg of bisoprolol each morning.");
    expect(kept).toEqual([]);
  });

  it("ignores stray single digits without units (false-alarm reduction, by design)", () => {
    // "2 tablets" — 'tablets' is not a tracked unit and '2' is a single
    // digit, so it is intentionally not extracted. This documents the
    // designed trade-off described in the paper (Section 3.5).
    const original = "Take 2 tablets with water.";
    const simplified = "Take the tablets with water.";
    expect(checkNumbers(original, simplified)).toEqual([]);
  });
});

describe("checkNumbers — Arabic and cross-language", () => {
  it("normalizes Arabic-Indic digits so \u0665\u0660\u0660 matches 500", () => {
    // Original in English, simplified in Arabic with Arabic-Indic digits.
    const original = "Take 500 mg twice daily.";
    const simplified = "\u062e\u0630 \u0665\u0660\u0660 \u0645\u0644\u063a \u0645\u0631\u062a\u064a\u0646 \u064a\u0648\u0645\u064a\u0627"; // خذ ٥٠٠ ملغ مرتين يوميا
    expect(checkNumbers(original, simplified)).toEqual([]);
  });

  it("normalizes Persian digits so \u06f4\u06f0 matches 40", () => {
    const original = "The dose is 40 units.";
    const simplified = "\u0627\u0644\u062c\u0631\u0639\u0629 \u06f4\u06f0 \u0648\u062d\u062f\u0629"; // الجرعة ۴۰ وحدة
    expect(checkNumbers(original, simplified)).toEqual([]);
  });

  it("recognises doses written with Arabic units", () => {
    const original = "\u062e\u0630 \u0665\u0660\u0660 \u0645\u0644\u063a \u064a\u0648\u0645\u064a\u0627"; // خذ ٥٠٠ ملغ يوميا
    const simplified = "\u062e\u0630 \u0627\u0644\u062f\u0648\u0627\u0621 \u064a\u0648\u0645\u064a\u0627"; // خذ الدواء يوميا (dose dropped)
    const flags = checkNumbers(original, simplified);
    expect(flags).toHaveLength(1);
    expect(flags[0].detail).toContain("500");
  });

  it("treats Arabic number-words as values (\u062e\u0645\u0633\u0629 = 5)", () => {
    // Original uses the word خمسة (five); simplified uses the digit 5.
    const original = "\u062e\u0630 \u0627\u0644\u062f\u0648\u0627\u0621 \u0644\u0645\u062f\u0629 \u062e\u0645\u0633\u0629 \u0623\u064a\u0627\u0645"; // خذ الدواء لمدة خمسة أيام
    const simplified = "Take the medicine for 5 days.";
    expect(checkNumbers(original, simplified)).toEqual([]);
  });

  it("flags a dropped Arabic number-word value", () => {
    const original = "\u062e\u0630 \u0627\u0644\u062f\u0648\u0627\u0621 \u0644\u0645\u062f\u0629 \u062e\u0645\u0633\u0629 \u0623\u064a\u0627\u0645"; // خمسة أيام
    const simplified = "Take the medicine every day.";
    const flags = checkNumbers(original, simplified);
    expect(flags.map((f) => f.detail).join(" ")).toContain("5");
  });
});

// ---------------------------------------------------------------
// Layer 2 — LLM semantic check (Ollama mocked)
// ---------------------------------------------------------------

describe("checkSemantics — response parsing", () => {
  it("parses a clean JSON issues response", async () => {
    mockedAsk.mockResolvedValue({
      ok: true,
      text: '{"issues":[{"type":"changed","detail":"bone metastasis became bone cancer"}]}',
    } as any);

    const flags = await checkSemantics("original", "simplified");
    expect(flags).toEqual([
      { type: "changed", detail: "bone metastasis became bone cancer" },
    ]);
  });

  it("strips markdown code fences before parsing", async () => {
    mockedAsk.mockResolvedValue({
      ok: true,
      text: '```json\n{"issues":[{"type":"removed","detail":"warning about bleeding removed"}]}\n```',
    } as any);

    const flags = await checkSemantics("original", "simplified");
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe("removed");
  });

  it("returns no flags for an empty issues array", async () => {
    mockedAsk.mockResolvedValue({ ok: true, text: '{"issues":[]}' } as any);
    expect(await checkSemantics("original", "simplified")).toEqual([]);
  });

  it("returns no flags (fails safe) on malformed model output", async () => {
    mockedAsk.mockResolvedValue({
      ok: true,
      text: "Sure! Here are the issues I found: none really.",
    } as any);
    expect(await checkSemantics("original", "simplified")).toEqual([]);
  });

  it("returns no flags when the model call fails", async () => {
    mockedAsk.mockResolvedValue({ ok: false, text: "" } as any);
    expect(await checkSemantics("original", "simplified")).toEqual([]);
  });

  it("coerces unknown issue types to 'changed' and drops malformed entries", async () => {
    mockedAsk.mockResolvedValue({
      ok: true,
      text: '{"issues":[{"type":"weird","detail":"qualifier palliative dropped"},{"type":"added"},{"detail":42}]}',
    } as any);

    const flags = await checkSemantics("original", "simplified");
    expect(flags).toEqual([{ type: "changed", detail: "qualifier palliative dropped" }]);
  });
});

// ---------------------------------------------------------------
// Combined pipeline
// ---------------------------------------------------------------

describe("verifyFaithfulness — combined layers", () => {
  it("merges deterministic and semantic flags", async () => {
    mockedAsk.mockResolvedValue({
      ok: true,
      text: '{"issues":[{"type":"changed","detail":"dose reduction reframed as when you feel better"}]}',
    } as any);

    const original = "Reduce dose to 250 mg on toxicity.";
    const simplified = "Lower the dose when you feel better.";
    const flags = await verifyFaithfulness(original, simplified);

    const types = flags.map((f: Flag) => f.type);
    expect(types).toContain("number"); // 250 dropped — Layer 1
    expect(types).toContain("changed"); // semantic issue — Layer 2
  });

  it("returns an empty list when both layers pass", async () => {
    mockedAsk.mockResolvedValue({ ok: true, text: '{"issues":[]}' } as any);
    const original = "Take 500 mg daily.";
    const simplified = "Take 500 mg every day.";
    expect(await verifyFaithfulness(original, simplified)).toEqual([]);
  });
});
