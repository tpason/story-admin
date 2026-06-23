import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { updateUserCommentBan } from "@/lib/admin-moderation";
import { updateAdminScope, updateUserRole } from "@/lib/admin-users";
import { normalizeAdminScope, type AdminScope } from "@/lib/admin-rbac";
import { requireAdmin, requireAdminPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    role?: unknown;
    adminScope?: unknown;
    commentBan?: unknown;
    commentBanDays?: unknown;
    commentBanPermanent?: unknown;
  } | null;

  if (body?.commentBan !== undefined) {
    const banAdmin = await requireAdminPermission("manage_users");
    if (!banAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (userId === admin.id) {
      return NextResponse.json({ error: "Cannot ban yourself" }, { status: 400 });
    }
    const banned = body.commentBan === true || body.commentBan === "ban";
    const ok = await updateUserCommentBan(userId, {
      banned: banned ? true : false,
      permanent: Boolean(body.commentBanPermanent),
      banDays: typeof body.commentBanDays === "number" ? body.commentBanDays : 7
    });
    if (!ok) return NextResponse.json({ error: "User not found" }, { status: 404 });
    await logAdminAction(admin, {
      action: banned ? "user.comment_ban" : "user.comment_unban",
      entityType: "user",
      entityId: userId,
      summary: banned ? `Banned user ${userId} from comments` : `Unbanned user ${userId} from comments`,
      details: { permanent: Boolean(body.commentBanPermanent), banDays: body.commentBanDays }
    });
    return NextResponse.json({ ok: true });
  }

  if (body?.adminScope !== undefined) {
    const scopeAdmin = await requireAdminPermission("manage_admins");
    if (!scopeAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (userId === admin.id) {
      return NextResponse.json({ error: "Cannot change your own scope" }, { status: 400 });
    }
    const scope = normalizeAdminScope(typeof body.adminScope === "string" ? body.adminScope : null);
    const user = await updateAdminScope(userId, scope);
    if (!user) return NextResponse.json({ error: "User not found or not admin" }, { status: 404 });
    await logAdminAction(admin, {
      action: "user.admin_scope",
      entityType: "user",
      entityId: user.id,
      summary: `Set ${user.username} admin scope → ${scope}`,
      details: { adminScope: scope }
    });
    return NextResponse.json({ ok: true, user });
  }

  const roleAdmin = await requireAdminPermission("manage_admins");
  if (!roleAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (userId === admin.id) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  const role = body?.role === "admin" ? "admin" : body?.role === "reader" ? "reader" : null;
  if (!role) return NextResponse.json({ error: "role, adminScope or commentBan required" }, { status: 400 });

  const adminScope = normalizeAdminScope(
    typeof body?.adminScope === "string" ? body.adminScope : "ops"
  ) as AdminScope;

  const user = await updateUserRole(userId, role, role === "admin" ? adminScope : "ops");
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await logAdminAction(admin, {
    action: "user.role",
    entityType: "user",
    entityId: user.id,
    summary: `Set ${user.username} role → ${role}`,
    details: { role, adminScope: user.adminScope }
  });

  return NextResponse.json({ ok: true, user });
}
