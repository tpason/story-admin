const MAX_CHARS = 300;
const MIN_CHARS = 70;
const SENTENCE_PATTERN = /[^.!?。！？…]+(?:[.!?。！？…]+[""'']*)?/g;

/** ponytail: simplified split — worker re-processes audio; boundaries need to be reasonable, not identical to Python. */
export function prepareTextForSegmentSplit(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/^[-–—=*]{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitSentences(paragraph: string): string[] {
  const matches = paragraph.match(SENTENCE_PATTERN);
  if (!matches) return paragraph.trim() ? [paragraph.trim()] : [];
  return matches.map((s) => s.trim()).filter(Boolean);
}

function packSentences(sentences: string[], maxChars: number, minChars: number): string[] {
  const units: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > maxChars && current.length >= minChars) {
      units.push(current);
      current = sentence;
    } else if (next.length > maxChars) {
      units.push(sentence);
      current = "";
    } else {
      current = next;
    }
  }

  if (current) units.push(current);
  return units;
}

export function splitChapterIntoSegments(polishedText: string): string[] {
  const prepared = prepareTextForSegmentSplit(polishedText);
  if (!prepared) return [];

  const paragraphs = prepared.split(/\n{2,}/).map((p) => p.replace(/\n+/g, " ").trim()).filter(Boolean);
  const segments: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= MAX_CHARS) {
      segments.push(paragraph);
      continue;
    }
    segments.push(...packSentences(splitSentences(paragraph), MAX_CHARS, MIN_CHARS));
  }

  return segments.filter((segment) => segment.trim() && /\w/u.test(segment));
}
