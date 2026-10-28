import { findUrls, threadsLength } from "@/lib/text";

import type { PlatformAdapter } from "./types";

/** Threads rejects posts with more unique links than this. */
const MAX_LINKS = 5;

function problems(text: string): string | null {
  const links = new Set(findUrls(text).map((u) => u.url.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "")));
  return links.size > MAX_LINKS ? `Threads allows at most ${MAX_LINKS} links per post; this one has ${links.size}.` : null;
}

export const threads: PlatformAdapter = {
  id: "threads",
  name: "Threads",
  limit: 500,
  count: threadsLength,
  chain: true,
  countNote: "Emoji count as their UTF-8 bytes; at most 5 links per post",
  launched: "2023-07",
  // Meta, June 2026, as reported.
  users: { millions: 500, label: "~500M" },
  problems,
  brand: {
    // Threads' mark is black. A neutral gray near the other brands' OKLCH
    // lightness (0.52 to 0.68, mean 0.605; a touch above, since gray reads
    // darker than color at the same L) keeps it level with them in both
    // themes, where black or white would stand out.
    color: "oklch(0.66 0 0)",
    iconPath:
      "M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z",
  },
  // Meta's Threads API figures (the app's own aren't published): MP4 or MOV up to 1 GB and 5
  // minutes; a carousel of up to 20 photos and videos, mixed.
  video: {
    types: ["video/mp4", "video/quicktime"],
    typeLabel: "MP4 or MOV",
    maxBytes: 1e9,
    maxSeconds: 300,
    perPost: 20,
    mixes: true,
  },
  compose: {
    text: "prefill",
    image: "paste",
    thread: "add-post",
    alt: "The image's ... menu, then Add alt text",
    tips: ["Pressing Escape in the composer asks whether to save a draft."],
    // Threads runs under Instagram's terms, which bar automated access without permission.
    agent: "open",
    terms: "https://help.instagram.com/581066165581870",
  },
  open: {
    label: "Open Prefilled",
    url: (firstChunk) => `https://www.threads.com/intent/post?text=${encodeURIComponent(firstChunk)}`,
  },
  // The app has a share extension (built on Instagram's) that takes text, links and images;
  // closed source, and not confirmed on a phone that text and images arrive together.
  share: { note: "Share sends the text and images to the Threads app. Check both arrived; the text is copied in case." },
};
