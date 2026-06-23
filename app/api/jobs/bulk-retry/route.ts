import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { bulkRetryFailedJobs } from "@/lib/admin-jobs";
import { requireAdminPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

type BulkRetryBody = {
  storyId?: string;
  jobIds?: string[];
  limit?: number;
};

export async function POST(request: NextRequest) {
  const admin = await requireAdminPermission("jobs");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as BulkRetryBody | null;
  const count = await bulkRetryFailedJobs({
    storyId: body?.storyId,
    jobIds: body?.jobIds,
    limit: body?.limit
  });

  await logAdminAction(admin, {
    action: "jobs.bulk_retry",
    entityType: "job",
    summary: `Bulk retry ${count} failed jobs`,
    details: { count, storyId: body?.storyId ?? null }
  });

  return NextResponse.json({ ok: true, count });
}
