const REPO_ROOT = process.env.STORY_PIPELINE_ROOT ?? "..";

export type QualityCliAction = "audit" | "audit_fast" | "repair" | "audit_chapter";

export type QualityCliOptions = {
  fromChapter?: number;
  toChapter?: number;
  onlyNeedingAudit?: boolean;
  noJudge?: boolean;
};

/** QA audit/repair uses Ollama judge — expensive; admin only on explicit user action (not background). */
export function isQualityScanSpawnAllowed() {
  if (process.env.STORY_PIPELINE_DISABLE_QA_SPAWN === "1") return false;
  if (process.env.STORY_PIPELINE_DOCKER === "1") return false;
  return true;
}

export function qualityScanBlockedMessage() {
  return "Quét QA tốn GPU/Ollama — chạy lệnh CLI trên máy host khi bạn chủ động rà soát (Docker admin không spawn).";
}

export function hasExplicitQaScope(input: {
  chapterNumbers?: number[];
  fromChapter?: number;
  toChapter?: number;
  fullStoryScan?: boolean;
}) {
  if (input.fullStoryScan) return true;
  if (input.chapterNumbers?.length) return true;
  if (input.fromChapter && input.fromChapter > 0) return true;
  if (input.toChapter && input.toChapter > 0) return true;
  return false;
}

function pythonBin() {
  return process.env.STORY_PIPELINE_PYTHON ?? "viterbox/venv/bin/python";
}

export function buildQualityScanCliCommand(
  storyId: string,
  action: QualityCliAction,
  options: QualityCliOptions = {}
) {
  const cliAction = action === "audit_fast" ? "audit" : action === "audit_chapter" ? "audit" : action;
  const parts = [
    `cd ${REPO_ROOT}`,
    `${pythonBin()} scripts/story_pipeline/admin_pipeline_cli.py`,
    cliAction,
    "--story-id",
    storyId
  ];

  if (options.fromChapter) parts.push("--from-chapter", String(options.fromChapter));
  if (options.toChapter) parts.push("--to-chapter", String(options.toChapter));
  if (options.onlyNeedingAudit) parts.push("--only-needing-audit");
  if (action === "audit_fast" || options.noJudge) parts.push("--judge-sample", "0");
  if (action === "audit_chapter" && !options.noJudge) parts.push("--judge-sample", "1");

  return parts.join(" ");
}

export function qualityScanCliExamples(storyId: string) {
  return {
    audit: buildQualityScanCliCommand(storyId, "audit", { onlyNeedingAudit: true }),
    auditFast: buildQualityScanCliCommand(storyId, "audit_fast", { onlyNeedingAudit: true }),
    repair: buildQualityScanCliCommand(storyId, "repair", { onlyNeedingAudit: true })
  };
}
