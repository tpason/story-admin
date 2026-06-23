import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdminChapter, updateAdminChapter } from "@/lib/admin-stories";
import { requireAdminPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ storyId: string; chapterNumber: string }> };

function cleanText(value: unknown, maxLength: number) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const admin = await requireAdminPermission("stories");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { storyId, chapterNumber } = await context.params;
  const chapterNum = Number(chapterNumber);
  if (!Number.isFinite(chapterNum)) {
    return NextResponse.json({ error: "Invalid chapter number" }, { status: 400 });
  }

  const chapter = await getAdminChapter(storyId, chapterNum);
  if (!chapter) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  return NextResponse.json(chapter);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await requireAdminPermission("stories");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { storyId, chapterNumber } = await context.params;
  const chapterNum = Number(chapterNumber);
  if (!Number.isFinite(chapterNum)) {
    return NextResponse.json({ error: "Invalid chapter number" }, { status: 400 });
  }

  const existing = await getAdminChapter(storyId, chapterNum);
  if (!existing) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  await updateAdminChapter(existing.id, {
    title: cleanText(body.title, 360),
    polishedContent: typeof body.polishedContent === "string" ? body.polishedContent : undefined,
    translatedContent: typeof body.translatedContent === "string" ? body.translatedContent : undefined,
    rawContent: typeof body.rawContent === "string" ? body.rawContent : undefined,
    isPolished: typeof body.isPolished === "boolean" ? body.isPolished : undefined,
    isTranslated: typeof body.isTranslated === "boolean" ? body.isTranslated : undefined
  });

  const chapter = await getAdminChapter(storyId, chapterNum);
  await logAdminAction(admin, {
    action: "chapter.update",
    entityType: "chapter",
    entityId: existing.id,
    storyId,
    chapterNumber: chapterNum,
    summary: `Updated chapter ${chapterNum}: ${chapter?.title ?? ""}`
  });
  return NextResponse.json({ ok: true, chapter });
}
