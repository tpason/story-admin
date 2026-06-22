const DEFAULT_MAX_PARAGRAPH_LENGTH = 520;
const OPENING_QUOTE_PATTERN = "[\"'“‘]";
const SENTENCE_PATTERN = /[^.!?。！？…]+(?:[.!?。！？…]+[”"'’]*)?/g;
const CHAPTER_NUMBER_PATTERN = String.raw`(?:\d+|[ivxlcdm]+)`;
const LEADING_CHAPTER_NUMBER_PATTERN = new RegExp(
  String.raw`^(?:(?:chương|chapter)\s*)?${CHAPTER_NUMBER_PATTERN}(?:\s*(?:[-–—:：.．]|::)\s*)?`,
  "iu"
);
const CHAPTER_HEADING_PATTERN = new RegExp(
  String.raw`^(?:#{1,6}\s*)?(?:chương|chapter)\s*${CHAPTER_NUMBER_PATTERN}(?:\s*(?:[-–—:：.．]|::)\s*.+)?(?:\s*\(\d+\))?$`,
  "iu"
);
const INLINE_CHAPTER_HEADING_PATTERN = new RegExp(
  String.raw`^(?:#{1,6}\s*)?(?:chương|chapter)\s*${CHAPTER_NUMBER_PATTERN}\s*(?:(?:[-–—:：.．]|::)\s*)?[^.!?。！？…\n]{0,90}[.!?。！？…]\s*`,
  "iu"
);
const MAX_HEADING_ONLY_LENGTH = 140;
const MAX_TITLE_STRIP_LINES = 4;

export const READER_CONTENT_FORMAT_VERSION = 5;

export function formatNovelContent(content: string | null, maxParagraphLength = DEFAULT_MAX_PARAGRAPH_LENGTH, chapterTitle?: string | null) {
  if (!content) return [];

  const rawLines = content
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/([^\n])\n+\s*(["'])(?=\n|$)/g, "$1$2")
    .split("\n")
    .map(cleanRawLine);

  const normalized = stripLeadingChapterTitleLines(rawLines, chapterTitle)
    .reduce<string[]>((blocks, line) => {
      if (!line) {
        if (blocks[blocks.length - 1] !== "") blocks.push("");
        return blocks;
      }

      blocks.push(line);
      return blocks;
    }, [])
    .join("\n")
    .replace(/([^\n])\n(["'])(?=\n|$)/g, "$1$2")
    .replace(/([.!?。！？…])\n+(["'])(?=\s+\S)/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map(joinSoftWrappedLines)
    .flatMap((block) => formatParagraphBlock(block, maxParagraphLength))
    .map((paragraph) => normalizePunctuationSpacing(paragraph.replace(/\n+/g, " ").trim()))
    .filter(Boolean);

  return mergeDanglingQuoteParagraphs(paragraphs);
}

function joinSoftWrappedLines(block: string) {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((current, line) => {
      if (!current) return line;
      if (/[.!?。！？…]["']?$/u.test(current) && /^["'][^\s"']/u.test(line)) return `${current}\n\n${line}`;
      if (/^[,.!?;:，。！？；：)"'\]}]/u.test(line)) return `${current}${line}`;
      return `${current} ${line}`;
    }, "");
}

function cleanRawLine(line: string) {
  const cleaned = normalizePunctuationSpacing(stripMarkdownNoise(line.trim()));
  if (!cleaned) return "";
  if (isChapterHeadingOnly(cleaned)) return "";
  const withoutInlineHeading = cleaned.replace(INLINE_CHAPTER_HEADING_PATTERN, "").trim();
  return withoutInlineHeading && withoutInlineHeading !== cleaned
    ? normalizePunctuationSpacing(withoutInlineHeading)
    : cleaned;
}

function isChapterHeadingOnly(value: string) {
  if (value.length > MAX_HEADING_ONLY_LENGTH || !CHAPTER_HEADING_PATTERN.test(value)) return false;
  return !/[.!?。！？…]\s+["']?\S/u.test(value);
}

function stripLeadingChapterTitleLines(lines: string[], chapterTitle?: string | null) {
  const titleKeys = chapterTitleKeys(chapterTitle);
  if (titleKeys.size === 0 || lines.length === 0) return lines;

  let firstContentIndex = 0;
  let strippedCount = 0;

  while (firstContentIndex < lines.length && strippedCount < MAX_TITLE_STRIP_LINES) {
    const line = lines[firstContentIndex];
    if (!line) {
      firstContentIndex += 1;
      continue;
    }
    if (!isChapterTitleDuplicate(line, titleKeys)) break;
    firstContentIndex += 1;
    strippedCount += 1;
  }

  return firstContentIndex > 0 ? lines.slice(firstContentIndex) : lines;
}

function chapterTitleKeys(chapterTitle?: string | null) {
  const cleaned = cleanComparableTitle(chapterTitle);
  const withoutNumber = cleanComparableTitle(stripLeadingChapterNumber(chapterTitle ?? ""));
  return new Set([cleaned, withoutNumber].filter((value) => value.length >= 3));
}

function isChapterTitleDuplicate(line: string, titleKeys: Set<string>) {
  const lineKey = cleanComparableTitle(line);
  const lineWithoutNumberKey = cleanComparableTitle(stripLeadingChapterNumber(line));
  return titleKeys.has(lineKey) || titleKeys.has(lineWithoutNumberKey);
}

function stripLeadingChapterNumber(value: string) {
  return stripMarkdownNoise(value.trim())
    .replace(LEADING_CHAPTER_NUMBER_PATTERN, "")
    .trim();
}

function cleanComparableTitle(value?: string | null) {
  const normalized = stripMarkdownNoise(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .toLocaleLowerCase("vi-VN")
    .replace(/[\W_]+/gu, " ");
  return normalized.replace(/\s+/g, " ").trim();
}

function stripMarkdownNoise(value: string) {
  return value
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*_]{3,}$/, "")
    .replace(/\*\*([^*]+?)\s*\*\*/g, "$1")
    .replace(/__([^_]+?)\s*__/g, "$1")
    .replace(/(^|[\s("'[])\*([^*\n]+?)\*(?=[\s,.!?;:)"'\]]|$)/g, "$1$2")
    .replace(/(^|[\s("'[])\_([^_\n]+?)\_(?=[\s,.!?;:)"'\]]|$)/g, "$1$2");
}

function normalizePunctuationSpacing(value: string) {
  return value
    .replace(/\s+([,.!?;:，。！？；：])/g, "$1")
    .replace(/([({\[])\s+/g, "$1")
    .replace(/\s+([)}\]])/g, "$1")
    .replace(/(^|[\s([{])(["'])\s+([^"'\n]*?)\s+\2(?=$|[\s,.!?;:)\]}])/g, "$1$2$3$2")
    .replace(/([,.!?;:，。！？；：])(?=[^\s,.!?;:，。！？；：)"'\]}])/g, "$1 ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatParagraphBlock(block: string, maxParagraphLength: number) {
  const paragraph = normalizePunctuationSpacing(block.replace(/\n+/g, " ").trim());
  if (!paragraph) return [];

  const withDialogueBreaks = paragraph
    .replace(new RegExp(`([.!?。！？…][”"'’]?)\\s+(?=${OPENING_QUOTE_PATTERN})`, "g"), "$1\n\n");

  return withDialogueBreaks
    .split(/\n{2,}/)
    .flatMap((part) => splitLongParagraph(part, maxParagraphLength));
}

function splitLongParagraph(paragraph: string, maxLength: number) {
  if (paragraph.length <= maxLength) return [paragraph];

  const sentences = paragraph.match(SENTENCE_PATTERN) ?? [paragraph];
  const result: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const cleanedSentence = sentence.trim();
    if (!cleanedSentence) continue;

    const next = current ? `${current} ${cleanedSentence}` : cleanedSentence;
    if (next.length > maxLength && current) {
      result.push(current);
      current = cleanedSentence;
    } else {
      current = next;
    }
  }

  if (current) result.push(current);
  return result;
}

function mergeDanglingQuoteParagraphs(paragraphs: string[]) {
  const result: string[] = [];

  for (const paragraph of paragraphs) {
    if (isClosingQuoteOnly(paragraph) && result.length > 0) {
      result[result.length - 1] = normalizePunctuationSpacing(`${result[result.length - 1]}${paragraph}`);
      continue;
    }

    result.push(paragraph);
  }

  return result.filter((paragraph) => !isClosingQuoteOnly(paragraph));
}

function isClosingQuoteOnly(value: string) {
  return value === "\"" || value === "'";
}
