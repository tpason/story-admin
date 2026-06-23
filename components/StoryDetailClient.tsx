"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/ToastProvider";
import {
  qualityIssueLabel,
  qualityStatusBadgeClass,
  qualityStatusLabel
} from "@/lib/quality-display";
import { buildExtractCharMapCli } from "@/lib/pipeline-char-map";
import {
  canAutoRepair,
  repairActionHint,
  repairActionLabel,
  repairBlockedReason,
  suggestRepairAction
} from "@/lib/quality-repair-routing";
import type { AdminChapterSummary, AdminStoryDetail, Paginated } from "@/lib/types";

const READER_URL = process.env.NEXT_PUBLIC_STORY_READER_URL ?? "http://localhost:3000";

type PipelineAction =
  | "recrawl"
  | "recrawl_chapters"
  | "translate_metadata"
  | "repolish"
  | "retranslate"
  | "audit"
  | "audit_fast"
  | "repair";
type BulkAction = "polish" | "audio" | "audio_segments" | "repolish" | "retranslate" | "smart_repair" | "qa_pass";

type PendingConfirm =
  | {
      kind: "pipeline";
      action: PipelineAction;
      options?: {
        clearRaw?: boolean;
        qualityOnly?: boolean;
        skipChapterTitles?: boolean;
        onlyNeedingAudit?: boolean;
        fullStoryScan?: boolean;
      };
    }
  | { kind: "bulk"; action: BulkAction };

type StoryDetailClientProps = {
  storyId: string;
  canRunPipeline?: boolean;
  canSpawnQualityScan?: boolean;
};

type QualityCliExamples = {
  audit: string;
  auditFast: string;
  repair: string;
};

export function StoryDetailClient({
  storyId,
  canRunPipeline = true,
  canSpawnQualityScan = true
}: StoryDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { pushToast } = useToast();
  const [story, setStory] = useState<AdminStoryDetail | null>(null);
  const [chapters, setChapters] = useState<Paginated<AdminChapterSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const page = Number(searchParams.get("page") ?? 1);
  const chapterSearch = searchParams.get("q") ?? "";
  const missingPolished = searchParams.get("missingPolished") === "true";
  const emptyTitle = searchParams.get("emptyTitle") === "true";
  const hasQualityIssue = searchParams.get("hasQualityIssue") === "true";
  const qaStatus = searchParams.get("qaStatus") ?? "";
  const auditableOnly = searchParams.get("auditableOnly") === "true";

  const [selectedChapters, setSelectedChapters] = useState<number[]>([]);
  const [bulkLoading, setBulkLoading] = useState<string | null>(null);
  const [chapterQaLoading, setChapterQaLoading] = useState<number | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState<string | null>(null);
  const [qualityScanLoading, setQualityScanLoading] = useState<string | null>(null);
  const [crawlStoryLoading, setCrawlStoryLoading] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [charMap, setCharMap] = useState("");
  const [charMapMeta, setCharMapMeta] = useState<{ updatedAt: string | null; updatedToChapter: number | null } | null>(null);
  const [charMapSaving, setCharMapSaving] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [qualityCliExamples, setQualityCliExamples] = useState<QualityCliExamples | null>(null);

  const [form, setForm] = useState({
    title: "",
    displayTitle: "",
    originalTitle: "",
    author: "",
    description: "",
    category: "",
    status: "",
    coverImageUrl: "",
    totalChapters: 0,
    isCompleted: false,
    isActive: true
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const chapterParams = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (chapterSearch) chapterParams.set("q", chapterSearch);
    if (missingPolished) chapterParams.set("missingPolished", "true");
    if (emptyTitle) chapterParams.set("emptyTitle", "true");
    if (hasQualityIssue) chapterParams.set("hasQualityIssue", "true");
    if (qaStatus === "passed" || qaStatus === "failed" || qaStatus === "pending") {
      chapterParams.set("qaStatus", qaStatus);
    }
    if (auditableOnly) chapterParams.set("auditableOnly", "true");

    const [storyRes, chapterRes, charMapRes] = await Promise.all([
      fetch(`/api/stories/${storyId}`),
      fetch(`/api/stories/${storyId}/chapters?${chapterParams.toString()}`),
      fetch(`/api/stories/${storyId}/char-map`)
    ]);

    if (!storyRes.ok) {
      setError("Không tìm thấy truyện");
      setLoading(false);
      return;
    }

    const storyData = (await storyRes.json()) as AdminStoryDetail;
    setStory(storyData);
    setForm({
      title: storyData.title,
      displayTitle: storyData.displayTitle ?? "",
      originalTitle: storyData.originalTitle ?? "",
      author: storyData.author ?? "",
      description: storyData.description ?? "",
      category: storyData.category ?? "",
      status: storyData.status ?? "",
      coverImageUrl: storyData.coverImageUrl ?? "",
      totalChapters: storyData.totalChapters,
      isCompleted: storyData.isCompleted,
      isActive: storyData.isActive
    });

    if (chapterRes.ok) {
      setChapters((await chapterRes.json()) as Paginated<AdminChapterSummary>);
    }

    if (charMapRes.ok) {
      const charMapData = (await charMapRes.json()) as {
        content: string | null;
        updatedAt: string | null;
        updatedToChapter: number | null;
      };
      setCharMap(charMapData.content ?? "");
      setCharMapMeta({ updatedAt: charMapData.updatedAt, updatedToChapter: charMapData.updatedToChapter });
    }

    setLoading(false);
  }, [auditableOnly, chapterSearch, emptyTitle, hasQualityIssue, missingPolished, page, qaStatus, storyId]);

  useEffect(() => {
    if (canSpawnQualityScan) return;
    void (async () => {
      const response = await fetch(`/api/stories/${storyId}/quality-cli`);
      if (response.ok) {
        const payload = (await response.json()) as { cliExamples: QualityCliExamples };
        setQualityCliExamples(payload.cliExamples);
      }
    })();
  }, [canSpawnQualityScan, storyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveStory() {
    setSaving(true);
    setError(null);

    const response = await fetch(`/api/stories/${storyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        displayTitle: form.displayTitle || null,
        originalTitle: form.originalTitle || null,
        author: form.author || null,
        description: form.description || null,
        category: form.category || null,
        status: form.status || null,
        coverImageUrl: form.coverImageUrl.trim() || null,
        totalChapters: form.totalChapters,
        isCompleted: form.isCompleted,
        isActive: form.isActive
      })
    });

    if (!response.ok) {
      setError("Lưu truyện thất bại");
      setSaving(false);
      return;
    }

    const payload = (await response.json()) as { story: AdminStoryDetail };
    setStory(payload.story);
    pushToast("Đã lưu metadata truyện", "success");
    setSaving(false);
  }

  async function uploadCover(file: File) {
    setCoverUploading(true);
    setError(null);
    const formData = new FormData();
    formData.set("cover", file);
    const response = await fetch(`/api/stories/${storyId}/cover`, { method: "POST", body: formData });
    setCoverUploading(false);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      const msg = payload?.error ?? "Upload ảnh bìa thất bại";
      setError(msg);
      pushToast(msg, "error");
      return;
    }
    const payload = (await response.json()) as { coverImageUrl: string; story: AdminStoryDetail };
    setStory(payload.story);
    setForm((current) => ({ ...current, coverImageUrl: payload.coverImageUrl }));
    pushToast("Đã upload ảnh bìa", "success");
  }

  async function saveCharMap() {
    setCharMapSaving(true);
    setError(null);
    const response = await fetch(`/api/stories/${storyId}/char-map`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: charMap })
    });
    if (!response.ok) {
      setError("Lưu char map thất bại");
      setCharMapSaving(false);
      return;
    }
    const payload = (await response.json()) as {
      content: string | null;
      updatedAt: string | null;
      updatedToChapter: number | null;
    };
    setCharMap(payload.content ?? "");
    setCharMapMeta({ updatedAt: payload.updatedAt, updatedToChapter: payload.updatedToChapter });
    pushToast("Đã lưu char map", "success");
    setCharMapSaving(false);
  }

  function updateChapterFilters(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    if (!("page" in patch)) params.delete("page");
    router.push(`/stories/${storyId}?${params.toString()}`);
  }

  function toggleChapterSelection(chapterNumber: number) {
    setSelectedChapters((current) =>
      current.includes(chapterNumber) ? current.filter((n) => n !== chapterNumber) : [...current, chapterNumber]
    );
  }

  function toggleSelectAllOnPage() {
    if (!chapters) return;
    const pageNumbers = chapters.items.map((c) => c.chapterNumber);
    const allSelected = pageNumbers.every((n) => selectedChapters.includes(n));
    if (allSelected) {
      setSelectedChapters((current) => current.filter((n) => !pageNumbers.includes(n)));
    } else {
      setSelectedChapters((current) => Array.from(new Set([...current, ...pageNumbers])));
    }
  }

  function confirmCopy(pending: PendingConfirm): { title: string; message: string; danger?: boolean } {
    if (pending.kind === "bulk") {
      const count = selectedChapters.length;
      if (pending.action === "repolish") {
        return {
          title: `Re-polish ${count} chapter?`,
          message: "Sẽ reset polished và enqueue job mới cho các chapter đã chọn.",
          danger: true
        };
      }
      if (pending.action === "retranslate") {
        return {
          title: `Re-translate ${count} chapter?`,
          message: "Sẽ reset translated/polished và enqueue dịch lại cho các chapter đã chọn.",
          danger: true
        };
      }
      if (pending.action === "smart_repair") {
        return {
          title: `Sửa thông minh ${count} chapter?`,
          message:
            "Enqueue repolish/retranslate theo mã lỗi QA đã lưu (không quét lại). Worker sẽ chạy quality gate khi lưu — cần polish-worker.",
          danger: true
        };
      }
      if (pending.action === "qa_pass") {
        return {
          title: `Đánh dấu pass ${count} chapter?`,
          message: "Chỉ dùng sau khi đã sửa tay / xác nhận nội dung ổn. Không chạy lại LLM."
        };
      }
      return {
        title: `Bulk ${pending.action} ${count} chapter?`,
        message: `Enqueue job ${pending.action} cho ${count} chapter đã chọn.`
      };
    }

    const rangeLabel =
      selectedChapters.length > 0
        ? `${selectedChapters.length} chapter đã chọn`
        : rangeFrom || rangeTo
          ? `chapter ${rangeFrom || "1"}–${rangeTo || "cuối"}`
          : pending.options?.fullStoryScan
            ? "toàn truyện (chapter chưa audit / lỗi)"
            : "phạm vi chưa chọn";

    switch (pending.action) {
      case "recrawl_chapters":
        return {
          title: "Re-crawl và xóa raw?",
          message:
            "Hành động này xóa raw text hiện có và đánh dấu chapter để crawler tải lại. Không thể hoàn tác nhanh.",
          danger: true
        };
      case "recrawl":
        return {
          title: "Re-crawl catalog?",
          message: "Đánh dấu truyện để scheduler crawl lại metadata/catalog từ nguồn."
        };
      case "repolish":
        return {
          title: `Re-polish ${rangeLabel}?`,
          message: "Reset polished và enqueue polish lại. Cần polish-worker đang chạy.",
          danger: true
        };
      case "retranslate":
        return {
          title: `Re-translate ${rangeLabel}?`,
          message: "Reset translated/polished và enqueue dịch lại. Tốn thời gian và tài nguyên LLM.",
          danger: true
        };
      case "translate_metadata":
        return pending.options?.skipChapterTitles
          ? {
              title: "Dịch metadata truyện?",
              message: "Dịch title, mô tả, tác giả qua Ollama — chạy nền, xem log tại Scripts."
            }
          : {
              title: `Dịch metadata + tiêu đề chapter (${rangeLabel})?`,
              message: "Dịch metadata truyện và tiêu đề chapter trong range — chạy nền qua Ollama.",
              danger: true
            };
      case "audit":
        return {
          title: pending.options?.fullStoryScan ? "Rà soát QA toàn truyện?" : `Quét QA (${rangeLabel})?`,
          message: pending.options?.fullStoryScan
            ? "Chỉ chapter chưa audit hoặc đang lỗi. Có LLM judge — tốn GPU, chạy đồng bộ khi bạn xác nhận (không tự chạy nền)."
            : "Chạy QA tier 0/1/2 (có judge mẫu) cho phạm vi đã chọn. Chapter cần đã polish đủ nội dung."
        };
      case "audit_fast":
        return {
          title: pending.options?.fullStoryScan
            ? "Rà soát nhanh toàn truyện?"
            : `Quét nhanh (${rangeLabel})?`,
          message: pending.options?.fullStoryScan
            ? "Tier 0+1 cho chapter chưa audit/lỗi — không judge LLM. Bạn chủ động chạy, không tự động nền."
            : "Chỉ tier 0+1 (regex + term alignment), không gọi LLM judge."
        };
      case "repair":
        return {
          title: pending.options?.fullStoryScan ? "Rà soát + sửa toàn truyện?" : `Quét + sửa (${rangeLabel})?`,
          message: pending.options?.fullStoryScan
            ? "QA chapter lỗi rồi enqueue re-translate/re-polish. Thao tác nặng — chỉ chạy khi bạn xác nhận."
            : "QA phạm vi đã chọn rồi enqueue sửa tương ứng.",
          danger: true
        };
      default:
        return { title: "Xác nhận", message: "Tiếp tục thao tác pipeline?" };
    }
  }

  function requestPipeline(
    action: PipelineAction,
    options: {
      clearRaw?: boolean;
      qualityOnly?: boolean;
      skipChapterTitles?: boolean;
      onlyNeedingAudit?: boolean;
      fullStoryScan?: boolean;
    } = {}
  ) {
    setPendingConfirm({ kind: "pipeline", action, options });
  }

  function requestBulk(action: BulkAction) {
    if (!selectedChapters.length) return;
    setPendingConfirm({ kind: "bulk", action });
  }

  async function runBulk(
    action: "polish" | "audio" | "audio_segments" | "repolish" | "retranslate",
    force = false
  ) {
    if (!selectedChapters.length) return;
    setBulkLoading(action);
    setError(null);
    const response = await fetch(`/api/stories/${storyId}/chapters/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, chapterNumbers: selectedChapters, force })
    });
    setBulkLoading(null);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Bulk enqueue thất bại");
      return;
    }
    const payload = (await response.json()) as { results: Array<{ ok: boolean }> };
    const ok = payload.results.filter((r) => r.ok).length;
    pushToast(`Bulk ${action}: ${ok}/${payload.results.length} thành công`, "success");
    void load();
  }

  async function runBulkQa(action: "smart_repair" | "qa_pass") {
    if (!selectedChapters.length) return;
    setBulkLoading(action);
    setError(null);
    const response = await fetch(`/api/stories/${storyId}/chapters/quality-bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, chapterNumbers: selectedChapters })
    });
    setBulkLoading(null);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Bulk QA thất bại");
      return;
    }
    const payload = (await response.json()) as { count?: number; total?: number };
    if (action === "smart_repair") {
      pushToast(`Sửa thông minh: ${payload.count ?? 0}/${payload.total ?? selectedChapters.length} enqueue`, "success");
    } else {
      pushToast(`Đã đánh dấu pass ${payload.count ?? selectedChapters.length} chapter`, "success");
    }
    void load();
  }

  async function runChapterSmartRepair(chapter: AdminChapterSummary) {
    const issues = chapter.qualityAuditIssues.length ? chapter.qualityAuditIssues : chapter.qualityIssues;
    const suggested = suggestRepairAction(issues, chapter.qualityRepairAttempts);
    if (!suggested) {
      pushToast(repairBlockedReason(chapter.qualityRepairAttempts) ?? "Không có mã lỗi QA để sửa", "error");
      return;
    }
    setChapterQaLoading(chapter.chapterNumber);
    setError(null);
    const response = await fetch(
      `/api/stories/${storyId}/chapters/${chapter.chapterNumber}/quality`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "smart_repair", forceAction: suggested })
      }
    );
    setChapterQaLoading(null);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Enqueue sửa thất bại");
      return;
    }
    pushToast(
      `Ch.${chapter.chapterNumber}: đã enqueue ${repairActionLabel(suggested)} — chờ worker, sau đó quét lại chapter`,
      "success"
    );
    void load();
  }

  async function runStoryPipeline(
    action: PipelineAction,
    options: {
      clearRaw?: boolean;
      qualityOnly?: boolean;
      skipChapterTitles?: boolean;
      onlyNeedingAudit?: boolean;
      fullStoryScan?: boolean;
    } = {}
  ) {
    const isQualityScan = action === "audit" || action === "audit_fast" || action === "repair";
    if (isQualityScan) setQualityScanLoading(action);
    else setPipelineLoading(action);
    setError(null);

    const fromChapter = rangeFrom ? Number(rangeFrom) : undefined;
    const toChapter = rangeTo ? Number(rangeTo) : undefined;
    const apiAction = action === "audit_fast" ? "audit" : action;
    const body: Record<string, unknown> = { action: apiAction, sync: true, ...options };
    if (action === "audit_fast") body.noJudge = true;
    if (!options.fullStoryScan) {
      if (fromChapter && Number.isFinite(fromChapter)) body.fromChapter = fromChapter;
      if (toChapter && Number.isFinite(toChapter)) body.toChapter = toChapter;
      if (selectedChapters.length && (action === "repolish" || action === "retranslate" || isQualityScan)) {
        body.chapterNumbers = selectedChapters;
      }
    }

    const response = await fetch(`/api/stories/${storyId}/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (isQualityScan) setQualityScanLoading(null);
    else setPipelineLoading(null);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        command?: string;
        cliOnly?: boolean;
      } | null;
      if (payload?.cliOnly && payload.command) {
        setError(`${payload.error ?? "Cần chạy CLI"} — xem lệnh bên dưới.`);
        pushToast("Copy lệnh CLI trong panel QA", "info");
      } else {
        setError(payload?.error ?? "Pipeline thất bại");
      }
      return;
    }
    const payload = (await response.json()) as {
      results?: Array<{ ok: boolean }>;
      ok?: boolean;
      async?: boolean;
      run?: { id: string };
      summary?: { audited?: number; passed?: number; failed?: number; repaired?: number };
    };
    if (payload.summary) {
      const s = payload.summary;
      pushToast(
        `QA: ${s.passed ?? 0}/${s.audited ?? 0} đạt · ${s.failed ?? 0} lỗi${s.repaired ? ` · ${s.repaired} đã enqueue sửa` : ""}`,
        (s.failed ?? 0) > 0 ? "info" : "success"
      );
    } else if (payload.async && payload.run?.id) {
      pushToast(`${action} đang chạy nền — xem log Scripts`, "info");
      router.push(`/operations?run=${payload.run.id}`);
    } else if (payload.results?.length) {
      const ok = payload.results.filter((r) => r.ok).length;
      pushToast(`${action}: ${ok}/${payload.results.length} chapter`, "success");
    } else if (payload.ok) {
      pushToast(`Đã chạy ${action}`, "success");
    } else {
      pushToast(`Đã gửi yêu cầu ${action}`, "success");
    }
    void load();
  }

  async function crawlThisStory() {
    setCrawlStoryLoading(true);
    setError(null);
    const response = await fetch("/api/pipeline/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "crawl_story",
        storyId,
        args: { onlyIncomplete: false, minCatalogCheckHours: 0, maxChapters: 0 }
      })
    });
    setCrawlStoryLoading(false);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Không thể chạy crawl");
      return;
    }
    const payload = (await response.json()) as { run: { id: string } };
    pushToast(`Đã bắt đầu crawl — xem log tại /operations?run=${payload.run.id.slice(0, 8)}…`, "info");
  }

  function qualityBadgeLabel(issue: string) {
    return qualityIssueLabel(issue);
  }

  if (loading) return <LoadingBlock variant="table" rows={10} />;
  if (!story) return <div className="alert alert-error">{error ?? "Không tìm thấy truyện"}</div>;

  const hasQaScope = selectedChapters.length > 0 || Boolean(rangeFrom) || Boolean(rangeTo);
  const canShowQuality = story.polishedCount > 0 || story.translatedCount > 0;
  const canScanQuality = canShowQuality && (story.qualitySummary?.auditableChapters ?? 0) > 0;

  return (
    <>
      <PageHeader
        title={form.displayTitle || form.title}
        description={`${story.sourceCode} · ${story.chapterCount ?? 0} chapters`}
        breadcrumbs={[
          { label: "Truyện", href: "/stories" },
          { label: form.displayTitle || form.title }
        ]}
        actions={
          <>
            <a href={`${READER_URL}/stories/${story.id}`} target="_blank" rel="noreferrer" className="btn btn-secondary">
              Mở reader
            </a>
            <Link href={`/jobs?storyId=${story.id}`} className="btn btn-secondary">
              Hàng đợi
            </Link>
          </>
        }
      />

      <div className="meta-list" style={{ marginBottom: 16 }}>
        <span>ID: {story.id}</span>
        {story.sourceUrl ? (
          <span>
            Nguồn:{" "}
            <a href={story.sourceUrl} target="_blank" rel="noreferrer">
              {story.sourceUrl}
            </a>
          </span>
        ) : null}
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Metadata truyện</h2>
        <div className="form-grid">
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            {form.coverImageUrl.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.coverImageUrl.trim()} alt="Cover preview" className="cover-preview" />
            ) : (
              <div className="cover-preview-empty">Chưa có ảnh bìa</div>
            )}
            <label style={{ flex: 1, minWidth: 220 }}>
              Cover image URL
              <input
                value={form.coverImageUrl}
                placeholder="https://... hoặc upload file bên dưới"
                onChange={(event) => setForm((current) => ({ ...current, coverImageUrl: event.target.value }))}
              />
            </label>
          </div>
          <div className="cover-upload-row">
            <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
              {coverUploading ? "Đang upload..." : "Upload ảnh bìa"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                disabled={coverUploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadCover(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>JPEG/PNG/WebP, tối đa 2MB</span>
          </div>
          <label>
            Title (DB)
            <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            Display title (reader)
            <input
              value={form.displayTitle}
              onChange={(event) => setForm((current) => ({ ...current, displayTitle: event.target.value }))}
            />
          </label>
          <label>
            Original title
            <input
              value={form.originalTitle}
              onChange={(event) => setForm((current) => ({ ...current, originalTitle: event.target.value }))}
            />
          </label>
          <label>
            Author
            <input value={form.author} onChange={(event) => setForm((current) => ({ ...current, author: event.target.value }))} />
          </label>
          <label>
            Category
            <input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} />
          </label>
          <label>
            Status
            <input value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} />
          </label>
          <label>
            Total chapters
            <input
              type="number"
              min={0}
              value={form.totalChapters}
              onChange={(event) => setForm((current) => ({ ...current, totalChapters: Number(event.target.value) }))}
            />
          </label>
          <label>
            Description
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <div className="checkbox-row">
            <label>
              <input
                type="checkbox"
                checked={form.isCompleted}
                onChange={(event) => setForm((current) => ({ ...current, isCompleted: event.target.checked }))}
              />
              Hoàn thành
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
              Active trên reader
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="btn" disabled={saving} onClick={() => void saveStory()}>
              {saving ? "Đang lưu..." : "Lưu truyện"}
            </button>
          </div>
        </div>
      </div>

      {canRunPipeline ? (
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Pipeline & crawl</h2>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          Re-crawl đánh dấu story/chapter cho scheduler. Crawl ngay gọi script Python. Re-translate/re-polish cần{" "}
          <code>docker compose --profile ai up -d</code>. Dịch metadata chạy nền —{" "}
          <Link href="/operations">xem log Scripts →</Link>
        </p>
        <div className="toolbar" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className="btn"
            disabled={crawlStoryLoading}
            onClick={() => void crawlThisStory()}
          >
            {crawlStoryLoading ? "..." : "Crawl truyện này ngay"}
          </button>
        </div>
        <div className="form-grid">
          <label>
            Từ chapter
            <input
              type="number"
              min={1}
              placeholder="1"
              value={rangeFrom}
              onChange={(event) => setRangeFrom(event.target.value)}
            />
          </label>
          <label>
            Đến chapter
            <input
              type="number"
              min={1}
              placeholder="all"
              value={rangeTo}
              onChange={(event) => setRangeTo(event.target.value)}
            />
          </label>
        </div>
        <div className="toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(pipelineLoading)}
            onClick={() => requestPipeline("recrawl")}
          >
            {pipelineLoading === "recrawl" ? "..." : "Re-crawl catalog"}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={Boolean(pipelineLoading)}
            onClick={() => requestPipeline("recrawl_chapters", { clearRaw: true })}
          >
            {pipelineLoading === "recrawl_chapters" ? "..." : "Re-crawl chapters (xóa raw)"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(pipelineLoading)}
            onClick={() => requestPipeline("translate_metadata", { skipChapterTitles: true })}
          >
            {pipelineLoading === "translate_metadata" ? "..." : "Dịch title / mô tả / tác giả"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(pipelineLoading)}
            onClick={() => requestPipeline("translate_metadata")}
          >
            {pipelineLoading === "translate_metadata" ? "..." : "+ Dịch tiêu đề chapter (range)"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(pipelineLoading)}
            onClick={() => requestPipeline("repolish", { qualityOnly: !rangeFrom && !rangeTo && !selectedChapters.length })}
          >
            {pipelineLoading === "repolish" ? "..." : "Re-polish range"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(pipelineLoading)}
            onClick={() =>
              requestPipeline("retranslate", { qualityOnly: !rangeFrom && !rangeTo && !selectedChapters.length })
            }
          >
            {pipelineLoading === "retranslate" ? "..." : "Re-translate range"}
          </button>
        </div>
      </div>
      ) : null}

      {story.health ? (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 style={{ margin: 0 }}>Pipeline health</h2>
              <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
                Tín hiệu vận hành — catalog, polish, jobs, char map
              </p>
            </div>
            {story.health.failedJobs > 0 ? (
              <Link href={`/jobs?storyId=${storyId}&status=failed`} className="btn btn-secondary btn-sm">
                Jobs failed ({story.health.failedJobs})
              </Link>
            ) : null}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {story.health.warnings.map((warning) => (
              <li key={warning} style={{ marginBottom: 6 }}>
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Char map</h2>
        <div className="meta-list" style={{ marginBottom: 10 }}>
          {charMapMeta?.updatedAt ? <span>Cập nhật: {charMapMeta.updatedAt}</span> : null}
          {charMapMeta?.updatedToChapter ? <span>Đến chapter: {charMapMeta.updatedToChapter}</span> : null}
          {!charMap.trim() ? <span className="badge badge-warn">Chưa có char map trong DB</span> : null}
          {story.health?.charMapStale ? (
            <span className="badge badge-warn">Char map có thể cũ — cập nhật trước khi sửa hàng loạt</span>
          ) : null}
        </div>
        {story.health?.charMapStale ? (
          <label style={{ display: "grid", gap: 4, marginBottom: 12 }}>
            <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              Cập nhật char map (CLI trên host — chạy khi polish-worker rảnh)
            </span>
            <textarea
              className="content-editor"
              readOnly
              rows={2}
              style={{ minHeight: 0 }}
              value={buildExtractCharMapCli(storyId, {
                storyTitle: story.displayTitle || story.title,
                fromChapter: story.health.charMapUpdatedToChapter
                  ? story.health.charMapUpdatedToChapter + 1
                  : undefined
              })}
            />
          </label>
        ) : null}
        <div className="form-grid">
          <label>
            metadata.char_map_content
            <textarea
              className="content-editor"
              style={{ minHeight: 240 }}
              value={charMap}
              onChange={(event) => setCharMap(event.target.value)}
            />
          </label>
          <div className="form-actions">
            <button type="button" className="btn" disabled={charMapSaving} onClick={() => void saveCharMap()}>
              {charMapSaving ? "Đang lưu..." : "Lưu char map"}
            </button>
          </div>
        </div>
      </div>

      {canShowQuality ? (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 style={{ margin: 0 }}>Rà soát QA dịch/polish</h2>
              <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
                Xem kết quả QA lưu trong DB. Quét mới chỉ chạy khi bạn chủ động (không tự động nền). Pipeline
                translate/polish vẫn tự kiểm tra chất lượng khi xử lý chapter — admin hỗ trợ rà soát và xử lý
                lỗi.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a href={`/api/stories/${storyId}/quality-export`} className="btn btn-secondary btn-sm">
                Xuất CSV QA
              </a>
              <Link href="/activity?qualityOnly=1" className="btn btn-ghost btn-sm">
                Nhật ký QA
              </Link>
            </div>
          </div>
          <div className="alert alert-info" style={{ marginBottom: 14 }}>
            <strong>Vòng đảm bảo chất lượng:</strong> (1) Quét QA lưu mã lỗi → (2){" "}
            <em>Sửa thông minh</em> enqueue đúng repolish/retranslate kèm repair hints → (3) polish-worker chạy
            quality gate trước khi ghi DB → (4) quét lại chapter hoặc đánh dấu pass sau khi xác nhận. Tối đa 3
            lần sửa tự động/chapter.
          </div>
          {story.qualitySummary ? (
            <div className="stats-grid" style={{ marginBottom: 14 }}>
              <div className="stat-card">
                <strong>{story.qualitySummary.auditableChapters}</strong>
                <span>Có thể quét</span>
              </div>
              <div className="stat-card accent">
                <strong>{story.qualitySummary.passed}</strong>
                <span>Đạt QA</span>
              </div>
              <div className="stat-card danger">
                <strong>{story.qualitySummary.failed}</strong>
                <span>Lỗi QA</span>
              </div>
              <div className="stat-card warning">
                <strong>{story.qualitySummary.pending}</strong>
                <span>Chưa quét / chờ</span>
              </div>
            </div>
          ) : null}
          {canScanQuality && canRunPipeline && canSpawnQualityScan ? (
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <h3 style={{ margin: "0 0 8px", fontSize: "0.95rem" }}>Phạm vi đã chọn</h3>
                <p style={{ margin: "0 0 8px", color: "var(--muted)", fontSize: "0.88rem" }}>
                  Chọn chapter trong bảng hoặc nhập range ở panel Pipeline — rồi quét phạm vi đó.
                </p>
                <div className="toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={Boolean(qualityScanLoading || pipelineLoading) || !hasQaScope}
                    onClick={() => requestPipeline("audit")}
                  >
                    {qualityScanLoading === "audit" ? "..." : "Quét QA (có judge)"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={Boolean(qualityScanLoading || pipelineLoading) || !hasQaScope}
                    onClick={() => requestPipeline("audit_fast")}
                  >
                    {qualityScanLoading === "audit_fast" ? "..." : "Quét nhanh (tier 0+1)"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={Boolean(qualityScanLoading || pipelineLoading) || !hasQaScope}
                    onClick={() => requestPipeline("repair")}
                  >
                    {qualityScanLoading === "repair" ? "..." : "Quét + sửa phạm vi"}
                  </button>
                </div>
              </div>
              <div>
                <h3 style={{ margin: "0 0 8px", fontSize: "0.95rem" }}>Rà soát toàn truyện</h3>
                <p style={{ margin: "0 0 8px", color: "var(--muted)", fontSize: "0.88rem" }}>
                  Chỉ chapter chưa audit hoặc đang lỗi — cần xác nhận, có thể tốn GPU (judge).
                </p>
                <div className="toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={Boolean(qualityScanLoading || pipelineLoading)}
                    onClick={() =>
                      requestPipeline("audit", { fullStoryScan: true, onlyNeedingAudit: true })
                    }
                  >
                    {qualityScanLoading === "audit" ? "..." : "Rà soát QA toàn truyện"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={Boolean(qualityScanLoading || pipelineLoading)}
                    onClick={() =>
                      requestPipeline("audit_fast", { fullStoryScan: true, onlyNeedingAudit: true })
                    }
                  >
                    {qualityScanLoading === "audit_fast" ? "..." : "Rà soát nhanh toàn truyện"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={Boolean(qualityScanLoading || pipelineLoading)}
                    onClick={() =>
                      requestPipeline("repair", { fullStoryScan: true, onlyNeedingAudit: true })
                    }
                  >
                    {qualityScanLoading === "repair" ? "..." : "Rà soát + sửa toàn truyện"}
                  </button>
                </div>
              </div>
            </div>
          ) : canScanQuality && canRunPipeline && !canSpawnQualityScan ? (
            <div className="alert alert-info" style={{ marginTop: 0 }}>
              <p style={{ margin: "0 0 10px" }}>
                Spawn quét từ Docker admin bị tắt (tốn GPU). Copy lệnh và chạy trên máy host khi bạn chủ động
                rà soát:
              </p>
              {qualityCliExamples ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {(
                    [
                      ["Quét QA (có judge)", qualityCliExamples.audit],
                      ["Quét nhanh (tier 0+1)", qualityCliExamples.auditFast],
                      ["Quét + sửa tự động", qualityCliExamples.repair]
                    ] as const
                  ).map(([label, command]) => (
                    <label key={label} style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{label}</span>
                      <textarea className="content-editor" readOnly value={command} rows={2} style={{ minHeight: 0 }} />
                    </label>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: "0.9rem" }}>Đang tải lệnh mẫu…</p>
              )}
            </div>
          ) : canShowQuality && !canScanQuality ? (
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem" }}>
              Chưa có chapter polished đủ dài để quét — cần hoàn thành polish trước.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="panel">
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>Chapters ({chapters?.total ?? story.chapterCount})</h2>
          <input
            placeholder="Tìm chapter # hoặc title"
            defaultValue={chapterSearch}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                updateChapterFilters({ q: (event.currentTarget.value || "").trim() || null, page: null });
              }
            }}
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={missingPolished}
              onChange={(event) =>
                updateChapterFilters({ missingPolished: event.target.checked ? "true" : null, page: null })
              }
            />
            Thiếu polished
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={emptyTitle}
              onChange={(event) => updateChapterFilters({ emptyTitle: event.target.checked ? "true" : null, page: null })}
            />
            Title lỗi
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={hasQualityIssue}
              onChange={(event) =>
                updateChapterFilters({ hasQualityIssue: event.target.checked ? "true" : null, page: null })
              }
            />
            Có vấn đề (heuristic)
          </label>
          {canShowQuality ? (
            <>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={auditableOnly}
                  onChange={(event) =>
                    updateChapterFilters({ auditableOnly: event.target.checked ? "true" : null, page: null })
                  }
                />
                Chỉ chapter quét được
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={qaStatus === "failed"}
                  onChange={(event) =>
                    updateChapterFilters({ qaStatus: event.target.checked ? "failed" : null, page: null })
                  }
                />
                QA lỗi
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={qaStatus === "pending"}
                  onChange={(event) =>
                    updateChapterFilters({ qaStatus: event.target.checked ? "pending" : null, page: null })
                  }
                />
                Chưa quét QA
              </label>
            </>
          ) : null}
        </div>

        {canRunPipeline && selectedChapters.length > 0 ? (
          <div className="toolbar bulk-toolbar">
            <span>{selectedChapters.length} chapter đã chọn</span>
            {canShowQuality ? (
              <>
                <button
                  type="button"
                  className="btn"
                  disabled={Boolean(bulkLoading)}
                  onClick={() => requestBulk("smart_repair")}
                >
                  {bulkLoading === "smart_repair" ? "..." : "Sửa thông minh"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={Boolean(bulkLoading)}
                  onClick={() => requestBulk("qa_pass")}
                >
                  {bulkLoading === "qa_pass" ? "..." : "Đánh dấu pass"}
                </button>
              </>
            ) : null}
            <button type="button" className="btn btn-secondary" disabled={Boolean(bulkLoading)} onClick={() => requestBulk("repolish")}>
              Bulk re-polish
            </button>
            <button type="button" className="btn btn-secondary" disabled={Boolean(bulkLoading)} onClick={() => requestBulk("retranslate")}>
              Bulk re-translate
            </button>
            <button type="button" className="btn btn-secondary" disabled={Boolean(bulkLoading)} onClick={() => void runBulk("polish")}>
              Bulk polish
            </button>
            <button type="button" className="btn btn-secondary" disabled={Boolean(bulkLoading)} onClick={() => void runBulk("audio")}>
              Bulk audio
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={Boolean(bulkLoading)}
              onClick={() => void runBulk("audio_segments")}
            >
              Bulk segments
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setSelectedChapters([])}>
              Bỏ chọn
            </button>
          </div>
        ) : null}

        {chapters ? (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Chọn trang"
                        checked={
                          chapters.items.length > 0 &&
                          chapters.items.every((c) => selectedChapters.includes(c.chapterNumber))
                        }
                        onChange={toggleSelectAllOnPage}
                      />
                    </th>
                    <th>#</th>
                    <th>Title</th>
                    <th>Pipeline</th>
                    <th>Quality</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {chapters.items.map((chapter) => (
                    <tr key={chapter.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedChapters.includes(chapter.chapterNumber)}
                          onChange={() => toggleChapterSelection(chapter.chapterNumber)}
                        />
                      </td>
                      <td>{chapter.chapterNumber}</td>
                      <td>{chapter.title}</td>
                      <td>
                        <div className="chapter-status">
                          {chapter.hasRawText ? <span className="badge badge-muted">raw</span> : null}
                          {chapter.isTranslated ? <span className="badge badge-warn">translated</span> : null}
                          {chapter.isPolished ? <span className="badge badge-ok">polished</span> : null}
                          {chapter.hasAudio ? <span className="badge badge-ok">audio</span> : null}
                        </div>
                      </td>
                      <td>
                        <div className="chapter-status">
                          {chapter.isAuditable ? (
                            <span className={qualityStatusBadgeClass(chapter.qualityStatus)}>
                              {qualityStatusLabel(chapter.qualityStatus, chapter.isAuditable)}
                            </span>
                          ) : chapter.isTranslated || chapter.isPolished ? (
                            <span className="badge badge-muted">chưa đủ polish</span>
                          ) : (
                            <span className="badge badge-muted">—</span>
                          )}
                          {chapter.qualityIssues.map((issue) => (
                            <span key={issue} className="badge badge-danger" title={issue}>
                              {qualityBadgeLabel(issue)}
                            </span>
                          ))}
                          {chapter.outputRatio !== null ? (
                            <span className="badge badge-muted">{Math.round(chapter.outputRatio * 100)}%</span>
                          ) : null}
                          {chapter.qualityRepairAttempts > 0 ? (
                            <span className="badge badge-warn">repair ×{chapter.qualityRepairAttempts}</span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="toolbar" style={{ flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
                          <Link href={`/stories/${storyId}/chapters/${chapter.chapterNumber}`}>Sửa</Link>
                          {canRunPipeline && canShowQuality && chapter.qualityStatus === "failed" ? (
                            <>
                              {(() => {
                                const issues = chapter.qualityAuditIssues.length
                                  ? chapter.qualityAuditIssues
                                  : chapter.qualityIssues;
                                const suggested = suggestRepairAction(issues, chapter.qualityRepairAttempts);
                                return suggested ? (
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    disabled={chapterQaLoading === chapter.chapterNumber}
                                    title={repairActionHint(suggested)}
                                    onClick={() => void runChapterSmartRepair(chapter)}
                                  >
                                    {chapterQaLoading === chapter.chapterNumber
                                      ? "..."
                                      : repairActionLabel(suggested)}
                                  </button>
                                ) : canAutoRepair(chapter.qualityRepairAttempts) ? null : (
                                  <span className="badge badge-warn" title={repairBlockedReason(chapter.qualityRepairAttempts) ?? ""}>
                                    max repair
                                  </span>
                                );
                              })()}
                            </>
                          ) : null}
                          {chapter.hasFailedJob ? (
                            <Link
                              href={`/jobs?storyId=${storyId}&status=failed&chapterNumber=${chapter.chapterNumber}`}
                              className="btn btn-ghost btn-sm"
                            >
                              Job
                            </Link>
                          ) : null}
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
                onClick={() => updateChapterFilters({ page: String(page - 1) })}
              >
                Trước
              </button>
              <span>
                Trang {chapters.page}/{chapters.totalPages}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page >= chapters.totalPages}
                onClick={() => updateChapterFilters({ page: String(page + 1) })}
              >
                Sau
              </button>
            </div>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(pendingConfirm)}
        title={pendingConfirm ? confirmCopy(pendingConfirm).title : ""}
        message={pendingConfirm ? confirmCopy(pendingConfirm).message : ""}
        danger={pendingConfirm ? confirmCopy(pendingConfirm).danger : false}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => {
          if (!pendingConfirm) return;
          const pending = pendingConfirm;
          setPendingConfirm(null);
          if (pending.kind === "bulk") {
            if (pending.action === "smart_repair" || pending.action === "qa_pass") {
              void runBulkQa(pending.action);
            } else {
              void runBulk(pending.action as "polish" | "audio" | "audio_segments" | "repolish" | "retranslate");
            }
          } else {
            void runStoryPipeline(pending.action, pending.options ?? {});
          }
        }}
      />
    </>
  );
}
