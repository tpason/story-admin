import { NextResponse } from "next/server";
import { cleanAuthInput, createSession, findAdminByUsername, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
  const username = cleanAuthInput(body?.username);
  const password = cleanAuthInput(body?.password);

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password required" }, { status: 400 });
  }

  const user = await findAdminByUsername(username);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: "Invalid credentials or not an admin" }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true, user: { id: user.id, username: user.username } });
}
