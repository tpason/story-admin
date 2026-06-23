import { createReadStream, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { Readable } from "node:stream";

const AUDIO_TYPES: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg"
};

function projectRoot() {
  return process.env.STORY_PIPELINE_ROOT ?? resolve(process.cwd(), "..");
}

function resolveAudioPath(path: string) {
  const root = resolve(projectRoot());
  const absolutePath = resolve(root, path);
  if (!absolutePath.startsWith(root)) {
    throw new Error("Invalid audio path");
  }
  return absolutePath;
}

export function streamChapterAudio(path: string, request?: Request) {
  const absolutePath = resolveAudioPath(path);
  const stats = statSync(absolutePath);
  const contentType = AUDIO_TYPES[extname(absolutePath).toLowerCase()] ?? "application/octet-stream";
  const range = request?.headers.get("range");
  const commonHeaders = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=300"
  };

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : stats.size - 1;
    if (!match || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= stats.size) {
      return new Response(null, {
        status: 416,
        headers: { ...commonHeaders, "Content-Range": `bytes */${stats.size}` }
      });
    }
    const boundedEnd = Math.min(end, stats.size - 1);
    const stream = Readable.toWeb(createReadStream(absolutePath, { start, end: boundedEnd })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        ...commonHeaders,
        "Content-Length": String(boundedEnd - start + 1),
        "Content-Range": `bytes ${start}-${boundedEnd}/${stats.size}`
      }
    });
  }

  const stream = Readable.toWeb(createReadStream(absolutePath)) as ReadableStream;
  return new Response(stream, {
    headers: {
      ...commonHeaders,
      "Content-Length": String(stats.size)
    }
  });
}
