import { NextResponse } from "next/server";
import { countPendingCommentReports } from "@/lib/admin-moderation";
import { getPipelineRunStats, listRecentPipelineRuns } from "@/lib/admin-pipeline-runs";
import { getDashboardStats, getDashboardTrends, getQualityDashboardStats } from "@/lib/admin-stories";
import { listRecentFailedJobs } from "@/lib/admin-jobs";
import { hasPermission } from "@/lib/admin-rbac";
import { requireAdminPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminPermission("dashboard");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const canPipeline = hasPermission(admin.adminScope, "pipeline");
    const canJobs = hasPermission(admin.adminScope, "jobs");
    const canStories = hasPermission(admin.adminScope, "stories");

    const [stats, pipelineStats, recentFailed, recentPipelineRuns, trends, pendingModerationReports, quality] =
      await Promise.all([
        getDashboardStats(),
        canPipeline ? getPipelineRunStats() : Promise.resolve({ runningRuns: 0, failedRuns24h: 0 }),
        canJobs ? listRecentFailedJobs(10) : Promise.resolve([]),
        canPipeline ? listRecentPipelineRuns(5) : Promise.resolve([]),
        canPipeline ? getDashboardTrends(7) : Promise.resolve([]),
        hasPermission(admin.adminScope, "moderation") ? countPendingCommentReports() : Promise.resolve(0),
        canStories && canPipeline ? getQualityDashboardStats() : Promise.resolve(undefined)
      ]);

    return NextResponse.json({
      ...stats,
      runningPipelineRuns: pipelineStats.runningRuns,
      failedPipelineRuns24h: pipelineStats.failedRuns24h,
      pendingModerationReports,
      trends,
      quality,
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
