import { query } from "@/lib/db";
import { CLEAR_READER_FORMATTED_SQL, STORY_SLUG_EXPR } from "@/lib/story-sql";
import type {
  AdminChapterDetail,
  AdminChapterSummary,
  AdminStoryDetail,
  AdminStoryRow,
  CoreDashboardStats,
  Paginated
} from "@/lib/types";

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

function pageParams(page?: number, pageSize?: number) {
  const cleanPage = Math.max(1, Number.isFinite(page) ? Number(page) : 1);
  const cleanPageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.isFinite(pageSize) ? Number(pageSize) : DEFAULT_PAGE_SIZE));
  return { page: cleanPage, pageSize: cleanPageSize, offset: (cleanPage - 1) * cleanPageSize };
}

type StoryListRow = {
  id: string;
  title: string;
  display_title: string | null;
  original_title: string | null;
  author: string | null;
  category: string | null;
  status: string | null;
  description: string | null;
  cover_image_url: string | null;
  total_chapters: number;
  is_completed: boolean;
  is_active: boolean;
  source_code: string;
  source_url: string | null;
  slug: string | null;
  updated_at: Date;
  chapter_count: string;
  polished_count: string;
  audio_count: string;
};

function mapStoryRow(row: StoryListRow): AdminStoryRow {
  return {
    id: row.id,
    title: row.title,
    displayTitle: row.display_title,
    originalTitle: row.original_title,
    author: row.author,
    category: row.category,
    status: row.status,
    description: row.description,
    coverImageUrl: row.cover_image_url,
    totalChapters: row.total_chapters,
    isCompleted: row.is_completed,
    isActive: row.is_active,
    sourceCode: row.source_code,
    sourceUrl: row.source_url,
    slug: row.slug,
    updatedAt: row.updated_at.toISOString(),
    chapterCount: Number(row.chapter_count),
    polishedCount: Number(row.polished_count),
    audioCount: Number(row.audio_count)
  };
}

export async function getDashboardStats(): Promise<CoreDashboardStats> {
  const rows = await query<{
    total_stories: string;
    active_stories: string;
    total_chapters: string;
    polished_chapters: string;
    translated_chapters: string;
    audio_chapters: string;
    pending_jobs: string;
    running_jobs: string;
    failed_jobs: string;
  }>(`
    SELECT
      (SELECT COUNT(*)::text FROM stories) AS total_stories,
      (SELECT COUNT(*)::text FROM stories WHERE is_active = TRUE) AS active_stories,
      (SELECT COUNT(*)::text FROM chapters) AS total_chapters,
      (SELECT COUNT(*)::text FROM chapters WHERE is_polished = TRUE) AS polished_chapters,
      (SELECT COUNT(*)::text FROM chapters WHERE is_translated = TRUE) AS translated_chapters,
      (SELECT COUNT(*)::text FROM chapters WHERE is_audio_generated = TRUE) AS audio_chapters,
      (SELECT COUNT(*)::text FROM story_jobs WHERE status = 'pending') AS pending_jobs,
      (SELECT COUNT(*)::text FROM story_jobs WHERE status = 'running') AS running_jobs,
      (SELECT COUNT(*)::text FROM story_jobs WHERE status = 'failed') AS failed_jobs
  `);

  const row = rows[0];
  return {
    totalStories: Number(row?.total_stories ?? 0),
    activeStories: Number(row?.active_stories ?? 0),
    totalChapters: Number(row?.total_chapters ?? 0),
    polishedChapters: Number(row?.polished_chapters ?? 0),
    translatedChapters: Number(row?.translated_chapters ?? 0),
    audioChapters: Number(row?.audio_chapters ?? 0),
    pendingJobs: Number(row?.pending_jobs ?? 0),
    runningJobs: Number(row?.running_jobs ?? 0),
    failedJobs: Number(row?.failed_jobs ?? 0)
  };
}

export async function getDashboardTrends(days = 7) {
  const safeDays = Math.min(30, Math.max(1, days));
  const rows = await query<{
    day: Date;
    polished_chapters: string;
    jobs_done: string;
    jobs_failed: string;
    pipeline_failed: string;
  }>(
    `
      WITH day_series AS (
        SELECT generate_series(
          (CURRENT_DATE - (($1::int - 1) * INTERVAL '1 day'))::date,
          CURRENT_DATE::date,
          INTERVAL '1 day'
        )::date AS day
      )
      SELECT
        ds.day,
        COALESCE((
          SELECT COUNT(*)::text FROM chapters c
          WHERE c.polished_at IS NOT NULL AND c.polished_at::date = ds.day
        ), '0') AS polished_chapters,
        COALESCE((
          SELECT COUNT(*)::text FROM story_jobs j
          WHERE j.status = 'done' AND j.updated_at::date = ds.day
        ), '0') AS jobs_done,
        COALESCE((
          SELECT COUNT(*)::text FROM story_jobs j
          WHERE j.status = 'failed' AND j.updated_at::date = ds.day
        ), '0') AS jobs_failed,
        COALESCE((
          SELECT COUNT(*)::text FROM admin_pipeline_runs r
          WHERE r.status = 'failed' AND r.created_at::date = ds.day
        ), '0') AS pipeline_failed
      FROM day_series ds
      ORDER BY ds.day ASC
    `,
    [safeDays]
  );

  return rows.map((row) => ({
    date: row.day.toISOString().slice(0, 10),
    polishedChapters: Number(row.polished_chapters),
    jobsDone: Number(row.jobs_done),
    jobsFailed: Number(row.jobs_failed),
    pipelineRunsFailed: Number(row.pipeline_failed)
  }));
}

export async function listAdminStories(options: {
  page?: number;
  pageSize?: number;
  queryText?: string;
  sourceCode?: string;
  activeOnly?: boolean;
  hasPolished?: boolean;
  sort?: "updated" | "title" | "chapters";
} = {}): Promise<Paginated<AdminStoryRow>> {
  const { page, pageSize, offset } = pageParams(options.page, options.pageSize);
  const where = ["TRUE"];
  const values: unknown[] = [];

  if (options.activeOnly) {
    where.push("s.is_active = TRUE");
  }

  if (options.sourceCode) {
    values.push(options.sourceCode);
    where.push(`src.code = $${values.length}`);
  }

  if (options.hasPolished) {
    where.push(`EXISTS (
      SELECT 1 FROM chapters cp
      WHERE cp.story_id = s.id AND cp.is_polished = TRUE
    )`);
  }

  if (options.queryText?.trim()) {
    const term = options.queryText.trim();
    if (/^\d+$/.test(term)) {
      values.push(term);
      const idx = values.length;
      where.push(`(
        s.id::text = $${idx}
        OR s.title ILIKE '%' || $${idx} || '%'
        OR s.display_title ILIKE '%' || $${idx} || '%'
      )`);
    } else {
      values.push(`%${term}%`);
      const idx = values.length;
      where.push(`(
        s.title ILIKE $${idx}
        OR s.display_title ILIKE $${idx}
        OR s.original_title ILIKE $${idx}
        OR s.author ILIKE $${idx}
      )`);
    }
  }

  const orderSql =
    options.sort === "title"
      ? "COALESCE(NULLIF(s.display_title, ''), s.title) ASC"
      : options.sort === "chapters"
        ? "s.total_chapters DESC, s.updated_at DESC"
        : "s.updated_at DESC, s.created_at DESC";

  const whereSql = where.join(" AND ");
  const countRows = await query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM stories s
      JOIN sources src ON src.id = s.source_id
      WHERE ${whereSql}
    `,
    values
  );

  values.push(pageSize, offset);
  const rows = await query<StoryListRow>(
    `
      SELECT
        s.id,
        s.title,
        s.display_title,
        s.original_title,
        s.author,
        s.category,
        s.status,
        s.description,
        s.cover_image_url,
        s.total_chapters,
        s.is_completed,
        s.is_active,
        s.source_url,
        ${STORY_SLUG_EXPR} AS slug,
        s.updated_at,
        src.code AS source_code,
        COUNT(c.id)::text AS chapter_count,
        COUNT(c.id) FILTER (WHERE c.is_polished = TRUE)::text AS polished_count,
        COUNT(c.id) FILTER (WHERE c.is_audio_generated = TRUE)::text AS audio_count
      FROM stories s
      JOIN sources src ON src.id = s.source_id
      LEFT JOIN chapters c ON c.story_id = s.id
      WHERE ${whereSql}
      GROUP BY s.id, src.code
      ORDER BY ${orderSql}
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );

  const total = Number(countRows[0]?.count ?? 0);
  return {
    items: rows.map(mapStoryRow),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

export async function getAdminStory(storyId: string): Promise<AdminStoryDetail | null> {
  const rows = await query<StoryListRow & { metadata: Record<string, unknown> | null }>(
    `
      SELECT
        s.id,
        s.title,
        s.display_title,
        s.original_title,
        s.author,
        s.category,
        s.status,
        s.description,
        s.cover_image_url,
        s.total_chapters,
        s.is_completed,
        s.is_active,
        s.source_url,
        ${STORY_SLUG_EXPR} AS slug,
        s.updated_at,
        s.metadata,
        src.code AS source_code,
        COUNT(c.id)::text AS chapter_count,
        COUNT(c.id) FILTER (WHERE c.is_polished = TRUE)::text AS polished_count,
        COUNT(c.id) FILTER (WHERE c.is_audio_generated = TRUE)::text AS audio_count
      FROM stories s
      JOIN sources src ON src.id = s.source_id
      LEFT JOIN chapters c ON c.story_id = s.id
      WHERE s.id = $1
      GROUP BY s.id, src.code
      LIMIT 1
    `,
    [storyId]
  );

  if (!rows[0]) return null;
  return { ...mapStoryRow(rows[0]), metadata: rows[0].metadata };
}

type ChapterListRow = {
  id: string;
  story_id: string;
  chapter_number: number;
  title: string;
  is_downloaded: boolean;
  is_translated: boolean;
  is_polished: boolean;
  is_audio_generated: boolean;
  has_raw: boolean;
  has_translated: boolean;
  has_polished: boolean;
  has_audio: boolean;
  has_failed_job: boolean;
  output_ratio: number | null;
  updated_at: Date | null;
};

function buildQualityIssues(row: ChapterListRow): string[] {
  const issues: string[] = [];
  if (!row.has_raw && !row.has_translated && !row.has_polished) issues.push("missing_text");
  if (row.has_failed_job) issues.push("failed_job");
  if (row.output_ratio !== null && row.output_ratio < 0.7) issues.push("low_ratio");
  if (
    !row.is_polished &&
    (row.has_raw || row.has_translated)
  ) {
    issues.push("missing_polished");
  }
  if (
    !row.title.trim() ||
    /^chapter\s/i.test(row.title) ||
    /^chương\s*\d/i.test(row.title)
  ) {
    issues.push("bad_title");
  }
  return issues;
}

function mapChapterRow(row: ChapterListRow): AdminChapterSummary {
  return {
    id: row.id,
    storyId: row.story_id,
    chapterNumber: row.chapter_number,
    title: row.title,
    isDownloaded: row.is_downloaded,
    isTranslated: row.is_translated,
    isPolished: row.is_polished,
    isAudioGenerated: row.is_audio_generated,
    hasRawText: row.has_raw,
    hasTranslatedText: row.has_translated,
    hasPolishedText: row.has_polished,
    hasAudio: row.has_audio,
    updatedAt: row.updated_at?.toISOString() ?? null,
    hasFailedJob: row.has_failed_job,
    outputRatio: row.output_ratio,
    qualityIssues: buildQualityIssues(row)
  };
}

export async function listAdminChapters(
  storyId: string,
  options: {
    page?: number;
    pageSize?: number;
    search?: string;
    missingPolished?: boolean;
    emptyTitle?: boolean;
    hasQualityIssue?: boolean;
  } = {}
): Promise<Paginated<AdminChapterSummary>> {
  const { page, pageSize, offset } = pageParams(options.page, options.pageSize);
  const where = ["c.story_id = $1"];
  const values: unknown[] = [storyId];

  if (options.search?.trim()) {
    const term = options.search.trim();
    const chapterNumber = Number(term);
    if (Number.isFinite(chapterNumber)) {
      values.push(Math.floor(chapterNumber));
      where.push(`c.chapter_number = $${values.length}`);
    } else {
      values.push(`%${term}%`);
      where.push(`c.title ILIKE $${values.length}`);
    }
  }

  if (options.missingPolished) {
    where.push(`(
      c.is_polished = FALSE
      AND (
        c.raw_text_content IS NOT NULL OR c.translated_text_content IS NOT NULL
        OR c.raw_text_path IS NOT NULL OR c.translated_text_path IS NOT NULL
      )
    )`);
  }

  if (options.emptyTitle) {
    where.push(`(
      btrim(c.title) = ''
      OR c.title ILIKE 'chapter %'
      OR c.title ~ '^[Cc]hương\\s*\\d'
    )`);
  }

  if (options.hasQualityIssue) {
    where.push(`(
      (
        c.raw_text_content IS NULL AND c.translated_text_content IS NULL AND c.polished_text_content IS NULL
        AND c.raw_text_path IS NULL AND c.translated_text_path IS NULL AND c.polished_text_path IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM story_jobs jf
        WHERE jf.chapter_id = c.id AND jf.status = 'failed'
      )
      OR (
        c.polished_text_content IS NOT NULL
        AND COALESCE(c.translated_text_content, c.raw_text_content) IS NOT NULL
        AND length(c.polished_text_content)::float
          / NULLIF(length(COALESCE(c.translated_text_content, c.raw_text_content)), 0) < 0.7
      )
    )`);
  }

  const whereSql = where.join(" AND ");
  const countRows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM chapters c WHERE ${whereSql}`,
    values
  );

  values.push(pageSize, offset);
  const rows = await query<ChapterListRow>(
    `
      SELECT
        c.id,
        c.story_id,
        c.chapter_number,
        c.title,
        c.is_downloaded,
        c.is_translated,
        c.is_polished,
        c.is_audio_generated,
        (c.raw_text_content IS NOT NULL OR c.raw_text_path IS NOT NULL) AS has_raw,
        (c.translated_text_content IS NOT NULL OR c.translated_text_path IS NOT NULL) AS has_translated,
        (c.polished_text_content IS NOT NULL OR c.polished_text_path IS NOT NULL) AS has_polished,
        (c.is_audio_generated = TRUE AND c.audio_path IS NOT NULL) AS has_audio,
        EXISTS (
          SELECT 1 FROM story_jobs jf
          WHERE jf.chapter_id = c.id AND jf.status = 'failed'
        ) AS has_failed_job,
        CASE
          WHEN c.polished_text_content IS NOT NULL
           AND COALESCE(c.translated_text_content, c.raw_text_content) IS NOT NULL
          THEN length(c.polished_text_content)::float
            / NULLIF(length(COALESCE(c.translated_text_content, c.raw_text_content)), 0)
          ELSE NULL
        END AS output_ratio,
        COALESCE(c.polished_at, c.updated_at, c.created_at) AS updated_at
      FROM chapters c
      WHERE ${whereSql}
      ORDER BY c.chapter_number ASC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );

  const total = Number(countRows[0]?.count ?? 0);
  return {
    items: rows.map(mapChapterRow),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

export async function getAdminChapter(storyId: string, chapterNumber: number): Promise<AdminChapterDetail | null> {
  const rows = await query<
    ChapterListRow & {
      raw_text_content: string | null;
      translated_text_content: string | null;
      polished_text_content: string | null;
      audio_path: string | null;
    }
  >(
    `
      SELECT
        c.id,
        c.story_id,
        c.chapter_number,
        c.title,
        c.is_downloaded,
        c.is_translated,
        c.is_polished,
        c.is_audio_generated,
        (c.raw_text_content IS NOT NULL OR c.raw_text_path IS NOT NULL) AS has_raw,
        (c.translated_text_content IS NOT NULL OR c.translated_text_path IS NOT NULL) AS has_translated,
        (c.polished_text_content IS NOT NULL OR c.polished_text_path IS NOT NULL) AS has_polished,
        (c.is_audio_generated = TRUE AND c.audio_path IS NOT NULL) AS has_audio,
        EXISTS (
          SELECT 1 FROM story_jobs jf
          WHERE jf.chapter_id = c.id AND jf.status = 'failed'
        ) AS has_failed_job,
        CASE
          WHEN c.polished_text_content IS NOT NULL
           AND COALESCE(c.translated_text_content, c.raw_text_content) IS NOT NULL
          THEN length(c.polished_text_content)::float
            / NULLIF(length(COALESCE(c.translated_text_content, c.raw_text_content)), 0)
          ELSE NULL
        END AS output_ratio,
        c.raw_text_content,
        c.translated_text_content,
        c.polished_text_content,
        c.audio_path,
        COALESCE(c.polished_at, c.updated_at, c.created_at) AS updated_at
      FROM chapters c
      WHERE c.story_id = $1 AND c.chapter_number = $2
      LIMIT 1
    `,
    [storyId, chapterNumber]
  );

  if (!rows[0]) return null;
  const summary = mapChapterRow(rows[0]);
  const contentSource = rows[0].polished_text_content
    ? "polished"
    : rows[0].translated_text_content
      ? "translated"
      : rows[0].raw_text_content
        ? "raw"
        : null;

  return {
    ...summary,
    rawTextContent: rows[0].raw_text_content,
    translatedTextContent: rows[0].translated_text_content,
    polishedTextContent: rows[0].polished_text_content,
    audioPath: rows[0].audio_path,
    contentSource
  };
}

export async function updateAdminStory(
  storyId: string,
  patch: {
    title?: string | null;
    displayTitle?: string | null;
    originalTitle?: string | null;
    author?: string | null;
    description?: string | null;
    category?: string | null;
    status?: string | null;
    coverImageUrl?: string | null;
    totalChapters?: number | null;
    isCompleted?: boolean | null;
    isActive?: boolean | null;
  }
) {
  if (patch.coverImageUrl !== undefined) {
    await query(
      `UPDATE stories SET cover_image_url = $2, updated_at = now() WHERE id = $1`,
      [storyId, patch.coverImageUrl]
    );
  }

  await query(
    `
      UPDATE stories
      SET title = COALESCE($2, title),
          display_title = COALESCE($3, display_title),
          original_title = COALESCE($4, original_title),
          author = COALESCE($5, author),
          description = COALESCE($6, description),
          category = COALESCE($7, category),
          status = COALESCE($8, status),
          total_chapters = COALESCE($9, total_chapters),
          is_completed = COALESCE($10, is_completed),
          is_active = COALESCE($11, is_active),
          updated_at = now()
      WHERE id = $1
    `,
    [
      storyId,
      patch.title ?? null,
      patch.displayTitle ?? null,
      patch.originalTitle ?? null,
      patch.author ?? null,
      patch.description ?? null,
      patch.category ?? null,
      patch.status ?? null,
      patch.totalChapters ?? null,
      patch.isCompleted ?? null,
      patch.isActive ?? null
    ]
  );
}

export async function updateAdminChapter(
  chapterId: string,
  patch: {
    title?: string | null;
    polishedContent?: string | null;
    translatedContent?: string | null;
    rawContent?: string | null;
    isPolished?: boolean | null;
    isTranslated?: boolean | null;
  }
) {
  if (patch.polishedContent !== undefined) {
    await query(
      `
        UPDATE chapters
        SET polished_text_content = $2,
            is_polished = COALESCE($3, TRUE),
            polished_at = now(),
            ${CLEAR_READER_FORMATTED_SQL},
            updated_at = now()
        WHERE id = $1
      `,
      [chapterId, patch.polishedContent, patch.isPolished ?? true]
    );
  }

  if (patch.translatedContent !== undefined) {
    await query(
      `
        UPDATE chapters
        SET translated_text_content = $2,
            is_translated = COALESCE($3, TRUE),
            ${CLEAR_READER_FORMATTED_SQL},
            updated_at = now()
        WHERE id = $1
      `,
      [chapterId, patch.translatedContent, patch.isTranslated ?? true]
    );
  }

  if (patch.rawContent !== undefined) {
    await query(
      `
        UPDATE chapters
        SET raw_text_content = $2,
            is_downloaded = TRUE,
            updated_at = now()
        WHERE id = $1
      `,
      [chapterId, patch.rawContent]
    );
  }

  if (patch.title !== undefined) {
    await query(
      `UPDATE chapters SET title = COALESCE($2, title), updated_at = now() WHERE id = $1`,
      [chapterId, patch.title]
    );
  }
}

export async function listSourceCodes(): Promise<string[]> {
  const rows = await query<{ code: string }>(`SELECT code FROM sources ORDER BY code ASC`);
  return rows.map((row) => row.code);
}
