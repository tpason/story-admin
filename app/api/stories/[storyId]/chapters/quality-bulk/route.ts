import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { bulkMarkChapterQualityPassed, resolveChapterIdsByNumbers } from "@/lib/admin-stories";
import { runSmartRepair } from "@/lib/pipeline-actions";
import { requireAdminPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ storyId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireAdminPermission("pipeline");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { storyId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    chapterNumbers?: unknown;
    note?: unknown;
    forceRunning?: unknown;
    forceAction?: unknown;
  } | null;

  const action = String(body?.action ?? "");
  const chapterNumbers = Array.isArray(body?.chapterNumbers)
    ? body.chapterNumbers
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.floor(value))
    : [];

  if (!chapterNumbers.length) {
    return NextResponse.json({ error: "chapterNumbers required" }, { status: 400 });
  }

  try {
    if (action === "pass") {
      const rows = await resolveChapterIdsByNumbers(storyId, chapterNumbers);
      const count = await bulkMarkChapterQualityPassed(
        rows.map((row) => row.id),
        typeof body?.note === "string" ? body.note : undefined
      );
      await logAdminAction(admin, {
        action: "quality.bulk_pass",
        entityType: "story",
        entityId: storyId,
        storyId,
        summary: `Đánh dấu QA pass ${count} chapter`,
        details: { chapterNumbers, count }
      });
      return NextResponse.json({ ok: true, action, count, chapterNumbers });
    }

    if (action === "smart_repair") {
      const forceAction =
        body?.forceAction === "repolish" || body?.forceAction === "retranslate" ? body.forceAction : undefined;
      const repair = await runSmartRepair(storyId, chapterNumbers, {
        forceRunning: Boolean(body?.forceRunning),
        forceAction
      });
      await logAdminAction(admin, {
        action: "quality.smart_repair",
        entityType: "story",
        entityId: storyId,
        storyId,
        summary: `Sửa thông minh ${repair.count}/${repair.total} chapter`,
        details: { chapterNumbers, ...repair }
      });
      return NextResponse.json({ ok: true, action, chapterNumbers, ...repair });
    }

    return NextResponse.json({ error: "Invalid action (pass | smart_repair)" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Quality bulk action failed" },
      { status: 500 }
    );
  }
}
