"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../App.jsx";
import { Bullets, DotIc, Empty, Icon, PoCell, ReqChip, Select, Spark, confColor, reasonIcon } from "../ui.jsx";
import {
  ENGINE, analyse, backtest, budgetLeft, checks, inPlan, openPOs, overridesOf, poOf, routeTo, sendBlock, setItemIncluded, setItemQty,
  spentThisMonth, summaryBullets, userOf,
} from "@/lib/engine.js";
import { SCENARIOS } from "@/lib/seed.js";
import { ROLE_LABEL } from "@/lib/actions.js";
import { HORIZON, clone, daysText, digits, fmtAt, list, num, pct, plural, rm, toJSON } from "@/lib/format.js";

const REDUCED = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function routeText(d) {
  return `Goes to ${list(routeTo(d).map((u) => `${u.name} (${ROLE_LABEL[u.role]})`))}.`;
}

/* Where the most recent plan is in the 6-step workflow. */
function flowStage(d, phase) {
  const r = d.requests[0];
  if (phase === "thinking") return 2;
  if (phase === "done") return 3;
  if (!r || r.status === "REJECTED") return 1;
  if (r.status === "PENDING") return 4;
  const pos = (r.poIds || []).map((id) => poOf(d, id)).filter(Boolean);
  if (pos.some((p) => !p.sentAt)) return 5;
  return pos.every((p) => p.status === "RECEIVED") ? 7 : 6;
}
function FlowBar() {
  const { d, ui } = useApp();
  const now = flowStage(d, ui.ai.phase);
  return (
    <div className="flow" aria-label="Restock workflow">
      {["Alert or budget", "AI plan", "Send", "Approve", "Order supplier", "Receive"].map((s, i) => (
        <span key={s} className={`flow-step ${i + 1 < now ? "done" : i + 1 === now ? "now" : ""}`}>
          <b>{i + 1 < now ? <Icon n="check" size={11} sw={3} /> : i + 1}</b>{s}
        </span>
      ))}
    </div>
  );
}

const thinkSteps = (d, ai) => [
  `Reading stock: ${d.products.length} products, ${num(d.products.reduce((s, p) => s + p.stock, 0))} pieces`,
  `Reading ${d.settings.salesMonths.length} months of sales (${d.settings.salesMonths[0]}–${d.settings.salesMonths.at(-1)})`,
  `Forecasting sales for ${HORIZON}`,
  `Checking margins, stock days and ${plural(openPOs(d).length, "open order")}`,
  ai.ideal ? "Working out what everything would cost" : `Fitting purchases into ${rm(+digits(ai.budget) || 0)}`,
];

export default function AiRestock() {
  const { d, me, ui, setAi, can, go, act, toast, openPlan, switchScenario, offline } = useApp();
  const a = ui.ai, r = a.result, b = +a.budget || 0;
  const mb = d.settings.monthlyBudget, spent = spentThisMonth(d), left = budgetLeft(d);
  const plan = d.alerts.find((x) => x.open && x.type === "PLAN");
  const mine = d.requests.filter((x) => can("approveAI") || x.by === me.id).slice(0, 4);

  /* The "thinking" walk-through, one step at a time, then the deterministic analysis. */
  useEffect(() => {
    if (a.phase !== "thinking") return;
    const steps = thinkSteps(d, a).length;
    const t = setTimeout(() => {
      if (a.step + 1 < steps) return setAi({ step: a.step + 1 });
      const budget = a.ideal ? Infinity : +digits(a.budget);
      const res = analyse(d, budget);
      setAi({ step: steps, phase: "done", result: res, summary: null });
      if (!offline) act("logAnalysis", { text: res.ideal ? `AI worked out the ideal plan: ${rm(res.t.cost)} for ${plural(res.t.buy.length, "product")}.` : `AI analysed a ${rm(budget)} budget: ${res.t.buy.length} buy, ${res.t.skip.length} don't buy, ${res.t.wait.length} wait. Expected profit ${rm(res.t.profit)}.` });
    }, REDUCED() ? 60 : 380);
    return () => clearTimeout(t);
  }, [a.phase, a.step]); // eslint-disable-line react-hooks/exhaustive-deps

  function start(ideal = a.ideal) {
    const bud = +digits(a.budget);
    if (!ideal && !(bud >= 100)) return toast("Enter a budget of at least RM 100, or turn on No limit.", true);
    setAi({ phase: "thinking", step: 0, result: null, auto: false, filter: null, open: {}, ideal, summary: null, ...(ideal ? {} : { budget: String(bud) }) });
  }
  const setBudget = (v) => setAi({ budget: digits(v), ideal: false });
  const setIdeal = (on) => { if (on) start(true); else setAi({ ideal: false, budget: String(left) }); };

  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">AI Restock</h1><p className="page-sub">AI checks your stock, sales and budget, then tells you what to buy, what to skip, and why.</p></div>
        <span className="chip chip-ai"><Icon n="bot" size={14} /> Numbers by StockNow · wording by Gemini</span>
      </div>
      <FlowBar />
      <div className="row wrap" style={{ justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div className="tabs">
          <button className={`tab ${a.tab !== "accuracy" ? "on" : ""}`} onClick={() => setAi({ tab: "plan" })}>Restock plan</button>
          <button className={`tab ${a.tab === "accuracy" ? "on" : ""}`} onClick={() => setAi({ tab: "accuracy" })}>Accuracy check</button>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <label className="muted small" htmlFor="scn">Demo data</label>
          <div style={{ width: 230, maxWidth: "60vw" }}><Select id="scn" cls="sm" value={d.settings.scenario} onChange={switchScenario} options={Object.entries(SCENARIOS).map(([k, x]) => [k, x.label])} /></div>
        </div>
      </div>

      <div className="ai-layout"><div className="stack" style={{ gap: 20 }}>
        {a.tab === "accuracy" ? <AccuracyView /> : (
          <>
            <div className="card card-pad" style={{ borderColor: "var(--ai-br)" }}>
              <div className="budget-tiles">
                <div className="btile"><DotIc ic="wallet" tone="ai" /><div className="stack"><span className="muted small">Monthly budget</span><span className="v">{rm(mb)}</span>
                  {can("setBudget") ? <BudgetChangeButton /> : null}</div></div>
                <div className="btile"><DotIc ic="approve" tone="blue" /><div className="stack"><span className="muted small">Used this month</span><span className="v">{rm(spent)}</span></div></div>
                <div className="btile"><DotIc ic="coins" tone={left > 0 ? "green" : "red"} /><div className="stack" style={{ flex: 1 }}><span className="muted small">Left to spend</span><span className="v">{rm(left)}</span>
                  <div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${mb ? Math.round((left / mb) * 100) : 0}%` }} /></div></div></div>
              </div>
              <label className="label" htmlFor="budget">Budget for this plan</label>
              <div className="row wrap" style={{ gap: 12 }}>
                <div className="budget-input"><span>RM</span>
                  <input className="input" id="budget" inputMode="numeric" value={a.ideal ? "" : a.budget} placeholder={a.ideal ? "No limit" : String(left)}
                    onChange={(e) => setBudget(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") start(false); }} disabled={a.phase === "thinking"} />
                </div>
                <button className="btn btn-ai btn-lg" onClick={() => start(false)} disabled={a.phase === "thinking"}><Icon n="spark" size={20} /> {r ? "Analyse again" : "Analyse with AI"}</button>
              </div>
              <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
                <div className="chips">
                  <button className={`qchip ${!a.ideal && b === left ? "on" : ""}`} onClick={() => setBudget(String(left))}>Budget left · {rm(left)}</button>
                  {[10000, 20000, 30000].filter((v) => v !== left).map((v) => <button key={v} className={`qchip ${!a.ideal && b === v ? "on" : ""}`} onClick={() => setBudget(String(v))}>{rm(v)}</button>)}
                </div>
                <span className="spacer" />
                <label className="switch"><input type="checkbox" checked={a.ideal} onChange={(e) => setIdeal(e.target.checked)} /> No limit: show what everything costs</label>
              </div>
              <div className="reads">
                <span><Icon n="box" size={14} /> {plural(d.products.length, "product")}</span>
                <span><Icon n="activity" size={14} /> {d.settings.salesMonths.length} months of sales</span>
                <span><Icon n="tag" size={14} /> cost &amp; selling prices</span>
                <span><Icon n="truck" size={14} /> {plural(openPOs(d).length, "open order")}</span>
              </div>
            </div>

            {a.phase === "thinking" ? <ThinkingCard /> : null}
            {a.phase !== "thinking" && r ? <ResultView /> : null}
            {a.phase === "idle" && !r ? (
              <div className="card">
                {plan ? (
                  <div className="todo"><DotIc ic="spark" tone="ai" />
                    <span className="stack"><span className="bold">AI already drafted a plan at {plan.at.split(" ")[1]}</span><span className="muted small">Automatic, from the {rm(left)} budget left this month</span></span>
                    <button className="btn btn-ai btn-sm" onClick={openPlan}>Review plan</button></div>
                ) : null}
                <Empty title="Ready when you are" text="Pick a budget and press Analyse. Or turn on No limit to see how much money everything would need." ic="spark" />
              </div>
            ) : null}

            {mine.length ? (
              <div className="card">
                <div className="card-head"><h2 className="card-title">{can("approveAI") ? "Recent plans" : "My plans"}</h2>{can("approveAI") ? <button className="btn btn-link" onClick={() => go("approvals")}>Open approvals</button> : null}</div>
                <div className="scroll-x"><table style={{ minWidth: 640 }}>
                  <thead><tr><th>Plan</th><th>Sent by</th><th className="right">Purchase</th><th>Status</th><th>Supplier orders</th></tr></thead>
                  <tbody>{mine.map((x) => (
                    <tr key={x.id}>
                      <td><span className="mono bold">{x.code}</span><div className="faint small">{fmtAt(x.at)}</div></td>
                      <td>{userOf(d, x.by).name}</td>
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
  const { openModal } = useApp();
  return <button className="btn btn-link btn-sm" style={{ height: 26, padding: "0 8px", alignSelf: "flex-start", marginTop: 2 }} onClick={() => openModal("budget")}>Change</button>;
}

function ThinkingCard() {
  const { d, ui } = useApp();
  const steps = thinkSteps(d, ui.ai), s = ui.ai.step;
  return (
    <div className="card thinking" style={{ borderColor: "var(--ai-br)" }} aria-live="polite">
      <div className="row" style={{ marginBottom: 8 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="bot" size={20} /></span><h2 className="card-title">AI is analysing your shop…</h2></div>
      {steps.map((t, i) => (
        <div key={i} className={`think-step ${i < s ? "done" : i === s ? "now" : ""}`}>
          <span className="think-dot">{i < s ? <Icon n="check" size={12} sw={3} /> : null}</span>{t}
        </div>
      ))}
      <div className="bar"><i style={{ width: `${Math.round((s / steps.length) * 100)}%` }} /></div>
    </div>
  );
}

/* Gemini's paragraph about the current plan. Re-written (debounced) whenever quantities change. */
function useGeminiSummary() {
  const { ui, setAi, offline } = useApp();
  const r = ui.ai.result;
  const key = r ? toJSON({ b: r.ideal ? "ideal" : r.budget, o: overridesOf(r) }) : "";
  const latest = useRef("");
  useEffect(() => {
    if (!r || offline) return;
    if (ui.ai.summary?.key === key) return;
    latest.current = key;
    setAi((ai) => ({ summary: { ...(ai.summary || {}), key, loading: true } }));
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/ai/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: toJSON({ budget: r.ideal ? "ideal" : r.budget, overrides: overridesOf(r) }) });
        const out = await res.json();
        if (latest.current === key) setAi({ summary: { key, loading: false, text: out.text, source: out.source, note: out.note } });
      } catch {
        if (latest.current === key) setAi({ summary: { key, loading: false, text: "", source: "template", note: "No connection" } });
      }
    }, 700);
    return () => clearTimeout(t);
  }, [key, offline]); // eslint-disable-line react-hooks/exhaustive-deps
}

function SummaryBox({ r }) {
  const { ui, offline } = useApp();
  const s = ui.ai.summary;
  const text = s && !s.loading && s.text ? s.text : r.summary.replace(/\*\*/g, "");
  const fromGemini = s && !s.loading && s.source === "gemini";
  return (
    <div className="summary-box" aria-live="polite">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
        <span className="eyebrow" style={{ color: "var(--ai-fg)" }}>In short</span>
        <span className="chip chip-ai" title={s?.note || ""}><Icon n="bot" size={12} /> {s?.loading ? "Gemini is writing…" : fromGemini ? "Written by Gemini from these numbers" : offline ? "Offline: template text" : "Template text (Gemini off)"}</span>
      </div>
      {s?.loading ? <><div className="skel" style={{ width: "92%" }} /><div className="skel" style={{ width: "70%" }} /></> : <p className="ai-text">{text}</p>}
    </div>
  );
}

function WhatIf({ r }) {
  const { d, setAi } = useApp();
  const [v, setV] = useState(Math.min(50000, Math.max(5000, r.budget)));
  const commit = () => { if (v !== r.budget) setAi({ budget: String(v), ideal: false, result: analyse(d, v), filter: null, summary: null }); };
  return (
    <details className="more" style={{ marginTop: 14 }}>
      <summary><Icon n="coins" size={14} /> Try another budget</summary>
      <div style={{ marginTop: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}><span className="muted small">Drag and release to re-plan</span><span className="bold num" style={{ color: "var(--ai)" }}>{rm(v)}</span></div>
        <input type="range" className="slider" aria-label="Budget" min="5000" max="50000" step="1000" value={v}
          onChange={(e) => setV(+e.target.value)} onPointerUp={commit} onKeyUp={commit} onTouchEnd={commit} />
      </div>
    </details>
  );
}

function ResultView() {
  const { d, ui, setAi, openModal } = useApp();
  useGeminiSummary();
  const r = ui.ai.result, t = r.t, c = checks(d, r), f = ui.ai.filter;
  const tied = t.skip.reduce((s, i) => s + i.stock * i.unitCost, 0);
  const waitCost = t.wait.reduce((s, i) => s + i.need * i.unitCost, 0);
  const segs = t.buy.map((i, k) => ({ i, w: (i.cost / Math.max(r.ideal ? t.cost : r.budget, t.cost, 1)) * 100, col: `var(--seg${(k % 6) + 1})` }));
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
          <div className="row" style={{ gap: 8 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="spark" /></span><h2 className="card-title">{r.ideal ? "Ideal plan (no budget limit)" : "What AI found"}</h2></div>
          <span className="chip chip-ai">{ui.ai.auto ? "Drafted automatically" : "AI analysis"} · {r.at.split(" ")[1]}</span>
        </div>
        <div className="verdicts" role="group" aria-label="Filter by decision">
          {verdict("buy", "cart", "var(--green-bg)", "var(--green-fg)", t.buy.length, `Buy · ${rm(t.cost)}`)}
          {verdict("wait", "pause", "var(--amber-bg)", "var(--amber-fg)", t.wait.length, `Wait${waitCost ? ` · needs ${rm(waitCost)}` : ""}`)}
          {verdict("skip", "ban", "var(--red-bg)", "var(--red-fg)", t.skip.length, `Don't buy · ${rm(tied)} sitting`)}
        </div>
        <SummaryBox r={r} />
        <Bullets items={summaryBullets(d, r)} style={{ marginTop: 18 }} />
        <div className="row wrap" style={{ marginTop: 14, gap: 6 }}>
          {c.over ? <span className="chip chip-red"><Icon n="close" size={12} sw={2.6} /> Over budget</span> : null}
          <details className="more">
            <summary><span className="chip chip-green"><Icon n="check" size={12} sw={2.6} /> {c.ok.length} checks passed</span></summary>
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>{c.ok.map((x) => <span key={x} className="chip chip-green"><Icon n="check" size={12} sw={2.6} /> {x}</span>)}</div>
          </details>
          {c.warn.map((x) => <span key={x} className="chip chip-amber" title="Needs your judgement"><Icon n="warning" size={12} sw={2} /> {x}</span>)}
        </div>
        {t.buy.length ? (
          <div style={{ marginTop: 16 }}>
            <div className="alloc" role="img" aria-label="Where the money goes">{segs.map((s) => <i key={s.i.pid} style={{ width: `${s.w}%`, background: s.col }} title={`${s.i.name} ${rm(s.i.cost)}`} />)}</div>
            <div className="legend">
              {segs.map((s) => <span key={s.i.pid}><i style={{ background: s.col }} />{s.i.short} {rm(s.i.cost)}</span>)}
              {!r.ideal && t.left > 0 ? <span><i style={{ background: "var(--divider)", border: "1px solid var(--border)" }} />Unspent {rm(t.left)}</span> : null}
            </div>
          </div>
        ) : null}
        {r.ideal ? null : <WhatIf key={r.at + r.budget} r={r} />}
      </div>

      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h2 className="card-title">{f === "buy" ? "Buy" : f === "wait" ? "Wait" : f === "skip" ? "Don't buy" : "All products"} <span className="muted" style={{ fontWeight: 400 }}>({shown.length})</span></h2>
        <span className="muted small">Tap a product to see how AI decided · change quantities with − / +</span>
      </div>
      <div className="plan">
        <div className="plan-cols"><span /><span>Product</span><span>Quantity</span><span className="right">Cost</span><span className="right">Profit</span><span>Confidence</span><span /></div>
        {shown.length ? shown.map((i) => <PlanRow key={i.pid} i={i} />) : <div className="card"><Empty title="Nothing here" text="Pick another filter above." ic="check" /></div>}
      </div>

      <div className="send-bar">
        <div className="stack"><span className="bold">{plural(t.buy.length, "item")} · {rm(t.cost)} · expected profit {rm(t.profit)}</span><span className="muted small">{block || routeText(d)}</span></div>
        <span className="spacer" />
        <button className="btn btn-ai btn-lg" disabled={!!block} onClick={() => openModal("send")}><Icon n="send" size={18} /> Send to Approval</button>
      </div>
    </>
  );
}

function PlanRow({ i }) {
  const { ui, setAi, openModal } = useApp();
  const g = i.g, on = inPlan(i), open = !!ui.ai.open[i.pid];
  const kind = i.decision === "DO_NOT_BUY" ? "skip" : !on ? "wait" : i.qty < i.need ? "partial" : "buy";
  const [ic, tone] = { buy: ["cart", "green"], partial: ["cart", "amber"], wait: ["pause", "amber"], skip: ["ban", "red"] }[kind];
  const label = { buy: "BUY", partial: "BUY · REDUCED", wait: "WAIT", skip: "DON'T BUY" }[kind];
  const edit = (fn) => setAi((a) => ({ result: fn(clone(a.result)) }));
  const setQty = (v) => edit((r) => setItemQty(r, i.pid, +digits(v) || 0));
  const toggle = () => setAi((a) => ({ open: { ...a.open, [i.pid]: !a.open[i.pid] } }));
  const stop = (e) => e.stopPropagation();
  const qtyCell = i.decision === "BUY"
    ? on ? (
      <div className="stepper" onClick={stop}>
        <button aria-label="Fewer" onClick={() => setQty(Math.max(0, i.qty - 5))}><Icon n="minus" size={14} sw={2.2} /></button>
        <input inputMode="numeric" aria-label={`Quantity for ${i.name}`} value={i.qty} onChange={(e) => setQty(e.target.value)} />
        <button aria-label="More" onClick={() => setQty(i.qty + 5)}><Icon n="plus" size={14} sw={2.2} /></button>
      </div>
    ) : <button className="btn btn-ghost-ai btn-sm" onClick={(e) => { stop(e); edit((r) => setItemIncluded(r, i.pid, true)); }}><Icon n="plus" size={14} /> Add {i.need}</button>
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
          <span className="plan-sub">{i.stock === 0 ? "Out of stock" : `${i.stock} in stock · lasts ${daysText(g.cover)}`}{g.incoming ? ` · ${g.incoming} on order` : ""}</span>
          <span className="plan-sub m-only">{on ? `${i.qty} pcs · ${rm(i.cost)} · profit ${rm(i.profit)}` : i.decision === "BUY" ? `Needs ${i.need} pcs · ${rm(i.need * i.unitCost)}` : i.reasons[0]}</span>
        </div>
        <div className="d-only">{qtyCell}</div>
        <span className="right num d-only">{on ? rm(i.cost) : "—"}</span>
        <span className="right num bold d-only" style={{ color: "var(--green-fg)" }}>{on ? rm(i.profit) : "—"}</span>
        <span className="cbar d-only" title="AI confidence"><span><i style={{ width: `${g.conf}%`, background: confColor(g.conf) }} /></span>{g.conf}%</span>
        <span className="chev"><Icon n="chevronRight" /></span>
      </div>
      {open ? (
        <div className="plan-body">
          <div className="stack" style={{ gap: 14 }}>
            <div className="m-only">{qtyCell}</div>
            <div><div className="eyebrow" style={{ marginBottom: 8 }}>How AI decided</div><DecideStrip i={i} /></div>
            <div>
              <div className="eyebrow">Stock runway</div>
              <div className="runway"><i style={{ width: `${cover}%`, background: coverCol }} /></div>
              <div className="small muted">{i.stock === 0 ? "Empty now" : `Lasts ${daysText(g.cover)}`} at {g.daily.toFixed(1)} sales a day{g.cover < 30 ? " · target 30 days" : ""}</div>
            </div>
          </div>
          <div className="stack" style={{ gap: 12 }}>
            <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
              <Spark s={g.series} pred={g.forecast} />
              <div className="stack" style={{ textAlign: "right" }}><span className="faint small">Next 30 days</span><span className="bold num">{g.forecast} <Icon n={g.trend === "Rising" ? "up" : g.trend === "Falling" ? "down" : "dot"} size={14} /></span></div>
            </div>
            <ul className="reasons">{i.reasons.map((x) => { const [ri, rt] = reasonIcon(x); return <li key={x}><DotIc ic={ri} tone={rt} size={13} /><span>{x}</span></li>; })}</ul>
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => openModal("calc", { pid: i.pid })}><Icon n="calc" size={14} /> Show calculation</button>
              {on ? <button className="btn btn-secondary btn-sm" onClick={() => edit((r) => setItemIncluded(r, i.pid, false))}>Remove from plan</button> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DecideStrip({ i }) {
  const g = i.g;
  const box = (v, l, cls = "") => <div className={`stepbox ${cls}`} key={l}><b>{v}</b><span>{l}</span></div>;
  const op = (s, k) => <span className="op" key={k}>{s}</span>;
  let parts;
  if (i.decision === "BUY") {
    parts = [box(i.demandPlan, g.trend === "Falling" ? "Forecast × 70%" : "Will sell"), op("+", 1), box(i.safety, "Safety"), op("−", 2), box(i.stock, "In stock")];
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
  const { d } = useApp();
  const bt = backtest(d), M = d.settings.salesMonths, last = M.at(-1), range = `${M[0]}–${M.at(-2)}`;
  if (!bt.length) return <div className="card"><Empty title="Not enough history" text="Products need 4 months of sales or more to test." ic="activity" /></div>;
  const mape = bt.reduce((s, x) => s + x.err, 0) / bt.length, within = bt.filter((x) => x.err <= 0.15).length;
  const best = [...bt].sort((a, b) => a.err - b.err)[0], worst = [...bt].sort((a, b) => b.err - a.err)[0];
  const max = Math.max(...bt.map((x) => Math.max(x.forecast, x.actual)), 1);
  const under = bt.filter((x) => x.diff < 0 && x.err > 0.1), off = bt.filter((x) => x.verdict === "Off");
  const tile = (ic, tone, k, v) => <div className="btile"><DotIc ic={ic} tone={tone} /><div className="stack"><span className="muted small">{k}</span><span className="v">{v}</span></div></div>;
  const vchip = (v) => <span className={`chip ${v === "Accurate" ? "chip-green" : v === "Close" ? "chip-amber" : "chip-red"}`}>{v}</span>;
  return (
    <div className="card card-pad" style={{ borderColor: "var(--ai-br)" }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", marginBottom: 6 }}>
        <div className="row" style={{ gap: 8 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="target" /></span><h2 className="card-title">Is the AI accurate? A backtest</h2></div>
        <span className="chip chip-ai">{range} → predict {last}</span>
      </div>
      <p className="muted" style={{ marginBottom: 16 }}>We hid {last}&apos;s sales from the AI, asked it to predict {last} using only {range}, then compared with what really sold. Same formula as the restock plan.</p>
      <div className="budget-tiles">
        {tile("target", "ai", "Average error", pct(mape))}
        {tile("check", "green", "Within 15%", `${within} of ${bt.length} products`)}
        {tile("warning", worst.verdict === "Off" ? "red" : "amber", "Biggest miss", `${worst.p.short} ${pct(worst.err)}`)}
      </div>
      <div className="scroll-x"><table style={{ minWidth: 660 }}>
        <thead><tr><th>Product</th><th>Forecast vs actual</th><th className="right">AI said</th><th className="right">Really sold</th><th className="right">Difference</th><th>Result</th></tr></thead>
        <tbody>{bt.map((x) => (
          <tr key={x.p.id}>
            <td className="bold">{x.p.name}</td>
            <td><div className="pair" role="img" aria-label={`Forecast ${x.forecast}, actual ${x.actual}`}><i style={{ width: `${(x.forecast / max) * 100}%`, background: "var(--ai)" }} /><i style={{ width: `${(x.actual / max) * 100}%`, background: "var(--text-3)" }} /></div></td>
            <td className="right num">{x.forecast}</td>
            <td className="right num bold">{x.actual}</td>
            <td className="right num" style={{ color: x.err <= 0.1 ? "var(--green-fg)" : x.err <= 0.2 ? "var(--amber-fg)" : "var(--red-fg)" }}>{x.diff > 0 ? "+" : x.diff < 0 ? "−" : ""}{Math.abs(x.diff)} ({pct(x.err)})</td>
            <td>{vchip(x.verdict)}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <div className="legend" style={{ marginTop: 10 }}><span><i style={{ background: "var(--ai)" }} />AI forecast</span><span><i style={{ background: "var(--text-3)" }} />Really sold</span><span>Accurate ≤ 10% · Close ≤ 20% · Off &gt; 20%</span></div>
      <ul className="bullets" style={{ marginTop: 16 }}>
        <li><DotIc ic="check" tone="green" size={15} /><span>Best: <strong>{best.p.short}</strong>, only {pct(best.err)} off. Steady sellers are easy to predict.</span></li>
        {under.length ? <li><DotIc ic="up" tone="amber" size={15} /><span>Fast risers are under-forecast ({list(under.map((x) => `${x.p.short} ${pct(x.err)}`))}). That&apos;s why AI adds safety stock on top of the forecast.</span></li> : null}
        {off.length ? <li><DotIc ic="warning" tone="red" size={15} /><span>Off: {list(off.map((x) => x.p.short))}. Sales jumped suddenly, so AI shows lower confidence and a person should decide.</span></li> : null}
        <li><DotIc ic="activity" tone="blue" size={15} /><span>This check runs on your own sales history, so accuracy is measured for your shop, not just claimed.</span></li>
      </ul>
    </div>
  );
}
