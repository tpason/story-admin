import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const ALLOWED_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"]
]);

const MAX_BYTES = 2 * 1024 * 1024;

function projectRoot() {
  return process.env.STORY_PIPELINE_ROOT ?? resolve(process.cwd(), "..");
}

export function coverDir() {
  return resolve(projectRoot(), "story_data", "covers");
}

export function coverFilePath(storyId: string, ext: string) {
  return resolve(coverDir(), `${storyId}${ext}`);
}

export function coverPublicUrl(storyId: string, request?: Request) {
  const envBase = process.env.STORY_ADMIN_PUBLIC_URL?.replace(/\/$/, "");
  if (envBase) return `${envBase}/api/stories/${storyId}/cover`;
  if (request) {
    const url = new URL(request.url);
    return `${url.origin}/api/stories/${storyId}/cover`;
  }
  const port = process.env.PORT ?? "3001";
  return `http://localhost:${port}/api/stories/${storyId}/cover`;
}

export async function saveStoryCoverUpload(storyId: string, file: File) {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Chỉ hỗ trợ JPEG, PNG, WebP");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Ảnh tối đa 2MB");
  }

  const ext = ALLOWED_TYPES.get(file.type)!;
  const dir = coverDir();
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(coverFilePath(storyId, ext), buffer);

  // Remove alternate extensions if re-uploaded with different type
  for (const otherExt of [".jpg", ".png", ".webp"]) {
    if (otherExt === ext) continue;
    try {
      await unlink(coverFilePath(storyId, otherExt));
    } catch {
      // ignore missing file
    }
  }

  return ext;
}

export function resolveCoverFile(storyId: string) {
  for (const ext of [".webp", ".jpg", ".png"]) {
    const path = coverFilePath(storyId, ext);
    if (existsSync(path)) return path;
  }
  return null;
}

export function coverContentType(filePath: string) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}
