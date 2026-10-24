"use client";
import { useApp } from "../App.jsx";
import { DotIc, Icon, RoleChip } from "../ui.jsx";
import { members, onLeave } from "@/lib/engine.js";
import { initials, shortDate } from "@/lib/format.js";

const PERMISSIONS = [
  ["See stock, products and AI plans", 1, 1, 1], ["Record stock in and stock out", 1, 1, 1], ["Run AI analysis and send plans", 1, 1, 1],
  ["Send orders and chase suppliers", 1, 1, 1], ["See approvals and the activity log", 1, 1, 1], ["Approve or reject plans", 1, 1, 0],
  ["Edit products, categories and suppliers", 1, 1, 0], ["Set the monthly budget", 1, 0, 0], ["Give StockNow access", 1, 0, 0],
];
const INTEGRATIONS = [
  ["Orbyte Directory", "People, roles and sign-in"], ["Orbyte eLeave", "Approvals skip anyone on leave"],
  ["Orbyte notifications", "Alerts and approvals reach phones"], ["Orbyte activity record", "Every StockNow action joins the shared log"],
  ["Orbyte Payment", "Pay suppliers for approved orders and track what's paid"], ["WhatsApp", "Supplier orders and reminders, sent by a person"],
];

export default function Team() {
  const { d, can, go } = useApp();
  const yes = <span style={{ color: "var(--green-fg)" }} aria-label="Yes"><Icon n="check" size={16} sw={2.6} /></span>;
  const no = <span className="faint" aria-label="No">—</span>;
  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">Team &amp; access</h1><p className="page-sub">Who can view and act in StockNow. People come from Orbyte Directory.</p></div>
        {can("manageAccess") ? <button className="btn btn-secondary" onClick={() => go("settings", { settingsTab: "account" })}><Icon n="settings" size={16} /> Manage access</button> : null}
      </div>
      <div className="section" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,440px),1fr))", gap: 24 }}>
        <div className="card">
          <div className="card-head"><h2 className="card-title">People</h2><span className="chip chip-grey"><Icon n="link" size={12} /> Orbyte Directory</span></div>
          <div className="scroll-x"><table>
            <thead><tr><th>Name</th><th>Role</th><th>Status</th></tr></thead>
            <tbody>{members(d).map((u) => (
              <tr key={u.id}>
                <td><span className="row" style={{ gap: 10 }}><span className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(u.name)}</span><span className="stack"><span className="bold">{u.name}</span><span className="faint small">{u.email}</span></span></span></td>
                <td><RoleChip role={u.role} /></td>
                <td>{onLeave(u) ? <span className="chip chip-amber">On leave until {shortDate(u.leaveUntil)}</span> : <span className="chip chip-green">Available</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
        <div className="card">
          <div className="card-head"><h2 className="card-title">Who can do what</h2></div>
          <div className="scroll-x"><table className="perm">
            <thead><tr><th>Action</th><th>Owner</th><th>Manager</th><th>Staff</th></tr></thead>
            <tbody>{PERMISSIONS.map(([a, o, m, s]) => <tr key={a}><td>{a}</td><td>{o ? yes : no}</td><td>{m ? yes : no}</td><td>{s ? yes : no}</td></tr>)}</tbody>
          </table></div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h2 className="card-title">Connected through Orbyte</h2><span className="chip chip-grey">Simulated in demo</span></div>
        {INTEGRATIONS.map(([n, desc]) => (
          <div className="todo" key={n}><DotIc ic="link" tone="blue" size={15} /><span className="stack"><span className="bold">{n}</span><span className="muted small">{desc}</span></span><span className="chip chip-green">Connected</span></div>
        ))}
      </div>
    </>
  );
}
