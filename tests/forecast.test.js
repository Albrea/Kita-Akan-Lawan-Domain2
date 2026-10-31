import { describe, expect, it } from "vitest";
import { buildData } from "../src/lib/seed.js";
import { applyAction } from "../src/lib/actions.js";
import {
  analyse,
  backtestMulti,
  budgetLeft,
  forecastFrom,
  salesStats,
} from "../src/lib/engine.js";
import {
  BOUNDS,
  DEFAULT_FORECAST_CONFIG,
  SETTINGS_UI,
  configOf,
  historyMode,
  settingText,
  uiRange,
  validateConfig,
} from "../src/lib/forecast.js";

describe("forecast settings", () => {
  it("defaults keep the original 50/50 forecast", () => {
    expect(forecastFrom([80, 95, 110, 130, 150, 170]).forecast).toBe(171);
    expect(configOf(buildData("mixed"))).toMatchObject(DEFAULT_FORECAST_CONFIG);
  });

  it("the blend changes the forecast", () => {
    const s = [80, 95, 110, 130, 150, 170];
    expect(
      forecastFrom(s, {
        ...DEFAULT_FORECAST_CONFIG,
        wmaWeight: 0.2,
        trendWeight: 0.8,
      }).forecast,
    ).not.toBe(171);
  });

  it("rejects unknown settings, out-of-range numbers and weights that don't add up", () => {
    expect(validateConfig({ wmaWeight: 0.9 }).ok).toBe(false);
    expect(validateConfig({ magic: 1 }).ok).toBe(false);
    expect(validateConfig({ wmaWeight: 0.6, trendWeight: 0.6 }).ok).toBe(false);
    expect(validateConfig("eval(...)").ok).toBe(false);
    expect(validateConfig({ wmaWeight: 0.3, safetyPct: 0.25 })).toMatchObject({
      ok: true,
      values: { wmaWeight: 0.3, trendWeight: 0.7, safetyPct: 0.25 },
    });
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
    const d = buildData("mixed"),
      before = analyse(d, budgetLeft(d)).items.find((i) => i.pid === "p1").g
        .forecast;
    expect(() =>
      applyAction(d, "u3", "applyForecastConfig", {
        values: { wmaWeight: 0.2 },
      }),
    ).toThrow(/Owner or a Manager/);
    applyAction(d, "u2", "applyForecastConfig", {
      values: { wmaWeight: 0.2 },
      source: "ai",
      model: "gemini-test",
    });
    expect(d.settings.forecastConfig).toMatchObject({
      source: "ai",
      approvedBy: "u2",
      values: { wmaWeight: 0.2, trendWeight: 0.8 },
    });
    expect(
      analyse(d, budgetLeft(d)).items.find((i) => i.pid === "p1").g.forecast,
    ).not.toBe(before);
    expect(d.logs[0].action).toBe("FORECAST_CONFIG");
    applyAction(d, "u1", "resetForecastConfig");
    expect(configOf(d).wmaWeight).toBe(0.5);
  });

  it("refuses settings outside the safe range", () => {
    const d = buildData("mixed");
    expect(() =>
      applyAction(d, "u1", "applyForecastConfig", { values: { safetyPct: 3 } }),
    ).toThrow(/can't be used/);
  });

  it("the business type sets the defaults until settings are approved", () => {
    const d = buildData("mixed");
    applyAction(d, "u1", "setBusinessProfile", {
      businessType: "fnb",
      businessYears: "2",
    });
    expect(configOf(d)).toMatchObject({ overstockDays: 21, safetyPct: 0.3 });
  });
});

describe("settings shown in % and days", () => {
  it("people type whole percentages or days, and the engine gets its own units back", () => {
    expect(uiRange("sellWindow")).toEqual([30, 60]);
    expect(uiRange("overstockDays")).toEqual([14, 90]);
    expect(uiRange("safetyPct")).toEqual([10, 40]);
    expect(SETTINGS_UI.sellWindow.fromUi(45)).toBe(1.5);
    expect(SETTINGS_UI.safetyPct.fromUi(30)).toBe(0.3);
    Object.keys(SETTINGS_UI).forEach((k) =>
      BOUNDS[k].forEach((v) =>
        expect(SETTINGS_UI[k].fromUi(SETTINGS_UI[k].toUi(v))).toBe(v),
      ),
    );
  });

  it("describes settings in plain words", () => {
    expect(settingText("sellWindow", 1.5)).toBe("45 days");
    expect(settingText("overstockDays", 45)).toBe("45 days");
    expect(settingText("wmaWeight", 0.2)).toBe("20% (trend 80%)");
    const d = buildData("mixed");
    applyAction(d, "u1", "applyForecastConfig", {
      values: { sellWindow: 1.5, safetyPct: 0.3 },
    });
    expect(d.logs[0].text).toMatch(
      /safety stock 30%, stock must sell within 45 days/,
    );
  });
});
