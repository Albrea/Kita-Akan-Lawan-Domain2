"use client";
import { useApp } from "../App.jsx";
import { DotIc, Empty, Icon } from "../ui.jsx";
import {
  budgetLeft, incomingOf, isCustomerReturn, isSale, lateDays, openPOs, pendingRequests, productOf, signals, spentThisMonth, supName, todayTx, userOf,
} from "@/lib/engine.js";
import { list, num, rm, today } from "@/lib/format.js";

/* To-do list built from automatic triggers and open work. */
function useForYou() {
  const { d, me, can, go, openPlan, openModal, t, tp, when, days } = useApp();
  const items = [], approver = can("approveAI");
  const pend = pendingRequests(d);
  d.alerts.filter((a) => a.open && a.type === "PAYMENT").forEach((a) => items.push({
    key: a.id, tone: "red", ic: "receipt", title: t("Orbyte payment {id} needs a person to check", { id: a.poId }),
    sub: `${t("Not recorded automatically")} · ${when(a.at)}`, btn: t(approver ? "Check" : "View"), run: () => openModal("payment", { alertId: a.id }),
  }));
  if (approver) pend.forEach((r) => items.push({ key: r.id, tone: "amber", ic: "approve", title: t("Approve {code} from {name}", { code: r.code, name: userOf(d, r.by).name }), sub: t("{cost} · expected profit {profit}", { cost: rm(r.items.reduce((s, i) => s + i.cost, 0)), profit: rm(r.items.reduce((s, i) => s + i.profit, 0)) }), btn: t("Review"), run: () => go("approvals") }));
  if (!approver) pend.filter((r) => r.by === me.id).forEach((r) => items.push({ key: r.id, tone: "grey", ic: "clock", title: t("{code} is waiting for {names}", { code: r.code, names: list((r.sentTo || []).map((id) => userOf(d, id).name)) }), sub: `${t("Sent {date}", { date: when(r.at) })} · ${rm(r.items.reduce((s, i) => s + i.cost, 0))}`, btn: t("View"), run: () => go("approvals") }));
  const plan = d.alerts.find((a) => a.open && a.type === "PLAN");
  if (plan && !pend.length) items.push({ key: plan.id, tone: "ai", ic: "spark", title: t("AI drafted a restock plan"), sub: `${t("Automatic, from the {left} budget left", { left: rm(budgetLeft(d)) })} · ${when(plan.at)}`, btn: t("Review plan"), run: openPlan });
  d.alerts.filter((a) => a.open && a.type === "LOW").forEach((a) => {
    const p = productOf(d, a.pid);
    if (!p) return;
    const g = signals(d, p);
    items.push({ key: a.id, tone: "red", ic: "warning", title: p.stock === 0 ? t("{name} is out of stock", { name: p.name }) : t("{name} lasts about {days}", { name: p.name, days: days(g ? g.cover : Infinity) }), sub: `${t("Automatic alert after a stock change")} · ${when(a.at)}`, btn: t("Plan restock"), run: openPlan });
  });
  openPOs(d).forEach((po) => {
    const late = lateDays(po), sup = supName(d, po.sup);
    if (!po.sentAt) items.push({ key: po.id, tone: "blue", ic: "send", title: t("Send {code} to {sup}", { code: po.code, sup }), sub: t("Approved, not ordered yet"), btn: t("Send order"), run: () => openModal("message", { poId: po.id, msgKind: "order" }) });
    else if (late) items.push({ key: po.id, tone: "red", ic: "truck", title: tp(late, "{code} from {sup} is {n} day late", "{code} from {sup} is {n} days late", { code: po.code, sup }), sub: po.chasedAt ? t("Reminder sent {date}", { date: when(po.chasedAt) }) : t("Found by the daily delivery check"), btn: t(po.chasedAt ? "Remind again" : "Chase supplier"), run: () => openModal("message", { poId: po.id, msgKind: "chase" }) });
    else items.push({ key: po.id, tone: "blue", ic: "truck", title: t("Receive {code} when it arrives", { code: po.code }), sub: `${sup} · ${t("expected {date}", { date: when(po.expectedAt) })}`, btn: t("Receive"), run: () => go("stock-in", { stockInTab: "orders", focusPo: po.id }) });
  });
  return items;
}

export default function Dashboard() {
  const { d, ui, setUi, can, go, openPlan, openModal, t, tp, when, days } = useApp();
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
        <div><h1 className="page-title">{t("Dashboard")}</h1><p className="page-sub">{when(today())}</p></div>
        <button className="btn btn-ai" onClick={openPlan}><Icon n="spark" /> {t("Plan restock with AI")}</button>
      </div>

      <div className="stats">
        <div className="stat t-blue"><div className="stat-label"><Icon n="box" size={15} /> {t("Total products")}</div><div className="stat-value">{d.products.length}</div><div className="stat-foot">{t("{n} pieces in stock", { n: num(d.products.reduce((s, p) => s + p.stock, 0)) })}</div></div>
        <div className="stat t-green"><div className="stat-label"><Icon n="in" size={15} /> {t("Stock in today")}</div><div className="stat-value">{num(inUnits)}</div><div className="stat-foot">{tp(ins.length, "{n} delivery received", "{n} deliveries received")}</div></div>
        <div className="stat t-amber"><div className="stat-label"><Icon n="out" size={15} /> {t("Stock out today")}</div><div className="stat-value">{num(outUnits)}</div><div className="stat-foot">{t("{n} sold", { n: num(soldUnits) })}{outUnits > soldUnits ? ` · ${t("{n} other", { n: num(outUnits - soldUnits) })}` : ""}</div></div>
        <div className="stat t-teal"><div className="stat-label"><Icon n="receipt" size={15} /> {t("Sales value today")}</div><div className="stat-value">{rm(salesValue)}</div><div className="stat-foot">{returned ? t("{sold} sold · {back} returned", { sold: rm(gross), back: rm(returned) }) : t("At selling price, net of returns")}</div></div>
        <div className="stat t-ai stat-click" role="link" tabIndex={0} aria-label={t("Open AI Restock")} onClick={() => go("ai")} onKeyDown={(e) => { if (e.key === "Enter") go("ai"); }}>
          {can("setBudget") ? <button className="icon-btn stat-edit" aria-label={t("Set monthly budget")} title={t("Set monthly budget")} onClick={(e) => { e.stopPropagation(); openModal("budget"); }}><Icon n="pencil" size={15} /></button> : null}
          <div className="stat-label"><Icon n="wallet" size={15} /> {t("Budget left this month")}</div>
          <div className="stat-value">{rm(left)}</div>
          <div className="bar"><i style={{ width: `${mb ? Math.round((left / mb) * 100) : 0}%` }} /></div>
          <div className="stat-foot">{t("of {total} · {used} used", { total: rm(mb), used: rm(spentThisMonth(d)) })}</div>
        </div>
        <div className="stat t-red"><div className="stat-label"><Icon n="warning" size={15} /> {t("Out of stock")}</div><div className="stat-value">{out.length}</div><div className="stat-foot">{t("{n} more running low", { n: low.length })}</div></div>
      </div>

      <div className="card section">
        <div className="card-head">
          <div className="row" style={{ gap: 10 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="bell" /></span><h2 className="card-title">{t("For you today")}</h2><span className="chip chip-grey">{todo.length}</span></div>
          <span className="muted small">{t("StockNow watches stock, plans, payments and deliveries for you")}</span>
        </div>
        {todo.length ? todo.map((t) => (
          <div className="todo" key={t.key}>
            <DotIc ic={t.ic} tone={t.tone} />
            <span className="stack"><span className="bold">{t.title}</span><span className="muted small">{t.sub}</span></span>
            <button className="btn btn-secondary btn-sm" onClick={t.run}>{t.btn}</button>
          </div>
        )) : <Empty title={t("All clear")} text={t("Nothing needs you right now. StockNow will tell you when it does.")} ic="check" />}
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{t("Needs attention")}</h2>
          <div className="tabs">
            <button className={`tab ${tab === "low" ? "on" : ""}`} onClick={() => setUi({ dashTab: "low" })}>{t("Low stock")}<span className="n">{low.length}</span></button>
            <button className={`tab ${tab === "out" ? "on" : ""}`} onClick={() => setUi({ dashTab: "out" })}>{t("Out of stock")}<span className="n">{out.length}</span></button>
          </div>
        </div>
        {rows.length ? (
          <div className="scroll-x"><table style={{ minWidth: 620 }}>
            <thead><tr><th>{t("Product")}</th><th className="right">{t("Stock")}</th><th className="right">{t("Minimum")}</th><th>{t("Lasts")}</th><th className="right">{t("Action")}</th></tr></thead>
            <tbody>{rows.map((p) => {
              const g = signals(d, p), inc = incomingOf(d, p.id);
              return (
                <tr key={p.id}>
                  <td><span className="bold">{p.name}</span><div className="mono faint">{p.sku}</div></td>
                  <td className="right bold num" style={{ color: p.stock === 0 ? "var(--red-fg)" : "var(--amber-fg)" }}>{p.stock}</td>
                  <td className="right muted num">{p.min}</td>
                  <td>{p.stock === 0 ? <span className="chip chip-red">{t("Empty")}</span> : g ? <span className="chip chip-amber">{days(g.cover)}</span> : "—"}{inc ? <> <span className="chip chip-blue">{t("{n} on order", { n: inc })}</span></> : null}</td>
                  <td className="right"><button className="btn btn-ghost-ai btn-sm" onClick={openPlan}><Icon n="spark" size={14} /> {t("Plan restock")}</button></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <Empty title={t(tab === "low" ? "No low stock" : "Nothing is out of stock")} text={t("Products below their minimum appear here.")} ic="check" />}
      </div>
    </>
  );
}
