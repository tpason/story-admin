import { NextResponse } from "next/server";
import { getPipelineRunStats, listRecentPipelineRuns } from "@/lib/admin-pipeline-runs";
import { getDashboardStats, getDashboardTrends } from "@/lib/admin-stories";
import { listRecentFailedJobs } from "@/lib/admin-jobs";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [stats, pipelineStats, recentFailed, recentPipelineRuns, trends] = await Promise.all([
      getDashboardStats(),
      getPipelineRunStats(),
      listRecentFailedJobs(10),
      listRecentPipelineRuns(5),
      getDashboardTrends(7)
    ]);
    return NextResponse.json({
      ...stats,
      runningPipelineRuns: pipelineStats.runningRuns,
      failedPipelineRuns24h: pipelineStats.failedRuns24h,
      trends,
      recentFailed,
      recentPipelineRuns: recentPipelineRuns.map((run) => ({
        id: run.id,
        action: run.action,
        status: run.status,
        storyId: run.storyId,
        summary: run.summary,
        createdAt: run.createdAt
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load stats" },
      { status: 500 }
    );
  }
}
