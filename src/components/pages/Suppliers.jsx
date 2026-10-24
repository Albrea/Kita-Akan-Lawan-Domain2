"use client";
import { useApp } from "../App.jsx";
import { Empty, Icon, PoChip } from "../ui.jsx";
import { openPOs } from "@/lib/engine.js";
import { plural } from "@/lib/format.js";

export default function Suppliers() {
  const { d, can, openModal, act } = useApp();
  const edit = can("manageSuppliers");
  const del = (s) => openModal("confirm", {
    title: `Delete supplier ${s.name}?`, body: "Only possible when no product or open order uses it.", label: "Delete", danger: true,
    onOk: () => act("deleteSupplier", { id: s.id }),
  });
  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">Suppliers</h1><p className="page-sub">Delivery time sets the expected date on every order.</p></div>
        {edit ? <button className="btn btn-primary" onClick={() => openModal("supplier")}><Icon n="plus" /> Add supplier</button> : <span className="chip chip-grey">View only</span>}
      </div>
      <div className="card">
        {d.suppliers.length ? (
          <>
            <div className="scroll-x"><table style={{ minWidth: 820 }}>
              <thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th className="right">Delivery time</th><th className="right">Products</th><th>Open orders</th>{edit ? <th className="right">Actions</th> : null}</tr></thead>
              <tbody>{d.suppliers.map((s) => {
                const n = d.products.filter((p) => p.sup === s.id).length, ops = openPOs(d).filter((po) => po.sup === s.id);
                return (
                  <tr key={s.id}>
                    <td><span className="bold">{s.name}</span>{s.note ? <div className="faint small">{s.note}</div> : null}</td>
                    <td>{s.contact || "—"}</td>
                    <td className="muted num">{s.phone || "—"}</td>
                    <td className="right num">{plural(s.leadDays, "day")}</td>
                    <td className="right num">{n}</td>
                    <td>{ops.length ? ops.map((po) => <div key={po.id} className="row" style={{ gap: 6, margin: "2px 0" }}><span className="mono">{po.code}</span><PoChip po={po} /></div>) : <span className="faint">—</span>}</td>
                    {edit ? (
                      <td className="right" style={{ whiteSpace: "nowrap" }}>
                        <button className="icon-btn" aria-label={`Edit ${s.name}`} onClick={() => openModal("supplier", { id: s.id })}><Icon n="pencil" size={16} /></button>
                        <button className="icon-btn del" aria-label={`Delete ${s.name}`} onClick={() => del(s)}><Icon n="trash" size={16} /></button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}</tbody>
            </table></div>
            <div className="table-foot">Phone numbers are synthetic demo data.</div>
          </>
        ) : <Empty title="No suppliers yet" text="Add the suppliers you order from." ic="store" />}
      </div>
    </>
  );
}
