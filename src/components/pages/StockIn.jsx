"use client";
import { useEffect, useState } from "react";
import { useApp } from "../App.jsx";
import { Empty, FieldError, Icon, PoChip, Select } from "../ui.jsx";
import {
  budgetLeft, isCustomerReturn, isManualBuy, isReversal, isSupplierReturn, lateDays, nameOfP, openPOs, paymentRef, poOf, poTotal, productOf, reqOf, reversalOf, supName, userOf,
} from "@/lib/engine.js";
import { undoBlock } from "@/lib/actions.js";
import { rm, today } from "@/lib/format.js";

const REDUCED = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* Recent movements. Undo adds an opposite entry (kept in the history and the log); the original shows "Undone". */
export function TxTable({ title, kind }) {
  const { d, me, act, openModal, t, when } = useApp();
  const rows = d.tx.filter((x) => x.type === (kind === "in" ? "STOCK_IN" : "STOCK_OUT") && !isReversal(x)).slice(0, 8);
  /* What the undo does to this month's budget, said before the person confirms. */
  const budgetNote = (x) => {
    const po = x.poId ? poOf(d, x.poId) : null, cost = rm(x.qty * (productOf(d, x.pid)?.cost ?? 0));
    if (po) return t("{code} goes back to “still due”. Budget left doesn't change: the money was counted when the order was approved, and the order is still owed.", { code: po.code });
    if (isManualBuy(x)) return t("{cost} goes back to this month's budget.", { cost });
    if (isSupplierReturn(x)) return t("{cost} is taken from this month's budget again.", { cost });
    return "";
  };
  const undo = (x) => openModal("confirm", {
    title: t(kind === "in" ? "Undo this stock in?" : "Undo this stock out?"),
    body: `${t("{qty} × {name} goes {dir}. The original entry and the undo both stay in the activity log.", { qty: x.qty, name: nameOfP(d, x.pid), dir: t(kind === "in" ? "back out of stock" : "back into stock") })} ${budgetNote(x)}`.trim(),
    label: t("Undo"), danger: true, onOk: () => act("undoTx", { txId: x.id }),
  });
  const refund = (ref) => openModal("confirm", {
    title: t("Simulate a refund of {id}?", { id: ref }),
    body: t("In the live product Orbyte sends the refund. The items go back into stock and the sale is removed."),
    label: t("Refund"), danger: true, onOk: () => act("simulateRefund", { paymentId: ref }),
  });
  return (
    <div className="card">
      <div className="card-head"><h2 className="card-title">{title}</h2></div>
      {rows.length ? (
        <div className="scroll-x"><table style={{ minWidth: 900 }}>
          <thead><tr><th>{t("Date")}</th><th>{t("Product")}</th><th className="right">{t("Qty")}</th><th className="right">{t("Stock before")}</th><th className="right">{t("Stock after")}</th><th>{kind === "in" ? t("Supplier / order") : t("Reason")}</th><th>{t("By")}</th><th className="right"><span className="sr-only">{t("Actions")}</span></th></tr></thead>
          <tbody>{rows.map((x) => {
            const po = x.poId ? poOf(d, x.poId) : null, ref = paymentRef(x), undone = reversalOf(d, x), block = undoBlock(d, me, x), canUndo = !block;
            return (
              <tr key={x.id} className={undone ? "undone" : ""}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{when(x.at)}</td>
                <td className="bold">{nameOfP(d, x.pid)}</td>
                <td className="right bold num" style={{ color: kind === "in" ? "var(--green-fg)" : "var(--red-fg)" }}>{kind === "in" ? "+" : "−"}{x.qty}</td>
                <td className="right num muted">{x.before}</td>
                <td className="right num">{x.after}{x.pending ? <> <span className="chip chip-amber">{t("Pending sync")}</span></> : null}</td>
                <td>{kind === "in"
                  ? isCustomerReturn(x) ? <span className="chip chip-amber">{t("Customer return")}</span> : <>{x.sup ? supName(d, x.sup) : "—"}{po ? <> <span className="chip chip-blue">{po.code}</span></> : null}</>
                  : ref ? <><span className="chip chip-ai"><Icon n="receipt" size={12} /> Orbyte Payment</span> <span className="mono faint" style={{ whiteSpace: "nowrap" }}>{ref}</span></> : t(x.reason)}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{userOf(d, x.by).name}</td>
                <td className="right" style={{ whiteSpace: "nowrap" }}>
                  {undone ? <span className="chip chip-grey" title={when(undone.at)}>{t(ref ? "Refunded" : "Undone")} · {userOf(d, undone.by).name}</span>
                    : canUndo ? <button className="btn btn-secondary btn-sm" onClick={() => undo(x)}><Icon n="undo" size={14} /> {t("Undo")}</button>
                      : ref ? <button className="btn btn-link btn-sm" onClick={() => refund(ref)}>{t("Simulate refund")}</button>
                        : <span className="faint small" title={t(block)}><Icon n="lock" size={13} /> {t("Locked")}</span>}
                </td>
              </tr>
            );
          })}</tbody>
        </table></div>
      ) : <Empty title={t("Nothing recorded yet")} text={t("Saved entries appear here.")} />}
      <div className="table-foot"><Icon n="info" size={14} /> {me.role === "STAFF"
        ? t("You can undo your own entries until midnight of the day you made them. After that, ask the Owner or a Manager.")
        : t("Staff can undo their own entries until midnight of the same day. The Owner or a Manager can undo any entry, as long as the stock is still there. Undo adds an opposite entry, so the history keeps both.")}</div>
    </div>
  );
}

function newForm(d) {
  const p = d.products[0] || {};
  return { kind: "buy", pid: p.id || "", qty: "", sup: p.sup || d.suppliers[0]?.id || "", date: today() };
}

export default function StockIn() {
  const { d, me, ui, setUi, act, openModal, t, when, day } = useApp();
  const [f, setF] = useState(() => newForm(d));
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);
  const tab = ui.stockInTab, pi = productOf(d, f.pid), qty = +f.qty;
  const marked = openPOs(d).find((po) => po.id === ui.lastPo);
  const open = marked ? [marked, ...openPOs(d).filter((po) => po !== marked)] : openPOs(d); // the PO being received comes first
  const set = (patch) => { setF((x) => ({ ...x, ...patch })); setErr((e) => { const n = { ...e }; Object.keys(patch).forEach((k) => delete n[k]); return n; }); };
  const setLine = (poId, pid, v) => setUi((u) => ({ lastPo: poId, receive: { ...u.receive, [poId]: { ...(u.receive[poId] || {}), [pid]: v } } }));
  const show = (id) => requestAnimationFrame(() => document.getElementById(`po-${id}`)?.scrollIntoView({ behavior: REDUCED() ? "auto" : "smooth", block: "center" }));

  /* Opened from the dashboard, a pop-up or a PO code elsewhere: remember it, scroll to it. */
  useEffect(() => {
    if (!ui.focusPo) return;
    setUi({ lastPo: ui.focusPo, focusPo: null, stockInTab: "orders" });
    show(ui.focusPo);
  }, [ui.focusPo]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true);
    const out = await act("stockIn", { pid: f.pid, qty: f.qty, kind: f.kind, sup: f.sup });
    setSaving(false);
    if (out.ok) setF(newForm(d));
    else if (out.fields) setErr(out.fields);
  }
  async function receive(po) {
    const out = await act("receivePO", { poId: po.id, lines: ui.receive[po.id] || {} });
    if (out.ok) setUi((u) => { const r = { ...u.receive }; delete r[po.id]; return { receive: r, lastPo: u.lastPo === po.id ? null : u.lastPo }; });
  }

  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">{t("Stock In")}</h1><p className="page-sub">{t("Receive deliveries or add stock.")}</p></div>
        <div className="tabs">
          <button className={`tab ${tab === "orders" ? "on" : ""}`} onClick={() => setUi({ stockInTab: "orders" })}>{t("Supplier orders")}<span className="n">{open.length}</span></button>
          <button className={`tab ${tab === "manual" ? "on" : ""}`} onClick={() => { setUi({ stockInTab: "manual" }); setErr({}); }}>{t("Manual stock in")}</button>
        </div>
      </div>

      {tab === "orders" && marked ? (
        <div className="notice blue section continue-bar">
          <Icon n="truck" size={16} />
          <span>{t("You were receiving {code} from {sup}.", { code: <b className="mono">{marked.code}</b>, sup: supName(d, marked.sup) })}{ui.receive[marked.id] ? ` ${t("Quantities typed but not saved yet.")}` : ""}</span>
          <span className="spacer" />
          <button className="btn btn-link btn-sm" onClick={() => show(marked.id)}>{t("Continue")} →</button>
          <button className="icon-btn" aria-label={t("Dismiss")} onClick={() => setUi({ lastPo: null })}><Icon n="close" size={16} /></button>
        </div>
      ) : null}

      {tab === "orders" ? (open.length ? open.map((po) => {
        const req = reqOf(d, po.requestId), dr = ui.receive[po.id] || {}, late = lateDays(po), isMarked = po === marked, unsaved = Object.keys(dr).length > 0;
        return (
          <div className={`card section ${isMarked ? "po-focus" : ""}`} key={po.id} id={`po-${po.id}`} onClick={() => { if (!isMarked) setUi({ lastPo: po.id }); }}>
            <div className="card-head">
              <div className="stack">
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <span className="mono bold">{po.code}</span><span className="bold">{supName(d, po.sup)}</span><PoChip po={po} />
                  {isMarked ? <span className="chip chip-blue"><Icon n="target" size={12} /> {t("You opened this")}</span> : null}
                  {unsaved ? <span className="chip chip-amber"><Icon n="pencil" size={12} /> {t("Not saved yet")}</span> : null}
                </div>
                <span className="muted small">{t("From {req} · approved by {name} · expected {date}", { req: req ? req.code : "—", name: userOf(d, po.approvedBy).name, date: when(po.expectedAt) })}{po.chasedAt ? ` · ${t("reminded {date}", { date: day(po.chasedAt.split(" ")[0]) })}` : ""}</span>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <span className="bold num">{rm(poTotal(po))}</span>
                {!po.sentAt ? <button className="btn btn-primary btn-sm" onClick={() => openModal("message", { poId: po.id, msgKind: "order" })}><Icon n="send" size={14} /> {t("Send order")}</button>
                  : late ? <button className="btn btn-danger btn-sm" onClick={() => openModal("message", { poId: po.id, msgKind: "chase" })}><Icon n="message" size={14} /> {t("Chase supplier")}</button> : null}
              </div>
            </div>
            <div className="po-item faint" style={{ fontSize: 12, paddingTop: 8, paddingBottom: 8 }}><span>{t("Product")}</span><span className="right">{t("Ordered")}</span><span className="right hide-sm">{t("Received")}</span><span className="right">{t("Arriving now")}</span></div>
            {po.items.map((it) => {
              const due = it.qty - it.received;
              return (
                <div className="po-item" key={it.pid}>
                  <div className="stack"><span className="bold">{nameOfP(d, it.pid)}</span><span className="mono faint">{productOf(d, it.pid)?.sku || ""}</span></div>
                  <span className="right num">{it.qty}</span>
                  <span className="right num hide-sm">{it.received}</span>
                  <span className="right">{due > 0
                    ? <input className="input qty-input" inputMode="numeric" aria-label={t("Arriving quantity of {name}", { name: nameOfP(d, it.pid) })} value={dr[it.pid] !== undefined ? dr[it.pid] : due} onChange={(e) => setLine(po.id, it.pid, e.target.value.replace(/[^0-9]/g, ""))} />
                    : <span className="chip chip-green">{t("Done")}</span>}</span>
                </div>
              );
            })}
            <div className="row" style={{ padding: "14px 20px", justifyContent: "flex-end" }}>
              <button className="btn btn-primary" onClick={() => receive(po)}><Icon n="truck" size={16} /> {t("Receive stock")}</button>
            </div>
          </div>
        );
      }) : <div className="card section"><Empty title={t("No deliveries expected")} text={t("Approved restock plans become supplier orders here.")} ic="truck" /></div>) : (
        <div className="card card-pad section" style={{ maxWidth: 760 }}>
          <div className="grid2">
            <div className="field span2">
              <label className="label" htmlFor="si-p">{t("Product")} <span className="req">*</span></label>
              <Select id="si-p" value={f.pid} error={!!err.pid} onChange={(v) => set({ pid: v, sup: productOf(d, v)?.sup || f.sup })} options={d.products.map((p) => [p.id, `${p.name} (${t("stock {n}", { n: p.stock })})`])} />
              <FieldError msg={err.pid} />
            </div>
            <div className="field">
              <label className="label" htmlFor="si-q">{t("Quantity")} <span className="req">*</span></label>
              <input className={`input ${err.qty ? "error" : ""}`} id="si-q" inputMode="numeric" placeholder="0" value={f.qty} onChange={(e) => set({ qty: e.target.value.replace(/[^0-9]/g, "") })} />
              <FieldError msg={err.qty} />
            </div>
            <div className="field">
              <label className="label" htmlFor="si-k">{t("Type")} <span className="req">*</span></label>
              <Select id="si-k" value={f.kind} onChange={(v) => set({ kind: v, sup: f.sup })} options={[["buy", t("Bought from supplier")], ["return", t("Customer return")]]} />
              <div className="hint">{f.kind === "return"
                ? <>{t("Stock goes back on the shelf. Today's sales value goes down.")}{pi && qty > 0 ? <> (−<b>{rm(qty * pi.sell)}</b>)</> : null} {t("The budget is not used.")}</>
                : <>{t("Uses this month's budget ({left} left).", { left: rm(budgetLeft(d)) })}{pi && qty > 0 ? <> (−<b>{rm(qty * pi.cost)}</b>)</> : null}</>}</div>
            </div>
            {f.kind === "return" ? null : (
              <div className="field">
                <label className="label" htmlFor="si-s">{t("Supplier")} <span className="req">*</span></label>
                <Select id="si-s" value={f.sup} error={!!err.sup} onChange={(v) => set({ sup: v })} options={[["", t("Choose a supplier")], ...d.suppliers.map((s) => [s.id, s.name])]} />
                <FieldError msg={err.sup} />
              </div>
            )}
            <div className="field"><label className="label" htmlFor="si-d">{t("Date")}</label><input className="input" id="si-d" type="date" value={f.date} readOnly title={t("Recorded with today's date")} /></div>
            <div className="field"><label className="label" htmlFor="si-by">{t("Created by")}</label><input className="input" id="si-by" value={me.name} readOnly /></div>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 20 }}>
            <button className="btn btn-primary" disabled={saving} onClick={save}><Icon n="in" size={16} /> {t("Save stock in")}</button>
          </div>
        </div>
      )}
      <TxTable title={t("Recent stock in")} kind="in" />
    </>
  );
}
