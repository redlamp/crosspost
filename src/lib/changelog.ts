/** A release, for the changelog opened from the footer's version: the high-level changes only. */
export type Release = {
  version: string
  /** The working day it went out ("YYYY-MM-DD"). */
  date: string
  changes: string[]
}

/** Newest first. The first entry's version matches package.json (a test checks). */
export const CHANGELOG: Release[] = [
  {
    version: "1.1.0",
    date: "2026-10-22",
    changes: [
      "An introduction: Draft, Decide and Deliver.",
      "Drag platforms to reorder them, or below the line to turn them off.",
      "Edit any post on its card.",
      "Platforms mark themselves posted once everything is copied, and the next one scrolls into view.",
      "Alt text and cropping for images, and up to 10 in Compose.",
      "A warning when a post has more images than Bluesky, X or Mastodon take.",
      "Tags to check, above each post that has them.",
      "Install it as an app: it opens offline, and on Android takes shared posts.",
      "A Compose button in the phone layout's platform row.",
      "A new theme switch, and Clear Data in Settings.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-10-21",
    changes: [
      "Write once, then copy or open it on Bluesky, Threads, LinkedIn, X, Facebook, Instagram and Mastodon.",
      "Long posts split into threads, with splits you can drag.",
      "Images to copy, drag or download into each post.",
      "Counts and limits for each platform, with warnings in the status rail.",
      "Settings to show, hide and sort platforms.",
      "Everything stays in your browser: no accounts, no server.",
    ],
  },
]
