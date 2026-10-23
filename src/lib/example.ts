// The example post, loaded from the welcome card or the empty Compose: a little plug for
// Crosspost that shows it working. It names no platform (a post that promotes others can be shown
// less). The link closes the first post, so its preview goes with it; the last paragraph starts a
// hand-placed split on every platform that threads, so there's a marker in Compose to drag. As one
// post, it runs past Bluesky's and X's limits. The site's share image comes along, with its alt text.

const PARAGRAPHS = [
  "I used to paste the same post everywhere, then fix it for each platform. Now I draft it once in Crosspost, and it fits each platform's limits, cleverly splitting long posts into threads, or giving me direct control.",
  "https://redlamp.github.io/crosspost/ #crosspost",
  "It runs in my browser with no account needed. It opens each platform with the post ready to go.",
]

export const EXAMPLE_POST = PARAGRAPHS.join("\n\n")

/** Where the example's hand-placed split goes: the start of its last paragraph, after the link. */
export const EXAMPLE_SPLIT = EXAMPLE_POST.indexOf(PARAGRAPHS[2])

/** The site's share image (under the base path), with the alt text it's published with. */
export const EXAMPLE_IMAGE = {
  path: "/opengraph-image.jpg",
  name: "crosspost.jpg",
  alt: 'Crosspost: a signpost with a plank pointing to each platform, beside the tagline "One post, every destination."',
}
