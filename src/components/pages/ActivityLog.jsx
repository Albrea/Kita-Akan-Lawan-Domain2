"use client";
import { useApp } from "../App.jsx";
import { Empty, Icon, Select } from "../ui.jsx";
import { ORBYTE_USER, SYS_USER, isCustomerReturn, isReversal, members, paymentRef, poOf, productOf, userOf } from "@/lib/engine.js";
import { today } from "@/lib/format.js";

/* One CSV field: quoted when it holds a comma, quote or line break (Excel and Google Sheets read this).
   Text starting with = + - @ gets a leading ' so a spreadsheet shows it instead of running it as a formula. */
const csvCell = (v) => {
  const s = /^[=+\-@]/.test(String(v)) ? `'${v}` : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/* Saves the rows the person is looking at as a .csv file. The leading BOM makes Excel read Malay/Tamil/Chinese text correctly. */
function downloadCsv(name, rows) {
  const text = "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const ACTION_LABEL = {
  PRODUCT_CREATED: "Product created", PRODUCT_UPDATED: "Product updated", PRODUCT_DELETED: "Product deleted",
  CATEGORY_CREATED: "Category created", CATEGORY_UPDATED: "Category updated", CATEGORY_DELETED: "Category deleted",
  SUPPLIER_CREATED: "Supplier created", SUPPLIER_UPDATED: "Supplier updated", SUPPLIER_DELETED: "Supplier deleted",
  STOCK_IN: "Stock in", STOCK_OUT: "Stock out", AI_ANALYSIS: "Restock plan made", AI_SENT: "Plan sent",
  AI_APPROVED: "Plan approved", AI_REJECTED: "Plan rejected", AUTO_ALERT: "Automatic alert", AUTO_PLAN: "Automatic plan",
  PO_SENT: "Order sent", SUPPLIER_CHASED: "Supplier reminder", SETTINGS_UPDATED: "Budget changed",
  ACCESS_GRANTED: "Access given", ACCESS_CHANGED: "Access changed", ACCESS_REMOVED: "Access removed",
  OUTAGE: "Outage", SYNC: "Synced", CATCH_UP: "Catch-up entry", SCENARIO: "Demo data", UNDO: "Undo",
  ORBYTE_SALE: "Orbyte sale", ORBYTE_REFUND: "Orbyte refund", ORBYTE_CHECK: "Payment check", ORBYTE_CHECKED: "Payment checked", FORECAST_CONFIG: "Forecast settings",
};
/* Log entries that describe a stock movement. Those rows come from the movement itself (with SKU and
   before / change / after), so the log copy of the same event is not shown twice. */
const STOCK_LOGS = new Set(["STOCK_IN", "STOCK_OUT", "UNDO", "ORBYTE_SALE", "ORBYTE_REFUND", "CATCH_UP"]);

/* One row per stock movement, in plain words: what happened (activity) and where it came from (source). */
function moveRow(d, x) {
  const p = productOf(d, x.pid), orig = isReversal(x) ? d.tx.find((o) => x.reason === "UNDO:" + o.id) : null;
  const ref = paymentRef(orig || x), po = x.poId ? poOf(d, x.poId) : null;
  const activity = orig ? (ref ? "Refund" : "Undo") : x.type === "STOCK_IN" ? "Stock in" : "Stock out";
  const source = ref ? "Orbyte Payment" : orig ? "Correction" : x.type === "STOCK_IN"
    ? po ? "Supplier order" : isCustomerReturn(x) ? "Customer return" : "Manual purchase"
    : x.reason || "Other";
  return { key: x.id, at: x.at, by: x.by, sku: p?.sku || "—", product: p?.name || "Deleted product", before: x.before, after: x.after,
    change: x.type === "STOCK_IN" ? x.qty : -x.qty, activity, source, ref: po?.code || ref || "", pending: x.pending };
}

export default function ActivityLog() {
  const { d, ui, setUi, t, day } = useApp();
  const f = ui.activity, q = f.q.trim().toLowerCase(), from = f.from || "", to = f.to || "";
  const set = (patch) => setUi((u) => ({ activity: { ...u.activity, ...patch } }));
  /* Stock movements and the other actions (plans, approvals, budget…), newest first. */
  const all = [
    ...d.tx.map((x) => moveRow(d, x)),
    ...d.logs.filter((l) => !STOCK_LOGS.has(l.action)).map((l) => ({ key: l.id, at: l.at, by: l.by, text: l.text, activity: ACTION_LABEL[l.action] || l.action, source: l.by === "orbyte" ? "Orbyte Payment" : l.by === "sys" ? "Automatic" : "In StockNow" })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const rows = all.filter((r) => (!f.action || r.activity === f.action) && (!f.source || r.source === f.source) && (!f.user || r.by === f.user)
    && (!from || r.at.slice(0, 10) >= from) && (!to || r.at.slice(0, 10) <= to)
    && (!q || [r.sku, r.product, r.text, r.ref].some((v) => v && String(v).toLowerCase().includes(q))));
  const filtered = !!(q || f.action || f.source || f.user || from || to);
  const opts = (k) => [...new Set(all.map((r) => r[k]))].sort().map((v) => [v, t(v)]);
  const sign = (n) => (n > 0 ? `+${n}` : `−${-n}`);
  /* Exports every matching row (not only the 300 on screen). */
  const exportCsv = () => downloadCsv(`stocknow-stock-history-${from || "start"}-to-${to || today()}.csv`, [
    [t("Date"), t("Time"), t("SKU"), t("Product"), t("Before"), t("Change"), t("After"), t("Activity"), t("Source"), t("User"), t("Details")],
    ...rows.map((r) => [r.at.slice(0, 10), r.at.slice(11, 16), r.text ? "" : r.sku, r.text ? "" : r.product, r.text ? "" : r.before, r.text ? "" : sign(r.change), r.text ? "" : r.after,
      t(r.activity), t(r.source), userOf(d, r.by).name, r.text || r.ref]),
  ]);
  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">{t("Activity Log")}</h1><p className="page-sub">{t("Every stock movement and action is recorded permanently.")}</p></div>
        <button className="btn btn-secondary" onClick={exportCsv} disabled={!rows.length}><Icon n="download" size={16} /> {t("Export CSV")}</button>
      </div>
      <div className="card">
        {/* One row of filters, like a spreadsheet: dates, activity, source, user, search, reset. */}
        <div className="history-filters">
          <div className="date-range">
            <input className="input" id="h-from" type="date" aria-label={t("From")} value={from} max={to || undefined} onChange={(e) => set({ from: e.target.value })} />
            <span className="faint">–</span>
            <input className="input" id="h-to" type="date" aria-label={t("To")} value={to} min={from || undefined} onChange={(e) => set({ to: e.target.value })} />
          </div>
          <div className="hf-select"><Select id="h-act" label={t("Activity")} value={f.action} onChange={(v) => set({ action: v })} options={[["", t("All Activities")], ...opts("activity")]} /></div>
          <div className="hf-select"><Select id="h-src" label={t("Source")} value={f.source || ""} onChange={(v) => set({ source: v })} options={[["", t("All Sources")], ...opts("source")]} /></div>
          <div className="hf-select wide"><Select id="h-user" label={t("User")} value={f.user} onChange={(v) => set({ user: v })} options={[["", t("All Users")], ...[...members(d), SYS_USER, ORBYTE_USER].map((u) => [u.id, u.name])]} /></div>
          <div className="search hf-search"><Icon n="search" /><input className="input" placeholder={t("Search SKU or product")} aria-label={t("Search SKU or product")} value={f.q} onChange={(e) => set({ q: e.target.value })} /></div>
          <button className="btn btn-secondary" disabled={!filtered} onClick={() => set({ q: "", action: "", source: "", user: "", from: "", to: "" })}><Icon n="undo" size={16} /> {t("Reset Filters")}</button>
        </div>
        {rows.length ? (
          <>
            <div className="scroll-x"><table className="history" style={{ minWidth: 1100 }}>
              <thead><tr><th>{t("Date")}</th><th>{t("Time")}</th><th>{t("SKU")}</th><th>{t("Product")}</th><th className="right">{t("Before")}</th><th className="right">{t("Change")}</th><th className="right">{t("After")}</th><th>{t("Activity")}</th><th>{t("Source")}</th><th>{t("User")}</th></tr></thead>
              <tbody>{rows.slice(0, 300).map((r) => (
                <tr key={r.key}>
                  <td className="nowrap">{day(r.at)}</td>
                  <td className="nowrap muted num">{r.at.slice(11, 16)}</td>
                  {/* Actions without a stock change keep every column: "—" for the numbers, the description inside Product. */}
                  {r.text ? <>
                    <td className="faint">—</td>
                    <td className="muted history-text">{r.text}</td>
                    <td className="right faint">—</td><td className="right faint">—</td><td className="right faint">—</td>
                  </> : <>
                    <td className="mono nowrap">{r.sku}</td>
                    <td className="bold nowrap">{r.product}{r.pending ? <> <span className="chip chip-amber">{t("Pending sync")}</span></> : null}</td>
                    <td className="right num bold">{r.before}</td>
                    <td className="right num bold" style={{ color: r.change > 0 ? "var(--green-fg)" : "var(--red-fg)" }}>{sign(r.change)}</td>
                    <td className="right num bold">{r.after}</td>
                  </>}
                  <td className="nowrap">{t(r.activity)}</td>
                  <td className="nowrap muted">{t(r.source)}{r.ref ? <div className="mono faint small">{r.ref}</div> : null}</td>
                  <td className="nowrap">{userOf(d, r.by).name}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <div className="table-foot">{t("{a} of {b} entries", { a: Math.min(rows.length, 300), b: all.length })}{rows.length > 300 ? ` ${t("(newest 300 shown)")}` : ""}</div>
          </>
        ) : <Empty title={t("No matching activity")} text={t("Clear a filter to see more.")} />}
      </div>
    </>
  );
}
