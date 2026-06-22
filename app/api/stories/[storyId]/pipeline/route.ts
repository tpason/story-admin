import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/auth";
import { startAsyncPipelineRun } from "@/lib/pipeline-async";
import {
  bulkPipelineChapters,
  requestChapterRecrawl,
  requestStoryRecrawl,
  resolveChapterNumbers,
  type PipelineChapterAction,
  type PipelineStoryAction
} from "@/lib/pipeline-actions";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ storyId: string }> };

type PipelineBody = {
  action?: string;
  fromChapter?: number;
  toChapter?: number;
  chapterNumbers?: number[];
  qualityOnly?: boolean;
  forceRunning?: boolean;
  clearAudio?: boolean;
  clearRaw?: boolean;
  skipStory?: boolean;
  skipChapterTitles?: boolean;
};

function parseChapterNumbers(body: PipelineBody | null) {
  if (!Array.isArray(body?.chapterNumbers)) return undefined;
  return body.chapterNumbers
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.floor(value));
}

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storyId } = await context.params;
  const body = (await request.json().catch(() => null)) as PipelineBody | null;
  const action = body?.action;
  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

  const rangeOptions = {
    chapterNumbers: parseChapterNumbers(body),
    fromChapter: body?.fromChapter ? Number(body.fromChapter) : undefined,
    toChapter: body?.toChapter ? Number(body.toChapter) : undefined,
    qualityOnly: Boolean(body?.qualityOnly)
  };

  try {
    if (action === "recrawl") {
      const result = await requestStoryRecrawl(storyId);
      await logAdminAction(admin, {
        action: "pipeline.recrawl",
        entityType: "story",
        entityId: storyId,
        storyId,
        summary: `Yêu cầu re-crawl catalog: ${result.title}`
      });
      return NextResponse.json({ ok: true, action, story: result });
    }

    if (action === "recrawl_chapters") {
      const result = await requestChapterRecrawl(storyId, {
        ...rangeOptions,
        clearRaw: Boolean(body?.clearRaw)
      });
      await logAdminAction(admin, {
        action: "pipeline.recrawl_chapters",
        entityType: "story",
        entityId: storyId,
        storyId,
        summary: `Re-crawl ${result.updated} chapters`,
        details: result
      });
      return NextResponse.json({ ok: true, action, ...result });
    }

    if (action === "translate_metadata") {
      const run = await startAsyncPipelineRun(admin, {
        action: "translate_metadata",
        storyId,
        args: {
          storyId,
          skipStory: Boolean(body?.skipStory),
          skipChapterTitles: Boolean(body?.skipChapterTitles),
          fromChapter: rangeOptions.fromChapter,
          toChapter: rangeOptions.toChapter
        }
      });
      await logAdminAction(admin, {
        action: "pipeline.translate_metadata",
        entityType: "pipeline_run",
        entityId: run.id,
        storyId,
        summary: "Dịch metadata (async)",
        details: { runId: run.id, ...rangeOptions }
      });
      return NextResponse.json({ ok: true, action, run, async: true });
    }

    if (action === "repolish" || action === "retranslate") {
      const chapterAction = action as PipelineChapterAction;
      let chapterNumbers = rangeOptions.chapterNumbers ?? [];
      if (!chapterNumbers.length && !rangeOptions.qualityOnly) {
        chapterNumbers = await resolveChapterNumbers(storyId, rangeOptions);
      }
      if (!chapterNumbers.length && !rangeOptions.qualityOnly) {
        return NextResponse.json({ error: "Không có chapter nào khớp filter" }, { status: 400 });
      }

      const bulk = await bulkPipelineChapters(storyId, chapterNumbers, chapterAction, {
        forceRunning: Boolean(body?.forceRunning),
        qualityOnly: rangeOptions.qualityOnly,
        fromChapter: rangeOptions.fromChapter,
        toChapter: rangeOptions.toChapter
      });
      const results = bulk.results;
      const okCount = results.filter((item) => item.ok).length;

      await logAdminAction(admin, {
        action: `pipeline.${chapterAction}`,
        entityType: "story",
        entityId: storyId,
        storyId,
        summary: `${chapterAction}: ${okCount}/${results.length} chapters`,
        details: { results, payload: bulk.payload, ...rangeOptions }
      });

      return NextResponse.json({ ok: true, action, results, chapterNumbers: bulk.payload?.chapter_numbers ?? chapterNumbers });
    }

    const known: PipelineStoryAction[] = ["recrawl", "recrawl_chapters", "translate_metadata"];
    if (!known.includes(action as PipelineStoryAction) && action !== "repolish" && action !== "retranslate") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pipeline action failed" },
      { status: 500 }
    );
  }
}
