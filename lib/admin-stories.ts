import { query } from "@/lib/db";
import { parseAuditIssueCodes, parseAuditIssues } from "@/lib/quality-display";
import { CLEAR_READER_FORMATTED_SQL, STORY_SLUG_EXPR } from "@/lib/story-sql";
import type {
  AdminChapterDetail,
  AdminChapterSummary,
  AdminStoryDetail,
  AdminStoryRow,
  CoreDashboardStats,
  Paginated,
  QaTriageStoryRow,
  QualityDashboardStats,
  StoryHealthSummary,
  StoryQualitySummary
} from "@/lib/types";

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

const CHAPTER_AUDITABLE_SQL = `(
  c.is_polished = TRUE
  AND c.polished_text_content IS NOT NULL
  AND length(trim(c.polished_text_content)) > 100
)`;

const STORY_QUALITY_AGG_SQL = `
  COUNT(c.id) FILTER (WHERE ${CHAPTER_AUDITABLE_SQL})::text AS auditable_count,
  COUNT(c.id) FILTER (WHERE c.quality_status = 'passed')::text AS qa_passed,
  COUNT(c.id) FILTER (WHERE c.quality_status IN ('failed', 'failed_manual'))::text AS qa_failed,
  COUNT(c.id) FILTER (WHERE ${CHAPTER_AUDITABLE_SQL} AND (c.quality_status IS NULL OR c.quality_status = 'pending_audit'))::text AS qa_pending
`;

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
  translated_count: string;
  audio_count: string;
  auditable_count?: string;
  qa_passed?: string;
  qa_failed?: string;
  qa_pending?: string;
};

export async function getQualityDashboardStats(): Promise<QualityDashboardStats> {
  const rows = await query<{
    auditable: string;
    passed: string;
    failed: string;
    pending: string;
    stories_failed: string;
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE ${CHAPTER_AUDITABLE_SQL.replace(/\bc\./g, "ch.")})::text AS auditable,
      COUNT(*) FILTER (WHERE ch.quality_status = 'passed')::text AS passed,
      COUNT(*) FILTER (WHERE ch.quality_status IN ('failed', 'failed_manual'))::text AS failed,
      COUNT(*) FILTER (
        WHERE ${CHAPTER_AUDITABLE_SQL.replace(/\bc\./g, "ch.")}
          AND (ch.quality_status IS NULL OR ch.quality_status = 'pending_audit')
      )::text AS pending,
      (
        SELECT COUNT(DISTINCT story_id)::text
        FROM chapters ch2
        WHERE ch2.quality_status IN ('failed', 'failed_manual')
      ) AS stories_failed
    FROM chapters ch
  `);

  const row = rows[0];
  return {
    auditableChapters: Number(row?.auditable ?? 0),
    qaPassed: Number(row?.passed ?? 0),
    qaFailed: Number(row?.failed ?? 0),
    qaPending: Number(row?.pending ?? 0),
    storiesWithQaFailed: Number(row?.stories_failed ?? 0)
  };
}

function buildStoryHealth(
  story: AdminStoryRow,
  metadata: Record<string, unknown> | null,
  extra: {
    missingPolished: number;
    failedJobs: number;
    stuckRunningJobs: number;
  }
): StoryHealthSummary | null {
  const warnings: string[] = [];
  const catalogGap = Math.max(0, story.totalChapters - story.chapterCount);
  if (catalogGap > 0) warnings.push(`Thiếu ${catalogGap} chapter trong DB so với catalog`);
  if (extra.missingPolished > 0) warnings.push(`${extra.missingPolished} chapter có text nhưng chưa polish`);
  if (extra.failedJobs > 0) warnings.push(`${extra.failedJobs} job failed`);
  if (extra.stuckRunningJobs > 0) warnings.push(`${extra.stuckRunningJobs} job running > 2h`);

  const charMapUpdatedToChapter =
    typeof metadata?.char_map_updated_to_chapter === "number"
      ? metadata.char_map_updated_to_chapter
      : Number(metadata?.char_map_updated_to_chapter) || null;
  const hasCharMap = Boolean(
    typeof metadata?.char_map_content === "string" && String(metadata.char_map_content).trim()
  );
  const charMapStale =
    story.polishedCount > 0 &&
    (!hasCharMap ||
      (charMapUpdatedToChapter != null && story.polishedCount - charMapUpdatedToChapter > 150));
  if (charMapStale) warnings.push("Char map thiếu hoặc cũ (>150 chapter so với polish)");

  if (
    !warnings.length &&
    catalogGap === 0 &&
    extra.missingPolished === 0 &&
    extra.failedJobs === 0 &&
    extra.stuckRunningJobs === 0 &&
    !charMapStale
  ) {
    return null;
  }

  return {
    catalogGap,
    missingPolished: extra.missingPolished,
    failedJobs: extra.failedJobs,
    stuckRunningJobs: extra.stuckRunningJobs,
    charMapStale,
    charMapUpdatedToChapter,
    warnings
  };
}

export async function listQaTriageStories(options: {
  page?: number;
  pageSize?: number;
  mode?: "failed" | "pending" | "all";
  sourceCode?: string;
} = {}): Promise<Paginated<QaTriageStoryRow>> {
  const { page, pageSize, offset } = pageParams(options.page, options.pageSize);
  const mode = options.mode ?? "failed";
  const sourceCode = options.sourceCode?.trim() || "";

  const filterValues: unknown[] = [];
  const storyWhere = sourceCode
    ? (filterValues.push(sourceCode), `WHERE src.code = $${filterValues.length}`)
    : "";

  const having =
    mode === "pending"
      ? `HAVING COUNT(c.id) FILTER (WHERE ${CHAPTER_AUDITABLE_SQL} AND (c.quality_status IS NULL OR c.quality_status = 'pending_audit')) > 0`
      : mode === "all"
        ? `HAVING COUNT(c.id) FILTER (WHERE ${CHAPTER_AUDITABLE_SQL}) > 0`
        : `HAVING COUNT(c.id) FILTER (WHERE c.quality_status IN ('failed', 'failed_manual')) > 0`;

  const orderSql =
    mode === "pending"
      ? `COUNT(c.id) FILTER (WHERE ${CHAPTER_AUDITABLE_SQL} AND (c.quality_status IS NULL OR c.quality_status = 'pending_audit')) DESC`
      : `COUNT(c.id) FILTER (WHERE c.quality_status IN ('failed', 'failed_manual')) DESC`;

  const countRows = await query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count FROM (
        SELECT s.id
        FROM stories s
        JOIN sources src ON src.id = s.source_id
        LEFT JOIN chapters c ON c.story_id = s.id
        ${storyWhere}
        GROUP BY s.id, src.code
        ${having}
      ) t
    `,
    filterValues
  );

  const limitParam = filterValues.length + 1;
  const offsetParam = filterValues.length + 2;
  const rows = await query<
    StoryListRow & { failed_chapters: string; pending_chapters: string }
  >(
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
        COUNT(c.id) FILTER (WHERE c.is_translated = TRUE)::text AS translated_count,
        COUNT(c.id) FILTER (WHERE c.is_audio_generated = TRUE)::text AS audio_count,
        ${STORY_QUALITY_AGG_SQL},
        COUNT(c.id) FILTER (WHERE c.quality_status IN ('failed', 'failed_manual'))::text AS failed_chapters,
        COUNT(c.id) FILTER (
          WHERE ${CHAPTER_AUDITABLE_SQL}
            AND (c.quality_status IS NULL OR c.quality_status = 'pending_audit')
        )::text AS pending_chapters
      FROM stories s
      JOIN sources src ON src.id = s.source_id
      LEFT JOIN chapters c ON c.story_id = s.id
      ${storyWhere}
      GROUP BY s.id, src.code
      ${having}
      ORDER BY ${orderSql}, s.updated_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `,
    [...filterValues, pageSize, offset]
  );

  const total = Number(countRows[0]?.count ?? 0);
  return {
    items: rows.map((row) => ({
      ...mapStoryRow(row),
      failedChapters: Number(row.failed_chapters),
      pendingChapters: Number(row.pending_chapters)
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

export async function markChapterQualityPassed(chapterId: string, note?: string) {
  await query(
    `
      UPDATE chapters
      SET quality_status = 'passed',
          quality_checked_at = now(),
          quality_issues = '[]'::jsonb,
          quality_last_action = $2,
          updated_at = now()
      WHERE id = $1
    `,
    [chapterId, note ? `manual_pass:${note.slice(0, 120)}` : "manual_pass"]
  );
}

export async function markChapterQualityFailed(chapterId: string, note?: string) {
  await query(
    `
      UPDATE chapters
      SET quality_status = 'failed_manual',
          quality_checked_at = now(),
          quality_last_action = $2,
          updated_at = now()
      WHERE id = $1
    `,
    [chapterId, note ? `manual_fail:${note.slice(0, 120)}` : "manual_fail"]
  );
}

export async function bulkMarkChapterQualityPassed(chapterIds: string[], note?: string) {
  if (!chapterIds.length) return 0;
  const lastAction = note ? `manual_pass_bulk:${note.slice(0, 100)}` : "manual_pass_bulk";
  await query(
    `
      UPDATE chapters
      SET quality_status = 'passed',
          quality_checked_at = now(),
          quality_issues = '[]'::jsonb,
          quality_last_action = $2,
          updated_at = now()
      WHERE id = ANY($1::uuid[])
    `,
    [chapterIds, lastAction]
  );
  return chapterIds.length;
}

export async function resolveChapterIdsByNumbers(storyId: string, chapterNumbers: number[]) {
  if (!chapterNumbers.length) return [];
  const rows = await query<{ id: string; chapter_number: number }>(
    `
      SELECT c.id, c.chapter_number
      FROM chapters c
      WHERE c.story_id = $1 AND c.chapter_number = ANY($2::int[])
      ORDER BY c.chapter_number
    `,
    [storyId, chapterNumbers]
  );
  return rows.map((row) => ({ id: row.id, chapterNumber: row.chapter_number }));
}

export type QaIssueStatRow = {
  code: string;
  count: number;
};

export async function getQaIssueStats(limit = 20): Promise<QaIssueStatRow[]> {
  const rows = await query<{ code: string; count: string }>(
    `
      SELECT issue_code AS code, COUNT(*)::text AS count
      FROM (
        SELECT
          CASE
            WHEN jsonb_typeof(elem) = 'string' THEN trim(both '"' from elem::text)
            WHEN elem ? 'code' THEN elem->>'code'
            ELSE NULL
          END AS issue_code
        FROM chapters c
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(c.quality_issues) = 'array' THEN c.quality_issues ELSE '[]'::jsonb END
        ) AS elem
        WHERE c.quality_status IN ('failed', 'failed_manual')
          AND c.is_polished = TRUE
          AND c.polished_text_content IS NOT NULL
      ) issues
      WHERE issue_code IS NOT NULL AND issue_code <> ''
      GROUP BY issue_code
      ORDER BY COUNT(*) DESC
      LIMIT $1
    `,
    [limit]
  );
  return rows.map((row) => ({ code: row.code, count: Number(row.count) }));
}

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function exportStoryQaCsv(storyId: string): Promise<string> {
  const rows = await query<{
    chapter_number: number;
    title: string;
    quality_status: string | null;
    quality_issues: unknown;
    quality_repair_attempts: number;
    quality_checked_at: Date | null;
    quality_last_action: string | null;
  }>(
    `
      SELECT
        c.chapter_number,
        c.title,
        c.quality_status,
        c.quality_issues,
        c.quality_repair_attempts,
        c.quality_checked_at,
        c.quality_last_action
      FROM chapters c
      WHERE c.story_id = $1
        AND c.quality_status IN ('failed', 'failed_manual', 'pending_audit', 'passed')
        AND c.is_polished = TRUE
        AND c.polished_text_content IS NOT NULL
      ORDER BY c.chapter_number
    `,
    [storyId]
  );

  const header = "chapter_number,title,quality_status,issue_codes,repair_attempts,checked_at,last_action";
  const lines = rows.map((row) => {
    const codes = parseAuditIssueCodes(row.quality_issues).join("; ");
    return [
      row.chapter_number,
      csvEscape(row.title ?? ""),
      row.quality_status ?? "",
      csvEscape(codes),
      row.quality_repair_attempts,
      row.quality_checked_at?.toISOString() ?? "",
      csvEscape(row.quality_last_action ?? "")
    ].join(",");
  });
  return [header, ...lines].join("\n");
}

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
    translatedCount: Number(row.translated_count ?? 0),
    audioCount: Number(row.audio_count),
    qualitySummary: mapQualitySummary(row)
  };
}

function mapQualitySummary(row: StoryListRow): StoryQualitySummary | null {
  const auditable = Number(row.auditable_count ?? 0);
  if (auditable <= 0 && Number(row.polished_count ?? 0) <= 0 && Number(row.translated_count ?? 0) <= 0) {
    return null;
  }
  return {
    auditableChapters: auditable,
    passed: Number(row.qa_passed ?? 0),
    failed: Number(row.qa_failed ?? 0),
    pending: Number(row.qa_pending ?? 0)
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
    qa_failed: string;
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
        ), '0') AS pipeline_failed,
        COALESCE((
          SELECT COUNT(*)::text FROM chapters c
          WHERE c.quality_status IN ('failed', 'failed_manual')
            AND c.quality_checked_at IS NOT NULL
            AND c.quality_checked_at::date = ds.day
        ), '0') AS qa_failed
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
    pipelineRunsFailed: Number(row.pipeline_failed),
    qaFailedChapters: Number(row.qa_failed)
  }));
}

export async function listAdminStories(options: {
  page?: number;
  pageSize?: number;
  queryText?: string;
  sourceCode?: string;
  activeOnly?: boolean;
  hasPolished?: boolean;
  hasQaFailed?: boolean;
  hasQaPending?: boolean;
  sort?: "updated" | "title" | "chapters" | "qa_failed";
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

  if (options.hasQaFailed) {
    where.push(`EXISTS (
      SELECT 1 FROM chapters cq
      WHERE cq.story_id = s.id AND cq.quality_status IN ('failed', 'failed_manual')
    )`);
  }

  if (options.hasQaPending) {
    where.push(`EXISTS (
      SELECT 1 FROM chapters cq
      WHERE cq.story_id = s.id
        AND ${CHAPTER_AUDITABLE_SQL.replace(/\bc\./g, "cq.")}
        AND (cq.quality_status IS NULL OR cq.quality_status = 'pending_audit')
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
    options.sort === "qa_failed"
      ? `COUNT(c.id) FILTER (WHERE c.quality_status IN ('failed', 'failed_manual')) DESC, s.updated_at DESC`
      : options.sort === "title"
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
        COUNT(c.id) FILTER (WHERE c.is_translated = TRUE)::text AS translated_count,
        COUNT(c.id) FILTER (WHERE c.is_audio_generated = TRUE)::text AS audio_count,
        ${STORY_QUALITY_AGG_SQL}
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
        COUNT(c.id) FILTER (WHERE c.is_translated = TRUE)::text AS translated_count,
        COUNT(c.id) FILTER (WHERE c.is_audio_generated = TRUE)::text AS audio_count,
        ${STORY_QUALITY_AGG_SQL}
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
  const story = mapStoryRow(rows[0]);

  const healthRows = await query<{
    missing_polished: string;
    failed_jobs: string;
    stuck_running: string;
  }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE
          c.is_polished = FALSE
          AND (
            c.raw_text_content IS NOT NULL OR c.translated_text_content IS NOT NULL
            OR c.raw_text_path IS NOT NULL OR c.translated_text_path IS NOT NULL
          )
        )::text AS missing_polished,
        (
          SELECT COUNT(*)::text FROM story_jobs j
          WHERE j.story_id = $1 AND j.status = 'failed'
        ) AS failed_jobs,
        (
          SELECT COUNT(*)::text FROM story_jobs j
          WHERE j.story_id = $1 AND j.status = 'running'
            AND j.updated_at < now() - interval '2 hours'
        ) AS stuck_running
      FROM chapters c
      WHERE c.story_id = $1
    `,
    [storyId]
  );

  const healthRow = healthRows[0];
  const health = buildStoryHealth(story, rows[0].metadata, {
    missingPolished: Number(healthRow?.missing_polished ?? 0),
    failedJobs: Number(healthRow?.failed_jobs ?? 0),
    stuckRunningJobs: Number(healthRow?.stuck_running ?? 0)
  });

  return {
    ...story,
    metadata: rows[0].metadata,
    health
  };
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
  is_auditable: boolean;
  quality_status: string | null;
  quality_checked_at: Date | null;
  quality_issues: unknown;
  quality_repair_attempts: number;
  quality_last_action: string | null;
};

function buildQualityIssues(row: ChapterListRow): string[] {
  const issues: string[] = [];
  const auditCodes = parseAuditIssueCodes(row.quality_issues);
  if (row.is_auditable && auditCodes.length) {
    for (const code of auditCodes) {
      if (!issues.includes(code)) issues.push(code);
    }
  }
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
  const issueDetails = parseAuditIssues(row.quality_issues);
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
    qualityIssues: buildQualityIssues(row),
    isAuditable: row.is_auditable,
    qualityStatus: row.quality_status,
    qualityCheckedAt: row.quality_checked_at?.toISOString() ?? null,
    qualityAuditIssues: issueDetails.map((issue) => issue.code),
    qualityIssueDetails: issueDetails,
    qualityRepairAttempts: row.quality_repair_attempts,
    qualityLastAction: row.quality_last_action
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
    qaStatus?: "passed" | "failed" | "pending";
    auditableOnly?: boolean;
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
      OR c.quality_status IN ('failed', 'failed_manual')
      OR (
        ${CHAPTER_AUDITABLE_SQL}
        AND jsonb_array_length(COALESCE(c.quality_issues, '[]'::jsonb)) > 0
      )
    )`);
  }

  if (options.auditableOnly) {
    where.push(CHAPTER_AUDITABLE_SQL);
  }

  if (options.qaStatus === "passed") {
    where.push(`c.quality_status = 'passed'`);
  } else if (options.qaStatus === "failed") {
    where.push(`c.quality_status IN ('failed', 'failed_manual')`);
  } else if (options.qaStatus === "pending") {
    where.push(`(${CHAPTER_AUDITABLE_SQL} AND (c.quality_status IS NULL OR c.quality_status = 'pending_audit'))`);
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
        (${CHAPTER_AUDITABLE_SQL}) AS is_auditable,
        c.quality_status,
        c.quality_checked_at,
        c.quality_issues,
        COALESCE(c.quality_repair_attempts, 0) AS quality_repair_attempts,
        c.quality_last_action,
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
        (${CHAPTER_AUDITABLE_SQL}) AS is_auditable,
        c.quality_status,
        c.quality_checked_at,
        c.quality_issues,
        COALESCE(c.quality_repair_attempts, 0) AS quality_repair_attempts,
        c.quality_last_action,
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
