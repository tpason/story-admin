import { NextRequest, NextResponse } from "next/server";
import { getAdminChapter } from "@/lib/admin-stories";
import { streamChapterAudio } from "@/lib/chapter-audio";
import { requireAdminPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ storyId: string; chapterNumber: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const admin = await requireAdminPermission("stories");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { storyId, chapterNumber } = await context.params;
  const chapterNum = Number(chapterNumber);
  if (!Number.isFinite(chapterNum)) {
    return NextResponse.json({ error: "Invalid chapter number" }, { status: 400 });
  }

  const chapter = await getAdminChapter(storyId, chapterNum);
  if (!chapter?.audioPath) {
    return NextResponse.json({ error: "No audio for this chapter" }, { status: 404 });
  }

  try {
    return streamChapterAudio(chapter.audioPath, request);
  } catch {
    return NextResponse.json({ error: "Audio file missing on disk" }, { status: 404 });
  }
}
