import { query } from "@/lib/db";
import type { AdminUser } from "@/lib/auth";
import type { Paginated } from "@/lib/types";

export type ActivityLogRow = {
  id: string;
  adminUsername: string;
  action: string;
  entityType: string;
  entityId: string | null;
  storyId: string | null;
  chapterNumber: number | null;
  summary: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

type ActivityDbRow = {
  id: string;
  admin_username: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  story_id: string | null;
  chapter_number: number | null;
  summary: string | null;
  details: Record<string, unknown> | null;
  created_at: Date;
};

function mapActivity(row: ActivityDbRow): ActivityLogRow {
  return {
    id: row.id,
    adminUsername: row.admin_username,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    storyId: row.story_id,
    chapterNumber: row.chapter_number,
    summary: row.summary,
    details: row.details ?? {},
    createdAt: row.created_at.toISOString()
  };
}

export async function logAdminAction(
  admin: AdminUser,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    storyId?: string | null;
    chapterNumber?: number | null;
    summary?: string | null;
    details?: Record<string, unknown>;
  }
) {
  try {
    await query(
      `
        INSERT INTO admin_activity_log (
          admin_user_id, admin_username, action, entity_type, entity_id,
          story_id, chapter_number, summary, details
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      `,
      [
        admin.id,
        admin.username,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.storyId ?? null,
        entry.chapterNumber ?? null,
        entry.summary ?? null,
        JSON.stringify(entry.details ?? {})
      ]
    );
  } catch {
    // ponytail: audit must not block admin edits if table missing
  }
}

export async function listAdminActivity(options: {
  page?: number;
  pageSize?: number;
  storyId?: string;
} = {}): Promise<Paginated<ActivityLogRow>> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 40));
  const offset = (page - 1) * pageSize;
  const where = ["TRUE"];
  const values: unknown[] = [];

  if (options.storyId) {
    values.push(options.storyId);
    where.push(`story_id = $${values.length}`);
  }

  const whereSql = where.join(" AND ");
  const countRows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM admin_activity_log WHERE ${whereSql}`,
    values
  );

  values.push(pageSize, offset);
  const rows = await query<ActivityDbRow>(
    `
      SELECT id, admin_username, action, entity_type, entity_id, story_id,
             chapter_number, summary, details, created_at
      FROM admin_activity_log
      WHERE ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );

  const total = Number(countRows[0]?.count ?? 0);
  return {
    items: rows.map(mapActivity),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}
