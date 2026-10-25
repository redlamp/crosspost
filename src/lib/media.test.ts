import { describe, expect, it } from "vitest"

import { bluesky } from "@/lib/adapters/bluesky"
import { instagram } from "@/lib/adapters/instagram"
import { linkedin } from "@/lib/adapters/linkedin"
import { mastodon } from "@/lib/adapters/mastodon"
import { threads } from "@/lib/adapters/threads"
import { x } from "@/lib/adapters/x"
import { formatBytes, formatDuration, mediaNoun, mediaPerPost, mediaProblem, mediaType, type Media } from "@/lib/media"

type Item = Media & { n: number }

// A file of `size` bytes without allocating it: only its type and size are read.
const blob = (type: string, size = 1000) => ({ type, size }) as Blob
const image = (n: number): Item => ({ n, blob: blob("image/jpeg") })
const video = (n: number, seconds: number | null, type = "video/mp4", size = 10e6): Item => ({
  n,
  blob: blob(type, size),
  video: seconds === null ? null : { duration: seconds, width: 1920, height: 1080 },
})
const check = (adapter: Parameters<typeof mediaProblem>[0], ...posts: Item[][]) =>
  mediaProblem(adapter, posts, (m) => m.n)

describe("media problems", () => {
  it("pass a video each platform takes", () => {
    for (const a of [bluesky, threads, linkedin, x, mastodon, instagram]) expect(check(a, [video(1, 30)])).toBeNull()
  })

  it("keep a video alone where the platform won't mix it with images", () => {
    expect(check(bluesky, [image(1), video(2, 30)])).toMatch(/won't put a video and images in one post/)
    expect(check(mastodon, [image(1), video(2, 30)])).toMatch(/won't put a video/)
    expect(check(linkedin, [image(1), video(2, 30)])).toMatch(/Leave the video off here\./)
    // X's composer mixes them, 4 in all.
    expect(check(x, [image(1), image(2), video(3, 30)])).toBeNull()
    expect(check(x, [image(1), image(2), image(3), video(4, 30), video(5, 30)])).toMatch(/up to 4 photos and videos/)
  })

  it("count videos per post", () => {
    expect(check(bluesky, [video(1, 30), video(2, 30)])).toMatch(/one video a post; this one has 2/)
    // In a thread, the fix is the next post.
    expect(check(bluesky, [video(1, 30), video(2, 30)], [])).toMatch(/^Post 1: .*Move 1 to another post/)
    expect(check(bluesky, [video(1, 30)], [video(2, 30)])).toBeNull()
  })

  it("check format, size and length", () => {
    expect(check(x, [video(1, 30, "video/webm")])).toMatch(/takes MP4 or MOV videos; video 1 is a WEBM file/)
    expect(check(linkedin, [video(1, 30, "video/x-matroska")])).toBeNull()
    expect(check(mastodon, [video(1, 30, "video/mp4", 120e6)])).toMatch(/up to 99 MB; video 1 is 120 MB/)
    expect(check(bluesky, [video(1, 11 * 60)])).toMatch(/up to 10 minutes; video 1 runs 11:00/)
    expect(check(linkedin, [video(1, 2)])).toMatch(/at least 3 seconds; video 1 runs 2 seconds/)
    // Mastodon sets no length.
    expect(check(mastodon, [video(1, 3 * 3600)])).toBeNull()
  })

  it("name a paid tier that would take it", () => {
    expect(check(x, [video(1, 200)])).toMatch(/up to 2 min 20 s; video 1 runs 3:20\. Premium raises it to 4 hours\./)
    expect(check(x, [video(1, 30, "video/mp4", 600e6)])).toMatch(/Premium raises it to 16 GB/)
  })

  it("allow rounding just past a limit", () => {
    expect(check(x, [video(1, 140.4)])).toBeNull()
  })

  it("use Instagram's shorter carousel cap only beside other media", () => {
    expect(check(instagram, [video(1, 120)])).toBeNull()
    expect(check(instagram, [image(1), video(2, 120)])).toMatch(/up to 1 minute in a post with other photos or videos/)
  })

  it("skip the length when the browser couldn't read it", () => {
    expect(check(bluesky, [video(1, null)])).toBeNull()
  })

  it("still count images as before", () => {
    expect(check(bluesky, [1, 2, 3, 4, 5].map(image))).toMatch(/up to 4 images a post; this one has 5\. Leave 1 off here, or split the post/)
    expect(check(bluesky, [1, 2, 3, 4, 5].map(image), [], [])).toMatch(/^Post 1: /)
  })

  it("say it in a few words for the rail", () => {
    expect(mediaProblem(bluesky, [[image(1), video(2, 30)]], (m) => m.n, true)).toBe("Video with images")
    expect(mediaProblem(x, [[video(3, 200)]], (m) => m.n, true)).toBe("Video 3: over 2:20")
  })
})

describe("media helpers", () => {
  it("type untyped video files by name", () => {
    expect(mediaType({ name: "clip.MKV", type: "" })).toBe("video/x-matroska")
    expect(mediaType({ name: "clip.mov", type: "video/quicktime" })).toBe("video/quicktime")
    expect(mediaType({ name: "notes", type: "" })).toBe("")
  })

  it("format lengths, sizes and counts", () => {
    expect(formatDuration(42)).toBe("0:42")
    expect(formatDuration(3725)).toBe("1:02:05")
    expect(formatBytes(512e6)).toBe("512 MB")
    expect(formatBytes(1.5e9)).toBe("1.5 GB")
    expect(mediaNoun(2, 1)).toBe("2 images and a video")
    expect(mediaNoun(0, 2)).toBe("2 videos")
    expect(mediaNoun(1, 0)).toBe("1 image")
  })

  it("group media by post", () => {
    expect(mediaPerPost([1, 2, 3], 2, (n) => (n === 2 ? 1 : 0))).toEqual([[1, 3], [2]])
  })
})
