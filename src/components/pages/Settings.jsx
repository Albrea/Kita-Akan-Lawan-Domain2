"use client";
import { useState } from "react";
import { useApp } from "../App.jsx";
import { DotIc, Icon, RoleChip, Select, Spark } from "../ui.jsx";
import { budgetLeft, budgetParts, forecastFrom } from "@/lib/engine.js";
import { PRODUCTS, SCENARIOS } from "@/lib/seed.js";
import { deptOf, roleChoiceOf } from "@/lib/actions.js";
import { roleOptions } from "../Modals.jsx";
import { LANGS } from "@/lib/i18n.js";
import { initials, nowStamp, rm, toJSON } from "@/lib/format.js";

export default function Settings() {
  const { me, ui, setUi, can, t } = useApp();
  const owner = can("manageAccess"), finance = deptOf(me) === "FINANCE", stock = can("stock");
  /* Each tab only for the people who need it: Finance sees the budget, Inventory sees categories and backup. */
  const tabs = [["language", "Language"], ...(owner || finance ? [["budget", "Budget"]] : []), ...(stock ? [["categories", "Categories"]] : []),
    ...(can("forecastSettings") ? [["ai", "Smart features"]] : []), ["demo", "Demo data"], ...(stock ? [["backup", "Backup"]] : []), ...(owner ? [["account", "Account"]] : [])];
  const tab = tabs.some(([k]) => k === ui.settingsTab) ? ui.settingsTab : "language";
  const View = { categories: Categories, budget: Budget, language: Language, ai: AiStatus, demo: DemoData, backup: Backup, account: Access }[tab];
  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">{t("Settings")}</h1><p className="page-sub">{t("Language and other settings.")}</p></div>
        <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setUi({ settingsTab: k })}>{t(l)}</button>)}</div>
      </div>
      <View />
    </>
  );
}

function Categories() {
  const { d, can, openModal, act, t } = useApp();
  const edit = can("manageCatalog");
  const del = (c) => openModal("confirm", { title: t("Delete category {name}?", { name: c.name }), body: t("Only possible when no product uses it."), label: t("Delete"), danger: true, onOk: () => act("deleteCategory", { id: c.id }) });
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="card-head"><h2 className="card-title">{t("Categories")}</h2>{edit ? <button className="btn btn-primary btn-sm" onClick={() => openModal("category")}><Icon n="plus" size={16} /> {t("Add category")}</button> : <span className="chip chip-grey">{t("View only")}</span>}</div>
      <div className="scroll-x"><table>
        <thead><tr><th>{t("Category")}</th><th className="right">{t("Products")}</th>{edit ? <th className="right">{t("Actions")}</th> : null}</tr></thead>
        <tbody>{d.categories.map((c) => (
          <tr key={c.id}>
            <td className="bold">{c.name}</td>
            <td className="right muted num">{d.products.filter((p) => p.cat === c.id).length}</td>
            {edit ? <td className="right" style={{ whiteSpace: "nowrap" }}>
              <button className="icon-btn" aria-label={t("Edit {name}", { name: c.name })} onClick={() => openModal("category", { id: c.id })}><Icon n="pencil" size={16} /></button>
              <button className="icon-btn del" aria-label={t("Delete {name}", { name: c.name })} onClick={() => del(c)}><Icon n="trash" size={16} /></button>
            </td> : null}
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

function Budget() {
  const { d, can, openModal, t } = useApp();
  const mb = d.settings.monthlyBudget, b = budgetParts(d), left = budgetLeft(d);
  const row = (label, v, hint, sign) => (
    <div className="row" style={{ justifyContent: "space-between", padding: "12px 0", borderTop: "1px solid var(--divider)", gap: 12 }}>
      <div className="stack"><span className="bold">{label}</span><span className="muted small">{hint}</span></div><span className="bold num">{sign}{rm(v)}</span>
    </div>
  );
  return (
    <div className="card card-pad" style={{ maxWidth: 760 }}>
      <div className="row wrap" style={{ justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div className="stack"><span className="muted small">{t("Monthly purchase budget")}</span><span className="stat-value" style={{ marginTop: 2, color: "var(--ai)" }}>{rm(mb)}</span></div>
        {can("setBudget") ? <button className="btn btn-primary" onClick={() => openModal("budget")}><Icon n="wallet" size={16} /> {t("Set monthly budget")}</button> : <span className="chip chip-grey">{t("View only")}</span>}
      </div>
      {row(t("Supplier orders"), b.orders, t("Orders from approved restock plans this month"), "− ")}
      {row(t("Manual stock in"), b.manual, t("Stock bought outside a restock plan (quantity × cost price)"), "− ")}
      {row(t("Returned to supplier"), b.refunds, t("Refund for damaged stock sent back to a supplier"), "+ ")}
      <div className="row" style={{ justifyContent: "space-between", padding: "14px 0 0", borderTop: "1px solid var(--border)" }}><span className="bold">{t("Left this month")}</span><span className="bold num" style={{ fontSize: 18, color: left > 0 ? "var(--green-fg)" : "var(--red-fg)" }}>{rm(left)}</span></div>
      <div className="hint" style={{ marginTop: 12 }}>{t("Sales and customer returns don't change the budget: sales are revenue, shown on the dashboard. StockNow reminds you to plan a restock on day {day} of each month.", { day: d.settings.planDay })}</div>
    </div>
  );
}

/* Screen language for this device. English is the default. */
function Language() {
  const { lang, setLang, t } = useApp();
  return (
    <div className="card card-pad" style={{ maxWidth: 760 }}>
      <div className="row" style={{ gap: 8, marginBottom: 6 }}><span style={{ color: "var(--primary)", display: "flex" }}><Icon n="lang" /></span><h2 className="card-title">{t("Language")}</h2></div>
      <p className="muted small" style={{ marginBottom: 16 }}>{t("Choose the language for menus, buttons and labels on this device. Each person can pick their own.")}</p>
      <div className="lang-grid" role="radiogroup" aria-label={t("Language")}>
        {LANGS.map(([k, name]) => (
          <button key={k} role="radio" aria-checked={lang === k} lang={k} className={`lang-opt ${lang === k ? "on" : ""}`} onClick={() => setLang(k)}>
            <span className="bold">{name}</span>
            {k === "en" ? <span className="muted small">{t("Default")}</span> : null}
            {lang === k ? <Icon n="check" size={16} sw={2.6} /> : null}
          </button>
        ))}
      </div>
      <div className="notice blue" style={{ marginTop: 16 }}><Icon n="info" size={16} /><span>{t("Product names, written explanations, supplier messages and the activity log stay as they were written, so the record reads the same for everyone.")}</span></div>
    </div>
  );
}

/* Is Gemini working on the server? One real test call; the key itself never reaches the browser. */
function AiStatus() {
  const { meta, t } = useApp();
  const [st, setSt] = useState(null);
  async function test() {
    setSt({ loading: true });
    try { setSt(await (await fetch("/api/ai/status", { cache: "no-store" })).json()); }
    catch { setSt({ ok: false, error: t("No connection to StockNow.") }); }
  }
  const row = (k, v) => <div className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--divider)", gap: 12 }}><span className="muted">{k}</span><span className="bold">{v}</span></div>;
  return (
    <div className="card card-pad" style={{ maxWidth: 760 }}>
      <div className="row wrap" style={{ justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <div className="row" style={{ gap: 8 }}><span style={{ color: "var(--ai)", display: "flex" }}><Icon n="spark" /></span><h2 className="card-title">{t("Smart features")} · Google Gemini</h2></div>
        <span className={`chip ${meta.gemini ? "chip-green" : "chip-amber"}`}>{t(meta.gemini ? "API key set on the server" : "No API key on the server")}</span>
      </div>
      <p className="muted small" style={{ marginBottom: 12 }}>{t("StockNow uses Google Gemini to write the plan summary and supplier messages, and to suggest forecast settings. StockNow calculates every number itself and checks that the wording uses only those numbers.")}</p>
      {row(t("Model"), <span className="mono">{meta.geminiModel || "—"}</span>)}
      {row(t("If that model is busy"), <span className="mono">gemini-3.5-flash → gemini-3.5-flash-lite</span>)}
      {row(t("If it can't be reached"), t("A built-in template writes the text, and the label says why"))}
      <div className="row wrap" style={{ gap: 12, marginTop: 14 }}>
        <button className="btn btn-ai" disabled={st?.loading} onClick={test}><Icon n="spark" size={16} /> {t(st?.loading ? "Testing…" : "Test connection")}</button>
      </div>
      {st && !st.loading ? (st.ok
        ? <div className="notice green" style={{ marginTop: 14 }}><Icon n="check" size={16} /><span>{t("Connected: answered in {ms} ms using {model}.", { ms: st.ms, model: st.model })}{st.chosen && st.chosen !== st.model ? ` ${t("{chosen} was busy, so the backup model answered.", { chosen: st.chosen })}` : ""}</span></div>
        : <div className="notice red" style={{ marginTop: 14 }}><Icon n="warning" size={16} /><span><b>{t("No answer.")}</b> {st.error}</span></div>) : null}
      <div className="notice blue" style={{ marginTop: 14 }}><Icon n="info" size={16} /><span>{t("To turn this on, add GEMINI_API_KEY (from aistudio.google.com/apikey) to Replit Secrets or .env.local, and optionally GEMINI_MODEL. Then restart or redeploy, and press Test connection.")}</span></div>
    </div>
  );
}

function DemoData() {
  const { d, switchScenario, t } = useApp();
  const cur = d.settings.scenario;
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 1000 }}>
      <div className="notice blue"><Icon n="info" size={16} /><span>{t("Each scenario is the same shop with a different 6-month sales story (synthetic data). Pick one, then open Smart Restock to see how the plan changes. Switching resets the shop for everyone using this demo, with dates moved to today.")}</span></div>
      {Object.entries(SCENARIOS).map(([k, sc]) => (
        <div key={k} className="card card-pad" style={k === cur ? { borderColor: "var(--ai)", boxShadow: "0 0 0 2px var(--ai-br)" } : undefined}>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-start" }}>
            <div className="stack" style={{ flex: 1, minWidth: 220 }}><span className="bold" style={{ fontSize: 15 }}>{t(sc.label)}</span><span className="muted small">{t(sc.story)}</span></div>
            {k === cur ? <span className="chip chip-ai">{t("In use")}</span> : <button className="btn btn-secondary btn-sm" onClick={() => switchScenario(k)}>{t("Use this data")}</button>}
          </div>
          <div className="row wrap" style={{ gap: "12px 18px", marginTop: 12 }}>
            {PRODUCTS.map((p) => <div key={p.id} className="stack" style={{ gap: 0 }}><span className="faint" style={{ fontSize: 11 }}>{p.short}</span><Spark s={sc.sales[p.id]} pred={forecastFrom(sc.sales[p.id]).forecast} w={86} h={26} /></div>)}
          </div>
          <div className="notice ai" style={{ marginTop: 12 }}><Icon n="spark" size={14} /><span><b>{t("What the plan should do:")}</b> {t(sc.expect)}</span></div>
        </div>
      ))}
    </div>
  );
}

function copyText(text, onOk, onFail) {
  try { navigator.clipboard.writeText(text).then(onOk, onFail); } catch { onFail(); }
}

function Backup() {
  const { d, meta, ui, setUi, act, toast, offline, queue, toggleOffline, t } = useApp();
  const layers = [
    ["database", "blue", "1. Data is backed up", meta.mode === "supabase" ? "Stored in Supabase Postgres, which takes automatic daily backups." : "Demo mode: data is kept in server memory. Connect Supabase for permanent storage and daily backups."],
    ["offline", "amber", "2. Keep working offline", "Stock in and stock out keep working on the device and sync when the connection is back."],
    ["message", "green", "3. Paper or WhatsApp fallback", "No device at hand? Write sales on the note template, then type them in with Catch-up entry below."],
    ["spark", "ai", "4. Restock plans always work", "StockNow calculates the restock numbers itself. If the writing help is down, standard wording is used instead."],
  ];
  const showBox = (text, msg) => { setUi({ backupText: text }); toast(msg); };
  const copyBackup = () => {
    const json = toJSON({ app: "StockNow", exportedAt: nowStamp(), ...d, requests: d.requests.map(({ result, ...r }) => r) });
    copyText(json, () => toast(t("Backup copied. Paste it somewhere safe.")), () => showBox(json, t("Copy was blocked. The backup is in the box below: select it and copy.")));
  };
  const copyTemplate = () => {
    const tx = `STOCK OUT NOTE · Date: __________\nOne line per sale: SKU  QTY  REASON\n\n${d.products.map((p) => `${p.sku.padEnd(9)} ___   (${p.short})`).join("\n")}\n\nLater, type the lines into StockNow → Settings → Backup → Catch-up entry.`;
    copyText(tx, () => toast(t("Note template copied. Print it or send it on WhatsApp.")), () => showBox(tx, t("Copy was blocked. The template is in the box below: select it and copy.")));
  };
  async function recordCatchUp() {
    const out = await act("catchUp", { text: ui.catchup });
    if (out.ok) setUi({ catchup: out.result.remaining, catchupResult: out.result.results });
  }

  return (
    <>
      <div className="section" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: 24 }}>
        <div className="card">
          <div className="card-head"><h2 className="card-title">{t("If StockNow goes down")}</h2><span className={`chip ${meta.mode === "supabase" ? "chip-green" : "chip-amber"}`}><Icon n="database" size={12} /> {t(meta.mode === "supabase" ? "Supabase connected" : "Demo memory store")}</span></div>
          {layers.map(([ic, tone, ti, desc]) => <div className="todo" key={ti}><DotIc ic={ic} tone={tone} size={15} /><span className="stack"><span className="bold">{t(ti)}</span><span className="muted small">{t(desc)}</span></span></div>)}
        </div>
        <div className="card card-pad stack" style={{ gap: 16 }}>
          <div>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}><span className="bold">{t("Try an outage")}</span>{offline ? <span className="chip chip-amber">{t("Offline (simulated)")}</span> : <span className="chip chip-green">{t("Online")}</span>}</div>
            <p className="muted small" style={{ margin: "6px 0 10px" }}>{t("Turn it on, record a stock out, then come back online to see it sync.")}</p>
            <button className={`btn ${offline ? "btn-primary" : "btn-secondary"}`} onClick={toggleOffline}><Icon n={offline ? "check" : "offline"} size={16} /> {offline ? `${t("Back online")}${queue.length ? ` · ${t("sync {n}", { n: queue.length })}` : ""}` : t("Simulate outage")}</button>
          </div>
          <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 16 }}>
            <span className="bold">{t("Backup copy")}</span>
            <p className="muted small" style={{ margin: "6px 0 10px" }}>{t("Everything in StockNow as one text file. Paste it into Google Drive or an email to keep your own copy.")}</p>
            <button className="btn btn-secondary" onClick={copyBackup}><Icon n="copy" size={16} /> {t("Copy backup")}</button>
            {ui.backupText ? <textarea className="textarea mono" aria-label={t("Copy this text")} readOnly rows={6} style={{ marginTop: 10 }} value={ui.backupText} onFocus={(e) => e.target.select()} /> : null}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <div className="stack"><h2 className="card-title">{t("Catch-up entry")}</h2><span className="muted small">{t("Type in sales written on paper or sent on WhatsApp while StockNow was down.")}</span></div>
          <button className="btn btn-secondary btn-sm" onClick={copyTemplate}><Icon n="copy" size={14} /> {t("Copy note template")}</button>
        </div>
        <div className="card-pad grid2">
          <div className="field">
            <label className="label" htmlFor="catchup">{t("One line per item: SKU, quantity, optional reason")}</label>
            <textarea className="textarea mono" id="catchup" rows={6} placeholder={"OUT-HDE 3\nTEE-CMB 10 online"} value={ui.catchup} onChange={(e) => setUi({ catchup: e.target.value })} />
            <div className="row" style={{ marginTop: 10 }}><button className="btn btn-primary" onClick={recordCatchUp}><Icon n="out" size={16} /> {t("Record stock out")}</button></div>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">{t(ui.catchupResult ? "Result" : "SKUs in this shop")}</span>
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
  const { d, openModal, act, t } = useApp();
  const remove = (u) => openModal("confirm", {
    title: t("Remove {name}'s access?", { name: u.name }), body: t("They stay in Orbyte Directory but can no longer open StockNow. Their past activity is kept."), label: t("Remove access"), danger: true,
    onOk: () => act("removeAccess", { id: u.id }),
  });
  return (
    <div className="card" style={{ maxWidth: 860 }}>
      <div className="card-head">
        <div className="stack"><h2 className="card-title">{t("StockNow access")}</h2><span className="muted small">{t("Accounts live in Orbyte Directory. Choose who can open StockNow and their role.")}</span></div>
        <button className="btn btn-primary btn-sm" disabled={!d.people.some((u) => !u.role)} onClick={() => openModal("grant")}><Icon n="plus" size={16} /> {t("Give access")}</button>
      </div>
      <div className="scroll-x"><table style={{ minWidth: 620 }}>
        <thead><tr><th>{t("Person")}</th><th>{t("Department")}</th><th>{t("StockNow role")}</th><th className="right">{t("Actions")}</th></tr></thead>
        <tbody>{d.people.map((u) => (
          <tr key={u.id}>
            <td><span className="row" style={{ gap: 10 }}><span className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(u.name)}</span><span className="stack"><span className="bold">{u.name}</span><span className="faint small">{u.email}</span></span></span></td>
            <td className="muted">{u.dept}</td>
            <td>{u.role === "OWNER" ? <RoleChip role="OWNER" /> : u.role
              ? <div style={{ width: 170 }}><Select id={`role-${u.id}`} cls="sm" label={t("Role of {name}", { name: u.name })} value={roleChoiceOf(u)} onChange={(v) => act("changeRole", { id: u.id, role: v })} options={roleOptions(t)} /></div>
              : <span className="chip chip-grey">{t("No access")}</span>}</td>
            <td className="right">{u.role === "OWNER" ? <span className="faint small">{t("Owner")}</span> : u.role
              ? <button className="btn btn-secondary btn-sm" onClick={() => remove(u)}>{t("Remove access")}</button>
              : <button className="btn btn-link btn-sm" onClick={() => openModal("grant", { pid: u.id })}>{t("Give access")}</button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <div className="table-foot">{t("New people are added in Orbyte Directory, not here. Every change is recorded in the activity log.")}</div>
    </div>
  );
}
