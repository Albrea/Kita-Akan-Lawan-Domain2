/* ============================================================================
   AI ENGINE: deterministic, so every number on the AI screens can be explained
   ("Show calculation") and tested. Gemini only rewrites the wording afterwards.
   ============================================================================ */
import { daysText, list, monthKey, nowStamp, pct, plural, rm, rm2, today, daysBetween } from "./format.js";
import { DEFAULT_FORECAST_CONFIG, configOf } from "./forecast.js";

export { configOf };

/* ---------- selectors ---------- */
export const productOf = (d, id) => d.products.find((p) => p.id === id);
export const nameOfP = (d, pid) => productOf(d, pid)?.name ?? "Deleted product";
export const catName = (d, id) => d.categories.find((c) => c.id === id)?.name ?? "—";
export const supOf = (d, id) => d.suppliers.find((s) => s.id === id);
export const supName = (d, id) => supOf(d, id)?.name ?? "No supplier";
export const SYS_USER = { id: "sys", name: "StockNow", email: "", dept: "", role: null, leaveUntil: null, seq: 0 };
/* Paid customer orders arriving from Orbyte Payment are recorded under this name. */
export const ORBYTE_USER = { id: "orbyte", name: "Orbyte Payment", email: "", dept: "", role: "SYSTEM", leaveUntil: null, seq: 0 };
export const userOf = (d, id) =>
  id === "sys" ? SYS_USER : id === "orbyte" ? ORBYTE_USER : d.people.find((u) => u.id === id) ?? { id: id || "", name: "Unknown", email: "", dept: "", role: "STAFF", leaveUntil: null, seq: 0 };
export const members = (d) => d.people.filter((u) => u.role);
export const reqOf = (d, id) => d.requests.find((r) => r.id === id);
export const poOf = (d, id) => d.pos.find((p) => p.id === id);
export const salesOf = (d, pid) => d.sales.find((s) => s.id === pid)?.series ?? [];
export const pendingRequests = (d) => d.requests.filter((r) => r.status === "PENDING");
export const openPOs = (d) => d.pos.filter((p) => p.status !== "RECEIVED");
export const poTotal = (po) => po.items.reduce((s, i) => s + i.qty * i.unitCost, 0);
export const lateDays = (po) => (po.status !== "RECEIVED" && po.expectedAt < today() ? daysBetween(po.expectedAt, today()) : 0);

/* Orbyte eLeave tells us who is away; proposals skip approvers on leave. */
export const approvers = (d) => d.people.filter((u) => u.role === "OWNER" || u.role === "MANAGER");
export const onLeave = (u) => !!u.leaveUntil && u.leaveUntil >= today();
export const routeTo = (d) => {
  const a = approvers(d), here = a.filter((u) => !onLeave(u));
  return here.length ? here : a;
};

/* ---------- budget: the Owner sets a monthly purchase budget ----------
   Supplier orders and manual purchases use it up; stock sent back to a supplier is refunded.
   Customer returns and sales never touch it (sales are revenue). */
export const isCustomerReturn = (t) => t.type === "STOCK_IN" && t.reason === "Customer return";
export const isManualBuy = (t) => t.type === "STOCK_IN" && !t.poId && !isCustomerReturn(t);
export const isSupplierReturn = (t) => t.type === "STOCK_OUT" && t.reason === "Returned to supplier";
export const PAYMENT_REASON = "Orbyte Payment ";
export const paymentRef = (t) => (t.reason.startsWith(PAYMENT_REASON) ? t.reason.slice(PAYMENT_REASON.length) : "");
export const isSale = (t) => t.type === "STOCK_OUT" && (t.reason === "Sold in store" || t.reason === "Online order" || !!paymentRef(t));
const costOf = (d, t) => t.qty * (productOf(d, t.pid)?.cost ?? 0);

/* Undo never deletes: it adds an opposite movement whose reason is "UNDO:<id of the original>".
   Both stay in the history and the activity log; totals skip the pair. */
export const UNDO_PREFIX = "UNDO:";
export const isReversal = (t) => t.reason.startsWith(UNDO_PREFIX);
export const reversalOf = (d, t) => d.tx.find((x) => x.reason === UNDO_PREFIX + t.id);
export function liveTx(d) {
  const undone = new Set(d.tx.filter(isReversal).map((t) => t.reason.slice(UNDO_PREFIX.length)));
  return d.tx.filter((t) => !isReversal(t) && !undone.has(t.id));
}

export function budgetParts(d) {
  const mk = monthKey();
  const month = liveTx(d).filter((t) => t.at.startsWith(mk));
  const orders = d.pos.filter((po) => po.at.startsWith(mk)).reduce((s, po) => s + poTotal(po), 0);
  const manual = month.filter(isManualBuy).reduce((s, t) => s + costOf(d, t), 0);
  const refunds = month.filter(isSupplierReturn).reduce((s, t) => s + costOf(d, t), 0);
  return { orders, manual, refunds };
}
/* This month's purchases per supplier (supplier orders + manual purchases), for the Finance chart.
   Stock returned to a supplier is not a purchase, so it is given separately as `returned`:
   purchases − returned = spentThisMonth. */
export function spendBySupplier(d) {
  const mk = monthKey(), by = {};
  const add = (sup, v) => { by[sup || ""] = (by[sup || ""] || 0) + v; };
  d.pos.filter((po) => po.at.startsWith(mk)).forEach((po) => add(po.sup, poTotal(po)));
  liveTx(d).filter((t) => t.at.startsWith(mk) && isManualBuy(t)).forEach((t) => add(t.sup || productOf(d, t.pid)?.sup, costOf(d, t)));
  const slices = Object.entries(by).map(([sup, value]) => ({ sup, value })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  return { slices, returned: budgetParts(d).refunds };
}
export const spentThisMonth = (d) => {
  const b = budgetParts(d);
  return Math.max(0, b.orders + b.manual - b.refunds);
};
export const budgetLeft = (d) => Math.max(0, d.settings.monthlyBudget - spentThisMonth(d));
export const todayTx = (d) => liveTx(d).filter((t) => t.at.startsWith(today()));

export function incomingOf(d, pid) {
  return openPOs(d).reduce((s, po) => s + po.items.filter((i) => i.pid === pid).reduce((a, i) => a + (i.qty - i.received), 0), 0);
}

/* ---------- forecasting ---------- */

/* Forecast = wmaWeight × weighted moving average (3:2:1) + trendWeight × linear trend (50/50 by default).
   Keeps every step for "Show calculation". */
export function forecastFrom(s, cfg = DEFAULT_FORECAST_CONFIG) {
  const n = s.length;
  const wma = (s[n - 1] * 3 + s[n - 2] * 2 + s[n - 3]) / 6;
  const xm = (n - 1) / 2, ym = s.reduce((a, b) => a + b, 0) / n;
  let nu = 0, de = 0;
  s.forEach((y, i) => { nu += (i - xm) * (y - ym); de += (i - xm) ** 2; });
  const slope = nu / de, lin = ym + slope * (n - xm);
  const forecast = Math.max(0, Math.round(cfg.wmaWeight * wma + cfg.trendWeight * lin));
  const fitted = s.map((_, i) => ym + slope * (i - xm));
  const rmse = Math.sqrt(s.reduce((a, y, i) => a + (y - fitted[i]) ** 2, 0) / n);
  const first3 = (s[0] + s[1] + s[2]) / 3, last3 = (s[n - 1] + s[n - 2] + s[n - 3]) / 3;
  return { wma, ym, slope, lin, step: n - xm, forecast, fitted, rmse, growth: first3 ? (last3 - first3) / first3 : 0, trendPct: ym ? slope / ym : 0 };
}

export function signals(d, p) {
  const s = salesOf(d, p.id);
  if (s.length < 3) return null;
  const f = forecastFrom(s, configOf(d)), forecast = f.forecast;
  const trend = f.trendPct > 0.03 ? "Rising" : f.trendPct < -0.03 ? "Falling" : "Stable";
  const daily = forecast / 30;
  const incoming = incomingOf(d, p.id);
  const cover = daily > 0 ? p.stock / daily : Infinity;
  const coverAll = daily > 0 ? (p.stock + incoming) / daily : Infinity;
  const margin = p.sell > 0 ? (p.sell - p.cost) / p.sell : 0;
  const conf = Math.round(Math.min(97, Math.max(55, 97 - (f.ym ? f.rmse / f.ym : 1) * 200 - (trend === "Falling" ? 5 : 0) - (s.length < 6 ? 10 : 0))));
  return { series: s, f, forecast, growth: f.growth, trend, daily, cover, coverAll, incoming, margin, conf };
}

/* Accuracy check: hide the latest month, forecast it from the months before, compare with what really sold. */
export function backtest(d, cfg = configOf(d)) {
  return d.products.filter((p) => salesOf(d, p.id).length >= 4).map((p) => {
    const s = salesOf(d, p.id), forecast = forecastFrom(s.slice(0, -1), cfg).forecast, actual = s[s.length - 1];
    const diff = forecast - actual, err = actual ? Math.abs(diff) / actual : 0;
    return { p, forecast, actual, diff, err, verdict: err <= 0.1 ? "Accurate" : err <= 0.2 ? "Close" : "Off" };
  });
}

/* Rolling accuracy over every month that has 3+ months before it: forecast that month from the months before,
   compare with what really sold. Also scores a simple "average of the last 3 months" guess as the baseline.
   Error = average |forecast − actual| ÷ actual, skipping months with 0 sales. */
export function backtestMulti(d, cfg = configOf(d)) {
  const pts = [];
  d.products.forEach((p) => {
    const s = salesOf(d, p.id);
    for (let k = 3; k < s.length; k++) {
      if (!s[k]) continue;
      const hist = s.slice(0, k), f = forecastFrom(hist, cfg).forecast, base = Math.round((hist[k - 1] + hist[k - 2] + hist[k - 3]) / 3);
      pts.push({ pid: p.id, k, actual: s[k], f, base });
    }
  });
  const err = (key) => (pts.length ? pts.reduce((a, x) => a + Math.abs(x[key] - x.actual) / x.actual, 0) / pts.length : 0);
  return { error: err("f"), baseline: err("base"), tests: pts.length, months: Math.max(0, d.settings.salesMonths.length - 3) };
}

/* Backtest error for each allowed blend of weighted average vs trend line (current other settings kept). */
export function blendErrors(d, cfg = configOf(d)) {
  const out = {};
  for (let w = 0.2; w <= 0.801; w += 0.1) { const k = round2(w); out[k] = round2(backtestMulti(d, { ...cfg, wmaWeight: k, trendWeight: round2(1 - k) }).error * 100); }
  return out;
}

/* Derived numbers about the shop's sales: what Gemini sees instead of the raw records. */
export function salesStats(d) {
  const per = d.products.map((p) => {
    const s = salesOf(d, p.id);
    if (s.length < 3) return null;
    const avg = s.reduce((a, b) => a + b, 0) / s.length, f = forecastFrom(s);
    const cv = avg ? Math.sqrt(s.reduce((a, x) => a + (x - avg) ** 2, 0) / s.length) / avg : 0;
    const first3 = (s[0] + s[1] + s[2]) / 3, jump = first3 ? s[s.length - 1] / first3 : 1;
    return { product: p.short || p.name, avgMonthly: Math.round(avg), variability: round2(cv), trendPerMonth: round2(f.trendPct), lastVsEarlier: round2(jump), margin: round2(p.sell > 0 ? (p.sell - p.cost) / p.sell : 0) };
  }).filter(Boolean);
  const mean = (k) => (per.length ? round2(per.reduce((a, x) => a + x[k], 0) / per.length) : 0);
  return {
    businessType: d.settings.businessType || "clothing", monthsOfHistory: d.settings.salesMonths.length, products: per.length,
    averageVariability: mean("variability"), averageTrendPerMonth: mean("trendPerMonth"), productsWithSuddenJump: per.filter((x) => x.lastVsEarlier >= 1.6).length,
    backtestErrorPercentByWmaWeight: blendErrors(d), perProduct: per,
  };
}
const round2 = (x) => Math.round(x * 100) / 100;

function reasonsFor(d, p, g, plan) {
  const ENGINE = configOf(d), s = g.series, m = Math.round(g.margin * 100), first = d.settings.salesMonths[0];
  const demand = g.growth > 0.1 ? `Demand up ${pct(g.growth)} since ${first} (${s[0]} → ${s[s.length - 1]} a month)`
    : g.growth < -0.1 ? `Demand down ${pct(-g.growth)} since ${first} (${s[0]} → ${s[s.length - 1]} a month)`
    : `Demand steady at about ${Math.round(s.reduce((a, b) => a + b, 0) / s.length)} a month`;
  const stock = p.stock === 0 ? "Out of stock now, so every sale this week is lost"
    : g.cover < 14 ? `Stock lasts only ${daysText(g.cover)}` : `Stock lasts ${daysText(g.cover)}`;
  const margin = g.margin >= 0.5 ? `High margin: ${m}% (${rm2(p.sell - p.cost)} per piece)`
    : g.margin < ENGINE.lowMargin ? `Thin margin: ${m}%, only ${rm2(p.sell - p.cost)} per piece` : `Healthy margin: ${m}%`;
  const r = [];
  if (plan.decision === "BUY") {
    r.push(stock, demand, margin);
    if (g.incoming > 0) r.push(`${g.incoming} already on order, counted`);
    if (g.trend === "Falling") r.push(`Buying cautiously (${pct(ENGINE.cautious)} of forecast) because demand is falling`);
  } else {
    if (plan.kind === "overstock") r.push(`Stock lasts ${daysText(g.coverAll)}${g.incoming ? " including stock on order" : ""}`, `${rm(p.stock * p.cost)} of cash already sitting in this item`, demand);
    if (plan.kind === "margin") r.push(margin, demand, stock);
    if (plan.kind === "falling") r.push(demand, stock, "More stock would add holding cost while demand drops");
    if (plan.kind === "enough") r.push(stock, demand, g.incoming ? `${g.incoming} already on order cover the next month` : "Stock covers the forecast plus safety stock");
    if (plan.kind === "loss") r.push(`Would not sell enough within ${Math.round(30 * ENGINE.sellWindow)} days to make a profit`, demand, stock);
    if (plan.kind !== "margin" && g.margin < ENGINE.lowMargin) r.push(margin);
  }
  return [...new Set(r)].slice(0, 4);
}

/* budget may be Infinity: the "ideal plan" that shows how much money everything needs. */
export function analyse(d, budget) {
  const ENGINE = configOf(d), skipped = [];
  const items = d.products.map((p) => {
    const g = signals(d, p);
    if (!g) { skipped.push(p.name); return null; }
    const safety = Math.max(p.min, Math.ceil(g.forecast * ENGINE.safetyPct));
    const demandPlan = g.trend === "Falling" ? Math.round(g.forecast * ENGINE.cautious) : g.forecast;
    const need = Math.max(0, demandPlan + safety - p.stock - g.incoming);
    const sellable = Math.max(0, Math.round(g.forecast * ENGINE.sellWindow) - p.stock - g.incoming);
    let kind = "";
    if (g.coverAll >= ENGINE.overstockDays) kind = "overstock";
    else if (g.margin < ENGINE.lowMargin) kind = "margin";
    else if (g.trend === "Falling" && p.stock >= p.min) kind = "falling";
    else if (need === 0) kind = "enough";
    else if (Math.min(need, sellable) * p.sell - need * p.cost <= 0) kind = "loss";
    const decision = kind ? "DO_NOT_BUY" : "BUY";
    let score = g.cover < 7 ? 40 : g.cover < 14 ? 30 : g.cover < 30 ? 15 : 5;
    if (p.stock < p.min) score += 10;
    if (p.stock === 0) score += 10;
    score += g.trend === "Rising" ? 10 + Math.min(15, g.growth * 15) : g.trend === "Falling" ? -10 : 0;
    score += g.margin * 30 + (g.conf - 50) / 5;
    return {
      pid: p.id, name: p.name, short: p.short || p.name, sku: p.sku, cat: catName(d, p.cat), stock: p.stock, min: p.min,
      unitCost: p.cost, sell: p.sell, supplier: p.sup ? supName(d, p.sup) : "", g, safety, demandPlan, need, sellable, decision, kind,
      score: Math.round(score), reasons: reasonsFor(d, p, g, { decision, kind }), status: decision === "BUY" ? "FULL" : "SKIP",
      qty: 0, include: false, cost: 0, revenue: 0, profit: 0, roi: 0,
    };
  }).filter(Boolean);

  /* Fill the budget by priority. A partial buy must still cover at least a quarter of the need. */
  let left = budget;
  items.filter((i) => i.decision === "BUY").sort((a, b) => b.score - a.score).forEach((i) => {
    const afford = Math.floor(left / i.unitCost);
    if (afford >= i.need) { i.qty = i.need; i.status = "FULL"; }
    else if (afford >= Math.max(5, Math.ceil(i.need * 0.25))) { i.qty = afford; i.status = "PARTIAL"; }
    else { i.qty = i.need; i.status = "WAIT"; }
    i.include = i.status !== "WAIT";
    if (i.include) left -= i.qty * i.unitCost;
    if (i.status === "PARTIAL") i.reasons = [...i.reasons.slice(0, 3), `Budget covers ${i.qty} of the ${i.need} needed`];
    if (i.status === "WAIT") i.reasons = [...i.reasons.slice(0, 3), "Wait: the budget went to more urgent items first"];
  });
  items.forEach(priceItem);
  const rank = { FULL: 0, PARTIAL: 1, WAIT: 2, SKIP: 3 };
  items.sort((a, b) => rank[a.status] - rank[b.status] || b.score - a.score);
  const r = { budget, ideal: !isFinite(budget), items, skipped, at: nowStamp() };
  return totals(r);
}

export function priceItem(i) {
  const q = i.decision === "BUY" ? i.qty : 0;
  const sold = Math.min(q, i.sellable);
  i.cost = q * i.unitCost;
  i.revenue = sold * i.sell;
  i.profit = Math.max(0, i.revenue - i.cost);
  i.roi = i.cost ? i.profit / i.cost : 0;
}

export const inPlan = (i) => i.decision === "BUY" && i.include && i.qty > 0;

export function totals(r) {
  const buy = r.items.filter(inPlan);
  const cost = buy.reduce((s, i) => s + i.cost, 0);
  const profit = buy.reduce((s, i) => s + i.profit, 0);
  r.t = {
    cost, profit, revenue: buy.reduce((s, i) => s + i.revenue, 0), roi: cost ? profit / cost : 0, left: r.budget - cost, buy,
    skip: r.items.filter((i) => i.decision === "DO_NOT_BUY"), wait: r.items.filter((i) => i.decision === "BUY" && !inPlan(i)),
  };
  r.summary = shortSummary(r);
  return r;
}

/* Lets a person change a quantity or add/remove an item, then re-prices the plan. */
export function setItemQty(r, pid, qty) {
  const i = r.items.find((x) => x.pid === pid);
  if (!i) return r;
  i.qty = Math.max(0, Math.floor(qty) || 0);
  i.include = i.qty > 0;
  priceItem(i);
  return totals(r);
}
export function setItemIncluded(r, pid, on) {
  const i = r.items.find((x) => x.pid === pid);
  if (!i) return r;
  i.include = on;
  if (on && !i.qty) i.qty = i.need;
  priceItem(i);
  return totals(r);
}

/* A plan for `budget` with a person's quantity changes applied: { pid: { qty, include } }. */
export function planWith(d, budget, overrides = {}) {
  const r = analyse(d, budget);
  r.items.forEach((i) => {
    const o = overrides[i.pid];
    if (!o || i.decision !== "BUY") return;
    i.qty = Math.max(0, Math.floor(+o.qty) || 0);
    i.include = !!o.include && i.qty > 0;
    priceItem(i);
  });
  return totals(r);
}
export const overridesOf = (r) => Object.fromEntries(r.items.filter((i) => i.decision === "BUY").map((i) => [i.pid, { qty: i.qty, include: i.include }]));

/* Plain-text summary with **bold** markers. This is also the fallback when Gemini is unavailable. */
export function shortSummary(r) {
  const t = r.t;
  if (!t.buy.length) return `StockNow recommends **not buying anything right now**. ${t.skip.length ? `${list(t.skip.map((i) => i.short))} have enough stock or weak demand.` : ""} Keep the cash.`;
  const urgent = t.buy.filter((i) => i.g.cover < 7).map((i) => i.short);
  const parts = r.ideal
    ? [`To cover everything recommended, buy **${plural(t.buy.length, "product")} for ${rm(t.cost)}**. Expected profit **${rm(t.profit)}** (ROI **${pct(t.roi)}**).`]
    : [`With ${rm(r.budget)}, buy **${plural(t.buy.length, "product")} for ${rm(t.cost)}**. Expected profit **${rm(t.profit)}** (ROI **${pct(t.roi)}**).`];
  if (urgent.length) parts.push(`${list(urgent)} run${urgent.length > 1 ? "" : "s"} out within a week.`);
  if (t.skip.length) parts.push(`Skip ${list(t.skip.map((i) => i.short))}.`);
  if (t.wait.length) parts.push(`${list(t.wait.map((i) => i.short))} wait${t.wait.length > 1 ? "" : "s"} for more budget.`);
  return parts.join(" ");
}

/* Plain-language findings for the AI page, one icon per line. */
export function summaryBullets(d, r) {
  const t = r.t, b = [], left = budgetLeft(d);
  if (r.ideal) b.push({ ic: "coins", tone: "ai", h: `Buying everything recommended costs **${rm(t.cost)}**. Budget left this month is ${rm(left)}${t.cost > left ? `, so you're **${rm(t.cost - left)} short**` : ", so it fits"}.` });
  else b.push({ ic: "wallet", tone: "ai", h: `Spend **${rm(t.cost)}** of ${rm(r.budget)} (${pct(r.budget ? t.cost / r.budget : 0)}) on ${plural(t.buy.length, "product")}.` });
  if (t.buy.length) b.push({ ic: "up", tone: "green", h: `Expected profit **${rm(t.profit)}**: about **${rm2(1 + t.roi)}** comes back for every RM 1 spent.` });
  const urgent = t.buy.filter((i) => i.g.cover < 7).map((i) => i.short);
  if (urgent.length) b.push({ ic: "warning", tone: "red", h: `**Urgent:** ${list(urgent)} run${urgent.length > 1 ? "" : "s"} out within a week. Order these first.` });
  if (t.skip.length) b.push({ ic: "ban", tone: "grey", h: `**Don't buy** ${list(t.skip.map((i) => i.short))}: enough stock, falling demand or thin margin. ${rm(t.skip.reduce((s, i) => s + i.stock * i.unitCost, 0))} is already sitting in them.` });
  if (t.wait.length) b.push({ ic: "pause", tone: "amber", h: `**Waiting:** ${list(t.wait.map((i) => i.short))}. About ${rm(t.wait.reduce((s, i) => s + i.need * i.unitCost, 0))} more would cover ${t.wait.length > 1 ? "them" : "it"}.` });
  if (!r.ideal && t.left > 0) b.push({ ic: "coins", tone: "blue", h: `${rm(t.left)} stays unspent.` });
  return b;
}

/* Consistency checks shown on every plan; exceptions are handed to a person. */
export function checks(d, r) {
  const t = r.t, ok = [], warn = [];
  if (!r.ideal && t.cost <= r.budget) ok.push("Within budget");
  const inc = r.items.reduce((s, i) => s + (i.g.incoming || 0), 0);
  if (inc) ok.push(`${inc} units already on order counted`);
  ok.push("No stock goes below zero");
  ok.push(`${d.settings.salesMonths.length} months of sales used`);
  (r.skipped || []).forEach((n) => warn.push(`${n}: no sales history yet, your call`));
  t.buy.filter((i) => i.g.trend === "Falling").forEach((i) => warn.push(`${i.short}: demand falling, bought cautiously`));
  t.buy.filter((i) => !i.supplier).forEach((i) => warn.push(`${i.short}: no supplier set`));
  return { ok, warn, over: !r.ideal && t.cost > r.budget };
}

/* Why sending is blocked, if it is. Shared by the plan screen and the server. */
export function sendBlock(d, r) {
  const left = budgetLeft(d);
  if (r.ideal && r.t.cost > left) return `This ideal plan needs ${rm(r.t.cost)} but only ${rm(left)} is left. Turn off No limit to send, or raise the monthly budget.`;
  if (!r.ideal && r.t.cost > r.budget) return `${rm(r.t.cost - r.budget)} over budget. Lower a quantity to send.`;
  if (!r.t.buy.length) return "Nothing to buy in this plan.";
  return "";
}


/* Read-only audit trail for the existing accuracy metrics. Never fits on a held-out month. */

export function explainAccuracy(d, cfg = configOf(d)) {
  const monthLabels = (series) => d.settings.salesMonths.slice(-series.length);
  const point = (p, series, k) => {
    const history = series.slice(0, k);
    const model = forecastFrom(history, cfg);
    const actual = series[k], forecast = model.forecast;
    const baseline = Math.round(history.slice(-3).reduce((a, b) => a + b, 0) / 3);
    const labels = monthLabels(series);
    return {
      pid: p.id, name: p.name, short: p.short || p.name, testIndex: k,
      month: labels[k] ?? "", historyMonths: labels.slice(0, k), history,
      model, actual, forecast, diff: forecast - actual,
      error: actual ? Math.abs(forecast - actual) / actual : 0,
      baseline, baselineDiff: baseline - actual,
      baselineError: actual ? Math.abs(baseline - actual) / actual : 0,
      zeroActual: actual === 0,
    };
  };
  const latestRows = backtest(d, cfg).map((row) => {
    const series = salesOf(d, row.p.id);
    return { ...point(row.p, series, series.length - 1), verdict: row.verdict };
  });
  const rollingRows = [], excludedZero = [], insufficient = [];
  for (const p of d.products) {
    const series = salesOf(d, p.id);
    if (series.length < 4) {
      insufficient.push({ pid: p.id, name: p.name, months: series.length });
      continue;
    }
    for (let k = 3; k < series.length; k++) {
      const row = point(p, series, k);
      if (!series[k]) excludedZero.push(row);
      else rollingRows.push(row);
    }
  }
  const byError = [...latestRows].sort((a, b) => a.error - b.error);
  return {
    config: { ...cfg },
    latest: {
      rows: latestRows,
      error: latestRows.length ? latestRows.reduce((sum, row) => sum + row.error, 0) / latestRows.length : null,
      within: latestRows.filter((row) => row.error <= 0.15).length,
      best: byError[0] ?? null,
      worst: [...latestRows].sort((a, b) => b.error - a.error)[0] ?? null,
      under: latestRows.filter((row) => row.diff < 0 && row.error > 0.1),
      off: latestRows.filter((row) => row.verdict === "Off"),
    },
    rolling: { ...backtestMulti(d, cfg), rows: rollingRows, excludedZero },
    insufficient,
  };
}
