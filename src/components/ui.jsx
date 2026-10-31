"use client";
/* Small shared UI pieces: icons, chips, selects, empty states, modal shell, sparkline. */
import {
  Activity, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Ban, Bell, Bot, Calculator, Check, ChevronDown, ChevronRight, ChevronUp,
  Circle, CirclePause, ClipboardCheck, Clock, Coins, Copy, Database, Info, LayoutGrid, Link2, Menu, MessageSquare, Minus, Package, Pencil,
  Plus, Receipt, Search, Send, ShoppingCart, SlidersHorizontal, Sparkles, Store, Tag, Target, Trash2, TrendingDown, TrendingUp,
  TriangleAlert, Truck, Undo2, Users, Wallet, WifiOff, X, Languages,
} from "lucide-react";
import { useApp } from "./App.jsx";
import { lateDays, poOf } from "@/lib/engine.js";
import { ROLE_LABEL } from "@/lib/actions.js";

const ICONS = {
  grid: LayoutGrid, spark: Sparkles, approve: ClipboardCheck, box: Package, in: ArrowDownToLine, out: ArrowUpFromLine, store: Store,
  activity: Activity, users: Users, settings: SlidersHorizontal, search: Search, chevronDown: ChevronDown, chevronUp: ChevronUp,
  chevronRight: ChevronRight, plus: Plus, minus: Minus, pencil: Pencil, trash: Trash2, close: X, check: Check, info: Info,
  warning: TriangleAlert, send: Send, bot: Bot, truck: Truck, wallet: Wallet, coins: Coins, up: TrendingUp, down: TrendingDown,
  menu: Menu, message: MessageSquare, swap: ArrowLeftRight, dot: Circle, link: Link2, cart: ShoppingCart, pause: CirclePause, ban: Ban,
  receipt: Receipt, tag: Tag, bell: Bell, clock: Clock, calc: Calculator, target: Target, offline: WifiOff, database: Database, copy: Copy, undo: Undo2, lang: Languages,
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

export function RoleChip({ role }) {
  const { t } = useApp();
  const cls = role === "OWNER" ? "chip-blue" : role === "MANAGER" || role === "SYSTEM" ? "chip-ai" : "chip-grey";
  return <span className={`chip ${cls}`}>{ROLE_LABEL[role] ? t(ROLE_LABEL[role]) : role}</span>;
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

/* Where AI text came from: Gemini, or the built-in template and why (no key, error, or the number check). */
export function AiSourceChip({ s, long = false }) {
  const { t, offline } = useApp();
  const [cls, label] = !s || s.loading ? ["chip-ai", "Gemini is writing…"]
    : s.source === "gemini" ? ["chip-ai", long ? "Written by Gemini from these numbers" : "Written by Gemini"]
      : offline || s.source === "offline" ? ["chip-amber", "Offline: template text"]
        : s.reason === "prototype" ? ["chip-amber", "Prototype: Gemini simulated"]
        : s.reason === "no_key" ? ["chip-amber", "Template: Gemini not set up"]
          : s.reason === "numbers" ? ["chip-amber", "Template: Gemini's numbers didn't match"]
            : ["chip-amber", "Template: Gemini didn't answer"];
  return <span className={`chip ${cls}`} title={s?.note || ""}><Icon n="bot" size={12} /> {t(label)}</span>;
}

/* A supplier order code that opens it on Stock In (highlighted there). */
export function PoLink({ po }) {
  const { go, t } = useApp();
  if (po.status === "RECEIVED") return <span className="mono">{po.code}</span>;
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
