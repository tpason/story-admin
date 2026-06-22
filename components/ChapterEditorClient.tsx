"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatNovelContent } from "@/lib/formatNovelContent";
import type { AdminChapterDetail, AdminStoryDetail } from "@/lib/types";

const READER_URL = process.env.NEXT_PUBLIC_STORY_READER_URL ?? "http://localhost:3000";

type ChapterEditorClientProps = {
  storyId: string;
  chapterNumber: number;
};

export function ChapterEditorClient({ storyId, chapterNumber }: ChapterEditorClientProps) {
  const [story, setStory] = useState<AdminStoryDetail | null>(null);
  const [chapter, setChapter] = useState<AdminChapterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contentTab, setContentTab] = useState<"polished" | "translated" | "raw">("polished");
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [enqueueLoading, setEnqueueLoading] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [polishedContent, setPolishedContent] = useState("");
  const [translatedContent, setTranslatedContent] = useState("");
  const [rawContent, setRawContent] = useState("");

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
    setChapter(chapterData);
    setTitle(chapterData.title);
    setPolishedContent(chapterData.polishedTextContent ?? "");
    setTranslatedContent(chapterData.translatedTextContent ?? "");
    setRawContent(chapterData.rawTextContent ?? "");
    setContentTab(chapterData.contentSource ?? "polished");
    setLoading(false);
  }, [chapterNumber, storyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveChapter() {
    setSaving(true);
    setMessage(null);
    setError(null);

    const body: Record<string, string> = { title };
    if (contentTab === "polished") body.polishedContent = polishedContent;
    if (contentTab === "translated") body.translatedContent = translatedContent;
    if (contentTab === "raw") body.rawContent = rawContent;

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
    setChapter(payload.chapter);
    setMessage("Đã lưu chapter");
    setSaving(false);
  }

  async function enqueuePipeline(
    action: "polish" | "audio" | "audio_segments" | "repolish" | "retranslate",
    options: { force?: boolean; clearAudio?: boolean } = {}
  ) {
    setEnqueueLoading(action);
    setMessage(null);
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
    setMessage(labels[action] ?? "OK");
  }

  const previewParagraphs = useMemo(() => {
    const source =
      contentTab === "polished" ? polishedContent : contentTab === "translated" ? translatedContent : rawContent;
    return formatNovelContent(source, 520, title);
  }, [contentTab, polishedContent, rawContent, title, translatedContent]);

  if (loading) return <p>Đang tải...</p>;
  if (!chapter) return <div className="alert alert-error">{error ?? "Không tìm thấy chapter"}</div>;

  const activeContent =
    contentTab === "polished" ? polishedContent : contentTab === "translated" ? translatedContent : rawContent;

  return (
    <>
      <div className="admin-header">
        <div>
          <Link href={`/stories/${storyId}`}>← {story?.displayTitle || story?.title || storyId}</Link>
          <h1>
            Chương {chapter.chapterNumber}: {title}
          </h1>
          <div className="meta-list">
            <span>Chapter ID: {chapter.id}</span>
            <span>Source hiện tại: {chapter.contentSource ?? "none"}</span>
            <span>
              Jobs: <Link href={`/jobs?storyId=${storyId}`}>Xem queue</Link>
            </span>
            <span>
              Reader:{" "}
              <a href={`${READER_URL}/stories/${storyId}/chapters/${chapterNumber}`} target="_blank" rel="noreferrer">
                Mở trên reader
              </a>
            </span>
          </div>
        </div>
      </div>

      {message ? <div className="alert alert-success">{message}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

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

        <div className="toolbar">
          <button
            type="button"
            className={contentTab === "polished" ? "btn" : "btn btn-secondary"}
            onClick={() => setContentTab("polished")}
          >
            Polished
          </button>
          <button
            type="button"
            className={contentTab === "translated" ? "btn" : "btn btn-secondary"}
            onClick={() => setContentTab("translated")}
          >
            Translated
          </button>
          <button
            type="button"
            className={contentTab === "raw" ? "btn" : "btn btn-secondary"}
            onClick={() => setContentTab("raw")}
          >
            Raw
          </button>
          <button
            type="button"
            className={viewMode === "edit" ? "btn" : "btn btn-secondary"}
            onClick={() => setViewMode("edit")}
          >
            Edit
          </button>
          <button
            type="button"
            className={viewMode === "preview" ? "btn" : "btn btn-secondary"}
            onClick={() => setViewMode("preview")}
          >
            Preview reader
          </button>
          <span style={{ color: "var(--muted)" }}>{activeContent.length.toLocaleString()} ký tự</span>
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
          <button type="button" className="btn" disabled={saving} onClick={() => void saveChapter()}>
            {saving ? "Đang lưu..." : "Lưu chapter"}
          </button>
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
          <Link className="btn btn-secondary" href={`/stories/${storyId}`}>
            Quay lại
          </Link>
        </div>
      </div>
    </>
  );
}
