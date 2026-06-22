import { query } from "@/lib/db";
import type { AdminUser } from "@/lib/auth";
import type { Paginated } from "@/lib/types";

export type PipelineRunStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export type PipelineRunRow = {
  id: string;
  adminUsername: string;
  action: string;
  storyId: string | null;
  status: PipelineRunStatus;
  args: Record<string, unknown>;
  command: string | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  summary: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

type PipelineRunDbRow = {
  id: string;
  admin_username: string;
  action: string;
  story_id: string | null;
  status: PipelineRunStatus;
  args: Record<string, unknown> | null;
  command: string | null;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  summary: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
};

const MAX_LOG_CHARS = 500_000;

function mapRun(row: PipelineRunDbRow): PipelineRunRow {
  return {
    id: row.id,
    adminUsername: row.admin_username,
    action: row.action,
    storyId: row.story_id,
    status: row.status,
    args: row.args ?? {},
    command: row.command,
    stdout: row.stdout,
    stderr: row.stderr,
    exitCode: row.exit_code,
    summary: row.summary,
    startedAt: row.started_at?.toISOString() ?? null,
    finishedAt: row.finished_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString()
  };
}

function trimLog(text: string) {
  if (text.length <= MAX_LOG_CHARS) return text;
  return text.slice(-MAX_LOG_CHARS);
}

export async function createPipelineRun(
  admin: AdminUser,
  input: {
    action: string;
    storyId?: string | null;
    args?: Record<string, unknown>;
    command?: string;
  }
): Promise<PipelineRunRow> {
  const rows = await query<PipelineRunDbRow>(
    `
      INSERT INTO admin_pipeline_runs (
        admin_user_id, admin_username, action, story_id, status, args, command, started_at
      )
      VALUES ($1, $2, $3, $4, 'running', $5::jsonb, $6, now())
      RETURNING *
    `,
    [
      admin.id,
      admin.username,
      input.action,
      input.storyId ?? null,
      JSON.stringify(input.args ?? {}),
      input.command ?? null
    ]
  );
  return mapRun(rows[0]);
}

export async function appendPipelineRunLog(
  runId: string,
  patch: { stdout?: string; stderr?: string; status?: PipelineRunStatus }
) {
  const sets: string[] = [];
  const values: unknown[] = [runId];
  let param = 2;

  if (patch.stdout !== undefined) {
    sets.push(`stdout = $${param++}`);
    values.push(trimLog(patch.stdout));
  }
  if (patch.stderr !== undefined) {
    sets.push(`stderr = $${param++}`);
    values.push(trimLog(patch.stderr));
  }
  if (patch.status) {
    sets.push(`status = $${param++}`);
    values.push(patch.status);
  }

  if (!sets.length) return;

  await query(`UPDATE admin_pipeline_runs SET ${sets.join(", ")} WHERE id = $1`, values);
}

export async function finishPipelineRun(
  runId: string,
  input: {
    status: PipelineRunStatus;
    exitCode: number;
    stdout: string;
    stderr: string;
    summary?: string;
  }
) {
  await query(
    `
      UPDATE admin_pipeline_runs
      SET status = $2,
          exit_code = $3,
          stdout = $4,
          stderr = $5,
          summary = $6,
          finished_at = now()
      WHERE id = $1
    `,
    [
      runId,
      input.status,
      input.exitCode,
      trimLog(input.stdout),
      trimLog(input.stderr),
      input.summary ?? null
    ]
  );
}

export async function getPipelineRun(runId: string): Promise<PipelineRunRow | null> {
  const rows = await query<PipelineRunDbRow>(`SELECT * FROM admin_pipeline_runs WHERE id = $1 LIMIT 1`, [runId]);
  return rows[0] ? mapRun(rows[0]) : null;
}

export async function listPipelineRuns(options: {
  page?: number;
  pageSize?: number;
  status?: string;
  action?: string;
  storyId?: string;
} = {}): Promise<Paginated<PipelineRunRow>> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const where = ["TRUE"];
  const values: unknown[] = [];

  if (options.status) {
    values.push(options.status);
    where.push(`status = $${values.length}`);
  }
  if (options.action) {
    values.push(options.action);
    where.push(`action = $${values.length}`);
  }
  if (options.storyId) {
    values.push(options.storyId);
    where.push(`story_id = $${values.length}`);
  }

  const whereSql = where.join(" AND ");
  const countRows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM admin_pipeline_runs WHERE ${whereSql}`,
    values
  );

  values.push(pageSize, offset);
  const rows = await query<PipelineRunDbRow>(
    `
      SELECT * FROM admin_pipeline_runs
      WHERE ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );

  const total = Number(countRows[0]?.count ?? 0);
  return {
    items: rows.map(mapRun),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

export async function countRunningPipelineRuns(): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM admin_pipeline_runs WHERE status = 'running'`
  );
  return Number(rows[0]?.count ?? 0);
}

export async function getPipelineRunStats(): Promise<{
  runningRuns: number;
  failedRuns24h: number;
  totalRuns: number;
}> {
  const rows = await query<{
    running_runs: string;
    failed_runs_24h: string;
    total_runs: string;
  }>(`
    SELECT
      (SELECT COUNT(*)::text FROM admin_pipeline_runs WHERE status = 'running') AS running_runs,
      (SELECT COUNT(*)::text FROM admin_pipeline_runs
        WHERE status = 'failed' AND created_at > now() - interval '24 hours') AS failed_runs_24h,
      (SELECT COUNT(*)::text FROM admin_pipeline_runs) AS total_runs
  `);
  const row = rows[0];
  return {
    runningRuns: Number(row?.running_runs ?? 0),
    failedRuns24h: Number(row?.failed_runs_24h ?? 0),
    totalRuns: Number(row?.total_runs ?? 0)
  };
}

export async function listRecentPipelineRuns(limit = 5): Promise<PipelineRunRow[]> {
  const rows = await query<PipelineRunDbRow>(
    `
      SELECT * FROM admin_pipeline_runs
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [Math.min(20, Math.max(1, limit))]
  );
  return rows.map(mapRun);
}
