import { NextResponse } from "next/server";
import { getPipelineRun } from "@/lib/admin-pipeline-runs";
import { requireAdminPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ runId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const admin = await requireAdminPermission("pipeline");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { runId } = await context.params;
  const run = await getPipelineRun(runId);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(run);
}
