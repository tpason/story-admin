import { NextResponse } from "next/server";
import { getPipelineRun } from "@/lib/admin-pipeline-runs";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ runId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId } = await context.params;
  const run = await getPipelineRun(runId);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(run);
}
