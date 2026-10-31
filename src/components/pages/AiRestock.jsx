"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../App.jsx";
import { Modal, AiSourceChip, Bullets, DotIc, Empty, Icon, PoCell, ReqChip, Spark, confColor, reasonIcon } from "../ui.jsx";
import {
  explainAccuracy, analyse, backtest, backtestMulti, budgetLeft, configOf, checks, inPlan, openPOs, overridesOf, poOf, routeTo, sendBlock, setItemIncluded, setItemQty,
  spentThisMonth, summaryBullets, userOf,
} from "@/lib/engine.js";
import { ROLE_LABEL } from "@/lib/actions.js";
import { f1, clone, digits, list, num, pct, plural, rm, toJSON } from "@/lib/format.js";
import { monthName } from "@/lib/i18n.js";

import { SETTINGS_UI, historyMode, typeDefaults, uiRange, validateConfig } from "@/lib/forecast.js";

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
      {["Alert or budget", "Plan", "Send", "Approve", "Order supplier", "Receive"].map((s, i) => (
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
  const { d, me, ui, setAi, can, go, act, toast, offline, t, tp, lang, when, who } = useApp();
  const a = ui.ai, r = a.result, b = +a.budget || 0;
  const mb = d.settings.monthlyBudget, spent = spentThisMonth(d), left = budgetLeft(d);
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
      if (!offline) act("logAnalysis", { text: res.ideal ? `Worked out the ideal plan: ${rm(res.t.cost)} for ${plural(res.t.buy.length, "product")}.` : `Made a restock plan for a ${rm(budget)} budget: ${res.t.buy.length} buy, ${res.t.skip.length} don't buy, ${res.t.wait.length} wait. Expected profit ${rm(res.t.profit)}.` });
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
        <div><h1 className="page-title">{t("Smart Restock")}</h1><p className="page-sub">{t("What to buy, how many, and why. Always within your budget.")}</p></div>
      </div>
      {/* The 6-step progress bar only appears once there is a plan to follow (kept off the first screen). */}
      {(a.tab || "plan") === "plan" && (r || busy || d.requests[0]?.status === "PENDING") ? <FlowBar /> : null}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${(a.tab || "plan") === "plan" ? "on" : ""}`} onClick={() => setAi({ tab: "plan" })}>{t("Restock plan")}</button>
        <button className={`tab ${a.tab === "accuracy" ? "on" : ""}`} onClick={() => setAi({ tab: "accuracy" })}>{t("Accuracy check")}</button>
        <button className={`tab ${a.tab === "settings" ? "on" : ""}`} onClick={() => setAi({ tab: "settings" })}>{t("Forecast settings")}</button>
      </div>

      <div className="ai-layout"><div className="stack" style={{ gap: 20 }}>
        {a.tab === "accuracy" ? <AccuracyView /> : a.tab === "settings" ? <ForecastSettings /> : (
          <>
            <div className="card card-pad" style={{ borderColor: "var(--ai-br)" }}>
              {/* One line about the money instead of three tiles: what's left, out of the monthly budget. */}
              <div className="budget-line">
                <DotIc ic="wallet" tone={left > 0 ? "ai" : "red"} />
                <div className="stack" style={{ flex: 1 }}>
                  <span><b className="num">{rm(left)}</b> <span className="muted">{t("left to spend this month, of {total}", { total: rm(mb) })}</span></span>
                  <div className="bar" style={{ marginTop: 6 }} title={t("{x} used", { x: rm(spent) })}><i style={{ width: `${mb ? Math.round((left / mb) * 100) : 0}%` }} /></div>
                </div>
                {can("setBudget") ? <BudgetChangeButton /> : null}
              </div>
              <label className="label" htmlFor="budget">{t("Budget for this plan")}</label>
              <div className="row wrap" style={{ gap: 12 }}>
                <div className="budget-input"><span>RM</span>
                  <input className="input" id="budget" inputMode="numeric" value={a.ideal ? "" : a.budget} placeholder={a.ideal ? t("No limit") : String(left)}
                    onChange={(e) => setBudget(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") start(false); }} disabled={busy} />
                </div>
                <button className="btn btn-ai btn-lg" onClick={() => start(false)} disabled={busy}><Icon n="spark" size={20} /> {t(r ? "Make plan again" : "Make plan")}</button>
              </div>
              <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
                <div className="chips">
                  <button className={`qchip ${!a.ideal && b === left ? "on" : ""}`} onClick={() => setBudget(String(left))}>{t("Budget left · {x}", { x: rm(left) })}</button>
                  {[10000, 20000, 30000].filter((v) => v !== left).map((v) => <button key={v} className={`qchip ${!a.ideal && b === v ? "on" : ""}`} onClick={() => setBudget(String(v))}>{rm(v)}</button>)}
                </div>
                <span className="spacer" />
                <label className="switch"><input type="checkbox" checked={a.ideal} onChange={(e) => setIdeal(e.target.checked)} /> {t("No limit: show what everything costs")}</label>
              </div>
            </div>

            {busy ? <ThinkingCard /> : null}
            {!busy && r ? <ResultView /> : null}
            {a.phase === "idle" && !r ? (
              <div className="card">
                <Empty title={t("Ready when you are")} text={t("Check the budget, then press Make plan.")} ic="spark" />
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
  const steps = [...thinkSteps(d, ui.ai, t, tp, lang), ...(offline ? [] : [t("Writing a short summary…")])], s = ui.ai.step;
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!writing) return setSecs(0);
    const tm = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => clearInterval(tm);
  }, [writing]);
  return (
    <div className="card thinking" style={{ borderColor: "var(--ai-br)" }} aria-live="polite" aria-busy="true">
      <div className="row" style={{ marginBottom: 8 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="activity" size={20} /></span><h2 className="card-title">{t("Checking your shop…")}</h2></div>
      {steps.map((x, i) => (
        <div key={i} className={`think-step ${i < s ? "done" : i === s ? "now" : ""}`}>
          <span className="think-dot">{i < s ? <Icon n="check" size={12} sw={3} /> : null}</span>
          <span>{x}{writing && i === s ? <span className="faint"> · {t("{n} s", { n: secs })}</span> : null}</span>
        </div>
      ))}
      {writing ? <p className="muted small" style={{ margin: "4px 0 10px 30px" }}>{t("The numbers are ready. Writing them up in plain words; this can take up to a minute.")}</p> : null}
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
        {s?.loading ? <span className="chip chip-ai"><span className="spin sm" /> {t("Updating the summary…")}</span> : <AiSourceChip s={s} long />}
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
          <div className="row" style={{ gap: 8 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="spark" /></span><h2 className="card-title">{t(r.ideal ? "Ideal plan (no budget limit)" : "Your restock plan")}</h2></div>
          <span className="faint small">{t("Made at {time}", { time: r.at.split(" ")[1] })}</span>
        </div>
        <div className="verdicts" role="group" aria-label={t("Filter by decision")}>
          {verdict("buy", "cart", "var(--green-bg)", "var(--green-fg)", tt.buy.length, `${t("Buy")} · ${rm(tt.cost)}`)}
          {verdict("wait", "pause", "var(--amber-bg)", "var(--amber-fg)", tt.wait.length, `${t("Wait")}${waitCost ? ` · ${t("needs {x}", { x: rm(waitCost) })}` : ""}`)}
          {verdict("skip", "ban", "var(--red-bg)", "var(--red-fg)", tt.skip.length, `${t("Don't buy")} · ${t("{x} sitting", { x: rm(tied) })}`)}
        </div>
        <SummaryBox r={r} />
        {/* Problems stay in view; everything else (key points, checks, where the money goes) is one click away. */}
        {c.over || c.warn.length ? (
          <div className="row wrap" style={{ marginTop: 12, gap: 6 }}>
            {c.over ? <span className="chip chip-red"><Icon n="close" size={12} sw={2.6} /> {t("Over budget")}</span> : null}
            {c.warn.map((x) => <span key={x} className="chip chip-amber" title={t("Needs your judgement")}><Icon n="warning" size={12} sw={2} /> {x}</span>)}
          </div>
        ) : null}
        <details className="more" style={{ marginTop: 14 }}>
          <summary><Icon n="info" size={14} /> {t("More detail")}</summary>
          <Bullets items={summaryBullets(d, r)} style={{ marginTop: 14 }} />
          <div className="row wrap" style={{ marginTop: 12, gap: 6 }}>{c.ok.map((x) => <span key={x} className="chip chip-green"><Icon n="check" size={12} sw={2.6} /> {x}</span>)}</div>
          {tt.buy.length ? (
            <div style={{ marginTop: 16 }}>
              <div className="alloc" role="img" aria-label={t("Where the money goes")}>{segs.map((s) => <i key={s.i.pid} style={{ width: `${s.w}%`, background: s.col }} title={`${s.i.name} ${rm(s.i.cost)}`} />)}</div>
              <div className="legend">
                {segs.map((s) => <span key={s.i.pid}><i style={{ background: s.col }} />{s.i.short} {rm(s.i.cost)}</span>)}
                {!r.ideal && tt.left > 0 ? <span><i style={{ background: "var(--divider)", border: "1px solid var(--border)" }} />{t("Unspent {x}", { x: rm(tt.left) })}</span> : null}
              </div>
            </div>
          ) : null}
        </details>
        {r.ideal ? null : <WhatIf key={r.at + r.budget} r={r} />}
      </div>

      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h2 className="card-title">{t(f === "buy" ? "Buy" : f === "wait" ? "Wait" : f === "skip" ? "Don't buy" : "All products")} <span className="muted" style={{ fontWeight: 400 }}>({shown.length})</span></h2>
        <span className="muted small">{t("Tap a product to see why")}</span>
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
        <span className="cbar d-only" title={t("Confidence")}><span><i style={{ width: `${g.conf}%`, background: confColor(g.conf) }} /></span>{g.conf}%</span>
        <span className="chev"><Icon n="chevronRight" /></span>
      </div>
      {open ? (
        <div className="plan-body">
          <div className="stack" style={{ gap: 14 }}>
            <div className="m-only">{qtyCell}</div>
            <div><div className="eyebrow" style={{ marginBottom: 8 }}>{t("How it was worked out")}</div><DecideStrip i={i} /></div>
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
  const [det, setDet] = useState(null);
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
        <div className="row" style={{ gap: 8 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="target" /></span><h2 className="card-title">{t("How accurate is the forecast?")}</h2></div>
        <span className="chip chip-ai">{range} → {t("predict {m}", { m: last })}</span>
      </div>
      <p className="muted" style={{ marginBottom: 16 }}>{t("We hid {last}'s sales, predicted {last} from {range} only, then compared with what really sold.", { last, range })}</p>
      {multi.tests ? <div className="notice ai" style={{ marginBottom: 16 }}><Icon n="activity" size={16} /><span>{t("Across every month with 3 months before it ({n} tests): {a} average error with the current forecast settings, {b} for the simple “average of the last 3 months” guess.", { n: multi.tests, a: <b>{pct(multi.error)}</b>, b: pct(multi.baseline) })}</span></div> : null}
      <div className="acc-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDet({ pid: null })} data-testid="button-accuracy-details"><Icon n="calc" size={14} /> {t("View calculation details")}</button>
      </div>
      {det ? <AccuracyDetails focusPid={det.pid} onClose={() => setDet(null)} /> : null}
      <div className="budget-tiles">
        {tile("target", "ai", t("Average error"), pct(mape))}
        {tile("check", "green", t("Within 15%"), t("{a} of {b} products", { a: within, b: bt.length }))}
        {tile("warning", worst.verdict === "Off" ? "red" : "amber", t("Biggest miss"), `${worst.p.short} ${pct(worst.err)}`)}
      </div>
      <div className="scroll-x"><table style={{ minWidth: 660 }}>
        <thead><tr><th>{t("Product")}</th><th>{t("Forecast vs actual")}</th><th className="right">{t("Forecast")}</th><th className="right">{t("Really sold")}</th><th className="right">{t("Difference")}</th><th>{t("Result")}</th><th><span className="sr-only">{t("Details")}</span></th></tr></thead>
        <tbody>{bt.map((x) => (
          <tr key={x.p.id}>
            <td className="bold">{x.p.name}</td>
            <td><div className="pair" role="img" aria-label={t("Forecast {a}, actual {b}", { a: x.forecast, b: x.actual })}><i style={{ width: `${(x.forecast / max) * 100}%`, background: "var(--ai)" }} /><i style={{ width: `${(x.actual / max) * 100}%`, background: "var(--text-3)" }} /></div></td>
            <td className="right num">{x.forecast}</td>
            <td className="right num bold">{x.actual}</td>
            <td className="right num" style={{ color: x.err <= 0.1 ? "var(--green-fg)" : x.err <= 0.2 ? "var(--amber-fg)" : "var(--red-fg)" }}>{x.diff > 0 ? "+" : x.diff < 0 ? "−" : ""}{Math.abs(x.diff)} ({pct(x.err)})</td>
            <td>{vchip(x.verdict)}</td>
            <td><button type="button" className="btn btn-link btn-sm" onClick={() => setDet({ pid: x.p.id })} aria-label={t("How this was calculated: {name}", { name: x.p.name })} data-testid={`button-accuracy-row-${x.p.id}`}><Icon n="calc" size={14} /> {t("Details")}</button></td>
          </tr>
        ))}</tbody>
      </table></div>
      <div className="legend" style={{ marginTop: 10 }}><span><i style={{ background: "var(--ai)" }} />{t("Forecast")}</span><span><i style={{ background: "var(--text-3)" }} />{t("Really sold")}</span><span>{t("Accurate ≤ 10% · Close ≤ 20% · Off > 20%")}</span></div>
      <ul className="bullets" style={{ marginTop: 16 }}>
        <li><DotIc ic="check" tone="green" size={15} /><span>{t("Best: {name}, only {p} off. Steady sellers are easy to predict.", { name: <strong>{best.p.short}</strong>, p: pct(best.err) })}</span></li>
        {under.length ? <li><DotIc ic="up" tone="amber" size={15} /><span>{t("Fast risers are under-forecast ({list}). That's why StockNow adds safety stock on top.", { list: list(under.map((x) => `${x.p.short} ${pct(x.err)}`)) })}</span></li> : null}
        {off.length ? <li><DotIc ic="warning" tone="red" size={15} /><span>{t("Off: {list}. Sales jumped suddenly, so confidence is lower and a person should decide.", { list: list(off.map((x) => x.p.short)) })}</span></li> : null}
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
  const [st, setSt] = useState({ phase: "idle" }); // idle | asking | proposal | error
  const [edit, setEdit] = useState(null); // the proposal's values as the person adjusts them
  const [secs, setSecs] = useState(0);
  const [proof, setProof] = useState(false); // the "View calculation details" window for the error numbers
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
  const pc = (x) => `${(x * 100).toFixed(1)}%`;
  const sourceChip = !saved ? <span className="chip chip-grey">{t("Default settings")}</span>
    : saved.source === "ai" ? <span className="chip chip-ai"><Icon n="spark" size={12} /> {t("Suggested from your sales")}</span>
      : <span className="chip chip-blue">{t("Manually adjusted")}</span>;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="card card-pad" style={{ borderColor: "var(--ai-br)" }}>
        <div className="row wrap" style={{ justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <div className="row" style={{ gap: 8 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="settings" /></span><h2 className="card-title">{t("Adaptive forecast settings")}</h2></div>
          {sourceChip}
        </div>
        <p className="muted small" style={{ marginBottom: 12 }}>{t("These settings fine-tune the forecast for your shop. StockNow can suggest them from your past sales; nothing changes until you approve.")}</p>
        <div className="row wrap" style={{ gap: 8, marginBottom: 16 }}>
          <span className={`chip ${mode.key === "enough" ? "chip-ai" : "chip-amber"}`} title={t(mode.text)}><Icon n="activity" size={12} /> {t("{n} months of sales", { n: months })} · {t(mode.label)}</span>
          {saved ? <span className="chip chip-grey">{t("Approved by {name} · {date}", { name: userOf(d, saved.approvedBy).name, date: when(saved.at) })}</span> : null}
        </div>
        {/* The six settings as cards: icon, value, and where it sits in the allowed range (● in use, | default). */}
        <div className="fs-grid">
          {SETTING_KEYS.map((k) => <SettingTile key={k} k={k} value={cfg[k]} dflt={typeDefaults(d.settings.businessType)[k]} />)}
        </div>
        <FsLegend />
        <ErrorBars title={t("How accurate is the forecast?")} sub={t("Average error on {n} tests from your past sales · lower is better", { n: now.tests })}
          rows={[{ label: t("Your forecast"), v: now.error, tone: "ai" }, { label: t("Simple 3-month guess"), v: now.baseline, tone: "grey" }]} />
        {saved?.explanation ? <div className="summary-box" style={{ marginTop: 12 }}><span className="eyebrow" style={{ color: "var(--ai-fg)" }}>{t("Why these settings")}</span><p className="ai-text" style={{ marginTop: 4 }}>{saved.explanation}</p></div> : null}
        {owner ? (
          <div className="row wrap" style={{ gap: 10, marginTop: 16 }}>
            <button className="btn btn-ai" disabled={offline || mode.key !== "enough" || st.phase === "asking"} onClick={ask}><Icon n="spark" size={16} /> {t(st.phase === "proposal" ? "Suggest again" : "Suggest settings from my sales")}</button>
            {saved ? <button className="btn btn-secondary" onClick={() => act("resetForecastConfig")}>{t("Reset to defaults")}</button> : null}
          </div>
        ) : <div className="notice blue" style={{ marginTop: 14 }}><Icon n="info" size={16} /><span>{t("View only. The Owner or a Manager can change these settings.")}</span></div>}
      </div>

      {st.phase === "asking" ? (
        <div className="card thinking" style={{ borderColor: "var(--ai-br)" }} aria-live="polite" aria-busy="true">
          <div className="row" style={{ marginBottom: 8 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="activity" size={20} /></span><h2 className="card-title">{t("Finding the best settings…")}</h2></div>
          <div className="think-step done"><span className="think-dot"><Icon n="check" size={12} sw={3} /></span>{t("Measuring your sales patterns ({n} products, {m} months)", { n: d.products.length, m: months })}</div>
          <div className="think-step done"><span className="think-dot"><Icon n="check" size={12} sw={3} /></span>{t("Backtesting every allowed forecast blend on your past months")}</div>
          <div className="think-step now"><span className="think-dot" /><span>{t("Looking at your sales patterns (not individual sales)")} <span className="faint">· {t("{n} s", { n: secs })}</span></span></div>
          <div className="bar indeterminate"><i /></div>
        </div>
      ) : null}

      {st.phase === "error" ? <div className="notice red"><Icon n="warning" size={16} /><span><b>{t("No new settings.")}</b> {st.error} {t("Your current settings stay in use.")}</span></div> : null}

      {st.phase === "proposal" && edit ? (
        <div className="card card-pad" style={{ borderColor: "var(--ai)" }}>
          <div className="row wrap" style={{ justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
            <h2 className="card-title">{t("Proposal to review")}</h2>
            <span className="chip chip-ai" title={st.model || ""}><Icon n="spark" size={12} /> {edited ? t("Adjusted by you") : t("Suggested from your sales")}</span>
          </div>
          {st.explanation ? <div className="summary-box" style={{ marginTop: 0, marginBottom: 14 }}><span className="eyebrow" style={{ color: "var(--ai-fg)" }}>{t("Why these settings")}</span><p className="ai-text" style={{ marginTop: 4 }}>{st.explanation}</p></div> : null}
          {/* Each setting: old → new, both marked on its range bar (○ now, ● proposed); the owner can still type a value. */}
          <div className="fs-grid">
            {SETTING_KEYS.map((k) => {
              const s = SETTINGS_UI[k], [lo, hi] = uiRange(k);
              return <SettingTile key={k} k={k} value={edit[k]} was={cfg[k]}
                editor={owner ? <span className="unit-input"><input className="input" type="number" inputMode="numeric" min={lo} max={hi} step={s.step} aria-label={`${t(s.label)} (${s.unit === "%" ? "%" : t("days")})`}
                  value={edit[k] === "" ? "" : s.toUi(edit[k])} onChange={(e) => setVal(k, e.target.value)} /><span className="unit">{s.unit === "%" ? "%" : t("days")}</span></span> : null} />;
            })}
          </div>
          <FsLegend compare />
          {check && !check.ok ? <div className="notice red" style={{ marginTop: 12 }}><Icon n="warning" size={16} /><span>{check.errors.join(" ")}</span></div> : null}
          {after ? (
            <ErrorBars title={t("Forecast error on your past sales")} sub={t("Average of {n} tests · lower is better", { n: after.tests })} rows={[
              { label: t("Error now"), v: now.error, tone: "grey" },
              { label: t("Error with proposal"), v: after.error, tone: better ? "green" : worse ? "red" : "ai" },
              { label: t("Simple 3-month average"), v: after.baseline, tone: "light" },
            ]} />
          ) : null}
          {after ? (
            <div className="acc-actions" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setProof(true)} data-testid="button-settings-proof"><Icon n="calc" size={14} /> {t("View calculation details")}</button>
              <span className="muted small">{t("How these three error numbers were worked out, test by test.")}</span>
            </div>
          ) : null}
          {proof && after ? <SettingsProof current={cfg} proposed={{ ...cfg, ...check.values }} onClose={() => setProof(false)} /> : null}
          {after ? <div className={`notice ${better ? "green" : worse ? "amber" : "blue"}`} style={{ marginTop: 12 }}><Icon n={better ? "check" : "info"} size={16} /><span>{better ? t("More accurate on your past months. Treat it as a guide, not a promise.") : worse ? t("Less accurate on your past months. We suggest keeping the current settings.") : t("Same accuracy on your past months; the change only affects safety stock, overstock or margin rules.")}</span></div> : null}
          {owner ? (
            <div className="row wrap" style={{ gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => { setSt({ phase: "idle" }); setEdit(null); }}>{t("Keep current settings")}</button>
              <button className="btn btn-primary" disabled={!check?.ok} onClick={approve}><Icon n="check" size={16} sw={2.2} /> {t(edited ? "Approve my adjusted settings" : "Approve & use")}</button>
            </div>
          ) : null}
          <details className="more" style={{ marginTop: 12 }}>
            <summary><Icon n="info" size={14} /> {t("What was used to suggest this")}</summary>
            <p className="muted small" style={{ marginTop: 8 }}>{t("Only derived numbers: per product the average monthly sales, variability, trend, last month vs earlier, margin, plus the measured error for each forecast blend. No raw sales records, customers or supplier details.")}</p>
          </details>
        </div>
      ) : null}
    </div>
  );
}


/* Accuracy audit cards and product-by-product worked forecasts. */
/* Accuracy check audit trail: every number on the Accuracy screen with its basis, worked formulas and history.
   All values come from explainAccuracy(d); nothing here re-derives the forecast. */







const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
const Fm = ({ children }) => <div className="formula">{children}</div>;

function useDialogKeys(onClose) {
  const ref = useRef(onClose); ref.current = onClose;
  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = document.querySelector('[role="dialog"]');
    dialog?.querySelector("button")?.focus();
    const key = (e) => {
      if (e.key === "Escape") { e.preventDefault(); ref.current(); }
      if (e.key === "Tab" && dialog) {
        const c = [...dialog.querySelectorAll('button, input, select, a[href], [tabindex="0"]')].filter((el) => !el.disabled && el.getClientRects().length);
        if (e.shiftKey && document.activeElement === c[0]) { e.preventDefault(); c.at(-1)?.focus(); }
        else if (!e.shiftKey && document.activeElement === c.at(-1)) { e.preventDefault(); c[0]?.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); if (trigger?.isConnected) trigger.focus(); };
  }, []);
}

/* Worked forecast for one held-out test: training months, 3:2:1 average, trend line, blend, comparison. */
export function RowMath({ r, cfg, latest }) {
  const { t, lang } = useApp();
  const h = r.history, n = h.length, m = r.model, M = r.historyMonths.map((x) => monthName(lang, x));
  const raw = cfg.wmaWeight * m.wma + cfg.trendWeight * m.lin;
  const verdict = r.error <= 0.1 ? "Accurate" : r.error <= 0.2 ? "Close" : "Off";
  return (
    <div className="acc-math">
      <div className="eyebrow">{t("Training months used (the tested month {m} is hidden)", { m: monthName(lang, r.month) })}</div>
      <div className="scroll-x"><table className="mini"><thead><tr>{M.map((x, k) => <th key={k} className="right">{x}</th>)}<th className="right acc-held">{monthName(lang, r.month)}</th></tr></thead>
        <tbody><tr>{h.map((v, k) => <td key={k} className="right num bold">{v}</td>)}<td className="right num acc-held">{t("hidden")}</td></tr></tbody></table></div>
      <Fm>1. {t("Weighted last 3 months (3:2:1)")}: ({h[n - 1]}×3 + {h[n - 2]}×2 + {h[n - 3]}×1) ÷ 6 = <b>{f1(m.wma)}</b></Fm>
       <Fm>2. {t("Trend line (least squares)")}: x = 0 … {n - 1}; x̄ = ({n} − 1) ÷ 2 = {(n - 1) / 2}; {t("average")} ȳ = ({h.join(" + ")}) ÷ {n} ≈ {f1(m.ym)}; slope = Σ((x − x̄)(y − ȳ)) ÷ Σ((x − x̄)²) ≈ {f1(m.slope)}<br />
        {t("Next point")} = {f1(m.ym)} + {f1(m.slope)} × {f1(m.step)} = <b>{f1(m.lin)}</b></Fm>
      <Fm>3. {t("Forecast")} = max(0, round({cfg.wmaWeight} × {f1(m.wma)} + {cfg.trendWeight} × {f1(m.lin)})) = max(0, round({f1(raw)})) = <b>{r.forecast}</b></Fm>
      <Fm>4. {t("Really sold in {m} (recorded sales history)", { m: monthName(lang, r.month) })}: <b>{r.actual}</b> · {t("Difference")} = {r.forecast} − {r.actual} = <b>{signed(r.diff)}</b></Fm>
      {r.zeroActual
        ? <Fm>5. {t("Actual sales were 0, so a percentage cannot be divided by zero. The original engine records 0% here; this is not evidence of accuracy.")}</Fm>
        : <Fm>5. {t("Error")} = |{signed(r.diff)}| ÷ {r.actual} × 100 = <b>{pct(r.error)}</b>{latest ? <> → {t(`verdict|${r.verdict || verdict}`)}</> : null}</Fm>}
      <Fm>{t("Simple baseline")}: round(({h[n - 1]} + {h[n - 2]} + {h[n - 3]}) ÷ 3) = <b>{r.baseline}</b> · {t("Difference")} {signed(r.baselineDiff)}{r.zeroActual ? "" : <> · {t("Error")} {pct(r.baselineError)}</>}</Fm>
    </div>
  );
}

function Card({ id, title, value, basis, children, open, onToggle }) {
  const { t } = useApp();
  return (
    <section className="acc-card" aria-labelledby={`acc-h-${id}`} data-accuracy-section={id}>
      <div className="acc-card-top">
        <div className="stack" style={{ minWidth: 0 }}><h3 id={`acc-h-${id}`}>{title}</h3><p className="muted small">{basis}</p></div>
        <span className="acc-val num" data-testid={`text-acc-${id}`}>{value}</span>
      </div>
      <button type="button" className="cs-toggle" aria-expanded={!!open} aria-controls={`acc-b-${id}`} onClick={() => onToggle(id)} data-testid={`button-acc-${id}`}>
        <Icon n="calc" size={14} /> {open ? t("Hide working") : t("Show working")} <Icon n={open ? "chevronUp" : "chevronDown"} size={14} />
      </button>
      {open ? <div id={`acc-b-${id}`} className="acc-body">{children}</div> : null}
    </section>
  );
}

function AccuracyDetails({ focusPid, onClose }) {
  const { d, t, lang } = useApp();
  useDialogKeys(onClose);
  const x = explainAccuracy(d), cfg = x.config, L = x.latest, R = x.rolling;
  const [open, setOpen] = useState(focusPid ? { products: true } : {});
  const [rowOpen, setRowOpen] = useState(focusPid ? { [focusPid]: true } : {});
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const mn = (m) => monthName(lang, m);
  const rows = L.rows;
  const bestTies = L.best ? rows.filter((r) => r.error === L.best.error) : [];
  const worstTies = L.worst ? rows.filter((r) => r.error === L.worst.error) : [];
  const zeroLatest = rows.filter((r) => r.zeroActual);
  const sumErr = rows.reduce((s, r) => s + r.error, 0), sumF = R.rows.reduce((s, r) => s + r.error, 0), sumB = R.rows.reduce((s, r) => s + r.baselineError, 0);
  const focus = focusPid ? rows.find((r) => r.pid === focusPid) : null;

  return (
    <Modal title={focus ? t("Accuracy details: {name}", { name: focus.name }) : t("Accuracy calculation details")} size="wide" onClose={onClose}
      foot={<button className="btn btn-primary" onClick={onClose} data-testid="button-acc-close">{t("Close")}</button>}>
      <div className="notice blue" style={{ marginBottom: 14 }}><Icon n="info" size={16} /><span>{t("This is a historical backtest on your own sales, not a promise of future accuracy. Numbers are rounded for display only; averages are computed at full precision. The tested month never influences its own forecast.")}</span></div>
      <p className="muted small" style={{ marginBottom: 14 }}>{t("Settings used: {a} × weighted average + {b} × trend line. Accurate ≤ 10% · Close ≤ 20% · Off > 20%. Within 15% includes exactly 15%.", { a: cfg.wmaWeight, b: cfg.trendWeight })}</p>

       {!rows.length ? <div className="notice amber"><Icon n="warning" size={16} /><span>{t("Not enough data: no product has 4 months of sales yet, so there is nothing to test. This is not a 0% error.")}</span></div> : <div className={`acc-grid ${focus ? "acc-grid-focused" : ""}`}>
        <Card id="average" open={open.average} onToggle={toggle} title={t("Average error")} value={pct(L.error)}
          basis={t("Mean of each product's latest-month error, every product counted equally ({n} products).", { n: rows.length })}>
          <Fm>({rows.map((r) => pct(r.error)).join(" + ")}) ÷ {rows.length} = {f1(sumErr * 100)}% ÷ {rows.length} = <b>{pct(L.error)}</b></Fm>
          {zeroLatest.length ? <p className="small muted">{t("Includes {n} product(s) that sold 0 in the tested month, recorded as 0% by the engine convention, not because the forecast was right: {list}.", { n: zeroLatest.length, list: zeroLatest.map((r) => r.short).join(", ") })}</p> : null}
        </Card>
        <Card id="within" open={open.within} onToggle={toggle} title={t("Within 15%")} value={`${L.within} / ${rows.length}`}
          basis={t("Products whose latest-month error is 15% or less (inclusive), out of every tested product.")}>
          <ul className="acc-list">{rows.map((r) => <li key={r.pid}><span>{r.short}</span><span className="num">{pct(r.error)}</span><span className={`chip ${r.error <= 0.15 ? "chip-green" : "chip-grey"}`}>{r.error <= 0.15 ? t("Counted") : t("Not counted")}</span></li>)}</ul>
        </Card>
        <Card id="extremes" open={open.extremes} onToggle={toggle} title={t("Biggest and smallest miss")} value={`${L.worst.short} ${pct(L.worst.error)}`}
          basis={t("Highest and lowest latest-month error among tested products.")}>
          <p className="small"><b>{t("Biggest miss")}</b>: {worstTies.map((r) => `${r.short} ${pct(r.error)}`).join(", ")}{worstTies.length > 1 ? ` (${t("tie; the screen shows the first")})` : ""}</p>
          <p className="small"><b>{t("Best")}</b>: {bestTies.map((r) => `${r.short} ${pct(r.error)}`).join(", ")}{bestTies.length > 1 ? ` (${t("tie; the screen shows the first")})` : ""}</p>
          {L.best?.zeroActual ? <p className="small muted">{t("The best result comes from a month with 0 sales, so its 0% is a convention, not proof of accuracy.")}</p> : null}
        </Card>
        <Card id="lists" open={open.lists} onToggle={toggle} title={t("Under-forecast and Off lists")} value={`${L.under.length} · ${L.off.length}`}
          basis={t("Under-forecast: forecast below actual and error above 10%. Off: error above 20%.")}>
          <p className="small"><b>{t("Under-forecast")}</b>: {L.under.length ? L.under.map((r) => `${r.short} (${r.forecast} < ${r.actual}, ${pct(r.error)})`).join(", ") : t("none")}</p>
          <p className="small"><b>{t("Off")}</b>: {L.off.length ? L.off.map((r) => `${r.short} (${pct(r.error)} > 20%)`).join(", ") : t("none")}</p>
        </Card>
        <Card id="rolling" open={open.rolling} onToggle={toggle} title={t("Rolling check")} value={R.tests ? `${pct(R.error)} vs ${pct(R.baseline)}` : t("Not enough data")}
          basis={t("Every month with 3+ months before it, each product-month counted equally. Months with 0 sales are left out.")}>
          {R.tests ? <>
            <Fm>{t("Forecast")}: {f1(sumF * 100)}% ÷ {R.tests} {t("tests")} = <b>{pct(R.error)}</b> · {t("Simple baseline")}: {f1(sumB * 100)}% ÷ {R.tests} = <b>{pct(R.baseline)}</b></Fm>
            <div className="scroll-x"><table className="mini" style={{ minWidth: 560 }}>
              <thead><tr><th>{t("Product")}</th><th>{t("Month")}</th><th className="right">{t("Really sold")}</th><th className="right">{t("Forecast")}</th><th className="right">{t("Error")}</th><th className="right">{t("Baseline")}</th><th className="right">{t("Error")}</th></tr></thead>
              <tbody>{R.rows.map((r) => <tr key={r.pid + r.testIndex} data-testid={`row-acc-rolling-${r.pid}-${r.testIndex}`}><td>{r.short}</td><td>{mn(r.month)}</td><td className="right num bold">{r.actual}</td><td className="right num">{r.forecast}</td><td className="right num">{pct(r.error)}</td><td className="right num">{r.baseline}</td><td className="right num">{pct(r.baselineError)}</td></tr>)}</tbody>
            </table></div>
            {R.excludedZero.length ? <p className="small muted">{t("Left out because 0 were sold (cannot divide by zero): {list}.", { list: R.excludedZero.map((r) => `${r.short} ${mn(r.month)}`).join(", ") })}</p> : null}
            <details className="acc-det"><summary>{t("Show the forecast working for every rolling test")}</summary>
              {R.rows.map((r) => <div key={r.pid + r.testIndex}><h4 className="small bold">{r.name} · {mn(r.month)}</h4><RowMath r={r} cfg={cfg} /></div>)}
            </details>
          </> : <p className="small">{t("Not enough data: no month has 3 months of sales before it with sales above 0. This is not a 0% error.")}</p>}
        </Card>
        <Card id="products" open={open.products} onToggle={toggle} title={t("Per-product latest check")} value={`${rows.length}`}
          basis={t("Forecast, sales, difference, error and verdict for each product. Open a product for its full working.")}>
          {rows.map((r) => (
            <div key={r.pid} className="acc-prod">
              <button type="button" className="acc-prod-btn" aria-expanded={!!rowOpen[r.pid]} onClick={() => setRowOpen((o) => ({ ...o, [r.pid]: !o[r.pid] }))} data-testid={`button-acc-product-${r.pid}`}>
                <span className="bold">{r.name}</span>
                <span className="num small">{r.forecast} vs {r.actual} · {signed(r.diff)} · {pct(r.error)}</span>
                <span className={`chip ${r.verdict === "Accurate" ? "chip-green" : r.verdict === "Close" ? "chip-amber" : "chip-red"}`}>{t(`verdict|${r.verdict}`)}</span>
                <Icon n={rowOpen[r.pid] ? "chevronUp" : "chevronDown"} size={14} />
              </button>
              {rowOpen[r.pid] ? <RowMath r={r} cfg={cfg} latest /> : null}
            </div>
          ))}
        </Card>
      </div>}
      {x.insufficient.length ? <p className="small muted" style={{ marginTop: 12 }}>{t("Not tested (under 4 months of sales): {list}.", { list: x.insufficient.map((p) => `${p.name} (${p.months})`).join(", ") })}</p> : null}
    </Modal>
  );
}

/* Forecast settings: the working behind "Error now", "Error with proposal" and "Simple 3-month average".
   Both settings are backtested on the same past months with the same code (explainAccuracy → backtestMulti),
   so every figure here adds up to the tiles. Only the blend (recent months vs trend) changes the forecast;
   safety stock, overstock and margin settings change what is bought, not the forecast error. */
function SettingsProof({ current, proposed, onClose }) {
  const { d, t, lang } = useApp();
  useDialogKeys(onClose);
  const pc1 = (x) => `${(x * 100).toFixed(1)}%`; // one decimal, like the tiles
  const A = explainAccuracy(d, current).rolling, B = explainAccuracy(d, proposed).rolling;
  const [open, setOpen] = useState({ products: true });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const mn = (m) => monthName(lang, m);
  const key = (r) => `${r.pid}-${r.testIndex}`;
  const nextOf = Object.fromEntries(B.rows.map((r) => [key(r), r]));
  const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);
  const tested = [...new Set(A.rows.map((r) => r.month))].map(mn);
  const prods = d.products.map((p) => {
    const a = A.rows.filter((r) => r.pid === p.id), b = B.rows.filter((r) => r.pid === p.id);
    return a.length ? { p, n: a.length, now: sum(a, "error") / a.length, next: sum(b, "error") / b.length, base: sum(a, "baselineError") / a.length } : null;
  }).filter(Boolean);
  const blend = (c) => t("{a}% recent months + {b}% trend line", { a: Math.round(c.wmaWeight * 100), b: Math.round(c.trendWeight * 100) });
  if (!A.tests) return <Modal title={t("How the error numbers were worked out")} onClose={onClose} foot={<button className="btn btn-primary" onClick={onClose}>{t("Close")}</button>}><p className="small">{t("Not enough data: no month has 3 months of sales before it with sales above 0. This is not a 0% error.")}</p></Modal>;
  return (
    <Modal title={t("How the error numbers were worked out")} size="wide" onClose={onClose}
      foot={<button className="btn btn-primary" onClick={onClose} data-testid="button-proof-close">{t("Close")}</button>}>
      <div className="notice blue" style={{ marginBottom: 14 }}><Icon n="info" size={16} /><span>{t("A backtest on your own past sales. For each of {months}, StockNow hides that month, forecasts it from the months before only, and compares with what really sold. {n} tests in total. It uses the same months the suggestion was based on, so treat it as a guide, not a promise.", { months: list(tested), n: A.tests })}</span></div>
      <div className="scroll-x" style={{ marginBottom: 14 }}><table className="mini">
        <thead><tr><th /><th>{t("Forecast blend used")}</th></tr></thead>
        <tbody>
          <tr><td className="bold">{t("Now")}</td><td>{blend(current)}</td></tr>
          <tr><td className="bold">{t("Proposal")}</td><td>{blend(proposed)}</td></tr>
          <tr><td className="bold">{t("Simple 3-month average")}</td><td>{t("average of the last 3 months, the usual manual guess")}</td></tr>
        </tbody>
      </table></div>
      <div className="acc-grid">
        <Card id="sp-now" open={open.now} onToggle={() => toggle("now")} title={t("Error now")} value={pc1(A.error)}
          basis={t("Average error of all {n} tests with the current settings.", { n: A.tests })}>
          <Fm>{t("Error of one test")} = |{t("forecast")} − {t("really sold")}| ÷ {t("really sold")}</Fm>
          <Fm>({A.rows.map((r) => pc1(r.error)).join(" + ")}) ÷ {A.tests} = {f1(sum(A.rows, "error") * 100)}% ÷ {A.tests} = <b>{pc1(A.error)}</b></Fm>
        </Card>
        <Card id="sp-next" open={open.next} onToggle={() => toggle("next")} title={t("Error with proposal")} value={pc1(B.error)}
          basis={t("The same {n} tests, forecast again with the proposed settings.", { n: B.tests })}>
          <Fm>({B.rows.map((r) => pc1(r.error)).join(" + ")}) ÷ {B.tests} = {f1(sum(B.rows, "error") * 100)}% ÷ {B.tests} = <b>{pc1(B.error)}</b></Fm>
        </Card>
        <Card id="sp-base" open={open.base} onToggle={() => toggle("base")} title={t("Simple 3-month average")} value={pc1(A.baseline)}
          basis={t("The same {n} tests, guessed as the average of the 3 months before.", { n: A.tests })}>
          <Fm>({A.rows.map((r) => pc1(r.baselineError)).join(" + ")}) ÷ {A.tests} = {f1(sum(A.rows, "baselineError") * 100)}% ÷ {A.tests} = <b>{pc1(A.baseline)}</b></Fm>
        </Card>
        <Card id="sp-products" open={open.products} onToggle={() => toggle("products")} title={t("By product")} value={`${prods.length}`}
          basis={t("Average error per product, so you can see where the proposal helps or hurts.")}>
          <div className="scroll-x"><table className="mini" style={{ minWidth: 560 }}>
            <thead><tr><th>{t("Product")}</th><th className="right">{t("Tests")}</th><th className="right">{t("Error now")}</th><th className="right">{t("Error with proposal")}</th><th className="right">{t("Simple 3-month average")}</th></tr></thead>
            <tbody>
              {prods.map((r) => <tr key={r.p.id}><td>{r.p.name}</td><td className="right num">{r.n}</td><td className="right num">{pc1(r.now)}</td><td className="right num bold">{pc1(r.next)}</td><td className="right num muted">{pc1(r.base)}</td></tr>)}
              <tr><td className="bold">{t("All tests")}</td><td className="right num bold">{A.tests}</td><td className="right num bold">{pc1(A.error)}</td><td className="right num bold">{pc1(B.error)}</td><td className="right num bold">{pc1(A.baseline)}</td></tr>
            </tbody>
          </table></div>
        </Card>
        <Card id="sp-tests" open={open.tests} onToggle={() => toggle("tests")} title={t("Every test")} value={`${A.tests}`}
          basis={t("Each product and month: what really sold, and each method's forecast and error.")}>
          <div className="scroll-x"><table className="mini" style={{ minWidth: 640 }}>
            <thead><tr><th>{t("Product")}</th><th>{t("Month")}</th><th className="right">{t("Really sold")}</th><th className="right">{t("Now")}</th><th className="right">{t("Proposal")}</th><th className="right">{t("Simple 3-month average")}</th></tr></thead>
            <tbody>{A.rows.map((r) => { const b = nextOf[key(r)]; return (
              <tr key={key(r)}><td>{r.short}</td><td>{mn(r.month)}</td><td className="right num bold">{r.actual}</td>
                <td className="right num">{r.forecast} ({pc1(r.error)})</td><td className="right num bold">{b ? `${b.forecast} (${pc1(b.error)})` : "—"}</td><td className="right num muted">{r.baseline} ({pc1(r.baselineError)})</td></tr>); })}</tbody>
          </table></div>
          {A.excludedZero.length ? <p className="small muted">{t("Left out because 0 were sold (cannot divide by zero): {list}.", { list: A.excludedZero.map((r) => `${r.short} ${mn(r.month)}`).join(", ") })}</p> : null}
          <details className="acc-det"><summary>{t("Show the forecast working for every test, now and with the proposal")}</summary>
            {A.rows.map((r) => { const b = nextOf[key(r)]; return (
              <div key={key(r)}>
                <h4 className="small bold">{r.name} · {mn(r.month)} · {t("Now")}</h4><RowMath r={r} cfg={current} />
                {b ? <><h4 className="small bold">{r.name} · {mn(r.month)} · {t("Proposal")}</h4><RowMath r={b} cfg={proposed} /></> : null}
              </div>); })}
          </details>
        </Card>
      </div>
    </Modal>
  );
}

/* ---------- Forecast settings, drawn instead of written ---------- */
const SETTING_ICON = { wmaWeight: "activity", safetyPct: "box", cautious: "down", sellWindow: "clock", overstockDays: "calendar", lowMargin: "coins" };

/* One setting as a card: icon, name, value (old → new in a proposal) and a bar of the allowed range.
   The help text is the card's tooltip, so the card itself stays short. */
function SettingTile({ k, value, was, dflt, editor }) {
  const { t } = useApp();
  const { text: f } = useSettingText();
  const s = SETTINGS_UI[k], [lo, hi] = uiRange(k), unit = s.unit === "%" ? "%" : ` ${t("days")}`;
  const changed = was !== undefined && value !== "" && value !== was;
  const pos = (v) => `${Math.min(100, Math.max(0, ((s.toUi(v) - lo) / (hi - lo)) * 100))}%`;
  const short = (v) => (v === "" ? "—" : `${s.toUi(v)}${unit}`);
  return (
    <div className={`fs-tile ${changed ? "changed" : ""}`} title={t(s.help)}>
      <div className="fs-top"><DotIc ic={SETTING_ICON[k]} tone={changed ? "ai" : "blue"} size={14} /><span className="fs-label">{t(s.label)}</span>{changed ? <span className="chip chip-ai">{t("changed")}</span> : null}</div>
      <div className="fs-value num">{changed ? <><span className="fs-old">{short(was)}</span><span className="fs-arrow">→</span></> : null}<b>{short(value)}</b></div>
      {k === "wmaWeight" && value !== "" ? (
        <div className="fs-range" role="img" aria-label={f(k, value)}>
          <div className="fs-split"><i style={{ width: `${s.toUi(value)}%` }} /></div>
          <div className="fs-ends"><span className="fs-ai">{t("Recent months")} {s.toUi(value)}%</span><span>{t("Trend line")} {100 - s.toUi(value)}%</span></div>
        </div>
      ) : (
        <div className="fs-range">
          <div className="fs-track">
            {dflt !== undefined ? <i className="fs-default" style={{ left: pos(dflt) }} title={t("Default")} /> : null}
            {changed ? <i className="fs-dot fs-was" style={{ left: pos(was) }} /> : null}
            {value !== "" ? <i className="fs-dot" style={{ left: pos(value) }} /> : null}
          </div>
          <div className="fs-ends"><span>{lo}{unit}</span><span>{hi}{unit}</span></div>
        </div>
      )}
      {editor ? <div className="fs-edit">{editor}</div> : null}
    </div>
  );
}

function FsLegend({ compare = false }) {
  const { t } = useApp();
  return (
    <div className="fs-legend">
      {compare ? <span><i className="fs-dot fs-was static" /> {t("Now")}</span> : null}
      <span><i className="fs-dot static" /> {t(compare ? "Proposed" : "In use")}</span>
      {compare ? null : <span><i className="fs-default static" /> {t("Default")}</span>}
      <span className="faint">{t("Hover a card to see what it does")}</span>
    </div>
  );
}

/* Forecast error as horizontal bars (lower is better), each with its number. */
function ErrorBars({ title, sub, rows }) {
  const max = Math.max(...rows.map((r) => r.v), 0.01);
  return (
    <div className="err-bars">
      <div className="stack" style={{ marginBottom: 10 }}><span className="bold">{title}</span><span className="muted small">{sub}</span></div>
      {rows.map((r) => (
        <div className="err-row" key={r.label}>
          <span className="err-label">{r.label}</span>
          <div className="err-track"><i className={`tone-${r.tone}`} style={{ width: `${Math.max(2, (r.v / max) * 100)}%` }} /></div>
          <span className="err-v num">{(r.v * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}
