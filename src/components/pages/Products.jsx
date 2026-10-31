"use client";
import { useApp } from "../App.jsx";
import { Empty, Icon, Select } from "../ui.jsx";
import { catName, supName } from "@/lib/engine.js";
import { num, pct, rm2 } from "@/lib/format.js";

const SORTS = { name: "Name A–Z", marginDesc: "Margin: high to low", marginAsc: "Margin: low to high", stockDesc: "Stock: high to low", stockAsc: "Stock: low to high" };
const margin = (p) => (p.sell - p.cost) / p.sell;
const CMP = {
  name: (a, b) => a.name.localeCompare(b.name), marginDesc: (a, b) => margin(b) - margin(a), marginAsc: (a, b) => margin(a) - margin(b),
  stockDesc: (a, b) => b.stock - a.stock, stockAsc: (a, b) => a.stock - b.stock,
};

export default function Products() {
  const { d, ui, setUi, can, openModal, act, t, tp } = useApp();
  const f = ui.products, q = f.q.trim().toLowerCase(), edit = can("manageCatalog");
  const set = (patch) => setUi((u) => ({ products: { ...u.products, ...patch } }));
  const rows = d.products.filter((p) => (!f.cat || p.cat === f.cat) && (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))).sort(CMP[f.sort]);
  const dirty = f.q || f.cat || f.sort !== "name";
  const del = (p) => openModal("confirm", {
    title: t("Delete {name}?", { name: p.name }), body: t("Its stock history and past proposals are kept."), label: t("Delete"), danger: true,
    onOk: () => act("deleteProduct", { id: p.id }),
  });

  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">{t("Products")}</h1><p className="page-sub">{tp(d.products.length, "{n} product", "{n} products")}</p></div>
        {edit ? <button className="btn btn-primary" onClick={() => openModal("product")}><Icon n="plus" /> {t("Create product")}</button> : <span className="chip chip-grey">{t("View only")}</span>}
      </div>
      <div className="card">
        <div className="toolbar">
          <div className="search" style={{ flex: 1, minWidth: 200, maxWidth: 340 }}>
            <Icon n="search" />
            <input className="input" placeholder={t("Search name or SKU")} aria-label={t("Search products")} value={f.q} onChange={(e) => set({ q: e.target.value })} />
          </div>
          <div style={{ width: 180, maxWidth: "100%" }}><Select id="prod-cat" label={t("Category")} value={f.cat} onChange={(v) => set({ cat: v })} options={[["", t("All categories")], ...d.categories.map((c) => [c.id, c.name])]} /></div>
          <div style={{ width: 200, maxWidth: "100%" }}><Select id="prod-sort" label={t("Sort")} value={f.sort} onChange={(v) => set({ sort: v })} options={Object.entries(SORTS).map(([k, l]) => [k, t(l)])} /></div>
          <button className={`btn ${dirty ? "btn-link" : "btn-secondary"}`} style={{ height: 42 }} disabled={!dirty} onClick={() => set({ q: "", cat: "", sort: "name" })}>{t("Reset")}</button>
        </div>
        {rows.length ? (
          <>
            <div className="scroll-x"><table style={{ minWidth: 900 }}>
              <thead><tr><th>{t("Product")}</th><th>{t("Category")}</th><th>{t("Supplier")}</th><th className="right">{t("Stock")}</th><th className="right">{t("Minimum")}</th><th className="right">{t("Cost")}</th><th className="right">{t("Selling")}</th><th className="right">{t("Margin")}</th>{edit ? <th className="right">{t("Actions")}</th> : null}</tr></thead>
              <tbody>{rows.map((p) => (
                <tr key={p.id}>
                  <td><span className="bold">{p.name}</span><div className="mono faint">{p.sku}</div></td>
                  <td><span className="chip chip-grey">{catName(d, p.cat)}</span></td>
                  <td className="muted">{p.sup ? supName(d, p.sup) : "—"}</td>
                  <td className="right bold num" style={{ color: p.stock === 0 ? "var(--red-fg)" : p.stock < p.min ? "var(--amber-fg)" : "inherit" }}>{num(p.stock)}</td>
                  <td className="right muted num">{p.min}</td>
                  <td className="right num">{rm2(p.cost)}</td>
                  <td className="right num">{rm2(p.sell)}</td>
                  <td className="right"><span className={`chip ${margin(p) >= 0.5 ? "chip-green" : margin(p) < 0.25 ? "chip-red" : "chip-grey"}`}>{pct(margin(p))}</span></td>
                  {edit ? (
                    <td className="right" style={{ whiteSpace: "nowrap" }}>
                      <button className="icon-btn" aria-label={t("Edit {name}", { name: p.name })} onClick={() => openModal("product", { id: p.id })}><Icon n="pencil" size={16} /></button>
                      <button className="icon-btn del" aria-label={t("Delete {name}", { name: p.name })} onClick={() => del(p)}><Icon n="trash" size={16} /></button>
                    </td>
                  ) : null}
                </tr>
              ))}</tbody>
            </table></div>
            <div className="table-foot">{t("Showing {a} of {b} · margin = (selling − cost) ÷ selling", { a: rows.length, b: d.products.length })}</div>
          </>
        ) : <Empty title={t("No products found")} text={t("Try another search or category.")} />}
      </div>
    </>
  );
}
