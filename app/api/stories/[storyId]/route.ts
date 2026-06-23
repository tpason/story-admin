import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdminStory, updateAdminStory } from "@/lib/admin-stories";
import { requireAdminPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ storyId: string }> };

function cleanText(value: unknown, maxLength: number) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function cleanCoverUrl(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return trimmed.slice(0, 2000);
  } catch {
    return undefined;
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const admin = await requireAdminPermission("stories");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { storyId } = await context.params;
  const story = await getAdminStory(storyId);
  if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });
  return NextResponse.json(story);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await requireAdminPermission("stories");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
    ...(body.coverImageUrl !== undefined ? { coverImageUrl: cleanCoverUrl(body.coverImageUrl) ?? null } : {}),
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
