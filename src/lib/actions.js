/* ============================================================================
   ACTIONS: every change to the shop goes through applyAction(). The server runs it
   against the database; in offline mode the browser runs the same code on its local
   copy and replays the queue when the connection is back.
   ============================================================================ */
import {
  ORBYTE_USER, PAYMENT_REASON, UNDO_PREFIX, backtestMulti, budgetLeft, inPlan, isReversal, lateDays, liveTx, nameOfP, openPOs, planWith, poOf, productOf,
  reqOf, reversalOf, routeTo, sendBlock, signals, supName, supOf, userOf,
} from "./engine.js";
import { addDays, daysText, digits, fmtAt, list, nextSeq, nowStamp, plural, rm, today, uid } from "./format.js";
import { SCENARIOS, buildData } from "./seed.js";
import { BUSINESS_TYPES, configOf, validateConfig } from "./forecast.js";

export const PERMS = {
  manageCatalog: ["OWNER", "MANAGER"],
  manageSuppliers: ["OWNER", "MANAGER"],
  setBudget: ["OWNER"],
  forecastSettings: ["OWNER", "MANAGER"],
  approveAI: ["OWNER", "MANAGER"],
  manageAccess: ["OWNER"],
};
export const ROLE_LABEL = { OWNER: "Owner", MANAGER: "Manager", STAFF: "Staff", SYSTEM: "Automation" };
export const can = (role, perm) => !!role && (PERMS[perm] || ["OWNER", "MANAGER", "STAFF"]).includes(role);

export const STOCK_OUT_REASONS = ["Sold in store", "Online order", "Returned to supplier", "Other"];

/* A rejected action: `message` is shown as a toast, `fields` marks form inputs. */
export class ActionError extends Error {
  constructor(message, fields = null) {
    super(message);
    this.fields = fields;
  }
}
const fail = (message, fields) => { throw new ActionError(message, fields); };
const fieldFail = (fields) => fail(Object.values(fields)[0], fields);

/* Actions allowed while offline (simulated outage): only recording stock. */
export const OFFLINE_ACTIONS = new Set(["stockIn", "stockOut", "catchUp"]);

function ctx(d, actorId, opts) {
  const me = d.people.find((u) => u.id === actorId && u.role);
  if (!me) fail("Choose a demo account with StockNow access.");
  const at = opts.at || nowStamp();
  const log = (action, text, by = me.id) => d.logs.unshift({ id: uid("l"), at, by, action, text, seq: nextSeq() });
  const need = (perm, msg) => { if (!can(me.role, perm)) fail(msg); };
  return { me, at, log, need, offline: !!opts.offline };
}

function recordTx(d, c, { pid, type, qty, sup = "", reason = "", poId = null }) {
  const p = productOf(d, pid);
  if (!p) fail("Choose a product.");
  if (!(qty > 0)) fail("Quantity must be more than 0.");
  if (type === "STOCK_OUT" && qty > p.stock) fail(`Rejected: ${p.name} has only ${p.stock} in stock, so ${qty} cannot go out.`);
  const before = p.stock;
  p.stock = type === "STOCK_IN" ? before + qty : before - qty;
  d.tx.unshift({ id: uid("t"), at: c.at, pid, type, qty, before, after: p.stock, sup, reason, poId, by: c.me.id, pending: c.offline, seq: nextSeq() });
  return p;
}

/* Why a stock movement can't be undone by this person, or "" if it can. Shared by the screen and the server. */
export function undoBlock(d, me, t) {
  if (!t || isReversal(t)) return "This entry can't be undone.";
  if (reversalOf(d, t)) return "This entry was already undone.";
  if (t.pending) return "This entry is waiting to sync. Undo it when StockNow is back online.";
  if (t.by === ORBYTE_USER.id) return "Orbyte payments are reversed by a refund in Orbyte, not by Undo.";
  if (me.role === "STAFF" && (t.by !== me.id || !t.at.startsWith(today()))) return "Staff can undo only their own entries from today. Ask the Owner or a Manager.";
  const p = productOf(d, t.pid);
  if (!p) return "This product was deleted, so the entry can't be undone.";
  if (t.type === "STOCK_IN" && p.stock < t.qty) return `Only ${p.stock} ${p.short || p.name} left, so ${t.qty} can't be taken back out. Some were already sold.`;
  return "";
}

/* Adds the opposite movement. A received supplier order goes back to "still due". */
function reverseTx(d, c, t) {
  const p = recordTx(d, c, { pid: t.pid, type: t.type === "STOCK_IN" ? "STOCK_OUT" : "STOCK_IN", qty: t.qty, sup: t.sup, reason: UNDO_PREFIX + t.id });
  const po = t.poId ? poOf(d, t.poId) : null;
  const line = po?.items.find((i) => i.pid === t.pid);
  if (line) {
    line.received = Math.max(0, line.received - t.qty);
    po.status = po.items.every((i) => i.received >= i.qty) ? "RECEIVED" : po.items.some((i) => i.received > 0) ? "PARTIAL" : "ORDERED";
  }
  return { p, po };
}

/* Automatic trigger: a stock out that leaves under 7 days of stock raises an alert and feeds the AI plan. */
function lowCoverTrigger(d, c, p, cause = "a stock out") {
  const g = signals(d, p);
  if (!g || g.coverAll >= 7 || d.alerts.some((a) => a.open && a.type === "LOW" && a.pid === p.id)) return false;
  d.alerts.unshift({ id: uid("a"), at: c.at, type: "LOW", pid: p.id, poId: null, open: true, seq: nextSeq() });
  c.log("AUTO_ALERT", `${p.name} now ${p.stock === 0 ? "is out of stock" : `lasts about ${daysText(g.cover)}`} (triggered by ${cause}). Added to the AI plan.`, "sys");
  return true;
}

const handlers = {
  /* --- Stock in / out --- */
  stockIn(d, c, { pid, qty, kind, sup }) {
    const err = {}, n = +qty, ret = kind === "return";
    if (!productOf(d, pid)) err.pid = "Choose a product.";
    if (!(n > 0)) err.qty = "Quantity must be more than 0.";
    if (!ret && !supOf(d, sup)) err.sup = "Choose a supplier.";
    if (Object.keys(err).length) fieldFail(err);
    const p = ret ? recordTx(d, c, { pid, type: "STOCK_IN", qty: n, reason: "Customer return" }) : recordTx(d, c, { pid, type: "STOCK_IN", qty: n, sup });
    if (ret) c.log("STOCK_IN", `Customer return: ${n} × ${p.name}. Stock now ${p.stock}. Sales today reduced by ${rm(n * p.sell)}.`);
    else c.log("STOCK_IN", `Stock in ${n} × ${p.name} from ${supName(d, sup)} for ${rm(n * p.cost)}. Stock now ${p.stock}.`);
    return { toast: ret ? `Return saved: ${p.name} is now ${p.stock}. Sales today minus ${rm(n * p.sell)}.` : `Stock in saved: ${p.name} is now ${p.stock}. Budget left ${rm(budgetLeft(d))}.` };
  },

  stockOut(d, c, { pid, qty, reason }) {
    const err = {}, n = +qty, p = productOf(d, pid);
    if (!p) err.pid = "Choose a product.";
    if (!(n > 0)) err.qty = "Quantity must be more than 0.";
    else if (p && n > p.stock) err.qty = `Rejected: current stock is ${p.stock}, so ${n} cannot go out.`;
    if (!STOCK_OUT_REASONS.includes(reason)) err.reason = "Choose a reason.";
    if (Object.keys(err).length) fieldFail(err);
    recordTx(d, c, { pid, type: "STOCK_OUT", qty: n, reason });
    c.log("STOCK_OUT", `Stock out ${n} × ${p.name} (${reason}). Stock now ${p.stock}.`);
    const alerted = lowCoverTrigger(d, c, p);
    const refund = reason === "Returned to supplier" ? ` ${rm(n * p.cost)} back to the budget.` : "";
    return { toast: alerted ? `Saved. ${p.name} is running low, so StockNow added it to the AI plan.${refund}` : `Stock out saved: ${p.name} is now ${p.stock}.${refund}` };
  },

  undoTx(d, c, { txId }) {
    const t = d.tx.find((x) => x.id === txId);
    const block = undoBlock(d, c.me, t);
    if (block) fail(block);
    const { p, po } = reverseTx(d, c, t);
    const what = t.type === "STOCK_IN" ? "stock in" : "stock out";
    c.log("UNDO", `Undid ${what} of ${t.qty} × ${p.name} from ${fmtAt(t.at)} by ${userOf(d, t.by).name}.${po ? ` ${po.code} has ${t.qty} due again.` : ""} Stock now ${p.stock}.`);
    if (t.type === "STOCK_IN") lowCoverTrigger(d, c, p, "an undo");
    return { toast: `Undone: ${p.name} is back to ${p.stock}.` };
  },

  receivePO(d, c, { poId, lines = {} }) {
    const po = poOf(d, poId);
    if (!po || po.status === "RECEIVED") fail("This order is already complete.");
    const rows = po.items.map((it) => ({ it, q: lines[it.pid] !== undefined && lines[it.pid] !== "" ? +lines[it.pid] || 0 : it.qty - it.received }));
    const over = rows.find((l) => l.q > l.it.qty - l.it.received);
    if (over) fail(`${nameOfP(d, over.it.pid)}: only ${over.it.qty - over.it.received} are still due.`);
    const real = rows.filter((l) => l.q > 0);
    if (!real.length) fail("Enter the quantity that arrived.");
    real.forEach((l) => { recordTx(d, c, { pid: l.it.pid, type: "STOCK_IN", qty: l.q, sup: po.sup, poId }); l.it.received += l.q; });
    po.status = po.items.every((i) => i.received >= i.qty) ? "RECEIVED" : "PARTIAL";
    if (po.status === "RECEIVED") d.alerts.forEach((a) => { if (a.poId === po.id) a.open = false; });
    const still = po.items.filter((i) => i.received < i.qty);
    c.log("STOCK_IN", `Received ${po.code} from ${supName(d, po.sup)}: ${real.map((l) => `${l.q} × ${nameOfP(d, l.it.pid)}`).join(", ")}.${still.length ? ` Still due: ${still.map((i) => `${i.qty - i.received} × ${nameOfP(d, i.pid)}`).join(", ")}.` : " Order complete."}`);
    return { toast: po.status === "RECEIVED" ? `${po.code} fully received. Stock updated.` : `${po.code} partly received. The rest stays on order.` };
  },

  /* --- Orbyte Payment (demo): the live product receives these from Orbyte at /api/orbyte/payment --- */
  simulatePayment(d, c, { sku, qty, channel }) {
    const paymentId = "SIM-" + uid("").toUpperCase().slice(0, 6);
    return applyPaymentEvent(d, { event: "payment.succeeded", paymentId, channel, items: [{ sku, qty: Number(qty) }] }, { simulatedBy: c.me.name });
  },

  simulateRefund(d, c, { paymentId }) {
    return applyPaymentEvent(d, { event: "payment.refunded", paymentId }, { simulatedBy: c.me.name });
  },

  /* A person has checked a payment StockNow could not match. */
  resolvePayment(d, c, { alertId, note = "" }) {
    c.need("approveAI", "Only the Owner or a Manager can close a payment check.");
    const a = d.alerts.find((x) => x.id === alertId && x.type === "PAYMENT");
    if (!a || !a.open) fail("This payment check is already closed.");
    const why = String(note).trim();
    if (!why) fieldFail({ note: "Write what you found, e.g. \"Counted 3 on the shelf, recorded by hand\"." });
    a.open = false;
    c.log("ORBYTE_CHECKED", `Closed the check on Orbyte Payment ${a.poId}: ${why.slice(0, 300)}`);
    return { toast: `Payment ${a.poId} marked as checked` };
  },

  /* --- AI plan --- */
  logAnalysis(d, c, { text }) {
    c.log("AI_ANALYSIS", String(text || "AI analysed the shop.").slice(0, 400));
    return {};
  },

  /* The server re-runs the analysis and applies the person's quantity changes, so the numbers
     an approver sees can't be edited on the way. */
  sendProposal(d, c, { budget, overrides = {}, note = "", summary = "" }) {
    const b = budget === null || budget === "ideal" ? Infinity : +budget;
    if (!(b >= 100)) fail("Enter a budget of at least RM 100.");
    const r = planWith(d, b, overrides);
    const block = sendBlock(d, r);
    if (block) fail(block);
    const code = "PR-" + (1022 + d.requests.length);
    const sentTo = routeTo(d).map((u) => u.id);
    const req = {
      id: uid("r"), code, by: c.me.id, at: c.at, budget: r.budget, note: String(note).slice(0, 500), status: "PENDING",
      decidedBy: null, decidedAt: null, decisionNote: "", poIds: [], sentTo, summary: String(summary || r.summary).slice(0, 1200),
      items: r.items.map((i) => ({
        pid: i.pid, name: i.name, decision: inPlan(i) ? "BUY" : "DO_NOT_BUY", qty: inPlan(i) ? i.qty : 0,
        cost: inPlan(i) ? i.cost : 0, profit: inPlan(i) ? i.profit : 0, roi: inPlan(i) ? i.roi : 0, conf: i.g.conf, reasons: i.reasons, status: "PENDING",
      })),
      result: r, seq: nextSeq(),
    };
    d.requests.unshift(req);
    const names = list(sentTo.map((id) => userOf(d, id).name));
    c.log("AI_SENT", `Sent ${code} (budget ${isFinite(r.budget) ? rm(r.budget) : "no limit"}, ${plural(r.t.buy.length, "item")}, ${rm(r.t.cost)}) to ${names} for approval.`);
    const ids = new Set(r.t.buy.map((i) => i.pid));
    d.alerts.forEach((a) => { if (a.type === "PLAN" || (a.type === "LOW" && ids.has(a.pid))) a.open = false; });
    return { toast: `${code} sent to ${names} for approval`, requestId: req.id };
  },

  /* --- Approvals --- */
  decide(d, c, { reqId, decisions = {}, note = "" }) {
    c.need("approveAI", "Only the Owner or a Manager can approve.");
    const req = reqOf(d, reqId);
    if (!req || req.status !== "PENDING") fail("This plan was already decided.");
    const buys = req.items.filter((i) => i.decision === "BUY");
    const ok = buys.filter((i) => (decisions[i.pid] || "APPROVED") === "APPROVED"), no = buys.filter((i) => decisions[i.pid] === "REJECTED");
    const why = String(note).trim();
    if (no.length && !why) fail("Add a reason for the rejected items.", { note: "A reason is required so staff know what to change." });
    return finalize(d, c, req, ok, no, why);
  },

  rejectAll(d, c, { reqId, note = "" }) {
    c.need("approveAI", "Only the Owner or a Manager can reject.");
    const req = reqOf(d, reqId);
    if (!req || req.status !== "PENDING") fail("This plan was already decided.");
    const why = String(note).trim();
    if (!why) fieldFail({ note: "A reason is required so staff know what to change." });
    return finalize(d, c, req, [], req.items.filter((i) => i.decision === "BUY"), why);
  },

  /* --- Supplier messages: AI writes, a person sends --- */
  markSent(d, c, { poId, kind }) {
    const po = poOf(d, poId);
    if (!po) fail("Order not found.");
    const items = po.items.map((i) => `${i.qty} × ${nameOfP(d, i.pid)}`).join(", ");
    if (kind === "order") { po.sentAt = c.at; c.log("PO_SENT", `Sent ${po.code} to ${supName(d, po.sup)} on WhatsApp (${items}).`); }
    else { po.chasedAt = c.at; c.log("SUPPLIER_CHASED", `Reminded ${supName(d, po.sup)} about ${po.code}, ${lateDays(po)} days late.`); }
    return { toast: kind === "order" ? `${po.code} marked as sent to ${supName(d, po.sup)}` : `Reminder to ${supName(d, po.sup)} recorded` };
  },

  /* --- Catalog --- */
  saveProduct(d, c, f) {
    c.need("manageCatalog", "Staff can view products only.");
    const err = {}, edit = f.id ? productOf(d, f.id) : null;
    const name = String(f.name || "").trim(), sku = String(f.sku || "").trim().toUpperCase(), cost = parseFloat(f.cost), sell = parseFloat(f.sell);
    if (f.id && !edit) fail("Product not found.");
    if (!name) err.name = "Product name is required.";
    if (!sku) err.sku = "SKU is required.";
    else if (d.products.some((p) => p.sku === sku && p !== edit)) err.sku = "Another product already uses this SKU.";
    if (!(cost > 0)) err.cost = "Cost price must be more than 0.";
    if (!(sell > 0)) err.sell = "Selling price must be more than 0.";
    else if (cost > 0 && sell < cost) err.sell = "Selling price is below cost, so every sale loses money.";
    if (!d.categories.some((x) => x.id === f.cat)) err.cat = "Choose a category.";
    if (Object.keys(err).length) fieldFail(err);
    const row = { name, sku, cat: f.cat, cost, sell, min: +digits(f.min) || 0, sup: supOf(d, f.sup) ? f.sup : "" };
    if (edit) { Object.assign(edit, row); c.log("PRODUCT_UPDATED", `Updated product ${name} (${sku}).`); }
    else {
      const id = uid("p");
      d.products.push({ ...row, id, short: name, stock: 0, seq: nextSeq() });
      d.sales.push({ id, series: [], seq: nextSeq() });
      c.log("PRODUCT_CREATED", `Created product ${name} (${sku}).`);
    }
    return { toast: edit ? "Product updated" : "Product created. Add stock through Stock In." };
  },

  deleteProduct(d, c, { id }) {
    c.need("manageCatalog", "Staff can view products only.");
    const p = productOf(d, id);
    if (!p) fail("Product not found.");
    if (openPOs(d).some((po) => po.items.some((i) => i.pid === id && i.received < i.qty))) fail(`${p.name} is on an open order and cannot be deleted.`);
    d.products.splice(d.products.indexOf(p), 1);
    c.log("PRODUCT_DELETED", `Deleted product ${p.name} (${p.sku}).`);
    return { toast: "Product deleted" };
  },

  saveCategory(d, c, { id, name }) {
    c.need("manageCatalog", "Staff can view categories only.");
    const n = String(name || "").trim(), edit = id ? d.categories.find((x) => x.id === id) : null;
    if (!n) fieldFail({ name: "Category name is required." });
    if (d.categories.some((x) => x.name.toLowerCase() === n.toLowerCase() && x !== edit)) fieldFail({ name: "This category already exists." });
    if (edit) { const old = edit.name; edit.name = n; c.log("CATEGORY_UPDATED", `Renamed category ${old} to ${n}.`); }
    else { d.categories.push({ id: uid("c"), name: n, seq: nextSeq() }); c.log("CATEGORY_CREATED", `Created category ${n}.`); }
    return { toast: "Category saved" };
  },

  deleteCategory(d, c, { id }) {
    c.need("manageCatalog", "Staff can view categories only.");
    const cat = d.categories.find((x) => x.id === id);
    if (!cat) fail("Category not found.");
    const used = d.products.filter((p) => p.cat === id).length;
    if (used) fail(`${cat.name} is used by ${plural(used, "product")}. Move them first.`);
    d.categories.splice(d.categories.indexOf(cat), 1);
    c.log("CATEGORY_DELETED", `Deleted category ${cat.name}.`);
    return { toast: "Category deleted" };
  },

  saveSupplier(d, c, f) {
    c.need("manageSuppliers", "Only the Owner or a Manager can change suppliers.");
    const err = {}, edit = f.id ? supOf(d, f.id) : null, lead = +f.leadDays, name = String(f.name || "").trim();
    if (!name) err.name = "Supplier name is required.";
    else if (d.suppliers.some((s) => s.name.toLowerCase() === name.toLowerCase() && s !== edit)) err.name = "This supplier already exists.";
    if (String(f.phone || "").replace(/\D/g, "").length < 10) err.phone = "Enter a phone number with at least 10 digits.";
    if (!(lead >= 1 && lead <= 90)) err.leadDays = "Enter 1 to 90 days.";
    if (Object.keys(err).length) fieldFail(err);
    const row = { name, contact: String(f.contact || "").trim(), phone: String(f.phone).trim(), leadDays: lead, note: String(f.note || "").trim() };
    if (edit) { Object.assign(edit, row); c.log("SUPPLIER_UPDATED", `Updated supplier ${name}.`); }
    else { d.suppliers.push({ ...row, id: uid("s"), seq: nextSeq() }); c.log("SUPPLIER_CREATED", `Created supplier ${name}.`); }
    return { toast: "Supplier saved" };
  },

  deleteSupplier(d, c, { id }) {
    c.need("manageSuppliers", "Only the Owner or a Manager can change suppliers.");
    const s = supOf(d, id);
    if (!s) fail("Supplier not found.");
    const used = d.products.filter((p) => p.sup === id).length, open = openPOs(d).filter((po) => po.sup === id).length;
    if (used || open) fail(`${s.name} still has ${[used && plural(used, "product"), open && plural(open, "open order")].filter(Boolean).join(" and ")}.`);
    d.suppliers.splice(d.suppliers.indexOf(s), 1);
    c.log("SUPPLIER_DELETED", `Deleted supplier ${s.name}.`);
    return { toast: "Supplier deleted" };
  },

  setMonthlyBudget(d, c, { budget }) {
    c.need("setBudget", "Only the Owner sets the monthly budget.");
    const v = +digits(budget);
    if (!(v >= 100)) fieldFail({ budget: "Enter at least RM 100." });
    const old = d.settings.monthlyBudget;
    d.settings.monthlyBudget = v;
    c.log("SETTINGS_UPDATED", `Monthly purchase budget changed from ${rm(old)} to ${rm(v)}.`);
    return { toast: `Monthly budget set to ${rm(v)}` };
  },

  /* --- Business profile and forecast settings (Owner/Manager). Nothing changes without a person approving. --- */
  setBusinessProfile(d, c, { businessType, businessYears }) {
    c.need("forecastSettings", "Only the Owner or a Manager can change the business profile.");
    if (!BUSINESS_TYPES[businessType]) fieldFail({ businessType: "Choose a business type." });
    const y = businessYears === "" || businessYears === undefined ? null : +businessYears;
    if (y !== null && !(y >= 0 && y <= 100)) fieldFail({ businessYears: "Enter 0 to 100 years." });
    const old = d.settings.businessType;
    d.settings.businessType = businessType;
    d.settings.businessYears = y;
    c.log("SETTINGS_UPDATED", `Business profile: ${BUSINESS_TYPES[businessType].label}${y !== null ? `, ${plural(y, "year")} in business` : ""}.${old !== businessType && !d.settings.forecastConfig ? " Forecast settings follow this type's defaults." : ""}`);
    return { toast: "Business profile saved" };
  },

  /* Approves forecast settings (Gemini's proposal or a person's edit). They are validated and backtested again here. */
  applyForecastConfig(d, c, { values, source = "manual", explanation = "", model = "" }) {
    c.need("forecastSettings", "Only the Owner or a Manager can approve forecast settings.");
    const v = validateConfig(values);
    if (!v.ok) fail(`These settings can't be used: ${v.errors.join(" ")}`);
    const before = backtestMulti(d), next = { ...configOf(d), ...v.values }, after = backtestMulti(d, next);
    d.settings.forecastConfig = {
      values: next, source: source === "ai" ? "ai" : "manual", explanation: String(explanation).slice(0, 600), model: String(model).slice(0, 60),
      approvedBy: c.me.id, at: c.at, backtest: { before: before.error, after: after.error, baseline: after.baseline, tests: after.tests },
    };
    const pc = (x) => `${(x * 100).toFixed(1)}%`;
    c.log("FORECAST_CONFIG", `Approved ${source === "ai" ? `AI-assisted (${model || "Gemini"})` : "manually adjusted"} forecast settings: ${Object.entries(v.values).map(([k, x]) => `${k} ${x}`).join(", ")}. Backtest error ${pc(before.error)} → ${pc(after.error)} (simple average ${pc(after.baseline)}).`);
    return { toast: "Forecast settings approved. New plans use them." };
  },

  resetForecastConfig(d, c) {
    c.need("forecastSettings", "Only the Owner or a Manager can change forecast settings.");
    d.settings.forecastConfig = null;
    c.log("FORECAST_CONFIG", `Forecast settings reset to the ${BUSINESS_TYPES[d.settings.businessType]?.label || "default"} defaults.`);
    return { toast: "Back to the default forecast settings" };
  },

  /* --- Access: people come from Orbyte Directory; the Owner gives StockNow access --- */
  grantAccess(d, c, { pid, role }) {
    c.need("manageAccess", "Only the Owner manages access.");
    const u = d.people.find((x) => x.id === pid);
    if (!u || u.role) fieldFail({ pid: "Choose a person without access." });
    if (role !== "STAFF" && role !== "MANAGER") fieldFail({ role: "Choose Staff or Manager." });
    u.role = role;
    c.log("ACCESS_GRANTED", `Gave ${u.name} StockNow access as ${ROLE_LABEL[role]}.`);
    return { toast: `${u.name} can now sign in as ${ROLE_LABEL[role]}` };
  },

  changeRole(d, c, { id, role }) {
    c.need("manageAccess", "Only the Owner manages access.");
    const u = d.people.find((x) => x.id === id);
    if (!u || !u.role || u.role === "OWNER" || (role !== "STAFF" && role !== "MANAGER")) fail("This role can't be changed.");
    if (u.role === role) return {};
    const old = u.role;
    u.role = role;
    c.log("ACCESS_CHANGED", `Changed ${u.name} from ${ROLE_LABEL[old]} to ${ROLE_LABEL[role]}.`);
    return { toast: `${u.name} is now ${ROLE_LABEL[role]}` };
  },

  removeAccess(d, c, { id }) {
    c.need("manageAccess", "Only the Owner manages access.");
    const u = d.people.find((x) => x.id === id);
    if (!u || !u.role || u.role === "OWNER") fail("The Owner's access can't be removed.");
    const old = u.role;
    u.role = null;
    c.log("ACCESS_REMOVED", `Removed ${u.name}'s StockNow access (was ${ROLE_LABEL[old]}).`);
    return { toast: "Access removed" };
  },

  /* --- Outage plan --- */
  goOffline(d, c) {
    c.log("OUTAGE", "Connection lost (simulated). Working offline on this device.", "sys");
    return {};
  },

  /* Replays stock moves recorded offline, keeping their original time. */
  syncOffline(d, c, { queue = [] }) {
    const results = [];
    queue.forEach((q) => {
      if (!OFFLINE_ACTIONS.has(q.type)) return;
      try { applyAction(d, q.actorId || c.me.id, q.type, q.payload, { at: q.at }); results.push({ ok: true }); }
      catch (e) { results.push({ ok: false, msg: e.message }); }
    });
    const ok = results.filter((r) => r.ok).length, bad = results.length - ok;
    c.log("SYNC", `Back online. Synced ${plural(ok, "change")} made during the outage.${bad ? ` ${bad} could not be applied.` : ""}`, "sys");
    return { toast: `Back online · synced ${plural(ok, "change")}${bad ? `, ${bad} failed` : ""}`, bad: !!bad };
  },

  /* Sales written on paper or WhatsApp while StockNow was down: "SKU qty [reason]" per line. */
  catchUp(d, c, { text }) {
    const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) fail("Type at least one line, e.g. OUT-HDE 3");
    const res = [], ok = [], bad = [], left = {};
    lines.forEach((line) => {
      const m = line.match(/^([A-Za-z0-9-]+)\s+(\d+)\s*(.*)$/);
      const no = (msg) => { res.push({ line, ok: false, msg }); bad.push(line); };
      if (!m) return no("Write it as: SKU quantity [reason]");
      const p = d.products.find((x) => x.sku.toUpperCase() === m[1].toUpperCase());
      if (!p) return no(`Unknown SKU ${m[1].toUpperCase()}`);
      const q = +m[2], avail = left[p.id] ?? p.stock;
      if (!(q > 0)) return no("Quantity must be more than 0");
      if (q > avail) return no(`Only ${avail} ${p.short} in stock`);
      left[p.id] = avail - q;
      const reason = /online/i.test(m[3]) ? "Online order" : /damag|rosak|return/i.test(m[3]) ? "Returned to supplier" : "Sold in store";
      ok.push({ p, q, reason });
      res.push({ line, ok: true, msg: `${q} × ${p.name} · ${reason}` });
    });
    ok.forEach((o) => recordTx(d, c, { pid: o.p.id, type: "STOCK_OUT", qty: o.q, reason: o.reason }));
    if (ok.length) {
      c.log("CATCH_UP", `Entered ${plural(ok.length, "stock out")} from paper notes: ${ok.map((o) => `${o.q} × ${o.p.name}`).join(", ")}.`);
      ok.forEach((o) => lowCoverTrigger(d, c, o.p));
    }
    return {
      toast: ok.length ? `Recorded ${plural(ok.length, "line")}${bad.length ? `; ${bad.length} need fixing` : ""}` : "Nothing recorded. Fix the lines marked in red.",
      bad: !ok.length, results: res, remaining: bad.join("\n"),
    };
  },
};

function finalize(d, c, req, ok, no, note) {
  ok.forEach((i) => (i.status = "APPROVED"));
  no.forEach((i) => (i.status = "REJECTED"));
  req.status = ok.length && no.length ? "PARTIAL" : ok.length ? "APPROVED" : "REJECTED";
  req.decidedBy = c.me.id; req.decidedAt = c.at; req.decisionNote = note;
  if (ok.length) {
    const groups = {};
    ok.forEach((i) => { const sup = productOf(d, i.pid)?.sup || ""; (groups[sup] = groups[sup] || []).push(i); });
    req.poIds = Object.entries(groups).map(([sup, its]) => {
      const po = {
        id: uid("po"), code: "PO-" + String(d.settings.poSeq++).padStart(4, "0"), requestId: req.id, sup, at: c.at,
        expectedAt: addDays(today(), supOf(d, sup)?.leadDays ?? 7), sentAt: null, chasedAt: null, approvedBy: c.me.id, status: "ORDERED",
        items: its.map((i) => ({ pid: i.pid, qty: i.qty, received: 0, unitCost: productOf(d, i.pid)?.cost ?? (i.qty ? i.cost / i.qty : 0) })),
        seq: nextSeq(),
      };
      d.pos.unshift(po);
      return po.id;
    });
    const codes = req.poIds.map((id) => poOf(d, id).code);
    c.log("AI_APPROVED", `Approved ${req.code}: ${plural(ok.length, "item")}, ${rm(ok.reduce((s, i) => s + i.cost, 0))}. Order${codes.length > 1 ? "s" : ""} ${list(codes)} created, one per supplier.`);
  }
  if (no.length) c.log("AI_REJECTED", `Rejected ${plural(no.length, "item")} in ${req.code} (${list(no.map((i) => i.name))}): ${note}`);
  return ok.length
    ? { toast: `${req.code} approved`, requestId: req.id, posCreated: req.poIds }
    : { toast: `${req.code} rejected. ${userOf(d, req.by).name} can see your reason.`, bad: true };
}

/* ============================================================================
   ORBYTE PAYMENT: a paid customer order arrives as an event and becomes a stock out
   with no typing. Anything StockNow can't match is handed to a person, never guessed.
   Event: { event: "payment.succeeded" | "payment.refunded", paymentId, channel: "in_store" | "online",
            items: [{ sku, qty }] }. See README → "Orbyte Payment interface".
   ============================================================================ */
const PAY_ID = /^[A-Za-z0-9_-]{3,64}$/;

function systemCtx(d) {
  const at = nowStamp();
  const log = (action, text, by = ORBYTE_USER.id) => d.logs.unshift({ id: uid("l"), at, by, action, text, seq: nextSeq() });
  return { me: ORBYTE_USER, at, log, need: () => fail("Not allowed."), offline: false };
}

export function applyPaymentEvent(d, ev = {}, { simulatedBy = "" } = {}) {
  const c = systemCtx(d), id = String(ev.paymentId || "").trim();
  if (!PAY_ID.test(id)) fail("paymentId is missing or invalid (3–64 letters, digits, - or _).");
  const ref = PAYMENT_REASON + id, by = simulatedBy ? ` Simulated by ${simulatedBy}.` : "";
  if (ev.event === "payment.refunded") return refundPayment(d, c, id, ref, by);
  if (ev.event && ev.event !== "payment.succeeded") fail(`Unknown event: ${ev.event}`);
  if (d.tx.some((t) => t.reason === ref) || d.alerts.some((a) => a.type === "PAYMENT" && a.poId === id)) {
    return { duplicate: true, toast: `Payment ${id} was already recorded, so it was ignored.` };
  }
  const items = Array.isArray(ev.items) ? ev.items : [];
  if (!items.length || items.length > 50) fail("A payment needs 1 to 50 items.");
  const where = ev.channel === "online" ? "online" : "in store";
  const ok = [], held = [], left = {};
  items.forEach((it) => {
    const sku = String(it?.sku || "").trim().toUpperCase(), q = Number(it?.qty);
    const p = d.products.find((x) => x.sku.toUpperCase() === sku);
    if (!Number.isInteger(q) || q < 1 || q > 10000) return held.push({ sku, q: it?.qty, why: "quantity is not a whole number from 1 to 10,000" });
    if (!p) return held.push({ sku, q, why: "this SKU is not in StockNow" });
    const avail = left[p.id] ?? p.stock;
    if (q > avail) return held.push({ sku, q, p, why: `only ${avail} in stock` });
    left[p.id] = avail - q;
    ok.push({ p, q });
  });
  ok.forEach((o) => recordTx(d, c, { pid: o.p.id, type: "STOCK_OUT", qty: o.q, reason: ref }));
  if (ok.length) {
    const total = ok.reduce((s, o) => s + o.q * o.p.sell, 0);
    c.log("ORBYTE_SALE", `Orbyte Payment ${id} (${where}): ${list(ok.map((o) => `${o.q} × ${o.p.name}`))}, ${rm(total)}. Stock out recorded automatically.${by}`);
    ok.forEach((o) => lowCoverTrigger(d, c, o.p, "an Orbyte payment"));
  }
  if (held.length) {
    d.alerts.unshift({ id: uid("a"), at: c.at, type: "PAYMENT", pid: held[0].p?.id ?? null, poId: id, open: true, seq: nextSeq() });
    c.log("ORBYTE_CHECK", `Orbyte Payment ${id}: not recorded, a person needs to check ${list(held.map((h) => `${h.sku || "(no SKU)"} × ${h.q} (${h.why})`))}. Count the shelf, then record it by hand or ask Orbyte to refund.${by}`);
  }
  const toast = held.length
    ? `${ok.length ? `Recorded ${plural(ok.length, "item")}. ` : ""}${plural(held.length, "item")} need${held.length === 1 ? "s" : ""} a person to check (see Dashboard).`
    : `Orbyte payment ${id}: stock out recorded for ${plural(ok.length, "item")}.`;
  return { paymentId: id, recorded: ok.length, held: held.length, toast, bad: !!held.length };
}

function refundPayment(d, c, id, ref, by) {
  const sold = liveTx(d).filter((t) => t.reason === ref);
  if (!sold.length) {
    if (d.tx.some((t) => t.reason === ref)) return { duplicate: true, toast: `Payment ${id} was already refunded, so it was ignored.` };
    fail(`No recorded sale for payment ${id}.`);
  }
  sold.forEach((t) => reverseTx(d, c, t));
  c.log("ORBYTE_REFUND", `Orbyte Payment ${id} refunded: ${list(sold.map((t) => `${t.qty} × ${nameOfP(d, t.pid)}`))} back in stock.${by}`);
  return { paymentId: id, refunded: sold.length, toast: `Refund of ${id}: ${plural(sold.length, "item")} back in stock.` };
}

/* Runs one action on `d` (mutating it). Throws ActionError when it is not allowed or invalid. */
export function applyAction(d, actorId, type, payload = {}, opts = {}) {
  if (type === "switchScenario") return switchScenario(d, actorId, payload);
  const h = handlers[type];
  if (!h) fail(`Unknown action: ${type}`);
  if (opts.offline && !OFFLINE_ACTIONS.has(type)) fail("You're offline. This needs a connection, so it stays here until StockNow is back.");
  return h(d, ctx(d, actorId, opts), payload || {}) || {};
}

/* Demo scenarios replace the whole shop with a different sales story. */
function switchScenario(d, actorId, { key }) {
  if (!SCENARIOS[key]) fail("Unknown demo scenario.");
  const fresh = buildData(key);
  Object.keys(fresh).forEach((k) => { d[k] = fresh[k]; });
  d.logs.unshift({ id: uid("l"), at: nowStamp(), by: "sys", action: "SCENARIO", text: `Demo data switched to "${SCENARIOS[key].label}".`, seq: nextSeq() });
  return { toast: `Demo data: ${SCENARIOS[key].label}` };
}

