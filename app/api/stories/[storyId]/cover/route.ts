import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getAdminStory, updateAdminStory } from "@/lib/admin-stories";
import { requireAdminPermission } from "@/lib/auth";
import {
  coverContentType,
  coverPublicUrl,
  resolveCoverFile,
  saveStoryCoverUpload
} from "@/lib/story-cover";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ storyId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { storyId } = await context.params;
  const filePath = resolveCoverFile(storyId);
  if (!filePath) {
    return NextResponse.json({ error: "Cover not found" }, { status: 404 });
  }

  const buffer = await readFile(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": coverContentType(filePath),
      "Cache-Control": "public, max-age=3600"
    }
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireAdminPermission("stories");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { storyId } = await context.params;
  const story = await getAdminStory(storyId);
  if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

  const form = await request.formData();
  const file = form.get("cover");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing cover file" }, { status: 400 });
  }

  try {
    await saveStoryCoverUpload(storyId, file);
    const publicUrl = coverPublicUrl(storyId, request);
    await updateAdminStory(storyId, { coverImageUrl: publicUrl });
    const updated = await getAdminStory(storyId);
    return NextResponse.json({ ok: true, coverImageUrl: publicUrl, story: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 }
    );
  }
}
