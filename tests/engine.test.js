import { describe, expect, it } from "vitest";
import { buildData, SCENARIOS } from "../src/lib/seed.js";
import { analyse, backtest, budgetLeft, forecastFrom, planWith, overridesOf, inPlan } from "../src/lib/engine.js";
import { numbersMatch } from "../src/lib/server/gemini.js";

describe("forecast", () => {
  it("blends a 3:2:1 weighted average with the trend line", () => {
    const f = forecastFrom([80, 95, 110, 130, 150, 170]);
    expect(f.wma).toBeCloseTo(156.67, 1);
    expect(f.forecast).toBe(171);
  });
});

describe("restock plan (mixed scenario)", () => {
  const d = buildData("mixed");
  const r = analyse(d, budgetLeft(d));
  const item = (pid) => r.items.find((i) => i.pid === pid);

  it("starts with the expected budget left", () => {
    expect(budgetLeft(d)).toBe(16840);
  });

  it("buys the fast sellers with explainable numbers", () => {
    const hoodie = item("p1");
    expect(hoodie.decision).toBe("BUY");
    expect(hoodie.need).toBe(191);
    expect(hoodie.g.conf).toBe(94);
    expect(item("p2").decision).toBe("BUY");
  });

  it("skips overstocked and thin-margin items", () => {
    expect(item("p6").kind).toBe("overstock");
    expect(item("p7").kind).toBe("overstock");
    expect(item("p8").decision).toBe("DO_NOT_BUY");
    expect(item("p8").reasons.some((x) => /Thin margin/.test(x))).toBe(true);
  });

  it("never spends more than the budget", () => {
    expect(r.t.cost).toBeLessThanOrEqual(r.budget);
  });

  it("re-prices the plan when a person changes a quantity", () => {
    const o = overridesOf(r);
    o.p1 = { qty: 50, include: true };
    const edited = planWith(d, r.budget, o);
    const h = edited.items.find((i) => i.pid === "p1");
    expect(h.qty).toBe(50);
    expect(h.cost).toBe(50 * 50);
    expect(edited.t.buy.filter(inPlan).length).toBeGreaterThan(0);
  });

  it("backtests the last month within a reasonable error", () => {
    const bt = backtest(d);
    const mape = bt.reduce((s, x) => s + x.err, 0) / bt.length;
    expect(mape).toBeLessThan(0.15);
  });
});

describe("scenarios", () => {
  it("recommends buying nothing for the overstocked shop", () => {
    const d = buildData("overstock");
    expect(analyse(d, budgetLeft(d)).t.buy.length).toBe(0);
  });
  it("every scenario builds and analyses without errors", () => {
    for (const key of Object.keys(SCENARIOS)) {
      const d = buildData(key);
      expect(() => analyse(d, Infinity)).not.toThrow();
    }
  });
});

describe("Gemini number guard", () => {
  it("accepts wording that only reuses the facts' numbers", () => {
    expect(numbersMatch("Buy 2 products for RM 16,835.", "buy 2 products for RM 16,835")).toBe(true);
  });
  it("rejects a reply with an invented number", () => {
    expect(numbersMatch("Expected profit RM 20,000.", "Expected profit RM 17,124")).toBe(false);
  });
});
