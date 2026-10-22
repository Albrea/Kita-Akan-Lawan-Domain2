import { createClient } from "@/lib/supabase/server";
import { getInitials } from "@/lib/utils";
import { redirect } from "next/navigation";

export const revalidate = 0;

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "Owner") {
    redirect("/");
  }

  const { data: users } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at");
  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .order("id");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">
            Manage system users, permissions, and categories
          </p>
        </div>
      </div>

      {/* Team Member Roles */}
      <div className="card" style={{ marginBottom: "28px" }}>
        <div className="card-head">
          <h2 className="card-title">Team Members</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th style={{ width: "140px" }}>Role</th>
              <th style={{ width: "120px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {(users || []).map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="row" style={{ gap: "10px" }}>
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "999px",
                        background: "var(--divider)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 600,
                        fontSize: "12px",
                      }}
                    >
                      {getInitials(u.name)}
                    </div>
                    <span style={{ fontWeight: 500 }}>{u.name}</span>
                  </div>
                </td>
                <td className="muted">{u.email}</td>
                <td>
                  <span
                    className={`chip ${u.role === "Owner" ? "chip-blue" : "chip-grey"}`}
                  >
                    {u.role}
                  </span>
                </td>
                <td>
                  <span
                    className={`chip ${u.is_active ? "chip-green" : "chip-grey"}`}
                  >
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Product Categories */}
      <div className="card" style={{ maxWidth: "600px" }}>
        <div className="card-head">
          <h2 className="card-title">Product Categories</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Category Name</th>
            </tr>
          </thead>
          <tbody>
            {(categories || []).map((c) => (
              <tr key={c.id}>
                <td className="mono muted" style={{ width: "80px" }}>
                  #{c.id}
                </td>
                <td style={{ fontWeight: 500 }}>{c.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
