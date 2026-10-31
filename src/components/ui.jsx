"use client";
/* Small shared UI pieces: icons, chips, selects, empty states, modal shell, sparkline. */
import {
  Activity, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Ban, Bell, Bot, Calculator, Check, ChevronDown, ChevronRight, ChevronUp,
  Circle, CirclePause, ClipboardCheck, Clock, Coins, Copy, Database, Info, LayoutGrid, Link2, Menu, MessageSquare, Minus, Package, Pencil,
  Plus, Receipt, Search, Send, ShoppingCart, SlidersHorizontal, Sparkles, Store, Tag, Target, Trash2, TrendingDown, TrendingUp,
  TriangleAlert, Truck, Undo2, Users, Wallet, WifiOff, X, Languages, Lock, Download, Calendar,
} from "lucide-react";
import { useState } from "react";
import { useApp } from "./App.jsx";
import { lateDays, poOf } from "@/lib/engine.js";
import { ROLE_LABEL, deptOf, roleLabel } from "@/lib/actions.js";

const ICONS = {
  grid: LayoutGrid, spark: Sparkles, approve: ClipboardCheck, box: Package, in: ArrowDownToLine, out: ArrowUpFromLine, store: Store,
  activity: Activity, users: Users, settings: SlidersHorizontal, search: Search, chevronDown: ChevronDown, chevronUp: ChevronUp,
  chevronRight: ChevronRight, plus: Plus, minus: Minus, pencil: Pencil, trash: Trash2, close: X, check: Check, info: Info,
  warning: TriangleAlert, send: Send, bot: Bot, truck: Truck, wallet: Wallet, coins: Coins, up: TrendingUp, down: TrendingDown,
  menu: Menu, message: MessageSquare, swap: ArrowLeftRight, dot: Circle, link: Link2, cart: ShoppingCart, pause: CirclePause, ban: Ban,
  receipt: Receipt, tag: Tag, bell: Bell, clock: Clock, calc: Calculator, target: Target, offline: WifiOff, database: Database, copy: Copy, undo: Undo2, lang: Languages, lock: Lock, download: Download, calendar: Calendar,
};

export function Icon({ n, size = 18, sw = 1.8, style }) {
  const C = ICONS[n] || Circle;
  return <C size={size} strokeWidth={sw} aria-hidden="true" style={style} />;
}

const TONE = {
  red: ["var(--red-bg)", "var(--red-fg)"], amber: ["var(--amber-bg)", "var(--amber-fg)"], blue: ["var(--blue-bg)", "var(--blue-fg)"],
  ai: ["var(--ai-bg)", "var(--ai)"], green: ["var(--green-bg)", "var(--green-fg)"], grey: ["var(--grey-bg)", "var(--grey-fg)"],
};
export function DotIc({ ic, tone, size = 16, box }) {
  const [bg, fg] = TONE[tone] || TONE.grey;
  return (
    <span className="dot-ic" style={{ background: bg, color: fg, ...(box ? { width: box, height: box } : {}) }}>
      <Icon n={ic} size={size} />
    </span>
  );
}

/* Turns **bold** markers from the engine into <strong>. */
export function Md({ text }) {
  return String(text || "").split(/(\*\*.+?\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>);
}

export function Select({ id, value, onChange, options, cls = "", error = false, label, disabled }) {
  return (
    <div className={`select-wrap ${cls} ${error ? "error" : ""}`}>
      <select className="select" id={id} value={value} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <Icon n="chevronDown" size={16} sw={1.9} />
    </div>
  );
}

export function Empty({ title, text, ic = "search" }) {
  return (
    <div className="empty">
      <Icon n={ic} size={34} sw={1.4} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

export const FieldError = ({ msg }) => (msg ? <div className="hint err">{msg}</div> : null);

/* Role chip. Pass `user` to show Staff with their department ("Inventory staff", "Finance staff"). */
export function RoleChip({ role, user }) {
  const { t } = useApp();
  const r = user?.role || role;
  const cls = r === "OWNER" ? "chip-blue" : r === "MANAGER" || r === "SYSTEM" ? "chip-ai" : user && deptOf(user) === "FINANCE" ? "chip-amber" : "chip-grey";
  return <span className={`chip ${cls}`}>{user ? t(roleLabel(user)) : ROLE_LABEL[r] ? t(ROLE_LABEL[r]) : r}</span>;
}

export function ReqChip({ status }) {
  const { t } = useApp();
  const m = { PENDING: ["chip-amber", "Waiting for approval"], APPROVED: ["chip-green", "Approved"], PARTIAL: ["chip-green", "Partly approved"], REJECTED: ["chip-red", "Rejected"] }[status];
  return m ? <span className={`chip ${m[0]}`}>{t(m[1])}</span> : null;
}

export function PoChip({ po }) {
  const { t, tp, day } = useApp();
  if (po.status === "RECEIVED") return <span className="chip chip-green">{t("Received")}</span>;
  const late = lateDays(po);
  if (late) return <span className="chip chip-red">{tp(late, "{n} day late", "{n} days late")}</span>;
  if (!po.sentAt) return <span className="chip chip-amber">{t("Not sent yet")}</span>;
  if (po.status === "PARTIAL") return <span className="chip chip-amber">{t("Partly received")}</span>;
  return <span className="chip chip-blue">{t("Expected {date}", { date: day(po.expectedAt) })}</span>;
}

/* Where written text came from, in plain words. The technical detail (the Gemini model, or why the
   standard wording was used: no key, no answer, or the number check) is in the hover text. */
export function AiSourceChip({ s, long = false }) {
  const { t, offline } = useApp();
  const [cls, label] = !s || s.loading ? ["chip-ai", "Writing…"]
    : s.source === "gemini" ? ["chip-ai", long ? "Written from these numbers" : "Written for you"]
      : offline || s.source === "offline" ? ["chip-amber", "Offline: standard wording"]
        : ["chip-amber", "Standard wording"];
  const why = s?.reason === "prototype" ? "Prototype: the writing help is simulated." : s?.reason === "no_key" ? "Writing help is not set up (Settings → Smart features)." : s?.reason === "numbers" ? "The written text used a number StockNow didn't calculate, so standard wording is shown." : "";
  return <span className={`chip ${cls}`} title={[s?.note, why].filter(Boolean).join(" · ")}><Icon n="message" size={12} /> {t(label)}</span>;
}

/* A supplier order code that opens it on Stock In (highlighted there). */
export function PoLink({ po }) {
  const { go, can, t } = useApp();
  if (po.status === "RECEIVED" || !can("stock")) return <span className="mono">{po.code}</span>; // Finance staff don't open Stock In
  return <button className="btn-link mono po-link" title={t("Open on Stock In")} onClick={() => go("stock-in", { stockInTab: "orders", focusPo: po.id })}>{po.code}</button>;
}

export function PoCell({ d, ids }) {
  const pos = (ids || []).map((id) => poOf(d, id)).filter(Boolean);
  if (!pos.length) return <span className="faint">—</span>;
  return pos.map((po) => (
    <div key={po.id} className="row" style={{ gap: 6, margin: "2px 0", flexWrap: "wrap" }}>
      <PoLink po={po} />
      <PoChip po={po} />
    </div>
  ));
}

export function Modal({ title, children, foot, size = "", onClose }) {
  const { t } = useApp();
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2 className="card-title">{title}</h2>
          <button className="icon-btn" aria-label={t("Close")} onClick={onClose}><Icon n="close" size={20} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {foot ? <div className="modal-foot">{foot}</div> : null}
      </div>
    </div>
  );
}

/* Sales history with the forecast as a dashed purple point. */
export function Spark({ s, pred, w = 150, h = 40 }) {
  const all = [...s, pred], max = Math.max(...all, 1);
  const x = (i) => 3 + i * ((w - 8) / (all.length - 1));
  const y = (v) => h - 4 - (v / max) * (h - 10);
  const pts = s.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polygon points={`${x(0)},${h - 2} ${pts} ${x(s.length - 1)},${h - 2}`} fill="var(--ai-bg)" />
      <polyline points={pts} fill="none" stroke="var(--text-3)" strokeWidth="1.6" strokeLinejoin="round" />
      <line x1={x(s.length - 1)} y1={y(s[s.length - 1])} x2={x(s.length)} y2={y(pred)} stroke="var(--ai)" strokeWidth="1.8" strokeDasharray="3 2" />
      <circle cx={x(s.length)} cy={y(pred)} r="3.2" fill="var(--ai)" />
    </svg>
  );
}

export const confColor = (v) => (v >= 90 ? "var(--green-fg)" : v >= 80 ? "var(--ai)" : "var(--amber-fg)");

export const reasonIcon = (t) => /demand up/i.test(t) ? ["up", "green"] : /demand down|falling|cautious/i.test(t) ? ["down", "amber"] : /on order/i.test(t) ? ["truck", "blue"]
  : /budget|wait/i.test(t) ? ["coins", "amber"] : /margin/i.test(t) ? ["tag", /thin/i.test(t) ? "red" : "green"] : /cash|holding|profit/i.test(t) ? ["wallet", "amber"]
  : /out of stock|only/i.test(t) ? ["box", "red"] : /stock/i.test(t) ? ["box", "blue"] : ["spark", "ai"];

export function Bullets({ items, style }) {
  return (
    <ul className="bullets" style={style}>
      {items.map((x, k) => <li key={k}><DotIc ic={x.ic} tone={x.tone} size={15} /><span><Md text={x.h} /></span></li>)}
    </ul>
  );
}

/* ---------- Charts ---------- */
/* Fixed colour order for parts of a whole (validated for colour-blind separation); "Other" is always grey. */
export const CAT = ["var(--cat1)", "var(--cat2)", "var(--cat3)", "var(--cat4)", "var(--cat5)"];

/* Keeps the biggest parts and folds the rest into one grey "Other" slice, so a pie never has more than 6 parts. */
export function topParts(parts, keep = 5, other = "Other") {
  const sorted = parts.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= keep + 1) return sorted;
  const rest = sorted.slice(keep).reduce((a, p) => a + p.value, 0);
  return [...sorted.slice(0, keep), { label: other, value: rest, other: true }];
}

/* Donut (pie) chart with a legend that lists every part's value and share, so nothing depends on colour alone.
   Hovering a slice or a legend row shows that part in the middle. parts: [{ label, value, other? }] */
export function PieChart({ title, sub, parts, format, centerLabel, foot }) {
  const { t } = useApp();
  const [on, setOn] = useState(null);
  const total = parts.reduce((a, p) => a + p.value, 0);
  const R = 72, r = 46, C = 80;
  const color = (p, i) => (p.other ? "var(--cat-other)" : CAT[i % CAT.length]);
  const pt = (rad, a) => `${C + rad * Math.sin(a)} ${C - rad * Math.cos(a)}`;
  let a0 = 0;
  const arcs = parts.map((p, i) => {
    const a1 = a0 + (p.value / total) * Math.PI * 2, big = a1 - a0 > Math.PI ? 1 : 0;
    const d = parts.length === 1 ? null : `M ${pt(R, a0)} A ${R} ${R} 0 ${big} 1 ${pt(R, a1)} L ${pt(r, a1)} A ${r} ${r} 0 ${big} 0 ${pt(r, a0)} Z`;
    a0 = a1;
    return { p, i, d };
  });
  const share = (v) => `${Math.round((v / total) * 100)}%`;
  const cur = on === null ? null : parts[on];
  return (
    <div className="card card-pad pie-card">
      <div className="stack" style={{ marginBottom: 12 }}><h2 className="card-title">{title}</h2>{sub ? <span className="muted small">{sub}</span> : null}</div>
      {total > 0 ? (
        <div className="pie-wrap">
          <svg viewBox="0 0 160 160" className="pie" role="img" aria-label={`${title}: ${parts.map((p) => `${p.label} ${format(p.value)}`).join(", ")}`}>
            {arcs.map(({ p, i, d }) => d
              ? <path key={p.label} d={d} fill={color(p, i)} stroke="var(--card)" strokeWidth="2" strokeLinejoin="round" opacity={on === null || on === i ? 1 : 0.35}
                  onMouseEnter={() => setOn(i)} onMouseLeave={() => setOn(null)}><title>{`${p.label}: ${format(p.value)} (${share(p.value)})`}</title></path>
              : <circle key={p.label} cx={C} cy={C} r={(R + r) / 2} fill="none" stroke={color(p, i)} strokeWidth={R - r} />)}
            <text x={C} y={C - 4} textAnchor="middle" className="pie-center-v">{cur ? share(cur.value) : format(total)}</text>
            <text x={C} y={C + 13} textAnchor="middle" className="pie-center-l">{cur ? (cur.label.length > 14 ? cur.label.slice(0, 13) + "…" : cur.label) : centerLabel}</text>
          </svg>
          <ul className="pie-legend">
            {parts.map((p, i) => (
              <li key={p.label} className={on === i ? "on" : ""} onMouseEnter={() => setOn(i)} onMouseLeave={() => setOn(null)}>
                <i style={{ background: color(p, i) }} /><span className="pl-name">{p.label}</span><span className="num pl-v">{format(p.value)}</span><span className="num muted pl-s">{share(p.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : <Empty title={t("Nothing to show yet")} text={t("This fills in as the shop records sales and stock.")} ic="activity" />}
      {foot ? <p className="muted small" style={{ marginTop: 10 }}>{foot}</p> : null}
    </div>
  );
}
