import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { updateUserRole } from "@/lib/admin-users";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await context.params;
  if (userId === admin.id) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { role?: unknown } | null;
  const role = body?.role === "admin" ? "admin" : body?.role === "reader" ? "reader" : null;
  if (!role) return NextResponse.json({ error: "role must be admin or reader" }, { status: 400 });

  const user = await updateUserRole(userId, role);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await logAdminAction(admin, {
    action: "user.role",
    entityType: "user",
    entityId: user.id,
    summary: `Set ${user.username} role → ${role}`,
    details: { role }
  });

  return NextResponse.json({ ok: true, user });
}
