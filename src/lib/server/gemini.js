/* Gemini only rewrites wording. It never calculates: the engine's numbers go in as facts, and any
   reply that mentions a number that is not in those facts is thrown away in favour of the template. */
const MODEL = () => process.env.GEMINI_MODEL || "gemini-3.8-flash";
export const geminiConfigured = () => !!process.env.GEMINI_API_KEY;

const numbersIn = (text) => (String(text).match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, "").replace(/\.0+$/, ""));

/* True when every number Gemini wrote also appears in the facts we gave it. */
export function numbersMatch(output, facts) {
  const allowed = new Set(numbersIn(facts));
  return numbersIn(output).every((n) => allowed.has(n));
}

async function callGemini(prompt, maxTokens) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  const send = (generationConfig) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig }),
    signal: ctrl.signal,
  });
  try {
    const base = { temperature: 0.3, maxOutputTokens: maxTokens };
    // Thinking is not needed to reword facts. Models that don't accept this setting reject it, so retry without it.
    let res = await send({ ...base, thinkingConfig: { thinkingBudget: 0 } });
    if (res.status === 400) res = await send(base);
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const json = await res.json();
    const text = (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    if (!text) throw new Error("Gemini returned no text");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/* Returns { text, source: "gemini" | "template", note? }. Never throws. */
export async function writeWithGemini({ task, facts, fallback, maxTokens = 300 }) {
  if (!geminiConfigured()) return { text: fallback, source: "template", note: "GEMINI_API_KEY is not set" };
  const prompt = `${task}

Rules:
- Use only the facts below. Do not add, round, or calculate any number; copy numbers exactly as written.
- Plain, friendly English for a small shop owner. No markdown headings, no emojis.

FACTS:
${facts}`;
  try {
    const text = await callGemini(prompt, maxTokens);
    if (!numbersMatch(text, facts)) return { text: fallback, source: "template", note: "Gemini used a number that is not in the facts" };
    return { text, source: "gemini" };
  } catch (e) {
    return { text: fallback, source: "template", note: e.name === "AbortError" ? "Gemini timed out" : e.message };
  }
}
