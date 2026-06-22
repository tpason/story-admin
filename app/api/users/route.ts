import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit";
import { createAdminUser, listAdminUsers } from "@/lib/admin-users";
import { cleanAuthInput, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const data = await listAdminUsers({
    page: Number(params.get("page") ?? 1),
    pageSize: Number(params.get("pageSize") ?? 30),
    queryText: params.get("q") ?? undefined
  });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    username?: unknown;
    password?: unknown;
    email?: unknown;
    role?: unknown;
  } | null;

  const username = cleanAuthInput(body?.username);
  const password = cleanAuthInput(body?.password);
  const email = cleanAuthInput(body?.email);
  const role = body?.role === "admin" ? "admin" : "reader";

  if (!username || password.length < 6) {
    return NextResponse.json({ error: "Username and password (min 6 chars) required" }, { status: 400 });
  }

  try {
    const user = await createAdminUser(username, password, role, email || null);
    await logAdminAction(admin, {
      action: "user.create",
      entityType: "user",
      entityId: user.id,
      summary: `Created user ${user.username} (${role})`,
      details: { role }
    });
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Create user failed" },
      { status: 500 }
    );
  }
}
