"use client";
import { useApp } from "../App.jsx";
import { DotIc, Icon, RoleChip, Select, Spark } from "../ui.jsx";
import { budgetLeft, budgetParts, forecastFrom } from "@/lib/engine.js";
import { PRODUCTS, SCENARIOS } from "@/lib/seed.js";
import { ROLE_LABEL } from "@/lib/actions.js";
import { initials, nowStamp, rm, toJSON } from "@/lib/format.js";

export default function Settings() {
  const { ui, setUi, can } = useApp();
  const owner = can("manageAccess");
  const tabs = [["categories", "Categories"], ...(owner ? [["budget", "Budget"]] : []), ["demo", "Demo data"], ["backup", "Backup"], ...(owner ? [["account", "Account"]] : [])];
  const tab = tabs.some(([k]) => k === ui.settingsTab) ? ui.settingsTab : "categories";
  const View = { categories: Categories, budget: Budget, demo: DemoData, backup: Backup, account: Access }[tab];
  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">Settings</h1><p className="page-sub">Categories, {owner ? "budget, " : ""}demo data, backup{owner ? " and who can open StockNow" : ""}.</p></div>
        <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setUi({ settingsTab: k })}>{l}</button>)}</div>
      </div>
      <View />
    </>
  );
}

function Categories() {
  const { d, can, openModal, act } = useApp();
  const edit = can("manageCatalog");
  const del = (c) => openModal("confirm", { title: `Delete category ${c.name}?`, body: "Only possible when no product uses it.", label: "Delete", danger: true, onOk: () => act("deleteCategory", { id: c.id }) });
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="card-head"><h2 className="card-title">Categories</h2>{edit ? <button className="btn btn-primary btn-sm" onClick={() => openModal("category")}><Icon n="plus" size={16} /> Add category</button> : <span className="chip chip-grey">View only</span>}</div>
      <div className="scroll-x"><table>
        <thead><tr><th>Category</th><th className="right">Products</th>{edit ? <th className="right">Actions</th> : null}</tr></thead>
        <tbody>{d.categories.map((c) => (
          <tr key={c.id}>
            <td className="bold">{c.name}</td>
            <td className="right muted num">{d.products.filter((p) => p.cat === c.id).length}</td>
            {edit ? <td className="right" style={{ whiteSpace: "nowrap" }}>
              <button className="icon-btn" aria-label={`Edit ${c.name}`} onClick={() => openModal("category", { id: c.id })}><Icon n="pencil" size={16} /></button>
              <button className="icon-btn del" aria-label={`Delete ${c.name}`} onClick={() => del(c)}><Icon n="trash" size={16} /></button>
            </td> : null}
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

function Budget() {
  const { d, openModal } = useApp();
  const mb = d.settings.monthlyBudget, b = budgetParts(d), left = budgetLeft(d);
  const row = (label, v, hint, sign) => (
    <div className="row" style={{ justifyContent: "space-between", padding: "12px 0", borderTop: "1px solid var(--divider)", gap: 12 }}>
      <div className="stack"><span className="bold">{label}</span><span className="muted small">{hint}</span></div><span className="bold num">{sign}{rm(v)}</span>
    </div>
  );
  return (
    <div className="card card-pad" style={{ maxWidth: 760 }}>
      <div className="row wrap" style={{ justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div className="stack"><span className="muted small">Monthly purchase budget</span><span className="stat-value" style={{ marginTop: 2, color: "var(--ai)" }}>{rm(mb)}</span></div>
        <button className="btn btn-primary" onClick={() => openModal("budget")}><Icon n="wallet" size={16} /> Set monthly budget</button>
      </div>
      {row("Supplier orders", b.orders, "Orders created from approved AI plans this month", "− ")}
      {row("Manual stock in", b.manual, "Stock bought outside an AI plan (quantity × cost price)", "− ")}
      {row("Returned to supplier", b.refunds, "Refund for damaged stock sent back to a supplier", "+ ")}
      <div className="row" style={{ justifyContent: "space-between", padding: "14px 0 0", borderTop: "1px solid var(--border)" }}><span className="bold">Left this month</span><span className="bold num" style={{ fontSize: 18, color: left > 0 ? "var(--green-fg)" : "var(--red-fg)" }}>{rm(left)}</span></div>
      <div className="hint" style={{ marginTop: 12 }}>Sales and customer returns don&apos;t change the budget: sales are revenue, shown on the dashboard. AI drafts a plan from what&apos;s left on day {d.settings.planDay} of each month.</div>
    </div>
  );
}

function DemoData() {
  const { d, switchScenario } = useApp();
  const cur = d.settings.scenario;
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 1000 }}>
      <div className="notice blue"><Icon n="info" size={16} /><span>Each scenario is the same shop with a different 6-month sales story (synthetic data). Pick one, then open AI Restock to see how the AI reacts. Switching resets the shop for everyone using this demo.</span></div>
      {Object.entries(SCENARIOS).map(([k, sc]) => (
        <div key={k} className="card card-pad" style={k === cur ? { borderColor: "var(--ai)", boxShadow: "0 0 0 2px var(--ai-br)" } : undefined}>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-start" }}>
            <div className="stack" style={{ flex: 1, minWidth: 220 }}><span className="bold" style={{ fontSize: 15 }}>{sc.label}</span><span className="muted small">{sc.story}</span></div>
            {k === cur ? <span className="chip chip-ai">In use</span> : <button className="btn btn-secondary btn-sm" onClick={() => switchScenario(k)}>Use this data</button>}
          </div>
          <div className="row wrap" style={{ gap: "12px 18px", marginTop: 12 }}>
            {PRODUCTS.map((p) => <div key={p.id} className="stack" style={{ gap: 0 }}><span className="faint" style={{ fontSize: 11 }}>{p.short}</span><Spark s={sc.sales[p.id]} pred={forecastFrom(sc.sales[p.id]).forecast} w={86} h={26} /></div>)}
          </div>
          <div className="notice ai" style={{ marginTop: 12 }}><Icon n="spark" size={14} /><span><b>What AI should do:</b> {sc.expect}</span></div>
        </div>
      ))}
    </div>
  );
}

function copyText(text, onOk, onFail) {
  try { navigator.clipboard.writeText(text).then(onOk, onFail); } catch { onFail(); }
}

function Backup() {
  const { d, meta, ui, setUi, act, toast, offline, queue, toggleOffline } = useApp();
  const layers = [
    ["database", "blue", "1. Data is backed up", meta.mode === "supabase" ? "Stored in Supabase Postgres, which takes automatic daily backups." : "Demo mode: data is kept in server memory. Connect Supabase for permanent storage and daily backups."],
    ["offline", "amber", "2. Keep working offline", "Stock in and stock out keep working on the device and sync when the connection is back."],
    ["message", "green", "3. Paper or WhatsApp fallback", "No device at hand? Write sales on the note template, then type them in with Catch-up entry below."],
    ["spark", "ai", "4. AI never blocks the shop", "The restock numbers are calculated by StockNow itself. If Gemini is down, a template writes the text instead."],
  ];
  const showBox = (text, msg) => { setUi({ backupText: text }); toast(msg); };
  const copyBackup = () => {
    const json = toJSON({ app: "StockNow", exportedAt: nowStamp(), ...d, requests: d.requests.map(({ result, ...r }) => r) });
    copyText(json, () => toast("Backup copied. Paste it somewhere safe."), () => showBox(json, "Copy was blocked. The backup is in the box below: select it and copy."));
  };
  const copyTemplate = () => {
    const t = `STOCK OUT NOTE · Date: __________\nOne line per sale: SKU  QTY  REASON\n\n${d.products.map((p) => `${p.sku.padEnd(9)} ___   (${p.short})`).join("\n")}\n\nLater, type the lines into StockNow → Settings → Backup → Catch-up entry.`;
    copyText(t, () => toast("Note template copied. Print it or send it on WhatsApp."), () => showBox(t, "Copy was blocked. The template is in the box below: select it and copy."));
  };
  async function recordCatchUp() {
    const out = await act("catchUp", { text: ui.catchup });
    if (out.ok) setUi({ catchup: out.result.remaining, catchupResult: out.result.results });
  }

  return (
    <>
      <div className="section" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: 24 }}>
        <div className="card">
          <div className="card-head"><h2 className="card-title">If StockNow goes down</h2><span className={`chip ${meta.mode === "supabase" ? "chip-green" : "chip-amber"}`}><Icon n="database" size={12} /> {meta.mode === "supabase" ? "Supabase connected" : "Demo memory store"}</span></div>
          {layers.map(([ic, tone, t, desc]) => <div className="todo" key={t}><DotIc ic={ic} tone={tone} size={15} /><span className="stack"><span className="bold">{t}</span><span className="muted small">{desc}</span></span></div>)}
        </div>
        <div className="card card-pad stack" style={{ gap: 16 }}>
          <div>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}><span className="bold">Try an outage</span>{offline ? <span className="chip chip-amber">Offline (simulated)</span> : <span className="chip chip-green">Online</span>}</div>
            <p className="muted small" style={{ margin: "6px 0 10px" }}>Turn it on, record a stock out, then come back online to see it sync.</p>
            <button className={`btn ${offline ? "btn-primary" : "btn-secondary"}`} onClick={toggleOffline}><Icon n={offline ? "check" : "offline"} size={16} /> {offline ? `Back online${queue.length ? ` · sync ${queue.length}` : ""}` : "Simulate outage"}</button>
          </div>
          <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 16 }}>
            <span className="bold">Backup copy</span>
            <p className="muted small" style={{ margin: "6px 0 10px" }}>Everything in StockNow as one text file. Paste it into Google Drive or an email to keep your own copy.</p>
            <button className="btn btn-secondary" onClick={copyBackup}><Icon n="copy" size={16} /> Copy backup</button>
            {ui.backupText ? <textarea className="textarea mono" aria-label="Copy this text" readOnly rows={6} style={{ marginTop: 10 }} value={ui.backupText} onFocus={(e) => e.target.select()} /> : null}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <div className="stack"><h2 className="card-title">Catch-up entry</h2><span className="muted small">Type in sales written on paper or sent on WhatsApp while StockNow was down.</span></div>
          <button className="btn btn-secondary btn-sm" onClick={copyTemplate}><Icon n="copy" size={14} /> Copy note template</button>
        </div>
        <div className="card-pad grid2">
          <div className="field">
            <label className="label" htmlFor="catchup">One line per item: SKU, quantity, optional reason</label>
            <textarea className="textarea mono" id="catchup" rows={6} placeholder={"OUT-HDE 3\nTEE-CMB 10 online"} value={ui.catchup} onChange={(e) => setUi({ catchup: e.target.value })} />
            <div className="row" style={{ marginTop: 10 }}><button className="btn btn-primary" onClick={recordCatchUp}><Icon n="out" size={16} /> Record stock out</button></div>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">{ui.catchupResult ? "Result" : "SKUs in this shop"}</span>
            {ui.catchupResult ? ui.catchupResult.map((x, k) => (
              <div key={k} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                <DotIc ic={x.ok ? "check" : "close"} tone={x.ok ? "green" : "red"} size={13} />
                <span className="stack"><span className="mono">{x.line}</span><span className="small" style={{ color: x.ok ? "var(--text-2)" : "var(--red-fg)" }}>{x.msg}</span></span>
              </div>
            )) : <div className="row wrap" style={{ gap: 6 }}>{d.products.map((p) => <span key={p.id} className="chip chip-grey"><span className="mono">{p.sku}</span> {p.short}</span>)}</div>}
          </div>
        </div>
      </div>
    </>
  );
}

function Access() {
  const { d, openModal, act } = useApp();
  const remove = (u) => openModal("confirm", {
    title: `Remove ${u.name}'s access?`, body: "They stay in Orbyte Directory but can no longer open StockNow. Their past activity is kept.", label: "Remove access", danger: true,
    onOk: () => act("removeAccess", { id: u.id }),
  });
  return (
    <div className="card" style={{ maxWidth: 860 }}>
      <div className="card-head">
        <div className="stack"><h2 className="card-title">StockNow access</h2><span className="muted small">Accounts live in Orbyte Directory. Choose who can open StockNow and their role.</span></div>
        <button className="btn btn-primary btn-sm" disabled={!d.people.some((u) => !u.role)} onClick={() => openModal("grant")}><Icon n="plus" size={16} /> Give access</button>
      </div>
      <div className="scroll-x"><table style={{ minWidth: 620 }}>
        <thead><tr><th>Person</th><th>Department</th><th>StockNow role</th><th className="right">Actions</th></tr></thead>
        <tbody>{d.people.map((u) => (
          <tr key={u.id}>
            <td><span className="row" style={{ gap: 10 }}><span className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(u.name)}</span><span className="stack"><span className="bold">{u.name}</span><span className="faint small">{u.email}</span></span></span></td>
            <td className="muted">{u.dept}</td>
            <td>{u.role === "OWNER" ? <RoleChip role="OWNER" /> : u.role
              ? <div style={{ width: 150 }}><Select id={`role-${u.id}`} cls="sm" label={`Role of ${u.name}`} value={u.role} onChange={(v) => act("changeRole", { id: u.id, role: v })} options={[["MANAGER", ROLE_LABEL.MANAGER], ["STAFF", ROLE_LABEL.STAFF]]} /></div>
              : <span className="chip chip-grey">No access</span>}</td>
            <td className="right">{u.role === "OWNER" ? <span className="faint small">Owner</span> : u.role
              ? <button className="btn btn-secondary btn-sm" onClick={() => remove(u)}>Remove access</button>
              : <button className="btn btn-link btn-sm" onClick={() => openModal("grant", { pid: u.id })}>Give access</button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <div className="table-foot">New people are added in Orbyte Directory, not here. Every change is recorded in the activity log.</div>
    </div>
  );
}
