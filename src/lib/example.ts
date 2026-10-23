// The example post, loaded from the welcome card or the empty Compose: a little plug for
// Crosspost that shows it working. Its second paragraph starts a hand-placed split on every
// platform that threads, so there's a marker in Compose to drag; with the link, it runs past
// Bluesky's and X's limits as one post. The site's share image comes along, with its alt text.

const PARAGRAPHS = [
  "Confession: I used to paste the same post into seven apps and fix it seven times. Now I write it once in Crosspost, and it shapes it for Bluesky, Threads, LinkedIn, X, Facebook, Instagram and Mastodon.",
  "No accounts, no passwords, nothing to connect. It runs in the browser, splits long posts into threads, and I copy or open each one myself. My thumbs thank it.",
  "https://redlamp.github.io/crosspost/ #crosspost",
]

export const EXAMPLE_POST = PARAGRAPHS.join("\n\n")

/** Where the example's hand-placed split goes: the start of its second paragraph. */
export const EXAMPLE_SPLIT = EXAMPLE_POST.indexOf(PARAGRAPHS[1])

/** The site's share image (under the base path), with the alt text it's published with. */
export const EXAMPLE_IMAGE = {
  path: "/opengraph-image.jpg",
  name: "crosspost.jpg",
  alt: 'Crosspost: a signpost with a plank pointing to each platform, beside the tagline "One post, every destination."',
}
