import type { QualityIssueDetail } from "@/lib/types";

export function parseAuditIssueCodes(raw: unknown): string[] {
  return parseAuditIssues(raw).map((issue) => issue.code);
}

export function parseAuditIssues(raw: unknown): QualityIssueDetail[] {
  if (!Array.isArray(raw)) return [];
  const issues: QualityIssueDetail[] = [];
  for (const item of raw) {
    if (item && typeof item === "object" && "code" in item) {
      const obj = item as { code?: unknown; severity?: unknown; tier?: unknown; evidence?: unknown };
      const code = String(obj.code ?? "").trim();
      if (!code) continue;
      issues.push({
        code,
        severity: obj.severity != null ? String(obj.severity) : null,
        tier: typeof obj.tier === "number" ? obj.tier : null,
        evidence: obj.evidence != null ? String(obj.evidence).slice(0, 500) : null
      });
    } else if (typeof item === "string" && item.trim()) {
      issues.push({ code: item.trim(), severity: null, tier: null, evidence: null });
    }
  }
  return issues;
}

export function qualityStatusBadgeClass(status: string | null) {
  switch (status) {
    case "passed":
      return "badge badge-ok";
    case "failed":
    case "failed_manual":
      return "badge badge-danger";
    case "pending_audit":
      return "badge badge-warn";
    default:
      return "badge badge-muted";
  }
}

export function qualityStatusLabel(status: string | null, isAuditable: boolean) {
  if (!isAuditable) return "—";
  switch (status) {
    case "passed":
      return "Đạt";
    case "failed":
      return "Lỗi QA";
    case "failed_manual":
      return "Lỗi (manual)";
    case "pending_audit":
      return "Chờ quét";
    default:
      return "Chưa quét";
  }
}

export function qualityIssueLabel(issue: string) {
  switch (issue) {
    case "missing_text":
      return "no text";
    case "failed_job":
      return "job fail";
    case "low_ratio":
      return "ratio thấp";
    case "missing_polished":
      return "thiếu polish";
    case "bad_title":
      return "title lỗi";
    case "no_polished_text":
      return "không có polished";
    default:
      if (issue.startsWith("term_alignment:")) return issue.replace("term_alignment:", "term: ");
      if (issue.startsWith("judge:")) return issue.replace("judge:", "judge ");
      if (issue.startsWith("golden:")) return issue.replace(/^golden:[^:]+:/, "golden ");
      return issue.length > 28 ? `${issue.slice(0, 26)}…` : issue;
  }
}

export function qualitySeverityBadgeClass(severity: string | null) {
  if (severity === "blocking") return "badge badge-danger";
  if (severity === "warning") return "badge badge-warn";
  return "badge badge-muted";
}
