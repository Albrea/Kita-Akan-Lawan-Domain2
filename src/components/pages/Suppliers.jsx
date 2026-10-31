"use client";
import { useApp } from "../App.jsx";
import { Empty, Icon, PoChip, PoLink } from "../ui.jsx";
import { openPOs } from "@/lib/engine.js";

export default function Suppliers() {
  const { d, can, openModal, act, t, tp } = useApp();
  const edit = can("manageSuppliers");
  const del = (s) => openModal("confirm", {
    title: t("Delete supplier {name}?", { name: s.name }), body: t("Only possible when no product or open order uses it."), label: t("Delete"), danger: true,
    onOk: () => act("deleteSupplier", { id: s.id }),
  });
  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">{t("Suppliers")}</h1><p className="page-sub">{t("Delivery time sets the expected date on every order.")}</p></div>
        {edit ? <button className="btn btn-primary" onClick={() => openModal("supplier")}><Icon n="plus" /> {t("Add supplier")}</button> : <span className="chip chip-grey">{t("View only")}</span>}
      </div>
      <div className="card">
        {d.suppliers.length ? (
          <>
            <div className="scroll-x"><table style={{ minWidth: 820 }}>
              <thead><tr><th>{t("Supplier")}</th><th>{t("Contact")}</th><th>{t("Phone")}</th><th className="right">{t("Delivery time")}</th><th className="right">{t("Products")}</th><th>{t("Open orders")}</th>{edit ? <th className="right">{t("Actions")}</th> : null}</tr></thead>
              <tbody>{d.suppliers.map((s) => {
                const n = d.products.filter((p) => p.sup === s.id).length, ops = openPOs(d).filter((po) => po.sup === s.id);
                return (
                  <tr key={s.id}>
                    <td><span className="bold">{s.name}</span>{s.note ? <div className="faint small">{s.note}</div> : null}</td>
                    <td>{s.contact || "—"}</td>
                    <td className="muted num">{s.phone || "—"}</td>
                    <td className="right num">{tp(s.leadDays, "{n} day", "{n} days")}</td>
                    <td className="right num">{n}</td>
                    <td>{ops.length ? ops.map((po) => <div key={po.id} className="row" style={{ gap: 6, margin: "2px 0" }}><PoLink po={po} /><PoChip po={po} /></div>) : <span className="faint">—</span>}</td>
                    {edit ? (
                      <td className="right" style={{ whiteSpace: "nowrap" }}>
                        <button className="icon-btn" aria-label={t("Edit {name}", { name: s.name })} onClick={() => openModal("supplier", { id: s.id })}><Icon n="pencil" size={16} /></button>
                        <button className="icon-btn del" aria-label={t("Delete {name}", { name: s.name })} onClick={() => del(s)}><Icon n="trash" size={16} /></button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}</tbody>
            </table></div>
            <div className="table-foot">{t("Phone numbers are synthetic demo data.")}</div>
          </>
        ) : <Empty title={t("No suppliers yet")} text={t("Add the suppliers you order from.")} ic="store" />}
      </div>
    </>
  );
}
