import { describe, expect, it } from "vitest"

import { bluesky } from "@/lib/adapters/bluesky"
import { instagram } from "@/lib/adapters/instagram"
import { linkedin } from "@/lib/adapters/linkedin"
import { mastodon } from "@/lib/adapters/mastodon"
import { threads } from "@/lib/adapters/threads"
import { x } from "@/lib/adapters/x"
import { formatTime, formatTimecode, isWhole, lengthPresets, lockedSpan, moveSpan, setEdge, splitSpan } from "@/lib/trim"
import { AUDIO_BITRATE, estimateBytes, pixelCrop, scaledSize, sizesBelow, targetBitrate } from "@/lib/video-edit"

describe("trim spans", () => {
  it("slide along the video, keeping their length", () => {
    expect(moveSpan({ start: 10, end: 70 }, 20, 200)).toEqual({ start: 30, end: 90 })
    expect(moveSpan({ start: 10, end: 70 }, -50, 200)).toEqual({ start: 0, end: 60 })
    expect(moveSpan({ start: 100, end: 160 }, 100, 200)).toEqual({ start: 140, end: 200 })
  })

  it("move one edge, inside the video and at least half a second long", () => {
    expect(setEdge({ start: 10, end: 70 }, "start", 5, 200)).toEqual({ start: 5, end: 70 })
    expect(setEdge({ start: 10, end: 70 }, "start", 80, 200)).toEqual({ start: 69.5, end: 70 })
    expect(setEdge({ start: 10, end: 70 }, "end", 250, 200)).toEqual({ start: 10, end: 200 })
  })

  it("lock to a length from where they start, pulled back from the end", () => {
    expect(lockedSpan({ start: 30, end: 200 }, 60, 200)).toEqual({ start: 30, end: 90 })
    expect(lockedSpan({ start: 180, end: 200 }, 60, 200)).toEqual({ start: 140, end: 200 })
    expect(lockedSpan({ start: 0, end: 40 }, 60, 40)).toEqual({ start: 0, end: 40 })
  })

  it("know when nothing is trimmed", () => {
    expect(isWhole({ start: 0.02, end: 199.98 }, 200)).toBe(true)
    expect(isWhole({ start: 1, end: 200 }, 200)).toBe(false)
  })

  it("show times to the tenth", () => {
    expect(formatTime(65.24)).toBe("1:05.2")
    expect(formatTime(3725)).toBe("1:02:05.0")
  })
})

describe("length presets", () => {
  const all = [bluesky, threads, linkedin, x, instagram, mastodon]

  it("offer the caps a video runs past, shortest first, with whose they are", () => {
    const presets = lengthPresets(all, 200)
    expect(presets.map((p) => p.seconds)).toEqual([60, 140])
    expect(presets[0].platforms.map((p) => p.label)).toEqual(["Instagram carousel"])
    expect(presets[1].platforms.map((p) => p.label)).toEqual(["X"])
  })

  it("group platforms with the same cap", () => {
    const presets = lengthPresets(all, 3600)
    expect(presets.find((p) => p.seconds === 900)?.platforms.map((p) => p.label)).toEqual(["LinkedIn", "Instagram"])
  })

  it("offer nothing for a video under every cap", () => {
    expect(lengthPresets(all, 30)).toEqual([])
  })
})

describe("pixel crops", () => {
  it("land on even pixels from the edge", () => {
    // Square, centered in 640 by 360.
    expect(pixelCrop({ x: 0.21875, y: 0, w: 0.5625, h: 1 }, 640, 360)).toEqual({ left: 140, top: 0, width: 360, height: 360 })
  })

  it("stay inside an odd-sized frame", () => {
    const c = pixelCrop({ x: 0, y: 0, w: 1, h: 1 }, 641, 361)
    expect(c).toEqual({ left: 0, top: 0, width: 640, height: 360 })
  })
})

describe("video sizes", () => {
  it("offer only the standard sizes below the picture's short side", () => {
    expect(sizesBelow(1920, 1080)).toEqual([720, 480])
    expect(sizesBelow(2160, 3840)).toEqual([1080, 720, 480])
    expect(sizesBelow(640, 360)).toEqual([])
  })

  it("scale by the short side, in even pixels, never up", () => {
    expect(scaledSize(608, 1080, 480)).toEqual({ width: 480, height: 852 })
    expect(scaledSize(3840, 2160, 1080)).toEqual({ width: 1920, height: 1080 })
    expect(scaledSize(640, 360, 720)).toEqual({ width: 640, height: 360 })
  })
})

describe("bitrates and size estimates", () => {
  // A minute of 1080p at 20 Mbps, as a phone records it.
  const phone = { bytes: (20_000_000 + AUDIO_BITRATE) * 60 / 8, duration: 60, width: 1920, height: 1080 }

  it("use Mediabunny's high quality for the size, below a generous source", () => {
    const full = targetBitrate({ width: 1920, height: 1080 }, phone)
    expect(full).toBeGreaterThan(5_000_000)
    expect(full).toBeLessThan(7_000_000)
    expect(targetBitrate({ width: 1280, height: 720 }, phone)).toBeLessThan(full / 2)
  })

  it("never spend more per pixel than the source does", () => {
    const lean = { ...phone, bytes: (1_000_000 + AUDIO_BITRATE) * 60 / 8 }
    expect(targetBitrate({ width: 1920, height: 1080 }, lean)).toBe(1_000_000)
  })

  it("estimate bytes from bitrate and length, audio included, leaning 10% high", () => {
    expect(estimateBytes(1_000_000, 8)).toBeCloseTo((1.1 * (1_000_000 + AUDIO_BITRATE) * 8) / 8)
  })
})

describe("splitting", () => {
  it("cuts into the fewest equal parts under the cap", () => {
    expect(splitSpan({ start: 0, end: 150 }, 60)).toEqual([
      { start: 0, end: 50 },
      { start: 50, end: 100 },
      { start: 100, end: 150 },
    ])
    expect(splitSpan({ start: 10, end: 130 }, 60)).toEqual([
      { start: 10, end: 70 },
      { start: 70, end: 130 },
    ])
  })

  it("keeps a span that already fits, or barely runs over, whole", () => {
    expect(splitSpan({ start: 0, end: 60.3 }, 60)).toEqual([{ start: 0, end: 60.3 }])
  })
})

describe("timecode", () => {
  it("writes minutes, seconds and frames, to the nearest frame", () => {
    expect(formatTimecode(49.5, 30)).toBe("0:49:15")
    expect(formatTimecode(61.7, 30)).toBe("1:01:21")
    expect(formatTimecode(0.0666, 15)).toBe("0:00:01")
    expect(formatTimecode(150, 29.97)).toBe("2:30:00")
    expect(formatTimecode(3725, 24)).toBe("1:02:05:00")
  })
})
