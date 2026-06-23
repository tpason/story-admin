const PYTHON = process.env.STORY_PIPELINE_PYTHON ?? "viterbox/venv/bin/python";

export function buildExtractCharMapCli(
  storyId: string,
  options: { storyTitle?: string; fromChapter?: number; toChapter?: number } = {}
) {
  const parts = [`${PYTHON} scripts/story_pipeline/extract_char_map.py`];
  if (options.storyTitle?.trim()) {
    parts.push(`--story-title "${options.storyTitle.trim().replace(/"/g, "")}"`);
  } else {
    parts.push(`--story-id ${storyId}`);
  }
  parts.push("--append-only");
  if (options.fromChapter && options.fromChapter > 0) {
    parts.push(`--from-chapter ${options.fromChapter}`);
  }
  if (options.toChapter && options.toChapter > 0) {
    parts.push(`--to-chapter ${options.toChapter}`);
  }
  return parts.join(" ");
}
