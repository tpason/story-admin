import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdminChapter, markChapterQualityFailed, markChapterQualityPassed } from "@/lib/admin-stories";
import { requireAdminPermission } from "@/lib/auth";
import { assertQualityScanSpawnAllowed } from "@/lib/pipeline-qa-guard";
import { runQualityAudit, runSmartRepair } from "@/lib/pipeline-actions";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ storyId: string; chapterNumber: string }> };

type QualityBody = {
  action?: "pass" | "fail" | "audit" | "smart_repair";
  note?: string;
  forceAction?: "repolish" | "retranslate";
};

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireAdminPermission("pipeline");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { storyId, chapterNumber } = await context.params;
  const chapterNum = Number(chapterNumber);
  if (!Number.isFinite(chapterNum)) {
    return NextResponse.json({ error: "Invalid chapter number" }, { status: 400 });
  }

  const chapter = await getAdminChapter(storyId, chapterNum);
  if (!chapter) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as QualityBody | null;
  const action = body?.action;
  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

  try {
    if (action === "pass") {
      await markChapterQualityPassed(chapter.id, body?.note);
      await logAdminAction(admin, {
        action: "quality.manual_pass",
        entityType: "chapter",
        entityId: chapter.id,
        storyId,
        chapterNumber: chapterNum,
        summary: `Đánh dấu QA pass chương ${chapterNum}`
      });
      const updated = await getAdminChapter(storyId, chapterNum);
      return NextResponse.json({ ok: true, chapter: updated });
    }

    if (action === "fail") {
      await markChapterQualityFailed(chapter.id, body?.note);
      await logAdminAction(admin, {
        action: "quality.manual_fail",
        entityType: "chapter",
        entityId: chapter.id,
        storyId,
        chapterNumber: chapterNum,
        summary: `Đánh dấu QA fail chương ${chapterNum}`
      });
      const updated = await getAdminChapter(storyId, chapterNum);
      return NextResponse.json({ ok: true, chapter: updated });
    }

    if (action === "audit") {
      const blocked = assertQualityScanSpawnAllowed(storyId, "audit_chapter", {
        fromChapter: chapterNum,
        toChapter: chapterNum
      });
      if (blocked) return blocked;

      const summary = await runQualityAudit(storyId, {
        fromChapter: chapterNum,
        toChapter: chapterNum,
        judgeSample: 1
      });
      await logAdminAction(admin, {
        action: "quality.audit_chapter",
        entityType: "chapter",
        entityId: chapter.id,
        storyId,
        chapterNumber: chapterNum,
        summary: `Quét QA chương ${chapterNum}`,
        details: summary as Record<string, unknown>
      });
      const updated = await getAdminChapter(storyId, chapterNum);
      return NextResponse.json({ ok: true, summary, chapter: updated });
    }

    if (action === "smart_repair") {
      const forceAction =
        body?.forceAction === "repolish" || body?.forceAction === "retranslate" ? body.forceAction : undefined;
      const repair = await runSmartRepair(storyId, [chapterNum], { forceAction });
      const first = repair.results[0] as { ok?: boolean; action?: string; error?: string } | undefined;
      if (!first?.ok) {
        return NextResponse.json(
          { error: first?.error ?? "Không enqueue được sửa — kiểm tra mã lỗi QA hoặc số lần repair" },
          { status: 400 }
        );
      }
      await logAdminAction(admin, {
        action: "quality.smart_repair_chapter",
        entityType: "chapter",
        entityId: chapter.id,
        storyId,
        chapterNumber: chapterNum,
        summary: `Sửa thông minh chương ${chapterNum} → ${first.action ?? "repair"}`,
        details: repair as Record<string, unknown>
      });
      const updated = await getAdminChapter(storyId, chapterNum);
      return NextResponse.json({ ok: true, repair, chapter: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Quality action failed" },
      { status: 500 }
    );
  }
}
