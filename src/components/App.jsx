"use client";
/* StockNow app shell: loads the shop from the API, keeps the screen state, and sends every change
   to /api/action. In a simulated outage, stock moves run locally (same code) and sync later. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ActionError, OFFLINE_ACTIONS, ROLE_LABEL, applyAction, can as canRole } from "@/lib/actions.js";
import { analyse, budgetLeft, members, openPOs, pendingRequests, userOf } from "@/lib/engine.js";
import { clone, fromJSON, initials, nowStamp, plural, toJSON } from "@/lib/format.js";
import { Icon, RoleChip } from "./ui.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Products from "./pages/Products.jsx";
import StockIn from "./pages/StockIn.jsx";
import StockOut from "./pages/StockOut.jsx";
import Suppliers from "./pages/Suppliers.jsx";
import AiRestock from "./pages/AiRestock.jsx";
import Approvals from "./pages/Approvals.jsx";
import ActivityLog from "./pages/ActivityLog.jsx";
import Team from "./pages/Team.jsx";
import Settings from "./pages/Settings.jsx";
import Modals from "./Modals.jsx";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const PAGES = {
  dashboard: Dashboard, products: Products, "stock-in": StockIn, "stock-out": StockOut, suppliers: Suppliers,
  ai: AiRestock, approvals: Approvals, activity: ActivityLog, team: Team, settings: Settings,
};

export const OFFLINE_MSG = "You're offline. This needs a connection, so it stays here until StockNow is back.";
const ME_KEY = "stocknow.me";

const initialUi = () => ({
  page: "dashboard",
  ai: { budget: "", phase: "idle", step: 0, result: null, auto: false, ideal: false, filter: null, open: {}, tab: "plan", summary: null },
  dashTab: "low",
  approvals: { tab: "pending", draft: {}, note: {}, err: null },
  stockInTab: "orders",
  receive: {},
  products: { q: "", cat: "", sort: "name" },
  activity: { q: "", action: "", user: "" },
  settingsTab: "categories",
  catchup: "",
  catchupResult: null,
  backupText: "",
});

async function api(path, body) {
  const res = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: toJSON(body) } : { cache: "no-store" });
  const text = await res.text();
  let out;
  try { out = fromJSON(text); } catch { out = { ok: false, error: `Server error (${res.status})` }; }
  return out;
}

export default function App() {
  const [d, setData] = useState(null);
  const [meta, setMeta] = useState({ mode: "memory", gemini: false });
  const [loadError, setLoadError] = useState("");
  const [meId, setMeId] = useState("u3");
  const [ui, setUiRaw] = useState(initialUi);
  const [modal, setModal] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(0);
  const toastTimer = useRef(null);
  const mainRef = useRef(null);

  const setUi = useCallback((patch) => setUiRaw((u) => ({ ...u, ...(typeof patch === "function" ? patch(u) : patch) })), []);
  const setAi = useCallback((patch) => setUiRaw((u) => ({ ...u, ai: { ...u.ai, ...(typeof patch === "function" ? patch(u.ai) : patch) } })), []);

  const toast = useCallback((msg, bad = false) => {
    if (!msg) return;
    setToastMsg({ msg, bad });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3800);
  }, []);

  const refresh = useCallback(async () => {
    const out = await api("/api/state");
    if (out.error) { setLoadError(out.error); return null; }
    setData(out.data);
    setMeta({ mode: out.mode, gemini: out.gemini });
    return out.data;
  }, []);

  /* First load: the shop data and the last demo account used on this device. */
  useEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem(ME_KEY); } catch {}
    refresh().then((data) => {
      if (!data) return;
      const who = data.people.find((u) => u.id === saved && u.role) ? saved : "u3";
      setMeId(who);
      setAi({ budget: String(budgetLeft(data)) });
    });
  }, [refresh, setAi]);

  /* Keep screens in sync when several people use the demo at once (e.g. Staff sends, Owner approves). */
  useEffect(() => {
    if (!d || offline || modal || busy) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 20000);
    return () => clearInterval(t);
  }, [d, offline, modal, busy, refresh]);

  const me = useMemo(() => (d ? userOf(d, meId) : null), [d, meId]);
  const can = useCallback((perm) => !!me && canRole(me.role, perm), [me]);

  const go = useCallback((page, extra) => {
    setUi({ page, ...(extra || {}) });
    setNavOpen(false);
    setProfileOpen(false);
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [setUi]);

  /* Runs an action. Returns { ok, result, error, fields } so forms can mark their inputs. */
  const act = useCallback(async (type, payload = {}, { toastFields = false } = {}) => {
    if (offline) {
      if (!OFFLINE_ACTIONS.has(type)) { toast(OFFLINE_MSG, true); return { ok: false, error: OFFLINE_MSG }; }
      const next = clone(d), at = nowStamp();
      try {
        const result = applyAction(next, meId, type, payload, { offline: true, at });
        setData(next);
        setQueue((q) => [...q, { type, payload, actorId: meId, at }]);
        toast(result.toast, result.bad);
        return { ok: true, result };
      } catch (e) {
        if (!(e instanceof ActionError)) throw e;
        if (!e.fields || toastFields) toast(e.message, true);
        return { ok: false, error: e.message, fields: e.fields };
      }
    }
    setBusy((b) => b + 1);
    try {
      const out = await api("/api/action", { actorId: meId, type, payload });
      if (out.data) setData(out.data);
      if (out.ok) toast(out.result?.toast, out.result?.bad);
      else if (!out.fields || toastFields) toast(out.error || "Something went wrong.", true);
      return out;
    } catch {
      toast("No connection to StockNow. Try again, or turn on offline mode in Settings → Backup.", true);
      return { ok: false, error: "network" };
    } finally {
      setBusy((b) => b - 1);
    }
  }, [d, meId, offline, toast]);

  const openModal = useCallback((kind, props = {}) => setModal({ kind, ...props }), []);
  const closeModal = useCallback(() => setModal(null), []);

  /* Scheduled draft / alerts: open AI Restock with a plan for the budget left. */
  const openPlan = useCallback(() => {
    const b = budgetLeft(d);
    setAi({ budget: String(b), ideal: false, result: analyse(d, b), phase: "done", auto: true, filter: null, open: {}, tab: "plan", summary: null });
    go("ai");
  }, [d, go, setAi]);

  const signInAs = useCallback((id) => {
    const u = userOf(d, id);
    setMeId(id);
    try { localStorage.setItem(ME_KEY, id); } catch {}
    setUi((x) => ({ page: "dashboard", ai: x.ai.phase === "done" ? x.ai : { ...x.ai, budget: String(budgetLeft(d)) } }));
    setProfileOpen(false);
    setNavOpen(false);
    toast(`Now using ${u.name} (${ROLE_LABEL[u.role]})`);
  }, [d, setUi, toast]);

  const switchScenario = useCallback(async (key) => {
    if (key === d.settings.scenario) return;
    const out = await act("switchScenario", { key });
    if (!out.ok) return;
    setUiRaw((x) => ({ ...initialUi(), page: x.page, settingsTab: x.settingsTab, ai: { ...initialUi().ai, tab: x.ai.tab, budget: String(budgetLeft(out.data)) } }));
    if (!out.data.people.find((u) => u.id === meId && u.role)) setMeId("u3");
  }, [act, d, meId]);

  /* Outage drill: going offline is logged; coming back replays everything recorded meanwhile. */
  const toggleOffline = useCallback(async () => {
    if (!offline) {
      await act("goOffline");
      setOffline(true);
      toast("Offline mode: keep recording stock as usual");
      return;
    }
    setOffline(false);
    const out = await api("/api/action", { actorId: meId, type: "syncOffline", payload: { queue } });
    if (out.data) setData(out.data);
    if (out.ok) { setQueue([]); toast(out.result.toast, out.result.bad); }
    else { setOffline(true); toast(out.error || "Sync failed. Still offline; try again.", true); }
  }, [act, meId, offline, queue, toast]);

  // If the current account loses access, fall back to a demo account that still has it.
  useEffect(() => {
    if (d && me && !me.role) {
      const fallback = members(d)[0];
      if (fallback) setMeId(fallback.id);
    }
  }, [d, me]);

  if (loadError) return <div className="boot"><Icon n="warning" size={28} /><b>StockNow could not start</b><span>{loadError}</span><button className="btn btn-primary" onClick={() => { setLoadError(""); refresh(); }}>Try again</button></div>;
  if (!d || !me) return <div className="boot"><span className="spin" /><span>Loading StockNow…</span></div>;

  const value = {
    d, setData, me, meta, ui, setUi, setAi, can, go, act, toast, openModal, closeModal, modal, openPlan, signInAs, switchScenario,
    offline, queue, toggleOffline, refresh, busy: busy > 0,
  };
  const Page = PAGES[ui.page] || Dashboard;
  return (
    <Ctx.Provider value={value}>
      {busy > 0 ? <div className="busy-bar" aria-hidden="true" /> : null}
      <div className="app">
        <div className={`scrim ${navOpen ? "open" : ""}`} onClick={() => setNavOpen(false)} />
        <Sidebar open={navOpen} profileOpen={profileOpen} setProfileOpen={setProfileOpen} />
        <main className="main" ref={mainRef}>
          <div className="topbar">
            <button className="icon-btn" aria-label="Open menu" onClick={() => setNavOpen(true)}><Icon n="menu" size={20} /></button>
            <span className="logo" style={{ width: 28, height: 28 }}><Icon n="spark" size={16} sw={2} /></span>
            <span className="brand-name" style={{ fontSize: 15 }}>StockNow</span>
            <span className="spacer" />
            <RoleChip role={me.role} />
          </div>
          {offline ? (
            <div className="notice amber section">
              <Icon n="offline" size={16} />
              <span><b>Offline (simulated).</b> Stock in and out are saved on this device and sync when StockNow is back{queue.length ? ` (${plural(queue.length, "change")} waiting)` : ""}. AI plans still work.{" "}
                <button className="btn btn-link btn-sm" style={{ marginLeft: 6 }} onClick={toggleOffline}>Back online</button></span>
            </div>
          ) : null}
          <Page />
        </main>
      </div>
      <Modals />
      {toastMsg ? (
        <div className={`toast ${toastMsg.bad ? "bad" : ""}`} role="status">
          <span className="toast-icon"><Icon n={toastMsg.bad ? "close" : "check"} size={14} sw={2.6} /></span>
          <span style={{ fontWeight: 500 }}>{toastMsg.msg}</span>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}

function Sidebar({ open, profileOpen, setProfileOpen }) {
  const { d, me, ui, go, signInAs } = useApp();
  const pend = pendingRequests(d).length, ord = openPOs(d).length;
  const menu = [
    { id: "dashboard", label: "Dashboard", icon: "grid" },
    { id: "products", label: "Products", icon: "box" },
    { id: "stock-in", label: "Stock In", icon: "in", badge: ord || "", tone: "blue" },
    { id: "stock-out", label: "Stock Out", icon: "out" },
    { id: "suppliers", label: "Suppliers", icon: "store" },
    { sep: 1 },
    { id: "ai", label: "AI Restock", icon: "spark", ai: true, badge: "AI", tone: "ai" },
    { id: "approvals", label: "Approvals", icon: "approve", badge: pend || "" },
    { id: "activity", label: "Activity Log", icon: "activity" },
    { sep: 2 },
    { id: "team", label: "Team & access", icon: "users" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];
  return (
    <nav className={`sidebar ${open ? "open" : ""}`} aria-label="Main">
      <div className="brand"><span className="logo"><Icon n="spark" size={18} sw={2} /></span><span className="brand-name">StockNow</span></div>
      <div className="nav-list">
        {menu.map((m) => m.sep ? <div key={"sep" + m.sep} className="nav-sep" /> : (
          <button key={m.id} className={`nav-item ${m.ai ? "ai" : ""} ${ui.page === m.id ? "active" : ""}`} onClick={() => go(m.id)} aria-current={ui.page === m.id ? "page" : undefined}>
            <Icon n={m.icon} /> <span>{m.label}</span>
            {m.badge ? <span className={`nav-badge ${m.tone || ""}`}>{m.badge}</span> : null}
          </button>
        ))}
      </div>
      <div className="side-foot">
        {profileOpen ? (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 35 }} onClick={() => setProfileOpen(false)} />
            <div className="dropdown">
              <div style={{ padding: "8px 12px 10px", borderBottom: "1px solid var(--divider)", marginBottom: 6 }}>
                <div style={{ fontWeight: 600 }}>{me.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-2)", wordBreak: "break-all" }}>{me.email}</div>
              </div>
              <div className="eyebrow" style={{ padding: "4px 12px" }}>Switch demo account</div>
              {members(d).map((u) => (
                <button key={u.id} className={`menu-item ${u.id === me.id ? "on" : ""}`} onClick={() => signInAs(u.id)}>
                  <Icon n="swap" size={16} /> {u.name} · {ROLE_LABEL[u.role]}
                </button>
              ))}
            </div>
          </>
        ) : null}
        <button className="profile-btn" style={{ position: "relative", zIndex: 36 }} onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen}>
          <span className="avatar">{initials(me.name)}</span>
          <span className="stack" style={{ flex: 1 }}>
            <span style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me.name}</span>
            <span style={{ fontSize: 12, color: "var(--text-2)" }}>{ROLE_LABEL[me.role]}</span>
          </span>
          <Icon n="chevronUp" size={16} />
        </button>
      </div>
    </nav>
  );
}
