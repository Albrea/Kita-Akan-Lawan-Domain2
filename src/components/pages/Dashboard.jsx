"use client";
import { useRef } from "react";
import { useApp } from "../App.jsx";
import { deptOf } from "@/lib/actions.js";
import { DotIc, Empty, Icon, PieChart, topParts } from "../ui.jsx";
import {
  budgetLeft, catName, incomingOf, isCustomerReturn, isSale, lateDays, openPOs, pendingRequests, poTotal, productOf, salesOf, signals, spentThisMonth, supName, todayTx, userOf,
} from "@/lib/engine.js";
import { list, num, rm, today } from "@/lib/format.js";
import { monthName } from "@/lib/i18n.js";

/* Today's to-do list, from automatic triggers and open work. Each department only gets its own jobs:
   Inventory handles stock, deliveries and restock plans; Finance follows payments, approvals and late orders. */
function useForYou() {
  const { d, me, can, go, openPlan, openModal, t, tp, when, days } = useApp();
  const items = [], approver = can("approveAI"), stock = can("stock");
  const pend = pendingRequests(d);
  d.alerts.filter((a) => a.open && a.type === "PAYMENT").forEach((a) => items.push({
    key: a.id, tone: "red", ic: "receipt", title: t("Orbyte payment {id} needs checking", { id: a.poId }),
    sub: when(a.at), btn: t(approver ? "Check" : "View"), run: () => openModal("payment", { alertId: a.id }),
  }));
  const cost = (r) => rm(r.items.reduce((s, i) => s + i.cost, 0));
  if (approver) pend.forEach((r) => items.push({ key: r.id, tone: "amber", ic: "approve", title: t("Approve {code} from {name}", { code: r.code, name: userOf(d, r.by).name }), sub: cost(r), btn: t("Review"), run: () => go("approvals") }));
  else if (stock) pend.filter((r) => r.by === me.id).forEach((r) => items.push({ key: r.id, tone: "grey", ic: "clock", title: t("{code} is waiting for {names}", { code: r.code, names: list((r.sentTo || []).map((id) => userOf(d, id).name)) }), sub: cost(r), btn: t("View"), run: () => go("approvals") }));
  else pend.forEach((r) => items.push({ key: r.id, tone: "grey", ic: "clock", title: t("{code} is waiting for approval", { code: r.code }), sub: cost(r), btn: t("View"), run: () => go("approvals") }));
  const plan = d.alerts.find((a) => a.open && a.type === "PLAN");
  if (stock && plan && !pend.length) items.push({ key: plan.id, tone: "ai", ic: "spark", title: t("Time to plan this month's restock"), sub: t("{left} left to spend", { left: rm(budgetLeft(d)) }), btn: t("Plan restock"), btnIc: "spark", run: openPlan });
  if (stock) d.alerts.filter((a) => a.open && a.type === "LOW").forEach((a) => {
    const p = productOf(d, a.pid);
    if (!p) return;
    const g = signals(d, p);
    items.push({ key: a.id, tone: "red", ic: "warning", title: p.stock === 0 ? t("{name} is out of stock", { name: p.name }) : t("{name} lasts about {days}", { name: p.name, days: days(g ? g.cover : Infinity) }), sub: when(a.at), btn: t("Plan restock"), btnIc: "spark", run: openPlan });
  });
  openPOs(d).forEach((po) => {
    const late = lateDays(po), sup = supName(d, po.sup);
    const lateTitle = tp(late, "{code} from {sup} is {n} day late", "{code} from {sup} is {n} days late", { code: po.code, sup });
    if (!stock) { if (late) items.push({ key: po.id, tone: "red", ic: "truck", title: lateTitle, sub: rm(poTotal(po)), btn: t("View"), run: () => go("suppliers") }); return; }
    if (!po.sentAt) items.push({ key: po.id, tone: "blue", ic: "send", title: t("Send {code} to {sup}", { code: po.code, sup }), sub: t("Approved, not ordered yet"), btn: t("Send order"), run: () => openModal("message", { poId: po.id, msgKind: "order" }) });
    else if (late) items.push({ key: po.id, tone: "red", ic: "truck", title: lateTitle, sub: po.chasedAt ? t("Reminder sent {date}", { date: when(po.chasedAt) }) : t("Not delivered yet"), btn: t(po.chasedAt ? "Remind again" : "Chase supplier"), run: () => openModal("message", { poId: po.id, msgKind: "chase" }) });
    else items.push({ key: po.id, tone: "blue", ic: "truck", title: t("Receive {code} when it arrives", { code: po.code }), sub: `${sup} · ${t("expected {date}", { date: when(po.expectedAt) })}`, btn: t("Receive"), run: () => go("stock-in", { stockInTab: "orders", focusPo: po.id }) });
  });
  return items;
}

export default function Dashboard() {
  const { d, me, ui, setUi, can, go, openPlan, openModal, t, tp, when, days } = useApp();
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
  const stock = can("stock"), dept = deptOf(me);
  const show = new Set(dept === "FINANCE" ? ["sales", "budget", "orders"] : dept === "INVENTORY" ? ["in", "out", "outOfStock"] : ["products", "in", "out", "sales", "budget", "outOfStock"]);
  const needsRef = useRef(null);
  /* The red "Out of stock" tile jumps to the out-of-stock list below. */
  const showOut = () => {
    setUi({ dashTab: "out" });
    const el = needsRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  };

  return (
    <>
      <div className="page-head">
        <div><div className="page-kicker">{me.name}</div><h1 className="page-title">{t("Dashboard")}</h1><p className="page-sub">{when(today())}</p></div>
        {stock ? <button className="btn btn-ai" onClick={openPlan}><Icon n="spark" /> {t("Plan restock")}</button> : null}
      </div>

      {/* Tiles: Owner and Manager see all six; Inventory staff see stock; Finance staff see money. */}
      <div className="stats-panel"><div className="stats">
        {show.has("products") ? <div className="stat t-blue"><div className="stat-label"><Icon n="box" size={15} /> {t("Total products")}</div><div className="stat-value">{d.products.length}</div><div className="stat-foot">{t("{n} pieces in stock", { n: num(d.products.reduce((s, p) => s + p.stock, 0)) })}</div></div> : null}
        {show.has("in") ? <div className="stat t-green"><div className="stat-label"><Icon n="in" size={15} /> {t("Stock in today")}</div><div className="stat-value">{num(inUnits)}</div><div className="stat-foot">{tp(ins.length, "{n} delivery received", "{n} deliveries received")}</div></div> : null}
        {show.has("out") ? <div className="stat t-amber"><div className="stat-label"><Icon n="out" size={15} /> {t("Stock out today")}</div><div className="stat-value">{num(outUnits)}</div><div className="stat-foot">{t("{n} sold", { n: num(soldUnits) })}{outUnits > soldUnits ? ` · ${t("{n} other", { n: num(outUnits - soldUnits) })}` : ""}</div></div> : null}
        {show.has("sales") ? <div className="stat t-teal"><div className="stat-label"><Icon n="receipt" size={15} /> {t("Sales today")}</div><div className="stat-value">{rm(salesValue)}</div><div className="stat-foot">{returned ? t("{sold} sold · {back} returned", { sold: rm(gross), back: rm(returned) }) : t("After returns")}</div></div> : null}
        {show.has("budget") ? (
          <div className={`stat t-ai ${stock ? "stat-click" : ""}`} {...(stock ? { role: "link", tabIndex: 0, "aria-label": t("Open Smart Restock"), onClick: () => go("ai"), onKeyDown: (e) => { if (e.key === "Enter") go("ai"); } } : {})}>
            {can("setBudget") ? <button className="icon-btn stat-edit" aria-label={t("Set monthly budget")} title={t("Set monthly budget")} onClick={(e) => { e.stopPropagation(); openModal("budget"); }}><Icon n="pencil" size={15} /></button> : null}
            <div className="stat-label"><Icon n="wallet" size={15} /> {t("Budget left this month")}</div>
            <div className="stat-value">{rm(left)}</div>
            <div className="bar"><i style={{ width: `${mb ? Math.round((left / mb) * 100) : 0}%` }} /></div>
            <div className="stat-foot">{t("of {total} · {used} used", { total: rm(mb), used: rm(spentThisMonth(d)) })}</div>
          </div>
        ) : null}
        {show.has("orders") ? <div className="stat t-blue"><div className="stat-label"><Icon n="truck" size={15} /> {t("Supplier orders open")}</div><div className="stat-value">{rm(openPOs(d).reduce((s, po) => s + poTotal(po), 0))}</div><div className="stat-foot">{tp(openPOs(d).length, "{n} order not delivered yet", "{n} orders not delivered yet")}</div></div> : null}
        {show.has("outOfStock") ? <div className="stat t-red stat-click" role="link" tabIndex={0} aria-label={t("Show out-of-stock products")} onClick={showOut} onKeyDown={(e) => { if (e.key === "Enter") showOut(); }}><div className="stat-label"><Icon n="warning" size={15} /> {t("Out of stock")}</div><div className="stat-value">{out.length}</div><div className="stat-foot">{t("{n} more running low", { n: low.length })}</div></div> : null}
      </div></div>

      <div className={`dash-grid ${stock ? "two" : ""}`}>
      <div className="card">
        <div className="card-head">
          <div className="row" style={{ gap: 10 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="bell" /></span><h2 className="card-title">{t("To do today")}</h2><span className="chip chip-grey">{todo.length}</span></div>
        </div>
        {todo.length ? <div className="todo-list">{todo.map((t) => (
          <div className="todo" key={t.key}>
            <DotIc ic={t.ic} tone={t.tone} />
            <span className="stack"><span className="bold">{t.title}</span><span className="muted small">{t.sub}</span></span>
            <button className={`btn ${t.btnIc ? "btn-ghost-ai" : "btn-secondary"} btn-sm`} onClick={t.run}>{t.btnIc ? <Icon n={t.btnIc} size={14} /> : null} {t.btn}</button>
          </div>
        ))}</div> : <Empty title={t("All clear")} text={t("Nothing needs you right now.")} ic="check" />}
      </div>

      {stock ? <div className="card" id="needs-attention" ref={needsRef} style={{ scrollMarginTop: 16, marginBottom: 0 }}>
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
      </div> : null}
      </div>

      {/* Finance staff: where the money is, as two pie charts (the numbers are in the legend too). */}
      {dept === "FINANCE" ? <FinanceCharts /> : null}
    </>
  );
}

/* Two money views for Finance: last month's sales by product, and the cash sitting in stock by category. */
function FinanceCharts() {
  const { d, t, lang } = useApp();
  const last = d.settings.salesMonths.at(-1);
  const sales = topParts(d.products.map((p) => ({ label: p.name, value: (salesOf(d, p.id).at(-1) || 0) * p.sell })), 5, t("Other"));
  const byCat = {};
  d.products.forEach((p) => { const k = catName(d, p.cat); byCat[k] = (byCat[k] || 0) + p.stock * p.cost; });
  const stockValue = topParts(Object.entries(byCat).map(([label, value]) => ({ label, value })), 5, t("Other"));
  return (
    <div className="pie-grid">
      <PieChart title={t("Sales in {month}, by product", { month: monthName(lang, last) })} sub={t("Pieces sold × selling price")} parts={sales} format={rm} centerLabel={t("total sales")} />
      <PieChart title={t("Money sitting in stock, by category")} sub={t("Pieces in stock × cost price")} parts={stockValue} format={rm} centerLabel={t("in stock")} />
    </div>
  );
}
