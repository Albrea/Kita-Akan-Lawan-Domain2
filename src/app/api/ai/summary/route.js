import { loadData } from "@/lib/server/store.js";
import { writeWithGemini } from "@/lib/server/gemini.js";
import { json, readBody } from "@/lib/server/http.js";
import { planWith, summaryBullets } from "@/lib/engine.js";

export const dynamic = "force-dynamic";

const plainText = (s) => s.replace(/\*\*/g, "");

/* The engine re-computes the plan here; Gemini only turns its findings into a short paragraph. */
export async function POST(req) {
  const { budget, overrides } = await readBody(req);
  const d = await loadData();
  const r = planWith(d, budget === null || budget === "ideal" ? Infinity : +budget, overrides || {});
  const facts = [
    plainText(r.summary),
    ...summaryBullets(d, r).map((b) => "- " + plainText(b.h)),
    ...r.t.buy.map((i) => `- Buy ${i.qty} × ${i.name} for RM ${i.cost.toLocaleString("en-MY")}: ${i.reasons.slice(0, 2).join("; ")}`),
  ].join("\n");
  const out = await writeWithGemini({
    task: "Summarise this restock plan for the shop owner in 2 or 3 short sentences: what to buy, why, and what to skip.",
    facts,
    fallback: plainText(r.summary),
    maxTokens: 220,
  });
  return json(out);
}
