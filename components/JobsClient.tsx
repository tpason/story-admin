"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { PageHeader } from "@/components/ui/PageHeader";
import type { AdminJobRow, Paginated } from "@/lib/types";

const JOB_TYPES = ["", "polish_chapter", "translate_chapter", "audio_chapter", "audio_chapter_segments"];
const STATUSES = ["", "pending", "running", "failed", "done"];

export function JobsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Paginated<AdminJobRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const page = Number(searchParams.get("page") ?? 1);
  const status = searchParams.get("status") ?? "";
  const jobType = searchParams.get("jobType") ?? "";
  const storyId = searchParams.get("storyId") ?? "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "40" });
    if (status) params.set("status", status);
    if (jobType) params.set("jobType", jobType);
    if (storyId) params.set("storyId", storyId);

    const response = await fetch(`/api/jobs?${params.toString()}`);
    if (!response.ok) {
      setError("Không tải được jobs");
      setLoading(false);
      return;
    }
    setData((await response.json()) as Paginated<AdminJobRow>);
    setLoading(false);
  }, [jobType, page, status, storyId]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateFilters(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    if (!("page" in patch)) params.delete("page");
    router.push(`/jobs?${params.toString()}`);
  }

  async function retryJob(jobId: string, force = false) {
    setRetrying(jobId);
    const response = await fetch(`/api/jobs/${jobId}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force })
    });
    setRetrying(null);
    if (response.ok) void load();
    else setError("Retry thất bại");
  }

  return (
    <>
      <PageHeader
        title="Hàng đợi jobs"
        description="Theo dõi và retry các job polish, dịch, audio trong pipeline."
      />

      <div className="panel">
        <div className="toolbar">
          <select value={status} onChange={(event) => updateFilters({ status: event.target.value || null })}>
            {STATUSES.map((value) => (
              <option key={value || "all"} value={value}>
                {value || "Tất cả status"}
              </option>
            ))}
          </select>
          <select value={jobType} onChange={(event) => updateFilters({ jobType: event.target.value || null })}>
            {JOB_TYPES.map((value) => (
              <option key={value || "all"} value={value}>
                {value || "Tất cả loại"}
              </option>
            ))}
          </select>
          <input
            placeholder="Story ID"
            defaultValue={storyId}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                updateFilters({ storyId: (event.currentTarget.value || "").trim() || null });
              }
            }}
          />
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            Làm mới
          </button>
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}
        {loading ? <LoadingBlock variant="table" rows={10} /> : null}

        {!loading && data && data.items.length === 0 ? (
          <EmptyState title="Không có job" description="Thử đổi bộ lọc status hoặc loại job." />
        ) : null}

        {!loading && data && data.items.length > 0 ? (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Type</th>
                    <th>Story / Chapter</th>
                    <th>Attempts</th>
                    <th>Error</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <span className={`badge badge-${job.status === "failed" ? "danger" : job.status === "done" ? "ok" : "muted"}`}>
                          {job.status}
                        </span>
                      </td>
                      <td>{job.jobType}</td>
                      <td>
                        {job.storyId ? (
                          <Link href={`/stories/${job.storyId}`}>{job.storyTitle ?? job.storyId}</Link>
                        ) : (
                          "—"
                        )}
                        {job.chapterNumber ? (
                          <>
                            {" · "}
                            <Link href={`/stories/${job.storyId}/chapters/${job.chapterNumber}`}>
                              Ch.{job.chapterNumber}
                            </Link>
                          </>
                        ) : null}
                      </td>
                      <td>
                        {job.attempts}/{job.maxAttempts}
                      </td>
                      <td style={{ maxWidth: 280, fontSize: "0.82rem", color: "var(--muted)" }}>
                        {job.lastError ? (
                          <details>
                            <summary style={{ cursor: "pointer" }}>{job.lastError.slice(0, 80)}…</summary>
                            {job.lastError}
                          </details>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {job.status === "failed" || job.status === "done" ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={retrying === job.id}
                            onClick={() => void retryJob(job.id, job.status === "done")}
                          >
                            {retrying === job.id ? "..." : job.status === "done" ? "Re-run" : "Retry"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page <= 1}
                onClick={() => updateFilters({ page: String(page - 1) })}
              >
                Trước
              </button>
              <span>
                Trang {data.page}/{data.totalPages} · {data.total} jobs
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page >= data.totalPages}
                onClick={() => updateFilters({ page: String(page + 1) })}
              >
                Sau
              </button>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
