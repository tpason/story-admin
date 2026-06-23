import { query } from "@/lib/db";
import { chapterNumbersArg, runPipelineCli } from "@/lib/pipeline-runner";

export type PipelineChapterAction = "repolish" | "retranslate";

export type PipelineStoryAction = "recrawl" | "recrawl_chapters" | "translate_metadata";

export type PipelineQualityAction = "audit" | "repair";

export async function resolveChapterNumbers(
  storyId: string,
  options: {
    chapterNumbers?: number[];
    fromChapter?: number;
    toChapter?: number;
  }
): Promise<number[]> {
  if (options.chapterNumbers?.length) {
    return Array.from(new Set(options.chapterNumbers.filter((n) => Number.isFinite(n) && n > 0))).sort(
      (a, b) => a - b
    );
  }

  const conditions = ["c.story_id = $1"];
  const values: unknown[] = [storyId];
  let param = 2;

  if (options.fromChapter && options.fromChapter > 0) {
    conditions.push(`c.chapter_number >= $${param++}`);
    values.push(options.fromChapter);
  }
  if (options.toChapter && options.toChapter > 0) {
    conditions.push(`c.chapter_number <= $${param++}`);
    values.push(options.toChapter);
  }

  const rows = await query<{ chapter_number: number }>(
    `
      SELECT c.chapter_number
      FROM chapters c
      WHERE ${conditions.join(" AND ")}
      ORDER BY c.chapter_number
    `,
    values
  );

  return rows.map((row) => row.chapter_number);
}

function cliError(result: Awaited<ReturnType<typeof runPipelineCli>>) {
  const fromPayload = result.payload?.error;
  if (typeof fromPayload === "string" && fromPayload) return fromPayload;
  return result.stderr.trim() || "Pipeline script failed";
}

function buildChapterCliArgs(
  storyId: string,
  action: PipelineChapterAction,
  chapterNumbers: number[],
  options: {
    fromChapter?: number;
    toChapter?: number;
    qualityOnly?: boolean;
    forceRunning?: boolean;
  }
) {
  const args = [action, "--story-id", storyId];
  if (chapterNumbers.length) args.push("--chapter-numbers", chapterNumbersArg(chapterNumbers));
  if (options.fromChapter) args.push("--from-chapter", String(options.fromChapter));
  if (options.toChapter) args.push("--to-chapter", String(options.toChapter));
  if (options.qualityOnly) args.push("--quality-only");
  if (options.forceRunning) args.push("--force-running");
  return args;
}

export async function repolishChapter(
  storyId: string,
  chapterNumber: number,
  options: { forceRunning?: boolean } = {}
) {
  return bulkPipelineChapters(storyId, [chapterNumber], "repolish", options);
}

export async function retranslateChapter(
  storyId: string,
  chapterNumber: number,
  options: { forceRunning?: boolean } = {}
) {
  return bulkPipelineChapters(storyId, [chapterNumber], "retranslate", options);
}

export async function bulkPipelineChapters(
  storyId: string,
  chapterNumbers: number[],
  action: PipelineChapterAction,
  options: { forceRunning?: boolean; qualityOnly?: boolean; fromChapter?: number; toChapter?: number } = {}
) {
  const result = await runPipelineCli(
    buildChapterCliArgs(storyId, action, chapterNumbers, {
      fromChapter: options.fromChapter,
      toChapter: options.toChapter,
      qualityOnly: options.qualityOnly,
      forceRunning: options.forceRunning
    })
  );
  if (!result.ok) throw new Error(cliError(result));

  const payload = result.payload ?? {};
  if (payload.quality_only) {
    return {
      results: [],
      count: payload.exit_code === 0 ? 1 : 0,
      payload
    };
  }

  const numbers = Array.isArray(payload.chapter_numbers)
    ? (payload.chapter_numbers as number[])
    : chapterNumbers;
  const count = typeof payload.count === "number" ? payload.count : numbers.length;

  return {
    results: numbers.map((chapterNumber) => ({ chapterNumber, ok: true })),
    count,
    payload
  };
}

export async function requestStoryRecrawl(storyId: string) {
  const result = await runPipelineCli(["recrawl-story", "--story-id", storyId]);
  if (!result.ok) throw new Error(cliError(result));
  const story = result.payload?.story as { id: string; title: string } | undefined;
  if (!story) throw new Error("Story not found");
  return story;
}

export async function requestChapterRecrawl(
  storyId: string,
  options: {
    fromChapter?: number;
    toChapter?: number;
    chapterNumbers?: number[];
    clearRaw?: boolean;
  }
) {
  const args = ["recrawl-chapters", "--story-id", storyId];
  if (options.chapterNumbers?.length) args.push("--chapter-numbers", chapterNumbersArg(options.chapterNumbers));
  if (options.fromChapter) args.push("--from-chapter", String(options.fromChapter));
  if (options.toChapter) args.push("--to-chapter", String(options.toChapter));
  if (options.clearRaw) args.push("--clear-raw");

  const result = await runPipelineCli(args);
  if (!result.ok) throw new Error(cliError(result));
  return {
    updated: Number(result.payload?.updated ?? 0),
    chapterNumbers: options.chapterNumbers ?? []
  };
}

export async function runStoryMetadataTranslate(
  storyId: string,
  options: {
    skipStory?: boolean;
    skipChapterTitles?: boolean;
    fromChapter?: number;
    toChapter?: number;
    chapterNumbers?: number[];
  } = {}
) {
  const args = ["translate-metadata", "--story-id", storyId, "--apply"];
  if (options.skipStory) args.push("--skip-story");
  if (options.skipChapterTitles) args.push("--skip-chapters");
  if (options.fromChapter) args.push("--from-chapter", String(options.fromChapter));
  if (options.toChapter) args.push("--to-chapter", String(options.toChapter));
  if (process.env.OLLAMA_URL) args.push("--ollama-url", process.env.OLLAMA_URL);
  if (process.env.OLLAMA_MODEL) args.push("--translate-model", process.env.OLLAMA_MODEL);

  const result = await runPipelineCli(args);
  if (!result.ok) throw new Error(cliError(result));
  return { stdout: result.stdout, stderr: result.stderr };
}

type QualityScanOptions = {
  fromChapter?: number;
  toChapter?: number;
  chapterNumbers?: number[];
  onlyNeedingAudit?: boolean;
  judgeSample?: number;
  repair?: boolean;
  noJudge?: boolean;
  limit?: number;
};

function buildQualityCliArgs(storyId: string, command: "audit" | "repair", options: QualityScanOptions) {
  const args = [command, "--story-id", storyId];
  if (options.chapterNumbers?.length) {
    args.push("--chapter-numbers", chapterNumbersArg(options.chapterNumbers));
  } else {
    if (options.fromChapter) args.push("--from-chapter", String(options.fromChapter));
    if (options.toChapter) args.push("--to-chapter", String(options.toChapter));
  }
  if (options.onlyNeedingAudit) args.push("--only-needing-audit");
  if (options.limit) args.push("--limit", String(options.limit));
  if (process.env.OLLAMA_URL) args.push("--ollama-url", process.env.OLLAMA_URL);
  if (process.env.OLLAMA_MODEL) args.push("--judge-model", process.env.OLLAMA_MODEL);
  return args;
}

export { buildQualityCliArgs };

export async function runQualityAudit(storyId: string, options: QualityScanOptions = {}) {
  const args = buildQualityCliArgs(storyId, "audit", options);
  if (options.repair) args.push("--repair");
  if (options.judgeSample !== undefined) args.push("--judge-sample", String(options.judgeSample));
  else args.push("--judge-sample", "5");

  const result = await runPipelineCli(args);
  if (!result.ok) throw new Error(cliError(result));
  return result.payload ?? {};
}

export async function runQualityRepair(storyId: string, options: QualityScanOptions = {}) {
  const args = buildQualityCliArgs(storyId, "repair", options);
  if (options.noJudge) args.push("--no-judge");
  if (options.judgeSample !== undefined) args.push("--judge-sample", String(options.judgeSample));

  const result = await runPipelineCli(args);
  if (!result.ok) throw new Error(cliError(result));
  return result.payload ?? {};
}

export async function runSmartRepair(
  storyId: string,
  chapterNumbers: number[],
  options: { forceRunning?: boolean; forceAction?: "repolish" | "retranslate" } = {}
) {
  const args = ["smart-repair", "--story-id", storyId];
  if (chapterNumbers.length) args.push("--chapter-numbers", chapterNumbersArg(chapterNumbers));
  if (options.forceRunning) args.push("--force-running");
  if (options.forceAction) args.push("--action", options.forceAction);

  const result = await runPipelineCli(args);
  if (!result.ok) throw new Error(cliError(result));
  const payload = result.payload ?? {};
  const results = Array.isArray(payload.results) ? payload.results : [];
  return {
    count: typeof payload.count === "number" ? payload.count : 0,
    total: typeof payload.total === "number" ? payload.total : results.length,
    results: results as Array<Record<string, unknown>>,
    payload
  };
}
