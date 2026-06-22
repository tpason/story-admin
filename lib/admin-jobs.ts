import { query } from "@/lib/db";
import { STORY_SLUG_EXPR } from "@/lib/story-sql";
import type { Paginated } from "@/lib/types";

export type AdminJobRow = {
  id: string;
  jobType: string;
  status: string;
  storyId: string | null;
  storyTitle: string | null;
  chapterId: string | null;
  chapterNumber: number | null;
  chapterTitle: string | null;
  sourceCode: string | null;
  attempts: number;
  maxAttempts: number;
  priority: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  runAfter: string | null;
};

type JobDbRow = {
  id: string;
  job_type: string;
  status: string;
  story_id: string | null;
  story_title: string | null;
  chapter_id: string | null;
  chapter_number: number | null;
  chapter_title: string | null;
  source_code: string | null;
  attempts: number;
  max_attempts: number;
  priority: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
  run_after: Date | null;
};

function mapJob(row: JobDbRow): AdminJobRow {
  return {
    id: row.id,
    jobType: row.job_type,
    status: row.status,
    storyId: row.story_id,
    storyTitle: row.story_title,
    chapterId: row.chapter_id,
    chapterNumber: row.chapter_number,
    chapterTitle: row.chapter_title,
    sourceCode: row.source_code,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    priority: row.priority,
    lastError: row.last_error,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    runAfter: row.run_after?.toISOString() ?? null
  };
}

export async function listAdminJobs(options: {
  page?: number;
  pageSize?: number;
  status?: string;
  jobType?: string;
  storyId?: string;
} = {}): Promise<Paginated<AdminJobRow>> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 40));
  const offset = (page - 1) * pageSize;

  const where = ["TRUE"];
  const values: unknown[] = [];

  if (options.status) {
    values.push(options.status);
    where.push(`j.status = $${values.length}`);
  }
  if (options.jobType) {
    values.push(options.jobType);
    where.push(`j.job_type = $${values.length}`);
  }
  if (options.storyId) {
    values.push(options.storyId);
    where.push(`j.story_id = $${values.length}`);
  }

  const whereSql = where.join(" AND ");
  const countRows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM story_jobs j WHERE ${whereSql}`,
    values
  );

  values.push(pageSize, offset);
  const rows = await query<JobDbRow>(
    `
      SELECT
        j.id, j.job_type, j.status, j.story_id, j.chapter_id, j.source_code,
        j.attempts, j.max_attempts, j.priority, j.last_error,
        j.created_at, j.updated_at, j.run_after,
        s.title AS story_title,
        c.chapter_number, c.title AS chapter_title
      FROM story_jobs j
      LEFT JOIN stories s ON s.id = j.story_id
      LEFT JOIN chapters c ON c.id = j.chapter_id
      WHERE ${whereSql}
      ORDER BY
        CASE j.status
          WHEN 'failed' THEN 0
          WHEN 'running' THEN 1
          WHEN 'pending' THEN 2
          ELSE 3
        END,
        j.updated_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );

  const total = Number(countRows[0]?.count ?? 0);
  return {
    items: rows.map(mapJob),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

export async function retryAdminJob(jobId: string, force = false) {
  const rows = await query<{ id: string }>(
    `
      UPDATE story_jobs
      SET status = 'pending',
          attempts = 0,
          run_after = now(),
          locked_by = NULL,
          locked_at = NULL,
          last_error = NULL,
          updated_at = now()
      WHERE id = $1
        AND (
          status IN ('failed', 'pending')
          OR ($2::boolean = TRUE AND status = 'done')
        )
      RETURNING id
    `,
    [jobId, force]
  );
  return rows.length > 0;
}

type EnqueueContext = {
  chapterId: string;
  storyId: string;
  sourceCode: string;
  chapterNumber: number;
  chapterTitle: string;
  storyTitle: string;
  storySlug: string;
  rawLanguage: string;
};

async function getEnqueueContext(storyId: string, chapterNumber: number): Promise<EnqueueContext | null> {
  const rows = await query<{
    chapter_id: string;
    story_id: string;
    source_code: string;
    chapter_number: number;
    chapter_title: string;
    story_title: string;
    story_slug: string | null;
    story_language: string | null;
    source_language: string | null;
    has_translated: boolean;
  }>(
    `
      SELECT
        c.id AS chapter_id,
        c.story_id,
        src.code AS source_code,
        c.chapter_number,
        c.title AS chapter_title,
        s.title AS story_title,
        ${STORY_SLUG_EXPR} AS story_slug,
        s.language AS story_language,
        s.metadata->>'source_language' AS source_language,
        (c.translated_text_content IS NOT NULL OR c.translated_text_path IS NOT NULL) AS has_translated
      FROM chapters c
      JOIN stories s ON s.id = c.story_id
      JOIN sources src ON src.id = s.source_id
      WHERE c.story_id = $1 AND c.chapter_number = $2
      LIMIT 1
    `,
    [storyId, chapterNumber]
  );

  const row = rows[0];
  if (!row) return null;

  const viSources = new Set(["truyenfull_today", "truyenyy", "docln", "hako", "wattpad_vn", "sttruyen"]);
  let rawLanguage = (row.story_language || row.source_language || "").toLowerCase();
  if (!rawLanguage) {
    rawLanguage = viSources.has(row.source_code) ? "vi" : "en";
  }
  if (rawLanguage === "vi" && row.has_translated) {
    rawLanguage = "vi";
  }

  return {
    chapterId: row.chapter_id,
    storyId: row.story_id,
    sourceCode: row.source_code,
    chapterNumber: row.chapter_number,
    chapterTitle: row.chapter_title,
    storyTitle: row.story_title,
    storySlug: row.story_slug ?? String(row.story_id),
    rawLanguage
  };
}

export async function enqueuePolishJob(storyId: string, chapterNumber: number) {
  const ctx = await getEnqueueContext(storyId, chapterNumber);
  if (!ctx) throw new Error("Chapter not found");

  const chapterStem = `chapter${String(ctx.chapterNumber).padStart(4, "0")}`;
  const payload = {
    raw_language: ctx.rawLanguage,
    story_slug: ctx.storySlug,
    chapter_number: ctx.chapterNumber,
    chapter_title: ctx.chapterTitle || chapterStem,
    source_chapter_title: ctx.chapterTitle || chapterStem,
    translate_story_metadata: ctx.rawLanguage !== "vi",
    source_story_title: ctx.storyTitle,
    post_translate: "polish",
    admin_enqueued: true
  };

  await query(
    `
      INSERT INTO story_jobs (
        job_type, chapter_id, story_id, source_code, model, input_path, output_path,
        payload, priority, max_attempts
      )
      VALUES (
        'polish_chapter', $1, $2, $3, NULL, NULL, NULL, $4::jsonb, 50, 3
      )
      ON CONFLICT (job_type, chapter_id)
      DO UPDATE SET
        story_id = EXCLUDED.story_id,
        source_code = EXCLUDED.source_code,
        payload = story_jobs.payload || EXCLUDED.payload,
        priority = LEAST(story_jobs.priority, EXCLUDED.priority),
        status = CASE
          WHEN story_jobs.status IN ('done', 'running') THEN story_jobs.status
          ELSE 'pending'
        END,
        run_after = CASE
          WHEN story_jobs.status IN ('done', 'running') THEN story_jobs.run_after
          ELSE now()
        END,
        updated_at = now()
    `,
    [ctx.chapterId, ctx.storyId, ctx.sourceCode, JSON.stringify(payload)]
  );

  return ctx;
}

export async function enqueueAudioJob(storyId: string, chapterNumber: number, voiceKey = "preset_binh_an") {
  const ctx = await getEnqueueContext(storyId, chapterNumber);
  if (!ctx) throw new Error("Chapter not found");

  const chapterStem = `chapter${String(ctx.chapterNumber).padStart(4, "0")}`;
  const payload = {
    story_slug: ctx.storySlug,
    chapter_number: ctx.chapterNumber,
    voice_key: voiceKey,
    admin_enqueued: true
  };

  await query(
    `
      INSERT INTO story_jobs (
        job_type, chapter_id, story_id, source_code, input_path, output_path,
        payload, priority, max_attempts
      )
      VALUES (
        'audio_chapter', $1, $2, $3, NULL, NULL, $4::jsonb, 60, 2
      )
      ON CONFLICT (job_type, chapter_id)
      DO UPDATE SET
        story_id = EXCLUDED.story_id,
        source_code = EXCLUDED.source_code,
        payload = story_jobs.payload || EXCLUDED.payload,
        status = CASE
          WHEN story_jobs.status = 'running' THEN 'running'
          ELSE 'pending'
        END,
        run_after = CASE
          WHEN story_jobs.status = 'running' THEN story_jobs.run_after
          ELSE now()
        END,
        updated_at = now()
    `,
    [ctx.chapterId, ctx.storyId, ctx.sourceCode, JSON.stringify(payload)]
  );

  return { ...ctx, outputHint: `story_audio/${ctx.storySlug}/${chapterStem}.wav` };
}

export async function getCharMapContent(storyId: string): Promise<{ content: string | null; updatedAt: string | null; updatedToChapter: number | null }> {
  const rows = await query<{
    char_map_content: string | null;
    char_map_updated_at: string | null;
    char_map_updated_to_chapter: number | null;
  }>(
    `
      SELECT
        metadata->>'char_map_content' AS char_map_content,
        metadata->>'char_map_updated_at' AS char_map_updated_at,
        (metadata->>'char_map_updated_to_chapter')::int AS char_map_updated_to_chapter
      FROM stories
      WHERE id = $1
      LIMIT 1
    `,
    [storyId]
  );

  return {
    content: rows[0]?.char_map_content ?? null,
    updatedAt: rows[0]?.char_map_updated_at ?? null,
    updatedToChapter: rows[0]?.char_map_updated_to_chapter ?? null
  };
}

export async function updateCharMapContent(storyId: string, content: string | null) {
  await query(
    `
      UPDATE stories
      SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'char_map_content', $2::text,
            'char_map_updated_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          ),
          updated_at = now()
      WHERE id = $1
    `,
    [storyId, content ?? ""]
  );
}

export async function listRecentFailedJobs(limit = 8): Promise<AdminJobRow[]> {
  const rows = await query<JobDbRow>(
    `
      SELECT
        j.id, j.job_type, j.status, j.story_id, j.chapter_id, j.source_code,
        j.attempts, j.max_attempts, j.priority, j.last_error,
        j.created_at, j.updated_at, j.run_after,
        s.title AS story_title,
        c.chapter_number, c.title AS chapter_title
      FROM story_jobs j
      LEFT JOIN stories s ON s.id = j.story_id
      LEFT JOIN chapters c ON c.id = j.chapter_id
      WHERE j.status = 'failed'
      ORDER BY j.updated_at DESC
      LIMIT $1
    `,
    [limit]
  );
  return rows.map(mapJob);
}

async function getChapterPolishedContent(chapterId: string): Promise<string | null> {
  const rows = await query<{ polished_text_content: string | null }>(
    `SELECT polished_text_content FROM chapters WHERE id = $1 LIMIT 1`,
    [chapterId]
  );
  return rows[0]?.polished_text_content ?? null;
}

async function forceResetChapterJob(chapterId: string, jobType: string) {
  await query(
    `
      UPDATE story_jobs
      SET status = 'pending', attempts = 0, run_after = now(),
          locked_by = NULL, locked_at = NULL, last_error = NULL, updated_at = now()
      WHERE chapter_id = $1 AND job_type = $2 AND status != 'running'
    `,
    [chapterId, jobType]
  );
}

export async function enqueueAudioSegmentsJob(
  storyId: string,
  chapterNumber: number,
  voiceKey = "preset_binh_an"
) {
  const ctx = await getEnqueueContext(storyId, chapterNumber);
  if (!ctx) throw new Error("Chapter not found");

  const polishedText = await getChapterPolishedContent(ctx.chapterId);
  if (!polishedText?.trim()) throw new Error("Chapter has no polished_text_content");

  const { splitChapterIntoSegments } = await import("@/lib/audio-segments");
  const segments = splitChapterIntoSegments(polishedText);
  if (!segments.length) throw new Error("No segments after split");

  const { createHash } = await import("node:crypto");
  const { withTransaction } = await import("@/lib/db");

  return withTransaction(async (client) => {
    const deleted = await client.query(
      `
        DELETE FROM chapter_audio_segments
        WHERE chapter_id = $1 AND voice_key = $2
          AND segment_index >= $3 AND status != 'running'
      `,
      [ctx.chapterId, voiceKey, segments.length]
    );
    const deletedCount = deleted.rowCount ?? 0;

    let inserted = 0;
    let reset = 0;
    let unchanged = 0;

    for (let idx = 0; idx < segments.length; idx += 1) {
      const text = segments[idx];
      const textHash = createHash("sha256").update(text).digest("hex").slice(0, 16);
      const row = await client.query<{ was_inserted: boolean; was_reset: boolean }>(
        `
          INSERT INTO chapter_audio_segments
            (chapter_id, story_id, segment_index, text_hash, text_content, voice_key, status)
          VALUES ($1, $2, $3, $4, $5, $6, 'pending')
          ON CONFLICT (chapter_id, voice_key, segment_index) DO UPDATE SET
            text_hash = EXCLUDED.text_hash,
            text_content = EXCLUDED.text_content,
            status = CASE
              WHEN chapter_audio_segments.text_hash != EXCLUDED.text_hash
                OR chapter_audio_segments.status = 'failed'
              THEN 'pending'
              ELSE chapter_audio_segments.status
            END,
            audio_path = CASE
              WHEN chapter_audio_segments.text_hash != EXCLUDED.text_hash THEN NULL
              ELSE chapter_audio_segments.audio_path
            END,
            duration_seconds = CASE
              WHEN chapter_audio_segments.text_hash != EXCLUDED.text_hash THEN NULL
              ELSE chapter_audio_segments.duration_seconds
            END,
            error = CASE
              WHEN chapter_audio_segments.text_hash != EXCLUDED.text_hash
                OR chapter_audio_segments.status = 'failed'
              THEN NULL
              ELSE chapter_audio_segments.error
            END,
            updated_at = now()
          RETURNING (xmax = 0) AS was_inserted, (xmax != 0 AND status = 'pending') AS was_reset
        `,
        [ctx.chapterId, ctx.storyId, idx, textHash, text, voiceKey]
      );
      const result = row.rows[0];
      if (result?.was_inserted) inserted += 1;
      else if (result?.was_reset) reset += 1;
      else unchanged += 1;
    }

    const hasPendingWork = inserted + reset + deletedCount > 0;
    const payload = JSON.stringify({ voice_key: voiceKey, segment_count: segments.length, admin_enqueued: true });

    const jobSql = hasPendingWork
      ? `
          INSERT INTO story_jobs (job_type, chapter_id, story_id, source_code, payload, max_attempts)
          VALUES ('audio_chapter_segments', $1, $2, $3, $4::jsonb, 3)
          ON CONFLICT (job_type, chapter_id) DO UPDATE SET
            story_id = COALESCE(EXCLUDED.story_id, story_jobs.story_id),
            source_code = COALESCE(EXCLUDED.source_code, story_jobs.source_code),
            payload = story_jobs.payload || EXCLUDED.payload,
            status = CASE WHEN story_jobs.status = 'running' THEN 'running' ELSE 'pending' END,
            run_after = CASE WHEN story_jobs.status = 'running' THEN story_jobs.run_after ELSE now() END,
            attempts = CASE WHEN story_jobs.status = 'running' THEN story_jobs.attempts ELSE 0 END,
            updated_at = now()
          RETURNING id, status
        `
      : `
          INSERT INTO story_jobs (job_type, chapter_id, story_id, source_code, payload, max_attempts)
          VALUES ('audio_chapter_segments', $1, $2, $3, $4::jsonb, 3)
          ON CONFLICT (job_type, chapter_id) DO UPDATE SET
            story_id = COALESCE(EXCLUDED.story_id, story_jobs.story_id),
            source_code = COALESCE(EXCLUDED.source_code, story_jobs.source_code),
            payload = story_jobs.payload || EXCLUDED.payload,
            updated_at = now()
          RETURNING id, status
        `;

    const jobRow = await client.query<{ id: string; status: string }>(jobSql, [
      ctx.chapterId,
      ctx.storyId,
      ctx.sourceCode,
      payload
    ]);

    return {
      ...ctx,
      segmentCount: segments.length,
      inserted,
      reset,
      unchanged,
      jobId: jobRow.rows[0]?.id,
      jobStatus: jobRow.rows[0]?.status
    };
  });
}

export type BulkEnqueueAction = "polish" | "audio" | "audio_segments";

export async function bulkEnqueueChapters(
  storyId: string,
  chapterNumbers: number[],
  action: BulkEnqueueAction,
  options: { force?: boolean; voiceKey?: string } = {}
) {
  const results: Array<{ chapterNumber: number; ok: boolean; error?: string }> = [];

  for (const chapterNumber of chapterNumbers) {
    try {
      if (action === "polish") {
        const ctx = await enqueuePolishJob(storyId, chapterNumber);
        if (options.force) await forceResetChapterJob(ctx.chapterId, "polish_chapter");
      } else if (action === "audio") {
        const ctx = await enqueueAudioJob(storyId, chapterNumber, options.voiceKey);
        if (options.force) await forceResetChapterJob(ctx.chapterId, "audio_chapter");
      } else {
        const result = await enqueueAudioSegmentsJob(storyId, chapterNumber, options.voiceKey);
        if (options.force) await forceResetChapterJob(result.chapterId, "audio_chapter_segments");
      }
      results.push({ chapterNumber, ok: true });
    } catch (error) {
      results.push({
        chapterNumber,
        ok: false,
        error: error instanceof Error ? error.message : "Enqueue failed"
      });
    }
  }

  return results;
}
