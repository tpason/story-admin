import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdminStory, updateAdminStory } from "@/lib/admin-stories";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ storyId: string }> };

function cleanText(value: unknown, maxLength: number) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storyId } = await context.params;
  const story = await getAdminStory(storyId);
  if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });
  return NextResponse.json(story);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storyId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const totalChapters =
    body.totalChapters === undefined
      ? undefined
      : Number.isFinite(Number(body.totalChapters))
        ? Math.max(0, Math.floor(Number(body.totalChapters)))
        : undefined;

  await updateAdminStory(storyId, {
    title: cleanText(body.title, 360),
    displayTitle: cleanText(body.displayTitle, 360),
    originalTitle: cleanText(body.originalTitle, 360),
    author: cleanText(body.author, 240),
    description: cleanText(body.description, 8000),
    category: cleanText(body.category, 120),
    status: cleanText(body.status, 120),
    totalChapters: totalChapters ?? null,
    isCompleted: typeof body.isCompleted === "boolean" ? body.isCompleted : undefined,
    isActive: typeof body.isActive === "boolean" ? body.isActive : undefined
  });

  const story = await getAdminStory(storyId);
  await logAdminAction(admin, {
    action: "story.update",
    entityType: "story",
    entityId: storyId,
    storyId,
    summary: `Updated story ${story?.displayTitle || story?.title || storyId}`
  });
  return NextResponse.json({ ok: true, story });
}
