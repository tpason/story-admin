import { Pool, type QueryResultRow } from "pg";

const DEFAULT_DATABASE_URL = "postgresql://betterbox:betterbox@127.0.0.1:54329/betterbox_story";

declare global {
  // eslint-disable-next-line no-var
  var storyAdminPool: Pool | undefined;
}

export const pool =
  globalThis.storyAdminPool ??
  new Pool({
    connectionString: process.env.STORY_DATABASE_URL ?? DEFAULT_DATABASE_URL,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.storyAdminPool = pool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
  const result = await pool.query<T>(text, values);
  return result.rows;
}

export async function withTransaction<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
