import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { bulkEnqueueChapters, type BulkEnqueueAction } from "@/lib/admin-jobs";
import { bulkPipelineChapters, resolveChapterNumbers, type PipelineChapterAction } from "@/lib/pipeline-actions";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ storyId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storyId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    chapterNumbers?: unknown;
    fromChapter?: unknown;
    toChapter?: unknown;
    qualityOnly?: unknown;
    force?: unknown;
    forceRunning?: unknown;
    clearAudio?: unknown;
    voiceKey?: unknown;
  } | null;

  const action = String(body?.action ?? "");
  const pipelineActions: PipelineChapterAction[] = ["repolish", "retranslate"];
  const enqueueActions: BulkEnqueueAction[] = ["polish", "audio", "audio_segments"];

  if (!action || (!pipelineActions.includes(action as PipelineChapterAction) && !enqueueActions.includes(action as BulkEnqueueAction))) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const chapterNumbersFromBody = Array.isArray(body?.chapterNumbers)
    ? body.chapterNumbers
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.floor(value))
    : [];

  const qualityOnly = Boolean(body?.qualityOnly);
  let chapterNumbers = chapterNumbersFromBody;
  if (!chapterNumbers.length && !qualityOnly) {
    chapterNumbers = await resolveChapterNumbers(storyId, {
      fromChapter: body?.fromChapter ? Number(body.fromChapter) : undefined,
      toChapter: body?.toChapter ? Number(body.toChapter) : undefined
    });
  }

  if (!chapterNumbers.length && !qualityOnly) {
    return NextResponse.json({ error: "chapterNumbers or chapter range required" }, { status: 400 });
  }

  if (pipelineActions.includes(action as PipelineChapterAction)) {
    const bulk = await bulkPipelineChapters(storyId, chapterNumbers, action as PipelineChapterAction, {
      forceRunning: Boolean(body?.forceRunning ?? body?.force),
      qualityOnly,
      fromChapter: body?.fromChapter ? Number(body.fromChapter) : undefined,
      toChapter: body?.toChapter ? Number(body.toChapter) : undefined
    });
    const results = bulk.results;
    const okCount = results.filter((item) => item.ok).length;
    await logAdminAction(admin, {
      action: `bulk.${action}`,
      entityType: "story",
      entityId: storyId,
      storyId,
      summary: `Bulk ${action}: ${okCount}/${results.length} chapters`,
      details: { action, results, chapterNumbers }
    });
    return NextResponse.json({ ok: true, results, chapterNumbers });
  }

  const results = await bulkEnqueueChapters(storyId, chapterNumbers, action as BulkEnqueueAction, {
    force: Boolean(body?.force),
    voiceKey: typeof body?.voiceKey === "string" ? body.voiceKey : "preset_binh_an"
  });

  const okCount = results.filter((item) => item.ok).length;
  await logAdminAction(admin, {
    action: `bulk.${action}`,
    entityType: "story",
    entityId: storyId,
    storyId,
    summary: `Bulk ${action}: ${okCount}/${results.length} chapters`,
    details: { action, results }
  });

  return NextResponse.json({ ok: true, results });
}
