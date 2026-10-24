"use client";
import { useApp } from "../App.jsx";
import { DotIc, Empty, Icon } from "../ui.jsx";
import {
  budgetLeft, incomingOf, isCustomerReturn, isSale, lateDays, openPOs, pendingRequests, productOf, signals, spentThisMonth, supName, todayTx, userOf,
} from "@/lib/engine.js";
import { daysText, fmtAt, list, num, rm, today } from "@/lib/format.js";

/* To-do list built from automatic triggers and open work. */
function useForYou() {
  const { d, me, can, go, openPlan, openModal } = useApp();
  const items = [], approver = can("approveAI");
  const pend = pendingRequests(d);
  if (approver) pend.forEach((r) => items.push({ key: r.id, tone: "amber", ic: "approve", title: `Approve ${r.code} from ${userOf(d, r.by).name}`, sub: `${rm(r.items.reduce((s, i) => s + i.cost, 0))} · expected profit ${rm(r.items.reduce((s, i) => s + i.profit, 0))}`, btn: "Review", run: () => go("approvals") }));
  if (!approver) pend.filter((r) => r.by === me.id).forEach((r) => items.push({ key: r.id, tone: "grey", ic: "clock", title: `${r.code} is waiting for ${list((r.sentTo || []).map((id) => userOf(d, id).name))}`, sub: `Sent ${fmtAt(r.at)} · ${rm(r.items.reduce((s, i) => s + i.cost, 0))}`, btn: "View", run: () => go("approvals") }));
  const plan = d.alerts.find((a) => a.open && a.type === "PLAN");
  if (plan && !pend.length) items.push({ key: plan.id, tone: "ai", ic: "spark", title: "AI drafted a restock plan", sub: `Automatic, from the ${rm(budgetLeft(d))} budget left · ${fmtAt(plan.at)}`, btn: "Review plan", run: openPlan });
  d.alerts.filter((a) => a.open && a.type === "LOW").forEach((a) => {
    const p = productOf(d, a.pid);
    if (!p) return;
    const g = signals(d, p);
    items.push({ key: a.id, tone: "red", ic: "warning", title: `${p.name} ${p.stock === 0 ? "is out of stock" : `lasts about ${daysText(g ? g.cover : Infinity)}`}`, sub: `Automatic alert after a stock out · ${fmtAt(a.at)}`, btn: "Plan restock", run: openPlan });
  });
  openPOs(d).forEach((po) => {
    const late = lateDays(po);
    if (!po.sentAt) items.push({ key: po.id, tone: "blue", ic: "send", title: `Send ${po.code} to ${supName(d, po.sup)}`, sub: "Approved, not ordered yet", btn: "Send order", run: () => openModal("message", { poId: po.id, msgKind: "order" }) });
    else if (late) items.push({ key: po.id, tone: "red", ic: "truck", title: `${po.code} from ${supName(d, po.sup)} is ${late} days late`, sub: po.chasedAt ? `Reminder sent ${fmtAt(po.chasedAt)}` : "Found by the daily delivery check", btn: po.chasedAt ? "Remind again" : "Chase supplier", run: () => openModal("message", { poId: po.id, msgKind: "chase" }) });
    else items.push({ key: po.id, tone: "blue", ic: "truck", title: `Receive ${po.code} when it arrives`, sub: `${supName(d, po.sup)} · expected ${fmtAt(po.expectedAt)}`, btn: "Open", run: () => go("stock-in", { stockInTab: "orders" }) });
  });
  return items;
}

export default function Dashboard() {
  const { d, ui, setUi, can, go, openPlan, openModal } = useApp();
  const todo = useForYou();
  const tx = todayTx(d), sales = tx.filter(isSale);
  const soldUnits = sales.reduce((s, t) => s + t.qty, 0);
  const sellOf = (t) => t.qty * (productOf(d, t.pid)?.sell ?? 0);
  const gross = sales.reduce((s, t) => s + sellOf(t), 0), returned = tx.filter(isCustomerReturn).reduce((s, t) => s + sellOf(t), 0);
  const salesValue = Math.max(0, gross - returned);
  const ins = tx.filter((t) => t.type === "STOCK_IN"), outs = tx.filter((t) => t.type === "STOCK_OUT");
  const inUnits = ins.reduce((s, t) => s + t.qty, 0), outUnits = outs.reduce((s, t) => s + t.qty, 0);
  const out = d.products.filter((p) => p.stock === 0), low = d.products.filter((p) => p.stock > 0 && p.stock < p.min);
  const left = budgetLeft(d), mb = d.settings.monthlyBudget;
  const tab = ui.dashTab, rows = tab === "low" ? low : out;

  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">Dashboard</h1><p className="page-sub">{fmtAt(today())}</p></div>
        <button className="btn btn-ai" onClick={openPlan}><Icon n="spark" /> Plan restock with AI</button>
      </div>

      <div className="stats">
        <div className="stat t-blue"><div className="stat-label"><Icon n="box" size={15} /> Total products</div><div className="stat-value">{d.products.length}</div><div className="stat-foot">{num(d.products.reduce((s, p) => s + p.stock, 0))} pieces in stock</div></div>
        <div className="stat t-green"><div className="stat-label"><Icon n="in" size={15} /> Stock in today</div><div className="stat-value">{num(inUnits)}</div><div className="stat-foot">{ins.length} {ins.length === 1 ? "delivery" : "deliveries"} received</div></div>
        <div className="stat t-amber"><div className="stat-label"><Icon n="out" size={15} /> Stock out today</div><div className="stat-value">{num(outUnits)}</div><div className="stat-foot">{num(soldUnits)} sold{outUnits > soldUnits ? ` · ${num(outUnits - soldUnits)} other` : ""}</div></div>
        <div className="stat t-teal"><div className="stat-label"><Icon n="receipt" size={15} /> Sales value today</div><div className="stat-value">{rm(salesValue)}</div><div className="stat-foot">{returned ? `${rm(gross)} sold · ${rm(returned)} returned` : "At selling price, net of returns"}</div></div>
        <div className="stat t-ai stat-click" role="link" tabIndex={0} aria-label="Open AI Restock" onClick={() => go("ai")} onKeyDown={(e) => { if (e.key === "Enter") go("ai"); }}>
          {can("setBudget") ? <button className="icon-btn stat-edit" aria-label="Set monthly budget" title="Set monthly budget" onClick={(e) => { e.stopPropagation(); openModal("budget"); }}><Icon n="pencil" size={15} /></button> : null}
          <div className="stat-label"><Icon n="wallet" size={15} /> Budget left this month</div>
          <div className="stat-value">{rm(left)}</div>
          <div className="bar"><i style={{ width: `${mb ? Math.round((left / mb) * 100) : 0}%` }} /></div>
          <div className="stat-foot">of {rm(mb)} · {rm(spentThisMonth(d))} used</div>
        </div>
        <div className="stat t-red"><div className="stat-label"><Icon n="warning" size={15} /> Out of stock</div><div className="stat-value">{out.length}</div><div className="stat-foot">{low.length} more running low</div></div>
      </div>

      <div className="card section">
        <div className="card-head">
          <div className="row" style={{ gap: 10 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="bell" /></span><h2 className="card-title">For you today</h2><span className="chip chip-grey">{todo.length}</span></div>
          <span className="muted small">StockNow watches stock, plans and deliveries for you</span>
        </div>
        {todo.length ? todo.map((t) => (
          <div className="todo" key={t.key}>
            <DotIc ic={t.ic} tone={t.tone} />
            <span className="stack"><span className="bold">{t.title}</span><span className="muted small">{t.sub}</span></span>
            <button className="btn btn-secondary btn-sm" onClick={t.run}>{t.btn}</button>
          </div>
        )) : <Empty title="All clear" text="Nothing needs you right now. StockNow will tell you when it does." ic="check" />}
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Needs attention</h2>
          <div className="tabs">
            <button className={`tab ${tab === "low" ? "on" : ""}`} onClick={() => setUi({ dashTab: "low" })}>Low stock<span className="n">{low.length}</span></button>
            <button className={`tab ${tab === "out" ? "on" : ""}`} onClick={() => setUi({ dashTab: "out" })}>Out of stock<span className="n">{out.length}</span></button>
          </div>
        </div>
        {rows.length ? (
          <div className="scroll-x"><table style={{ minWidth: 620 }}>
            <thead><tr><th>Product</th><th className="right">Stock</th><th className="right">Minimum</th><th>Lasts</th><th className="right">Action</th></tr></thead>
            <tbody>{rows.map((p) => {
              const g = signals(d, p), inc = incomingOf(d, p.id);
              return (
                <tr key={p.id}>
                  <td><span className="bold">{p.name}</span><div className="mono faint">{p.sku}</div></td>
                  <td className="right bold num" style={{ color: p.stock === 0 ? "var(--red-fg)" : "var(--amber-fg)" }}>{p.stock}</td>
                  <td className="right muted num">{p.min}</td>
                  <td>{p.stock === 0 ? <span className="chip chip-red">Empty</span> : g ? <span className="chip chip-amber">{daysText(g.cover)}</span> : "—"}{inc ? <> <span className="chip chip-blue">{inc} on order</span></> : null}</td>
                  <td className="right"><button className="btn btn-ghost-ai btn-sm" onClick={openPlan}><Icon n="spark" size={14} /> Plan restock</button></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <Empty title={tab === "low" ? "No low stock" : "Nothing is out of stock"} text="Products below their minimum appear here." ic="check" />}
      </div>
    </>
  );
}
