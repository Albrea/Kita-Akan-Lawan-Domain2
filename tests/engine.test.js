import { describe, expect, it } from "vitest";
import { buildData, SCENARIOS } from "../src/lib/seed.js";
import { explainAccuracy, backtestMulti, configOf, analyse, backtest, budgetLeft, forecastFrom, planWith, overridesOf, inPlan, spendBySupplier, spentThisMonth } from "../src/lib/engine.js";
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

describe("finance charts", () => {
  it("purchases per supplier, minus returns, add up to what this month's budget has used", () => {
    const d = buildData("mixed");
    const { slices, returned } = spendBySupplier(d);
    expect(slices.reduce((a, x) => a + x.value, 0) - returned).toBe(spentThisMonth(d));
    expect(slices.length).toBeGreaterThan(1);
  });
});






const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

describe("accuracy calculation audit trail", () => {
  it.each(Object.keys(SCENARIOS))("reconciles every number with the existing engine: %s", (scenario) => {
    const d = buildData(scenario);
    const snapshot = JSON.stringify(d);
    const details = explainAccuracy(d), latest = backtest(d), rolling = backtestMulti(d);
    expect(details.latest.rows).toHaveLength(latest.length);
    latest.forEach((row, k) => {
      expect(details.latest.rows[k]).toMatchObject({
        pid: row.p.id, forecast: row.forecast, actual: row.actual,
        diff: row.diff, error: row.err, verdict: row.verdict,
      });
    });
    expect(details.latest.error).toBeCloseTo(mean(latest.map((row) => row.err)), 12);
    expect(details.latest.within).toBe(latest.filter((row) => row.err <= 0.15).length);
    expect(details.latest.best.error).toBe(Math.min(...latest.map((row) => row.err)));
    expect(details.latest.worst.error).toBe(Math.max(...latest.map((row) => row.err)));
    expect(details.rolling.rows).toHaveLength(rolling.tests);
    expect(mean(details.rolling.rows.map((row) => row.error))).toBeCloseTo(rolling.error, 12);
    expect(mean(details.rolling.rows.map((row) => row.baselineError))).toBeCloseTo(rolling.baseline, 12);
    expect(JSON.stringify(d)).toBe(snapshot);
  });

  it("never uses held-out or later sales to construct a forecast", () => {
    const d = buildData("mixed"), details = explainAccuracy(d);
    for (const row of [...details.latest.rows, ...details.rolling.rows]) {
      const series = d.sales.find((s) => s.id === row.pid).series;
      expect(row.history).toEqual(series.slice(0, row.testIndex));
      expect(row.history).toHaveLength(row.testIndex);
      expect(row.historyMonths).toHaveLength(row.history.length);
      expect(row.model).toEqual(forecastFrom(row.history, configOf(d)));
      expect(row.forecast).toBe(row.model.forecast);
      expect(row.baseline).toBe(Math.round(mean(row.history.slice(-3))));
    }
  });

  it("exposes the different zero-sales policies without dividing by zero", () => {
    const d = buildData("mixed");
    d.sales[0].series = d.sales[0].series.map(() => 0);
    const pid = d.sales[0].id, details = explainAccuracy(d);
    const latest = details.latest.rows.find((row) => row.pid === pid);
    expect(latest.zeroActual).toBe(true);
    expect(latest.error).toBe(0);
    expect(details.rolling.rows.some((row) => row.pid === pid)).toBe(false);
    expect(details.rolling.excludedZero.filter((row) => row.pid === pid)).toHaveLength(d.sales[0].series.length - 3);
    expect(Number.isFinite(details.rolling.error)).toBe(true);
  });

  it("reports insufficient history instead of an invented latest average", () => {
    const d = buildData("mixed");
    d.sales.forEach((s) => { s.series = s.series.slice(0, 3); });
    const details = explainAccuracy(d);
    expect(details.latest.rows).toEqual([]);
    expect(details.latest.error).toBeNull();
    expect(details.latest.best).toBeNull();
    expect(details.latest.worst).toBeNull();
    expect(details.rolling.rows).toEqual([]);
    expect(details.rolling.tests).toBe(0);
    expect(details.insufficient).toHaveLength(d.products.length);
  });

  it("reproduces non-default settings and precision before display rounding", () => {
    const d = buildData("mixed");
    const cfg = { ...configOf(d), wmaWeight: 0.2, trendWeight: 0.8 };
    const details = explainAccuracy(d, cfg), rolling = backtestMulti(d, cfg);
    expect(details.config.wmaWeight).toBe(0.2);
    expect(details.rolling.error).toBe(rolling.error);
    expect(mean(details.rolling.rows.map((row) => row.error))).toBeCloseTo(rolling.error, 12);
    for (const row of details.latest.rows) expect(row.forecast).toBe(forecastFrom(row.history, cfg).forecast);
  });
});
