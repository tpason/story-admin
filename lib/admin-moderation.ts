import { query } from "@/lib/db";
import type { Paginated } from "@/lib/types";

export type CommentReportRow = {
  id: string;
  commentId: string;
  reporterId: string;
  reporterUsername: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  commentText: string;
  commentUserId: string;
  commentUsername: string;
  chapterId: string;
  chapterNumber: number;
  storyId: string;
  storyTitle: string;
  reportCount: number;
};

type ReportDbRow = {
  id: string;
  comment_id: string;
  reporter_id: string;
  reporter_username: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: Date;
  comment_text: string;
  comment_user_id: string;
  comment_username: string;
  chapter_id: string;
  chapter_number: number;
  story_id: string;
  story_title: string;
  report_count: string;
};

function mapReport(row: ReportDbRow): CommentReportRow {
  return {
    id: row.id,
    commentId: row.comment_id,
    reporterId: row.reporter_id,
    reporterUsername: row.reporter_username,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    commentText: row.comment_text,
    commentUserId: row.comment_user_id,
    commentUsername: row.comment_username,
    chapterId: row.chapter_id,
    chapterNumber: row.chapter_number,
    storyId: row.story_id,
    storyTitle: row.story_title,
    reportCount: Number(row.report_count) || 1
  };
}

export async function listPendingCommentReports(options: { page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const countRows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM comment_reports WHERE status = 'pending'`
  );
  const total = Number(countRows[0]?.count ?? 0);

  const rows = await query<ReportDbRow>(
    `
      SELECT
        r.id,
        r.comment_id,
        r.reporter_id,
        ru.username AS reporter_username,
        r.reason,
        r.details,
        r.status,
        r.created_at,
        c.content_text AS comment_text,
        c.user_id AS comment_user_id,
        cu.username AS comment_username,
        c.chapter_id,
        ch.chapter_number,
        c.story_id,
        COALESCE(NULLIF(s.display_title, ''), s.title) AS story_title,
        (
          SELECT COUNT(*)::text
          FROM comment_reports cr
          WHERE cr.comment_id = r.comment_id
            AND cr.status = 'pending'
        ) AS report_count
      FROM comment_reports r
      JOIN chapter_comments c ON c.id = r.comment_id
      JOIN reader_users ru ON ru.id = r.reporter_id
      JOIN reader_users cu ON cu.id = c.user_id
      JOIN chapters ch ON ch.id = c.chapter_id
      JOIN stories s ON s.id = c.story_id
      WHERE r.status = 'pending'
      ORDER BY report_count DESC, r.created_at ASC
      LIMIT $1 OFFSET $2
    `,
    [pageSize, offset]
  );

  return {
    items: rows.map(mapReport),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  } satisfies Paginated<CommentReportRow>;
}

export async function reviewCommentReport(
  reportId: string,
  action: "dismiss" | "delete_comment" | "ban_user",
  admin: { id: string; username: string },
  options: { banDays?: number; permanent?: boolean; note?: string } = {}
) {
  const reportRows = await query<{
    id: string;
    comment_id: string;
    comment_user_id: string;
    deleted_at: Date | null;
  }>(
    `
      SELECT r.id, r.comment_id, c.user_id AS comment_user_id, c.deleted_at
      FROM comment_reports r
      JOIN chapter_comments c ON c.id = r.comment_id
      WHERE r.id = $1
      LIMIT 1
    `,
    [reportId]
  );
  const report = reportRows[0];
  if (!report) return null;

  if (action === "delete_comment" && !report.deleted_at) {
    await query(
      `
        UPDATE chapter_comments
        SET deleted_at = now(), updated_at = now()
        WHERE id = $1
      `,
      [report.comment_id]
    );
  }

  if (action === "ban_user") {
    if (options.permanent) {
      await query(
        `
          UPDATE reader_users
          SET comment_banned_permanent = TRUE,
              comment_banned_until = NULL,
              updated_at = now()
          WHERE id = $1
        `,
        [report.comment_user_id]
      );
    } else {
      const days = Math.max(1, Math.min(365, options.banDays ?? 7));
      await query(
        `
          UPDATE reader_users
          SET comment_banned_until = GREATEST(COALESCE(comment_banned_until, now()), now()) + ($2::text || ' days')::interval,
              updated_at = now()
          WHERE id = $1
        `,
        [report.comment_user_id, String(days)]
      );
    }
  }

  const nextStatus = action === "dismiss" ? "dismissed" : "actioned";
  await query(
    `
      UPDATE comment_reports
      SET status = $2,
          reviewed_by = $3,
          reviewed_at = now(),
          admin_note = NULLIF($4, '')
      WHERE comment_id = $1
        AND status = 'pending'
    `,
    [report.comment_id, nextStatus, admin.id, options.note ?? ""]
  );

  return report;
}

export async function updateUserCommentBan(
  userId: string,
  input: { banned?: boolean; permanent?: boolean; banDays?: number }
) {
  if (input.banned === false) {
    const rows = await query<{ id: string }>(
      `
        UPDATE reader_users
        SET comment_banned_permanent = FALSE,
            comment_banned_until = NULL,
            updated_at = now()
        WHERE id = $1
        RETURNING id
      `,
      [userId]
    );
    return Boolean(rows[0]);
  }

  if (input.permanent) {
    const rows = await query<{ id: string }>(
      `
        UPDATE reader_users
        SET comment_banned_permanent = TRUE,
            comment_banned_until = NULL,
            updated_at = now()
        WHERE id = $1
        RETURNING id
      `,
      [userId]
    );
    return Boolean(rows[0]);
  }

  const days = Math.max(1, Math.min(365, input.banDays ?? 7));
  const rows = await query<{ id: string }>(
    `
      UPDATE reader_users
      SET comment_banned_until = now() + ($2::text || ' days')::interval,
          comment_banned_permanent = FALSE,
          updated_at = now()
      WHERE id = $1
      RETURNING id
    `,
    [userId, String(days)]
  );
  return Boolean(rows[0]);
}
