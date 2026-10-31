/* Gemini never calculates and never decides what to buy. It has two jobs:
   1. Wording (writeWithGemini): the engine's numbers go in as facts, and any reply that mentions a number
      that is not in those facts is thrown away in favour of the template.
   2. Forecast settings (configureForecasting, at the bottom): it proposes values as JSON, which StockNow
      checks, backtests and a person approves. */
export const geminiModel = () => process.env.GEMINI_MODEL || "gemini-3.5-flash";
export const geminiConfigured = () => !!process.env.GEMINI_API_KEY;

/* If the chosen model is overloaded or too slow, these are tried next (tested on 31 Oct 2026: gemini-3.8-flash
   timed out at 30 s while 3.5-flash answered in 1–8 s and 3.5-flash-lite in under 1 s). GEMINI_FALLBACK_MODELS overrides. */
const fallbackModels = () =>
  (
    process.env.GEMINI_FALLBACK_MODELS ||
    "gemini-3.5-flash,gemini-3.5-flash-lite"
  )
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
export const geminiModels = () => [
  ...new Set([geminiModel(), ...fallbackModels()]),
];

const TIMEOUT_MS = 12000;
const BUSY = new Set([408, 429, 500, 502, 503, 504]);

/* Numbers in a text. List markers at the start of a line ("1." / "2)") are layout, not facts. */
const numbersIn = (text) =>
  (
    String(text)
      .replace(/^\s*\d+[.)]\s+/gm, "")
      .match(/\d[\d,]*(?:\.\d+)?/g) || []
  ).map((n) => n.replace(/,/g, "").replace(/\.0+$/, ""));

/* True when every number Gemini wrote also appears in the facts (or the task) we gave it. */
export function numbersMatch(output, facts, task = "") {
  const allowed = new Set([...numbersIn(facts), ...numbersIn(task)]);
  return numbersIn(output).every((n) => allowed.has(n));
}

class GeminiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

async function callOnce(model, prompt, maxTokens, asJson = false) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const send = (generationConfig) =>
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig,
        }),
        signal: ctrl.signal,
      },
    );
  try {
    const base = {
      temperature: 0.3,
      maxOutputTokens: maxTokens,
      ...(asJson ? { responseMimeType: "application/json" } : {}),
    };
    // Thinking is not needed to reword facts. Models that don't accept this setting reject it, so retry without it.
    let res = await send({ ...base, thinkingConfig: { thinkingBudget: 0 } });
    if (res.status === 400) res = await send(base);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new GeminiError(
        body.error?.message || `Gemini HTTP ${res.status}`,
        res.status,
      );
    }
    const json = await res.json();
    const text = (json.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || "")
      .join("")
      .trim();
    if (!text)
      throw new GeminiError(
        `Gemini returned no text (${json.candidates?.[0]?.finishReason || "empty"})`,
        408,
      );
    return text;
  } catch (e) {
    if (e.name === "AbortError") throw new GeminiError("Gemini timed out", 408);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* Tries the chosen model, then the backup models, while the failure is "busy" (overloaded, rate limited,
   timed out, no text, network). A wrong key or bad request stops at once. Returns { text, model }. */
async function callGemini(prompt, maxTokens, asJson = false) {
  const tried = [];
  for (const model of geminiModels()) {
    try {
      return { text: await callOnce(model, prompt, maxTokens, asJson), model };
    } catch (e) {
      if (e.status && !BUSY.has(e.status) && e.status !== 404) throw e; // 404: model not available, try the next
      tried.push(`${model}: ${e.message}`);
    }
  }
  throw new GeminiError(tried.join(" · "), 503);
}

/* Returns { text, source: "gemini" | "template", reason?, note? }. Never throws.
   reason: "no_key" (GEMINI_API_KEY not set), "error" (Gemini failed or timed out), "numbers" (reply failed the number check). */
export async function writeWithGemini({
  task,
  facts,
  fallback,
  maxTokens = 300,
}) {
  if (!geminiConfigured())
    return {
      text: fallback,
      source: "template",
      reason: "no_key",
      note: "GEMINI_API_KEY is not set",
    };
  const prompt = `${task}

Rules:
- Use only the facts below. Do not add, round, or calculate any number; copy numbers exactly as written.
- Plain, friendly English for a small shop owner. No markdown headings, no emojis, no numbered lists.

FACTS:
${facts}`;
  try {
    const { text, model } = await callGemini(prompt, maxTokens);
    if (!numbersMatch(text, facts, task)) {
      console.warn(
        "Gemini reply failed the number check, template used:",
        text,
      );
      return {
        text: fallback,
        source: "template",
        reason: "numbers",
        note: `${model} used a number that is not in the facts`,
      };
    }
    return { text, source: "gemini", model, note: `Written by ${model}` };
  } catch (e) {
    console.warn("Gemini failed, template used:", e.message);
    return {
      text: fallback,
      source: "template",
      reason: "error",
      note: e.message,
    };
  }
}

/* Settings → AI "Test Gemini": one tiny real call, so the team can see the key and model work on the server. */
export async function checkGemini() {
  const chosen = geminiModel();
  if (!geminiConfigured())
    return {
      ok: false,
      configured: false,
      model: chosen,
      error: "GEMINI_API_KEY is not set on the server.",
    };
  const start = Date.now();
  try {
    const { text, model } = await callGemini("Reply with exactly: OK", 64);
    return {
      ok: true,
      configured: true,
      model,
      chosen,
      ms: Date.now() - start,
      reply: text.slice(0, 40),
    };
  } catch (e) {
    return {
      ok: false,
      configured: true,
      model: chosen,
      ms: Date.now() - start,
      error: e.message,
    };
  }
}

/* Adaptive forecasting: Gemini reads derived sales statistics (never the raw records) and proposes forecast
   settings as JSON. Returns { ok, values, explanation, model } or { ok: false, error }. The caller validates,
   backtests and waits for a person to approve; nothing here changes the shop. */
export async function configureForecasting({
  businessProfile,
  statistics,
  current,
  bounds,
}) {
  if (!geminiConfigured())
    return { ok: false, error: "GEMINI_API_KEY is not set on the server." };
  const prompt = `You tune the settings of a deterministic inventory forecasting engine for one small business.
The engine forecasts next month's sales per product as: wmaWeight × (3:2:1 weighted average of the last 3 months) + (1 − wmaWeight) × (linear trend over all months).
A higher wmaWeight reacts more to the latest months; a lower one follows the long-term direction more.
safetyPct is extra stock as a share of the forecast. cautious is the share of the forecast planned when demand is falling.
sellWindow × 30 days is how long bought stock may take to sell before it counts as no profit. overstockDays marks stock that lasts too long. lowMargin marks thin margins.

Business profile: ${JSON.stringify(businessProfile)}
Sales statistics (variability = standard deviation ÷ average; trendPerMonth = trend slope ÷ average; lastVsEarlier = last month ÷ average of the first 3): ${JSON.stringify(statistics)}
Current settings: ${JSON.stringify(current)}
Allowed range for each setting: ${JSON.stringify(bounds)}

backtestErrorPercentByWmaWeight is the measured average forecast error (%) on this shop's own past months for each wmaWeight; lower is better. Prefer a wmaWeight with a low measured error unless the statistics give a clear reason not to, and say which error you expect.
Propose settings that suit this business. Change only what the statistics justify; keep the rest equal to the current settings.
Reply with JSON only, exactly this shape:
{"wmaWeight": number, "safetyPct": number, "cautious": number, "sellWindow": number, "overstockDays": number, "lowMargin": number, "explanation": "2 or 3 plain sentences for the shop owner on what you changed and why, quoting the statistics"}
In the explanation, never use the setting names above. Say them in plain words with percentages and days, for example "weight on recent months 20%", "safety stock 30%", "stock must sell within 45 days", "overstock after 30 days".`;
  try {
    const { text, model } = await callGemini(prompt, 700, true);
    let raw;
    try {
      raw = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      return { ok: false, model, error: "Gemini's reply was not valid JSON." };
    }
    const { explanation = "", ...values } = raw || {};
    return {
      ok: true,
      model,
      values,
      explanation: String(explanation).slice(0, 600),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
