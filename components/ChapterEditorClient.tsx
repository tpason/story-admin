"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/ToastProvider";
import { formatNovelContent } from "@/lib/formatNovelContent";
import type { AdminChapterDetail, AdminStoryDetail } from "@/lib/types";

const READER_URL = process.env.NEXT_PUBLIC_STORY_READER_URL ?? "http://localhost:3000";

type ContentTab = "polished" | "translated" | "raw";

type ChapterSnapshot = {
  title: string;
  polishedContent: string;
  translatedContent: string;
  rawContent: string;
};

type ChapterEditorClientProps = {
  storyId: string;
  chapterNumber: number;
  canRunPipeline?: boolean;
};

function snapshotFromChapter(chapter: AdminChapterDetail): ChapterSnapshot {
  return {
    title: chapter.title,
    polishedContent: chapter.polishedTextContent ?? "",
    translatedContent: chapter.translatedTextContent ?? "",
    rawContent: chapter.rawTextContent ?? ""
  };
}

export function ChapterEditorClient({ storyId, chapterNumber, canRunPipeline = true }: ChapterEditorClientProps) {
  const { pushToast } = useToast();
  const [story, setStory] = useState<AdminStoryDetail | null>(null);
  const [chapter, setChapter] = useState<AdminChapterDetail | null>(null);
  const [saved, setSaved] = useState<ChapterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentTab, setContentTab] = useState<ContentTab>("polished");
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [enqueueLoading, setEnqueueLoading] = useState<string | null>(null);
  const [pendingTab, setPendingTab] = useState<ContentTab | null>(null);

  const [title, setTitle] = useState("");
  const [polishedContent, setPolishedContent] = useState("");
  const [translatedContent, setTranslatedContent] = useState("");
  const [rawContent, setRawContent] = useState("");

  const dirty = useMemo(() => {
    if (!saved) return { title: false, polished: false, translated: false, raw: false, any: false };
    const flags = {
      title: title !== saved.title,
      polished: polishedContent !== saved.polishedContent,
      translated: translatedContent !== saved.translatedContent,
      raw: rawContent !== saved.rawContent
    };
    return { ...flags, any: flags.title || flags.polished || flags.translated || flags.raw };
  }, [polishedContent, rawContent, saved, title, translatedContent]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [storyRes, chapterRes] = await Promise.all([
      fetch(`/api/stories/${storyId}`),
      fetch(`/api/stories/${storyId}/chapters/${chapterNumber}`)
    ]);

    if (!chapterRes.ok) {
      setError("Không tìm thấy chapter");
      setLoading(false);
      return;
    }

    if (storyRes.ok) {
      setStory((await storyRes.json()) as AdminStoryDetail);
    }

    const chapterData = (await chapterRes.json()) as AdminChapterDetail;
    const snapshot = snapshotFromChapter(chapterData);
    setChapter(chapterData);
    setSaved(snapshot);
    setTitle(snapshot.title);
    setPolishedContent(snapshot.polishedContent);
    setTranslatedContent(snapshot.translatedContent);
    setRawContent(snapshot.rawContent);
    setContentTab(chapterData.contentSource ?? "polished");
    setLoading(false);
  }, [chapterNumber, storyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!dirty.any) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty.any]);

  function isTabDirty(tab: ContentTab) {
    if (tab === "polished") return dirty.polished;
    if (tab === "translated") return dirty.translated;
    return dirty.raw;
  }

  function requestContentTab(next: ContentTab) {
    if (next === contentTab) return;
    if (viewMode === "edit" && isTabDirty(contentTab)) {
      setPendingTab(next);
      return;
    }
    setContentTab(next);
  }

  async function saveChapter() {
    if (!saved) return;
    setSaving(true);
    setError(null);

    const body: Record<string, string> = {};
    if (dirty.title) body.title = title;
    if (dirty.polished) body.polishedContent = polishedContent;
    if (dirty.translated) body.translatedContent = translatedContent;
    if (dirty.raw) body.rawContent = rawContent;

    if (Object.keys(body).length === 0) {
      pushToast("Không có thay đổi để lưu", "info");
      setSaving(false);
      return;
    }

    const response = await fetch(`/api/stories/${storyId}/chapters/${chapterNumber}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      setError("Lưu chapter thất bại");
      setSaving(false);
      return;
    }

    const payload = (await response.json()) as { chapter: AdminChapterDetail };
    const snapshot = snapshotFromChapter(payload.chapter);
    setChapter(payload.chapter);
    setSaved(snapshot);
    setTitle(snapshot.title);
    setPolishedContent(snapshot.polishedContent);
    setTranslatedContent(snapshot.translatedContent);
    setRawContent(snapshot.rawContent);
    pushToast("Đã lưu chapter", "success");
    setSaving(false);
  }

  async function enqueuePipeline(
    action: "polish" | "audio" | "audio_segments" | "repolish" | "retranslate",
    options: { force?: boolean; clearAudio?: boolean } = {}
  ) {
    setEnqueueLoading(action);
    setError(null);
    const response = await fetch(`/api/stories/${storyId}/chapters/${chapterNumber}/enqueue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, force: options.force, clearAudio: options.clearAudio })
    });
    setEnqueueLoading(null);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Enqueue thất bại");
      return;
    }
    if (action === "repolish" || action === "retranslate") {
      await load();
    }
    const labels: Record<string, string> = {
      polish: "Đã enqueue polish job",
      repolish: "Đã reset + enqueue re-polish",
      retranslate: "Đã reset + enqueue re-translate",
      audio: "Đã enqueue audio job",
      audio_segments: "Đã enqueue audio segments"
    };
    pushToast(labels[action] ?? "OK", "success");
  }

  const previewParagraphs = useMemo(() => {
    const source =
      contentTab === "polished" ? polishedContent : contentTab === "translated" ? translatedContent : rawContent;
    return formatNovelContent(source, 520, title);
  }, [contentTab, polishedContent, rawContent, title, translatedContent]);

  if (loading) return <LoadingBlock variant="table" rows={8} />;
  if (!chapter) return <div className="alert alert-error">{error ?? "Không tìm thấy chapter"}</div>;

  const activeContent =
    contentTab === "polished" ? polishedContent : contentTab === "translated" ? translatedContent : rawContent;

  const tabLabel = (tab: ContentTab, label: string) => (
    <span className={isTabDirty(tab) ? "tab-dirty-dot" : undefined}>{label}</span>
  );

  return (
    <>
      <PageHeader
        title={`Chương ${chapter.chapterNumber}: ${title}`}
        description={story?.displayTitle || story?.title || storyId}
        breadcrumbs={[
          { label: "Truyện", href: "/stories" },
          { label: story?.displayTitle || story?.title || "Chi tiết", href: `/stories/${storyId}` as Route },
          { label: `Chương ${chapter.chapterNumber}` }
        ]}
        actions={
          <>
            <a
              href={`${READER_URL}/stories/${storyId}/chapters/${chapterNumber}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
            >
              Mở reader
            </a>
            <Link href={`/jobs?storyId=${storyId}`} className="btn btn-secondary">
              Hàng đợi
            </Link>
          </>
        }
      />

      <div className="meta-list" style={{ marginBottom: 16 }}>
        <span>Chapter ID: {chapter.id}</span>
        <span>Nguồn hiện tại: {chapter.contentSource ?? "none"}</span>
      </div>

      {dirty.any ? (
        <div className="alert alert-info unsaved-banner">Có thay đổi chưa lưu — nhớ bấm Lưu chapter trước khi rời trang.</div>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      {chapter.hasAudio || chapter.audioPath ? (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Audio</h2>
              <p>Nghe thử file chapter đã generate</p>
            </div>
          </div>
          {chapter.hasAudio ? (
            <audio
              controls
              preload="none"
              style={{ width: "100%", maxWidth: 520 }}
              src={`/api/stories/${storyId}/chapters/${chapterNumber}/audio`}
            />
          ) : (
            <p style={{ margin: 0, color: "var(--muted)" }}>Chưa có audio sẵn sàng phát.</p>
          )}
          {chapter.audioPath ? (
            <div className="meta-list" style={{ marginTop: 10 }}>
              <span>Path: {chapter.audioPath}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {chapter.qualityIssues.length > 0 ? (
        <div className="panel">
          <div className="chapter-status">
            {chapter.qualityIssues.map((issue) => (
              <span key={issue} className="badge badge-danger">
                {issue}
              </span>
            ))}
            {chapter.outputRatio !== null ? (
              <span className="badge badge-muted">Output ratio: {Math.round(chapter.outputRatio * 100)}%</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="panel form-grid">
        <label>
          Chapter title
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <div className="tab-bar" role="tablist" aria-label="Loại nội dung">
          <button
            type="button"
            role="tab"
            data-active={contentTab === "polished" ? "true" : undefined}
            onClick={() => requestContentTab("polished")}
          >
            {tabLabel("polished", "Polished")}
          </button>
          <button
            type="button"
            role="tab"
            data-active={contentTab === "translated" ? "true" : undefined}
            onClick={() => requestContentTab("translated")}
          >
            {tabLabel("translated", "Translated")}
          </button>
          <button
            type="button"
            role="tab"
            data-active={contentTab === "raw" ? "true" : undefined}
            onClick={() => requestContentTab("raw")}
          >
            {tabLabel("raw", "Raw")}
          </button>
        </div>

        <div className="tab-bar" role="tablist" aria-label="Chế độ xem">
          <button
            type="button"
            role="tab"
            data-active={viewMode === "edit" ? "true" : undefined}
            onClick={() => setViewMode("edit")}
          >
            Chỉnh sửa
          </button>
          <button
            type="button"
            role="tab"
            data-active={viewMode === "preview" ? "true" : undefined}
            onClick={() => setViewMode("preview")}
          >
            Preview reader
          </button>
          <span style={{ marginLeft: "auto", color: "var(--muted)", alignSelf: "center", fontSize: "0.85rem" }}>
            {activeContent.length.toLocaleString()} ký tự
          </span>
        </div>

        {viewMode === "preview" ? (
          <div className="reader-preview">
            {previewParagraphs.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>Không có nội dung để preview</p>
            ) : (
              previewParagraphs.map((paragraph, index) => (
                <p key={index} className="reader-preview-paragraph">
                  {paragraph}
                </p>
              ))
            )}
          </div>
        ) : null}

        {viewMode === "edit" && contentTab === "polished" ? (
          <label>
            Polished content (ưu tiên hiển thị trên reader)
            <textarea
              className="content-editor"
              value={polishedContent}
              onChange={(event) => setPolishedContent(event.target.value)}
            />
          </label>
        ) : null}

        {viewMode === "edit" && contentTab === "translated" ? (
          <label>
            Translated content
            <textarea
              className="content-editor"
              value={translatedContent}
              onChange={(event) => setTranslatedContent(event.target.value)}
            />
          </label>
        ) : null}

        {viewMode === "edit" && contentTab === "raw" ? (
          <label>
            Raw content
            <textarea className="content-editor" value={rawContent} onChange={(event) => setRawContent(event.target.value)} />
          </label>
        ) : null}

        <div className="form-actions">
          <button type="button" className="btn" disabled={saving || !dirty.any} onClick={() => void saveChapter()}>
            {saving ? "Đang lưu..." : dirty.any ? "Lưu thay đổi" : "Đã lưu"}
          </button>
          {canRunPipeline ? (
            <>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(enqueueLoading)}
            onClick={() => void enqueuePipeline("polish")}
          >
            {enqueueLoading === "polish" ? "..." : "Enqueue polish"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(enqueueLoading)}
            onClick={() => void enqueuePipeline("repolish")}
          >
            {enqueueLoading === "repolish" ? "..." : "Re-polish"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(enqueueLoading)}
            onClick={() => void enqueuePipeline("retranslate")}
          >
            {enqueueLoading === "retranslate" ? "..." : "Re-translate"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(enqueueLoading)}
            onClick={() => void enqueuePipeline("polish", { force: true })}
          >
            Force reset job
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(enqueueLoading) || !chapter.isPolished}
            onClick={() => void enqueuePipeline("audio")}
          >
            {enqueueLoading === "audio" ? "..." : "Enqueue audio"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(enqueueLoading) || !chapter.isPolished}
            onClick={() => void enqueuePipeline("audio_segments")}
          >
            {enqueueLoading === "audio_segments" ? "..." : "Enqueue segments"}
          </button>
            </>
          ) : null}
          <Link className="btn btn-secondary" href={`/stories/${storyId}`}>
            Quay lại
          </Link>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingTab)}
        title="Chuyển tab mà chưa lưu?"
        message="Tab hiện tại có thay đổi chưa lưu. Chuyển tab sẽ giữ nội dung trong editor nhưng dễ nhầm — nên lưu trước."
        confirmLabel="Chuyển tab"
        onCancel={() => setPendingTab(null)}
        onConfirm={() => {
          if (pendingTab) setContentTab(pendingTab);
          setPendingTab(null);
        }}
      />
    </>
  );
}
