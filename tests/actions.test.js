import { describe, expect, it } from "vitest";
import { buildData } from "../src/lib/seed.js";
import { applyAction, ActionError } from "../src/lib/actions.js";
import { budgetLeft, productOf, todayTx, isSale } from "../src/lib/engine.js";

const fresh = () => buildData("mixed");

describe("stock moves", () => {
  it("stock out lowers stock and counts as a sale", () => {
    const d = fresh();
    applyAction(d, "u3", "stockOut", { pid: "p4", qty: 5, reason: "Online order" });
    expect(productOf(d, "p4").stock).toBe(115);
    expect(todayTx(d).filter(isSale).some((t) => t.pid === "p4" && t.qty === 5)).toBe(true);
  });

  it("refuses to take out more than is in stock", () => {
    const d = fresh();
    expect(() => applyAction(d, "u3", "stockOut", { pid: "p1", qty: 999, reason: "Sold in store" })).toThrow(ActionError);
  });

  it("manual stock in uses the budget; a customer return does not", () => {
    const d = fresh(), start = budgetLeft(d);
    applyAction(d, "u3", "stockIn", { pid: "p1", qty: 10, kind: "buy", sup: "s1" });
    expect(budgetLeft(d)).toBe(start - 500);
    applyAction(d, "u3", "stockIn", { pid: "p1", qty: 1, kind: "return" });
    expect(budgetLeft(d)).toBe(start - 500);
  });

  it("returning damaged stock to a supplier refunds the budget", () => {
    const d = fresh(), start = budgetLeft(d);
    applyAction(d, "u3", "stockOut", { pid: "p6", qty: 2, reason: "Returned to supplier" });
    expect(budgetLeft(d)).toBe(start + 140);
  });
});

describe("plan → approval → orders", () => {
  it("staff send a plan, the owner approves, one order per supplier", () => {
    const d = fresh();
    const { requestId } = applyAction(d, "u3", "sendProposal", { budget: budgetLeft(d) });
    expect(() => applyAction(d, "u3", "decide", { reqId: requestId })).toThrow("Only the Owner or a Manager can approve.");
    const out = applyAction(d, "u1", "decide", { reqId: requestId, decisions: {} });
    const sups = new Set(d.pos.filter((p) => out.posCreated.includes(p.id)).map((p) => p.sup));
    expect(sups.size).toBe(out.posCreated.length);
  });

  it("rejecting an item needs a reason", () => {
    const d = fresh();
    const { requestId } = applyAction(d, "u3", "sendProposal", { budget: budgetLeft(d) });
    expect(() => applyAction(d, "u1", "decide", { reqId: requestId, decisions: { p1: "REJECTED" } })).toThrow(ActionError);
  });
});

describe("permissions and validation", () => {
  it("only the owner sets the monthly budget", () => {
    const d = fresh();
    expect(() => applyAction(d, "u2", "setMonthlyBudget", { budget: 30000 })).toThrow("Only the Owner sets the monthly budget.");
    applyAction(d, "u1", "setMonthlyBudget", { budget: 30000 });
    expect(d.settings.monthlyBudget).toBe(30000);
  });

  it("supplier phone needs at least 10 digits", () => {
    const d = fresh();
    try {
      applyAction(d, "u1", "saveSupplier", { name: "New Co", phone: "012345", leadDays: 5 });
      throw new Error("should have failed");
    } catch (e) {
      expect(e.fields.phone).toMatch(/10 digits/);
    }
    applyAction(d, "u1", "saveSupplier", { name: "New Co", phone: "012-345 6789", leadDays: 5 });
    expect(d.suppliers.some((s) => s.name === "New Co")).toBe(true);
  });

  it("offline mode only allows recording stock", () => {
    const d = fresh();
    expect(() => applyAction(d, "u1", "setMonthlyBudget", { budget: 30000 }, { offline: true })).toThrow(/offline/);
    applyAction(d, "u3", "stockOut", { pid: "p4", qty: 1, reason: "Sold in store" }, { offline: true });
    expect(d.tx[0].pending).toBe(true);
  });
});
