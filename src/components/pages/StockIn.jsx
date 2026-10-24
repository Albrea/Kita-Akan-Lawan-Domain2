"use client";
import { useState } from "react";
import { useApp } from "../App.jsx";
import { Empty, FieldError, Icon, PoChip, Select } from "../ui.jsx";
import { budgetLeft, isCustomerReturn, lateDays, nameOfP, openPOs, poOf, poTotal, productOf, reqOf, supName, userOf } from "@/lib/engine.js";
import { fmtAt, rm, shortDate, today } from "@/lib/format.js";

export function TxTable({ title, rows, kind }) {
  const { d } = useApp();
  return (
    <div className="card">
      <div className="card-head"><h2 className="card-title">{title}</h2></div>
      {rows.length ? (
        <div className="scroll-x"><table style={{ minWidth: 820 }}>
          <thead><tr><th>Date</th><th>Product</th><th className="right">Qty</th><th className="right">Stock before</th><th className="right">Stock after</th><th>{kind === "in" ? "Supplier / order" : "Reason"}</th><th>By</th></tr></thead>
          <tbody>{rows.map((t) => {
            const po = t.poId ? poOf(d, t.poId) : null;
            return (
              <tr key={t.id}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtAt(t.at)}</td>
                <td className="bold">{nameOfP(d, t.pid)}</td>
                <td className="right bold num" style={{ color: kind === "in" ? "var(--green-fg)" : "var(--red-fg)" }}>{kind === "in" ? "+" : "−"}{t.qty}</td>
                <td className="right num muted">{t.before}</td>
                <td className="right num">{t.after}{t.pending ? <> <span className="chip chip-amber">Pending sync</span></> : null}</td>
                <td>{kind === "in"
                  ? isCustomerReturn(t) ? <span className="chip chip-amber">Customer return</span> : <>{t.sup ? supName(d, t.sup) : "—"}{po ? <> <span className="chip chip-blue">{po.code}</span></> : null}</>
                  : t.reason}</td>
                <td className="muted">{userOf(d, t.by).name}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      ) : <Empty title="Nothing recorded yet" text="Saved entries appear here." />}
    </div>
  );
}

function newForm(d) {
  const p = d.products[0] || {};
  return { kind: "buy", pid: p.id || "", qty: "", sup: p.sup || d.suppliers[0]?.id || "", date: today() };
}

export default function StockIn() {
  const { d, me, ui, setUi, act, openModal } = useApp();
  const [f, setF] = useState(() => newForm(d));
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);
  const tab = ui.stockInTab, open = openPOs(d), pi = productOf(d, f.pid), qty = +f.qty;
  const set = (patch) => { setF((x) => ({ ...x, ...patch })); setErr((e) => { const n = { ...e }; Object.keys(patch).forEach((k) => delete n[k]); return n; }); };
  const setLine = (poId, pid, v) => setUi((u) => ({ receive: { ...u.receive, [poId]: { ...(u.receive[poId] || {}), [pid]: v } } }));

  async function save() {
    setSaving(true);
    const out = await act("stockIn", { pid: f.pid, qty: f.qty, kind: f.kind, sup: f.sup });
    setSaving(false);
    if (out.ok) setF(newForm(d));
    else if (out.fields) setErr(out.fields);
  }
  async function receive(po) {
    const out = await act("receivePO", { poId: po.id, lines: ui.receive[po.id] || {} });
    if (out.ok) setUi((u) => { const r = { ...u.receive }; delete r[po.id]; return { receive: r }; });
  }

  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">Stock In</h1><p className="page-sub">Receive supplier orders, or record other incoming stock.</p></div>
        <div className="tabs">
          <button className={`tab ${tab === "orders" ? "on" : ""}`} onClick={() => setUi({ stockInTab: "orders" })}>Supplier orders<span className="n">{open.length}</span></button>
          <button className={`tab ${tab === "manual" ? "on" : ""}`} onClick={() => { setUi({ stockInTab: "manual" }); setErr({}); }}>Manual stock in</button>
        </div>
      </div>

      {tab === "orders" ? (open.length ? open.map((po) => {
        const req = reqOf(d, po.requestId), dr = ui.receive[po.id] || {}, late = lateDays(po);
        return (
          <div className="card section" key={po.id}>
            <div className="card-head">
              <div className="stack">
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><span className="mono bold">{po.code}</span><span className="bold">{supName(d, po.sup)}</span><PoChip po={po} /></div>
                <span className="muted small">From {req ? req.code : "—"} · approved by {userOf(d, po.approvedBy).name} · expected {fmtAt(po.expectedAt)}{po.chasedAt ? ` · reminded ${shortDate(po.chasedAt.split(" ")[0])}` : ""}</span>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <span className="bold num">{rm(poTotal(po))}</span>
                {!po.sentAt ? <button className="btn btn-primary btn-sm" onClick={() => openModal("message", { poId: po.id, msgKind: "order" })}><Icon n="send" size={14} /> Send order</button>
                  : late ? <button className="btn btn-danger btn-sm" onClick={() => openModal("message", { poId: po.id, msgKind: "chase" })}><Icon n="message" size={14} /> Chase supplier</button> : null}
              </div>
            </div>
            <div className="po-item faint" style={{ fontSize: 12, paddingTop: 8, paddingBottom: 8 }}><span>Product</span><span className="right">Ordered</span><span className="right hide-sm">Received</span><span className="right">Arriving now</span></div>
            {po.items.map((it) => {
              const due = it.qty - it.received;
              return (
                <div className="po-item" key={it.pid}>
                  <div className="stack"><span className="bold">{nameOfP(d, it.pid)}</span><span className="mono faint">{productOf(d, it.pid)?.sku || ""}</span></div>
                  <span className="right num">{it.qty}</span>
                  <span className="right num hide-sm">{it.received}</span>
                  <span className="right">{due > 0
                    ? <input className="input qty-input" inputMode="numeric" aria-label={`Arriving quantity of ${nameOfP(d, it.pid)}`} value={dr[it.pid] !== undefined ? dr[it.pid] : due} onChange={(e) => setLine(po.id, it.pid, e.target.value.replace(/[^0-9]/g, ""))} />
                    : <span className="chip chip-green">Done</span>}</span>
                </div>
              );
            })}
            <div className="row" style={{ padding: "14px 20px", justifyContent: "flex-end" }}>
              <button className="btn btn-primary" onClick={() => receive(po)}><Icon n="truck" size={16} /> Receive stock</button>
            </div>
          </div>
        );
      }) : <div className="card section"><Empty title="No deliveries expected" text="Approved AI plans become supplier orders here." ic="truck" /></div>) : (
        <div className="card card-pad section" style={{ maxWidth: 760 }}>
          <div className="grid2">
            <div className="field span2">
              <label className="label" htmlFor="si-p">Product <span className="req">*</span></label>
              <Select id="si-p" value={f.pid} error={!!err.pid} onChange={(v) => set({ pid: v, sup: productOf(d, v)?.sup || f.sup })} options={d.products.map((p) => [p.id, `${p.name} (stock ${p.stock})`])} />
              <FieldError msg={err.pid} />
            </div>
            <div className="field">
              <label className="label" htmlFor="si-q">Quantity <span className="req">*</span></label>
              <input className={`input ${err.qty ? "error" : ""}`} id="si-q" inputMode="numeric" placeholder="0" value={f.qty} onChange={(e) => set({ qty: e.target.value.replace(/[^0-9]/g, "") })} />
              <FieldError msg={err.qty} />
            </div>
            <div className="field">
              <label className="label" htmlFor="si-k">Type <span className="req">*</span></label>
              <Select id="si-k" value={f.kind} onChange={(v) => set({ kind: v, sup: f.sup })} options={[["buy", "Bought from supplier"], ["return", "Customer return"]]} />
              <div className="hint">{f.kind === "return"
                ? <>Stock goes back on the shelf. Today&apos;s sales value goes down{pi && qty > 0 ? <> by <b>{rm(qty * pi.sell)}</b></> : null}. The budget is not used.</>
                : <>Uses{pi && qty > 0 ? <> <b>{rm(qty * pi.cost)}</b> of</> : null} this month&apos;s budget ({rm(budgetLeft(d))} left).</>}</div>
            </div>
            {f.kind === "return" ? null : (
              <div className="field">
                <label className="label" htmlFor="si-s">Supplier <span className="req">*</span></label>
                <Select id="si-s" value={f.sup} error={!!err.sup} onChange={(v) => set({ sup: v })} options={[["", "Choose a supplier"], ...d.suppliers.map((s) => [s.id, s.name])]} />
                <FieldError msg={err.sup} />
              </div>
            )}
            <div className="field"><label className="label" htmlFor="si-d">Date</label><input className="input" id="si-d" type="date" value={f.date} readOnly title="Recorded with today's date" /></div>
            <div className="field"><label className="label" htmlFor="si-by">Created by</label><input className="input" id="si-by" value={me.name} readOnly /></div>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 20 }}>
            <button className="btn btn-primary" disabled={saving} onClick={save}><Icon n="in" size={16} /> Save stock in</button>
          </div>
        </div>
      )}
      <TxTable title="Recent stock in" rows={d.tx.filter((t) => t.type === "STOCK_IN").slice(0, 8)} kind="in" />
    </>
  );
}
