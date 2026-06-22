"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { AdminChapterSummary, AdminStoryDetail, Paginated } from "@/lib/types";

const READER_URL = process.env.NEXT_PUBLIC_STORY_READER_URL ?? "http://localhost:3000";

type StoryDetailClientProps = {
  storyId: string;
};

export function StoryDetailClient({ storyId }: StoryDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [story, setStory] = useState<AdminStoryDetail | null>(null);
  const [chapters, setChapters] = useState<Paginated<AdminChapterSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const page = Number(searchParams.get("page") ?? 1);
  const chapterSearch = searchParams.get("q") ?? "";
  const missingPolished = searchParams.get("missingPolished") === "true";
  const emptyTitle = searchParams.get("emptyTitle") === "true";
  const hasQualityIssue = searchParams.get("hasQualityIssue") === "true";

  const [selectedChapters, setSelectedChapters] = useState<number[]>([]);
  const [bulkLoading, setBulkLoading] = useState<string | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState<string | null>(null);
  const [crawlStoryLoading, setCrawlStoryLoading] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [charMap, setCharMap] = useState("");
  const [charMapMeta, setCharMapMeta] = useState<{ updatedAt: string | null; updatedToChapter: number | null } | null>(null);
  const [charMapSaving, setCharMapSaving] = useState(false);

  const [form, setForm] = useState({
    title: "",
    displayTitle: "",
    originalTitle: "",
    author: "",
    description: "",
    category: "",
    status: "",
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
  }, [chapterSearch, emptyTitle, hasQualityIssue, missingPolished, page, storyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveStory() {
    setSaving(true);
    setMessage(null);
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
    setMessage("Đã lưu metadata truyện");
    setSaving(false);
  }

  async function saveCharMap() {
    setCharMapSaving(true);
    setMessage(null);
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
    setMessage("Đã lưu char map");
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

  async function runBulk(
    action: "polish" | "audio" | "audio_segments" | "repolish" | "retranslate",
    force = false
  ) {
    if (!selectedChapters.length) return;
    setBulkLoading(action);
    setMessage(null);
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
    setMessage(`Bulk ${action}: ${ok}/${payload.results.length} thành công`);
    void load();
  }

  async function runStoryPipeline(
    action: "recrawl" | "recrawl_chapters" | "translate_metadata" | "repolish" | "retranslate",
    options: { clearRaw?: boolean; qualityOnly?: boolean; skipChapterTitles?: boolean } = {}
  ) {
    setPipelineLoading(action);
    setMessage(null);
    setError(null);

    const fromChapter = rangeFrom ? Number(rangeFrom) : undefined;
    const toChapter = rangeTo ? Number(rangeTo) : undefined;
    const body: Record<string, unknown> = { action, ...options };
    if (fromChapter && Number.isFinite(fromChapter)) body.fromChapter = fromChapter;
    if (toChapter && Number.isFinite(toChapter)) body.toChapter = toChapter;
    if (selectedChapters.length && (action === "repolish" || action === "retranslate")) {
      body.chapterNumbers = selectedChapters;
    }

    const response = await fetch(`/api/stories/${storyId}/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    setPipelineLoading(null);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Pipeline thất bại");
      return;
    }
    const payload = (await response.json()) as {
      results?: Array<{ ok: boolean }>;
      ok?: boolean;
      async?: boolean;
      run?: { id: string };
    };
    if (payload.async && payload.run?.id) {
      setMessage(
        `${action} đang chạy nền — xem log tại Scripts (run ${payload.run.id.slice(0, 8)}…)`
      );
    } else if (payload.results?.length) {
      const ok = payload.results.filter((r) => r.ok).length;
      setMessage(`${action}: ${ok}/${payload.results.length} chapter`);
    } else if (payload.ok) {
      setMessage(`Đã chạy ${action}`);
    } else {
      setMessage(`Đã gửi yêu cầu ${action}`);
    }
    void load();
  }

  async function crawlThisStory() {
    setCrawlStoryLoading(true);
    setMessage(null);
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
    setMessage(
      `Đã bắt đầu crawl — xem log tại /operations?run=${payload.run.id.slice(0, 8)}…`
    );
  }

  function qualityBadgeLabel(issue: string) {
    switch (issue) {
      case "missing_text":
        return "no text";
      case "failed_job":
        return "job fail";
      case "low_ratio":
        return "low ratio";
      case "missing_polished":
        return "no polish";
      case "bad_title":
        return "bad title";
      default:
        return issue;
    }
  }

  if (loading) return <p>Đang tải...</p>;
  if (!story) return <div className="alert alert-error">{error ?? "Không tìm thấy truyện"}</div>;

  return (
    <>
      <div className="admin-header">
        <div>
          <Link href="/stories">← Danh sách</Link>
          <h1>{form.displayTitle || form.title}</h1>
          <div className="meta-list">
            <span>ID: {story.id}</span>
            <span>Source: {story.sourceCode}</span>
            {story.sourceUrl ? (
              <span>
                Nguồn:{" "}
                <a href={story.sourceUrl} target="_blank" rel="noreferrer">
                  {story.sourceUrl}
                </a>
              </span>
            ) : null}
            <span>
              Jobs: <Link href={`/jobs?storyId=${story.id}`}>Xem queue</Link>
            </span>
            <span>
              Reader:{" "}
              <a href={`${READER_URL}/stories/${story.id}`} target="_blank" rel="noreferrer">
                Mở trên reader
              </a>
            </span>
          </div>
        </div>
      </div>

      {message ? <div className="alert alert-success">{message}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Metadata truyện</h2>
        <div className="form-grid">
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
            onClick={() => void runStoryPipeline("recrawl")}
          >
            {pipelineLoading === "recrawl" ? "..." : "Re-crawl catalog"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(pipelineLoading)}
            onClick={() => void runStoryPipeline("recrawl_chapters", { clearRaw: true })}
          >
            {pipelineLoading === "recrawl_chapters" ? "..." : "Re-crawl chapters (xóa raw)"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(pipelineLoading)}
            onClick={() => void runStoryPipeline("translate_metadata", { skipChapterTitles: true })}
          >
            {pipelineLoading === "translate_metadata" ? "..." : "Dịch title / mô tả / tác giả"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(pipelineLoading)}
            onClick={() => void runStoryPipeline("translate_metadata")}
          >
            {pipelineLoading === "translate_metadata" ? "..." : "+ Dịch tiêu đề chapter (range)"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(pipelineLoading)}
            onClick={() => void runStoryPipeline("repolish", { qualityOnly: !rangeFrom && !rangeTo && !selectedChapters.length })}
          >
            {pipelineLoading === "repolish" ? "..." : "Re-polish range"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(pipelineLoading)}
            onClick={() => void runStoryPipeline("retranslate", { qualityOnly: !rangeFrom && !rangeTo && !selectedChapters.length })}
          >
            {pipelineLoading === "retranslate" ? "..." : "Re-translate range"}
          </button>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Char map</h2>
        <div className="meta-list" style={{ marginBottom: 10 }}>
          {charMapMeta?.updatedAt ? <span>Cập nhật: {charMapMeta.updatedAt}</span> : null}
          {charMapMeta?.updatedToChapter ? <span>Đến chapter: {charMapMeta.updatedToChapter}</span> : null}
          {!charMap.trim() ? <span className="badge badge-warn">Chưa có char map trong DB</span> : null}
        </div>
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
            Có vấn đề
          </label>
        </div>

        {selectedChapters.length > 0 ? (
          <div className="toolbar bulk-toolbar">
            <span>{selectedChapters.length} chapter đã chọn</span>
            <button type="button" className="btn btn-secondary" disabled={Boolean(bulkLoading)} onClick={() => void runBulk("repolish")}>
              Bulk re-polish
            </button>
            <button type="button" className="btn btn-secondary" disabled={Boolean(bulkLoading)} onClick={() => void runBulk("retranslate")}>
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
                    <th />
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
                          {chapter.qualityIssues.map((issue) => (
                            <span key={issue} className="badge badge-danger">
                              {qualityBadgeLabel(issue)}
                            </span>
                          ))}
                          {chapter.outputRatio !== null ? (
                            <span className="badge badge-muted">{Math.round(chapter.outputRatio * 100)}%</span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <Link href={`/stories/${storyId}/chapters/${chapter.chapterNumber}`}>Sửa</Link>
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
    </>
  );
}
