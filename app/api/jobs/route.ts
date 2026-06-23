import { NextRequest, NextResponse } from "next/server";
import { listAdminJobs } from "@/lib/admin-jobs";
import { requireAdminPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await requireAdminPermission("jobs");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = request.nextUrl.searchParams;
  try {
    const data = await listAdminJobs({
      page: Number(params.get("page") ?? 1),
      pageSize: Number(params.get("pageSize") ?? 40),
      status: params.get("status") ?? undefined,
      jobType: params.get("jobType") ?? undefined,
      storyId: params.get("storyId") ?? undefined,
      chapterNumber: params.get("chapterNumber") ? Number(params.get("chapterNumber")) : undefined
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load jobs" },
      { status: 500 }
    );
  }
}
