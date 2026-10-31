import { describe, expect, it, vi } from "vitest";
import { buildData } from "../src/lib/seed.js";
import {
  applyAction,
  applyPaymentEvent,
  ActionError,
} from "../src/lib/actions.js";
import {
  budgetLeft,
  isSale,
  lateDays,
  liveTx,
  poOf,
  productOf,
  todayTx,
} from "../src/lib/engine.js";
import { nowStamp } from "../src/lib/format.js";

const fresh = () => buildData("mixed");

describe("stock moves", () => {
  it("stock out lowers stock and counts as a sale", () => {
    const d = fresh();
    applyAction(d, "u3", "stockOut", {
      pid: "p4",
      qty: 5,
      reason: "Online order",
    });
    expect(productOf(d, "p4").stock).toBe(115);
    expect(
      todayTx(d)
        .filter(isSale)
        .some((t) => t.pid === "p4" && t.qty === 5),
    ).toBe(true);
  });

  it("refuses to take out more than is in stock", () => {
    const d = fresh();
    expect(() =>
      applyAction(d, "u3", "stockOut", {
        pid: "p1",
        qty: 999,
        reason: "Sold in store",
      }),
    ).toThrow(ActionError);
  });

  it("manual stock in uses the budget; a customer return does not", () => {
    const d = fresh(),
      start = budgetLeft(d);
    applyAction(d, "u3", "stockIn", {
      pid: "p1",
      qty: 10,
      kind: "buy",
      sup: "s1",
    });
    expect(budgetLeft(d)).toBe(start - 500);
    applyAction(d, "u3", "stockIn", { pid: "p1", qty: 1, kind: "return" });
    expect(budgetLeft(d)).toBe(start - 500);
  });

  it("returning damaged stock to a supplier refunds the budget", () => {
    const d = fresh(),
      start = budgetLeft(d);
    applyAction(d, "u3", "stockOut", {
      pid: "p6",
      qty: 2,
      reason: "Returned to supplier",
    });
    expect(budgetLeft(d)).toBe(start + 140);
  });
});

describe("plan → approval → orders", () => {
  it("staff send a plan, the owner approves, one order per supplier", () => {
    const d = fresh();
    const { requestId } = applyAction(d, "u3", "sendProposal", {
      budget: budgetLeft(d),
    });
    expect(() => applyAction(d, "u3", "decide", { reqId: requestId })).toThrow(
      "Only the Owner or a Manager can approve.",
    );
    const out = applyAction(d, "u1", "decide", {
      reqId: requestId,
      decisions: {},
    });
    const sups = new Set(
      d.pos.filter((p) => out.posCreated.includes(p.id)).map((p) => p.sup),
    );
    expect(sups.size).toBe(out.posCreated.length);
  });

  it("rejecting an item needs a reason", () => {
    const d = fresh();
    const { requestId } = applyAction(d, "u3", "sendProposal", {
      budget: budgetLeft(d),
    });
    expect(() =>
      applyAction(d, "u1", "decide", {
        reqId: requestId,
        decisions: { p1: "REJECTED" },
      }),
    ).toThrow(ActionError);
  });
});

describe("permissions and validation", () => {
  it("only the owner sets the monthly budget", () => {
    const d = fresh();
    expect(() =>
      applyAction(d, "u2", "setMonthlyBudget", { budget: 30000 }),
    ).toThrow("Only the Owner sets the monthly budget.");
    applyAction(d, "u1", "setMonthlyBudget", { budget: 30000 });
    expect(d.settings.monthlyBudget).toBe(30000);
  });

  it("supplier phone needs at least 10 digits", () => {
    const d = fresh();
    try {
      applyAction(d, "u1", "saveSupplier", {
        name: "New Co",
        phone: "012345",
        leadDays: 5,
      });
      throw new Error("should have failed");
    } catch (e) {
      expect(e.fields.phone).toMatch(/10 digits/);
    }
    applyAction(d, "u1", "saveSupplier", {
      name: "New Co",
      phone: "012-345 6789",
      leadDays: 5,
    });
    expect(d.suppliers.some((s) => s.name === "New Co")).toBe(true);
  });

  it("offline mode only allows recording stock", () => {
    const d = fresh();
    expect(() =>
      applyAction(
        d,
        "u1",
        "setMonthlyBudget",
        { budget: 30000 },
        { offline: true },
      ),
    ).toThrow(/offline/);
    applyAction(
      d,
      "u3",
      "stockOut",
      { pid: "p4", qty: 1, reason: "Sold in store" },
      { offline: true },
    );
    expect(d.tx[0].pending).toBe(true);
  });
});

describe("undo", () => {
  it("undoing a stock out puts the stock back and removes the sale; the history keeps both", () => {
    const d = fresh();
    applyAction(d, "u3", "stockOut", {
      pid: "p4",
      qty: 5,
      reason: "Sold in store",
    });
    const sale = d.tx[0];
    applyAction(d, "u3", "undoTx", { txId: sale.id });
    expect(productOf(d, "p4").stock).toBe(120);
    expect(todayTx(d).some((t) => t.id === sale.id)).toBe(false);
    expect(d.tx.some((t) => t.id === sale.id)).toBe(true);
    expect(d.logs[0].action).toBe("UNDO");
    expect(() => applyAction(d, "u3", "undoTx", { txId: sale.id })).toThrow(
      "already undone",
    );
  });

  it("undoing a manual stock in gives the budget back", () => {
    const d = fresh(),
      start = budgetLeft(d);
    applyAction(d, "u3", "stockIn", {
      pid: "p1",
      qty: 10,
      kind: "buy",
      sup: "s1",
    });
    applyAction(d, "u3", "undoTx", { txId: d.tx[0].id });
    expect(budgetLeft(d)).toBe(start);
  });

  it("staff can undo only their own entries; the owner can undo anyone's", () => {
    const d = fresh();
    applyAction(d, "u4", "stockOut", {
      pid: "p4",
      qty: 2,
      reason: "Online order",
    });
    const id = d.tx[0].id;
    expect(() => applyAction(d, "u3", "undoTx", { txId: id })).toThrow(
      /own entries/,
    );
    applyAction(d, "u1", "undoTx", { txId: id });
    expect(productOf(d, "p4").stock).toBe(120);
  });

  it("refuses to undo a stock in whose goods were already sold", () => {
    const d = fresh();
    applyAction(d, "u3", "stockIn", {
      pid: "p3",
      qty: 5,
      kind: "buy",
      sup: "s3",
    });
    const id = d.tx[0].id;
    applyAction(d, "u3", "stockOut", {
      pid: "p3",
      qty: 3,
      reason: "Sold in store",
    });
    expect(() => applyAction(d, "u3", "undoTx", { txId: id })).toThrow(
      /already sold/,
    );
  });

  it("undoing a supplier delivery puts the quantity back on the order", () => {
    const d = fresh();
    applyAction(d, "u3", "receivePO", { poId: "po1", lines: { p5: 25 } });
    expect(poOf(d, "po1").status).toBe("RECEIVED");
    applyAction(d, "u1", "undoTx", { txId: d.tx[0].id });
    expect(poOf(d, "po1").status).toBe("PARTIAL");
    expect(poOf(d, "po1").items[0].received).toBe(15);
  });

  it("undoing a supplier delivery leaves the budget alone: the order was counted when it was approved", () => {
    const d = fresh(),
      start = budgetLeft(d);
    applyAction(d, "u3", "receivePO", { poId: "po1", lines: { p5: 25 } });
    expect(budgetLeft(d)).toBe(start);
    const out = applyAction(d, "u1", "undoTx", { txId: d.tx[0].id });
    expect(budgetLeft(d)).toBe(start);
    expect(out.toast).toMatch(/due again; budget unchanged/);
  });
});

describe("Orbyte Payment", () => {
  const pay = (id, items, event = "payment.succeeded") => ({
    event,
    paymentId: id,
    channel: "in_store",
    items,
  });

  it("a paid order becomes a stock out and a sale, recorded once", () => {
    const d = fresh();
    applyPaymentEvent(
      d,
      pay("PAY-1001", [
        { sku: "TEE-CMB", qty: 3 },
        { sku: "acc-tot", qty: 2 },
      ]),
    );
    expect(productOf(d, "p4").stock).toBe(117);
    expect(productOf(d, "p7").stock).toBe(498);
    expect(
      todayTx(d)
        .filter(isSale)
        .filter((t) => t.by === "orbyte").length,
    ).toBe(2);
    expect(
      d.logs.some(
        (l) => l.action === "ORBYTE_SALE" && l.text.includes("PAY-1001"),
      ),
    ).toBe(true);
    expect(
      applyPaymentEvent(d, pay("PAY-1001", [{ sku: "TEE-CMB", qty: 3 }]))
        .duplicate,
    ).toBe(true);
    expect(productOf(d, "p4").stock).toBe(117);
  });

  it("unknown SKUs and missing stock go to a person instead of a guess", () => {
    const d = fresh();
    const out = applyPaymentEvent(
      d,
      pay("PAY-1002", [
        { sku: "NOPE-1", qty: 1 },
        { sku: "DRS-LIN", qty: 2 },
        { sku: "TEE-CMB", qty: 1 },
      ]),
    );
    expect(out).toMatchObject({ recorded: 1, held: 2 });
    expect(d.alerts.find((a) => a.type === "PAYMENT" && a.open).poId).toBe(
      "PAY-1002",
    );
    expect(() =>
      applyAction(d, "u3", "resolvePayment", {
        alertId: d.alerts[0].id,
        note: "ok",
      }),
    ).toThrow(/Owner or a Manager/);
    applyAction(d, "u2", "resolvePayment", {
      alertId: d.alerts[0].id,
      note: "Counted the shelf, recorded by hand",
    });
    expect(d.alerts.some((a) => a.type === "PAYMENT" && a.open)).toBe(false);
  });

  it("a refund puts the stock back once", () => {
    const d = fresh();
    applyPaymentEvent(d, pay("PAY-1003", [{ sku: "TEE-CMB", qty: 4 }]));
    applyPaymentEvent(d, pay("PAY-1003", [], "payment.refunded"));
    expect(productOf(d, "p4").stock).toBe(120);
    expect(liveTx(d).some((t) => t.reason.includes("PAY-1003"))).toBe(false);
    expect(
      applyPaymentEvent(d, pay("PAY-1003", [], "payment.refunded")).duplicate,
    ).toBe(true);
  });
});

describe("real date", () => {
  it("moves the demo story to today, keeping every gap", () => {
    vi.setSystemTime(new Date("2026-11-18T01:30:00Z")); // 09:30 in Malaysia
    try {
      const d = buildData("mixed"),
        now = nowStamp();
      expect(now).toBe("2026-11-18 09:30");
      expect(lateDays(poOf(d, "po1"))).toBe(10);
      expect(d.settings.salesMonths.at(-1)).toBe("Nov");
      expect([...d.tx, ...d.logs, ...d.alerts].every((x) => x.at <= now)).toBe(
        true,
      );
    } finally {
      vi.setSystemTime(new Date("2026-10-23T04:00:00Z"));
    }
  });
});
