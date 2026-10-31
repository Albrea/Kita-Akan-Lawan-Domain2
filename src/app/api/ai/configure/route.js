import { loadData } from "@/lib/server/store.js";
import { configureForecasting } from "@/lib/server/gemini.js";
import { json } from "@/lib/server/http.js";
import { backtestMulti, salesStats } from "@/lib/engine.js";
import { BOUNDS, BUSINESS_TYPES, configOf, historyMode, validateConfig } from "@/lib/forecast.js";

export const dynamic = "force-dynamic";

/* Asks Gemini for forecast settings, validates them and backtests them against the current ones.
   Returns a proposal only: the shop keeps its settings until an Owner or Manager approves (action applyForecastConfig). */
export async function POST() {
  const d = await loadData();
  const months = d.settings.salesMonths.length, mode = historyMode(months);
  if (mode.key !== "enough") return json({ ok: false, error: `${mode.label}: ${mode.text}` });
  const current = configOf(d), stats = salesStats(d);
  const out = await configureForecasting({
    businessProfile: { type: BUSINESS_TYPES[d.settings.businessType]?.label || "Clothing & apparel", yearsInBusiness: d.settings.businessYears, monthsOfSalesHistory: months },
    statistics: stats, current, bounds: BOUNDS,
  });
  if (!out.ok) return json({ ok: false, error: out.error, model: out.model });
  const v = validateConfig(out.values);
  if (!v.ok) return json({ ok: false, model: out.model, error: `The suggestion was rejected by the safety check: ${v.errors.join(" ")} Your current settings stay.` });
  const proposed = { ...current, ...v.values };
  return json({
    ok: true, model: out.model, explanation: out.explanation, values: v.values, current, proposed,
    backtest: { current: backtestMulti(d, current), proposed: backtestMulti(d, proposed) },
  });
}
