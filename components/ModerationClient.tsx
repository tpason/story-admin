"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/ToastProvider";
import type { CommentReportRow } from "@/lib/admin-moderation";
import type { Paginated } from "@/lib/types";

const READER_URL = process.env.NEXT_PUBLIC_STORY_READER_URL ?? "http://localhost:3000";

type ModerationClientProps = {
  canAccessStories?: boolean;
};

export function ModerationClient({ canAccessStories = false }: ModerationClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { pushToast } = useToast();

  const page = Number(searchParams.get("page") ?? 1);

  const [data, setData] = useState<Paginated<CommentReportRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [pendingAction, setPendingAction] = useState<{
    reportId: string;
    action: "delete_comment" | "ban_user";
    permanent?: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    const response = await fetch(`/api/moderation/reports?${params.toString()}`);
    if (response.ok) {
      setData((await response.json()) as Paginated<CommentReportRow>);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  function updatePage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) params.delete("page");
    else params.set("page", String(nextPage));
    router.push(`/moderation?${params.toString()}`);
  }

  async function review(reportId: string, action: "dismiss" | "delete_comment" | "ban_user", extra?: { permanent?: boolean }) {
    setBusy(reportId);
    const response = await fetch(`/api/moderation/reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, permanent: extra?.permanent, banDays: 7 })
    });
    setBusy(null);
    if (!response.ok) {
      pushToast("Xử lý báo cáo thất bại", "error");
      return;
    }
    pushToast(`Đã xử lý: ${action}`, "success");
    void load();
  }

  return (
    <>
      <PageHeader
        title="Kiểm duyệt luận đạo"
        description="Xử lý báo cáo bình luận từ story reader."
      />
      <div className="panel">
        <p style={{ marginTop: 0, color: "var(--muted)" }}>
          Báo cáo từ reader. Ưu tiên mục có nhiều báo cáo trùng bình luận.
        </p>
        {loading ? <LoadingBlock variant="table" rows={5} /> : null}
        {!loading && data && data.items.length === 0 ? (
          <EmptyState title="Không có báo cáo chờ xử lý" description="Tất cả báo cáo đã được xử lý." />
        ) : null}
        {!loading && data && data.items.length > 0 ? (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Báo cáo</th>
                    <th>Bình luận</th>
                    <th>Truyện</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontSize: "0.85rem" }}>
                        <strong>{item.reporterUsername}</strong>
                        <div>{item.reason}</div>
                        {item.details ? <div style={{ color: "var(--muted)" }}>{item.details}</div> : null}
                        <div style={{ color: "var(--muted)" }}>{item.reportCount} pending</div>
                      </td>
                      <td style={{ maxWidth: 360, fontSize: "0.85rem" }}>
                        <strong>{item.commentUsername}</strong>
                        <div>
                          {item.commentText.slice(0, 240)}
                          {item.commentText.length > 240 ? "…" : ""}
                        </div>
                        <div style={{ color: "var(--muted)" }}>
                          Chương {item.chapterNumber}
                          {canAccessStories ? (
                            <>
                              {" · "}
                              <Link href={`/stories/${item.storyId}/chapters/${item.chapterNumber}`}>
                                Sửa trong admin
                              </Link>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td style={{ fontSize: "0.85rem" }}>
                        <div>{item.storyTitle}</div>
                        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <a
                          href={`${READER_URL}/stories/${item.storyId}/chapters/${item.chapterNumber}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-ghost btn-sm"
                        >
                          Mở reader
                        </a>
                        {canAccessStories ? (
                          <Link href={`/stories/${item.storyId}`} className="btn btn-ghost btn-sm">
                            Admin story
                          </Link>
                        ) : null}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={busy === item.id}
                            onClick={() => void review(item.id, "dismiss")}
                          >
                            Bỏ qua
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={busy === item.id}
                            onClick={() => setPendingAction({ reportId: item.id, action: "delete_comment" })}
                          >
                            Xóa bình luận
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={busy === item.id}
                            onClick={() => void review(item.id, "ban_user")}
                          >
                            Cấm 7 ngày
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={busy === item.id}
                            onClick={() =>
                              setPendingAction({ reportId: item.id, action: "ban_user", permanent: true })
                            }
                          >
                            Cấm vĩnh viễn
                          </button>
                        </div>
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
                onClick={() => updatePage(page - 1)}
              >
                Trước
              </button>
              <span>
                Trang {data.page}/{data.totalPages} · {data.total} báo cáo
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page >= data.totalPages}
                onClick={() => updatePage(page + 1)}
              >
                Sau
              </button>
            </div>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.action === "delete_comment" ? "Xóa bình luận?" : "Cấm người dùng?"}
        message={
          pendingAction?.action === "delete_comment"
            ? "Bình luận sẽ bị xóa vĩnh viễn khỏi reader."
            : pendingAction?.permanent
              ? "Người dùng sẽ bị cấm luận đạo vĩnh viễn."
              : "Người dùng sẽ bị cấm luận đạo 7 ngày."
        }
        confirmLabel={pendingAction?.action === "delete_comment" ? "Xóa" : "Cấm"}
        danger
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (pendingAction) {
            void review(pendingAction.reportId, pendingAction.action, {
              permanent: pendingAction.permanent
            });
          }
          setPendingAction(null);
        }}
      />
    </>
  );
}
