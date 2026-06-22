import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { enqueueAudioJob, enqueueAudioSegmentsJob, enqueuePolishJob } from "@/lib/admin-jobs";
import { repolishChapter, retranslateChapter } from "@/lib/pipeline-actions";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ storyId: string; chapterNumber: string }> };

async function forceResetJob(chapterId: string, jobType: string) {
  await query(
    `
      UPDATE story_jobs
      SET status = 'pending', attempts = 0, run_after = now(),
          locked_by = NULL, locked_at = NULL, last_error = NULL, updated_at = now()
      WHERE job_type = $2 AND chapter_id = $1 AND status != 'running'
    `,
    [chapterId, jobType]
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storyId, chapterNumber } = await context.params;
  const chapterNum = Number(chapterNumber);
  if (!Number.isFinite(chapterNum)) {
    return NextResponse.json({ error: "Invalid chapter number" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    force?: boolean;
    forceRunning?: boolean;
    clearAudio?: boolean;
    voiceKey?: string;
  };
  const action = body.action ?? "polish";
  const voiceKey = body.voiceKey ?? "preset_binh_an";

  try {
    if (action === "repolish") {
      const bulk = await repolishChapter(storyId, chapterNum, {
        forceRunning: Boolean(body.forceRunning ?? body.force)
      });
      await logAdminAction(admin, {
        action: "pipeline.repolish",
        entityType: "chapter",
        entityId: storyId,
        storyId,
        chapterNumber: chapterNum,
        summary: `Re-polish ch.${chapterNum}`,
        details: bulk.payload
      });
      return NextResponse.json({ ok: true, action: "repolish", chapterNumber: chapterNum, ...bulk });
    }

    if (action === "retranslate") {
      const bulk = await retranslateChapter(storyId, chapterNum, {
        forceRunning: Boolean(body.forceRunning ?? body.force)
      });
      await logAdminAction(admin, {
        action: "pipeline.retranslate",
        entityType: "chapter",
        entityId: storyId,
        storyId,
        chapterNumber: chapterNum,
        summary: `Re-translate ch.${chapterNum}`,
        details: bulk.payload
      });
      return NextResponse.json({ ok: true, action: "retranslate", chapterNumber: chapterNum, ...bulk });
    }

    if (action === "polish") {
      const ctx = await enqueuePolishJob(storyId, chapterNum);
      if (body.force) await forceResetJob(ctx.chapterId, "polish_chapter");
      await logAdminAction(admin, {
        action: "enqueue.polish",
        entityType: "chapter",
        entityId: ctx.chapterId,
        storyId,
        chapterNumber: chapterNum,
        summary: `Enqueue polish ch.${chapterNum}`
      });
      return NextResponse.json({ ok: true, action: "polish", chapterId: ctx.chapterId });
    }

    if (action === "audio") {
      const result = await enqueueAudioJob(storyId, chapterNum, voiceKey);
      if (body.force) await forceResetJob(result.chapterId, "audio_chapter");
      await logAdminAction(admin, {
        action: "enqueue.audio",
        entityType: "chapter",
        entityId: result.chapterId,
        storyId,
        chapterNumber: chapterNum,
        summary: `Enqueue audio ch.${chapterNum}`
      });
      return NextResponse.json({ ok: true, action: "audio", ...result });
    }

    if (action === "audio_segments") {
      const result = await enqueueAudioSegmentsJob(storyId, chapterNum, voiceKey);
      if (body.force) await forceResetJob(result.chapterId, "audio_chapter_segments");
      await logAdminAction(admin, {
        action: "enqueue.audio_segments",
        entityType: "chapter",
        entityId: result.chapterId,
        storyId,
        chapterNumber: chapterNum,
        summary: `Enqueue ${result.segmentCount} audio segments ch.${chapterNum}`,
        details: { segmentCount: result.segmentCount }
      });
      return NextResponse.json({ ok: true, action: "audio_segments", ...result });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Enqueue failed" },
      { status: 500 }
    );
  }
}
