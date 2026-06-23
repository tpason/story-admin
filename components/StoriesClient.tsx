"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { PageHeader } from "@/components/ui/PageHeader";
import type { AdminStoryRow, Paginated } from "@/lib/types";

type StoriesResponse = Paginated<AdminStoryRow> & { sources: string[] };

export function StoriesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<StoriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const page = Number(searchParams.get("page") ?? 1);
  const q = searchParams.get("q") ?? "";
  const source = searchParams.get("source") ?? "";
  const activeOnly = searchParams.get("activeOnly") === "true";
  const hasPolished = searchParams.get("hasPolished") === "true";
  const sort = searchParams.get("sort") ?? "updated";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "30", sort });
    if (q) params.set("q", q);
    if (source) params.set("source", source);
    if (activeOnly) params.set("activeOnly", "true");
    if (hasPolished) params.set("hasPolished", "true");

    const response = await fetch(`/api/stories?${params.toString()}`);
    if (!response.ok) {
      setError("Không tải được danh sách truyện");
      setLoading(false);
      return;
    }
    setData((await response.json()) as StoriesResponse);
    setLoading(false);
  }, [activeOnly, hasPolished, page, q, sort, source]);

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
    router.push(`/stories?${params.toString()}`);
  }

  return (
    <>
      <PageHeader
        title="Quản lý truyện"
        description="Tìm kiếm, lọc và chỉnh sửa metadata truyện trong pipeline."
      />

      <div className="panel">
        <div className="toolbar">
          <input
            placeholder="Tìm theo ID, title, author..."
            defaultValue={q}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                updateFilters({ q: (event.currentTarget.value || "").trim() || null });
              }
            }}
          />
          <select value={source} onChange={(event) => updateFilters({ source: event.target.value || null })}>
            <option value="">Tất cả nguồn</option>
            {(data?.sources ?? []).map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(event) => updateFilters({ sort: event.target.value })}>
            <option value="updated">Mới cập nhật</option>
            <option value="title">Tên A-Z</option>
            <option value="chapters">Nhiều chapter</option>
          </select>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(event) => updateFilters({ activeOnly: event.target.checked ? "true" : null })}
            />
            Chỉ active
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={hasPolished}
              onChange={(event) => updateFilters({ hasPolished: event.target.checked ? "true" : null })}
            />
            Có polished
          </label>
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            Làm mới
          </button>
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}
        {loading ? <LoadingBlock variant="table" rows={8} /> : null}

        {!loading && data && data.items.length === 0 ? (
          <EmptyState
            title="Không tìm thấy truyện"
            description="Thử đổi bộ lọc hoặc từ khóa tìm kiếm."
          />
        ) : null}

        {!loading && data && data.items.length > 0 ? (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Title</th>
                    <th>Author</th>
                    <th>Source</th>
                    <th>Chapters</th>
                    <th>Pipeline</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((story) => (
                    <tr key={story.id}>
                      <td>{story.id}</td>
                      <td>
                        <strong>{story.displayTitle || story.title}</strong>
                        {story.displayTitle && story.displayTitle !== story.title ? (
                          <div className="meta-list">DB title: {story.title}</div>
                        ) : null}
                      </td>
                      <td>{story.author ?? "—"}</td>
                      <td>{story.sourceCode}</td>
                      <td>
                        {story.chapterCount}/{story.totalChapters}
                      </td>
                      <td>
                        <div className="chapter-status">
                          <span className="badge badge-ok">P {story.polishedCount}</span>
                          <span className="badge badge-muted">A {story.audioCount}</span>
                        </div>
                      </td>
                      <td>
                        {!story.isActive ? <span className="badge badge-danger">inactive</span> : null}
                        {story.isCompleted ? <span className="badge badge-ok">complete</span> : null}
                      </td>
                      <td>
                        <Link href={`/stories/${story.id}`} className="btn btn-ghost btn-sm">
                          Chi tiết
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
