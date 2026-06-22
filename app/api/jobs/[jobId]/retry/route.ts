import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { retryAdminJob } from "@/lib/admin-jobs";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
  const ok = await retryAdminJob(jobId, Boolean(body.force));

  if (!ok) {
    return NextResponse.json({ error: "Job not found or cannot retry" }, { status: 404 });
  }
  await logAdminAction(admin, {
    action: "job.retry",
    entityType: "job",
    entityId: jobId,
    summary: `Retried job ${jobId}${body.force ? " (force)" : ""}`,
    details: { force: Boolean(body.force) }
  });
  return NextResponse.json({ ok: true });
}
