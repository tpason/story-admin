"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/ToastProvider";
import type { Paginated } from "@/lib/types";

type PipelineRun = {
  id: string;
  adminUsername: string;
  action: string;
  storyId: string | null;
  status: string;
  args: Record<string, unknown>;
  command: string | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  summary: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

const ACTION_LABELS: Record<string, string> = {
  discover: "Discovery — tìm truyện mới",
  crawl_stories: "Crawl — chapter mới (batch)",
  crawl_story: "Crawl — một truyện",
  translate_metadata: "Dịch metadata",
  audit: "QA audit (có judge)",
  audit_fast: "QA nhanh (tier 0+1)",
  repair: "QA + enqueue sửa"
};

type OperationsClientProps = {
  initialRunId?: string | null;
};

export function OperationsClient({ initialRunId = null }: OperationsClientProps) {
  const { pushToast } = useToast();
  const [runs, setRuns] = useState<Paginated<PipelineRun> | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRunId);
  const [selectedRun, setSelectedRun] = useState<PipelineRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [discoverForm, setDiscoverForm] = useState({ pages: 2, minChapters: 30, sources: "" });
  const [crawlForm, setCrawlForm] = useState({
    workers: 2,
    limitStories: 0,
    maxChapters: 0,
    onlyIncomplete: true,
    sources: "",
    minCatalogCheckHours: 0
  });

  const loadRuns = useCallback(async () => {
    const response = await fetch("/api/pipeline/runs?pageSize=30");
    if (response.ok) {
      setRuns((await response.json()) as Paginated<PipelineRun>);
    }
    setLoading(false);
  }, []);

  const loadRunDetail = useCallback(async (runId: string) => {
    const response = await fetch(`/api/pipeline/runs/${runId}`);
    if (response.ok) {
      setSelectedRun((await response.json()) as PipelineRun);
    }
  }, []);

  useEffect(() => {
    if (initialRunId) setSelectedRunId(initialRunId);
  }, [initialRunId]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (!selectedRunId) return;
    void loadRunDetail(selectedRunId);
    const timer = setInterval(() => {
      void loadRunDetail(selectedRunId);
      void loadRuns();
    }, 3000);
    return () => clearInterval(timer);
  }, [loadRunDetail, loadRuns, selectedRunId]);

  const hasRunning = useMemo(
    () => runs?.items.some((run) => run.status === "running" || run.status === "pending") ?? false,
    [runs]
  );

  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => void loadRuns(), 5000);
    return () => clearInterval(timer);
  }, [hasRunning, loadRuns]);

  async function startRun(action: string, args: Record<string, unknown>, storyId?: string) {
    setStarting(action);
    setError(null);
    const response = await fetch("/api/pipeline/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, args, storyId })
    });
    setStarting(null);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Không thể chạy script");
      return;
    }
    const payload = (await response.json()) as { run: PipelineRun };
    pushToast(`Đã bắt đầu ${ACTION_LABELS[action] ?? action}`, "success");
    setSelectedRunId(payload.run.id);
    setSelectedRun(payload.run);
    void loadRuns();
  }

  function parseSources(raw: string) {
    return raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function statusBadge(status: string) {
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

  const logText = selectedRun
    ? [selectedRun.stdout, selectedRun.stderr ? `\n--- stderr ---\n${selectedRun.stderr}` : ""].join("")
    : "";

  return (
    <>
      <PageHeader
        title="Pipeline scripts"
        description="Chạy thủ công discovery/crawl — delegate tới script Python. Log lưu trong DB."
      />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Discovery — tìm truyện mới</h2>
        <p style={{ color: "var(--muted)" }}>
          Gọi <code>discover_hot_stories.py</code> (giống <code>story-discovery-scheduler</code>, kèm{" "}
          <code>--no-url-skip</code>).
        </p>
        <div className="form-grid">
          <label>
            Pages
            <input
              type="number"
              min={1}
              value={discoverForm.pages}
              onChange={(e) => setDiscoverForm((c) => ({ ...c, pages: Number(e.target.value) }))}
            />
          </label>
          <label>
            Min chapters
            <input
              type="number"
              min={1}
              value={discoverForm.minChapters}
              onChange={(e) => setDiscoverForm((c) => ({ ...c, minChapters: Number(e.target.value) }))}
            />
          </label>
          <label>
            Sources (optional, cách nhau dấu phẩy)
            <input
              placeholder="truyenfull_today royalroad"
              value={discoverForm.sources}
              onChange={(e) => setDiscoverForm((c) => ({ ...c, sources: e.target.value }))}
            />
          </label>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="btn"
            disabled={Boolean(starting)}
            onClick={() =>
              void startRun("discover", {
                pages: discoverForm.pages,
                minChapters: discoverForm.minChapters,
                sources: parseSources(discoverForm.sources)
              })
            }
          >
            {starting === "discover" ? "Đang chạy..." : "Chạy discovery"}
          </button>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Crawl — chapter mới</h2>
        <p style={{ color: "var(--muted)" }}>
          Gọi <code>crawl_stories_from_db.py</code> (giống <code>story-crawler-scheduler</code> một pass).
        </p>
        <div className="form-grid">
          <label>
            Workers
            <input
              type="number"
              min={1}
              value={crawlForm.workers}
              onChange={(e) => setCrawlForm((c) => ({ ...c, workers: Number(e.target.value) }))}
            />
          </label>
          <label>
            Limit stories (0 = không giới hạn)
            <input
              type="number"
              min={0}
              value={crawlForm.limitStories}
              onChange={(e) => setCrawlForm((c) => ({ ...c, limitStories: Number(e.target.value) }))}
            />
          </label>
          <label>
            Max chapters / story (0 = all)
            <input
              type="number"
              min={0}
              value={crawlForm.maxChapters}
              onChange={(e) => setCrawlForm((c) => ({ ...c, maxChapters: Number(e.target.value) }))}
            />
          </label>
          <label>
            Min catalog check hours (0 = force)
            <input
              type="number"
              min={0}
              value={crawlForm.minCatalogCheckHours}
              onChange={(e) => setCrawlForm((c) => ({ ...c, minCatalogCheckHours: Number(e.target.value) }))}
            />
          </label>
          <label>
            Sources (optional)
            <input
              placeholder="truyenfull_today royalroad"
              value={crawlForm.sources}
              onChange={(e) => setCrawlForm((c) => ({ ...c, sources: e.target.value }))}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={crawlForm.onlyIncomplete}
              onChange={(e) => setCrawlForm((c) => ({ ...c, onlyIncomplete: e.target.checked }))}
            />
            Chỉ story chưa complete (--only-incomplete)
          </label>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="btn"
            disabled={Boolean(starting)}
            onClick={() =>
              void startRun("crawl_stories", {
                workers: crawlForm.workers,
                limitStories: crawlForm.limitStories,
                maxChapters: crawlForm.maxChapters,
                onlyIncomplete: crawlForm.onlyIncomplete,
                minCatalogCheckHours: crawlForm.minCatalogCheckHours,
                sources: parseSources(crawlForm.sources)
              })
            }
          >
            {starting === "crawl_stories" ? "Đang chạy..." : "Chạy crawl batch"}
          </button>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Lịch sử chạy</h2>
        {loading ? (
          <LoadingBlock variant="table" rows={6} />
        ) : runs ? (
          <div className="operations-layout">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Action</th>
                    <th>Status</th>
                    <th>User</th>
                    <th>Story</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.items.map((run) => (
                    <tr
                      key={run.id}
                      className={selectedRunId === run.id ? "row-selected" : undefined}
                      onClick={() => setSelectedRunId(run.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{new Date(run.createdAt).toLocaleString("vi-VN")}</td>
                      <td>{ACTION_LABELS[run.action] ?? run.action}</td>
                      <td>
                        <span className={statusBadge(run.status)}>{run.status}</span>
                      </td>
                      <td>{run.adminUsername}</td>
                      <td>
                        {run.storyId ? (
                          <Link href={`/stories/${run.storyId}`} onClick={(e) => e.stopPropagation()}>
                            {run.storyId.slice(0, 8)}…
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="log-panel">
              <h3 style={{ marginTop: 0 }}>Log</h3>
              {!selectedRun ? (
                <p style={{ color: "var(--muted)" }}>Chọn một run để xem log</p>
              ) : (
                <>
                  <div className="meta-list" style={{ marginBottom: 8 }}>
                    <span className={statusBadge(selectedRun.status)}>{selectedRun.status}</span>
                    {selectedRun.exitCode !== null ? <span>exit {selectedRun.exitCode}</span> : null}
                    {selectedRun.summary ? <span>{selectedRun.summary}</span> : null}
                  </div>
                  {selectedRun.command ? (
                    <pre className="log-preview command-preview">{selectedRun.command}</pre>
                  ) : null}
                  <pre className="log-preview">{logText || "(chưa có output)"}</pre>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
