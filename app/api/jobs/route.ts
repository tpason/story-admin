import { NextRequest, NextResponse } from "next/server";
import { listAdminJobs } from "@/lib/admin-jobs";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  try {
    const data = await listAdminJobs({
      page: Number(params.get("page") ?? 1),
      pageSize: Number(params.get("pageSize") ?? 40),
      status: params.get("status") ?? undefined,
      jobType: params.get("jobType") ?? undefined,
      storyId: params.get("storyId") ?? undefined
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load jobs" },
      { status: 500 }
    );
  }
}
