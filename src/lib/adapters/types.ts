import type { Counter } from "@/lib/text";

export type PlatformBrand = {
  /** Brand color for the logo and card tint. Omit for black marks, which follow the theme's text color. */
  color?: string;
  /** Square logo mark as a single SVG path on a 24x24 viewBox. */
  iconPath: string;
  /**
   * For marks whose letters are cut out of a shape (Facebook's f, LinkedIn's
   * in): a white shape drawn underneath, so the letters stay white on any
   * background, as both brand guides require.
   */
  whiteGlyph?: "circle" | "square";
};

/** A length below the hard limit where the platform's behavior changes. */
export type Breakpoint = {
  /** Highest count that still qualifies. */
  limit: number;
  label: string;
  /** Status text when the post qualifies, and when it doesn't. */
  within: string;
  beyond: string;
  /** The platform doesn't publish this number; it's community-measured. */
  approximate?: boolean;
  /** Why the feature is unavailable whatever the length, or null. */
  blockedBy?: (text: string) => string | null;
};

/** The videos a platform's composer takes, posted by hand on a free account. */
export type VideoRules = {
  /** Media types it takes, and how to name them ("MP4 or MOV"). */
  types: string[];
  typeLabel: string;
  /** Omit where the platform doesn't publish one (Instagram's app) or has none (Mastodon's length). */
  maxBytes?: number;
  maxSeconds?: number;
  minSeconds?: number;
  /** A shorter cap for a video in a post with other photos or videos (Instagram's carousel). */
  carouselMaxSeconds?: number;
  /** Videos one post holds. */
  perPost: number;
  /** A video and images can share a post (up to `maxImages` in all, where set). */
  mixes: boolean;
  /** A paid tier that takes more (X Premium), named in the card's message when it would help. */
  upgrade?: { label: string; maxSeconds?: number; maxBytes?: number };
};

/** A platform: how it counts and splits, how it looks, and how to open it to post. */
export type PlatformAdapter = {
  id: string;
  name: string;
  limit: number;
  count: Counter;
  /** Long posts split into several posts (a thread) rather than needing shortening. */
  chain: boolean;
  /**
   * The platform shows each post's position in a thread itself (Bluesky's
   * "1/2" pill), so our " i/n" label is off unless the user overrides it.
   */
  numbersThreads?: boolean;
  /** Short note on the counting rule, shown on the card. */
  countNote: string;
  /** When the platform opened to the public ("YYYY-MM"), for sorting in Settings. */
  launched: string;
  /**
   * Rough monthly active users, for sorting and showing in Settings: a
   * number in millions to sort by, and how to show it ("3B+", "~500M").
   * Rough on purpose: the published figures mix monthly, daily and
   * registered users, and some platforms no longer publish any.
   */
  users: { millions: number; label: string };
  brand: PlatformBrand;
  breakpoints?: Breakpoint[];
  /** Why a single post can't be published as is (beyond its length), or null. */
  problems?: (post: string) => string | null;
  /** A post can't go out without a photo or video (Instagram). */
  needsImage?: boolean;
  /**
   * Most images one post takes, where that's fewer than Compose holds (Bluesky, X and
   * Mastodon: 4), videos included where the platform mixes them. Omit for platforms that
   * take at least as many as Compose.
   */
  maxImages?: number;
  /** What a video has to be for the platform's own composer to take it ("Video" in docs/spec.md). */
  video?: VideoRules;
  /**
   * The platform has no single site: posts go through the user's own server,
   * entered in Settings, or `default` when none is. `open.url` gets it as a
   * host name.
   */
  server?: { default: string };
  /** Starts hidden until the user shows it in Settings (newer or niche platforms). */
  hiddenByDefault?: boolean;
  /** A button that opens the platform to post, given the first post's text (and the server, if it needs one). */
  open: { label: string; url: (firstChunk: string, server?: string) => string };
  /**
   * What the platform's phone app takes from the share sheet, for the card's Share button
   * (text and images together; see "Phone apps and the share sheet" in docs/spec.md).
   */
  share?: {
    /** The app ignores shared text (Meta's apps), so Share copies it to the clipboard instead. */
    dropsText?: boolean;
    /** The app takes at most this many images from the share sheet (Instagram: 1); the rest are added in the app. */
    maxImages?: number;
    /** Shown under the posts on touch screens: what Share hands the app, and what it drops. */
    note: string;
  };
};
