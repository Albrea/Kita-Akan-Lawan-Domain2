/* Exercises the Supabase storage path against an in-memory fake of the supabase-js query builder,
   so the column mapping, ordering and "write only what changed" logic are tested without a database. */
import { beforeAll, describe, expect, it, vi } from "vitest";

const tables = {};
const calls = { upsert: 0, delete: 0 };
function query(name) {
  const rows = () => (tables[name] ||= []);
  const q = { filters: [], orderBy: null };
  const api = {
    select() { return api; },
    eq(col, v) { q.filters.push((r) => r[col] === v); return api; },
    order(col, { ascending }) { q.orderBy = [col, ascending]; return api; },
    limit() { return api; },
    then(res) {
      let out = rows().filter((r) => q.filters.every((f) => f(r)));
      if (q.orderBy) { const [c, asc] = q.orderBy; out = [...out].sort((a, b) => (asc ? a[c] - b[c] : b[c] - a[c])); }
      return Promise.resolve({ data: JSON.parse(JSON.stringify(out)), error: null }).then(res);
    },
    upsert(list, opts = {}) {
      calls.upsert += 1;
      const key = opts.onConflict || "id";
      (Array.isArray(list) ? list : [list]).forEach((row) => {
        const i = rows().findIndex((r) => r[key] === row[key]);
        if (i >= 0) rows()[i] = row; else rows().push(row);
      });
      return Promise.resolve({ data: null, error: null });
    },
    delete() {
      return { in(col, ids) { calls.delete += 1; tables[name] = rows().filter((r) => !ids.includes(r[col])); return Promise.resolve({ data: null, error: null }); } };
    },
  };
  return api;
}
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: query }) }));

let store;
beforeAll(async () => {
  process.env.SUPABASE_URL = "http://fake.local";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  store = await import("../src/lib/server/store.js");
});

describe("Supabase store", () => {
  it("seeds an empty database and reads it back in the same order", async () => {
    expect(store.storageMode()).toBe("supabase");
    const d = await store.loadData();
    expect(tables.products).toHaveLength(8);
    expect(tables.products[0]).toHaveProperty("cost_price", 50);
    const again = await store.loadData();
    expect(again.products.map((p) => p.id)).toEqual(d.products.map((p) => p.id));
    expect(again.logs[0].seq).toBeGreaterThan(again.logs[1].seq);
  });

  it("writes only the rows an action changed", async () => {
    calls.upsert = 0;
    const out = await store.runAction("u3", "stockOut", { pid: "p4", qty: 2, reason: "Sold in store" });
    expect(out.ok).toBe(true);
    expect(tables.products.find((p) => p.id === "p4").stock).toBe(118);
    expect(calls.upsert).toBeLessThanOrEqual(4); // products, stock_transactions, activity_logs (+ alerts at most)
  });

  it("keeps a no-limit plan's Infinity budget through the database", async () => {
    await store.runAction("u1", "setMonthlyBudget", { budget: 200000 });
    const out = await store.runAction("u3", "sendProposal", { budget: "ideal" });
    expect(out.ok).toBe(true);
    const d = await store.loadData();
    expect(d.requests[0].budget).toBe(Infinity);
    expect(d.requests[0].result.ideal).toBe(true);
  });

  it("returns validation errors without saving", async () => {
    const before = JSON.stringify(tables.suppliers);
    const out = await store.runAction("u1", "saveSupplier", { name: "Bad", phone: "1", leadDays: 3 });
    expect(out.ok).toBe(false);
    expect(out.fields.phone).toBeTruthy();
    expect(JSON.stringify(tables.suppliers)).toBe(before);
  });

  it("switching scenario replaces the shop", async () => {
    const out = await store.runAction("u1", "switchScenario", { key: "overstock" });
    expect(out.ok).toBe(true);
    expect(tables.products.find((p) => p.id === "p1").stock).toBe(400);
    expect(tables.purchase_requests.some((r) => r.code === "PR-1024")).toBe(false);
  });
});
