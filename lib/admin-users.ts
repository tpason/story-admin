import { hashPassword } from "@/lib/auth";
import { normalizeAdminScope, type AdminScope } from "@/lib/admin-rbac";
import { query } from "@/lib/db";
import type { Paginated } from "@/lib/types";

export type AdminUserRow = {
  id: string;
  username: string;
  email: string | null;
  role: "reader" | "admin";
  adminScope: AdminScope | null;
  commentBannedPermanent: boolean;
  commentBannedUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

type UserDbRow = {
  id: string;
  username: string;
  email: string | null;
  role: "reader" | "admin";
  admin_scope: string | null;
  comment_banned_permanent: boolean;
  comment_banned_until: Date | null;
  created_at: Date;
  updated_at: Date;
};

function mapUser(row: UserDbRow): AdminUserRow {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    adminScope: row.role === "admin" ? normalizeAdminScope(row.admin_scope) : null,
    commentBannedPermanent: row.comment_banned_permanent,
    commentBannedUntil: row.comment_banned_until?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export async function listAdminUsers(options: { page?: number; pageSize?: number; queryText?: string } = {}) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 30));
  const offset = (page - 1) * pageSize;
  const where = ["TRUE"];
  const values: unknown[] = [];

  if (options.queryText?.trim()) {
    values.push(`%${options.queryText.trim()}%`);
    where.push(`(username ILIKE $${values.length} OR email ILIKE $${values.length})`);
  }

  const whereSql = where.join(" AND ");
  const countRows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM reader_users WHERE ${whereSql}`,
    values
  );

  values.push(pageSize, offset);
  const rows = await query<UserDbRow>(
    `
      SELECT id, username, email, role, admin_scope, comment_banned_permanent, comment_banned_until, created_at, updated_at
      FROM reader_users
      WHERE ${whereSql}
      ORDER BY role DESC, username ASC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );

  const total = Number(countRows[0]?.count ?? 0);
  return {
    items: rows.map(mapUser),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  } satisfies Paginated<AdminUserRow>;
}

export async function updateUserRole(userId: string, role: "reader" | "admin", adminScope: AdminScope = "ops") {
  const rows = await query<UserDbRow>(
    `
      UPDATE reader_users
      SET role = $2,
          admin_scope = CASE WHEN $2 = 'admin' THEN $3 ELSE NULL END,
          updated_at = now()
      WHERE id = $1
      RETURNING id, username, email, role, admin_scope, comment_banned_permanent, comment_banned_until, created_at, updated_at
    `,
    [userId, role, adminScope]
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function updateAdminScope(userId: string, adminScope: AdminScope) {
  const rows = await query<UserDbRow>(
    `
      UPDATE reader_users
      SET admin_scope = $2, updated_at = now()
      WHERE id = $1 AND role = 'admin'
      RETURNING id, username, email, role, admin_scope, comment_banned_permanent, comment_banned_until, created_at, updated_at
    `,
    [userId, adminScope]
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function createAdminUser(
  username: string,
  password: string,
  role: "reader" | "admin",
  email?: string | null,
  adminScope: AdminScope = "ops"
) {
  const normalized = username.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  const rows = await query<UserDbRow>(
    `
      INSERT INTO reader_users (username, normalized_username, email, password_hash, role, admin_scope)
      VALUES ($1, $2, NULLIF($3, ''), $4, $5, CASE WHEN $5 = 'admin' THEN $6 ELSE NULL END)
      RETURNING id, username, email, role, admin_scope, comment_banned_permanent, comment_banned_until, created_at, updated_at
    `,
    [username.trim(), normalized, email ?? "", passwordHash, role, adminScope]
  );
  return mapUser(rows[0]);
}
