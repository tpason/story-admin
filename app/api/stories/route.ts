import { NextRequest, NextResponse } from "next/server";
import { listAdminStories, listSourceCodes } from "@/lib/admin-stories";
import { requireAdminPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

function boolParam(value: string | null) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminPermission("stories");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = request.nextUrl.searchParams;
  const sortParam = params.get("sort");
  const sort = sortParam === "title" || sortParam === "chapters" ? sortParam : "updated";
  try {
    const [data, sources] = await Promise.all([
      listAdminStories({
        page: Number(params.get("page") ?? 1),
        pageSize: Number(params.get("pageSize") ?? 30),
        queryText: params.get("q") ?? undefined,
        sourceCode: params.get("source") ?? undefined,
        activeOnly: boolParam(params.get("activeOnly")),
        hasPolished: params.get("hasPolished") === "true",
        sort
      }),
      listSourceCodes()
    ]);
    return NextResponse.json({ ...data, sources });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load stories" },
      { status: 500 }
    );
  }
}
