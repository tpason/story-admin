import { spawn } from "node:child_process";
import path from "node:path";
import type { AdminUser } from "@/lib/auth";
import {
  appendPipelineRunLog,
  createPipelineRun,
  finishPipelineRun,
  type PipelineRunRow
} from "@/lib/admin-pipeline-runs";
import { buildPipelineCommand } from "@/lib/pipeline-runner";

const REPO_ROOT = path.resolve(process.env.STORY_PIPELINE_ROOT ?? path.join(process.cwd(), ".."));

export type AsyncPipelineAction = "discover" | "crawl_stories" | "crawl_story" | "translate_metadata";

export type StartPipelineRunInput = {
  action: AsyncPipelineAction | string;
  storyId?: string | null;
  args?: Record<string, unknown>;
};

function commandLabel(command: string, args: string[]) {
  return [command, ...args].join(" ");
}

export async function startAsyncPipelineRun(
  admin: AdminUser,
  input: StartPipelineRunInput
): Promise<PipelineRunRow> {
  const { command, args, cliArgs } = buildPipelineCommand(input.action, input.args ?? {}, {
    includeJson: false
  });

  const run = await createPipelineRun(admin, {
    action: input.action,
    storyId: input.storyId,
    args: { ...input.args, cliArgs },
    command: commandLabel(command, args)
  });

  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    env: process.env
  });

  let stdout = "";
  let stderr = "";
  let lastFlush = Date.now();

  const flush = () => {
    lastFlush = Date.now();
    void appendPipelineRunLog(run.id, { stdout, stderr, status: "running" });
  };

  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
    if (Date.now() - lastFlush > 2000) flush();
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
    if (Date.now() - lastFlush > 2000) flush();
  });

  child.on("close", (code) => {
    const exitCode = code ?? 1;
    const ok = exitCode === 0;
    void finishPipelineRun(run.id, {
      status: ok ? "done" : "failed",
      exitCode,
      stdout,
      stderr,
      summary: ok ? `${input.action} hoàn tất` : `${input.action} thất bại (exit ${exitCode})`
    });
  });

  child.on("error", (error) => {
    stderr += `\n[spawn error] ${error.message}`;
    void finishPipelineRun(run.id, {
      status: "failed",
      exitCode: 1,
      stdout,
      stderr,
      summary: error.message
    });
  });

  return run;
}

export const ASYNC_PIPELINE_ACTIONS = new Set<string>([
  "discover",
  "crawl_stories",
  "crawl_story",
  "translate_metadata"
]);

export function isAsyncPipelineAction(action: string) {
  return ASYNC_PIPELINE_ACTIONS.has(action);
}
