import type { PlatformAdapter } from "./types";

export const linkedin: PlatformAdapter = {
  id: "linkedin",
  name: "LinkedIn",
  limit: 3000,
  count: (text) => text.length,
  chain: false,
  countNote: "Counts characters; an emoji counts as 2. No threads: shorten to fit",
  launched: "2003-05",
  // The commonly cited monthly figure; LinkedIn reports members (1B+), a different measure.
  users: { millions: 310, label: "~310M" },
  brand: {
    color: "#0A66C2",
    whiteGlyph: "square",
    iconPath:
      "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
  // LinkedIn's help (a548372): 75 KB to 5 GB, 3 seconds to 15 minutes, most containers. One
  // video a post, and no images beside it.
  video: {
    types: [
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "video/x-matroska",
      "video/x-msvideo",
      "video/x-ms-wmv",
      "video/mpeg",
      "video/x-m4v",
    ],
    typeLabel: "MP4, MOV, WebM, MKV, AVI, WMV or MPEG",
    maxBytes: 5e9,
    maxSeconds: 900,
    minSeconds: 3,
    perPost: 1,
    mixes: false,
  },
  compose: {
    text: "prefill",
    image: "file",
    thread: "none",
    alt: "ALT in the media editor, after adding the image",
    tips: [
      "A link in the post makes a link card, which hides the Media button. Remove the card (its X) to bring Media back; the image replaces the card anyway.",
      "Pasted images are ignored. Add the saved file with Media.",
    ],
    // The User Agreement (8.2) bars bots and automated methods for creating or sharing posts.
    agent: "open",
    terms: "https://www.linkedin.com/legal/user-agreement",
  },
  open: {
    label: "Open Prefilled",
    // LinkedIn's share link; undocumented, but it opens the composer with the text.
    url: (text) => `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`,
  },
  // The app's share extension takes a link or text, and images; whether it keeps the text
  // alongside several images isn't documented.
  share: { note: "Share sends the text and images to the LinkedIn app. Check both arrived." },
};
