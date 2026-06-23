"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { PageHeader } from "@/components/ui/PageHeader";
import type { ActivityLogRow, Paginated } from "@/lib/types";

export function ActivityClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Paginated<ActivityLogRow> | null>(null);
  const [loading, setLoading] = useState(true);

  const page = Number(searchParams.get("page") ?? 1);
  const storyId = searchParams.get("storyId") ?? "";
  const qualityOnly = searchParams.get("qualityOnly") === "1";

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "40" });
    if (storyId) params.set("storyId", storyId);
    if (qualityOnly) params.set("actionPrefix", "quality");
    const response = await fetch(`/api/activity?${params.toString()}`);
    if (response.ok) setData((await response.json()) as Paginated<ActivityLogRow>);
    setLoading(false);
  }, [page, qualityOnly, storyId]);

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
    router.push(`/activity?${params.toString()}`);
  }

  return (
    <>
      <PageHeader
        title="Nhật ký hoạt động"
        description="Lịch sử thao tác của admin trên pipeline."
      />
      <div className="panel">
        <div className="toolbar">
          <input
            placeholder="Filter by story ID"
            defaultValue={storyId}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                updateFilters({ storyId: (event.currentTarget.value || "").trim() || null });
              }
            }}
          />
          <button
            type="button"
            className={qualityOnly ? "btn" : "btn btn-secondary"}
            onClick={() => updateFilters({ qualityOnly: qualityOnly ? null : "1", page: null })}
          >
            Chỉ QA
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            Làm mới
          </button>
        </div>
        {loading ? <LoadingBlock variant="table" rows={8} /> : null}
        {!loading && data && data.items.length === 0 ? (
          <EmptyState title="Chưa có hoạt động" description="Các thao tác admin sẽ hiển thị tại đây." />
        ) : null}
        {!loading && data && data.items.length > 0 ? (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id}>
                      <td style={{ whiteSpace: "nowrap", fontSize: "0.82rem" }}>
                        {new Date(row.createdAt).toLocaleString("vi-VN")}
                      </td>
                      <td>{row.adminUsername}</td>
                      <td>
                        <code>{row.action}</code>
                      </td>
                      <td>
                        {row.summary ?? "—"}
                        {row.storyId ? (
                          <>
                            {" · "}
                            <Link href={`/stories/${row.storyId}`}>story</Link>
                          </>
                        ) : null}
                        {row.storyId && row.chapterNumber ? (
                          <>
                            {" · "}
                            <Link href={`/stories/${row.storyId}/chapters/${row.chapterNumber}`}>
                              ch.{row.chapterNumber}
                            </Link>
                          </>
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
                Trang {data.page}/{data.totalPages}
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
