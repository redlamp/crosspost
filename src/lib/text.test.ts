import { describe, expect, it } from "vitest";

import {
  codePointLength,
  shiftBreaks,
  snapToWordStart,
  splitChunks,
  findUrls,
  graphemeLength,
  splitText,
  threadsLength,
  utf8Length,
  xWeightedLength,
} from "./text";

const FAMILY = "👨‍👩‍👧‍👦";
const FLAG = "🇬🇧";

describe("counters", () => {
  it("counts a family emoji as one grapheme but many code points", () => {
    expect(graphemeLength(FAMILY)).toBe(1);
    expect(codePointLength(FAMILY)).toBe(7);
    expect(utf8Length(FAMILY)).toBe(25);
  });

  it("counts a flag as one grapheme of two code points", () => {
    expect(graphemeLength(FLAG)).toBe(1);
    expect(codePointLength(FLAG)).toBe(2);
    expect(graphemeLength(`hi ${FLAG}!`)).toBe(5);
  });
});

describe("findUrls", () => {
  const urls = (text: string) => findUrls(text).map((u) => u.url);

  it("finds http, www and bare domains", () => {
    expect(urls("see https://a.com/x?y=1 and http://b.org")).toEqual(["https://a.com/x?y=1", "http://b.org"]);
    expect(urls("go to www.example.com/path now")).toEqual(["www.example.com/path"]);
    expect(urls("visit example.com or sub.example.co.uk/page")).toEqual(["example.com", "sub.example.co.uk/page"]);
  });

  it("trims trailing punctuation and unbalanced brackets", () => {
    expect(urls("Read example.com.")).toEqual(["example.com"]);
    expect(urls("(see https://a.com/x)")).toEqual(["https://a.com/x"]);
    expect(urls("https://en.wikipedia.org/wiki/Foo_(bar), ok")).toEqual(["https://en.wikipedia.org/wiki/Foo_(bar)"]);
    expect(urls('"https://a.com/x"!?')).toEqual(["https://a.com/x"]);
  });

  it("returns string offsets", () => {
    expect(findUrls("hi example.com")).toEqual([{ url: "example.com", start: 3, end: 14 }]);
  });

  it("ignores emails, handles and non-domains", () => {
    expect(urls("mail bob@example.com")).toEqual([]);
    expect(urls("hey @alice.bsky.social")).toEqual([]);
    expect(urls("e.g. this, i.e. that, file.ts, v1.2")).toEqual([]);
  });
});

describe("xWeightedLength", () => {
  it("weighs ASCII as 1 and URLs as 23", () => {
    expect(xWeightedLength("hello")).toBe(5);
    expect(xWeightedLength("https://example.com/a/very/long/path/indeed")).toBe(23);
    expect(xWeightedLength("see example.com")).toBe(4 + 23);
  });

  it("weighs CJK and emoji as 2", () => {
    expect(xWeightedLength("日本語")).toBe(6);
    expect(xWeightedLength("😀")).toBe(2);
    expect(xWeightedLength(FAMILY)).toBe(2);
    expect(xWeightedLength(FLAG)).toBe(2);
  });

  it("NFC-normalizes first", () => {
    expect(xWeightedLength("é")).toBe(1);
  });
});

describe("threadsLength", () => {
  it("counts emoji by UTF-8 bytes and other graphemes as 1", () => {
    expect(threadsLength("hi")).toBe(2);
    expect(threadsLength("😀")).toBe(4);
    expect(threadsLength(`a${FAMILY}`)).toBe(1 + 25);
  });
});

describe("splitText", () => {
  const len = (s: string) => s.length;

  it("keeps text that fits as one chunk, even with numbering", () => {
    expect(splitText("Short post.", 20, len)).toEqual(["Short post."]);
    expect(splitText("Short post.", 20, len, { numbering: true })).toEqual(["Short post."]);
    expect(splitText("   ", 20, len)).toEqual([]);
  });

  it("breaks at paragraphs first", () => {
    const text = "First paragraph here.\n\nSecond paragraph here.";
    expect(splitText(text, 30, len)).toEqual(["First paragraph here.", "Second paragraph here."]);
  });

  it("packs small paragraphs together", () => {
    const text = "One.\n\nTwo.\n\nThree is longer.";
    expect(splitText(text, 16, len)).toEqual(["One.\n\nTwo.", "Three is longer."]);
  });

  it("falls back to lines, then sentences", () => {
    expect(splitText("Line one is here\nLine two is here", 20, len)).toEqual(["Line one is here", "Line two is here"]);
    const text = "First sentence here. Second sentence here. Third one.";
    expect(splitText(text, 25, len)).toEqual(["First sentence here.", "Second sentence here.", "Third one."]);
  });

  it("falls back to words, and a broken sentence starts a new chunk", () => {
    const text = "Tiny. This sentence is far too long to fit in one chunk.";
    const chunks = splitText(text, 20, len);
    expect(chunks[0]).toBe("Tiny.");
    expect(chunks.every((c) => c.length <= 20)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });

  it("keeps URLs intact when they fit", () => {
    const url = "https://example.com/some/path";
    const text = `Here is a link for you ${url} and more words after it`;
    const chunks = splitText(text, 35, len);
    expect(chunks.some((c) => c.includes(url))).toBe(true);
    expect(chunks.every((c) => c.length <= 35)).toBe(true);
  });

  it("hard-splits a word longer than the limit", () => {
    const chunks = splitText("abcdefghijklmnopqrstuvwxyz", 10, len);
    expect(chunks).toEqual(["abcdefghij", "klmnopqrst", "uvwxyz"]);
  });

  it("hard-splits by grapheme, never inside an emoji", () => {
    const chunks = splitText(FAMILY.repeat(5), 2, graphemeLength);
    expect(chunks).toEqual([FAMILY.repeat(2), FAMILY.repeat(2), FAMILY]);
  });

  it("numbers chunks, keeps them within the limit, and labels them correctly", () => {
    const text = Array.from({ length: 30 }, (_, i) => `Sentence number ${i + 1} is here.`).join(" ");
    const chunks = splitText(text, 60, len, { numbering: true });
    expect(chunks.length).toBeGreaterThan(9);
    chunks.forEach((c, i) => {
      expect(c.length).toBeLessThanOrEqual(60);
      expect(c.endsWith(` ${i + 1}/${chunks.length}`)).toBe(true);
    });
  });

  it("splits by a platform counter", () => {
    const text = `${"word ".repeat(60)}https://example.com/${"x".repeat(100)}`;
    const chunks = splitText(text, 280, xWeightedLength);
    expect(chunks.every((c) => xWeightedLength(c) <= 280)).toBe(true);
    expect(chunks.at(-1)).toContain(`https://example.com/${"x".repeat(100)}`);
  });
});

describe("splitChunks", () => {
  const len = (s: string) => s.length;

  it("reports where each chunk sits in the original text", () => {
    const text = "  First paragraph here.\n\nSecond paragraph here.  ";
    const chunks = splitChunks(text, 30, len);
    expect(chunks.map((c) => text.slice(c.start, c.end))).toEqual(["First paragraph here.", "Second paragraph here."]);
    expect(chunks.every((c) => !c.manual)).toBe(true);
  });

  it("splits at a manual break even when the text fits", () => {
    const text = "One two three. Four five six.";
    const chunks = splitChunks(text, 280, len, { breaks: [text.indexOf("Four")] });
    expect(chunks.map((c) => c.text)).toEqual(["One two three.", "Four five six."]);
    expect(chunks.map((c) => c.manual)).toEqual([false, true]);
  });

  it("still auto-splits a stretch between manual breaks that is too long", () => {
    const text = "Aaaa bbbb. Cccc dddd eeee ffff gggg. Hhhh.";
    const chunks = splitChunks(text, 20, len, { breaks: [text.indexOf("Hhhh")] });
    expect(chunks.every((c) => c.text.length <= 20)).toBe(true);
    expect(chunks.at(-1)).toMatchObject({ text: "Hhhh.", manual: true });
  });

  it("numbers chunks across manual and automatic splits", () => {
    const text = "One two three. Four five six.";
    const chunks = splitChunks(text, 280, len, { numbering: true, breaks: [15] });
    expect(chunks.map((c) => c.text)).toEqual(["One two three. 1/2", "Four five six. 2/2"]);
  });

  it("ignores breaks at the very start or end", () => {
    expect(splitText("Hello there.", 280, len, { breaks: [0, 12, 99] })).toEqual(["Hello there."]);
  });
});

describe("shiftBreaks", () => {
  it("moves breaks after an insertion and keeps those before it", () => {
    const before = "Aaa bbb. Ccc ddd.";
    const after = "Aaa XX bbb. Ccc ddd.";
    expect(shiftBreaks(before, after, [before.indexOf("Ccc")])).toEqual([after.indexOf("Ccc")]);
    expect(shiftBreaks("Aaa bbb.", "Aaa bbb. More", [4])).toEqual([4]);
  });

  it("drops breaks that fall off the end and dedupes", () => {
    expect(shiftBreaks("Aaa bbb ccc", "Aaa", [4, 8])).toEqual([]);
  });
});

describe("snapToWordStart", () => {
  it("snaps to the nearest word start", () => {
    const text = "Hello there world";
    expect(snapToWordStart(text, 8)).toBe(6);
    expect(snapToWordStart(text, 10)).toBe(12);
    expect(snapToWordStart(text, 6)).toBe(6);
  });
});
