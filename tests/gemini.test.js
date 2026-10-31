import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkGemini, numbersMatch, writeWithGemini } from "../src/lib/server/gemini.js";

const reply = (text, status = 200) => ({ ok: status === 200, status, json: async () => (status === 200 ? { candidates: [{ content: { parts: [{ text }] } }] } : { error: { message: `HTTP ${status}` } }) });
const ask = { task: "Summarise in 2 or 3 sentences.", facts: "Buy 104 × Denim Jacket for RM 6,240. Expected profit RM 17,128.", fallback: "TEMPLATE" };

describe("Gemini wording", () => {
  beforeEach(() => { process.env.GEMINI_API_KEY = "test-key"; });
  afterEach(() => { delete process.env.GEMINI_API_KEY; vi.unstubAllGlobals(); });

  it("uses Gemini's text when its numbers match the facts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply("Buy 104 Denim Jackets for RM 6,240; profit about RM 17,128.")));
    const out = await writeWithGemini(ask);
    expect(out.source).toBe("gemini");
  });

  it("retries once when Gemini is busy", async () => {
    const f = vi.fn().mockResolvedValueOnce(reply("", 503)).mockResolvedValueOnce(reply("Buy 104 Denim Jackets."));
    vi.stubGlobal("fetch", f);
    const out = await writeWithGemini(ask);
    expect(out.source).toBe("gemini");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("falls back to the template, with the reason, when Gemini invents a number", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply("Buy 120 Denim Jackets.")));
    expect(await writeWithGemini(ask)).toMatchObject({ source: "template", reason: "numbers", text: "TEMPLATE" });
  });

  it("says when no key is set", async () => {
    delete process.env.GEMINI_API_KEY;
    expect(await writeWithGemini(ask)).toMatchObject({ source: "template", reason: "no_key" });
    expect(await checkGemini()).toMatchObject({ ok: false, configured: false });
  });

  it("list numbering and numbers from the task are not treated as invented", () => {
    expect(numbersMatch("1. 104 × Denim Jacket\n2) RM 6,240", ask.facts)).toBe(true);
    expect(numbersMatch("In 2 sentences: buy 104.", ask.facts, ask.task)).toBe(true);
  });
});
