"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../App.jsx";
import { AiSourceChip, Bullets, DotIc, Empty, Icon, PoCell, ReqChip, Select, Spark, confColor, reasonIcon } from "../ui.jsx";
import {
  analyse, backtest, backtestMulti, budgetLeft, configOf, checks, inPlan, openPOs, overridesOf, poOf, routeTo, sendBlock, setItemIncluded, setItemQty,
  spentThisMonth, summaryBullets, userOf,
} from "@/lib/engine.js";
import { SCENARIOS } from "@/lib/seed.js";
import { ROLE_LABEL } from "@/lib/actions.js";
import { clone, digits, list, num, pct, plural, rm, toJSON } from "@/lib/format.js";
import { monthName } from "@/lib/i18n.js";
import { BUSINESS_TYPES, SETTINGS_UI, historyMode, typeDefaults, uiRange, validateConfig } from "@/lib/forecast.js";

const REDUCED = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function routeText(d, t) {
  return t("Goes to {names}.", { names: list(routeTo(d).map((u) => `${u.name} (${t(ROLE_LABEL[u.role])})`)) });
}

/* Where the most recent plan is in the 6-step workflow. */
function flowStage(d, phase) {
  const r = d.requests[0];
  if (phase === "thinking" || phase === "writing") return 2;
  if (phase === "done") return 3;
  if (!r || r.status === "REJECTED") return 1;
  if (r.status === "PENDING") return 4;
  const pos = (r.poIds || []).map((id) => poOf(d, id)).filter(Boolean);
  if (pos.some((p) => !p.sentAt)) return 5;
  return pos.every((p) => p.status === "RECEIVED") ? 7 : 6;
}
function FlowBar() {
  const { d, ui, t } = useApp();
  const now = flowStage(d, ui.ai.phase);
  return (
    <div className="flow" aria-label={t("Restock workflow")}>
      {["Alert or budget", "AI plan", "Send", "Approve", "Order supplier", "Receive"].map((s, i) => (
        <span key={s} className={`flow-step ${i + 1 < now ? "done" : i + 1 === now ? "now" : ""}`}>
          <b>{i + 1 < now ? <Icon n="check" size={11} sw={3} /> : i + 1}</b>{t(s)}
        </span>
      ))}
    </div>
  );
}

const thinkSteps = (d, ai, t, tp, lang) => [
  t("Reading stock: {a} products, {b} pieces", { a: d.products.length, b: num(d.products.reduce((s, p) => s + p.stock, 0)) }),
  t("Reading {n} months of sales ({from}–{to})", { n: d.settings.salesMonths.length, from: monthName(lang, d.settings.salesMonths[0]), to: monthName(lang, d.settings.salesMonths.at(-1)) }),
  t("Forecasting sales for the next 30 days"),
  tp(openPOs(d).length, "Checking margins, stock days and {n} open order", "Checking margins, stock days and {n} open orders"),
  ai.ideal ? t("Working out what everything would cost") : t("Fitting purchases into {x}", { x: rm(+digits(ai.budget) || 0) }),
];

export default function AiRestock() {
  const { d, me, ui, setAi, can, go, act, toast, switchScenario, offline, t, tp, lang, when, who } = useApp();
  const a = ui.ai, r = a.result, b = +a.budget || 0;
  const mb = d.settings.monthlyBudget, spent = spentThisMonth(d), left = budgetLeft(d);
  const plan = d.alerts.find((x) => x.open && x.type === "PLAN");
  const mine = d.requests.filter((x) => can("approveAI") || x.by === me.id).slice(0, 4);
  const busy = a.phase === "thinking" || a.phase === "writing";
  useGeminiSummary();

  /* Arriving from the Dashboard: put the cursor in the budget box so the person checks it first. */
  useEffect(() => {
    if (!a.focus) return;
    const el = document.getElementById("budget");
    if (el) { el.focus(); el.select(); el.scrollIntoView({ block: "center" }); }
  }, [a.focus]);

  /* The "thinking" walk-through, one step at a time, then the deterministic analysis. */
  useEffect(() => {
    if (a.phase !== "thinking") return;
    const steps = thinkSteps(d, a, t, tp, lang).length;
    const tm = setTimeout(() => {
      if (a.step + 1 < steps) return setAi({ step: a.step + 1 });
      const budget = a.ideal ? Infinity : +digits(a.budget);
      const res = analyse(d, budget);
      // The numbers are ready; the loading card stays up while Gemini writes the summary (see useGeminiSummary).
      setAi({ step: steps, phase: offline ? "done" : "writing", result: res, summary: null });
      if (!offline) act("logAnalysis", { text: res.ideal ? `AI worked out the ideal plan: ${rm(res.t.cost)} for ${plural(res.t.buy.length, "product")}.` : `AI analysed a ${rm(budget)} budget: ${res.t.buy.length} buy, ${res.t.skip.length} don't buy, ${res.t.wait.length} wait. Expected profit ${rm(res.t.profit)}.` });
    }, REDUCED() ? 60 : 380);
    return () => clearTimeout(tm);
  }, [a.phase, a.step]); // eslint-disable-line react-hooks/exhaustive-deps

  function start(ideal = a.ideal) {
    const bud = +digits(a.budget);
    if (!ideal && !(bud >= 100)) return toast(t("Enter a budget of at least RM 100, or turn on No limit."), true);
    setAi({ phase: "thinking", step: 0, result: null, auto: false, filter: null, open: {}, ideal, summary: null, ...(ideal ? {} : { budget: String(bud) }) });
  }
  const setBudget = (v) => setAi({ budget: digits(v), ideal: false });
  const setIdeal = (on) => { if (on) start(true); else setAi({ ideal: false, budget: String(left) }); };

  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">{t("AI Restock")}</h1><p className="page-sub">{t("AI checks your stock, sales and budget, then tells you what to buy, what to skip, and why.")}</p></div>
        <span className="chip chip-ai"><Icon n="bot" size={14} /> {t("Numbers by StockNow · wording by Gemini")}</span>
      </div>
      <FlowBar />
      <div className="row wrap" style={{ justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div className="tabs">
          <button className={`tab ${(a.tab || "plan") === "plan" ? "on" : ""}`} onClick={() => setAi({ tab: "plan" })}>{t("Restock plan")}</button>
          <button className={`tab ${a.tab === "accuracy" ? "on" : ""}`} onClick={() => setAi({ tab: "accuracy" })}>{t("Accuracy check")}</button>
          <button className={`tab ${a.tab === "settings" ? "on" : ""}`} onClick={() => setAi({ tab: "settings" })}>{t("Forecast settings")}</button>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <label className="muted small" htmlFor="scn">{t("Demo data")}</label>
          <div style={{ width: 230, maxWidth: "60vw" }}><Select id="scn" cls="sm" value={d.settings.scenario} onChange={switchScenario} options={Object.entries(SCENARIOS).map(([k, x]) => [k, t(x.label)])} /></div>
        </div>
      </div>

      <div className="ai-layout"><div className="stack" style={{ gap: 20 }}>
        {a.tab === "accuracy" ? <AccuracyView /> : a.tab === "settings" ? <ForecastSettings /> : (
          <>
            <div className="card card-pad" style={{ borderColor: "var(--ai-br)" }}>
              <div className="budget-tiles">
                <div className="btile"><DotIc ic="wallet" tone="ai" /><div className="stack"><span className="muted small">{t("Monthly budget")}</span><span className="v">{rm(mb)}</span>
                  {can("setBudget") ? <BudgetChangeButton /> : null}</div></div>
                <div className="btile"><DotIc ic="approve" tone="blue" /><div className="stack"><span className="muted small">{t("Used this month")}</span><span className="v">{rm(spent)}</span></div></div>
                <div className="btile"><DotIc ic="coins" tone={left > 0 ? "green" : "red"} /><div className="stack" style={{ flex: 1 }}><span className="muted small">{t("Left to spend")}</span><span className="v">{rm(left)}</span>
                  <div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${mb ? Math.round((left / mb) * 100) : 0}%` }} /></div></div></div>
              </div>
              <label className="label" htmlFor="budget">{t("Budget for this plan")}</label>
              <div className="row wrap" style={{ gap: 12 }}>
                <div className="budget-input"><span>RM</span>
                  <input className="input" id="budget" inputMode="numeric" value={a.ideal ? "" : a.budget} placeholder={a.ideal ? t("No limit") : String(left)}
                    onChange={(e) => setBudget(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") start(false); }} disabled={busy} />
                </div>
                <button className="btn btn-ai btn-lg" onClick={() => start(false)} disabled={busy}><Icon n="spark" size={20} /> {t(r ? "Analyse again" : "Analyse with AI")}</button>
              </div>
              <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
                <div className="chips">
                  <button className={`qchip ${!a.ideal && b === left ? "on" : ""}`} onClick={() => setBudget(String(left))}>{t("Budget left · {x}", { x: rm(left) })}</button>
                  {[10000, 20000, 30000].filter((v) => v !== left).map((v) => <button key={v} className={`qchip ${!a.ideal && b === v ? "on" : ""}`} onClick={() => setBudget(String(v))}>{rm(v)}</button>)}
                </div>
                <span className="spacer" />
                <label className="switch"><input type="checkbox" checked={a.ideal} onChange={(e) => setIdeal(e.target.checked)} /> {t("No limit: show what everything costs")}</label>
              </div>
              <div className="reads">
                <span><Icon n="box" size={14} /> {tp(d.products.length, "{n} product", "{n} products")}</span>
                <span><Icon n="activity" size={14} /> {t("{n} months of sales", { n: d.settings.salesMonths.length })}</span>
                <span><Icon n="tag" size={14} /> {t("cost & selling prices")}</span>
                <span><Icon n="truck" size={14} /> {tp(openPOs(d).length, "{n} open order", "{n} open orders")}</span>
              </div>
            </div>

            {busy ? <ThinkingCard /> : null}
            {!busy && r ? <ResultView /> : null}
            {a.phase === "idle" && !r ? (
              <div className="card">
                {plan ? (
                  <div className="todo"><DotIc ic="spark" tone="ai" />
                    <span className="stack"><span className="bold">{t("Time to plan this month's restock")}</span><span className="muted small">{t("The budget left this month ({left}) is filled in. Change it if you like, then press Analyse with AI.", { left: rm(left) })}</span></span></div>
                ) : null}
                <Empty title={t("Ready when you are")} text={t("Pick a budget and press Analyse. Or turn on No limit to see how much money everything would need.")} ic="spark" />
              </div>
            ) : null}

            {mine.length ? (
              <div className="card">
                <div className="card-head"><h2 className="card-title">{t(can("approveAI") ? "Recent plans" : "My plans")}</h2>{can("approveAI") ? <button className="btn btn-link" onClick={() => go("approvals")}>{t("Open approvals")}</button> : null}</div>
                <div className="scroll-x"><table style={{ minWidth: 640 }}>
                  <thead><tr><th>{t("Plan")}</th><th>{t("Sent by")}</th><th className="right">{t("Purchase")}</th><th>{t("Status")}</th><th>{t("Supplier orders")}</th></tr></thead>
                  <tbody>{mine.map((x) => (
                    <tr key={x.id}>
                      <td><span className="mono bold">{x.code}</span><div className="faint small">{when(x.at)}</div></td>
                      <td>{who(x.by)}</td>
                      <td className="right num">{rm(x.items.reduce((s, i) => s + i.cost, 0))}</td>
                      <td><ReqChip status={x.status} />{x.decisionNote ? <div className="faint small" style={{ maxWidth: 240 }}>“{x.decisionNote}”</div> : null}</td>
                      <td><PoCell d={d} ids={x.poIds} /></td>
                    </tr>
                  ))}</tbody>
                </table></div>
              </div>
            ) : null}
          </>
        )}
      </div></div>
    </>
  );
}

function BudgetChangeButton() {
  const { openModal, t } = useApp();
  return <button className="btn btn-link btn-sm" style={{ height: 26, padding: "0 8px", alignSelf: "flex-start", marginTop: 2 }} onClick={() => openModal("budget")}>{t("Change")}</button>;
}

/* One loading card for the whole analysis: the engine's steps, then Gemini writing the summary. */
function ThinkingCard() {
  const { d, ui, t, tp, lang, offline } = useApp();
  const writing = ui.ai.phase === "writing";
  const steps = [...thinkSteps(d, ui.ai, t, tp, lang), ...(offline ? [] : [t("Gemini is writing the summary…")])], s = ui.ai.step;
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!writing) return setSecs(0);
    const tm = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => clearInterval(tm);
  }, [writing]);
  return (
    <div className="card thinking" style={{ borderColor: "var(--ai-br)" }} aria-live="polite" aria-busy="true">
      <div className="row" style={{ marginBottom: 8 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="bot" size={20} /></span><h2 className="card-title">{t("AI is analysing your shop…")}</h2></div>
      {steps.map((x, i) => (
        <div key={i} className={`think-step ${i < s ? "done" : i === s ? "now" : ""}`}>
          <span className="think-dot">{i < s ? <Icon n="check" size={12} sw={3} /> : null}</span>
          <span>{x}{writing && i === s ? <span className="faint"> · {t("{n} s", { n: secs })}</span> : null}</span>
        </div>
      ))}
      {writing ? <p className="muted small" style={{ margin: "4px 0 10px 30px" }}>{t("The numbers are ready. Gemini is turning them into plain words; this can take up to a minute.")}</p> : null}
      <div className={`bar ${writing ? "indeterminate" : ""}`}><i style={{ width: `${Math.round((s / steps.length) * 100)}%` }} /></div>
    </div>
  );
}

/* Gemini's paragraph about the current plan. Re-written (debounced) whenever quantities change. */
function useGeminiSummary() {
  const { ui, setAi, offline } = useApp();
  const r = ui.ai.result, phase = ui.ai.phase;
  const key = r ? toJSON({ b: r.ideal ? "ideal" : r.budget, o: overridesOf(r) }) : "";
  const latest = useRef("");
  useEffect(() => {
    if (offline && phase === "writing") return setAi({ phase: "done" });
    if (!r || offline || phase === "thinking" || phase === "idle") return;
    if (ui.ai.summary?.key === key) { if (phase === "writing" && !ui.ai.summary.loading) setAi({ phase: "done" }); return; }
    latest.current = key;
    setAi((ai) => ({ summary: { ...(ai.summary?.key ? ai.summary : {}), key, loading: true } }));
    // While the loading card is up, ask at once; after small edits (quantities), wait a moment so typing doesn't spam Gemini.
    const tm = setTimeout(async () => {
      let summary;
      try {
        const res = await fetch("/api/ai/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: toJSON({ budget: r.ideal ? "ideal" : r.budget, overrides: overridesOf(r) }) });
        const out = await res.json();
        summary = { key, loading: false, text: out.text, source: out.source, reason: out.reason, note: out.note };
      } catch {
        summary = { key, loading: false, text: "", source: "template", reason: "error", note: "No connection" };
      }
      if (latest.current === key) setAi((ai) => ({ summary, ...(ai.phase === "writing" ? { phase: "done" } : {}) }));
    }, phase === "writing" ? 0 : 700);
    return () => clearTimeout(tm);
  }, [key, offline, phase]); // eslint-disable-line react-hooks/exhaustive-deps
}

function SummaryBox({ r }) {
  const { ui, offline, t } = useApp();
  const s = offline ? { source: "offline" } : ui.ai.summary;
  const text = s?.text || r.summary.replace(/\*\*/g, ""); // while Gemini updates after an edit, the last summary stays readable
  return (
    <div className="summary-box" aria-live="polite">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
        <span className="eyebrow" style={{ color: "var(--ai-fg)" }}>{t("In short")}</span>
        {s?.loading ? <span className="chip chip-ai"><span className="spin sm" /> {t("Gemini is updating the summary…")}</span> : <AiSourceChip s={s} long />}
      </div>
      <p className="ai-text" style={s?.loading ? { opacity: 0.55 } : undefined}>{text}</p>
    </div>
  );
}

function WhatIf({ r }) {
  const { d, setAi, t } = useApp();
  const [v, setV] = useState(Math.min(50000, Math.max(5000, r.budget)));
  const commit = () => { if (v !== r.budget) setAi({ budget: String(v), ideal: false, result: analyse(d, v), filter: null, summary: null }); };
  return (
    <details className="more" style={{ marginTop: 14 }}>
      <summary><Icon n="coins" size={14} /> {t("Try another budget")}</summary>
      <div style={{ marginTop: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}><span className="muted small">{t("Drag and release to re-plan")}</span><span className="bold num" style={{ color: "var(--ai)" }}>{rm(v)}</span></div>
        <input type="range" className="slider" aria-label={t("Budget")} min="5000" max="50000" step="1000" value={v}
          onChange={(e) => setV(+e.target.value)} onPointerUp={commit} onKeyUp={commit} onTouchEnd={commit} />
      </div>
    </details>
  );
}

function ResultView() {
  const { d, ui, setAi, openModal, t, tp } = useApp();
  const r = ui.ai.result, tt = r.t, c = checks(d, r), f = ui.ai.filter;
  const tied = tt.skip.reduce((s, i) => s + i.stock * i.unitCost, 0);
  const waitCost = tt.wait.reduce((s, i) => s + i.need * i.unitCost, 0);
  const segs = tt.buy.map((i, k) => ({ i, w: (i.cost / Math.max(r.ideal ? tt.cost : r.budget, tt.cost, 1)) * 100, col: `var(--seg${(k % 6) + 1})` }));
  const shown = r.items.filter((i) => !f || (f === "buy" ? inPlan(i) : f === "wait" ? i.decision === "BUY" && !inPlan(i) : i.decision === "DO_NOT_BUY"));
  const block = sendBlock(d, r);
  const setFilter = (x) => setAi({ filter: f === x ? null : x });
  const verdict = (key, ic, bg, fg, n, label) => (
    <button className={`verdict ${f === key ? "on" : ""}`} aria-pressed={f === key} onClick={() => setFilter(key)}>
      <span className="ic" style={{ background: bg, color: fg }}><Icon n={ic} size={20} /></span>
      <span className="stack"><span className="n">{n}</span><span className="small muted">{label}</span></span>
    </button>
  );

  return (
    <>
      <div className="card card-pad" style={{ borderColor: "var(--ai-br)" }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap" }}>
          <div className="row" style={{ gap: 8 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="spark" /></span><h2 className="card-title">{t(r.ideal ? "Ideal plan (no budget limit)" : "What AI found")}</h2></div>
          <span className="chip chip-ai">{t(ui.ai.auto ? "Drafted automatically" : "AI analysis")} · {r.at.split(" ")[1]}</span>
        </div>
        <div className="verdicts" role="group" aria-label={t("Filter by decision")}>
          {verdict("buy", "cart", "var(--green-bg)", "var(--green-fg)", tt.buy.length, `${t("Buy")} · ${rm(tt.cost)}`)}
          {verdict("wait", "pause", "var(--amber-bg)", "var(--amber-fg)", tt.wait.length, `${t("Wait")}${waitCost ? ` · ${t("needs {x}", { x: rm(waitCost) })}` : ""}`)}
          {verdict("skip", "ban", "var(--red-bg)", "var(--red-fg)", tt.skip.length, `${t("Don't buy")} · ${t("{x} sitting", { x: rm(tied) })}`)}
        </div>
        <SummaryBox r={r} />
        <Bullets items={summaryBullets(d, r)} style={{ marginTop: 18 }} />
        <div className="row wrap" style={{ marginTop: 14, gap: 6 }}>
          {c.over ? <span className="chip chip-red"><Icon n="close" size={12} sw={2.6} /> {t("Over budget")}</span> : null}
          <details className="more">
            <summary><span className="chip chip-green"><Icon n="check" size={12} sw={2.6} /> {t("{n} checks passed", { n: c.ok.length })}</span></summary>
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>{c.ok.map((x) => <span key={x} className="chip chip-green"><Icon n="check" size={12} sw={2.6} /> {x}</span>)}</div>
          </details>
          {c.warn.map((x) => <span key={x} className="chip chip-amber" title={t("Needs your judgement")}><Icon n="warning" size={12} sw={2} /> {x}</span>)}
        </div>
        {tt.buy.length ? (
          <div style={{ marginTop: 16 }}>
            <div className="alloc" role="img" aria-label={t("Where the money goes")}>{segs.map((s) => <i key={s.i.pid} style={{ width: `${s.w}%`, background: s.col }} title={`${s.i.name} ${rm(s.i.cost)}`} />)}</div>
            <div className="legend">
              {segs.map((s) => <span key={s.i.pid}><i style={{ background: s.col }} />{s.i.short} {rm(s.i.cost)}</span>)}
              {!r.ideal && tt.left > 0 ? <span><i style={{ background: "var(--divider)", border: "1px solid var(--border)" }} />{t("Unspent {x}", { x: rm(tt.left) })}</span> : null}
            </div>
          </div>
        ) : null}
        {r.ideal ? null : <WhatIf key={r.at + r.budget} r={r} />}
      </div>

      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h2 className="card-title">{t(f === "buy" ? "Buy" : f === "wait" ? "Wait" : f === "skip" ? "Don't buy" : "All products")} <span className="muted" style={{ fontWeight: 400 }}>({shown.length})</span></h2>
        <span className="muted small">{t("Tap a product to see how AI decided · change quantities with − / +")}</span>
      </div>
      <div className="plan">
        <div className="plan-cols"><span /><span>{t("Product")}</span><span>{t("Quantity")}</span><span className="right">{t("Cost")}</span><span className="right">{t("Profit")}</span><span>{t("Confidence")}</span><span /></div>
        {shown.length ? shown.map((i) => <PlanRow key={i.pid} i={i} />) : <div className="card"><Empty title={t("Nothing here")} text={t("Pick another filter above.")} ic="check" /></div>}
      </div>

      <div className="send-bar">
        <div className="stack"><span className="bold">{tp(tt.buy.length, "{n} item", "{n} items")} · {rm(tt.cost)} · {t("expected profit {x}", { x: rm(tt.profit) })}</span><span className="muted small">{block || routeText(d, t)}</span></div>
        <span className="spacer" />
        <button className="btn btn-ai btn-lg" disabled={!!block} onClick={() => openModal("send")}><Icon n="send" size={18} /> {t("Send to Approval")}</button>
      </div>
    </>
  );
}

function PlanRow({ i }) {
  const { ui, setAi, openModal, t, days } = useApp();
  const g = i.g, on = inPlan(i), open = !!ui.ai.open[i.pid];
  const kind = i.decision === "DO_NOT_BUY" ? "skip" : !on ? "wait" : i.qty < i.need ? "partial" : "buy";
  const [ic, tone] = { buy: ["cart", "green"], partial: ["cart", "amber"], wait: ["pause", "amber"], skip: ["ban", "red"] }[kind];
  const label = t({ buy: "BUY", partial: "BUY · REDUCED", wait: "WAIT", skip: "DON'T BUY" }[kind]);
  const edit = (fn) => setAi((a) => ({ result: fn(clone(a.result)) }));
  const setQty = (v) => edit((r) => setItemQty(r, i.pid, +digits(v) || 0));
  const toggle = () => setAi((a) => ({ open: { ...a.open, [i.pid]: !a.open[i.pid] } }));
  const stop = (e) => e.stopPropagation();
  const qtyCell = i.decision === "BUY"
    ? on ? (
      <div className="stepper" onClick={stop}>
        <button aria-label={t("Fewer")} onClick={() => setQty(Math.max(0, i.qty - 5))}><Icon n="minus" size={14} sw={2.2} /></button>
        <input inputMode="numeric" aria-label={t("Quantity for {name}", { name: i.name })} value={i.qty} onChange={(e) => setQty(e.target.value)} />
        <button aria-label={t("More")} onClick={() => setQty(i.qty + 5)}><Icon n="plus" size={14} sw={2.2} /></button>
      </div>
    ) : <button className="btn btn-ghost-ai btn-sm" onClick={(e) => { stop(e); edit((r) => setItemIncluded(r, i.pid, true)); }}><Icon n="plus" size={14} /> {t("Add {n}", { n: i.need })}</button>
    : <span className="faint small">—</span>;
  const cover = Math.min(100, g.cover === Infinity ? 100 : (g.cover / 30) * 100);
  const coverCol = g.cover < 7 ? "var(--red-fg)" : g.cover < 14 ? "var(--amber-fg)" : "var(--green-fg)";

  return (
    <div className={`plan-row ${open ? "open" : ""} ${i.decision === "BUY" && !on ? "off" : ""}`}>
      <div className="plan-head" role="button" tabIndex={0} aria-expanded={open} onClick={toggle}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(); } }}>
        <DotIc ic={ic} tone={tone} />
        <div className="stack">
          <span className="plan-name">{i.name}<span className={`badge ${kind}`}>{label}</span></span>
          <span className="plan-sub">{i.stock === 0 ? t("Out of stock") : t("{n} in stock · lasts {days}", { n: i.stock, days: days(g.cover) })}{g.incoming ? ` · ${t("{n} on order", { n: g.incoming })}` : ""}</span>
          <span className="plan-sub m-only">{on ? `${t("{n} pcs", { n: i.qty })} · ${rm(i.cost)} · ${t("profit {x}", { x: rm(i.profit) })}` : i.decision === "BUY" ? `${t("Needs {n} pcs", { n: i.need })} · ${rm(i.need * i.unitCost)}` : i.reasons[0]}</span>
        </div>
        <div className="d-only">{qtyCell}</div>
        <span className="right num d-only">{on ? rm(i.cost) : "—"}</span>
        <span className="right num bold d-only" style={{ color: "var(--green-fg)" }}>{on ? rm(i.profit) : "—"}</span>
        <span className="cbar d-only" title={t("AI confidence")}><span><i style={{ width: `${g.conf}%`, background: confColor(g.conf) }} /></span>{g.conf}%</span>
        <span className="chev"><Icon n="chevronRight" /></span>
      </div>
      {open ? (
        <div className="plan-body">
          <div className="stack" style={{ gap: 14 }}>
            <div className="m-only">{qtyCell}</div>
            <div><div className="eyebrow" style={{ marginBottom: 8 }}>{t("How AI decided")}</div><DecideStrip i={i} /></div>
            <div>
              <div className="eyebrow">{t("Stock runway")}</div>
              <div className="runway"><i style={{ width: `${cover}%`, background: coverCol }} /></div>
              <div className="small muted">{i.stock === 0 ? t("Empty now") : t("Lasts {days}", { days: days(g.cover) })} · {t("{n} sales a day", { n: g.daily.toFixed(1) })}{g.cover < 30 ? ` · ${t("target 30 days")}` : ""}</div>
            </div>
          </div>
          <div className="stack" style={{ gap: 12 }}>
            <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
              <Spark s={g.series} pred={g.forecast} />
              <div className="stack" style={{ textAlign: "right" }}><span className="faint small">{t("Next 30 days")}</span><span className="bold num">{g.forecast} <Icon n={g.trend === "Rising" ? "up" : g.trend === "Falling" ? "down" : "dot"} size={14} /></span></div>
            </div>
            <ul className="reasons">{i.reasons.map((x) => { const [ri, rt] = reasonIcon(x); return <li key={x}><DotIc ic={ri} tone={rt} size={13} /><span>{x}</span></li>; })}</ul>
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => openModal("calc", { pid: i.pid })}><Icon n="calc" size={14} /> {t("Show calculation")}</button>
              {on ? <button className="btn btn-secondary btn-sm" onClick={() => edit((r) => setItemIncluded(r, i.pid, false))}>{t("Remove from plan")}</button> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DecideStrip({ i }) {
  const { d, t } = useApp();
  const g = i.g, ENGINE = configOf(d);
  const box = (v, l, cls = "") => <div className={`stepbox ${cls}`} key={l}><b>{v}</b><span>{l.includes("%") ? l : t(l)}</span></div>;
  const op = (s, k) => <span className="op" key={k}>{s}</span>;
  let parts;
  if (i.decision === "BUY") {
    parts = [box(i.demandPlan, g.trend === "Falling" ? `${t("Forecast")} × ${pct(ENGINE.cautious)}` : "Will sell"), op("+", 1), box(i.safety, "Safety"), op("−", 2), box(i.stock, "In stock")];
    if (g.incoming) parts.push(op("−", 3), box(g.incoming, "On order"));
    parts.push(op("=", 4), box(i.need, "Needed", "final"));
    if (inPlan(i) && i.qty !== i.need) parts.push(op("→", 5), box(i.qty, "In plan", "final"));
  } else if (i.kind === "overstock") parts = [box(i.stock + g.incoming, "Have"), op("÷", 1), box(g.daily.toFixed(1), "Sold / day"), op("=", 2), box(Math.round(g.coverAll), "Days", "final"), op(">", 3), box(ENGINE.overstockDays, "Limit")];
  else if (i.kind === "margin") parts = [box(pct(g.margin), "Margin", "final"), op("<", 1), box(pct(ENGINE.lowMargin), "Minimum")];
  else if (i.kind === "falling") parts = [box(`−${pct(-g.growth)}`, "Demand", "final"), op("+", 1), box(i.stock, "In stock"), op("≥", 2), box(i.min, "Minimum")];
  else parts = [box(i.need, "Needed", "final")];
  return <div className="steps">{parts}</div>;
}

function AccuracyView() {
  const { d, t, lang } = useApp();
  const bt = backtest(d), M = d.settings.salesMonths.map((m) => monthName(lang, m)), last = M.at(-1), range = `${M[0]}–${M.at(-2)}`;
  const multi = backtestMulti(d);
  if (!bt.length) return <div className="card"><Empty title={t("Not enough history")} text={t("Products need 4 months of sales or more to test.")} ic="activity" /></div>;
  const mape = bt.reduce((s, x) => s + x.err, 0) / bt.length, within = bt.filter((x) => x.err <= 0.15).length;
  const best = [...bt].sort((a, b) => a.err - b.err)[0], worst = [...bt].sort((a, b) => b.err - a.err)[0];
  const max = Math.max(...bt.map((x) => Math.max(x.forecast, x.actual)), 1);
  const under = bt.filter((x) => x.diff < 0 && x.err > 0.1), off = bt.filter((x) => x.verdict === "Off");
  const tile = (ic, tone, k, v) => <div className="btile"><DotIc ic={ic} tone={tone} /><div className="stack"><span className="muted small">{k}</span><span className="v">{v}</span></div></div>;
  const vchip = (v) => <span className={`chip ${v === "Accurate" ? "chip-green" : v === "Close" ? "chip-amber" : "chip-red"}`}>{t(`verdict|${v}`)}</span>;
  return (
    <div className="card card-pad" style={{ borderColor: "var(--ai-br)" }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", marginBottom: 6 }}>
        <div className="row" style={{ gap: 8 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="target" /></span><h2 className="card-title">{t("Is the AI accurate? A backtest")}</h2></div>
        <span className="chip chip-ai">{range} → {t("predict {m}", { m: last })}</span>
      </div>
      <p className="muted" style={{ marginBottom: 16 }}>{t("We hid {last}'s sales from the AI, asked it to predict {last} using only {range}, then compared with what really sold. Same formula as the restock plan.", { last, range })}</p>
      {multi.tests ? <div className="notice ai" style={{ marginBottom: 16 }}><Icon n="activity" size={16} /><span>{t("Across every month with 3 months before it ({n} tests): {a} average error with the current forecast settings, {b} for the simple “average of the last 3 months” guess.", { n: multi.tests, a: <b>{pct(multi.error)}</b>, b: pct(multi.baseline) })}</span></div> : null}
      <div className="budget-tiles">
        {tile("target", "ai", t("Average error"), pct(mape))}
        {tile("check", "green", t("Within 15%"), t("{a} of {b} products", { a: within, b: bt.length }))}
        {tile("warning", worst.verdict === "Off" ? "red" : "amber", t("Biggest miss"), `${worst.p.short} ${pct(worst.err)}`)}
      </div>
      <div className="scroll-x"><table style={{ minWidth: 660 }}>
        <thead><tr><th>{t("Product")}</th><th>{t("Forecast vs actual")}</th><th className="right">{t("AI said")}</th><th className="right">{t("Really sold")}</th><th className="right">{t("Difference")}</th><th>{t("Result")}</th></tr></thead>
        <tbody>{bt.map((x) => (
          <tr key={x.p.id}>
            <td className="bold">{x.p.name}</td>
            <td><div className="pair" role="img" aria-label={t("Forecast {a}, actual {b}", { a: x.forecast, b: x.actual })}><i style={{ width: `${(x.forecast / max) * 100}%`, background: "var(--ai)" }} /><i style={{ width: `${(x.actual / max) * 100}%`, background: "var(--text-3)" }} /></div></td>
            <td className="right num">{x.forecast}</td>
            <td className="right num bold">{x.actual}</td>
            <td className="right num" style={{ color: x.err <= 0.1 ? "var(--green-fg)" : x.err <= 0.2 ? "var(--amber-fg)" : "var(--red-fg)" }}>{x.diff > 0 ? "+" : x.diff < 0 ? "−" : ""}{Math.abs(x.diff)} ({pct(x.err)})</td>
            <td>{vchip(x.verdict)}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <div className="legend" style={{ marginTop: 10 }}><span><i style={{ background: "var(--ai)" }} />{t("AI forecast")}</span><span><i style={{ background: "var(--text-3)" }} />{t("Really sold")}</span><span>{t("Accurate ≤ 10% · Close ≤ 20% · Off > 20%")}</span></div>
      <ul className="bullets" style={{ marginTop: 16 }}>
        <li><DotIc ic="check" tone="green" size={15} /><span>{t("Best: {name}, only {p} off. Steady sellers are easy to predict.", { name: <strong>{best.p.short}</strong>, p: pct(best.err) })}</span></li>
        {under.length ? <li><DotIc ic="up" tone="amber" size={15} /><span>{t("Fast risers are under-forecast ({list}). That's why AI adds safety stock on top of the forecast.", { list: list(under.map((x) => `${x.p.short} ${pct(x.err)}`)) })}</span></li> : null}
        {off.length ? <li><DotIc ic="warning" tone="red" size={15} /><span>{t("Off: {list}. Sales jumped suddenly, so AI shows lower confidence and a person should decide.", { list: list(off.map((x) => x.p.short)) })}</span></li> : null}
        <li><DotIc ic="activity" tone="blue" size={15} /><span>{t("This check runs on your own sales history, so accuracy is measured for your shop, not just claimed.")}</span></li>
      </ul>
    </div>
  );
}

/* ============================================================================
   Adaptive forecast settings: Gemini proposes bounded settings from derived sales statistics,
   StockNow validates and backtests them, and an Owner or Manager approves (or keeps the current ones).
   ============================================================================ */
/* Every setting is shown and typed as a whole % or a number of days (see SETTINGS_UI in forecast.js). */
const SETTING_KEYS = Object.keys(SETTINGS_UI);
function useSettingText() {
  const { t } = useApp();
  const text = (k, v) => {
    const u = SETTINGS_UI[k].toUi(v);
    if (k === "wmaWeight") return t("{a}% recent · {b}% trend", { a: u, b: 100 - u });
    return SETTINGS_UI[k].unit === "%" ? `${u}%` : t("{n} days", { n: u });
  };
  const range = (k) => { const [lo, hi] = uiRange(k); return SETTINGS_UI[k].unit === "%" ? `${lo}–${hi}%` : t("{a}–{b} days", { a: lo, b: hi }); };
  return { text, range };
}

function ForecastSettings() {
  const { d, me, can, act, offline, t, when } = useApp();
  const { text: f, range: rangeText } = useSettingText();
  const owner = can("forecastSettings");
  const cfg = configOf(d), saved = d.settings.forecastConfig, months = d.settings.salesMonths.length, mode = historyMode(months);
  const type = BUSINESS_TYPES[d.settings.businessType] || BUSINESS_TYPES.clothing;
  const [st, setSt] = useState({ phase: "idle" }); // idle | asking | proposal | error
  const [edit, setEdit] = useState(null); // the proposal's values as the person adjusts them
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (st.phase !== "asking") return setSecs(0);
    const tm = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => clearInterval(tm);
  }, [st.phase]);
  const now = backtestMulti(d);

  async function ask() {
    setSt({ phase: "asking" });
    try {
      const out = await (await fetch("/api/ai/configure", { method: "POST", headers: { "Content-Type": "application/json" }, body: toJSON({ actorId: me.id }) })).json();
      if (!out.ok) return setSt({ phase: "error", error: out.error });
      setEdit({ ...out.proposed });
      setSt({ phase: "proposal", ...out });
    } catch { setSt({ phase: "error", error: t("No connection to StockNow.") }); }
  }
  const edited = st.phase === "proposal" && edit && SETTING_KEYS.some((k) => edit[k] !== st.proposed[k]);
  /* Range problems are explained in the units the person typed (e.g. "30–60 days"), before the engine's own check. */
  const uiErrors = edit ? SETTING_KEYS.flatMap((k) => {
    const [lo, hi] = uiRange(k), u = edit[k] === "" ? NaN : SETTINGS_UI[k].toUi(edit[k]);
    return Number.isFinite(u) && u >= lo && u <= hi ? [] : [t("{label}: enter {range}.", { label: t(SETTINGS_UI[k].label), range: rangeText(k) })];
  }) : [];
  const check = !edit ? null : uiErrors.length ? { ok: false, errors: uiErrors } : validateConfig(Object.fromEntries(SETTING_KEYS.map((k) => [k, edit[k]])));
  const after = edit && check?.ok ? backtestMulti(d, { ...cfg, ...check.values }) : null;
  const better = after && after.error < now.error - 0.001, worse = after && after.error > now.error + 0.001;
  async function approve() {
    const values = Object.fromEntries(SETTING_KEYS.map((k) => [k, edit[k]]).filter(([k, v]) => v !== cfg[k]));
    const out = await act("applyForecastConfig", { values: Object.keys(values).length ? values : { wmaWeight: edit.wmaWeight }, source: edited ? "manual" : "ai", explanation: st.explanation, model: st.model }, { toastFields: true });
    if (out.ok) { setSt({ phase: "idle" }); setEdit(null); }
  }
  /* The person types % or days; the engine value is stored (e.g. 45 days → 1.5 months). */
  const setVal = (k, raw) => setEdit((e) => ({ ...e, [k]: raw === "" || !Number.isFinite(Number(raw)) ? "" : SETTINGS_UI[k].fromUi(Number(raw)) }));
  const label = (k) => <><span>{t(SETTINGS_UI[k].label)}</span><div className="faint small setting-help">{t(SETTINGS_UI[k].help)}</div></>;
  const pc = (x) => `${(x * 100).toFixed(1)}%`;
  const sourceChip = !saved ? <span className="chip chip-grey">{t("Defaults for {type}", { type: t(type.label) })}</span>
    : saved.source === "ai" ? <span className="chip chip-ai"><Icon n="spark" size={12} /> {t("AI-assisted")} · {saved.model || "Gemini"}</span>
      : <span className="chip chip-blue">{t("Manually adjusted")}</span>;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="card card-pad" style={{ borderColor: "var(--ai-br)" }}>
        <div className="row wrap" style={{ justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <div className="row" style={{ gap: 8 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="settings" /></span><h2 className="card-title">{t("Adaptive forecast settings")}</h2></div>
          {sourceChip}
        </div>
        <p className="muted small" style={{ marginBottom: 12 }}>{t("The forecast and restock maths always run in StockNow. These settings tune it to your business. Gemini can propose them from your sales patterns; you approve before anything changes.")}</p>
        <div className={`notice ${mode.key === "enough" ? "ai" : "amber"}`} style={{ marginBottom: 14 }}><Icon n="activity" size={16} /><span><b>{t(mode.label)}</b> ({t("{n} months of sales", { n: months })}, {t(type.label)}). {t(mode.text)}</span></div>
        <div className="scroll-x"><table className="mini">
          <thead><tr><th>{t("Setting")}</th><th className="right">{t("In use")}</th><th className="right">{t("Default")}</th><th className="right">{t("Allowed")}</th></tr></thead>
          <tbody>{SETTING_KEYS.map((k) => (
            <tr key={k}><td>{label(k)}</td><td className="right num bold nowrap">{f(k, cfg[k])}</td><td className="right num muted nowrap">{f(k, typeDefaults(d.settings.businessType)[k])}</td><td className="right num faint nowrap">{rangeText(k)}</td></tr>
          ))}</tbody>
        </table></div>
        <div className="row wrap" style={{ justifyContent: "space-between", gap: 10, marginTop: 12 }}>
          <span className="small">{t("Backtest with these settings: {a} average error over {n} tests (simple 3-month average: {b}).", { a: <b>{pc(now.error)}</b>, n: now.tests, b: pc(now.baseline) })}</span>
          {saved ? <span className="faint small">{t("Approved by {name} · {date}", { name: userOf(d, saved.approvedBy).name, date: when(saved.at) })}</span> : null}
        </div>
        {saved?.explanation ? <div className="summary-box" style={{ marginTop: 12 }}><span className="eyebrow" style={{ color: "var(--ai-fg)" }}>{t("Why these settings")}</span><p className="ai-text" style={{ marginTop: 4 }}>{saved.explanation}</p></div> : null}
        {owner ? (
          <div className="row wrap" style={{ gap: 10, marginTop: 16 }}>
            <button className="btn btn-ai" disabled={offline || mode.key !== "enough" || st.phase === "asking"} onClick={ask}><Icon n="spark" size={16} /> {t(st.phase === "proposal" ? "Ask Gemini again" : "Ask Gemini for settings")}</button>
            {saved ? <button className="btn btn-secondary" onClick={() => act("resetForecastConfig")}>{t("Reset to defaults")}</button> : null}
          </div>
        ) : <div className="notice blue" style={{ marginTop: 14 }}><Icon n="info" size={16} /><span>{t("View only. The Owner or a Manager can ask Gemini and approve settings.")}</span></div>}
      </div>

      {st.phase === "asking" ? (
        <div className="card thinking" style={{ borderColor: "var(--ai-br)" }} aria-live="polite" aria-busy="true">
          <div className="row" style={{ marginBottom: 8 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="bot" size={20} /></span><h2 className="card-title">{t("Gemini is proposing settings…")}</h2></div>
          <div className="think-step done"><span className="think-dot"><Icon n="check" size={12} sw={3} /></span>{t("Measuring your sales patterns ({n} products, {m} months)", { n: d.products.length, m: months })}</div>
          <div className="think-step done"><span className="think-dot"><Icon n="check" size={12} sw={3} /></span>{t("Backtesting every allowed forecast blend on your past months")}</div>
          <div className="think-step now"><span className="think-dot" /><span>{t("Gemini is reading the statistics (not your raw sales)")} <span className="faint">· {t("{n} s", { n: secs })}</span></span></div>
          <div className="bar indeterminate"><i /></div>
        </div>
      ) : null}

      {st.phase === "error" ? <div className="notice red"><Icon n="warning" size={16} /><span><b>{t("No new settings.")}</b> {st.error} {t("Your current settings stay in use.")}</span></div> : null}

      {st.phase === "proposal" && edit ? (
        <div className="card card-pad" style={{ borderColor: "var(--ai)" }}>
          <div className="row wrap" style={{ justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
            <h2 className="card-title">{t("Proposal to review")}</h2>
            <span className="chip chip-ai"><Icon n="bot" size={12} /> {edited ? t("Adjusted by you") : t("Proposed by {model}", { model: st.model })}</span>
          </div>
          {st.explanation ? <div className="summary-box" style={{ marginTop: 0, marginBottom: 14 }}><span className="eyebrow" style={{ color: "var(--ai-fg)" }}>{t("Gemini's reasoning")}</span><p className="ai-text" style={{ marginTop: 4 }}>{st.explanation}</p></div> : null}
          <div className="scroll-x"><table className="mini">
            <thead><tr><th>{t("Setting")}</th><th className="right">{t("In use")}</th><th className="right">{t("Proposed")}</th><th className="right">{t("Allowed")}</th></tr></thead>
            <tbody>{SETTING_KEYS.map((k) => {
              const s = SETTINGS_UI[k], changed = edit[k] !== cfg[k], [lo, hi] = uiRange(k);
              return (
                <tr key={k} style={changed ? { background: "var(--ai-bg)" } : undefined}>
                  <td>{label(k)}{changed ? <span className="chip chip-ai" style={{ marginTop: 4 }}>{t("changed")}</span> : null}</td>
                  <td className="right num nowrap">{f(k, cfg[k])}</td>
                  <td className="right">{owner
                    ? <span className="unit-input"><input className="input" type="number" inputMode="numeric" min={lo} max={hi} step={s.step} aria-label={`${t(s.label)} (${s.unit === "%" ? "%" : t("days")})`}
                        value={edit[k] === "" ? "" : s.toUi(edit[k])} onChange={(e) => setVal(k, e.target.value)} /><span className="unit">{s.unit === "%" ? "%" : t("days")}</span></span>
                    : <span className="num bold nowrap">{f(k, edit[k])}</span>}
                    {owner && k === "wmaWeight" && edit[k] !== "" ? <div className="faint small nowrap">{t("{b}% trend", { b: 100 - s.toUi(edit[k]) })}</div> : null}</td>
                  <td className="right num faint nowrap">{rangeText(k)}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
          {check && !check.ok ? <div className="notice red" style={{ marginTop: 12 }}><Icon n="warning" size={16} /><span>{check.errors.join(" ")}</span></div> : null}
          {after ? (
            <div className="budget-tiles" style={{ marginTop: 14 }}>
              <div className="btile"><DotIc ic="target" tone="grey" /><div className="stack"><span className="muted small">{t("Error now")}</span><span className="v">{pc(now.error)}</span></div></div>
              <div className="btile"><DotIc ic="target" tone={better ? "green" : worse ? "red" : "ai"} /><div className="stack"><span className="muted small">{t("Error with proposal")}</span><span className="v">{pc(after.error)}</span></div></div>
              <div className="btile"><DotIc ic="activity" tone="blue" /><div className="stack"><span className="muted small">{t("Simple 3-month average")}</span><span className="v">{pc(after.baseline)}</span></div></div>
            </div>
          ) : null}
          {after ? <div className={`notice ${better ? "green" : worse ? "amber" : "blue"}`} style={{ marginTop: 12 }}><Icon n={better ? "check" : "info"} size={16} /><span>{better ? t("More accurate on your past months. Measured on the same months Gemini saw, so treat it as a guide, not a promise.") : worse ? t("Less accurate on your past months. We suggest keeping the current settings.") : t("Same accuracy on your past months; the change only affects safety stock, overstock or margin rules.")}</span></div> : null}
          {owner ? (
            <div className="row wrap" style={{ gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => { setSt({ phase: "idle" }); setEdit(null); }}>{t("Keep current settings")}</button>
              <button className="btn btn-primary" disabled={!check?.ok} onClick={approve}><Icon n="check" size={16} sw={2.2} /> {t(edited ? "Approve my adjusted settings" : "Approve & use")}</button>
            </div>
          ) : null}
          <details className="more" style={{ marginTop: 12 }}>
            <summary><Icon n="info" size={14} /> {t("What Gemini was given")}</summary>
            <p className="muted small" style={{ marginTop: 8 }}>{t("Only derived numbers: per product the average monthly sales, variability, trend, last month vs earlier, margin, plus the measured error for each forecast blend. No raw sales records, customers or supplier details.")}</p>
          </details>
        </div>
      ) : null}
    </div>
  );
}
