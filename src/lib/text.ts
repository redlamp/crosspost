// Counting, URL finding and splitting.

export type Counter = (text: string) => number;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
const encoder = new TextEncoder();

// Built with the constructor because the tsconfig target predates the `v` flag.
const EMOJI_RE = new RegExp("^\\p{RGI_Emoji}$", "v");

export function graphemes(text: string): string[] {
  return Array.from(graphemeSegmenter.segment(text), (s) => s.segment);
}

export function graphemeLength(text: string): number {
  return Array.from(graphemeSegmenter.segment(text)).length;
}

export function codePointLength(text: string): number {
  return Array.from(text).length;
}

export function utf8Length(text: string): number {
  return encoder.encode(text).length;
}

export function isEmoji(grapheme: string): boolean {
  return EMOJI_RE.test(grapheme);
}

// ---------------------------------------------------------------------------
// URLs

export type UrlMatch = { url: string; start: number; end: number };

// Bare domains (no scheme, no www) only count as links with a known TLD, so
// "e.g." or "file.ts" stay plain text.
const TLDS = [
  "com", "org", "net", "edu", "gov", "mil", "int", "info", "biz", "name", "pro",
  "io", "co", "ai", "app", "dev", "me", "tv", "ly", "gg", "fm", "sh", "so", "to",
  "xyz", "site", "online", "tech", "blog", "news", "page", "link", "social", "art",
  "design", "studio", "games", "store", "shop", "club", "live", "world", "cloud",
  "uk", "us", "ca", "au", "nz", "ie", "de", "fr", "es", "it", "nl", "be", "ch",
  "at", "se", "no", "fi", "dk", "is", "pl", "cz", "pt", "gr", "eu", "jp", "kr",
  "cn", "hk", "tw", "sg", "in", "br", "mx", "ar", "za", "ru", "ua",
];

const URL_RE = new RegExp(
  [
    "https?:\\/\\/[^\\s<>\"]+",
    "(?<![\\w@.\\-/])www\\.[^\\s<>\"]+",
    `(?<![\\w@.\\-/])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS.join("|")})(?![\\w-])(?::\\d+)?(?:[/?#][^\\s<>"]*)?`,
  ].join("|"),
  "gi",
);

const TRAILING_PUNCT = /[.,;:!?'"*]$/;

function trimUrl(url: string): string {
  for (;;) {
    if (TRAILING_PUNCT.test(url)) {
      url = url.slice(0, -1);
      continue;
    }
    const close = url.at(-1);
    const open = close === ")" ? "(" : close === "]" ? "[" : null;
    if (open && url.split(open).length <= url.split(close!).length - 1) {
      url = url.slice(0, -1);
      continue;
    }
    return url;
  }
}

export function findUrls(text: string): UrlMatch[] {
  const matches: UrlMatch[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const url = trimUrl(m[0]);
    if (!url.includes(".")) continue;
    matches.push({ url, start: m.index, end: m.index + url.length });
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Platform counters

// twitter-text v3: these code point ranges weigh 1, everything else 2.
const LIGHT_RANGES: [number, number][] = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];

function xWeightOf(segment: string): number {
  let weight = 0;
  for (const g of graphemes(segment)) {
    if (isEmoji(g)) {
      weight += 2;
      continue;
    }
    for (const ch of g) {
      const cp = ch.codePointAt(0)!;
      weight += LIGHT_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi) ? 1 : 2;
    }
  }
  return weight;
}

export const X_URL_WEIGHT = 23;

export function xWeightedLength(text: string): number {
  const t = text.normalize("NFC");
  let weight = 0;
  let i = 0;
  for (const { start, end } of findUrls(t)) {
    weight += xWeightOf(t.slice(i, start)) + X_URL_WEIGHT;
    i = end;
  }
  return weight + xWeightOf(t.slice(i));
}

// Threads hasn't documented emoji counting; until it's verified, assume the
// worst case and count each emoji as its UTF-8 byte length.
export function threadsLength(text: string): number {
  let n = 0;
  for (const g of graphemes(text)) n += isEmoji(g) ? utf8Length(g) : 1;
  return n;
}

// Mastodon (StatusLengthValidator): graphemes, after replacing each link that
// has a scheme with 23 characters and each @user@server mention with @user.
const MASTODON_URL_WEIGHT = 23;
const MASTODON_MENTION_RE = /(^|[^\w@/])@(\w+(?:[\w.-]*\w)?)@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;

export function mastodonLength(text: string): number {
  let rewritten = "";
  let i = 0;
  for (const { url, start, end } of findUrls(text)) {
    if (!/^https?:\/\//i.test(url)) continue; // Mastodon doesn't link bare domains.
    rewritten += text.slice(i, start) + "x".repeat(MASTODON_URL_WEIGHT);
    i = end;
  }
  rewritten += text.slice(i);
  return graphemeLength(rewritten.replace(MASTODON_MENTION_RE, "$1@$2"));
}

// ---------------------------------------------------------------------------
// Splitting
//
// Works on [start, end) ranges of the original text, so callers know where
// each chunk sits (for split markers) and chunks keep the author's spacing.

type Range = { start: number; end: number };

export type Chunk = {
  /** The chunk as it will be posted, including any " i/n" label. */
  text: string;
  /** Where the chunk's own text sits in the original. */
  start: number;
  end: number;
  /** It begins at a split the user placed by hand. */
  manual: boolean;
};

type Level = "paragraph" | "line" | "sentence" | "word" | "grapheme";
const LEVELS: Level[] = ["paragraph", "line", "sentence", "word", "grapheme"];

const WS = /\s/;

function trimRange(text: string, { start, end }: Range): Range {
  while (start < end && WS.test(text[start])) start++;
  while (end > start && WS.test(text[end - 1])) end--;
  return { start, end };
}

/** Split a range at the given separator matches, trimming each piece. */
function piecesBetween(text: string, range: Range, separator: RegExp): Range[] {
  const slice = text.slice(range.start, range.end);
  const out: Range[] = [];
  let last = 0;
  for (const m of slice.matchAll(separator)) {
    out.push({ start: range.start + last, end: range.start + m.index });
    last = m.index + m[0].length;
  }
  out.push({ start: range.start + last, end: range.end });
  return out.map((r) => trimRange(text, r)).filter((r) => r.end > r.start);
}

function breakAt(text: string, range: Range, level: Level): Range[] {
  const slice = text.slice(range.start, range.end);
  switch (level) {
    case "paragraph":
      return piecesBetween(text, range, /\n[ \t]*\n\s*/g);
    case "line":
      return piecesBetween(text, range, /\n/g);
    case "sentence":
      return Array.from(sentenceSegmenter.segment(slice), (seg) =>
        trimRange(text, { start: range.start + seg.index, end: range.start + seg.index + seg.segment.length }),
      ).filter((r) => r.end > r.start);
    case "word":
      return Array.from(slice.matchAll(/\S+/g), (m) => ({
        start: range.start + m.index,
        end: range.start + m.index + m[0].length,
      }));
    case "grapheme":
      return Array.from(graphemeSegmenter.segment(slice), (seg) => ({
        start: range.start + seg.index,
        end: range.start + seg.index + seg.segment.length,
      }));
  }
}

function splitToFit(text: string, range: Range, max: number, count: Counter): Range[] {
  const chunks: Range[] = [];
  let current: Range | null = null;

  const fits = (r: Range) => count(text.slice(r.start, r.end)) <= max;
  const flush = () => {
    if (current) chunks.push(current);
    current = null;
  };

  const add = (unit: Range, depth: number) => {
    const candidate = current ? { start: current.start, end: unit.end } : unit;
    if (fits(candidate)) {
      current = candidate;
      return;
    }
    if (fits(unit)) {
      flush();
      current = unit;
      return;
    }
    // Too big on its own: it starts a new chunk and is broken at the next
    // level down that actually breaks it.
    flush();
    for (let d = depth + 1; d < LEVELS.length; d++) {
      const parts = breakAt(text, unit, LEVELS[d]);
      if (parts.length > 1 || d === LEVELS.length - 1) {
        for (const part of parts) add(part, d);
        return;
      }
    }
  };

  for (const part of breakAt(text, range, "paragraph")) add(part, 0);
  flush();
  return chunks;
}

export type SplitOptions = {
  numbering?: boolean;
  /** Offsets where the user forced a split. Stretches between them still split automatically if too long. */
  breaks?: number[];
};

export function numberLabel(i: number, n: number): string {
  return ` ${i}/${n}`;
}

/**
 * Split text into chunks that each fit `limit` under `count`. Breaks at
 * paragraphs, then lines, sentences, words, and only then inside a word.
 * Manual `breaks` always split. With numbering, each chunk ends with " i/n"
 * and room is reserved for it.
 */
export function splitChunks(
  text: string,
  limit: number,
  count: Counter,
  { numbering = false, breaks = [] }: SplitOptions = {},
): Chunk[] {
  const whole = trimRange(text, { start: 0, end: text.length });
  if (whole.end === whole.start) return [];

  // Segments between manual breaks; each remembers whether a manual break starts it.
  const cuts = [...new Set(breaks)].filter((b) => b > whole.start && b < whole.end).sort((a, b) => a - b);
  const segments = [whole.start, ...cuts]
    .map((start, i) => ({
      range: trimRange(text, { start, end: cuts[i] ?? whole.end }),
      manual: i > 0,
    }))
    .filter((s) => s.range.end > s.range.start);

  const plain = (r: Range, manual: boolean): Chunk => ({ text: text.slice(r.start, r.end), ...r, manual });
  if (segments.length === 1 && count(text.slice(whole.start, whole.end)) <= limit) {
    return [plain(whole, false)];
  }

  const split = (max: number) =>
    segments.flatMap((seg) => splitToFit(text, seg.range, max, count).map((r, i) => plain(r, seg.manual && i === 0)));

  if (!numbering) return split(limit);

  // The label width depends on the chunk count, which depends on the label
  // width; repeat until the count settles. n only grows, so the reserved room
  // always covers the final labels.
  let n = split(limit).length;
  let chunks: Chunk[];
  for (;;) {
    chunks = split(limit - count(numberLabel(n, n)));
    if (chunks.length <= n) break;
    n = chunks.length;
  }
  return chunks.map((c, i) => ({ ...c, text: c.text + numberLabel(i + 1, chunks.length) }));
}

/** splitChunks, returning just the text of each chunk. */
export function splitText(text: string, limit: number, count: Counter, options: SplitOptions = {}): string[] {
  return splitChunks(text, limit, count, options).map((c) => c.text);
}

/**
 * Keep manual break offsets attached to the same text after an edit. Breaks
 * inside the edited region move to its end; ones that fall off the text drop.
 */
export function shiftBreaks(before: string, after: string, breaks: number[]): number[] {
  if (breaks.length === 0 || before === after) return breaks;
  let prefix = 0;
  const max = Math.min(before.length, after.length);
  while (prefix < max && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }
  const delta = after.length - before.length;
  const editEnd = before.length - suffix;
  const moved = breaks.map((b) => (b <= prefix ? b : b >= editEnd ? b + delta : after.length - suffix));
  return [...new Set(moved)].filter((b) => b > 0 && b < after.length).sort((a, b) => a - b);
}

/** Snap an offset to the start of the nearest word, so a split never cuts a word. */
export function snapToWordStart(text: string, offset: number): number {
  const isStart = (i: number) => i > 0 && i < text.length && !WS.test(text[i]) && WS.test(text[i - 1]);
  for (let d = 0; d < text.length; d++) {
    if (isStart(offset - d)) return offset - d;
    if (isStart(offset + d)) return offset + d;
  }
  return offset;
}

// ---------------------------------------------------------------------------
// Mentions

// An @handle, optionally with a server (@name@host.tld), not inside a word, an email or a URL.
const MENTION_RE = /(?<![\w@/.])@[A-Za-z0-9_](?:[\w.-]*[A-Za-z0-9_])?(?:@[a-z0-9-]+(?:\.[a-z0-9-]+)+)?/gi

/** The @mentions in a post, each once, in the order they first appear. */
export function findMentions(text: string): string[] {
  const seen = new Set<string>()
  for (const m of text.matchAll(MENTION_RE)) seen.add(m[0])
  return [...seen]
}
