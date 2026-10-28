import { xWeightedLength } from "@/lib/text";

import type { PlatformAdapter } from "./types";

export const twitter: PlatformAdapter = {
  id: "twitter",
  name: "Twitter",
  limit: 280,
  count: xWeightedLength,
  chain: true,
  maxImages: 4,
  countNote: "Links count as 23; CJK and emoji as 2",
  launched: "2006-07",
  // Aggregator estimates (611M to 660M, 2026); X no longer publishes figures.
  users: { millions: 600, label: "~600M" },
  // The classic bird, for anyone who'd rather see it: off by default, since X (./x.ts) is
  // the same service under its current name and shows instead. The intent URL is X's.
  brand: {
    color: "#1DA1F2",
    iconPath:
      "M21.543 7.104c.015.211.015.423.015.636 0 6.507-4.954 14.01-14.01 14.01v-.003A13.94 13.94 0 0 1 0 19.539a9.88 9.88 0 0 0 7.287-2.041 4.93 4.93 0 0 1-4.6-3.42 4.916 4.916 0 0 0 2.223-.084A4.926 4.926 0 0 1 .96 9.167v-.062a4.887 4.887 0 0 0 2.235.616A4.928 4.928 0 0 1 1.67 3.148 13.98 13.98 0 0 0 11.82 8.292a4.929 4.929 0 0 1 8.39-4.49 9.868 9.868 0 0 0 3.128-1.196 4.941 4.941 0 0 1-2.165 2.724A9.828 9.828 0 0 0 24 4.555a10.019 10.019 0 0 1-2.457 2.549z",
  },
  // A free account: MP4 or MOV up to 512 MB and 2 minutes 20 seconds. The composer mixes photos
  // and videos, 4 in all (the API doesn't). Premium posts up to 4 hours and 16 GB (on the web
  // and iOS; 10 minutes on Android).
  video: {
    types: ["video/mp4", "video/quicktime"],
    typeLabel: "MP4 or MOV",
    maxBytes: 512e6,
    maxSeconds: 140,
    minSeconds: 0.5,
    perPost: 4,
    mixes: true,
    upgrade: { label: "Premium", maxSeconds: 4 * 3600, maxBytes: 16e9 },
  },
  compose: {
    text: "prefill",
    image: "paste",
    thread: "add-post",
    alt: "Add description, under the image",
    tips: ["The prefilled page drops images and later posts once alt text is saved."],
    // The automation rules bar non-API automation, such as scripting the website, and warn of suspension.
    agent: "open",
    terms: "https://help.x.com/en/rules-and-policies/x-automation",
  },
  open: {
    label: "Open Prefilled",
    url: (firstChunk) => `https://x.com/intent/post?text=${encodeURIComponent(firstChunk)}`,
    // The intent page clears its composer (images, later posts) once alt text is saved; the
    // regular composer keeps everything but takes no text, so the text goes on the clipboard.
    withMedia: {
      label: "Open",
      url: "https://x.com/compose/post",
      note: "X's prefilled page drops images when alt text is added, so this opens the regular composer. Paste the text in.",
    },
  },
  // The X app's share extension ("Post to X") takes text, links and images, 4 at most as in
  // its composer; closed source, widely reported, not confirmed on a phone.
  share: { note: "Share sends the text and up to 4 images to the X app. Check both arrived; the text is copied in case." },
  hiddenByDefault: true,
};
