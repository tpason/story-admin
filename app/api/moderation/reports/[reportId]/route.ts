import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { reviewCommentReport } from "@/lib/admin-moderation";
import { requireAdminPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ reportId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await requireAdminPermission("moderation");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { reportId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    banDays?: unknown;
    permanent?: unknown;
    note?: unknown;
  } | null;

  const action = body?.action;
  if (action !== "dismiss" && action !== "delete_comment" && action !== "ban_user") {
    return NextResponse.json({ error: "action must be dismiss, delete_comment, or ban_user" }, { status: 400 });
  }

  const banDays = typeof body?.banDays === "number" ? body.banDays : 7;
  const permanent = Boolean(body?.permanent);
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  const result = await reviewCommentReport(reportId, action, admin, { banDays, permanent, note });
  if (!result) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  await logAdminAction(admin, {
    action: `moderation.${action}`,
    entityType: "comment_report",
    entityId: reportId,
    summary: `Moderation ${action} on comment ${result.comment_id}`,
    details: { action, banDays, permanent, note }
  });

  return NextResponse.json({ ok: true });
}
