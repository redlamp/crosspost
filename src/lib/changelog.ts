/**
 * One change in a release: a line, or a headline with points under it (a new feature and what
 * comes with it).
 */
export type Change = string | { text: string; items: string[] }

/** A release, for the changelog opened from the footer's version: the high-level changes only. */
export type Release = {
  version: string
  /** The working day it went out ("YYYY-MM-DD"). */
  date: string
  changes: Change[]
}

/** Newest first. The first entry's version matches package.json (a test checks). */
export const CHANGELOG: Release[] = [
  {
    version: "1.3.1",
    date: "2026-10-26",
    changes: [
      "Confirm images and videos by hand.",
      '"Open Prefilled" marks the post as copied when opened through the context menu.',
      "The view count in the footer shows the real number.",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-10-25",
    changes: [
      {
        text: "New feature: Video support!",
        items: [
          "Each platform's video format, size, and length limits, checked on its card.",
          "Crop, trim, and resize right in your browser; nothing is uploaded.",
          "Split a long video into clips for each platform, the way posts split into threads.",
          "A frame-accurate timeline, with keyboard shortcuts.",
        ],
      },
      "One editor for alt text and cropping, with arrows to move between images and videos.",
      "On each card: click to copy an image or download a video, and copy its alt text from below it.",
      "Anonymous usage counts, with no cookies.",
      "A steadier tour, and faster-loading fonts.",
    ],
  },
  {
    version: "1.2.2",
    date: "2026-10-24",
    changes: ["A smoother tour on phones, and a lighter first load.", "Fixes: a stale page after an update, light theme contrast, and tap targets."],
  },
  {
    version: "1.2.1",
    date: "2026-10-23",
    changes: ["Minor display bug fixes."],
  },
  {
    version: "1.2.0",
    date: "2026-10-23",
    changes: [
      {
        text: 'New feature: "Start Here / How it Works" onboarding tour.',
        items: [
          "Improved onboarding flow.",
          "New drawings and animations for every step.",
          "On mobile: the tour's drawings crop in and follow the action.",
        ],
      },
      'New feature: "Try It" loads a sample post.',
      "Share on each post shows on phones and tablets only.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-10-22",
    changes: [
      'New feature: "Introduction" walkthrough of Draft, Decide, and Deliver.',
      "New feature: Reorder platforms from the side rail.",
      "New feature: Customize any platform posts.",
      {
        text: "New feature: Progress tracking for posting steps.",
        items: ["Platforms mark themselves posted once everything is copied.", "The next platform scrolls into view."],
      },
      "New feature: Install as an app on mobile.",
      "Images: alt text, cropping, and up to 10 in Compose.",
      "Tags to check, above each post that has them.",
      "On mobile: a Compose button in the platform row.",
      "A new theme switch, and Clear Data in Settings.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-10-21",
    changes: [
      {
        text: "First release: write once, then copy or open it on Bluesky, Threads, LinkedIn, X, Facebook, Instagram, and Mastodon.",
        items: [
          "Long posts split into threads, with splits you can drag.",
          "Images to copy, drag, or download into each post.",
          "Counts and limits for each platform, with warnings in the status rail.",
        ],
      },
      "Settings to show, hide, and sort platforms.",
      "Everything stays in your browser: no accounts, no server.",
    ],
  },
]

/**
 * Where What's New starts: the newest minor release with its patches (1.3.0 and any 1.3.x after
 * it), shown in full; the releases before it wait behind "Show earlier versions".
 */
export function splitLatest(releases: Release[]): { latest: Release[]; earlier: Release[] } {
  const minor = (v: string) => v.split(".").slice(0, 2).join(".")
  const current = releases[0] ? minor(releases[0].version) : ""
  const at = releases.findIndex((r) => minor(r.version) !== current)
  return at < 0 ? { latest: releases, earlier: [] } : { latest: releases.slice(0, at), earlier: releases.slice(at) }
}
