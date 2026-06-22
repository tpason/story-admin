"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AdminJobRow, DashboardStats, PipelineRunSummary } from "@/lib/types";

type DashboardPayload = DashboardStats & {
  recentFailed: AdminJobRow[];
  recentPipelineRuns: PipelineRunSummary[];
};

const RUN_ACTION_LABELS: Record<string, string> = {
  discover: "Discovery",
  crawl_stories: "Crawl batch",
  crawl_story: "Crawl story",
  translate_metadata: "Dịch metadata"
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

export function DashboardClient() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  if (!data) return <p>Đang tải dashboard...</p>;

  return (
    <>
      <div className="admin-header">
        <h1>Dashboard</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/operations" className="btn btn-secondary">
            Scripts
          </Link>
          <Link href="/activity" className="btn btn-secondary">
            Activity log
          </Link>
          <Link href="/jobs" className="btn btn-secondary">
            Jobs
          </Link>
        </div>
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <strong>{data.totalStories}</strong>
          <span>Truyện ({data.activeStories} active)</span>
        </div>
        <div className="stat-card">
          <strong>{data.totalChapters}</strong>
          <span>Chapters</span>
        </div>
        <div className="stat-card">
          <strong>{data.polishedChapters}</strong>
          <span>Polished</span>
        </div>
        <div className="stat-card">
          <strong>{data.translatedChapters}</strong>
          <span>Translated</span>
        </div>
        <div className="stat-card">
          <strong>{data.audioChapters}</strong>
          <span>Audio</span>
        </div>
        <div className="stat-card">
          <strong>{data.pendingJobs}</strong>
          <span>Jobs pending</span>
        </div>
        <div className="stat-card">
          <strong>{data.runningJobs}</strong>
          <span>Jobs running</span>
        </div>
        <div className="stat-card">
          <strong>{data.failedJobs}</strong>
          <span>Jobs failed</span>
        </div>
        <div className="stat-card">
          <strong>{data.runningPipelineRuns}</strong>
          <span>Scripts running</span>
        </div>
        <div className="stat-card">
          <strong>{data.failedPipelineRuns24h}</strong>
          <span>Scripts failed (24h)</span>
        </div>
      </div>

      {data.recentPipelineRuns.length > 0 ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Pipeline scripts gần đây</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Action</th>
                  <th>Status</th>
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
                      {run.storyId ? (
                        <Link href={`/stories/${run.storyId}`}>{run.storyId.slice(0, 8)}…</Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Link href={`/operations?run=${run.id}`}>Log</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {data.recentFailed.length > 0 ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Jobs failed gần đây</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Story</th>
                  <th>Chapter</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {data.recentFailed.map((job) => (
                  <tr key={job.id}>
                    <td>{job.jobType}</td>
                    <td>
                      {job.storyId ? <Link href={`/stories/${job.storyId}`}>{job.storyTitle ?? job.storyId}</Link> : "—"}
                    </td>
                    <td>
                      {job.storyId && job.chapterNumber ? (
                        <Link href={`/stories/${job.storyId}/chapters/${job.chapterNumber}`}>Ch.{job.chapterNumber}</Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                      {job.lastError?.slice(0, 120) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
