"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Paginated, QaIssueStat, QaTriageStoryRow } from "@/lib/types";
import { qualityIssueLabel } from "@/lib/quality-display";
import { repairActionLabel } from "@/lib/quality-repair-routing";

type Mode = "failed" | "pending" | "all";

type QualityPayload = Paginated<QaTriageStoryRow> & {
  issueStats?: QaIssueStat[];
};

export function QualityClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<QualityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const page = Number(searchParams.get("page") ?? 1);
  const mode = (searchParams.get("mode") as Mode) || "failed";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "30", mode });
    const response = await fetch(`/api/quality?${params.toString()}`);
    if (!response.ok) {
      setError("Không tải được danh sách QA");
      setLoading(false);
      return;
    }
    setData((await response.json()) as QualityPayload);
    setLoading(false);
  }, [mode, page]);

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
    router.push(`/quality?${params.toString()}`);
  }

  return (
    <>
      <PageHeader
        title="QA dịch / polish"
        description="Triage và theo dõi chất lượng text. Rà soát toàn truyện chỉ khi bạn chủ động chạy — admin không tự quét nền."
      />

      <div className="alert alert-info">
        Pipeline translate/polish đã có quality gate khi xử lý từng chapter. Trang này giúp xem tổng thể,
        sửa theo mã lỗi đã quét, và trigger rà soát khi cần — ví dụ trên host:{" "}
        <code style={{ fontSize: "0.85rem" }}>
          viterbox/venv/bin/python scripts/story_pipeline/admin_pipeline_cli.py audit --story-id &lt;uuid&gt;
          --only-needing-audit
        </code>
      </div>

      {data?.issueStats && data.issueStats.length > 0 ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Mã lỗi phổ biến</h2>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            Trên các chapter QA failed — gợi ý hành động sửa (repolish vs retranslate).
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã lỗi</th>
                  <th>Số chapter</th>
                  <th>Gợi ý</th>
                </tr>
              </thead>
              <tbody>
                {data.issueStats.map((row) => (
                  <tr key={row.code}>
                    <td>{qualityIssueLabel(row.code)}</td>
                    <td>{row.count}</td>
                    <td>
                      <span className="badge badge-muted">{repairActionLabel(row.suggestedAction)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            className={mode === "failed" ? "btn" : "btn btn-secondary"}
            onClick={() => updateFilters({ mode: "failed", page: null })}
          >
            Có lỗi QA
          </button>
          <button
            type="button"
            className={mode === "pending" ? "btn" : "btn btn-secondary"}
            onClick={() => updateFilters({ mode: "pending", page: null })}
          >
            Chưa quét
          </button>
          <button
            type="button"
            className={mode === "all" ? "btn" : "btn btn-secondary"}
            onClick={() => updateFilters({ mode: "all", page: null })}
          >
            Có thể quét
          </button>
        </div>

        {loading ? <LoadingBlock variant="table" rows={8} /> : null}
        {error ? <div className="alert alert-error">{error}</div> : null}

        {!loading && data && !data.items.length ? (
          <EmptyState title="Không có truyện khớp bộ lọc" description="Thử đổi tab hoặc quét QA từ trang chi tiết truyện." />
        ) : null}

        {!loading && data && data.items.length ? (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Truyện</th>
                    <th>Source</th>
                    <th>Polished</th>
                    <th>QA lỗi</th>
                    <th>Chưa quét</th>
                    <th>Đạt</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((story) => (
                    <tr key={story.id}>
                      <td>
                        <strong>{story.displayTitle || story.title}</strong>
                        <div className="meta-list">{story.id}</div>
                      </td>
                      <td>{story.sourceCode}</td>
                      <td>{story.polishedCount}</td>
                      <td>
                        <span className={story.failedChapters > 0 ? "badge badge-danger" : "badge badge-muted"}>
                          {story.failedChapters}
                        </span>
                      </td>
                      <td>
                        <span className={story.pendingChapters > 0 ? "badge badge-warn" : "badge badge-muted"}>
                          {story.pendingChapters}
                        </span>
                      </td>
                      <td>{story.qualitySummary?.passed ?? 0}</td>
                      <td>
                        <Link
                          href={`/stories/${story.id}?qaStatus=failed`}
                          className="btn btn-ghost btn-sm"
                        >
                          Xem lỗi
                        </Link>
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
                Trang {data.page}/{data.totalPages} · {data.total} truyện
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
