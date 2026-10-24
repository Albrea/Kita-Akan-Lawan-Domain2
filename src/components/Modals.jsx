"use client";
import { useEffect, useRef, useState } from "react";
import { useApp, OFFLINE_MSG } from "./App.jsx";
import { routeText } from "./pages/AiRestock.jsx";
import { Bullets, FieldError, Icon, Modal, Select } from "./ui.jsx";
import {
  ENGINE, analyse, budgetLeft, inPlan, lateDays, nameOfP, overridesOf, poOf, poTotal, productOf, reqOf, summaryBullets, supName, userOf,
} from "@/lib/engine.js";
import { chaseMessage, orderMessage } from "@/lib/messages.js";
import { HORIZON, daysText, f1, fmtAt, plural, pct, rm, rm2, toJSON } from "@/lib/format.js";

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

const Cancel = () => { const { closeModal } = useApp(); return <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>; };

function SendModal() {
  const { d, ui, setAi, act, closeModal } = useApp();
  const r = ui.ai.result, t = r.t, s = ui.ai.summary;
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
    <Modal title="Send for approval" onClose={closeModal} foot={<><Cancel /><button className="btn btn-ai" disabled={saving} onClick={send}><Icon n="send" size={16} /> Send plan</button></>}>
      <Bullets items={summaryBullets(d, r).slice(0, 3)} style={{ marginBottom: 16 }} />
      <div className="scroll-x"><table>
        <thead><tr><th>Product</th><th className="right">Qty</th><th className="right">Cost</th><th className="right">Profit</th></tr></thead>
        <tbody>
          {t.buy.map((i) => <tr key={i.pid}><td>{i.name}</td><td className="right num">{i.qty}</td><td className="right num">{rm(i.cost)}</td><td className="right num" style={{ color: "var(--green-fg)" }}>{rm(i.profit)}</td></tr>)}
          <tr><td className="bold">Total</td><td /><td className="right bold num">{rm(t.cost)}</td><td className="right bold num" style={{ color: "var(--green-fg)" }}>{rm(t.profit)}</td></tr>
        </tbody>
      </table></div>
      <div className="field" style={{ marginTop: 16 }}>
        <label className="label" htmlFor="send-note">Note for the approver (optional)</label>
        <textarea className="textarea" id="send-note" placeholder="e.g. Hoodies keep selling out on weekends." value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="hint">{routeText(d)}</div>
    </Modal>
  );
}

function RejectModal({ reqId }) {
  const { d, act, closeModal } = useApp();
  const req = reqOf(d, reqId);
  const { f, set, err, saving, submit } = useForm({ note: "" });
  if (!req) return null;
  const save = async () => { const out = await submit(() => act("rejectAll", { reqId, note: f.note })); if (out.ok) closeModal(); };
  return (
    <Modal title={`Reject ${req.code}?`} size="sm" onClose={closeModal} foot={<><Cancel /><button className="btn btn-danger" disabled={saving} onClick={save}>Reject plan</button></>}>
      <p className="muted" style={{ marginBottom: 14 }}>{userOf(d, req.by).name} will see your reason and can send a new plan.</p>
      <div className="field">
        <label className="label" htmlFor="rej-note">Reason <span className="req">*</span></label>
        <textarea className={`textarea ${err.note ? "error" : ""}`} id="rej-note" placeholder="e.g. Hold purchases until the year-end sale results." value={f.note} onChange={(e) => set("note", e.target.value)} />
        <FieldError msg={err.note} />
      </div>
    </Modal>
  );
}

function BudgetModal() {
  const { d, act, closeModal } = useApp();
  const { f, set, err, saving, submit } = useForm({ budget: String(d.settings.monthlyBudget) });
  const save = async () => { const out = await submit(() => act("setMonthlyBudget", { budget: f.budget })); if (out.ok) closeModal(); };
  return (
    <Modal title="Monthly purchase budget" size="sm" onClose={closeModal} foot={<><Cancel /><button className="btn btn-primary" disabled={saving} onClick={save}>Save budget</button></>}>
      <div className="field">
        <label className="label" htmlFor="mb">Money set aside for buying stock each month (RM)</label>
        <input className={`input ${err.budget ? "error" : ""}`} id="mb" inputMode="numeric" autoFocus value={f.budget} onChange={(e) => set("budget", e.target.value.replace(/[^0-9]/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        {err.budget ? <FieldError msg={err.budget} /> : <div className="hint">Supplier orders and manual stock in use it up; stock returned to a supplier gives it back. Sales are revenue and don&apos;t refill it. AI plans with what&apos;s left, and drafts a plan automatically on day {d.settings.planDay}. StockNow never moves real money.</div>}
      </div>
    </Modal>
  );
}

/* AI drafts the WhatsApp text (Gemini, or the template); a person sends it. Opening WhatsApp counts as sending. */
function MessageModal({ poId, msgKind }) {
  const { d, me, act, closeModal, go, offline, toast } = useApp();
  const po = poOf(d, poId);
  const kind = msgKind === "chase" ? "chase" : "order";
  const [text, setText] = useState(() => (po ? (kind === "order" ? orderMessage(d, po, me.name) : chaseMessage(d, po, me.name)) : ""));
  const [source, setSource] = useState(offline ? "offline" : "loading");
  const edited = useRef(false);
  const area = useRef(null);

  useEffect(() => {
    if (offline || !po) return;
    let live = true;
    fetch("/api/ai/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: toJSON({ poId, kind, actorId: me.id }) })
      .then((r) => r.json())
      .then((out) => { if (!live) return; if (out.text && !edited.current) setText(out.text); setSource(out.source || "template"); })
      .catch(() => live && setSource("template"));
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!po) return null;
  async function markSent() {
    if (offline) return toast(OFFLINE_MSG, true);
    const out = await act("markSent", { poId, kind });
    if (out.ok) { closeModal(); go("stock-in", { stockInTab: "orders" }); }
  }
  function openWhatsApp(e) {
    e.preventDefault();
    if (offline) return toast(OFFLINE_MSG, true);
    try { window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener"); } catch {}
    markSent();
  }
  function copy() {
    const fallback = () => { area.current?.focus(); area.current?.select(); toast("Text selected. Press Ctrl+C to copy."); };
    try { navigator.clipboard.writeText(text).then(() => toast("Message copied"), fallback); } catch { fallback(); }
  }
  const chip = source === "loading" ? "Gemini is writing…" : source === "gemini" ? "Written by Gemini" : source === "offline" ? "Offline: template" : "Template (Gemini off)";
  return (
    <Modal title={kind === "order" ? `Send ${po.code} to ${supName(d, po.sup)}` : `Remind ${supName(d, po.sup)}`} onClose={closeModal}
      foot={<><Cancel /><button className="btn btn-primary" onClick={markSent}><Icon n="check" size={16} sw={2.2} /> Mark as sent</button></>}>
      <div className="row wrap" style={{ justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <p className="muted" style={{ flex: 1, minWidth: 220 }}>{kind === "order" ? "AI wrote this from the approved order. Edit it if you like, then send it on WhatsApp." : `${po.code} is ${lateDays(po)} days late. AI drafted a polite reminder.`}</p>
        <span className="chip chip-ai"><Icon n="bot" size={12} /> {chip}</span>
      </div>
      <textarea ref={area} className="textarea" rows={10} aria-label="Message" value={text} onChange={(e) => { edited.current = true; setText(e.target.value); }} />
      <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={copy}><Icon n="copy" size={14} /> Copy text</button>
        <a className="btn btn-secondary btn-sm" href={"https://wa.me/?text=" + encodeURIComponent(text)} target="_blank" rel="noopener noreferrer" onClick={openWhatsApp}><Icon n="message" size={14} /> Open in WhatsApp</a>
      </div>
      <div className="hint">Nothing is sent automatically. Opening WhatsApp (or Mark as sent, if you copied the text) records it and takes you to Supplier orders.</div>
    </Modal>
  );
}

function PosCreatedModal({ reqId }) {
  const { d, closeModal, openModal, go } = useApp();
  const req = reqOf(d, reqId);
  if (!req) return null;
  const pos = (req.poIds || []).map((id) => poOf(d, id)).filter(Boolean);
  return (
    <Modal title={`${plural(pos.length, "supplier order")} created`} onClose={closeModal}
      foot={<button className="btn btn-secondary" onClick={() => { closeModal(); go("stock-in", { stockInTab: "orders" }); }}>Go to supplier orders</button>}>
      <p className="muted" style={{ marginBottom: 12 }}>{req.code} is approved. Budget left this month: <b>{rm(budgetLeft(d))}</b>. Stock goes up only when the delivery is received.</p>
      {pos.map((po) => (
        <div key={po.id} className="row" style={{ padding: "12px 0", borderTop: "1px solid var(--divider)", flexWrap: "wrap" }}>
          <div className="stack" style={{ flex: 1, minWidth: 200 }}>
            <span className="bold"><span className="mono">{po.code}</span> · {supName(d, po.sup)}</span>
            <span className="muted small">{po.items.map((i) => `${i.qty} × ${nameOfP(d, i.pid)}`).join(", ")} · {rm(poTotal(po))} · expected {fmtAt(po.expectedAt)}</span>
          </div>
          {po.sentAt ? <span className="chip chip-green">Sent</span> : <button className="btn btn-primary btn-sm" onClick={() => openModal("message", { poId: po.id, msgKind: "order" })}><Icon n="send" size={14} /> Send order</button>}
        </div>
      ))}
    </Modal>
  );
}

function ProductModal({ id }) {
  const { d, act, closeModal } = useApp();
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
    <Modal title={p ? "Edit product" : "Create product"} onClose={closeModal} foot={<><Cancel /><button className="btn btn-primary" disabled={saving} onClick={save}>{p ? "Save changes" : "Create product"}</button></>}>
      <div className="grid2">
        {input("name", "Product name", { span: true, placeholder: "e.g. Ribbed Knit Cardigan" })}
        {input("sku", "SKU", { mono: true, placeholder: "OUT-CRD", clean: (v) => v.toUpperCase() })}
        <div className="field"><label className="label" htmlFor="p-cat">Category <span className="req">*</span></label><Select id="p-cat" value={f.cat} error={!!err.cat} onChange={(v) => set("cat", v)} options={d.categories.map((x) => [x.id, x.name])} /><FieldError msg={err.cat} /></div>
        {input("cost", "Cost price (RM)", { inputMode: "decimal", placeholder: "35.00", clean: (v) => v.replace(/[^0-9.]/g, "") })}
        {input("sell", "Selling price (RM)", { inputMode: "decimal", placeholder: "79.00", clean: (v) => v.replace(/[^0-9.]/g, ""), hint: c > 0 && s > 0 ? `Margin ${pct((s - c) / s)}` : "Margin is calculated automatically." })}
        {input("min", "Minimum stock", { inputMode: "numeric", clean: (v) => v.replace(/[^0-9]/g, ""), hint: "AI treats stock below this as urgent." }, false)}
        <div className="field"><label className="label" htmlFor="p-sup">Supplier</label><Select id="p-sup" value={f.sup} onChange={(v) => set("sup", v)} options={[["", "No supplier"], ...d.suppliers.map((x) => [x.id, x.name])]} /></div>
        {p ? null : <div className="span2 hint">New products start at 0 stock. AI needs 3 months of sales before it can forecast them.</div>}
      </div>
    </Modal>
  );
}

function CategoryModal({ id }) {
  const { d, act, closeModal } = useApp();
  const c = id ? d.categories.find((x) => x.id === id) : null;
  const { f, set, err, saving, submit } = useForm({ name: c?.name || "" });
  const save = async () => { const out = await submit(() => act("saveCategory", { id: c?.id, name: f.name })); if (out.ok) closeModal(); };
  return (
    <Modal title={c ? "Edit category" : "Add category"} size="sm" onClose={closeModal} foot={<><Cancel /><button className="btn btn-primary" disabled={saving} onClick={save}>Save category</button></>}>
      <div className="field">
        <label className="label" htmlFor="c-name">Category name <span className="req">*</span></label>
        <input className={`input ${err.name ? "error" : ""}`} id="c-name" autoFocus placeholder="e.g. Knitwear" value={f.name} onChange={(e) => set("name", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        <FieldError msg={err.name} />
      </div>
    </Modal>
  );
}

function SupplierModal({ id }) {
  const { d, act, closeModal } = useApp();
  const s = id ? d.suppliers.find((x) => x.id === id) : null;
  const { f, set, err, saving, submit } = useForm(s ? { ...s, leadDays: String(s.leadDays) } : { name: "", contact: "", phone: "", leadDays: "5", note: "" });
  const save = async () => { const out = await submit(() => act("saveSupplier", { ...f, id: s?.id })); if (out.ok) closeModal(); };
  return (
    <Modal title={s ? "Edit supplier" : "Add supplier"} onClose={closeModal} foot={<><Cancel /><button className="btn btn-primary" disabled={saving} onClick={save}>{s ? "Save changes" : "Add supplier"}</button></>}>
      <div className="grid2">
        <div className="field span2"><label className="label" htmlFor="s-name">Supplier name <span className="req">*</span></label><input className={`input ${err.name ? "error" : ""}`} id="s-name" value={f.name} onChange={(e) => set("name", e.target.value)} /><FieldError msg={err.name} /></div>
        <div className="field"><label className="label" htmlFor="s-contact">Contact person</label><input className="input" id="s-contact" value={f.contact} onChange={(e) => set("contact", e.target.value)} /></div>
        <div className="field"><label className="label" htmlFor="s-phone">Phone / WhatsApp <span className="req">*</span></label><input className={`input ${err.phone ? "error" : ""}`} id="s-phone" inputMode="tel" placeholder="+60 12-345 6789" value={f.phone} onChange={(e) => set("phone", e.target.value.replace(/[^0-9+ ()-]/g, ""))} />{err.phone ? <FieldError msg={err.phone} /> : <div className="hint">At least 10 digits.</div>}</div>
        <div className="field"><label className="label" htmlFor="s-lead">Delivery time (days) <span className="req">*</span></label><input className={`input ${err.leadDays ? "error" : ""}`} id="s-lead" inputMode="numeric" value={f.leadDays} onChange={(e) => set("leadDays", e.target.value.replace(/[^0-9]/g, ""))} />{err.leadDays ? <FieldError msg={err.leadDays} /> : <div className="hint">Sets the expected date on orders.</div>}</div>
        <div className="field"><label className="label" htmlFor="s-note">Note</label><input className="input" id="s-note" placeholder="What they supply" value={f.note} onChange={(e) => set("note", e.target.value)} /></div>
      </div>
    </Modal>
  );
}

function GrantModal({ pid }) {
  const { d, act, closeModal } = useApp();
  const free = d.people.filter((u) => !u.role);
  const { f, set, err, saving, submit } = useForm({ pid: pid || free[0]?.id || "", role: "STAFF" });
  const save = async () => { const out = await submit(() => act("grantAccess", f)); if (out.ok) closeModal(); };
  return (
    <Modal title="Give StockNow access" size="sm" onClose={closeModal} foot={<><Cancel /><button className="btn btn-primary" disabled={saving} onClick={save}>Give access</button></>}>
      <div className="field" style={{ marginBottom: 16 }}>
        <label className="label" htmlFor="g-p">Person from Orbyte Directory</label>
        <Select id="g-p" value={f.pid} error={!!err.pid} onChange={(v) => set("pid", v)} options={free.map((u) => [u.id, `${u.name} · ${u.dept}`])} />
        <FieldError msg={err.pid} />
      </div>
      <div className="field">
        <label className="label" htmlFor="g-r">Role in StockNow</label>
        <Select id="g-r" value={f.role} onChange={(v) => set("role", v)} options={[["STAFF", "Staff"], ["MANAGER", "Manager"]]} />
        <div className="hint">{f.role === "MANAGER" ? "Can approve plans and manage products, categories and suppliers." : "Can record stock and send AI plans for approval."}</div>
      </div>
    </Modal>
  );
}

function ConfirmModal({ title, body, label, danger, onOk }) {
  const { closeModal } = useApp();
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="modal sm" role="alertdialog" aria-modal="true" aria-label={title} style={{ padding: 22 }}>
        <h2 className="card-title">{title}</h2>
        <p className="muted" style={{ marginTop: 8 }}>{body}</p>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 22 }}>
          <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} autoFocus onClick={() => { closeModal(); onOk(); }}>{label}</button>
        </div>
      </div>
    </div>
  );
}

/* "Show calculation": every step of the AI's math for one product, with its real numbers. */
function CalcModal({ pid }) {
  const { d, ui, closeModal } = useApp();
  const r = ui.ai.result || analyse(d, budgetLeft(d)), i = r.items.find((x) => x.pid === pid);
  if (!i) return null;
  const g = i.g, f = g.f, s = g.series, n = s.length, M = d.settings.salesMonths.slice(-n);
  const q = inPlan(i) ? i.qty : 0, sold = Math.min(q, i.sellable), sellWin = Math.round(g.forecast * ENGINE.sellWindow);
  const missPct = f.ym ? (f.rmse / f.ym) * 100 : 0;
  const raw = 97 - missPct * 2 - (g.trend === "Falling" ? 5 : 0) - (n < 6 ? 10 : 0);
  const pen = `${g.trend === "Falling" ? " − 5 (demand falling)" : ""}${n < 6 ? " − 10 (under 6 months)" : ""}`;
  const rules = [
    ["Stock lasts 45+ days (incl. on order)", daysText(g.coverAll), g.coverAll >= ENGINE.overstockDays],
    ["Margin below 25%", pct(g.margin), g.margin < ENGINE.lowMargin],
    ["Demand falling and stock at or above minimum", `${g.trend.toLowerCase()} · ${i.stock} vs min ${i.min}`, g.trend === "Falling" && i.stock >= i.min],
    ["Nothing needed", `need ${i.need}`, i.need === 0],
  ];
  const parts = [[`Urgency: stock lasts ${daysText(g.cover)}`, g.cover < 7 ? 40 : g.cover < 14 ? 30 : g.cover < 30 ? 15 : 5], ["Below minimum stock", i.stock < i.min ? 10 : 0], ["Out of stock", i.stock === 0 ? 10 : 0],
    [`Trend: ${g.trend.toLowerCase()}${g.trend === "Rising" ? ` (+${pct(g.growth)})` : ""}`, g.trend === "Rising" ? 10 + Math.min(15, g.growth * 15) : g.trend === "Falling" ? -10 : 0],
    [`Margin ${pct(g.margin)} × 30`, g.margin * 30], [`Confidence (${g.conf} − 50) ÷ 5`, (g.conf - 50) / 5]];
  const ranked = r.items.filter((x) => x.decision === "BUY").sort((a, b) => b.score - a.score), rank = ranked.findIndex((x) => x.pid === i.pid) + 1;
  const rawNeed = i.demandPlan + i.safety - i.stock - g.incoming;
  const Step = ({ k, title, children }) => <div className="calc-step"><span className="calc-n">{k}</span><div className="stack" style={{ gap: 6, minWidth: 0 }}><h4>{title}</h4>{children}</div></div>;
  const Fm = ({ children }) => <div className="formula">{children}</div>;
  const Note = ({ children }) => <p className="muted small">{children}</p>;
  const B = ({ children }) => <b>{children}</b>;
  const months = (
    <div className="scroll-x"><table className="mini"><thead><tr>{M.map((m) => <th key={m} className="right">{m}</th>)}</tr></thead><tbody><tr>{s.map((v, k) => <td key={k} className="right num">{v}</td>)}</tr></tbody></table></div>
  );
  return (
    <Modal title={`How AI calculated: ${i.name}`} size="wide" onClose={closeModal} foot={<button className="btn btn-primary" onClick={closeModal}>Close</button>}>
      <Step k={1} title={`Forecast sales for ${HORIZON}`}>
        {months}
        <Fm>Recent months count more: ({s[n - 1]}×3 + {s[n - 2]}×2 + {s[n - 3]}×1) ÷ 6 = <B>{f1(f.wma)}</B></Fm>
        <Fm>Trend line: sales change {f.slope >= 0 ? "+" : "−"}{f1(Math.abs(f.slope))} a month → average {f1(f.ym)} + ({f1(f.slope)} × {f1(f.step)}) = <B>{f1(f.lin)}</B></Fm>
        <Fm>Forecast = ({f1(f.wma)} + {f1(f.lin)}) ÷ 2 = <B>{g.forecast} pieces</B></Fm>
        <Note>Two methods balance each other: the weighted average reacts to the latest months, the trend line follows the direction.</Note>
      </Step>
      <Step k={2} title="How long current stock lasts">
        {g.daily > 0 ? <>
          <Fm>{g.forecast} ÷ 30 days = <B>{g.daily.toFixed(1)} sold a day</B></Fm>
          <Fm>{i.stock} in stock ÷ {g.daily.toFixed(1)} = <B>{i.stock === 0 ? "already empty" : daysText(g.cover)}</B>{g.incoming ? ` · with ${g.incoming} on order: ${daysText(g.coverAll)}` : ""}</Fm>
        </> : <Note>No recent sales, so this stock never runs out.</Note>}
      </Step>
      <Step k={3} title="Safety stock, in case sales jump"><Fm>Larger of: minimum {i.min}, or 20% × {g.forecast} = {Math.ceil(g.forecast * ENGINE.safetyPct)} → <B>{i.safety}</B></Fm></Step>
      <Step k={4} title="How many to buy">
        {g.trend === "Falling" ? <Fm>Demand is falling, so plan only 70%: {g.forecast} × 0.7 = <B>{i.demandPlan}</B></Fm> : null}
        <Fm>{i.demandPlan} to sell + {i.safety} safety − {i.stock} in stock − {g.incoming} on order = <B>{i.need}</B>{rawNeed < 0 ? ` (${rawNeed} is below zero, so 0)` : ""}</Fm>
        {i.decision === "BUY" && inPlan(i) && i.qty < i.need ? <Note>The budget covered <b>{i.qty}</b> of the {i.need}.</Note> : null}
        {i.decision === "BUY" && !inPlan(i) ? <Note>Not in this plan: the budget went to items with a higher priority (step 9).</Note> : null}
        {i.decision === "DO_NOT_BUY" ? <Note>Not bought because of a rule in step 6.</Note> : null}
      </Step>
      <Step k={5} title="Margin: profit per piece"><Fm>({rm2(i.sell)} − {rm2(i.unitCost)}) ÷ {rm2(i.sell)} = <B>{pct(g.margin)}</B> · {rm2(i.sell - i.unitCost)} per piece</Fm></Step>
      <Step k={6} title="Buy or not? Four rules">
        <div className="scroll-x"><table className="mini"><thead><tr><th>Skip if…</th><th>This product</th><th>Result</th></tr></thead>
          <tbody>{rules.map(([k, v, hit]) => <tr key={k}><td>{k}</td><td className="num">{v}</td><td>{hit ? <span className="chip chip-red">Skip</span> : <span className="chip chip-green">OK</span>}</td></tr>)}</tbody></table></div>
        <div className="row" style={{ gap: 8 }}><span className="muted small">Decision:</span>{i.decision === "DO_NOT_BUY" ? <span className="chip chip-red">Don&apos;t buy</span> : inPlan(i) ? <span className="chip chip-green">Buy</span> : <span className="chip chip-amber">Buy, waiting for budget</span>}</div>
      </Step>
      <Step k={7} title="Expected gross profit">
        {q ? <>
          <Fm>Can sell within 45 days: {g.forecast} × 1.5 = {sellWin} − {i.stock} in stock − {g.incoming} on order = <B>{i.sellable}</B></Fm>
          <Fm>Counted as sold: smaller of {q} bought and {i.sellable} = <B>{sold}</B></Fm>
          <Fm>Revenue {sold} × {rm2(i.sell)} = {rm(i.revenue)} · Cost {q} × {rm2(i.unitCost)} = {rm(i.cost)}</Fm>
          <Fm>Gross profit {rm(i.revenue)} − {rm(i.cost)} = <B>{rm(i.profit)}</B> · ROI {rm(i.profit)} ÷ {rm(i.cost)} = <B>{pct(i.roi)}</B></Fm>
          <Note>Pieces that might not sell within 45 days earn nothing in this estimate, so it stays on the safe side.</Note>
        </> : <Note>{i.decision === "DO_NOT_BUY" ? <>Nothing bought, so no profit counted. Cash already sitting in this stock: {i.stock} × {rm2(i.unitCost)} = <b>{rm(i.stock * i.unitCost)}</b>.</> : "Nothing bought in this plan, so no profit counted."}</Note>}
      </Step>
      <Step k={8} title="Confidence: how steady are the sales?">
        <div className="scroll-x"><table className="mini"><thead><tr><th />{M.map((m) => <th key={m} className="right">{m}</th>)}</tr></thead><tbody>
          <tr><td className="muted">Sold</td>{s.map((v, k) => <td key={k} className="right num">{v}</td>)}</tr>
          <tr><td className="muted">Trend line</td>{f.fitted.map((v, k) => <td key={k} className="right num">{f1(v)}</td>)}</tr>
          <tr><td className="muted">Miss</td>{s.map((v, k) => <td key={k} className="right num">{f1(Math.abs(v - f.fitted[k]))}</td>)}</tr>
        </tbody></table></div>
        <Fm>Average miss (RMSE) = {f1(f.rmse)} pieces = {f1(missPct)}% of the average {f1(f.ym)}</Fm>
        <Fm>97 − {f1(missPct)} × 2{pen} = {f1(raw)}{raw > 97 || raw < 55 ? " (kept between 55 and 97)" : ""} → <B>{g.conf}%</B></Fm>
        <Note>High confidence means the sales pattern is steady and easy to predict. It is not a promise of profit.</Note>
      </Step>
      <Step k={9} title="Priority and budget">
        {i.decision === "BUY" ? <>
          <div className="scroll-x"><table className="mini"><tbody>
            {parts.map(([k, v]) => <tr key={k}><td>{k}</td><td className="right num">{v >= 0 ? "+" : "−"}{f1(Math.abs(v))}</td></tr>)}
            <tr><td className="bold">Priority score</td><td className="right num bold">{i.score}</td></tr>
          </tbody></table></div>
          <Note>The budget is filled from the highest score down. {i.short} is <b>#{rank} of {ranked.length}</b> items worth buying.</Note>
        </> : <Note>Not ranked: AI doesn&apos;t buy this item.</Note>}
      </Step>
      <div className="notice blue" style={{ marginTop: 14 }}><Icon n="info" size={16} /><span>Estimates from {n} months of sales. They don&apos;t know about promotions, festivals or competitors, and profit is before rent, wages and delivery. That&apos;s why a person approves every plan.</span></div>
    </Modal>
  );
}

const MODALS = {
  send: SendModal, reject: RejectModal, budget: BudgetModal, message: MessageModal, posCreated: PosCreatedModal, product: ProductModal,
  category: CategoryModal, supplier: SupplierModal, grant: GrantModal, confirm: ConfirmModal, calc: CalcModal,
};
