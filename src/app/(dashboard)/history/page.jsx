import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/utils";

export const revalidate = 0;

export default async function HistoryPage() {
  const supabase = await createClient();

  const { data: movements } = await supabase
    .from("stock_movements")
    .select(
      `
      *,
      products (name),
      profiles (name)
    `,
    )
    .order("created_at", { ascending: false });

  const rows = movements || [];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Stock History</h1>
          <p className="page-sub">
            Permanent ledger of all stock additions, deductions, and audits
          </p>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ width: "120px" }}>Date</th>
              <th style={{ width: "80px" }}>Time</th>
              <th style={{ width: "140px" }}>SKU</th>
              <th>Product Name</th>
              <th className="right" style={{ width: "90px" }}>
                Before
              </th>
              <th className="right" style={{ width: "100px" }}>
                Change
              </th>
              <th className="right" style={{ width: "90px" }}>
                After
              </th>
              <th style={{ width: "130px" }}>Activity</th>
              <th style={{ width: "140px" }}>Logged By</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  style={{ textAlign: "center", color: "var(--text-3)" }}
                >
                  No movement records found.
                </td>
              </tr>
            ) : (
              rows.map((m) => (
                <tr key={m.id}>
                  <td className="muted">{formatDate(m.created_at)}</td>
                  <td className="muted">{formatTime(m.created_at)}</td>
                  <td className="mono">{m.sku}</td>
                  <td style={{ fontWeight: 500 }}>
                    {m.products?.name || m.sku}
                  </td>
                  <td className="right muted">{m.stock_before}</td>
                  <td
                    className="right bold"
                    style={{
                      color:
                        m.quantity_change > 0
                          ? "var(--green-fg)"
                          : "var(--red-fg)",
                    }}
                  >
                    {m.quantity_change > 0
                      ? `+${m.quantity_change}`
                      : m.quantity_change}
                  </td>
                  <td className="right bold">{m.stock_after}</td>
                  <td>
                    <span
                      className={`chip ${
                        m.activity === "Stock In"
                          ? "chip-green"
                          : m.activity === "Stock Out"
                            ? "chip-red"
                            : "chip-amber"
                      }`}
                    >
                      {m.activity}
                    </span>
                  </td>
                  <td className="muted">{m.profiles?.name || "System"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
