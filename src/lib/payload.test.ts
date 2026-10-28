import { describe, expect, it } from "vitest"

import { bluesky } from "@/lib/adapters/bluesky"
import { instagram } from "@/lib/adapters/instagram"
import { linkedin } from "@/lib/adapters/linkedin"
import { mastodon } from "@/lib/adapters/mastodon"
import { x } from "@/lib/adapters/x"
import { buildPayload, payloadJson, PAYLOAD_VERSION, POSTING, type PayloadImage, type PlatformInput } from "@/lib/payload"

const IMAGES: PayloadImage[] = [
  { index: 1, id: "i1", name: "one.png", mime: "image/png", bytes: 10, video: false, altText: "A cat" },
  { index: 2, id: "i2", name: "two.png", mime: "image/png", bytes: 20, video: false, altText: null },
]

const platform = (over: Partial<PlatformInput> & Pick<PlatformInput, "adapter">): PlatformInput => ({
  enabled: true,
  posted: false,
  posts: ["First", "Second"],
  media: [],
  needs: { posts: over.posts ?? ["First", "Second"], media: [], alts: [], tags: [] },
  marks: {},
  problem: null,
  ...over,
})

const build = (...platforms: PlatformInput[]) =>
  buildPayload({ app: "1.4.0", guide: "/crosspost/assistants", draft: "First Second", images: IMAGES, platforms })

describe("buildPayload", () => {
  it("carries the version, the app's release, who decides to post, the guide, the draft and the tray", () => {
    const p = build()
    expect(p).toMatchObject({
      version: PAYLOAD_VERSION,
      app: "1.4.0",
      posting: POSTING,
      guide: "/crosspost/assistants",
      draft: "First Second",
      images: IMAGES,
    })
    expect(POSTING).toMatch(/never posts on its own/)
  })

  it("puts each image on its post, by tray number, and splits threads as given", () => {
    const media = [
      { id: "i1", n: 1, post: 0, altKey: "i1:k" },
      { id: "i2", n: 2, post: 1 },
    ]
    const [b] = build(
      platform({ adapter: bluesky, media, needs: { posts: ["First", "Second"], media: ["i1", "i2"], alts: ["i1:k"], tags: [] } }),
    ).platforms
    expect(b.posts.map((post) => post.images)).toEqual([[1], [2]])
    expect(b.posts.map((post) => post.index)).toEqual([1, 2])
  })

  it("moves images on a post that no longer exists to the last one, and keeps a single-post platform's on it", () => {
    const media = [{ id: "i2", n: 2, post: 3 }]
    const [b] = build(platform({ adapter: bluesky, media })).platforms
    expect(b.posts[1].images).toEqual([2])
    const [l] = build(platform({ adapter: linkedin, posts: ["All of it"], media: [{ id: "i2", n: 2, post: 1 }] })).platforms
    expect(l.posts[0].images).toEqual([2])
  })

  it("names clips by their numbers on the card", () => {
    const media = [{ id: "v1#1", n: "1.1", post: 0 }, { id: "v1#2", n: "1.2", post: 1 }]
    const [b] = build(platform({ adapter: bluesky, media })).platforms
    expect(b.posts.map((post) => post.images)).toEqual([["1.1"], ["1.2"]])
  })

  it("carries posts as edited on the card, counted the platform's way", () => {
    const [b] = build(platform({ adapter: bluesky, posts: ["Edited 🙂"] })).platforms
    expect(b.posts).toEqual([{ index: 1, text: "Edited 🙂", count: 8, images: [], done: false }])
  })

  it("reports progress per post, image, alt text and tags", () => {
    const media = [{ id: "i1", n: 1, post: 0, altKey: "i1:k" }]
    const [b] = build(
      platform({
        adapter: bluesky,
        media,
        needs: { posts: ["First", "Second"], media: ["i1"], alts: ["i1:k"], tags: ["@a"] },
        marks: { copiedPosts: ["First"], copiedAlts: ["i1:k"] },
      }),
    ).platforms
    expect(b.posts.map((post) => post.done)).toEqual([true, false])
    expect(b.progress).toEqual({
      steps: 5,
      done: 2,
      complete: false,
      media: [{ image: 1, done: false }],
      alts: [{ image: 1, done: true }],
      tags: { tags: ["@a"], done: false },
    })
  })

  it("opens X's regular composer, not prefilled, once there are images", () => {
    const [plain] = build(platform({ adapter: x })).platforms
    expect(plain.open).toMatchObject({ prefilled: true, url: expect.stringContaining("intent/post?text=First") })
    const [media] = build(platform({ adapter: x, media: [{ id: "i1", n: 1, post: 0 }] })).platforms
    expect(media.open).toEqual({ label: "Open", url: "https://x.com/compose/post", prefilled: false })
  })

  it("opens Mastodon on the person's server, and says Instagram's link isn't prefilled", () => {
    const [m, ig] = build(
      platform({ adapter: mastodon, server: "fosstodon.org" }),
      platform({ adapter: instagram, posts: ["Caption"] }),
    ).platforms
    expect(m.open?.url).toBe("https://fosstodon.org/share?text=First")
    expect(m.compose.thread).toBe("reply")
    expect(ig.open?.prefilled).toBe(false)
    expect(ig.compose.image).toBe("file")
    expect(ig.needsImage).toBe(true)
  })

  it("has no Open link with nothing to post", () => {
    expect(build(platform({ adapter: bluesky, posts: [] })).platforms[0].open).toBeNull()
  })
})

describe("payloadJson", () => {
  it("can't close the script element it sits in", () => {
    const p = buildPayload({ app: "", guide: "", draft: "</script><b>", images: [], platforms: [] })
    const json = payloadJson(p)
    expect(json).not.toContain("</script>")
    expect(JSON.parse(json).draft).toBe("</script><b>")
  })
})
