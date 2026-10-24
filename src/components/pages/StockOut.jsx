"use client";
import { useState } from "react";
import { useApp } from "../App.jsx";
import { FieldError, Icon, Select } from "../ui.jsx";
import { TxTable } from "./StockIn.jsx";
import { isSale, productOf } from "@/lib/engine.js";
import { STOCK_OUT_REASONS } from "@/lib/actions.js";
import { rm, today } from "@/lib/format.js";

const newForm = (d) => ({ pid: d.products[0]?.id || "", qty: "", reason: "Sold in store", date: today() });

export default function StockOut() {
  const { d, me, act } = useApp();
  const [f, setF] = useState(() => newForm(d));
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);
  const p = productOf(d, f.pid), qty = +f.qty;
  const set = (patch) => { setF((x) => ({ ...x, ...patch })); setErr({}); };

  async function save() {
    setSaving(true);
    const out = await act("stockOut", { pid: f.pid, qty: f.qty, reason: f.reason });
    setSaving(false);
    if (out.ok) setF(newForm(d));
    else if (out.fields) setErr(out.fields);
  }

  return (
    <>
      <div className="page-head"><div><h1 className="page-title">Stock Out</h1><p className="page-sub">Record sales and damaged items returned to supplier. Stock can never go below zero.</p></div></div>
      <div className="card card-pad section" style={{ maxWidth: 760 }}>
        <div className="grid2">
          <div className="field span2">
            <label className="label" htmlFor="so-p">Product <span className="req">*</span></label>
            <Select id="so-p" value={f.pid} onChange={(v) => set({ pid: v })} options={d.products.map((x) => [x.id, `${x.name} (stock ${x.stock})`])} />
          </div>
          <div className="field">
            <label className="label" htmlFor="so-q">Quantity <span className="req">*</span></label>
            <input className={`input ${err.qty ? "error" : ""}`} id="so-q" inputMode="numeric" placeholder="0" value={f.qty} onChange={(e) => set({ qty: e.target.value.replace(/[^0-9]/g, "") })} />
            {err.qty ? <FieldError msg={err.qty} /> : <div className="hint">Current stock: <b>{p ? p.stock : 0}</b></div>}
          </div>
          <div className="field">
            <label className="label" htmlFor="so-r">Reason <span className="req">*</span></label>
            <Select id="so-r" value={f.reason} onChange={(v) => set({ reason: v })} options={STOCK_OUT_REASONS.map((x) => [x, x])} />
            <div className="hint">{isSale({ type: "STOCK_OUT", reason: f.reason })
              ? <>Adds{p && qty > 0 ? <> <b>{rm(qty * p.sell)}</b></> : null} to today&apos;s sales value.</>
              : f.reason === "Returned to supplier"
                ? <>Because the item is damaged. The supplier refunds{p && qty > 0 ? <> <b>{rm(qty * p.cost)}</b></> : " the cost"}, which goes back to this month&apos;s budget. Sales are not affected.</>
                : "Not a sale, so sales value and budget don't change."}</div>
          </div>
          <div className="field"><label className="label" htmlFor="so-d">Date</label><input className="input" id="so-d" type="date" value={f.date} readOnly title="Recorded with today's date" /></div>
          <div className="field"><label className="label" htmlFor="so-by">Created by</label><input className="input" id="so-by" value={me.name} readOnly /></div>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 20 }}>
          <button className="btn btn-primary" disabled={saving} onClick={save}><Icon n="out" size={16} /> Save stock out</button>
        </div>
      </div>
      <TxTable title="Recent stock out" rows={d.tx.filter((t) => t.type === "STOCK_OUT").slice(0, 8)} kind="out" />
    </>
  );
}
