import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { getCharMapContent, updateCharMapContent } from "@/lib/admin-jobs";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ storyId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storyId } = await context.params;
  const data = await getCharMapContent(storyId);
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storyId } = await context.params;
  const body = (await request.json().catch(() => null)) as { content?: unknown } | null;
  if (!body || typeof body.content !== "string") {
    return NextResponse.json({ error: "content string required" }, { status: 400 });
  }

  await updateCharMapContent(storyId, body.content.trim() || null);
  const data = await getCharMapContent(storyId);
  await logAdminAction(admin, {
    action: "story.char_map",
    entityType: "story",
    entityId: storyId,
    storyId,
    summary: `Updated char map (${body.content.length} chars)`
  });
  return NextResponse.json({ ok: true, ...data });
}
