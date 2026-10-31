"use client";
import { useEffect, useRef, useState } from "react";
import { useApp, OFFLINE_MSG } from "./App.jsx";
import { routeText } from "./pages/AiRestock.jsx";
import { AiSourceChip, Bullets, FieldError, Icon, Modal, Select } from "./ui.jsx";
import {
  analyse, configOf, inPlan, budgetLeft, lateDays, nameOfP, overridesOf, poOf, poTotal, productOf, reqOf, summaryBullets, supName, userOf,
} from "@/lib/engine.js";
import { chaseMessage, orderMessage } from "@/lib/messages.js";
import { f1, pct, rm, rm2, toJSON } from "@/lib/format.js";
import { monthName } from "@/lib/i18n.js";


export default function Modals() {
  const { modal } = useApp();
  if (!modal) return null;
  const C = MODALS[modal.kind];
  return C ? <C {...modal} /> : null;
}

/* Small form helper: values, field errors, and a save that maps server field errors back to inputs. */
function useForm(initial) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => { const n = { ...e }; delete n[k]; return n; }); };
  const submit = async (run) => {
    setSaving(true);
    const out = await run();
    setSaving(false);
    if (!out.ok && out.fields) setErr(out.fields);
    return out;
  };
  return { f, set, err, saving, submit };
}

const Cancel = () => { const { closeModal, t } = useApp(); return <button className="btn btn-secondary" onClick={closeModal}>{t("Cancel")}</button>; };

function SendModal() {
  const { d, ui, setAi, act, closeModal, t } = useApp();
  const r = ui.ai.result, tt = r.t, s = ui.ai.summary;
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  async function send() {
    setSaving(true);
    const summary = s && !s.loading && s.source === "gemini" && s.text ? s.text : r.summary;
    const out = await act("sendProposal", { budget: r.ideal ? "ideal" : r.budget, overrides: overridesOf(r), note, summary }, { toastFields: true });
    setSaving(false);
    if (out.ok) { setAi({ phase: "idle", result: null, auto: false, filter: null, open: {}, summary: null }); closeModal(); }
  }
  return (
    <Modal title={t("Send for approval")} onClose={closeModal} foot={<><Cancel /><button className="btn btn-ai" disabled={saving} onClick={send}><Icon n="send" size={16} /> {t("Send plan")}</button></>}>
      <Bullets items={summaryBullets(d, r).slice(0, 3)} style={{ marginBottom: 16 }} />
      <div className="scroll-x"><table>
        <thead><tr><th>{t("Product")}</th><th className="right">{t("Qty")}</th><th className="right">{t("Cost")}</th><th className="right">{t("Profit")}</th></tr></thead>
        <tbody>
          {tt.buy.map((i) => <tr key={i.pid}><td>{i.name}</td><td className="right num">{i.qty}</td><td className="right num">{rm(i.cost)}</td><td className="right num" style={{ color: "var(--green-fg)" }}>{rm(i.profit)}</td></tr>)}
          <tr><td className="bold">{t("Total")}</td><td /><td className="right bold num">{rm(tt.cost)}</td><td className="right bold num" style={{ color: "var(--green-fg)" }}>{rm(tt.profit)}</td></tr>
        </tbody>
      </table></div>
      <div className="field" style={{ marginTop: 16 }}>
        <label className="label" htmlFor="send-note">{t("Note for the approver (optional)")}</label>
        <textarea className="textarea" id="send-note" placeholder={t("e.g. Hoodies keep selling out on weekends.")} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="hint">{routeText(d, t)}</div>
    </Modal>
  );
}

function RejectModal({ reqId }) {
  const { d, act, closeModal, t } = useApp();
  const req = reqOf(d, reqId);
  const { f, set, err, saving, submit } = useForm({ note: "" });
  if (!req) return null;
  const save = async () => { const out = await submit(() => act("rejectAll", { reqId, note: f.note })); if (out.ok) closeModal(); };
  return (
    <Modal title={t("Reject {code}?", { code: req.code })} size="sm" onClose={closeModal} foot={<><Cancel /><button className="btn btn-danger" disabled={saving} onClick={save}>{t("Reject plan")}</button></>}>
      <p className="muted" style={{ marginBottom: 14 }}>{t("{name} will see your reason and can send a new plan.", { name: userOf(d, req.by).name })}</p>
      <div className="field">
        <label className="label" htmlFor="rej-note">{t("Reason")} <span className="req">*</span></label>
        <textarea className={`textarea ${err.note ? "error" : ""}`} id="rej-note" placeholder={t("e.g. Hold purchases until the year-end sale results.")} value={f.note} onChange={(e) => set("note", e.target.value)} />
        <FieldError msg={err.note} />
      </div>
    </Modal>
  );
}

function BudgetModal() {
  const { d, act, closeModal, t } = useApp();
  const { f, set, err, saving, submit } = useForm({ budget: String(d.settings.monthlyBudget) });
  const save = async () => { const out = await submit(() => act("setMonthlyBudget", { budget: f.budget })); if (out.ok) closeModal(); };
  return (
    <Modal title={t("Monthly purchase budget")} size="sm" onClose={closeModal} foot={<><Cancel /><button className="btn btn-primary" disabled={saving} onClick={save}>{t("Save budget")}</button></>}>
      <div className="field">
        <label className="label" htmlFor="mb">{t("Money set aside for buying stock each month (RM)")}</label>
        <input className={`input ${err.budget ? "error" : ""}`} id="mb" inputMode="numeric" autoFocus value={f.budget} onChange={(e) => set("budget", e.target.value.replace(/[^0-9]/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        {err.budget ? <FieldError msg={err.budget} /> : <div className="hint">{t("Supplier orders and manual stock in use it up; stock returned to a supplier gives it back. Sales don't refill it. Restock plans use what's left. StockNow never moves real money.", { day: d.settings.planDay })}</div>}
      </div>
    </Modal>
  );
}

/* AI drafts the WhatsApp text (Gemini, or the template); a person sends it. Opening WhatsApp counts as sending. */
function MessageModal({ poId, msgKind }) {
  const { d, me, act, closeModal, go, offline, toast, t } = useApp();
  const po = poOf(d, poId);
  const kind = msgKind === "chase" ? "chase" : "order";
  const [text, setText] = useState(() => (po ? (kind === "order" ? orderMessage(d, po, me.name) : chaseMessage(d, po, me.name)) : ""));
  const [source, setSource] = useState(offline ? { source: "offline" } : { loading: true });
  const edited = useRef(false);
  const area = useRef(null);

  useEffect(() => {
    if (offline || !po) return;
    let live = true;
    fetch("/api/ai/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: toJSON({ poId, kind, actorId: me.id }) })
      .then((r) => r.json())
      .then((out) => { if (!live) return; if (out.text && !edited.current) setText(out.text); setSource({ source: out.source || "template", reason: out.reason, note: out.note }); })
      .catch(() => live && setSource({ source: "template", reason: "error", note: "No connection" }));
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!po) return null;
  async function markSent() {
    if (offline) return toast(t(OFFLINE_MSG), true);
    const out = await act("markSent", { poId, kind });
    if (out.ok) { closeModal(); go("stock-in", { stockInTab: "orders", focusPo: poId }); }
  }
  function openWhatsApp(e) {
    e.preventDefault();
    if (offline) return toast(t(OFFLINE_MSG), true);
    try { window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener"); } catch {}
    markSent();
  }
  function copy() {
    const fallback = () => { area.current?.focus(); area.current?.select(); toast(t("Text selected. Press Ctrl+C to copy.")); };
    try { navigator.clipboard.writeText(text).then(() => toast(t("Message copied")), fallback); } catch { fallback(); }
  }
  return (
    <Modal title={kind === "order" ? t("Send {code} to {sup}", { code: po.code, sup: supName(d, po.sup) }) : t("Remind {sup}", { sup: supName(d, po.sup) })} onClose={closeModal}
      foot={<><Cancel /><button className="btn btn-primary" onClick={markSent}><Icon n="check" size={16} sw={2.2} /> {t("Mark as sent")}</button></>}>
      <div className="row wrap" style={{ justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <p className="muted" style={{ flex: 1, minWidth: 220 }}>{kind === "order" ? t("Written for you from the approved order. Edit it if you like, then send it on WhatsApp.") : t("{code} is {n} days late. Here is a polite reminder.", { code: po.code, n: lateDays(po) })}</p>
        <AiSourceChip s={source} />
      </div>
      <textarea ref={area} className="textarea" rows={10} aria-label={t("Message")} value={text} onChange={(e) => { edited.current = true; setText(e.target.value); }} />
      <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={copy}><Icon n="copy" size={14} /> {t("Copy text")}</button>
        <a className="btn btn-secondary btn-sm" href={"https://wa.me/?text=" + encodeURIComponent(text)} target="_blank" rel="noopener noreferrer" onClick={openWhatsApp}><Icon n="message" size={14} /> {t("Open in WhatsApp")}</a>
      </div>
      <div className="hint">{t("Nothing is sent automatically. Opening WhatsApp (or Mark as sent, if you copied the text) records it and takes you to the order on Stock In.")}</div>
    </Modal>
  );
}

function PosCreatedModal({ reqId }) {
  const { d, closeModal, openModal, go, t, tp, when } = useApp();
  const req = reqOf(d, reqId);
  if (!req) return null;
  const pos = (req.poIds || []).map((id) => poOf(d, id)).filter(Boolean);
  return (
    <Modal title={tp(pos.length, "{n} supplier order created", "{n} supplier orders created")} onClose={closeModal}
      foot={<button className="btn btn-secondary" onClick={() => { closeModal(); go("stock-in", { stockInTab: "orders", focusPo: pos[0]?.id || null }); }}>{t("Go to supplier orders")}</button>}>
      <p className="muted" style={{ marginBottom: 12 }}>{t("{code} is approved. Budget left this month: {left}. Stock goes up only when the delivery is received.", { code: req.code, left: <b>{rm(budgetLeft(d))}</b> })}</p>
      {pos.map((po) => (
        <div key={po.id} className="row" style={{ padding: "12px 0", borderTop: "1px solid var(--divider)", flexWrap: "wrap" }}>
          <div className="stack" style={{ flex: 1, minWidth: 200 }}>
            <span className="bold"><span className="mono">{po.code}</span> · {supName(d, po.sup)}</span>
            <span className="muted small">{po.items.map((i) => `${i.qty} × ${nameOfP(d, i.pid)}`).join(", ")} · {rm(poTotal(po))} · {t("expected {date}", { date: when(po.expectedAt) })}</span>
          </div>
          {po.sentAt ? <span className="chip chip-green">{t("Sent")}</span> : <button className="btn btn-primary btn-sm" onClick={() => openModal("message", { poId: po.id, msgKind: "order" })}><Icon n="send" size={14} /> {t("Send order")}</button>}
        </div>
      ))}
    </Modal>
  );
}

/* An Orbyte payment StockNow could not match: a person checks it and writes what they found. */
function PaymentModal({ alertId }) {
  const { d, act, can, closeModal, t, when } = useApp();
  const a = d.alerts.find((x) => x.id === alertId);
  const { f, set, err, saving, submit } = useForm({ note: "" });
  if (!a) return null;
  const why = d.logs.find((l) => l.action === "ORBYTE_CHECK" && l.text.includes(a.poId));
  const ok = can("approveAI") && a.open;
  const save = async () => { const out = await submit(() => act("resolvePayment", { alertId, note: f.note })); if (out.ok) closeModal(); };
  return (
    <Modal title={t("Check Orbyte payment {id}", { id: a.poId })} onClose={closeModal}
      foot={ok ? <><Cancel /><button className="btn btn-primary" disabled={saving} onClick={save}><Icon n="check" size={16} sw={2.2} /> {t("Mark as checked")}</button></> : <button className="btn btn-primary" onClick={closeModal}>{t("Close")}</button>}>
      <p className="muted" style={{ marginBottom: 12 }}>{t("Received {date}. StockNow did not guess, so stock for these items was not changed.", { date: when(a.at) })}</p>
      {why ? <div className="notice amber" style={{ marginBottom: 14 }}><Icon n="warning" size={16} /><span>{why.text}</span></div> : null}
      {ok ? (
        <div className="field">
          <label className="label" htmlFor="pay-note">{t("What did you find?")} <span className="req">*</span></label>
          <textarea className={`textarea ${err.note ? "error" : ""}`} id="pay-note" placeholder={t("e.g. Counted 3 on the shelf, recorded the stock out by hand.")} value={f.note} onChange={(e) => set("note", e.target.value)} />
          {err.note ? <FieldError msg={err.note} /> : <div className="hint">{t("Saved in the activity log. Record any stock change on Stock Out.")}</div>}
        </div>
      ) : <div className="notice blue"><Icon n="info" size={16} /><span>{a.open ? t("The Owner or a Manager closes this check.") : t("This check is closed.")}</span></div>}
    </Modal>
  );
}

function ProductModal({ id }) {
  const { d, act, closeModal, t } = useApp();
  const p = id ? productOf(d, id) : null;
  const { f, set, err, saving, submit } = useForm(p
    ? { name: p.name, sku: p.sku, cat: p.cat, cost: String(p.cost), sell: String(p.sell), min: String(p.min), sup: p.sup || "" }
    : { name: "", sku: "", cat: d.categories[0]?.id || "", cost: "", sell: "", min: "10", sup: d.suppliers[0]?.id || "" });
  const c = parseFloat(f.cost), s = parseFloat(f.sell);
  const save = async () => { const out = await submit(() => act("saveProduct", { ...f, id: p?.id })); if (out.ok) closeModal(); };
  const input = (k, label, props = {}, req = true) => (
    <div className={`field ${props.span ? "span2" : ""}`}>
      <label className="label" htmlFor={`p-${k}`}>{label} {req ? <span className="req">*</span> : null}</label>
      <input className={`input ${props.mono ? "mono" : ""} ${err[k] ? "error" : ""}`} id={`p-${k}`} value={f[k]} placeholder={props.placeholder} inputMode={props.inputMode}
        onChange={(e) => set(k, props.clean ? props.clean(e.target.value) : e.target.value)} />
      {props.hint && !err[k] ? <div className="hint">{props.hint}</div> : <FieldError msg={err[k]} />}
    </div>
  );
  return (
    <Modal title={t(p ? "Edit product" : "Create product")} onClose={closeModal} foot={<><Cancel /><button className="btn btn-primary" disabled={saving} onClick={save}>{t(p ? "Save changes" : "Create product")}</button></>}>
      <div className="grid2">
        {input("name", t("Product name"), { span: true, placeholder: t("e.g. Ribbed Knit Cardigan") })}
        {input("sku", "SKU", { mono: true, placeholder: "OUT-CRD", clean: (v) => v.toUpperCase() })}
        <div className="field"><label className="label" htmlFor="p-cat">{t("Category")} <span className="req">*</span></label><Select id="p-cat" value={f.cat} error={!!err.cat} onChange={(v) => set("cat", v)} options={d.categories.map((x) => [x.id, x.name])} /><FieldError msg={err.cat} /></div>
        {input("cost", t("Cost price (RM)"), { inputMode: "decimal", placeholder: "35.00", clean: (v) => v.replace(/[^0-9.]/g, "") })}
        {input("sell", t("Selling price (RM)"), { inputMode: "decimal", placeholder: "79.00", clean: (v) => v.replace(/[^0-9.]/g, ""), hint: c > 0 && s > 0 ? t("Margin {p}", { p: pct((s - c) / s) }) : t("Margin is calculated automatically.") })}
        {input("min", t("Minimum stock"), { inputMode: "numeric", clean: (v) => v.replace(/[^0-9]/g, ""), hint: t("Stock below this counts as urgent.") }, false)}
        <div className="field"><label className="label" htmlFor="p-sup">{t("Supplier")}</label><Select id="p-sup" value={f.sup} onChange={(v) => set("sup", v)} options={[["", t("No supplier")], ...d.suppliers.map((x) => [x.id, x.name])]} /></div>
        {p ? null : <div className="span2 hint">{t("New products start at 0 stock. StockNow needs 3 months of sales before it can forecast them.")}</div>}
      </div>
    </Modal>
  );
}

function CategoryModal({ id }) {
  const { d, act, closeModal, t } = useApp();
  const c = id ? d.categories.find((x) => x.id === id) : null;
  const { f, set, err, saving, submit } = useForm({ name: c?.name || "" });
  const save = async () => { const out = await submit(() => act("saveCategory", { id: c?.id, name: f.name })); if (out.ok) closeModal(); };
  return (
    <Modal title={t(c ? "Edit category" : "Add category")} size="sm" onClose={closeModal} foot={<><Cancel /><button className="btn btn-primary" disabled={saving} onClick={save}>{t("Save category")}</button></>}>
      <div className="field">
        <label className="label" htmlFor="c-name">{t("Category name")} <span className="req">*</span></label>
        <input className={`input ${err.name ? "error" : ""}`} id="c-name" autoFocus placeholder={t("e.g. Knitwear")} value={f.name} onChange={(e) => set("name", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        <FieldError msg={err.name} />
      </div>
    </Modal>
  );
}

function SupplierModal({ id }) {
  const { d, act, closeModal, t } = useApp();
  const s = id ? d.suppliers.find((x) => x.id === id) : null;
  const { f, set, err, saving, submit } = useForm(s ? { ...s, leadDays: String(s.leadDays) } : { name: "", contact: "", phone: "", leadDays: "5", note: "" });
  const save = async () => { const out = await submit(() => act("saveSupplier", { ...f, id: s?.id })); if (out.ok) closeModal(); };
  return (
    <Modal title={t(s ? "Edit supplier" : "Add supplier")} onClose={closeModal} foot={<><Cancel /><button className="btn btn-primary" disabled={saving} onClick={save}>{t(s ? "Save changes" : "Add supplier")}</button></>}>
      <div className="grid2">
        <div className="field span2"><label className="label" htmlFor="s-name">{t("Supplier name")} <span className="req">*</span></label><input className={`input ${err.name ? "error" : ""}`} id="s-name" value={f.name} onChange={(e) => set("name", e.target.value)} /><FieldError msg={err.name} /></div>
        <div className="field"><label className="label" htmlFor="s-contact">{t("Contact person")}</label><input className="input" id="s-contact" value={f.contact} onChange={(e) => set("contact", e.target.value)} /></div>
        <div className="field"><label className="label" htmlFor="s-phone">{t("Phone / WhatsApp")} <span className="req">*</span></label><input className={`input ${err.phone ? "error" : ""}`} id="s-phone" inputMode="tel" placeholder="+60 12-345 6789" value={f.phone} onChange={(e) => set("phone", e.target.value.replace(/[^0-9+ ()-]/g, ""))} />{err.phone ? <FieldError msg={err.phone} /> : <div className="hint">{t("At least 10 digits.")}</div>}</div>
        <div className="field"><label className="label" htmlFor="s-lead">{t("Delivery time (days)")} <span className="req">*</span></label><input className={`input ${err.leadDays ? "error" : ""}`} id="s-lead" inputMode="numeric" value={f.leadDays} onChange={(e) => set("leadDays", e.target.value.replace(/[^0-9]/g, ""))} />{err.leadDays ? <FieldError msg={err.leadDays} /> : <div className="hint">{t("Sets the expected date on orders.")}</div>}</div>
        <div className="field"><label className="label" htmlFor="s-note">{t("Note")}</label><input className="input" id="s-note" placeholder={t("What they supply")} value={f.note} onChange={(e) => set("note", e.target.value)} /></div>
      </div>
    </Modal>
  );
}

/* The roles the Owner can give, with what each one does. */
export const roleOptions = (t) => [["MANAGER", t("Manager")], ["STAFF_INVENTORY", t("Inventory staff")], ["STAFF_FINANCE", t("Finance staff")]];
const ROLE_HINT = {
  MANAGER: "Can approve plans and manage products, categories and suppliers.",
  STAFF_INVENTORY: "Records stock, receives deliveries and sends restock plans for approval.",
  STAFF_FINANCE: "Sees sales, the budget, supplier orders and approvals. Can't change stock.",
};

function GrantModal({ pid }) {
  const { d, act, closeModal, t } = useApp();
  const free = d.people.filter((u) => !u.role);
  const { f, set, err, saving, submit } = useForm({ pid: pid || free[0]?.id || "", role: "STAFF_INVENTORY" });
  const save = async () => { const out = await submit(() => act("grantAccess", f)); if (out.ok) closeModal(); };
  return (
    <Modal title={t("Give StockNow access")} size="sm" onClose={closeModal} foot={<><Cancel /><button className="btn btn-primary" disabled={saving} onClick={save}>{t("Give access")}</button></>}>
      <div className="field" style={{ marginBottom: 16 }}>
        <label className="label" htmlFor="g-p">{t("Person from Orbyte Directory")}</label>
        <Select id="g-p" value={f.pid} error={!!err.pid} onChange={(v) => set("pid", v)} options={free.map((u) => [u.id, `${u.name} · ${u.dept}`])} />
        <FieldError msg={err.pid} />
      </div>
      <div className="field">
        <label className="label" htmlFor="g-r">{t("Role in StockNow")}</label>
        <Select id="g-r" value={f.role} onChange={(v) => set("role", v)} options={roleOptions(t)} />
        <div className="hint">{t(ROLE_HINT[f.role])}</div>
      </div>
    </Modal>
  );
}

function ConfirmModal({ title, body, label, danger, onOk }) {
  const { closeModal, t } = useApp();
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="modal sm" role="alertdialog" aria-modal="true" aria-label={title} style={{ padding: 22 }}>
        <h2 className="card-title">{title}</h2>
        <p className="muted" style={{ marginTop: 8 }}>{body}</p>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 22 }}>
          <button className="btn btn-secondary" onClick={closeModal}>{t("Cancel")}</button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} autoFocus onClick={() => { closeModal(); onOk(); }}>{label}</button>
        </div>
      </div>
    </div>
  );
}


const MODALS = {
  send: SendModal, reject: RejectModal, budget: BudgetModal, message: MessageModal, posCreated: PosCreatedModal, product: ProductModal,
  category: CategoryModal, supplier: SupplierModal, grant: GrantModal, confirm: ConfirmModal, calc: CalcModal, payment: PaymentModal,
};


/* Visual restock calculation and complete worked formulas. */
/* "Show calculation": a visual summary first (decision + key numbers), then 9 numbered stages.
   Each stage shows its answer in plain words; the full math opens per stage or all at once. */







/* Line chart for "Forecast sales for the next 30 days" (unchanged). */
function ForecastChart({ s, fitted, lin, forecast, months, next }) {
  const { t } = useApp();
  const [on, setOn] = useState(null);
  const W = 560, H = 190, L = 40, Rm = 16, T = 14, B = 28, n = s.length;
  const trend = [...fitted, lin], top = Math.max(...s, ...trend, forecast, 1);
  const step = Math.pow(10, Math.floor(Math.log10(top))), nice = Math.ceil(top / step) * step;
  const ticks = [0, nice / 2, nice];
  const x = (i) => L + (i * (W - L - Rm)) / n, y = (v) => T + (1 - v / nice) * (H - T - B);
  const line = (vals) => vals.map((v, i) => `${i ? "L" : "M"} ${x(i)} ${y(v)}`).join(" ");
  const labels = [...months, next];
  const tip = on === null ? null : on < n ? `${labels[on]}: ${t("{n} sold", { n: s[on] })} · ${t("trend line")} ${Math.round(trend[on])}` : `${next}: ${t("forecast {n}", { n: forecast })}`;
  return (
    <div className="fc-chart">
      <div className="fc-legend">
        <span><i className="sw-line" /> {t("Sold")}</span>
        <span><i className="sw-dash" /> {t("Trend line")}</span>
        <span><i className="sw-dot" /> {t("Forecast")}</span>
        {tip ? <span className="fc-tip">{tip}</span> : null}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("Sales per month and the forecast for next month")} onMouseLeave={() => setOn(null)}>
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - Rm} y1={y(v)} y2={y(v)} className="fc-grid" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="fc-axis">{Math.round(v)}</text></g>)}
        {labels.map((m, i) => <text key={m + i} x={x(i)} y={H - 8} textAnchor="middle" className={`fc-axis ${i === n ? "fc-next" : ""}`}>{m}</text>)}
        {on !== null ? <line x1={x(on)} x2={x(on)} y1={T} y2={H - B} className="fc-cross" /> : null}
        <path d={line(trend)} className="fc-trend" />
        <path d={`M ${x(n - 1)} ${y(s[n - 1])} L ${x(n)} ${y(forecast)}`} className="fc-ahead" />
        <path d={line(s)} className="fc-sold" />
        {s.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="4" className="fc-pt" />)}
        <circle cx={x(n)} cy={y(forecast)} r="5.5" className="fc-fc" />
        <text x={x(n)} y={y(forecast) + 20} textAnchor="middle" className="fc-val">{forecast}</text>
        {labels.map((m, i) => <rect key={"h" + i} x={x(i) - (W - L - Rm) / n / 2} y={T} width={(W - L - Rm) / n} height={H - T - B} fill="transparent" onMouseEnter={() => setOn(i)} />)}
      </svg>
    </div>
  );
}

const Fm = ({ children }) => <div className="formula">{children}</div>;
const Note = ({ children }) => <p className="muted small">{children}</p>;
const B = ({ children }) => <b>{children}</b>;

function Stage({ k, open, onToggle, t, tone, title, value, plain, visual, children }) {
  return (
    <section className={`cs cs-${tone}`} aria-labelledby={`cs-h-${k}`}>
      <div className="cs-top">
        <span className="cs-n" aria-hidden="true">{k}</span>
        <div className="cs-title">
          <span className="eyebrow">{t("Step {n}", { n: k })}</span>
          <h4 id={`cs-h-${k}`}>{title}</h4>
        </div>
        {value != null ? <span className="cs-value num">{value}</span> : null}
      </div>
      {plain ? <p className="cs-plain">{plain}</p> : null}
      {visual}
      <button type="button" className="cs-toggle" aria-expanded={!!open} aria-controls={`cs-math-${k}`} onClick={() => onToggle(k)} data-testid={`button-calc-step-${k}`}>
        <Icon n="calc" size={14} /> {open ? t("Hide the math") : t("Show the math")}
        <Icon n={open ? "chevronUp" : "chevronDown"} size={14} />
      </button>
      {open ? <div className="cs-math" id={`cs-math-${k}`}>{children}</div> : null}
    </section>
  )
}

function CalcModal({ pid }) {
  const { d, ui, closeModal, t, days, lang } = useApp();
  const [open, setOpen] = useState({});
  const closeRef = useRef(closeModal);
  closeRef.current = closeModal;
  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = document.querySelector('[role="dialog"]');
    dialog?.querySelector("button")?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === "Tab" && dialog) {
        const controls = [...dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')]
          .filter((el) => !el.disabled && el.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  const r = ui.ai.result || analyse(d, budgetLeft(d)), i = r.items.find((x) => x.pid === pid);
  if (!i) return null;
  const g = i.g, f = g.f, s = g.series, n = s.length, M = d.settings.salesMonths.slice(-n).map((m) => monthName(lang, m));
  const ENGINE = configOf(d), win = Math.round(30 * ENGINE.sellWindow);
  const q = inPlan(i) ? i.qty : 0, sold = Math.min(q, i.sellable), sellWin = Math.round(g.forecast * ENGINE.sellWindow);
   const missPct = f.ym ? (f.rmse / f.ym) * 100 : 100;
  const raw = 97 - missPct * 2 - (g.trend === "Falling" ? 5 : 0) - (n < 6 ? 10 : 0);
  const pen = `${g.trend === "Falling" ? ` − 5 (${t("demand falling")})` : ""}${n < 6 ? ` − 10 (${t("under 6 months")})` : ""}`;
  const trend = t(g.trend).toLowerCase();
   const fullNeedProfit = Math.min(i.need, i.sellable) * i.sell - i.need * i.unitCost;
   const rules = [
    [t("Stock lasts {n}+ days (incl. on order)", { n: ENGINE.overstockDays }), days(g.coverAll), g.coverAll >= ENGINE.overstockDays],
    [t("Margin below {p}", { p: pct(ENGINE.lowMargin) }), pct(g.margin), g.margin < ENGINE.lowMargin],
    [t("Demand falling and stock at or above minimum"), `${trend} · ${t("{a} vs min {b}", { a: i.stock, b: i.min })}`, g.trend === "Falling" && i.stock >= i.min],
    [t("Nothing needed"), t("need {n}", { n: i.need }), i.need === 0],
     [t("Buying the full need would not make a profit"), rm2(fullNeedProfit), i.need > 0 && fullNeedProfit <= 0],
  ];
  const parts = [[t("Urgency: stock lasts {days}", { days: days(g.cover) }), g.cover < 7 ? 40 : g.cover < 14 ? 30 : g.cover < 30 ? 15 : 5], [t("Below minimum stock"), i.stock < i.min ? 10 : 0], [t("Out of stock"), i.stock === 0 ? 10 : 0],
    [`${t("Trend")}: ${trend}${g.trend === "Rising" ? ` (+${pct(g.growth)})` : ""}`, g.trend === "Rising" ? 10 + Math.min(15, g.growth * 15) : g.trend === "Falling" ? -10 : 0],
    [`${t("Margin")} ${pct(g.margin)} × 30`, g.margin * 30], [`${t("Confidence")} (${g.conf} − 50) ÷ 5`, (g.conf - 50) / 5]];
  const ranked = r.items.filter((x) => x.decision === "BUY").sort((a, b) => b.score - a.score), rank = ranked.findIndex((x) => x.pid === i.pid) + 1;
  const rawNeed = i.demandPlan + i.safety - i.stock - g.incoming;
  const hits = rules.filter((x) => x[2]).length;

  const kind = i.decision === "DO_NOT_BUY" ? "skip" : !inPlan(i) ? "wait" : i.qty < i.need ? "partial" : "buy";
  const verdict = {
    buy: ["cart", t("Buy"), t("Buy {n} pieces", { n: i.qty })],
    partial: ["cart", t("Buy, reduced by budget"), t("The budget covered {a} of the {b}.", { a: i.qty, b: i.need })],
    wait: ["pause", t("Buy, waiting for budget"), t("Not in this plan: the budget went to items with a higher priority (step 9).")],
    skip: ["ban", t("Don't buy"), t("Not bought because of a rule in step 6.")],
  }[kind];

  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const allOpen = ids.every((k) => open[k]);
  const toggleAll = () => setOpen(allOpen ? {} : Object.fromEntries(ids.map((k) => [k, true])));
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const flow = (items) => (
    <div className="cs-flow">{items.map(([v, l, cls], x) => typeof v === "string" && l === undefined
      ? <span key={x} className="cs-op" aria-hidden="true">{v}</span>
      : <span key={x} className={`cs-chip ${cls || ""}`}><b className="num">{v}</b><span>{l}</span></span>)}</div>
  );

  const months = (
    <div className="fc-table"><div className="eyebrow">{t("Pieces sold each month")}</div>
      <div className="scroll-x"><table className="mini"><thead><tr>{M.map((m) => <th key={m} className="right">{m}</th>)}</tr></thead><tbody><tr>{s.map((v, k) => <td key={k} className="right num bold">{v}</td>)}</tr></tbody></table></div></div>
  );

  return (
    <Modal title={t("How StockNow calculated: {name}", { name: i.name })} size="wide" onClose={closeModal} foot={<button className="btn btn-primary" onClick={closeModal}>{t("Close")}</button>}>
      <div className={`calc-hero ch-${kind}`}>
        <div className="ch-verdict">
          <span className="ch-ic"><Icon n={verdict[0]} size={22} /></span>
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <span className="eyebrow">{t("Decision:")}</span>
            <span className="ch-word">{verdict[1]}</span>
            <span className="small">{verdict[2]}</span>
          </div>
        </div>
        <div className="ch-metrics">
          <div className="ch-m m-blue"><span>{t("Next 30 days")}</span><b className="num">{t("{n} pieces", { n: g.forecast })}</b><em>{t(g.trend)}</em></div>
          <div className="ch-m m-mint"><span>{t("Stock runway")}</span><b className="num">{i.stock === 0 ? t("Empty now") : days(g.cover)}</b><em>{t("{n} in stock", { n: i.stock })}{g.incoming ? ` · ${t("{n} on order", { n: g.incoming })}` : ""}</em></div>
          <div className="ch-m m-sun"><span>{t("Expected gross profit")}</span><b className="num">{q ? rm(i.profit) : "—"}</b><em>{q ? `ROI ${pct(i.roi)}` : t("Nothing bought")}</em></div>
          <div className="ch-m m-lilac"><span>{t("Confidence")}</span><b className="num">{g.conf}%</b><em>{i.decision === "BUY" ? t("#{a} of {b}", { a: rank, b: ranked.length }) : t("Not ranked")}</em></div>
        </div>
      </div>

      <div className="calc-bar">
        <span className="muted small">{t("Plain answers first. Open any step to inspect the exact formula and numbers.")}</span>
        <button type="button" className="btn btn-secondary btn-sm" aria-pressed={allOpen} onClick={toggleAll} data-testid="button-calc-toggle-all">
          <Icon n="calc" size={14} /> {allOpen ? t("Hide all formulas") : t("Show all formulas")}
        </button>
      </div>

      <div className="cs-grid">
        <Stage k={1} open={!!open[1]} onToggle={toggle} t={t} tone="blue" title={t("Forecast sales for the next 30 days")} value={t("{n} pieces", { n: g.forecast })}
          plain={t("Two methods balance each other: the weighted average reacts to the latest months, the trend line follows the direction.")}
          visual={<ForecastChart s={s} fitted={f.fitted} lin={f.lin} forecast={g.forecast} months={M} next={t("Next")} />}>
          {months}
          <Fm>{t("Recent months count more")}: ({s[n - 1]}×3 + {s[n - 2]}×2 + {s[n - 3]}×1) ÷ 6 = <B>{f1(f.wma)}</B></Fm>
           <Fm>x = 0 … {n - 1}; x̄ = ({n} − 1) ÷ 2 = {(n - 1) / 2}; ȳ = ({s.join(" + ")}) ÷ {n} ≈ {f1(f.ym)}<br />{t("Trend line")}: slope = Σ((x − x̄)(y − ȳ)) ÷ Σ((x − x̄)²) ≈ <B>{f1(f.slope)}</B></Fm>
          <Fm>{t("Trend line: sales change {x} a month", { x: `${f.slope >= 0 ? "+" : "−"}${f1(Math.abs(f.slope))}` })} → {t("average")} {f1(f.ym)} + ({f1(f.slope)} × {f1(f.step)}) = <B>{f1(f.lin)}</B></Fm>
           <Fm>{t("Forecast")} = max(0, round({ENGINE.wmaWeight} × {f1(f.wma)} + {ENGINE.trendWeight} × {f1(f.lin)})) = <B>{t("{n} pieces", { n: g.forecast })}</B></Fm>
        </Stage>

        <Stage k={2} open={!!open[2]} onToggle={toggle} t={t} tone="mint" title={t("How long current stock lasts")} value={g.daily > 0 ? (i.stock === 0 ? t("already empty") : days(g.cover)) : t("no recent sales")}
          plain={g.daily > 0 ? t("{n} sold a day", { n: g.daily.toFixed(1) }) : t("No recent sales, so this stock never runs out.")}
          visual={g.daily > 0 ? <div className="cs-runway" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, g.cover === Infinity ? 1 : g.cover / 30)})` }} /></div> : null}>
          {g.daily > 0 ? <>
            <Fm>{g.forecast} ÷ 30 = <B>{t("{n} sold a day", { n: g.daily.toFixed(1) })}</B></Fm>
            <Fm>{t("{n} in stock", { n: i.stock })} ÷ {g.daily.toFixed(1)} = <B>{i.stock === 0 ? t("already empty") : days(g.cover)}</B>{g.incoming ? ` · ${t("with {n} on order: {days}", { n: g.incoming, days: days(g.coverAll) })}` : ""}</Fm>
          </> : <Note>{t("No recent sales, so this stock never runs out.")}</Note>}
        </Stage>

        <Stage k={3} open={!!open[3]} onToggle={toggle} t={t} tone="sun" title={t("Safety stock, in case sales jump")} value={i.safety}
           plain={t("Use the larger value.")}
           visual={flow([[i.min, t("Minimum")], ["↔"], [Math.ceil(g.forecast * ENGINE.safetyPct), `${pct(ENGINE.safetyPct)} × ${g.forecast}`], ["→"], [i.safety, t("Safety"), "fin"]])}>
          <Fm>{t("Larger of: minimum {min}, or {p} × {f} = {x}", { min: i.min, p: pct(ENGINE.safetyPct), f: g.forecast, x: Math.ceil(g.forecast * ENGINE.safetyPct) })} → <B>{i.safety}</B></Fm>
        </Stage>

        <Stage k={4} open={!!open[4]} onToggle={toggle} t={t} tone="lilac" title={t("How many to buy")} value={i.need}
          visual={flow([[i.demandPlan, t("Will sell")], ["+"], [i.safety, t("Safety")], ["−"], [i.stock, t("In stock")], ["−"], [g.incoming, t("On order")], ["="], [i.need, t("Needed"), "fin"], ...(inPlan(i) && i.qty !== i.need ? [["→"], [i.qty, t("In plan"), "fin"]] : [])])}>
          {g.trend === "Falling" ? <Fm>{t("Demand is falling, so plan only {p}", { p: pct(ENGINE.cautious) })}: {g.forecast} × {ENGINE.cautious} = <B>{i.demandPlan}</B></Fm> : null}
          <Fm>{t("{a} to sell + {b} safety − {c} in stock − {d} on order", { a: i.demandPlan, b: i.safety, c: i.stock, d: g.incoming })} = <B>{i.need}</B>{rawNeed < 0 ? ` (${t("{n} is below zero, so 0", { n: rawNeed })})` : ""}</Fm>
          {i.decision === "BUY" && inPlan(i) && i.qty < i.need ? <Note>{t("The budget covered {a} of the {b}.", { a: <b>{i.qty}</b>, b: i.need })}</Note> : null}
          {i.decision === "BUY" && !inPlan(i) ? <Note>{t("Not in this plan: the budget went to items with a higher priority (step 9).")}</Note> : null}
          {i.decision === "DO_NOT_BUY" ? <Note>{t("Not bought because of a rule in step 6.")}</Note> : null}
        </Stage>

        <Stage k={5} open={!!open[5]} onToggle={toggle} t={t} tone="mint" title={t("Margin: profit per piece")} value={pct(g.margin)} plain={t("{x} per piece", { x: rm2(i.sell - i.unitCost) })}
          visual={<div className="cs-split" aria-hidden="true"><i className="c" style={{ flexGrow: Math.max(0.01, 1 - g.margin) }}>{rm2(i.unitCost)}</i><i className="p" style={{ flexGrow: Math.max(0.01, g.margin) }}>{rm2(i.sell - i.unitCost)}</i></div>}>
          <Fm>({rm2(i.sell)} − {rm2(i.unitCost)}) ÷ {rm2(i.sell)} = <B>{pct(g.margin)}</B> · {t("{x} per piece", { x: rm2(i.sell - i.unitCost) })}</Fm>
        </Stage>

         <Stage k={6} open={!!open[6]} onToggle={toggle} t={t} tone={hits ? "red" : "mint"} title={t("Buy or not? Five rules")} value={hits ? t("Skip") : "OK"}
          visual={<div className="cs-rules">{rules.map(([k, , hit]) => <span key={k} className={hit ? "hit" : ""}><Icon n={hit ? "ban" : "check"} size={13} sw={2.4} />{k}</span>)}</div>}>
          <div className="scroll-x"><table className="mini"><thead><tr><th>{t("Skip if…")}</th><th>{t("This product")}</th><th>{t("Result")}</th></tr></thead>
            <tbody>{rules.map(([k, v, hit]) => <tr key={k}><td>{k}</td><td className="num">{v}</td><td>{hit ? <span className="chip chip-red">{t("Skip")}</span> : <span className="chip chip-green">OK</span>}</td></tr>)}</tbody></table></div>
          <div className="row" style={{ gap: 8 }}><span className="muted small">{t("Decision:")}</span>{i.decision === "DO_NOT_BUY" ? <span className="chip chip-red">{t("Don't buy")}</span> : inPlan(i) ? <span className="chip chip-green">{t("Buy")}</span> : <span className="chip chip-amber">{t("Buy, waiting for budget")}</span>}</div>
           <Fm>{t("Expected gross profit")} ({t("Needed")}) = min({i.need}, {i.sellable}) × {rm2(i.sell)} − {i.need} × {rm2(i.unitCost)} = <B>{rm2(fullNeedProfit)}</B></Fm>
        </Stage>

        <Stage k={7} open={!!open[7]} onToggle={toggle} t={t} tone="sun" title={t("Expected gross profit")} value={q ? rm(i.profit) : "—"}
          plain={q ? t("Pieces that might not sell within {n} days earn nothing in this estimate, so it stays on the safe side.", { n: win }) : null}
          visual={q ? flow([[rm(i.revenue), t("Revenue")], ["−"], [rm(i.cost), t("Cost")], ["="], [rm(i.profit), t("Gross profit"), "fin"]]) : null}>
          {q ? <>
            <Fm>{t("Can sell within {n} days", { n: win })}: {g.forecast} × {ENGINE.sellWindow} = {sellWin} − {t("{n} in stock", { n: i.stock })} − {t("{n} on order", { n: g.incoming })} = <B>{i.sellable}</B></Fm>
            <Fm>{t("Counted as sold: smaller of {a} bought and {b}", { a: q, b: i.sellable })} = <B>{sold}</B></Fm>
            <Fm>{t("Revenue")} {sold} × {rm2(i.sell)} = {rm(i.revenue)} · {t("Cost")} {q} × {rm2(i.unitCost)} = {rm(i.cost)}</Fm>
             <Fm>{t("Gross profit")} = max(0, {rm(i.revenue)} − {rm(i.cost)}) = <B>{rm(i.profit)}</B> · ROI {rm(i.profit)} ÷ {rm(i.cost)} = <B>{pct(i.roi)}</B></Fm>
            <Note>{t("Pieces that might not sell within {n} days earn nothing in this estimate, so it stays on the safe side.", { n: win })}</Note>
          </> : <Note>{i.decision === "DO_NOT_BUY" ? t("Nothing bought, so no profit counted. Cash already sitting in this stock: {a} × {b} = {c}.", { a: i.stock, b: rm2(i.unitCost), c: <b>{rm(i.stock * i.unitCost)}</b> }) : t("Nothing bought in this plan, so no profit counted.")}</Note>}
        </Stage>

        <Stage k={8} open={!!open[8]} onToggle={toggle} t={t} tone="blue" title={t("Confidence: how steady are the sales?")} value={`${g.conf}%`}
          plain={t("High confidence means the sales pattern is steady and easy to predict. It is not a promise of profit.")}
          visual={<div className="cs-gauge" aria-hidden="true"><i style={{ transform: `scaleX(${g.conf / 100})` }} /></div>}>
          <div className="scroll-x"><table className="mini"><thead><tr><th />{M.map((m) => <th key={m} className="right">{m}</th>)}</tr></thead><tbody>
            <tr><td className="muted">{t("Sold")}</td>{s.map((v, k) => <td key={k} className="right num">{v}</td>)}</tr>
            <tr><td className="muted">{t("Trend line")}</td>{f.fitted.map((v, k) => <td key={k} className="right num">{f1(v)}</td>)}</tr>
            <tr><td className="muted">{t("Miss")}</td>{s.map((v, k) => <td key={k} className="right num">{f1(Math.abs(v - f.fitted[k]))}</td>)}</tr>
          </tbody></table></div>
           <Fm>RMSE = √(Σ(({t("Sold")} − {t("Trend line")})²) ÷ {n}) ≈ <B>{f1(f.rmse)}</B><br />{t("Average miss (RMSE) = {a} pieces = {b}% of the average {c}", { a: f1(f.rmse), b: f1(missPct), c: f1(f.ym) })}</Fm>
           {!f.ym ? <Note>{t("With no average sales, a 100% miss is used so confidence stays cautious.")}</Note> : null}
          <Fm>97 − {f1(missPct)} × 2{pen} = {f1(raw)}{raw > 97 || raw < 55 ? ` (${t("kept between 55 and 97")})` : ""} → <B>{g.conf}%</B></Fm>
        </Stage>

        <Stage k={9} open={!!open[9]} onToggle={toggle} t={t} tone="lilac" title={t("Priority and budget")} value={i.decision === "BUY" ? i.score : "—"}
          plain={i.decision === "BUY" ? t("The budget is filled from the highest score down. {name} is {rank} items worth buying.", { name: i.short, rank: <b>{t("#{a} of {b}", { a: rank, b: ranked.length })}</b> }) : t("Not ranked: StockNow doesn't suggest buying this item.")}>
          {i.decision === "BUY" ? <>
            <div className="scroll-x"><table className="mini"><tbody>
              {parts.map(([k, v]) => <tr key={k}><td>{k}</td><td className="right num">{v >= 0 ? "+" : "−"}{f1(Math.abs(v))}</td></tr>)}
              <tr><td className="bold">{t("Priority score")}</td><td className="right num bold">{i.score}</td></tr>
            </tbody></table></div>
             <Fm>{t("Priority score")} = round({parts.map(([, v]) => f1(v)).join(" + ")}) = <B>{i.score}</B></Fm>
             <Note>{t("Initial budget allocation: affordable pieces = floor(remaining budget ÷ unit cost). A partial order needs at least max(5, ceil(25% × need)) pieces. Manual edits can change the final quantity.")}</Note>
          </> : <Note>{t("Not ranked: StockNow doesn't suggest buying this item.")}</Note>}
        </Stage>
      </div>
      <div className="notice blue" style={{ marginTop: 14 }}><Icon n="info" size={16} /><span>{t("Estimates from {n} months of sales. They don't know about promotions, festivals or competitors, and profit is before rent, wages and delivery. That's why a person approves every plan.", { n })}</span></div>
    </Modal>
  );
}
