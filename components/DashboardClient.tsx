"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { PageHeader } from "@/components/ui/PageHeader";
import { hasPermission, type AdminScope } from "@/lib/admin-rbac";
import type { AdminJobRow, DashboardStats, DashboardTrendDay, PipelineRunSummary, QualityDashboardStats } from "@/lib/types";

type DashboardPayload = DashboardStats & {
  recentFailed: AdminJobRow[];
  recentPipelineRuns: PipelineRunSummary[];
  trends: DashboardTrendDay[];
  quality?: QualityDashboardStats;
};

type DashboardClientProps = {
  adminScope?: AdminScope;
};

const RUN_ACTION_LABELS: Record<string, string> = {
  discover: "Discovery",
  crawl_stories: "Crawl batch",
  crawl_story: "Crawl story",
  translate_metadata: "Dịch metadata",
  audit: "QA audit",
  audit_fast: "QA nhanh",
  repair: "QA + sửa"
};

function runStatusBadge(status: string) {
  switch (status) {
    case "running":
      return "badge badge-warn";
    case "done":
      return "badge badge-success";
    case "failed":
      return "badge badge-danger";
    default:
      return "badge badge-muted";
  }
}

function jobStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return "badge badge-muted";
    case "running":
      return "badge badge-warn";
    case "done":
      return "badge badge-success";
    case "failed":
      return "badge badge-danger";
    default:
      return "badge badge-muted";
  }
}

function formatTrendDate(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function trendMax(values: number[]) {
  return Math.max(1, ...values);
}

export function DashboardClient({ adminScope = "full" }: DashboardClientProps) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canStories = hasPermission(adminScope, "stories");
  const canJobs = hasPermission(adminScope, "jobs");
  const canPipeline = hasPermission(adminScope, "pipeline");
  const canModeration = hasPermission(adminScope, "moderation");

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/dashboard");
      if (!response.ok) {
        setError("Không tải được thống kê");
        return;
      }
      setData((await response.json()) as DashboardPayload);
    })();
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) {
    return (
      <>
        <PageHeader title="Tổng quan" description="Thống kê pipeline và hoạt động gần đây." />
        <LoadingBlock variant="stats" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Tổng quan"
        description="Thống kê pipeline và hoạt động gần đây."
        actions={
          <>
            {canPipeline ? (
              <>
                <Link href="/operations" className="btn btn-secondary">
                  Scripts
                </Link>
                <Link href="/activity" className="btn btn-secondary">
                  Nhật ký
                </Link>
              </>
            ) : null}
            {canJobs ? (
              <Link href="/jobs" className="btn btn-secondary">
                Hàng đợi
              </Link>
            ) : null}
            {canModeration ? (
              <Link href="/moderation" className="btn btn-secondary">
                Kiểm duyệt
              </Link>
            ) : null}
          </>
        }
      />

      <div className="stats-grid">
        {canModeration ? (
          <div className={`stat-card${data.pendingModerationReports > 0 ? " warning" : ""}`}>
            <strong>{data.pendingModerationReports}</strong>
            <span>Báo cáo chờ duyệt</span>
          </div>
        ) : null}
        {canStories ? (
          <>
            <div className="stat-card">
              <strong>{data.totalStories}</strong>
              <span>Truyện ({data.activeStories} đang active)</span>
            </div>
            <div className="stat-card">
              <strong>{data.totalChapters}</strong>
              <span>Chapters</span>
            </div>
            <div className="stat-card accent">
              <strong>{data.polishedChapters}</strong>
              <span>Đã polish</span>
            </div>
            <div className="stat-card">
              <strong>{data.translatedChapters}</strong>
              <span>Đã dịch</span>
            </div>
            <div className="stat-card">
              <strong>{data.audioChapters}</strong>
              <span>Có audio</span>
            </div>
          </>
        ) : null}
        {canJobs ? (
          <>
            <div className="stat-card warning">
              <strong>{data.pendingJobs}</strong>
              <span>Jobs chờ xử lý</span>
            </div>
            <div className="stat-card">
              <strong>{data.runningJobs}</strong>
              <span>Jobs đang chạy</span>
            </div>
            <div className="stat-card danger">
              <strong>{data.failedJobs}</strong>
              <span>Jobs thất bại</span>
            </div>
          </>
        ) : null}
        {canPipeline ? (
          <>
            <div className="stat-card">
              <strong>{data.runningPipelineRuns}</strong>
              <span>Scripts đang chạy</span>
            </div>
            <div className="stat-card danger">
              <strong>{data.failedPipelineRuns24h}</strong>
              <span>Scripts lỗi (24h)</span>
            </div>
          </>
        ) : null}
        {canPipeline && data.quality ? (
          <>
            <div className={`stat-card danger${data.quality.qaFailed > 0 ? "" : ""}`}>
              <strong>{data.quality.qaFailed}</strong>
              <span>Chapter QA lỗi</span>
            </div>
            <div className="stat-card warning">
              <strong>{data.quality.qaPending}</strong>
              <span>Chưa quét QA</span>
            </div>
            <div className="stat-card accent">
              <strong>{data.quality.qaPassed}</strong>
              <span>Đạt QA</span>
            </div>
            <div className="stat-card">
              <strong>{data.quality.storiesWithQaFailed}</strong>
              <span>Truyện có lỗi QA</span>
            </div>
          </>
        ) : null}
      </div>

      {canPipeline && data.quality && (data.quality.qaFailed > 0 || data.quality.qaPending > 0) ? (
        <div className="alert alert-info" style={{ marginTop: 16 }}>
          Có {data.quality.qaFailed} chapter lỗi QA trên {data.quality.storiesWithQaFailed} truyện.{" "}
          <Link href="/quality">Mở trang QA triage →</Link>
        </div>
      ) : null}

      {canPipeline && data.trends?.length ? (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="panel-header">
            <div>
              <h2>Xu hướng 7 ngày</h2>
              <p>Polished chapters, jobs và QA lỗi theo ngày</p>
            </div>
          </div>
          <div className="trend-legend">
            <span><span className="trend-swatch polished" aria-hidden /> Polished</span>
            <span><span className="trend-swatch done" aria-hidden /> Jobs done</span>
            <span><span className="trend-swatch failed" aria-hidden /> Jobs failed</span>
            <span><span className="trend-swatch pipeline" aria-hidden /> Scripts failed</span>
            <span><span className="trend-swatch qa" aria-hidden /> QA lỗi (quét)</span>
          </div>
          <div className="trend-chart">
            {data.trends.map((day) => {
              const max = trendMax([
                day.polishedChapters,
                day.jobsDone,
                day.jobsFailed,
                day.pipelineRunsFailed,
                day.qaFailedChapters
              ]);
              return (
                <div key={day.date} className="trend-column">
                  <div className="trend-bars" aria-hidden>
                    <div
                      className="trend-bar polished"
                      style={{ height: `${(day.polishedChapters / max) * 100}%` }}
                      title={`Polished: ${day.polishedChapters}`}
                    />
                    <div
                      className="trend-bar done"
                      style={{ height: `${(day.jobsDone / max) * 100}%` }}
                      title={`Jobs done: ${day.jobsDone}`}
                    />
                    <div
                      className="trend-bar failed"
                      style={{ height: `${(day.jobsFailed / max) * 100}%` }}
                      title={`Jobs failed: ${day.jobsFailed}`}
                    />
                    <div
                      className="trend-bar pipeline"
                      style={{ height: `${(day.pipelineRunsFailed / max) * 100}%` }}
                      title={`Scripts failed: ${day.pipelineRunsFailed}`}
                    />
                    <div
                      className="trend-bar qa"
                      style={{ height: `${(day.qaFailedChapters / max) * 100}%` }}
                      title={`QA lỗi: ${day.qaFailedChapters}`}
                    />
                  </div>
                  <div className="trend-label">{formatTrendDate(day.date)}</div>
                  <div className="trend-values">
                    <span>P {day.polishedChapters}</span>
                    <span>✓ {day.jobsDone}</span>
                    <span>✗ {day.jobsFailed}</span>
                    <span>Q {day.qaFailedChapters}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {canPipeline ? (
      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-header">
          <div>
            <h2>Pipeline scripts gần đây</h2>
            <p>Discovery, crawl và các script chạy thủ công</p>
          </div>
          <Link href="/operations" className="btn btn-ghost btn-sm">
            Xem tất cả
          </Link>
        </div>
        {data.recentPipelineRuns.length === 0 ? (
          <EmptyState title="Chưa có script nào chạy" description="Chạy discovery hoặc crawl từ trang Scripts." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Action</th>
                  <th>Trạng thái</th>
                  <th>Story</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.recentPipelineRuns.map((run) => (
                  <tr key={run.id}>
                    <td>{new Date(run.createdAt).toLocaleString("vi-VN")}</td>
                    <td>{RUN_ACTION_LABELS[run.action] ?? run.action}</td>
                    <td>
                      <span className={runStatusBadge(run.status)}>{run.status}</span>
                    </td>
                    <td>
                      {run.storyId && canStories ? (
                        <Link href={`/stories/${run.storyId}`}>{run.storyId.slice(0, 8)}…</Link>
                      ) : run.storyId ? (
                        run.storyId.slice(0, 8) + "…"
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Link href={`/operations?run=${run.id}`} className="btn btn-ghost btn-sm">
                        Xem log
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      ) : null}

      {canJobs ? (
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Jobs thất bại gần đây</h2>
            <p>Các job polish/dịch/audio cần xử lý</p>
          </div>
          <Link href="/jobs?status=failed" className="btn btn-ghost btn-sm">
            Xem tất cả
          </Link>
        </div>
        {data.recentFailed.length === 0 ? (
          <EmptyState title="Không có job thất bại" description="Pipeline đang chạy ổn định." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Loại</th>
                  <th>Trạng thái</th>
                  <th>Truyện</th>
                  <th>Chapter</th>
                  <th>Lỗi</th>
                </tr>
              </thead>
              <tbody>
                {data.recentFailed.map((job) => (
                  <tr key={job.id}>
                    <td>{job.jobType}</td>
                    <td>
                      <span className={jobStatusBadge(job.status)}>{job.status}</span>
                    </td>
                    <td>
                      {job.storyId && canStories ? (
                        <Link href={`/stories/${job.storyId}`}>{job.storyTitle ?? job.storyId}</Link>
                      ) : (
                        job.storyTitle ?? job.storyId ?? "—"
                      )}
                    </td>
                    <td>
                      {job.storyId && job.chapterNumber && canStories ? (
                        <Link href={`/stories/${job.storyId}/chapters/${job.chapterNumber}`}>
                          Ch.{job.chapterNumber}
                        </Link>
                      ) : job.chapterNumber ? (
                        `Ch.${job.chapterNumber}`
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ fontSize: "0.82rem", color: "var(--muted)", maxWidth: 320 }}>
                      <details>
                        <summary style={{ cursor: "pointer" }}>{job.lastError?.slice(0, 80) ?? "—"}</summary>
                        {job.lastError}
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      ) : null}

      {!canStories && !canJobs && !canPipeline && canModeration ? (
        <div className="panel">
          <EmptyState
            title="Moderator dashboard"
            description="Dùng Kiểm duyệt để xử lý báo cáo bình luận và Người dùng để cấm luận đạo."
            action={
              <Link href="/moderation" className="btn">
                Mở kiểm duyệt
              </Link>
            }
          />
        </div>
      ) : null}
    </>
  );
}
