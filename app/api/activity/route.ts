import { NextRequest, NextResponse } from "next/server";
import { listAdminActivity } from "@/lib/admin-audit";
import { requireAdminPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await requireAdminPermission("pipeline");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = request.nextUrl.searchParams;
  try {
    const data = await listAdminActivity({
      page: Number(params.get("page") ?? 1),
      pageSize: Number(params.get("pageSize") ?? 40),
      storyId: params.get("storyId") ?? undefined,
      actionPrefix: params.get("actionPrefix") ?? undefined
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load activity" },
      { status: 500 }
    );
  }
}
