import { NextRequest, NextResponse } from "next/server";
import { listAdminChapters } from "@/lib/admin-stories";
import { requireAdminPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ storyId: string }> };

function boolParam(value: string | null) {
  return value === "true";
}

export async function GET(request: NextRequest, context: RouteContext) {
  const admin = await requireAdminPermission("stories");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { storyId } = await context.params;
  const params = request.nextUrl.searchParams;

  try {
    const data = await listAdminChapters(storyId, {
      page: Number(params.get("page") ?? 1),
      pageSize: Number(params.get("pageSize") ?? 50),
      search: params.get("q") ?? undefined,
      missingPolished: boolParam(params.get("missingPolished")),
      emptyTitle: boolParam(params.get("emptyTitle")),
      hasQualityIssue: boolParam(params.get("hasQualityIssue"))
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load chapters" },
      { status: 500 }
    );
  }
}
