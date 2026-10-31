/* ============================================================================
   FORECAST SETTINGS: the engine's few tunable numbers, kept as data so they can
   differ per business. Gemini may *propose* new values (as JSON, never code);
   validateConfig() keeps them inside safe bounds, and a person approves them.
   ============================================================================ */

/* The settings the engine has always used; existing plans and tests stay identical with these. */
export const DEFAULT_FORECAST_CONFIG = {
  wmaWeight: 0.5, // share of the 3:2:1 weighted average in the forecast
  trendWeight: 0.5, // share of the trend line (always 1 − wmaWeight)
  safetyPct: 0.2, // safety stock as a share of the forecast
  cautious: 0.7, // when demand is falling, plan only this share of the forecast
  sellWindow: 1.5, // profit counts what sells within forecast × this (≈ 45 days)
  overstockDays: 45, // stock lasting longer than this is "overstock"
  lowMargin: 0.25, // margins below this are "thin"
};

/* What each setting may be. Anything outside is rejected, never stretched to fit silently. */
export const BOUNDS = {
  wmaWeight: [0.2, 0.8],
  safetyPct: [0.1, 0.4],
  cautious: [0.5, 0.9],
  sellWindow: [1, 2],
  overstockDays: [14, 90],
  lowMargin: [0.15, 0.35],
};
export const TUNABLE = Object.keys(BOUNDS);

/* Starting points when a shop has little or no sales history (cold start). */
export const BUSINESS_TYPES = {
  clothing: { label: "Clothing & apparel", config: {} },
  fnb: { label: "Food & beverage", config: { safetyPct: 0.3, overstockDays: 21, sellWindow: 1, cautious: 0.6 } },
  electronics: { label: "Electronics", config: { safetyPct: 0.15, overstockDays: 60, lowMargin: 0.15 } },
  retail: { label: "General retail", config: {} },
  other: { label: "Other", config: {} },
};

const round2 = (x) => Math.round(x * 100) / 100;

/* Default settings for a business type, before any AI or manual change. */
export const typeDefaults = (type) => ({ ...DEFAULT_FORECAST_CONFIG, ...(BUSINESS_TYPES[type]?.config || {}) });

/* The settings in use: the approved ones, or the business type's defaults. */
export function configOf(d) {
  const saved = d?.settings?.forecastConfig;
  return { ...typeDefaults(d?.settings?.businessType), ...(saved?.values || {}) };
}

/* How much history there is decides what StockNow offers (cold start → defaults; enough → AI-assisted). */
export function historyMode(months) {
  if (months < 3) return { key: "none", label: "No history yet", text: "Using the business type's default settings. Forecasts start after 3 months of sales." };
  if (months < 6) return { key: "limited", label: "Limited history", text: "Using conservative default settings. AI-assisted settings unlock at 6 months of sales." };
  return { key: "enough", label: "Enough history", text: "Gemini can propose settings for this shop; they are backtested and need your approval." };
}

/* Checks a proposal (e.g. Gemini's JSON). Returns { ok, values, errors }. Unknown names and out-of-range numbers are errors. */
export function validateConfig(raw) {
  const errors = [], values = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, values, errors: ["The proposal is not a JSON object."] };
  Object.keys(raw).forEach((k) => {
    if (!TUNABLE.includes(k) && k !== "trendWeight") errors.push(`Unknown setting "${k}".`);
  });
  TUNABLE.forEach((k) => {
    if (raw[k] === undefined) return;
    const v = Number(raw[k]), [lo, hi] = BOUNDS[k];
    if (!Number.isFinite(v)) errors.push(`${k} is not a number.`);
    else if (v < lo || v > hi) errors.push(`${k} = ${v} is outside ${lo}–${hi}.`);
    else values[k] = k === "overstockDays" ? Math.round(v) : round2(v);
  });
  if (values.wmaWeight !== undefined) {
    values.trendWeight = round2(1 - values.wmaWeight);
    if (raw.trendWeight !== undefined && Math.abs(Number(raw.trendWeight) + values.wmaWeight - 1) > 0.011) errors.push("wmaWeight and trendWeight must add up to 1.");
  } else if (raw.trendWeight !== undefined) errors.push("Send wmaWeight with trendWeight.");
  if (!Object.keys(values).length && !errors.length) errors.push("The proposal changes nothing.");
  return { ok: !errors.length, values, errors };
}
