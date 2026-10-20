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
  brand: PlatformBrand;
  breakpoints?: Breakpoint[];
  /** Why a single post can't be published as is (beyond its length), or null. */
  problems?: (post: string) => string | null;
  /** A post can't go out without a photo or video (Instagram). */
  needsImage?: boolean;
  /** A button that opens the platform to post, given the first post's text. */
  open: { label: string; url: (firstChunk: string) => string };
};
