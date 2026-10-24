/* How each collection in memory maps to a Supabase table (see supabase/schema.sql).
   field name in the app → column name in Postgres. Arrays/objects are stored as jsonb. */
export const TABLES = {
  people: { table: "people", cols: { id: "id", name: "name", email: "email", dept: "dept", role: "role", leaveUntil: "leave_until", seq: "seq" } },
  suppliers: { table: "suppliers", cols: { id: "id", name: "name", contact: "contact", phone: "phone", leadDays: "lead_days", note: "note", seq: "seq" } },
  categories: { table: "categories", cols: { id: "id", name: "name", seq: "seq" } },
  products: {
    table: "products",
    cols: { id: "id", name: "name", short: "short_name", sku: "sku", cat: "category_id", min: "min_stock", cost: "cost_price", sell: "selling_price", sup: "supplier_id", stock: "stock", seq: "seq" },
  },
  sales: { table: "sales_history", cols: { id: "product_id", series: "monthly_units", seq: "seq" } },
  requests: {
    table: "purchase_requests",
    cols: {
      id: "id", code: "code", by: "created_by", at: "created_at", budget: "budget", note: "note", status: "status", decidedBy: "decided_by",
      decidedAt: "decided_at", decisionNote: "decision_note", poIds: "po_ids", sentTo: "sent_to", summary: "summary", items: "items", result: "analysis", seq: "seq",
    },
  },
  pos: {
    table: "purchase_orders",
    cols: {
      id: "id", code: "code", requestId: "request_id", sup: "supplier_id", at: "created_at", expectedAt: "expected_at", sentAt: "sent_at",
      chasedAt: "chased_at", approvedBy: "approved_by", status: "status", items: "items", seq: "seq",
    },
  },
  tx: {
    table: "stock_transactions",
    cols: {
      id: "id", at: "created_at", pid: "product_id", type: "type", qty: "qty", before: "stock_before", after: "stock_after", sup: "supplier_id",
      reason: "reason", poId: "po_id", by: "created_by", pending: "pending", seq: "seq",
    },
  },
  logs: { table: "activity_logs", cols: { id: "id", at: "created_at", by: "actor_id", action: "action", text: "description", seq: "seq" } },
  alerts: { table: "alerts", cols: { id: "id", at: "created_at", type: "type", pid: "product_id", poId: "po_id", open: "is_open", seq: "seq" } },
};

/* Lists keep insertion order; histories are newest first. */
export const NEWEST_FIRST = new Set(["requests", "pos", "tx", "logs", "alerts"]);

export const SETTINGS_COLS = {
  business: "business_name", monthlyBudget: "monthly_budget", planDay: "plan_day", scenario: "scenario", poSeq: "po_seq", salesMonths: "sales_months",
};

const KEY = (c) => (c === "sales" ? "product_id" : "id");
export const keyColumn = KEY;

export function toRow(collection, obj) {
  const { cols } = TABLES[collection], row = {};
  for (const [f, col] of Object.entries(cols)) row[col] = obj[f] === undefined ? null : obj[f];
  return row;
}
export function fromRow(collection, row) {
  const { cols } = TABLES[collection], obj = {};
  for (const [f, col] of Object.entries(cols)) obj[f] = row[col];
  return obj;
}
