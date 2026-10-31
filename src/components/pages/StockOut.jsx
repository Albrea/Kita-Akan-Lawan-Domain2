"use client";
import { useState } from "react";
import { useApp } from "../App.jsx";
import { FieldError, Icon, Select } from "../ui.jsx";
import { TxTable } from "./StockIn.jsx";
import { isSale, productOf } from "@/lib/engine.js";
import { STOCK_OUT_REASONS } from "@/lib/actions.js";
import { rm, today } from "@/lib/format.js";

const newForm = (d) => ({ pid: d.products[0]?.id || "", qty: "", reason: "Sold in store", date: today() });
const UNKNOWN_SKU = "NEW-ITEM-01"; // not in the shop, to show what happens when Orbyte sends something StockNow doesn't know

export default function StockOut() {
  const { d, me, act, t } = useApp();
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
      <div className="page-head"><div><h1 className="page-title">{t("Stock Out")}</h1><p className="page-sub">{t("Record sales and damaged items returned to supplier. Stock can never go below zero.")}</p></div></div>
      <div className="section" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: 24, alignItems: "start" }}>
        <div className="card card-pad">
          <div className="grid2">
            <div className="field span2">
              <label className="label" htmlFor="so-p">{t("Product")} <span className="req">*</span></label>
              <Select id="so-p" value={f.pid} onChange={(v) => set({ pid: v })} options={d.products.map((x) => [x.id, `${x.name} (${t("stock {n}", { n: x.stock })})`])} />
            </div>
            <div className="field">
              <label className="label" htmlFor="so-q">{t("Quantity")} <span className="req">*</span></label>
              <input className={`input ${err.qty ? "error" : ""}`} id="so-q" inputMode="numeric" placeholder="0" value={f.qty} onChange={(e) => set({ qty: e.target.value.replace(/[^0-9]/g, "") })} />
              {err.qty ? <FieldError msg={err.qty} /> : <div className="hint">{t("Current stock: {n}", { n: <b>{p ? p.stock : 0}</b> })}</div>}
            </div>
            <div className="field">
              <label className="label" htmlFor="so-r">{t("Reason")} <span className="req">*</span></label>
              <Select id="so-r" value={f.reason} onChange={(v) => set({ reason: v })} options={STOCK_OUT_REASONS.map((x) => [x, t(x)])} />
              <div className="hint">{isSale({ type: "STOCK_OUT", reason: f.reason })
                ? <>{t("Adds to today's sales value.")}{p && qty > 0 ? <> (+<b>{rm(qty * p.sell)}</b>)</> : null}</>
                : f.reason === "Returned to supplier"
                  ? <>{t("Because the item is damaged. The supplier refunds the cost, which goes back to this month's budget. Sales are not affected.")}{p && qty > 0 ? <> (+<b>{rm(qty * p.cost)}</b>)</> : null}</>
                  : t("Not a sale, so sales value and budget don't change.")}</div>
            </div>
            <div className="field"><label className="label" htmlFor="so-d">{t("Date")}</label><input className="input" id="so-d" type="date" value={f.date} readOnly title={t("Recorded with today's date")} /></div>
            <div className="field"><label className="label" htmlFor="so-by">{t("Created by")}</label><input className="input" id="so-by" value={me.name} readOnly /></div>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 20 }}>
            <button className="btn btn-primary" disabled={saving} onClick={save}><Icon n="out" size={16} /> {t("Save stock out")}</button>
          </div>
        </div>
        <OrbytePayment />
      </div>
      <TxTable title={t("Recent stock out")} kind="out" />
    </>
  );
}

/* Paid orders from Orbyte Payment become stock outs with no typing. Live, Orbyte calls /api/orbyte/payment;
   in the demo this button sends the same kind of event. */
function OrbytePayment() {
  const { d, act, t, offline } = useApp();
  const [f, setF] = useState({ sku: d.products[0]?.sku || "", qty: "1", channel: "in_store" });
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  async function pay() {
    setBusy(true);
    await act("simulatePayment", f);
    setBusy(false);
  }
  return (
    <div className="card card-pad" style={{ borderColor: "var(--ai-br)" }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
        <div className="row" style={{ gap: 8 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="receipt" /></span><h2 className="card-title">{t("Automatic from Orbyte Payment")}</h2></div>
        <span className="chip chip-grey">{t("Simulated in demo")}</span>
      </div>
      <p className="muted small" style={{ marginBottom: 14 }}>{t("When a customer pays through Orbyte Payment, StockNow records the stock out by itself. Items it can't match go to the Owner or a Manager to check, never a guess.")}</p>
      <div className="grid2">
        <div className="field span2">
          <label className="label" htmlFor="op-p">{t("Customer bought")}</label>
          <Select id="op-p" value={f.sku} onChange={(v) => set({ sku: v })} options={[...d.products.map((x) => [x.sku, `${x.name} (${t("stock {n}", { n: x.stock })})`]), [UNKNOWN_SKU, t("An item StockNow doesn't know (test)")]]} />
        </div>
        <div className="field">
          <label className="label" htmlFor="op-q">{t("Quantity")}</label>
          <input className="input" id="op-q" inputMode="numeric" value={f.qty} onChange={(e) => set({ qty: e.target.value.replace(/[^0-9]/g, "") })} />
        </div>
        <div className="field">
          <label className="label" htmlFor="op-c">{t("Paid")}</label>
          <Select id="op-c" value={f.channel} onChange={(v) => set({ channel: v })} options={[["in_store", t("In store")], ["online", t("Online")]]} />
        </div>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn btn-ai" disabled={busy || offline || !(+f.qty > 0)} onClick={pay}><Icon n="receipt" size={16} /> {t("Simulate a customer payment")}</button>
      </div>
    </div>
  );
}
