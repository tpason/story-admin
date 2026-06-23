import { NextRequest, NextResponse } from "next/server";
import { listPendingCommentReports } from "@/lib/admin-moderation";
import { requireAdminPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await requireAdminPermission("moderation");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = request.nextUrl.searchParams;
  const data = await listPendingCommentReports({
    page: Number(params.get("page") ?? 1),
    pageSize: Number(params.get("pageSize") ?? 20)
  });
  return NextResponse.json(data);
}
