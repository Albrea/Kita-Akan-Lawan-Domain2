"use client";
import { useApp } from "../App.jsx";
import { Bullets, Empty, Icon, Md, PoCell, ReqChip } from "../ui.jsx";
import { budgetLeft, pendingRequests, summaryBullets, userOf } from "@/lib/engine.js";
import { list, num, rm } from "@/lib/format.js";

export default function Approvals() {
  const { d, ui, setUi, can, t, when, who } = useApp();
  const tab = ui.approvals.tab, pend = pendingRequests(d), hist = d.requests.filter((r) => r.status !== "PENDING");
  const setTab = (x) => setUi((u) => ({ approvals: { ...u.approvals, tab: x } }));
  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">{t("Approvals")}</h1><p className="page-sub">{t(can("approveAI") ? "Nothing is ordered until you approve. Approving creates one order per supplier." : "Follow every plan here. Only the Owner or a Manager can approve them.")}</p></div>
        <div className="tabs">
          <button className={`tab ${tab === "pending" ? "on" : ""}`} onClick={() => setTab("pending")}>{t("Waiting")}<span className="n">{pend.length}</span></button>
          <button className={`tab ${tab === "history" ? "on" : ""}`} onClick={() => setTab("history")}>{t("History")}<span className="n">{hist.length}</span></button>
        </div>
      </div>
      {tab === "pending"
        ? pend.length ? pend.map((r) => <ApprovalCard key={r.id} r={r} />) : <div className="card"><Empty title={t("Nothing to approve")} text={t("Plans sent for approval appear here.")} ic="check" /></div>
        : (
          <div className="card">{hist.length ? (
            <div className="scroll-x"><table style={{ minWidth: 820 }}>
              <thead><tr><th>{t("Plan")}</th><th>{t("Sent by")}</th><th className="right">{t("Approved value")}</th><th>{t("Decision")}</th><th>{t("Reason")}</th><th>{t("Supplier orders")}</th></tr></thead>
              <tbody>{hist.map((r) => (
                <tr key={r.id}>
                  <td><span className="mono bold">{r.code}</span><div className="faint small">{when(r.at)}</div></td>
                  <td>{who(r.by)}</td>
                  <td className="right num">{rm(r.items.filter((i) => i.status === "APPROVED").reduce((s, i) => s + i.cost, 0))}</td>
                  <td><ReqChip status={r.status} /><div className="faint small">{who(r.decidedBy)} · {r.decidedAt ? when(r.decidedAt) : ""}</div></td>
                  <td style={{ maxWidth: 260, fontSize: 13 }}>{r.decisionNote || <span className="faint">—</span>}</td>
                  <td><PoCell d={d} ids={r.poIds} /></td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <Empty title={t("No decisions yet")} text={t("Approved and rejected plans appear here.")} ic="approve" />}</div>
        )}
    </>
  );
}

function ApprovalCard({ r }) {
  const { d, ui, setUi, can, act, openModal, t, when, who } = useApp();
  const act_ = can("approveAI");
  const buys = r.items.filter((i) => i.decision === "BUY"), skips = r.items.filter((i) => i.decision !== "BUY");
  const draft = ui.approvals.draft[r.id] || Object.fromEntries(buys.map((i) => [i.pid, "APPROVED"]));
  const note = ui.approvals.note[r.id] || "";
  const okCost = buys.filter((i) => draft[i.pid] === "APPROVED").reduce((s, i) => s + i.cost, 0), anyNo = buys.some((i) => draft[i.pid] === "REJECTED");
  const setA = (patch) => setUi((u) => ({ approvals: { ...u.approvals, ...patch(u.approvals) } }));
  const setDraft = (pid, v) => setA((a) => ({ draft: { ...a.draft, [r.id]: { ...draft, [pid]: v } } }));
  const setNote = (v) => setA((a) => ({ note: { ...a.note, [r.id]: v } }));

  async function confirm() {
    const out = await act("decide", { reqId: r.id, decisions: draft, note }, { toastFields: true });
    if (!out.ok) { if (out.fields) setA(() => ({ err: r.id })); return; }
    setA((a) => { const dr = { ...a.draft }; delete dr[r.id]; return { draft: dr, err: null }; });
    if (out.result?.posCreated?.length) openModal("posCreated", { reqId: r.id });
  }

  return (
    <div className="card section">
      <div className="card-head">
        <div className="stack">
          <div className="row" style={{ gap: 8 }}><span className="mono bold" style={{ fontSize: 14 }}>{r.code}</span><ReqChip status={r.status} /></div>
          <span className="muted small">{t("From {name} · {date} · sent to {names}", { name: who(r.by), date: when(r.at), names: list((r.sentTo || []).map(who)) })}</span>
        </div>
      </div>
      <div className="card-pad" style={{ paddingBottom: 8 }}>
        {r.summary ? <div className="summary-box" style={{ marginTop: 0, marginBottom: 14 }}><span className="eyebrow" style={{ color: "var(--ai-fg)" }}>{t("Summary")}</span><p className="ai-text" style={{ marginTop: 4 }}><Md text={r.summary} /></p></div> : null}
        {r.result ? <details className="more" style={{ marginBottom: 6 }}><summary><Icon n="info" size={14} /> {t("More detail")}</summary><Bullets items={summaryBullets(d, r.result)} style={{ marginTop: 12 }} /></details> : null}
        {r.note ? <div className="notice blue" style={{ marginTop: 12 }}><Icon n="message" size={16} /> <span><b>{userOf(d, r.by).name}:</b> {r.note}</span></div> : null}
      </div>
      <div className="scroll-x"><table style={{ minWidth: 760 }}>
        <thead><tr><th>{t("Product")}</th><th className="right">{t("Qty")}</th><th className="right">{t("Cost")}</th><th className="right">{t("Exp. profit")}</th><th className="right">{t("Confidence")}</th><th>{t(act_ ? "Your decision" : "Status")}</th></tr></thead>
        <tbody>{buys.map((i) => (
          <tr key={i.pid}>
            <td><span className="bold">{i.name}</span><div className="faint small" style={{ maxWidth: 340 }}>{(i.reasons || []).slice(0, 2).join(" · ")}</div></td>
            <td className="right num bold">{num(i.qty)}</td>
            <td className="right num">{rm(i.cost)}</td>
            <td className="right num" style={{ color: "var(--green-fg)" }}>{rm(i.profit)}</td>
            <td className="right num">{i.conf}%</td>
            <td>{!act_ ? <span className="chip chip-amber">{t("Waiting")}</span> : (
              <div className="seg" role="group" aria-label={t("Decision for {name}", { name: i.name })}>
                <button className={draft[i.pid] === "APPROVED" ? "ok" : ""} onClick={() => setDraft(i.pid, "APPROVED")}><Icon n="check" size={13} sw={2.4} /> {t("Approve")}</button>
                <button className={draft[i.pid] === "REJECTED" ? "no" : ""} onClick={() => setDraft(i.pid, "REJECTED")}><Icon n="close" size={13} sw={2.4} /> {t("Reject")}</button>
              </div>
            )}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {skips.length ? <div className="table-foot"><Icon n="info" size={14} /> {t("Not in this plan: {list}.", { list: list(skips.map((i) => i.name)) })}</div> : null}
      {!act_ ? (
        <div className="card-pad" style={{ borderTop: "1px solid var(--border)" }}><div className="notice blue"><Icon n="info" size={16} /><span>{t("View only. Owner or Manager will approve this plan.")}</span></div></div>
      ) : (
        <div className="card-pad" style={{ borderTop: "1px solid var(--border)" }}>
          {anyNo ? (
            <div className="field" style={{ marginBottom: 14 }}>
              <label className="label" htmlFor={`note-${r.id}`}>{t("Reason for rejected items")} <span className="req">*</span></label>
              <textarea className={`textarea ${ui.approvals.err === r.id && !note.trim() ? "error" : ""}`} id={`note-${r.id}`} placeholder={t("e.g. Wait for the 11.11 supplier promotion")} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="hint">{t("{name} will see this.", { name: userOf(d, r.by).name })}</div>
            </div>
          ) : null}
          <div className="row wrap">
            <div className="stack"><span className="bold">{t("Approving {x}", { x: rm(okCost) })}</span><span className="muted small">{t("Budget left after this: {x}", { x: rm(Math.max(0, budgetLeft(d) - okCost)) })}</span></div>
            <span className="spacer" />
            <button className="btn btn-secondary" onClick={() => openModal("reject", { reqId: r.id })}>{t("Reject plan")}</button>
            <button className="btn btn-primary" onClick={confirm}><Icon n="check" size={16} sw={2.2} /> {t(anyNo ? (okCost ? "Confirm decision" : "Reject selected") : "Approve & create orders")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
