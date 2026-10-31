import { describe, expect, it } from "vitest";
import { buildData } from "../src/lib/seed.js";
import { applyAction } from "../src/lib/actions.js";
import { analyse, backtestMulti, budgetLeft, forecastFrom, salesStats } from "../src/lib/engine.js";
import { DEFAULT_FORECAST_CONFIG, configOf, historyMode, validateConfig } from "../src/lib/forecast.js";

describe("forecast settings", () => {
  it("defaults keep the original 50/50 forecast", () => {
    expect(forecastFrom([80, 95, 110, 130, 150, 170]).forecast).toBe(171);
    expect(configOf(buildData("mixed"))).toMatchObject(DEFAULT_FORECAST_CONFIG);
  });

  it("the blend changes the forecast", () => {
    const s = [80, 95, 110, 130, 150, 170];
    expect(forecastFrom(s, { ...DEFAULT_FORECAST_CONFIG, wmaWeight: 0.2, trendWeight: 0.8 }).forecast).not.toBe(171);
  });

  it("rejects unknown settings, out-of-range numbers and weights that don't add up", () => {
    expect(validateConfig({ wmaWeight: 0.9 }).ok).toBe(false);
    expect(validateConfig({ magic: 1 }).ok).toBe(false);
    expect(validateConfig({ wmaWeight: 0.6, trendWeight: 0.6 }).ok).toBe(false);
    expect(validateConfig("eval(...)").ok).toBe(false);
    expect(validateConfig({ wmaWeight: 0.3, safetyPct: 0.25 })).toMatchObject({ ok: true, values: { wmaWeight: 0.3, trendWeight: 0.7, safetyPct: 0.25 } });
  });

  it("backtests across several months and against the simple 3-month average", () => {
    const b = backtestMulti(buildData("mixed"));
    expect(b.tests).toBeGreaterThan(8);
    expect(b.error).toBeLessThan(b.baseline);
  });

  it("only derived statistics are prepared for Gemini", () => {
    const st = salesStats(buildData("mixed"));
    expect(st.monthsOfHistory).toBe(6);
    expect(Object.keys(st.backtestErrorPercentByWmaWeight)).toHaveLength(7);
    expect(JSON.stringify(st)).not.toMatch(/series|\[80,95/);
  });

  it("cold start: little history means default settings only", () => {
    expect(historyMode(2).key).toBe("none");
    expect(historyMode(4).key).toBe("limited");
    expect(historyMode(6).key).toBe("enough");
  });
});

describe("approving forecast settings", () => {
  it("only the Owner or a Manager can approve; approved settings change new plans and are logged", () => {
    const d = buildData("mixed"), before = analyse(d, budgetLeft(d)).items.find((i) => i.pid === "p1").g.forecast;
    expect(() => applyAction(d, "u3", "applyForecastConfig", { values: { wmaWeight: 0.2 } })).toThrow(/Owner or a Manager/);
    applyAction(d, "u2", "applyForecastConfig", { values: { wmaWeight: 0.2 }, source: "ai", model: "gemini-test" });
    expect(d.settings.forecastConfig).toMatchObject({ source: "ai", approvedBy: "u2", values: { wmaWeight: 0.2, trendWeight: 0.8 } });
    expect(analyse(d, budgetLeft(d)).items.find((i) => i.pid === "p1").g.forecast).not.toBe(before);
    expect(d.logs[0].action).toBe("FORECAST_CONFIG");
    applyAction(d, "u1", "resetForecastConfig");
    expect(configOf(d).wmaWeight).toBe(0.5);
  });

  it("refuses settings outside the safe range", () => {
    const d = buildData("mixed");
    expect(() => applyAction(d, "u1", "applyForecastConfig", { values: { safetyPct: 3 } })).toThrow(/can't be used/);
  });

  it("the business type sets the defaults until settings are approved", () => {
    const d = buildData("mixed");
    applyAction(d, "u1", "setBusinessProfile", { businessType: "fnb", businessYears: "2" });
    expect(configOf(d)).toMatchObject({ overstockDays: 21, safetyPct: 0.3 });
  });
});
