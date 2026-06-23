"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/ToastProvider";
import type { AdminScope } from "@/lib/admin-rbac";
import { scopeLabel } from "@/lib/admin-rbac";
import type { AdminUserRow, Paginated } from "@/lib/types";

type UsersClientProps = {
  canManageAdmins?: boolean;
};

export function UsersClient({ canManageAdmins = false }: UsersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { pushToast } = useToast();

  const [data, setData] = useState<Paginated<AdminUserRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const page = Number(searchParams.get("page") ?? 1);
  const q = searchParams.get("q") ?? "";

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"reader" | "admin">("reader");
  const [newAdminScope, setNewAdminScope] = useState<AdminScope>("ops");

  const [confirmBan, setConfirmBan] = useState<AdminUserRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "30" });
    if (q) params.set("q", q);
    const response = await fetch(`/api/users?${params.toString()}`);
    if (!response.ok) {
      setError("Không tải được danh sách user");
      setLoading(false);
      return;
    }
    setData((await response.json()) as Paginated<AdminUserRow>);
    setLoading(false);
  }, [page, q]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateFilters(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    if (!("page" in patch)) params.delete("page");
    router.push(`/users?${params.toString()}`);
  }

  async function createUser() {
    setSaving("create");
    setError(null);
    const body: Record<string, string> = {
      username: newUsername,
      password: newPassword,
      email: newEmail,
      role: newRole
    };
    if (newRole === "admin" && canManageAdmins) body.adminScope = newAdminScope;

    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    setSaving(null);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      const msg = payload?.error ?? "Tạo user thất bại";
      setError(msg);
      pushToast(msg, "error");
      return;
    }
    setNewUsername("");
    setNewPassword("");
    setNewEmail("");
    pushToast("Đã tạo user", "success");
    void load();
  }

  async function toggleRole(user: AdminUserRow) {
    const nextRole = user.role === "admin" ? "reader" : "admin";
    setSaving(user.id);
    const response = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole, adminScope: nextRole === "admin" ? "ops" : undefined })
    });
    setSaving(null);
    if (!response.ok) {
      const msg = "Đổi role thất bại";
      setError(msg);
      pushToast(msg, "error");
      return;
    }
    pushToast(`Đã set ${user.username} → ${nextRole}`, "success");
    void load();
  }

  async function changeAdminScope(user: AdminUserRow, adminScope: AdminScope) {
    setSaving(user.id);
    const response = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminScope })
    });
    setSaving(null);
    if (!response.ok) {
      const msg = "Đổi admin scope thất bại";
      setError(msg);
      pushToast(msg, "error");
      return;
    }
    pushToast(`Đã set ${user.username} → ${scopeLabel(adminScope)}`, "success");
    void load();
  }

  async function toggleCommentBan(user: AdminUserRow, permanent = false) {
    const isBanned = user.commentBannedPermanent || Boolean(user.commentBannedUntil);
    setSaving(user.id);
    const response = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isBanned
          ? { commentBan: false }
          : { commentBan: true, commentBanPermanent: permanent, commentBanDays: 7 }
      )
    });
    setSaving(null);
    if (!response.ok) {
      const msg = "Cấm/bỏ cấm luận đạo thất bại";
      setError(msg);
      pushToast(msg, "error");
      return;
    }
    pushToast(isBanned ? `Đã bỏ cấm ${user.username}` : `Đã cấm luận đạo ${user.username}`, "success");
    void load();
  }

  function commentBanLabel(user: AdminUserRow) {
    if (user.commentBannedPermanent) return "Cấm vĩnh viễn";
    if (user.commentBannedUntil) {
      return `Cấm đến ${new Date(user.commentBannedUntil).toLocaleString("vi-VN")}`;
    }
    return "—";
  }

  return (
    <>
      <PageHeader title="Người dùng" description="Quản lý tài khoản reader và quyền admin." />
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
            {canManageAdmins ? <option value="admin">admin</option> : null}
          </select>
        </label>
        {canManageAdmins && newRole === "admin" ? (
          <label>
            Admin scope
            <select value={newAdminScope} onChange={(event) => setNewAdminScope(event.target.value as AdminScope)}>
              <option value="full">Full admin</option>
              <option value="ops">Pipeline ops</option>
              <option value="moderator">Moderator</option>
            </select>
          </label>
        ) : null}
        <div className="form-actions">
          <button type="button" className="btn" disabled={saving === "create"} onClick={() => void createUser()}>
            {saving === "create" ? "..." : "Tạo user"}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar" style={{ borderBottom: "none", paddingBottom: 0, marginBottom: 12 }}>
          <input
            placeholder="Tìm username hoặc email..."
            defaultValue={q}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                updateFilters({ q: (event.currentTarget.value || "").trim() || null });
              }
            }}
          />
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            Làm mới
          </button>
        </div>

        {loading ? <LoadingBlock variant="table" rows={6} /> : null}
        {!loading && data && data.items.length === 0 ? (
          <EmptyState title="Không tìm thấy user" description="Thử đổi từ khóa tìm kiếm." />
        ) : null}
        {!loading && data && data.items.length > 0 ? (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    {canManageAdmins ? <th>Admin scope</th> : null}
                    <th>Luận đạo</th>
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
                      {canManageAdmins ? (
                        <td>
                          {user.role === "admin" ? (
                            <select
                              value={user.adminScope ?? "full"}
                              disabled={saving === user.id}
                              onChange={(event) => void changeAdminScope(user, event.target.value as AdminScope)}
                            >
                              <option value="full">Full admin</option>
                              <option value="ops">Pipeline ops</option>
                              <option value="moderator">Moderator</option>
                            </select>
                          ) : (
                            "—"
                          )}
                        </td>
                      ) : null}
                      <td style={{ fontSize: "0.82rem" }}>{commentBanLabel(user)}</td>
                      <td style={{ fontSize: "0.82rem" }}>{new Date(user.createdAt).toLocaleDateString("vi-VN")}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {canManageAdmins ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={saving === user.id}
                              onClick={() => void toggleRole(user)}
                            >
                              {user.role === "admin" ? "Demote" : "Promote admin"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={saving === user.id}
                            onClick={() => void toggleCommentBan(user)}
                          >
                            {user.commentBannedPermanent || user.commentBannedUntil ? "Bỏ cấm chat" : "Cấm 7 ngày"}
                          </button>
                          {!(user.commentBannedPermanent || user.commentBannedUntil) ? (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              disabled={saving === user.id}
                              onClick={() => setConfirmBan(user)}
                            >
                              Cấm vĩnh viễn
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page <= 1}
                onClick={() => updateFilters({ page: String(page - 1) })}
              >
                Trước
              </button>
              <span>
                Trang {data.page}/{data.totalPages} · {data.total} user
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page >= data.totalPages}
                onClick={() => updateFilters({ page: String(page + 1) })}
              >
                Sau
              </button>
            </div>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(confirmBan)}
        title="Cấm luận đạo vĩnh viễn?"
        message={`Người dùng ${confirmBan?.username ?? ""} sẽ không thể bình luận trên reader.`}
        confirmLabel="Cấm vĩnh viễn"
        danger
        onCancel={() => setConfirmBan(null)}
        onConfirm={() => {
          if (confirmBan) void toggleCommentBan(confirmBan, true);
          setConfirmBan(null);
        }}
      />
    </>
  );
}
