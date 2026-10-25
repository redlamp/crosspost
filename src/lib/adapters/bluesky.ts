import { graphemeLength } from "@/lib/text";

import type { PlatformAdapter } from "./types";

export const bluesky: PlatformAdapter = {
  id: "bluesky",
  name: "Bluesky",
  limit: 300,
  count: graphemeLength,
  chain: true,
  numbersThreads: true,
  maxImages: 4,
  countNote: "Counts graphemes; an emoji is 1",
  // The app's first public beta; open to everyone from February 2024.
  launched: "2023-02",
  // 2026 estimates range from under 5M to about 10M monthly; 40M+ registered.
  users: { millions: 7, label: "5–10M" },
  brand: {
    color: "#1185FE",
    iconPath:
      "M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026",
  },
  // Bluesky's video posts (blog, 2024-09; raised to 10 minutes and 300 MB in 2026). A post holds
  // images or one video, never both. Uploading needs a verified email, and there's a daily cap
  // (25 videos or 10 GB at launch).
  video: {
    types: ["video/mp4", "video/mpeg", "video/webm", "video/quicktime"],
    typeLabel: "MP4, MPEG, WebM or MOV",
    maxBytes: 300e6,
    maxSeconds: 600,
    perPost: 1,
    mixes: false,
  },
  open: {
    label: "Open Prefilled",
    url: (firstChunk) => `https://bsky.app/intent/compose?text=${encodeURIComponent(firstChunk)}`,
  },
  // From the app's source: on Android text and images arrive together; on iOS the share
  // extension (modules/Share-with-Bluesky/ShareViewController.swift) handles the first
  // attachment's kind only (text, link, images or a video), so with images along the text is
  // dropped. Share puts the text on the clipboard as well for that.
  share: {
    note: "Share sends the text and images to the Bluesky app. On an iPhone it keeps the images and drops the text, which is copied to paste in.",
  },
};
