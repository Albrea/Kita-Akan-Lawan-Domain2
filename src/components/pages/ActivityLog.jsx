"use client";
import { useApp } from "../App.jsx";
import { Empty, Icon, RoleChip, Select } from "../ui.jsx";
import { ORBYTE_USER, SYS_USER, members, userOf } from "@/lib/engine.js";

export const ACTION_LABEL = {
  PRODUCT_CREATED: "Product created", PRODUCT_UPDATED: "Product updated", PRODUCT_DELETED: "Product deleted",
  CATEGORY_CREATED: "Category created", CATEGORY_UPDATED: "Category updated", CATEGORY_DELETED: "Category deleted",
  SUPPLIER_CREATED: "Supplier created", SUPPLIER_UPDATED: "Supplier updated", SUPPLIER_DELETED: "Supplier deleted",
  STOCK_IN: "Stock in", STOCK_OUT: "Stock out", AI_ANALYSIS: "AI analysis", AI_SENT: "AI proposal sent",
  AI_APPROVED: "AI approved", AI_REJECTED: "AI rejected", AUTO_ALERT: "Automatic alert", AUTO_PLAN: "Automatic plan",
  PO_SENT: "Order sent", SUPPLIER_CHASED: "Supplier reminder", SETTINGS_UPDATED: "Budget changed",
  ACCESS_GRANTED: "Access given", ACCESS_CHANGED: "Access changed", ACCESS_REMOVED: "Access removed",
  OUTAGE: "Outage", SYNC: "Synced", CATCH_UP: "Catch-up entry", SCENARIO: "Demo data", UNDO: "Undo",
  ORBYTE_SALE: "Orbyte sale", ORBYTE_REFUND: "Orbyte refund", ORBYTE_CHECK: "Payment check", ORBYTE_CHECKED: "Payment checked", FORECAST_CONFIG: "Forecast settings",
};
const actionChip = (a) => a === "AI_APPROVED" ? "chip-green" : a === "AI_REJECTED" || a === "ORBYTE_CHECK" ? "chip-red" : a.startsWith("AI") || a.startsWith("AUTO") || a.startsWith("ORBYTE") ? "chip-ai" : a === "UNDO" ? "chip-grey"
  : a === "STOCK_IN" ? "chip-green" : a === "STOCK_OUT" ? "chip-amber" : "chip-blue";

export default function ActivityLog() {
  const { d, ui, setUi, t, when } = useApp();
  const f = ui.activity, q = f.q.trim().toLowerCase();
  const set = (patch) => setUi((u) => ({ activity: { ...u.activity, ...patch } }));
  const rows = d.logs.filter((l) => (!f.action || l.action === f.action) && (!f.user || l.by === f.user) && (!q || l.text.toLowerCase().includes(q)));
  const actions = [...new Set(d.logs.map((l) => l.action))];
  return (
    <>
      <div className="page-head"><div><h1 className="page-title">{t("Activity Log")}</h1><p className="page-sub">{t("Every stock movement, AI decision, payment and approval, newest first. Entries are written as they happen and keep their original wording.")}</p></div></div>
      <div className="card">
        <div className="toolbar">
          <div className="search" style={{ flex: 1, minWidth: 200 }}><Icon n="search" /><input className="input" placeholder={t("Search descriptions")} aria-label={t("Search activity")} value={f.q} onChange={(e) => set({ q: e.target.value })} /></div>
          <div style={{ width: 200, maxWidth: "100%" }}><Select id="act-a" label={t("Action")} value={f.action} onChange={(v) => set({ action: v })} options={[["", t("All actions")], ...actions.map((a) => [a, t(ACTION_LABEL[a] || a)])]} /></div>
          <div style={{ width: 180, maxWidth: "100%" }}><Select id="act-u" label={t("Person")} value={f.user} onChange={(v) => set({ user: v })} options={[["", t("All people")], ...[...members(d), SYS_USER, ORBYTE_USER].map((u) => [u.id, u.name])]} /></div>
        </div>
        {rows.length ? (
          <>
            <div className="scroll-x"><table style={{ minWidth: 860 }}>
              <thead><tr><th>{t("Date")}</th><th>{t("Person")}</th><th>{t("Role")}</th><th>{t("Action")}</th><th>{t("Description")}</th></tr></thead>
              <tbody>{rows.slice(0, 300).map((l) => {
                const u = userOf(d, l.by);
                return (
                  <tr key={l.id}>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{when(l.at)}</td>
                    <td className="bold" style={{ whiteSpace: "nowrap" }}>{u.name}</td>
                    <td>{l.by === "sys" ? <RoleChip role="SYSTEM" /> : u.role ? <RoleChip role={u.role} /> : <span className="chip chip-grey">{t("No access")}</span>}</td>
                    <td><span className={`chip ${actionChip(l.action)}`}>{t(ACTION_LABEL[l.action] || l.action)}</span></td>
                    <td style={{ fontSize: 13.5 }}>{l.text}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            <div className="table-foot">{t("{a} of {b} entries", { a: Math.min(rows.length, 300), b: d.logs.length })}{rows.length > 300 ? ` ${t("(newest 300 shown)")}` : ""}</div>
          </>
        ) : <Empty title={t("No matching activity")} text={t("Clear a filter to see more.")} />}
      </div>
    </>
  );
}
