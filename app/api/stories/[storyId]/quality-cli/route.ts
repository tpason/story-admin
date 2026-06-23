import { NextResponse } from "next/server";
import { isQualityScanSpawnAllowed, qualityScanCliExamples } from "@/lib/pipeline-qa-policy";
import { requireAdminPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ storyId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const admin = await requireAdminPermission("pipeline");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { storyId } = await context.params;
  return NextResponse.json({
    spawnAllowed: isQualityScanSpawnAllowed(),
    cliExamples: qualityScanCliExamples(storyId)
  });
}
