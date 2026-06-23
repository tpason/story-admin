import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { listPipelineRuns } from "@/lib/admin-pipeline-runs";
import { isAsyncPipelineAction, startAsyncPipelineRun } from "@/lib/pipeline-async";
import { requireAdminPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await requireAdminPermission("pipeline");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = request.nextUrl.searchParams;
  const data = await listPipelineRuns({
    page: Number(params.get("page") ?? 1),
    pageSize: Number(params.get("pageSize") ?? 20),
    status: params.get("status") ?? undefined,
    action: params.get("action") ?? undefined,
    storyId: params.get("storyId") ?? undefined
  });

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminPermission("pipeline");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    storyId?: string;
    args?: Record<string, unknown>;
  } | null;

  const action = body?.action?.trim();
  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

  if (!isAsyncPipelineAction(action)) {
    return NextResponse.json({ error: `Action ${action} không hỗ trợ async. Dùng /api/stories/.../pipeline` }, { status: 400 });
  }

  const args = { ...(body?.args ?? {}) };
  if (body?.storyId) {
    if (action === "crawl_story" || action === "translate_metadata") {
      args.storyId = body.storyId;
    }
  }

  try {
    const run = await startAsyncPipelineRun(admin, {
      action,
      storyId: body?.storyId ?? null,
      args
    });

    await logAdminAction(admin, {
      action: `pipeline.run.${action}`,
      entityType: "pipeline_run",
      entityId: run.id,
      storyId: body?.storyId ?? null,
      summary: `Started ${action}`,
      details: { runId: run.id, args }
    });

    return NextResponse.json({ ok: true, run });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể chạy pipeline script" },
      { status: 500 }
    );
  }
}
