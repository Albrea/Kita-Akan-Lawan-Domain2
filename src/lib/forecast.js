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
  fnb: {
    label: "Food & beverage",
    config: { safetyPct: 0.3, overstockDays: 21, sellWindow: 1, cautious: 0.6 },
  },
  electronics: {
    label: "Electronics",
    config: { safetyPct: 0.15, overstockDays: 60, lowMargin: 0.15 },
  },
  retail: { label: "General retail", config: {} },
  other: { label: "Other", config: {} },
};

const round2 = (x) => Math.round(x * 100) / 100;

/* Default settings for a business type, before any AI or manual change. */
export const typeDefaults = (type) => ({
  ...DEFAULT_FORECAST_CONFIG,
  ...(BUSINESS_TYPES[type]?.config || {}),
});

/* The settings in use: the approved ones, or the business type's defaults. */
export function configOf(d) {
  const saved = d?.settings?.forecastConfig;
  return {
    ...typeDefaults(d?.settings?.businessType),
    ...(saved?.values || {}),
  };
}

/* How much history there is decides what StockNow offers (cold start → defaults; enough → AI-assisted). */
export function historyMode(months) {
  if (months < 3)
    return {
      key: "none",
      label: "No history yet",
      text: "Using the business type's default settings. Forecasts start after 3 months of sales.",
    };
  if (months < 6)
    return {
      key: "limited",
      label: "Limited history",
      text: "Using conservative default settings. AI-assisted settings unlock at 6 months of sales.",
    };
  return {
    key: "enough",
    label: "Enough history",
    text: "Gemini can propose settings for this shop; they are backtested and need your approval.",
  };
}

/* Checks a proposal (e.g. Gemini's JSON). Returns { ok, values, errors }. Unknown names and out-of-range numbers are errors. */
export function validateConfig(raw) {
  const errors = [],
    values = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return {
      ok: false,
      values,
      errors: ["The proposal is not a JSON object."],
    };
  Object.keys(raw).forEach((k) => {
    if (!TUNABLE.includes(k) && k !== "trendWeight")
      errors.push(`Unknown setting "${k}".`);
  });
  TUNABLE.forEach((k) => {
    if (raw[k] === undefined) return;
    const v = Number(raw[k]),
      [lo, hi] = BOUNDS[k];
    if (!Number.isFinite(v)) errors.push(`${k} is not a number.`);
    else if (v < lo || v > hi)
      errors.push(`${k} = ${v} is outside ${lo}–${hi}.`);
    else values[k] = k === "overstockDays" ? Math.round(v) : round2(v);
  });
  if (values.wmaWeight !== undefined) {
    values.trendWeight = round2(1 - values.wmaWeight);
    if (
      raw.trendWeight !== undefined &&
      Math.abs(Number(raw.trendWeight) + values.wmaWeight - 1) > 0.011
    )
      errors.push("wmaWeight and trendWeight must add up to 1.");
  } else if (raw.trendWeight !== undefined)
    errors.push("Send wmaWeight with trendWeight.");
  if (!Object.keys(values).length && !errors.length)
    errors.push("The proposal changes nothing.");
  return { ok: !errors.length, values, errors };
}

/* How each setting is shown to people. Inside, the engine keeps fractions (0.2) and months (1.5); people always
   see and type whole percentages (20%) or days (45 days). toUi / fromUi convert between the two. */
const pctUi = {
  unit: "%",
  toUi: (v) => Math.round(v * 100),
  fromUi: (u) => round2(u / 100),
};
export const SETTINGS_UI = {
  wmaWeight: {
    label: "Weight on recent months",
    help: "The rest follows the long-term trend line. Higher reacts faster to the latest months.",
    step: 5,
    ...pctUi,
  },
  safetyPct: {
    label: "Safety stock",
    help: "Extra stock bought on top of the forecast, as a % of the forecast.",
    step: 5,
    ...pctUi,
  },
  cautious: {
    label: "Plan when demand is falling",
    help: "When sales are going down, buy for only this % of the forecast.",
    step: 5,
    ...pctUi,
  },
  sellWindow: {
    label: "Stock must sell within",
    help: "Profit only counts pieces that sell within this many days.",
    step: 1,
    unit: "days",
    toUi: (v) => Math.round(v * 30),
    fromUi: (u) => round2(u / 30),
  },
  overstockDays: {
    label: "Overstock after",
    help: "Stock that would last longer than this many days counts as too much.",
    step: 1,
    unit: "days",
    toUi: (v) => Math.round(v),
    fromUi: (u) => Math.round(u),
  },
  lowMargin: {
    label: "Thin margin below",
    help: "Profit as a % of the selling price. Below this, StockNow suggests not buying.",
    step: 1,
    ...pctUi,
  },
};
/* The allowed range in the units people see, e.g. [30, 60] days. */
export const uiRange = (k) => BOUNDS[k].map(SETTINGS_UI[k].toUi);
/* One setting in plain words, e.g. "45 days", "20%", "60% (trend 40%)". */
export function settingText(k, v) {
  const s = SETTINGS_UI[k],
    u = s.toUi(v);
  if (k === "wmaWeight") return `${u}% (trend ${100 - u}%)`;
  return s.unit === "%" ? `${u}%` : `${u} days`;
}
