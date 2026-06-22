import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: admin });
}
