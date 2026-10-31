/* Synthetic demo data: one small clothing shop and six different 6-month sales stories.
   No real people, suppliers or phone numbers. The story is written as if it were noon on 23 Oct 2026
   (STORY_NOW) and moved forward to the real time when it is built, so every gap stays the same. */
import { budgetLeft, signals } from "./engine.js";
import { daysText, minutesBetween, monthsEndingAt, nowStamp, rm, shiftStamp } from "./format.js";

const STORY_NOW = "2026-10-23 12:00";

export const PEOPLE = [
  { id: "u1", name: "John Tan", email: "owner@demo.com", dept: "Management", role: "OWNER" },
  { id: "u2", name: "Sarah Lim", email: "manager@demo.com", dept: "Store operations", role: "MANAGER" },
  { id: "u3", name: "David Lee", email: "staff@demo.com", dept: "Inventory", role: "STAFF" },
  { id: "u4", name: "Aisyah Rahman", email: "finance@demo.com", dept: "Finance", role: "STAFF" },
  { id: "u5", name: "Nurul Aina", email: "nurul@demo.com", dept: "Inventory", role: null },
  { id: "u6", name: "Kumar Raj", email: "kumar@demo.com", dept: "Warehouse", role: null },
];
export const SUPPLIERS = [
  { id: "s1", name: "Penang Garment Works", contact: "Lim Wei Jie", phone: "+60 12-000 0101", leadDays: 5, note: "Hoodies and blazers" },
  { id: "s2", name: "Selangor Denim Co.", contact: "Farah Hassan", phone: "+60 12-000 0102", leadDays: 7, note: "Denim" },
  { id: "s3", name: "KL Textile Sdn Bhd", contact: "Tan Mei Ling", phone: "+60 12-000 0103", leadDays: 4, note: "Tees, shirts and dresses" },
  { id: "s4", name: "Johor Apparel Supply", contact: "Ravi Kumar", phone: "+60 12-000 0104", leadDays: 6, note: "Pants and bags" },
];
export const CATEGORIES = [
  { id: "c1", name: "Shirts" }, { id: "c2", name: "T-Shirts" }, { id: "c3", name: "Pants" },
  { id: "c4", name: "Dresses" }, { id: "c5", name: "Outerwear" }, { id: "c6", name: "Accessories" },
];
export const PRODUCTS = [
  { id: "p1", name: "Oversized Fleece Hoodie", short: "Hoodie", sku: "OUT-HDE", cat: "c5", min: 30, cost: 50, sell: 90, sup: "s1" },
  { id: "p2", name: "Washed Denim Jacket", short: "Denim Jacket", sku: "OUT-DNM", cat: "c5", min: 20, cost: 60, sell: 139, sup: "s2" },
  { id: "p3", name: "Linen Midi Dress", short: "Linen Dress", sku: "DRS-LIN", cat: "c4", min: 30, cost: 45, sell: 79, sup: "s3" },
  { id: "p4", name: "Combed Cotton Tee", short: "Cotton Tee", sku: "TEE-CMB", cat: "c2", min: 40, cost: 8, sell: 25, sup: "s3" },
  { id: "p5", name: "Slim Fit Chino Pants", short: "Chino Pants", sku: "PNT-CHN", cat: "c3", min: 50, cost: 35, sell: 79, sup: "s4" },
  { id: "p6", name: "Women's Formal Blazer", short: "Formal Blazer", sku: "OUT-BLZ", cat: "c5", min: 50, cost: 70, sell: 120, sup: "s1" },
  { id: "p7", name: "Canvas Tote Bag", short: "Tote Bag", sku: "ACC-TOT", cat: "c6", min: 100, cost: 3, sell: 12, sup: "s4" },
  { id: "p8", name: "Basic Oxford Shirt", short: "Oxford Shirt", sku: "SHT-OXF", cat: "c1", min: 100, cost: 24, sell: 30, sup: "s3" },
];

export const SCENARIOS = {
  mixed: {
    label: "Mixed trends (default)", story: "A typical month: some items rising, some falling, some overstocked.",
    expect: "Buy the fast sellers (Denim Jacket, Hoodie), skip the overstocked Blazer and Tote Bag and the thin-margin Oxford Shirt.",
    sales: { p1: [80, 95, 110, 130, 150, 170], p2: [20, 30, 45, 60, 75, 90], p3: [200, 190, 180, 160, 140, 120], p4: [150, 160, 155, 170, 178, 185], p5: [60, 62, 66, 70, 72, 78], p6: [60, 52, 45, 40, 34, 28], p7: [40, 42, 38, 41, 39, 40], p8: [70, 66, 64, 60, 58, 55] },
    stock: { p1: 15, p2: 8, p3: 0, p4: 120, p5: 25, p6: 200, p7: 500, p8: 300 },
    recent: [["2026-10-22 12:10", "p1", 12, "Sold in store", "u3"], ["2026-10-22 17:41", "p2", 4, "Online order", "u3"], ["2026-10-23 09:05", "p3", 3, "Sold in store", "u3"], ["2026-10-23 10:12", "p4", 14, "Sold in store", "u3"], ["2026-10-23 10:40", "p1", 2, "Sold in store", "u3"], ["2026-10-23 11:05", "p7", 6, "Online order", "u3"], ["2026-10-23 11:30", "p5", 2, "Online order", "u3"]],
  },
  growth: {
    label: "Growing demand", story: "Sales rising for almost every item, like a shop that just started selling online.",
    expect: "Wants to buy far more than the budget, so it ranks items and buys the most urgent first. Oxford Shirt is still skipped: thin margin.",
    sales: { p1: [60, 72, 85, 98, 112, 128], p2: [30, 36, 44, 52, 60, 70], p3: [50, 58, 66, 75, 86, 98], p4: [120, 135, 150, 168, 185, 205], p5: [40, 46, 52, 58, 66, 74], p6: [20, 24, 27, 31, 35, 40], p7: [30, 34, 39, 44, 50, 56], p8: [40, 44, 48, 53, 58, 64] },
    stock: { p1: 30, p2: 15, p3: 20, p4: 90, p5: 30, p6: 25, p7: 120, p8: 60 },
    recent: [["2026-10-22 12:10", "p1", 5, "Sold in store", "u3"], ["2026-10-22 17:41", "p2", 3, "Online order", "u3"], ["2026-10-23 09:05", "p4", 8, "Sold in store", "u3"], ["2026-10-23 10:12", "p3", 4, "Sold in store", "u3"], ["2026-10-23 10:40", "p1", 4, "Sold in store", "u3"], ["2026-10-23 11:05", "p6", 2, "Sold in store", "u3"], ["2026-10-23 11:30", "p5", 3, "Online order", "u3"]],
  },
  slow: {
    label: "Slow season", story: "After the school holidays, sales are falling for most items.",
    expect: "Buys very little and keeps the cash. Linen Dress is below its minimum, so it buys a small, cautious amount (70% of forecast).",
    sales: { p1: [170, 150, 130, 115, 100, 85], p2: [90, 80, 70, 60, 52, 45], p3: [120, 105, 92, 80, 70, 60], p4: [185, 170, 160, 150, 140, 130], p5: [78, 72, 66, 60, 55, 50], p6: [60, 52, 45, 40, 34, 28], p7: [40, 36, 33, 30, 28, 25], p8: [70, 64, 58, 52, 47, 42] },
    stock: { p1: 140, p2: 70, p3: 25, p4: 200, p5: 60, p6: 200, p7: 500, p8: 300 },
    recent: [["2026-10-22 12:10", "p1", 3, "Sold in store", "u3"], ["2026-10-22 17:41", "p4", 5, "Online order", "u3"], ["2026-10-23 09:05", "p3", 2, "Sold in store", "u3"], ["2026-10-23 10:12", "p4", 4, "Sold in store", "u3"], ["2026-10-23 10:40", "p1", 3, "Sold in store", "u3"], ["2026-10-23 11:05", "p8", 2, "Online order", "u3"], ["2026-10-23 11:30", "p5", 1, "Online order", "u3"]],
  },
  festive: {
    label: "Festive rush (Raya / year-end)", story: "Sales were flat, then jumped in the last two months before the festive season.",
    expect: "Demand is high everywhere, so the plan needs far more money than the budget. The accuracy check shows the forecast lagging behind the jump: a person should add extra for the festival.",
    sales: { p1: [80, 82, 85, 88, 130, 190], p2: [40, 42, 41, 45, 70, 110], p3: [60, 62, 65, 63, 110, 170], p4: [150, 155, 152, 160, 230, 320], p5: [55, 57, 56, 60, 85, 120], p6: [30, 31, 29, 33, 50, 72], p7: [35, 36, 34, 38, 60, 90], p8: [50, 52, 51, 55, 80, 110] },
    stock: { p1: 30, p2: 20, p3: 40, p4: 180, p5: 40, p6: 60, p7: 150, p8: 120 },
    recent: [["2026-10-22 12:10", "p1", 7, "Sold in store", "u3"], ["2026-10-22 17:41", "p3", 6, "Online order", "u3"], ["2026-10-23 09:05", "p4", 12, "Sold in store", "u3"], ["2026-10-23 10:12", "p1", 6, "Sold in store", "u3"], ["2026-10-23 10:40", "p2", 4, "Sold in store", "u3"], ["2026-10-23 11:05", "p3", 5, "Online order", "u3"], ["2026-10-23 11:30", "p5", 4, "Online order", "u3"]],
  },
  viral: {
    label: "Viral product", story: "A TikTok video made the Denim Jacket go viral; everything else sells as usual.",
    expect: "Denim Jacket is the top buy but with low confidence, because sales jumped unevenly. Other items only need small top-ups.",
    sales: { p1: [80, 82, 79, 81, 80, 83], p2: [20, 22, 25, 24, 60, 140], p3: [100, 98, 102, 99, 101, 100], p4: [160, 158, 162, 161, 159, 160], p5: [60, 61, 59, 62, 60, 61], p6: [30, 29, 31, 30, 30, 29], p7: [40, 41, 39, 40, 42, 40], p8: [55, 54, 56, 55, 54, 55] },
    stock: { p1: 90, p2: 10, p3: 110, p4: 170, p5: 65, p6: 80, p7: 130, p8: 120 },
    recent: [["2026-10-22 12:10", "p2", 9, "Online order", "u3"], ["2026-10-22 17:41", "p2", 7, "Online order", "u3"], ["2026-10-23 09:05", "p2", 6, "Online order", "u3"], ["2026-10-23 10:12", "p4", 5, "Sold in store", "u3"], ["2026-10-23 10:40", "p1", 3, "Sold in store", "u3"], ["2026-10-23 11:05", "p3", 3, "Sold in store", "u3"], ["2026-10-23 11:30", "p5", 2, "Online order", "u3"]],
  },
  overstock: {
    label: "Overstocked shop", story: "Too much was bought last season. Shelves are full and sales are flat or falling.",
    expect: "Recommends buying nothing and shows how much cash is stuck in stock, so the owner can plan a clearance sale.",
    sales: { p1: [60, 58, 61, 59, 60, 57], p2: [30, 28, 31, 29, 30, 27], p3: [80, 76, 72, 70, 66, 62], p4: [150, 148, 152, 149, 151, 150], p5: [50, 49, 51, 50, 48, 50], p6: [40, 36, 33, 30, 28, 25], p7: [40, 40, 41, 39, 40, 40], p8: [60, 58, 57, 55, 54, 52] },
    stock: { p1: 400, p2: 250, p3: 300, p4: 900, p5: 300, p6: 350, p7: 800, p8: 500 },
    recent: [["2026-10-22 12:10", "p1", 2, "Sold in store", "u3"], ["2026-10-22 17:41", "p4", 5, "Online order", "u3"], ["2026-10-23 09:05", "p4", 6, "Sold in store", "u3"], ["2026-10-23 10:12", "p3", 2, "Sold in store", "u3"], ["2026-10-23 10:40", "p6", 1, "Sold in store", "u3"], ["2026-10-23 11:05", "p7", 2, "Online order", "u3"], ["2026-10-23 11:30", "p8", 2, "Sold in store", "u3"]],
  },
};
export const DEFAULT_SCENARIO = "mixed";

const L = (at, by, action, text) => ({ at, by, action, text });
/* History shared by every scenario: one approved plan (two supplier orders), one rejected plan. */
const HISTORY_LOGS = [
  L("2026-09-30 14:22", "u1", "PRODUCT_CREATED", "Created product Washed Denim Jacket (OUT-DNM)."),
  L("2026-10-02 10:11", "u3", "AI_ANALYSIS", "Made a restock plan for a RM 8,000 budget."),
  L("2026-10-02 10:14", "u3", "AI_SENT", "Sent PR-1022 (budget RM 8,000, 2 items) to John Tan and Sarah Lim for approval."),
  L("2026-10-02 15:40", "u1", "AI_APPROVED", "Approved PR-1022 (2 items, RM 3,000). Orders PO-0030 and PO-0031 created, one per supplier."),
  L("2026-10-02 15:45", "u3", "PO_SENT", "Sent PO-0030 to KL Textile Sdn Bhd on WhatsApp (200 × Combed Cotton Tee)."),
  L("2026-10-02 15:46", "u3", "PO_SENT", "Sent PO-0031 to Johor Apparel Supply on WhatsApp (40 × Slim Fit Chino Pants)."),
  L("2026-10-14 10:58", "u3", "AI_ANALYSIS", "Made a restock plan for a RM 5,000 budget."),
  L("2026-10-14 11:02", "u3", "AI_SENT", "Sent PR-1023 (budget RM 5,000, 1 item) to John Tan and Sarah Lim for approval."),
  L("2026-10-15 09:20", "u2", "AI_REJECTED", "Rejected PR-1023: Dress demand keeps falling. Wait for the new spring colours in December."),
];
/* Older stock movements (many unrecorded sales happened in between, so they are not chained to today's stock). */
const OLD_TX = [
  { id: "t3", at: "2026-10-18 10:30", pid: "p7", type: "STOCK_IN", qty: 100, before: 406, after: 506, sup: "s4", poId: null, reason: "", by: "u2" },
  { id: "t2", at: "2026-10-06 09:12", pid: "p4", type: "STOCK_IN", qty: 200, before: 35, after: 235, sup: "s3", poId: "po0", reason: "", by: "u3" },
  { id: "t1", at: "2026-10-04 16:20", pid: "p6", type: "STOCK_OUT", qty: 2, before: 202, after: 200, sup: "", poId: null, reason: "Returned to supplier", by: "u2" },
];
const seedRequests = () => [
  {
    id: "r2", code: "PR-1023", by: "u3", at: "2026-10-14 11:02", budget: 5000, note: "Customers asking for the linen dress.",
    status: "REJECTED", decidedBy: "u2", decidedAt: "2026-10-15 09:20", decisionNote: "Dress demand keeps falling. Wait for the new spring colours in December.",
    poIds: [], sentTo: ["u1", "u2"], result: null,
    summary: "With RM 5,000, buy Linen Midi Dress for RM 4,500. Expected profit RM 3,400 (ROI 76%).",
    items: [{ pid: "p3", name: "Linen Midi Dress", decision: "BUY", qty: 100, cost: 4500, profit: 3400, roi: 0.76, conf: 87, status: "REJECTED", reasons: [] }],
  },
  {
    id: "r1", code: "PR-1022", by: "u3", at: "2026-10-02 10:14", budget: 8000, note: "Restock basics before the school holiday rush.",
    status: "APPROVED", decidedBy: "u1", decidedAt: "2026-10-02 15:40", decisionNote: "", poIds: ["po1", "po0"], sentTo: ["u1", "u2"], result: null,
    summary: "With RM 8,000, buy Combed Cotton Tee and Slim Fit Chino Pants for RM 3,000. Expected profit RM 4,160 (ROI 139%).",
    items: [
      { pid: "p4", name: "Combed Cotton Tee", decision: "BUY", qty: 200, cost: 1600, profit: 3400, roi: 2.13, conf: 92, status: "APPROVED", reasons: [] },
      { pid: "p5", name: "Slim Fit Chino Pants", decision: "BUY", qty: 40, cost: 1400, profit: 760, roi: 0.54, conf: 90, status: "APPROVED", reasons: [] },
    ],
  },
];
/* One order per supplier. PO-0031 is overdue and only partly delivered, so the daily check flags it. */
const seedPOs = () => [
  { id: "po1", code: "PO-0031", requestId: "r1", sup: "s4", at: "2026-10-02 15:40", expectedAt: "2026-10-13", sentAt: "2026-10-02 15:46", chasedAt: null, approvedBy: "u1", status: "PARTIAL",
    items: [{ pid: "p5", qty: 40, received: 15, unitCost: 35 }] },
  { id: "po0", code: "PO-0030", requestId: "r1", sup: "s3", at: "2026-10-02 15:40", expectedAt: "2026-10-06", sentAt: "2026-10-02 15:45", chasedAt: null, approvedBy: "u1", status: "RECEIVED",
    items: [{ pid: "p4", qty: 200, received: 200, unitCost: 8 }] },
];

const NAMES = Object.fromEntries(PRODUCTS.map((p) => [p.id, p.name]));
const SUP_NAMES = Object.fromEntries(SUPPLIERS.map((s) => [s.id, s.name]));
function txLogText(t) {
  const name = NAMES[t.pid];
  if (t.type === "STOCK_OUT") return `Stock out ${t.qty} × ${name} (${t.reason}). Stock now ${t.after}.`;
  if (t.poId === "po0") return `Received PO-0030 from ${SUP_NAMES[t.sup]}: ${t.qty} × ${name}. Order complete.`;
  if (t.poId === "po1") return `Received ${t.qty} × ${name} on PO-0031 from ${SUP_NAMES[t.sup]}. 25 still due.`;
  return `Stock in ${t.qty} × ${name} from ${SUP_NAMES[t.sup]}.`;
}

/* Gives rows a stable order: lists keep their seed order, histories are newest first. */
const ordered = (rows) => rows.map((r, i) => ({ ...r, seq: i + 1 }));
const newestFirst = (rows) => rows.map((r, i) => ({ ...r, seq: rows.length - i }));

/* Moves every date in the shop by the same number of minutes. */
function shiftDates(d, minutes) {
  const mv = (s) => (s ? shiftStamp(s, minutes) : s);
  [...d.tx, ...d.logs, ...d.alerts].forEach((x) => { x.at = mv(x.at); });
  d.requests.forEach((r) => { r.at = mv(r.at); r.decidedAt = mv(r.decidedAt); });
  d.pos.forEach((po) => { po.at = mv(po.at); po.expectedAt = mv(po.expectedAt); po.sentAt = mv(po.sentAt); po.chasedAt = mv(po.chasedAt); });
}

/* Builds the whole shop for one scenario. Yesterday's and today's movements are worked out backwards
   from the scenario's current stock, so every "stock before / after" matches. */
export function buildData(key = DEFAULT_SCENARIO) {
  const sc = SCENARIOS[key] || SCENARIOS[DEFAULT_SCENARIO];
  const now = nowStamp(), day = +now.slice(8, 10);
  const d = {
    settings: { business: "Orbyte Demo Fashion Store", monthlyBudget: 20000, planDay: Math.min(day, 28), businessType: "clothing", businessYears: 3, forecastConfig: null, scenario: SCENARIOS[key] ? key : DEFAULT_SCENARIO, poSeq: 32, salesMonths: monthsEndingAt(now, 6) },
    people: ordered(PEOPLE.map((u) => ({ ...u, leaveUntil: null }))),
    suppliers: ordered(SUPPLIERS),
    categories: ordered(CATEGORIES),
    products: ordered(PRODUCTS.map((x) => ({ ...x, stock: sc.stock[x.id] }))),
    sales: ordered(PRODUCTS.map((p) => ({ id: p.id, series: [...sc.sales[p.id]] }))),
    requests: newestFirst(seedRequests()),
    pos: newestFirst(seedPOs()),
    tx: [], logs: [], alerts: [],
  };
  const recent = [{ at: "2026-10-23 08:40", pid: "p5", type: "STOCK_IN", qty: 15, sup: "s4", poId: "po1", by: "u3" },
    ...sc.recent.map(([at, pid, qty, reason, by]) => ({ at, pid, type: "STOCK_OUT", qty, reason, by }))].sort((a, b) => b.at.localeCompare(a.at));
  const cur = Object.fromEntries(d.products.map((x) => [x.id, x.stock]));
  const chained = [];
  recent.forEach((e) => {
    const after = cur[e.pid], before = e.type === "STOCK_IN" ? after - e.qty : after + e.qty;
    if (before < 0) return;
    cur[e.pid] = before;
    chained.push({ id: "t" + (100 - chained.length), at: e.at, pid: e.pid, type: e.type, qty: e.qty, before, after, by: e.by, reason: e.reason || "", sup: e.sup || "", poId: e.poId || null });
  });
  d.tx = newestFirst([...chained, ...OLD_TX].map((t) => ({ ...t, pending: false })));

  const logs = HISTORY_LOGS.map((l) => ({ ...l }));
  [...d.tx].reverse().forEach((t) => logs.push(L(t.at, t.by, t.type, txLogText(t))));
  logs.push(L("2026-10-23 07:00", "sys", "AUTO_ALERT", "Daily delivery check: PO-0031 from Johor Apparel Supply is 10 days late."));
  const plan = L("2026-10-23 08:00", "sys", "AUTO_PLAN", "");
  logs.push(plan);
  const alerts = [{ id: "a-plan", at: "2026-10-23 08:00", type: "PLAN", pid: null, poId: null, open: true }];
  d.products.forEach((x) => {
    const g = signals(d, x);
    if (!g || g.coverAll >= 7) return;
    const last = d.tx.find((t) => t.pid === x.id && t.type === "STOCK_OUT" && t.at >= "2026-10-22");
    const at = last ? last.at : "2026-10-23 07:30";
    alerts.push({ id: "a-" + x.id, at, type: "LOW", pid: x.id, poId: null, open: true });
    logs.push(L(at, "sys", "AUTO_ALERT", `${x.name} ${x.stock === 0 ? "is now out of stock" : `now lasts about ${daysText(g.cover)}`} (triggered by a stock out). Added to the restock plan.`));
  });
  d.alerts = newestFirst(alerts.sort((a, b) => b.at.localeCompare(a.at)));
  const sorted = logs.map((l, k) => ({ ...l, k })).sort((a, b) => a.at.localeCompare(b.at) || a.k - b.k).reverse();
  d.logs = newestFirst(sorted.map(({ k, ...l }, i) => ({ id: "l" + String(sorted.length - i).padStart(3, "0"), ...l })));
  shiftDates(d, minutesBetween(STORY_NOW, now));
  d.logs.find((l) => l.action === "AUTO_PLAN").text =
    `${day === d.settings.planDay ? "Monthly schedule: " : ""}Time to plan this month's restock (${rm(budgetLeft(d))} left to spend).`;
  return d;
}
