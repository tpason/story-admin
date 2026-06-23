import { NextRequest, NextResponse } from "next/server";
import { getQaIssueStats, listQaTriageStories, listSourceCodes } from "@/lib/admin-stories";
import { requireAdminPermission } from "@/lib/auth";
import { routeRepairAction } from "@/lib/quality-repair-routing";
import type { QaIssueStat } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await requireAdminPermission("pipeline");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = request.nextUrl.searchParams;
  const modeParam = params.get("mode");
  const mode = modeParam === "pending" || modeParam === "all" ? modeParam : "failed";
  const sourceCode = params.get("source") ?? undefined;

  try {
    const [data, issueStats, sources] = await Promise.all([
      listQaTriageStories({
        page: Number(params.get("page") ?? 1),
        pageSize: Number(params.get("pageSize") ?? 30),
        mode,
        sourceCode
      }),
      getQaIssueStats(20),
      listSourceCodes()
    ]);
    const issues: QaIssueStat[] = issueStats.map((row) => ({
      code: row.code,
      count: row.count,
      suggestedAction: routeRepairAction([row.code])
    }));
    return NextResponse.json({ ...data, issueStats: issues, sources });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load QA triage" },
      { status: 500 }
    );
  }
}
