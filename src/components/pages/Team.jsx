"use client";
import { useApp } from "../App.jsx";
import { DotIc, Icon, RoleChip } from "../ui.jsx";
import { members, onLeave } from "@/lib/engine.js";
import { initials } from "@/lib/format.js";

/* Owner, Manager, Inventory staff, Finance staff. The server checks the same rules (actions.js). */
const PERMISSIONS = [
  ["See stock and products", 1, 1, 1, 0], ["Record stock in and stock out", 1, 1, 1, 0], ["Plan restock and send for approval", 1, 1, 1, 0],
  ["Send orders and chase suppliers", 1, 1, 1, 0], ["See sales, budget and supplier orders", 1, 1, 0, 1], ["See approvals and stock history", 1, 1, 1, 1],
  ["Approve or reject plans", 1, 1, 0, 0], ["Edit products, categories and suppliers", 1, 1, 0, 0], ["Set the monthly budget", 1, 0, 0, 0], ["Give StockNow access", 1, 0, 0, 0],
];
const INTEGRATIONS = [
  ["Orbyte Directory", "People, roles and sign-in"],
  ["Orbyte notifications", "Alerts and approvals reach phones"], ["Orbyte activity record", "Every StockNow action joins the shared log"],
  ["Orbyte Payment", "Customer payments become stock outs automatically; pay suppliers for approved orders"], ["WhatsApp", "Supplier orders and reminders, sent by a person"],
];

export default function Team() {
  const { d, can, go, t, day } = useApp();
  const yes = <span style={{ color: "var(--green-fg)" }} aria-label={t("Yes")}><Icon n="check" size={16} sw={2.6} /></span>;
  const no = <span className="faint" aria-label={t("No")}>—</span>;
  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">{t("Team & access")}</h1><p className="page-sub">{t("Who uses StockNow and what they can do.")}</p></div>
        {can("manageAccess") ? <button className="btn btn-secondary" onClick={() => go("settings", { settingsTab: "account" })}><Icon n="settings" size={16} /> {t("Manage access")}</button> : null}
      </div>
      <div className="section" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,560px),1fr))", gap: 24 }}>
        <div className="card">
          <div className="card-head"><h2 className="card-title">{t("People")}</h2><span className="chip chip-grey"><Icon n="link" size={12} /> Orbyte Directory</span></div>
          <div className="scroll-x"><table>
            <thead><tr><th>{t("Name")}</th><th>{t("Role")}</th><th>{t("Status")}</th></tr></thead>
            <tbody>{members(d).map((u) => (
              <tr key={u.id}>
                <td><span className="row" style={{ gap: 10 }}><span className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(u.name)}</span><span className="stack"><span className="bold">{u.name}</span><span className="faint small">{u.email}</span></span></span></td>
                <td><RoleChip user={u} /></td>
                <td>{onLeave(u) ? <span className="chip chip-amber">{t("On leave until {date}", { date: day(u.leaveUntil) })}</span> : <span className="chip chip-green">{t("Available")}</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
        <div className="card">
          <div className="card-head"><h2 className="card-title">{t("Who can do what")}</h2></div>
          <div className="scroll-x"><table className="perm">
            <thead><tr><th>{t("Action")}</th><th>{t("Owner")}</th><th>{t("Manager")}</th><th>{t("Inventory staff")}</th><th>{t("Finance staff")}</th></tr></thead>
            <tbody>{PERMISSIONS.map(([a, ...cols]) => <tr key={a}><td>{t(a)}</td>{cols.map((x, i) => <td key={i}>{x ? yes : no}</td>)}</tr>)}</tbody>
          </table></div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h2 className="card-title">{t("Connected through Orbyte")}</h2><span className="chip chip-grey">{t("Simulated in demo")}</span></div>
        {INTEGRATIONS.map(([n, desc]) => (
          <div className="todo" key={n}><DotIc ic="link" tone="blue" size={15} /><span className="stack"><span className="bold">{n}</span><span className="muted small">{t(desc)}</span></span><span className="chip chip-green">{t("Connected")}</span></div>
        ))}
      </div>
    </>
  );
}
