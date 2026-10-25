// Anonymous usage counts through GoatCounter: page views, an event each time a post goes out
// to a platform, and the use of the welcome card, the tour, and the media editor. No cookies and
// nothing personal: only an event's name is sent, never a post's text or images. GoatCounter's
// script skips localhost, so development isn't counted. The event list, naming, and how to add
// and check one are in docs/spec.md, under Analytics.

/** The GoatCounter site the counts land in (its dashboard is redlamp.goatcounter.com). */
export const GOATCOUNTER_URL = "https://redlamp.goatcounter.com/count"
/** GoatCounter's script, loaded after the page is interactive (see `src/app/layout.tsx`). */
export const GOATCOUNTER_SCRIPT = "https://gc.zgo.at/count.js"

type GoatCounter = { count?: (vars: { path: string; title?: string; event?: boolean }) => void }

declare global {
  interface Window {
    goatcounter?: GoatCounter
  }
}

/** Count one event by name, as `tour/start-here/take-the-tour`. Quiet when blocked. */
export function track(name: string) {
  try {
    window.goatcounter?.count?.({ path: name, title: name, event: true })
  } catch {
    // An ad blocker or a failed load leaves nothing to count with; the app carries on.
  }
}

/**
 * Ways a post leaves for a platform: copied, opened prefilled, handed to the share sheet, or
 * the platform marked posted once everything on its card went out.
 */
export type DeliveryEvent = "copy" | "open" | "share" | "posted"

/** Count one delivery on one platform, as `copy/bluesky` and the like. */
export function trackDelivery(event: DeliveryEvent, platformId: string) {
  track(`${event}/${platformId}`)
}

/** Where the welcome card was when it was used: above Compose on a first visit, or below it after. */
export const welcomePlace = (first: boolean) => (first ? "start-here" : "how-it-works")

/** The day counting began (2026-10-25): the footer's count starts here, so it covers every visit. */
const COUNT_START = "2026-10-25"

/**
 * The home page's view count, from GoatCounter's public counter (its site setting "Allow
 * adding visitor counts on your website" must be on). Null when it can't be had: blocked,
 * turned off, or a path with no visits yet, as on localhost. Fetched once per page load; the
 * footer, which shows it, is on the page twice.
 */
export function fetchViewCount(): Promise<number | null> {
  viewCount ??= (async () => {
    // The path as GoatCounter records it: the base path with no trailing slash (`/crosspost`),
    // or `/` with none. The counter wants it exactly, or answers "not found".
    const path = encodeURIComponent(process.env.NEXT_PUBLIC_BASE_PATH || "/")
    try {
      // From the day counting began, so all time. GoatCounter caches each answer for up to four
      // hours by its address; the date gave a fresh one when a "not found" for the plain address
      // was stuck there, and changing it is how to get past a stale answer again.
      const res = await fetch(GOATCOUNTER_URL.replace(/\/count$/, `/counter/${path}.json?start=${COUNT_START}`))
      if (!res.ok) return null
      // The count comes formatted ("1,234"), so only its digits are kept.
      const { count } = (await res.json()) as { count?: string | number }
      const digits = String(count ?? "").replace(/\D/g, "")
      return digits ? Number(digits) : null
    } catch {
      return null
    }
  })()
  return viewCount
}
let viewCount: Promise<number | null> | undefined
