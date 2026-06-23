import { promisify } from "node:util";
import { cookies } from "next/headers";
import { hasPermission, normalizeAdminScope, type AdminPermission, type AdminScope } from "@/lib/admin-rbac";
import { query } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth-constants";

export { SESSION_COOKIE };
const SESSION_DAYS = 14;
const PASSWORD_KEY_LENGTH = 64;

export type AdminUser = {
  id: string;
  username: string;
  email: string | null;
  adminScope: AdminScope;
};

type UserRow = {
  id: string;
  username: string;
  email: string | null;
  password_hash: string;
  role: "reader" | "admin";
  admin_scope: string | null;
};

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

async function cryptoModule() {
  return import("node:crypto");
}

async function hashToken(token: string) {
  const { createHash } = await cryptoModule();
  return createHash("sha256").update(token).digest("hex");
}

function mapUser(row: Pick<UserRow, "id" | "username" | "email" | "admin_scope">): AdminUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    adminScope: normalizeAdminScope(row.admin_scope)
  };
}

export function cleanAuthInput(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function hashPassword(password: string) {
  const { randomBytes, scrypt: scryptCallback } = await cryptoModule();
  const scrypt = promisify(scryptCallback);
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, passwordHash: string) {
  const { scrypt: scryptCallback, timingSafeEqual } = await cryptoModule();
  const scrypt = promisify(scryptCallback);
  const [algorithm, salt, storedKey] = passwordHash.split("$");
  if (algorithm !== "scrypt" || !salt || !storedKey) return false;

  const derivedKey = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
  const storedBuffer = Buffer.from(storedKey, "hex");
  if (storedBuffer.length !== derivedKey.length) return false;
  return timingSafeEqual(storedBuffer, derivedKey);
}

export async function findAdminByUsername(username: string) {
  const rows = await query<UserRow>(
    `
      SELECT id, username, email, password_hash, role, admin_scope
      FROM reader_users
      WHERE normalized_username = $1 AND role = 'admin'
      LIMIT 1
    `,
    [normalizeUsername(username)]
  );
  return rows[0] ?? null;
}

export async function createSession(userId: string) {
  const { randomBytes } = await cryptoModule();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO reader_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    path: "/",
    expires: expiresAt
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await query("DELETE FROM reader_sessions WHERE token_hash = $1", [await hashToken(token)]);
  }

  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    path: "/",
    maxAge: 0
  });
}

export async function getCurrentAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await query<UserRow>(
    `
      SELECT u.id, u.username, u.email, u.password_hash, u.role, u.admin_scope
      FROM reader_sessions s
      JOIN reader_users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()
        AND u.role = 'admin'
      LIMIT 1
    `,
    [await hashToken(token)]
  );

  return rows[0] ? mapUser(rows[0]) : null;
}

export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  return admin;
}

export async function requireAdminPermission(permission: AdminPermission) {
  const admin = await requireAdmin();
  if (!admin) return null;
  if (!hasPermission(admin.adminScope, permission)) return null;
  return admin;
}
