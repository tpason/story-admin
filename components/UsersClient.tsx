"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminUserRow, Paginated } from "@/lib/types";

export function UsersClient() {
  const [data, setData] = useState<Paginated<AdminUserRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"reader" | "admin">("reader");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/users?pageSize=50");
    if (response.ok) setData((await response.json()) as Paginated<AdminUserRow>);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser() {
    setSaving("create");
    setMessage(null);
    setError(null);
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername, password: newPassword, email: newEmail, role: newRole })
    });
    setSaving(null);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Tạo user thất bại");
      return;
    }
    setNewUsername("");
    setNewPassword("");
    setNewEmail("");
    setMessage("Đã tạo user");
    void load();
  }

  async function toggleRole(user: AdminUserRow) {
    const nextRole = user.role === "admin" ? "reader" : "admin";
    setSaving(user.id);
    const response = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole })
    });
    setSaving(null);
    if (!response.ok) {
      setError("Đổi role thất bại");
      return;
    }
    setMessage(`Đã set ${user.username} → ${nextRole}`);
    void load();
  }

  return (
    <>
      <div className="admin-header">
        <h1>Users</h1>
      </div>
      {message ? <div className="alert alert-success">{message}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="panel form-grid">
        <h2 style={{ margin: 0 }}>Tạo user</h2>
        <label>
          Username
          <input value={newUsername} onChange={(event) => setNewUsername(event.target.value)} />
        </label>
        <label>
          Password (min 6)
          <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        </label>
        <label>
          Email (optional)
          <input value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
        </label>
        <label>
          Role
          <select value={newRole} onChange={(event) => setNewRole(event.target.value as "reader" | "admin")}>
            <option value="reader">reader</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <div className="form-actions">
          <button type="button" className="btn" disabled={saving === "create"} onClick={() => void createUser()}>
            {saving === "create" ? "..." : "Tạo user"}
          </button>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Danh sách</h2>
        {loading ? <p>Đang tải...</p> : null}
        {!loading && data ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((user) => (
                  <tr key={user.id}>
                    <td>{user.username}</td>
                    <td>{user.email ?? "—"}</td>
                    <td>
                      <span className={`badge badge-${user.role === "admin" ? "ok" : "muted"}`}>{user.role}</span>
                    </td>
                    <td style={{ fontSize: "0.82rem" }}>{new Date(user.createdAt).toLocaleDateString("vi-VN")}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={saving === user.id}
                        onClick={() => void toggleRole(user)}
                      >
                        {user.role === "admin" ? "Demote" : "Promote admin"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </>
  );
}
