/** Mirror of scripts/story_pipeline/quality_remediation.py — keep routing in sync. */

const REPOLISH_PREFIXES = [
  "repeated_content",
  "wrong_pronoun",
  "forbidden_term",
  "structure_drift",
  "judge:unnatural",
  "judge:word_for_word",
  "register drift",
  "dialogue register",
  "format drift"
] as const;

const RETRANSLATE_PREFIXES = [
  "term_alignment:",
  "cjk_not_translated",
  "large_en_block",
  "not_vietnamese",
  "length_ratio_low",
  "truncated_output",
  "output_too_short",
  "no_polished_text",
  "judge:mistranslation",
  "judge:omission",
  "untranslated_slang"
] as const;

export const MAX_QUALITY_REPAIR_ATTEMPTS = 3;

export type RepairAction = "repolish" | "retranslate";

export function routeRepairAction(issues: string[]): RepairAction {
  for (const issue of issues) {
    const base = issue.split(":")[0];
    if (base === "judge") {
      const sub = issue.split(":")[1] ?? "";
      if (sub === "mistranslation" || sub === "omission") return "retranslate";
      if (sub === "unnatural" || sub === "word_for_word" || sub === "wrong_pronoun") return "repolish";
    }
    if (RETRANSLATE_PREFIXES.some((prefix) => issue.startsWith(prefix) || base === prefix.replace(":", ""))) {
      return "retranslate";
    }
  }
  if (issues.some((issue) => REPOLISH_PREFIXES.some((prefix) => issue.startsWith(prefix)))) {
    return "repolish";
  }
  return "repolish";
}

export function repairActionLabel(action: RepairAction) {
  return action === "retranslate" ? "Re-translate" : "Re-polish";
}

export function repairActionHint(action: RepairAction) {
  return action === "retranslate"
    ? "Dịch lại từ raw — dùng khi thiếu/sai nội dung gốc"
    : "Polish lại bản dịch — dùng khi lỗi văn phong/lặp/đại từ";
}

export function canAutoRepair(attempts: number) {
  return attempts < MAX_QUALITY_REPAIR_ATTEMPTS;
}

export function repairBlockedReason(attempts: number) {
  if (attempts >= MAX_QUALITY_REPAIR_ATTEMPTS) {
    return `Đã sửa tự động ${attempts}/${MAX_QUALITY_REPAIR_ATTEMPTS} lần — cần sửa tay hoặc quét lại`;
  }
  return null;
}

export function suggestRepairAction(issues: string[], repairAttempts: number): RepairAction | null {
  if (!issues.length) return null;
  if (!canAutoRepair(repairAttempts)) return null;
  return routeRepairAction(issues);
}
