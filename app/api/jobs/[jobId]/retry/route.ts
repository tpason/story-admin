import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { retryAdminJob } from "@/lib/admin-jobs";
import { requireAdminPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireAdminPermission("jobs");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
