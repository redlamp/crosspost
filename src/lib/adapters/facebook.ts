import { findUrls } from "@/lib/text";

import type { PlatformAdapter } from "./types";

export const facebook: PlatformAdapter = {
  id: "facebook",
  name: "Facebook",
  limit: 63206,
  count: (text) => text.length,
  chain: false,
  countNote: "Counts characters; an emoji counts as 2 (assumed: Facebook doesn't say)",
  launched: "2004-02",
  // Meta, January 2025: more than 3 billion monthly.
  users: { millions: 3050, label: "3B+" },
  brand: {
    color: "#0866FF",
    whiteGlyph: "circle",
    iconPath:
      "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  },
  // Meta doesn't publish these; they're the widely reported figures.
  breakpoints: [
    {
      limit: 130,
      // Facebook's own name for it in the composer (desktop: "Add background").
      label: "Background color",
      within: "Available",
      beyond: "Plain text only",
      approximate: true,
      blockedBy: (text) => (findUrls(text).length > 0 ? "Not with a link" : null),
    },
    {
      limit: 480,
      label: "Shown in full",
      within: "No “See more”",
      beyond: "Cut off at “See more”",
      approximate: true,
    },
  ],
  // Meta's video requirements (written for Pages; nothing separate for personal posts): up to
  // 10 GB and 240 minutes, MP4 and MOV recommended, most containers taken. Photos and videos mix.
  video: {
    types: ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/x-msvideo", "video/mpeg", "video/x-m4v"],
    typeLabel: "MP4, MOV, WebM, MKV, AVI or MPEG",
    maxBytes: 10e9,
    maxSeconds: 240 * 60,
    perPost: 10,
    mixes: true,
  },
  open: { label: "Open Facebook", url: () => "https://www.facebook.com/" },
  // Meta's policy: nothing may prefill a Facebook post, so its app drops shared text and keeps
  // only the images. Share copies the text for pasting instead.
  share: { dropsText: true, note: "Share sends the images to the Facebook app, which drops shared text; the text is copied to paste in." },
};
