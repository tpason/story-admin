import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(process.env.STORY_PIPELINE_ROOT ?? path.join(process.cwd(), ".."));
const CLI_SCRIPT = "scripts/story_pipeline/admin_pipeline_cli.py";

export type PipelineCliResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  payload?: Record<string, unknown>;
};

function defaultPythonPath() {
  return process.env.STORY_PIPELINE_PYTHON ?? path.join(REPO_ROOT, "viterbox/venv/bin/python");
}

function dockerExecArgs(cliArgs: string[]) {
  const service = process.env.STORY_PIPELINE_DOCKER_SERVICE ?? "story-pipeline-cli";
  const useRun = process.env.STORY_PIPELINE_DOCKER_MODE !== "exec";
  if (useRun) {
    return {
      command: "docker",
      args: ["compose", "run", "--rm", "--no-deps", service, ...cliArgs]
    };
  }
  return {
    command: "docker",
    args: ["compose", "exec", "-T", service, "python", `/app/${CLI_SCRIPT}`, ...cliArgs]
  };
}

function resolveExec(cliArgs: string[]) {
  if (process.env.STORY_PIPELINE_DOCKER === "1") {
    return dockerExecArgs(cliArgs);
  }
  return {
    command: defaultPythonPath(),
    args: [path.join(REPO_ROOT, CLI_SCRIPT), ...cliArgs]
  };
}

function pushFlag(args: string[], flag: string, value: string | number | boolean | undefined | null) {
  if (value === undefined || value === null || value === "") return;
  if (typeof value === "boolean") {
    if (value) args.push(flag);
    return;
  }
  args.push(flag, String(value));
}

function numParam(params: Record<string, unknown>, key: string, fallback: number) {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function strParam(params: Record<string, unknown>, key: string) {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function buildPipelineCommand(
  action: string,
  params: Record<string, unknown>,
  options: { includeJson?: boolean } = {}
): { command: string; args: string[]; cliArgs: string[] } {
  const cliArgs: string[] = [action.replace(/_/g, "-")];

  switch (action) {
    case "discover":
      pushFlag(cliArgs, "--pages", numParam(params, "pages", 2));
      pushFlag(cliArgs, "--min-chapters", numParam(params, "minChapters", 30));
      pushFlag(cliArgs, "--timeout", numParam(params, "timeout", 30));
      if (Array.isArray(params.sources) && params.sources.length) {
        cliArgs.push("--sources", ...params.sources.map(String));
      }
      break;

    case "crawl_stories":
    case "crawl_story":
      if (action === "crawl_story") pushFlag(cliArgs, "--story-id", strParam(params, "storyId") ?? String(params.storyId ?? ""));
      pushFlag(cliArgs, "--workers", numParam(params, "workers", 2));
      pushFlag(cliArgs, "--limit-stories", numParam(params, "limitStories", 0));
      pushFlag(cliArgs, "--max-chapters", numParam(params, "maxChapters", 0));
      pushFlag(cliArgs, "--min-catalog-check-hours", numParam(params, "minCatalogCheckHours", 0));
      pushFlag(cliArgs, "--claim-finished-cooldown-minutes", numParam(params, "claimFinishedCooldownMinutes", 0));
      pushFlag(cliArgs, "--timeout", numParam(params, "timeout", 30));
      pushFlag(cliArgs, "--retries", numParam(params, "retries", 5));
      pushFlag(cliArgs, "--retry-sleep", numParam(params, "retrySleep", 2));
      pushFlag(cliArgs, "--chapter-delay", numParam(params, "chapterDelay", 1.5));
      pushFlag(cliArgs, "--chapter-workers", numParam(params, "chapterWorkers", 2));
      pushFlag(cliArgs, "--max-consecutive-content-misses", numParam(params, "maxConsecutiveContentMisses", 1));
      pushFlag(cliArgs, "--post-translate", strParam(params, "postTranslate") ?? "polish");
      pushFlag(cliArgs, "--title-contains", strParam(params, "titleContains"));
      if (params.onlyIncomplete !== false) cliArgs.push("--only-incomplete");
      if (Array.isArray(params.sources) && params.sources.length) {
        cliArgs.push("--sources", ...params.sources.map(String));
      }
      break;

    case "translate_metadata":
      pushFlag(cliArgs, "--story-id", strParam(params, "storyId") ?? String(params.storyId ?? ""));
      pushFlag(cliArgs, "--from-chapter", numParam(params, "fromChapter", 0) || undefined);
      pushFlag(cliArgs, "--to-chapter", numParam(params, "toChapter", 0) || undefined);
      if (params.skipStory) cliArgs.push("--skip-story");
      if (params.skipChapterTitles) cliArgs.push("--skip-chapters");
      cliArgs.push("--apply");
      pushFlag(cliArgs, "--ollama-url", strParam(params, "ollamaUrl") ?? process.env.OLLAMA_URL);
      pushFlag(cliArgs, "--translate-model", strParam(params, "translateModel") ?? process.env.OLLAMA_MODEL);
      break;

    default:
      break;
  }

  if (options.includeJson !== false) cliArgs.push("--json");

  return { ...resolveExec(cliArgs), cliArgs };
}

export async function runPipelineCli(args: string[]): Promise<PipelineCliResult> {
  const cliArgs = [...args, "--json"];
  const { command, args: execArgs } = resolveExec(cliArgs);

  try {
    const { stdout, stderr } = await execFileAsync(command, execArgs, {
      cwd: REPO_ROOT,
      maxBuffer: 10 * 1024 * 1024,
      timeout: Number(process.env.STORY_PIPELINE_TIMEOUT_MS ?? 600_000)
    });
    const trimmed = stdout.trim();
    let payload: Record<string, unknown> | undefined;
    if (trimmed) {
      try {
        payload = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        payload = { raw: trimmed };
      }
    }
    return { ok: true, exitCode: 0, stdout, stderr, payload };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number;
    };
    const stdout = err.stdout ?? "";
    const stderr = err.stderr ?? (err.message ?? "Pipeline CLI failed");
    let payload: Record<string, unknown> | undefined;
    const trimmed = stdout.trim();
    if (trimmed) {
      try {
        payload = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        payload = undefined;
      }
    }
    return {
      ok: false,
      exitCode: typeof err.code === "number" ? err.code : 1,
      stdout,
      stderr,
      payload
    };
  }
}

export function chapterNumbersArg(numbers: number[]) {
  return numbers.join(",");
}
