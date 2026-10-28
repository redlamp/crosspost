import type { PlatformAdapter } from "@/lib/adapters"
import type { ComposeFacts } from "@/lib/adapters/types"
import { cardProgress, type CardMarks, type CardNeeds } from "@/lib/progress"

// The page's current draft as data, for a browser assistant helping the person post it: in the
// page as <script type="application/json" id="crosspost-payload"> and from
// window.crosspost.getPayload(). Read-only; documented on /assistants. Crosspost doesn't post on its own.

/** Bump when a field changes meaning or goes away; adding fields doesn't. */
export const PAYLOAD_VERSION = 1

/**
 * Who decides that a post goes out, in the payload and the guide's first lines. Added after an
 * assistant asked to "post to the platforms" posted a test draft on six of them: the person often
 * wants to see the composer first, or only wanted the draft, and nothing in the page says so.
 */
export const POSTING =
  "The person decides whether and when each post goes out. They may want to see it in the composer first, or may only have wanted a draft, so posting waits for their word. Crosspost never posts on its own."

export type PayloadImage = {
  /** Its number in the Compose tray, as on the thumbnails and in `data-image`. */
  index: number
  id: string
  name: string
  mime: string
  bytes: number
  video: boolean
  altText: string | null
}

export type PayloadPost = {
  /** 1-based place in the thread. */
  index: number
  /** The post as it goes out, edits and any " 1/3" label in. */
  text: string
  /** Its length the way this platform counts. */
  count: number
  /** Its images and videos, by number ("1.2" is video 1's second clip on this platform). */
  images: (number | string)[]
  /** Copied, opened prefilled or ticked by hand. */
  done: boolean
}

export type PayloadPlatform = {
  id: string
  name: string
  /** Turned on in the rail; off means not posting there this time. */
  enabled: boolean
  /** Marked posted, by hand or once every step was done. */
  posted: boolean
  limit: number
  countNote: string
  posts: PayloadPost[]
  /** The card's Open button. `prefilled` says whether the page arrives with the first post in it. */
  open: { label: string; url: string; prefilled: boolean } | null
  /** How the platform's composer takes text, images, alt text and later posts. */
  compose: ComposeFacts
  /** What would stop it going out as is (a post too long, a video it won't take), or null. */
  problem: string | null
  needsImage: boolean
  progress: {
    steps: number
    done: number
    complete: boolean
    media: { image: number | string; done: boolean }[]
    alts: { image: number | string; done: boolean }[]
    /** The @tags to confirm are right on this platform, or null when there are none. */
    tags: { tags: string[]; done: boolean } | null
  }
}

export type Payload = {
  version: typeof PAYLOAD_VERSION
  /** The app's release (package.json). */
  app: string
  /** Who decides that a post goes out (POSTING). */
  posting: string
  /** The guide (/assistants) as a path on this site: what an agent may do where, and the steps for each platform. */
  guide: string
  draft: string
  images: PayloadImage[]
  /** The platforms shown, in the rail's order. */
  platforms: PayloadPlatform[]
}

/** One image or video on a platform's card. */
export type PlatformMedia = { id: string; n: number | string; post: number; altKey?: string }

export type PlatformInput = {
  adapter: PlatformAdapter
  enabled: boolean
  posted: boolean
  posts: string[]
  /** The server for platforms that need one (Mastodon). */
  server?: string
  /** The card's images and videos in its order, those left off it out. */
  media: PlatformMedia[]
  needs: CardNeeds
  marks: CardMarks
  problem: string | null
}

export type PayloadInput = {
  app: string
  guide: string
  draft: string
  images: PayloadImage[]
  platforms: PlatformInput[]
}

/** The payload from what the composer computes. Pure: no storage, no DOM. */
export function buildPayload(input: PayloadInput): Payload {
  return {
    version: PAYLOAD_VERSION,
    app: input.app,
    posting: POSTING,
    guide: input.guide,
    draft: input.draft,
    images: input.images,
    platforms: input.platforms.map((p): PayloadPlatform => {
      const { adapter, posts, media } = p
      const steps = cardProgress(p.needs, p.marks)
      // An image on a post that no longer exists goes with the last one, as on the card.
      const postOf = (m: PlatformMedia) => (adapter.chain && posts.length > 1 ? Math.min(m.post, posts.length - 1) : 0)
      const plain = media.length > 0 ? adapter.open.withMedia : undefined
      return {
        id: adapter.id,
        name: adapter.name,
        enabled: p.enabled,
        posted: p.posted,
        limit: adapter.limit,
        countNote: adapter.countNote,
        posts: posts.map((text, i) => ({
          index: i + 1,
          text,
          count: adapter.count(text),
          images: media.filter((m) => postOf(m) === i).map((m) => m.n),
          done: steps.posts[i],
        })),
        open: !posts.length
          ? null
          : plain
            ? { label: plain.label, url: plain.url, prefilled: false }
            : {
                label: adapter.open.label,
                url: adapter.open.url(posts[0], p.server),
                prefilled: adapter.compose.text === "prefill",
              },
        compose: adapter.compose,
        problem: p.problem,
        needsImage: !!adapter.needsImage && posts.length > 0 && media.length === 0,
        progress: {
          steps: steps.steps,
          done: steps.done,
          complete: steps.complete,
          media: media.map((m) => ({ image: m.n, done: steps.media[m.id] ?? false })),
          alts: media.filter((m) => m.altKey).map((m) => ({ image: m.n, done: steps.alts[m.altKey!] ?? false })),
          tags: steps.tags === null ? null : { tags: [...p.needs.tags], done: steps.tags },
        },
      }
    }),
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** The payload as the page carries it: JSON safe inside a <script> element. */
export const payloadJson = (payload: Payload) => JSON.stringify(payload).replace(/</g, "\\u003c")

/** One tray image or video as a data URL, for a tool that hands it to a composer as a file. */
export type PayloadFile = { name: string; type: string; dataUrl: string }

export type CrosspostApi = {
  /** The payload as it stands now. */
  getPayload(): Payload
  /** Tray image or video `index` (1-based, as in `images`), or null when there's none. Read-only. */
  getImage(index: number): Promise<PayloadFile | null>
  readonly version: typeof PAYLOAD_VERSION
}

declare global {
  interface Window {
    /** Crosspost's read-only page API (see /assistants); there while the composer is on the page. */
    crosspost?: CrosspostApi
  }
}
