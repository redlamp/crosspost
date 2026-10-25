import { describe, expect, it } from "vitest"

import { bluesky } from "@/lib/adapters/bluesky"
import { instagram } from "@/lib/adapters/instagram"
import { x } from "@/lib/adapters/x"
import {
  addSplit,
  clipCap,
  clipsFor,
  groupMarks,
  moveSplit,
  removeSplit,
  sameSplits,
  sharedSplits,
  snapTo,
  splitMarks,
} from "@/lib/video-splits"

const whole = { start: 0, end: 150 }

describe("clip caps", () => {
  it("use a lone video's cap while it fits, the carousel's once it's split or shares a post", () => {
    expect(clipCap(instagram, 120, { withOthers: false, handSplit: false })).toBe(900)
    expect(clipCap(instagram, 120, { withOthers: true, handSplit: false })).toBe(60)
    expect(clipCap(instagram, 120, { withOthers: false, handSplit: true })).toBe(60)
    expect(clipCap(instagram, 1200, { withOthers: false, handSplit: false })).toBe(60)
    expect(clipCap(x, 150, { withOthers: false, handSplit: false })).toBe(140)
  })
})

describe("clips", () => {
  it("split where the limit needs it", () => {
    expect(clipsFor(whole, 140, [])).toEqual([
      { start: 0, end: 75 },
      { start: 75, end: 150 },
    ])
    expect(clipsFor(whole, 600, [])).toEqual([whole])
  })

  it("keep hand-placed splits, the limit filling in around them", () => {
    expect(clipsFor(whole, 60, [60])).toEqual([
      { start: 0, end: 60 },
      { start: 60, end: 105 },
      { start: 105, end: 150 },
    ])
    expect(clipsFor(whole, undefined, [50, 100])).toHaveLength(3)
  })

  it("ignore splits outside the kept part or at its ends", () => {
    expect(clipsFor({ start: 20, end: 80 }, undefined, [10, 20.1, 50, 90])).toEqual([
      { start: 20, end: 50 },
      { start: 50, end: 80 },
    ])
  })

  it("mark where each clip starts, and whether by hand", () => {
    expect(splitMarks(clipsFor(whole, 60, [60]), [60])).toEqual([
      { t: 60, index: 2, manual: true },
      { t: 105, index: 3, manual: false },
    ])
  })
})

describe("placing splits", () => {
  it("adds, moves and removes hand-placed splits", () => {
    expect(addSplit([], 60, whole)).toEqual([60])
    expect(addSplit([60], 60.01, whole)).toEqual([60])
    expect(addSplit([], 149.9, whole)).toEqual([149.5])
    expect(moveSplit([60], 60, 70, whole)).toEqual([70])
    // Moving one the limit placed makes it a hand-placed one.
    expect(moveSplit([60], 105, 110, whole)).toEqual([60, 110])
    expect(removeSplit([60, 110], 110)).toEqual([60])
  })

  it("never lets a platform's splits merge or come closer than half a second", () => {
    // Nudged a frame at a time toward its neighbor, it stops short rather than merge into it.
    expect(moveSplit([10, 20], 10, 19.8, whole)).toEqual([10, 20])
    expect(moveSplit([10, 20], 10, 19.4, whole)).toEqual([19.4, 20])
    expect(addSplit([60], 60.3, whole)).toEqual([60])
  })

  it("doesn't split a part too short for two clips", () => {
    expect(addSplit([], 0.3, { start: 0, end: 0.8 })).toEqual([])
  })

  it("finds Compose's splits as the ones most platforms share", () => {
    const splits = { bluesky: [60], x: [60], instagram: [60, 100] }
    expect(sharedSplits(splits, ["bluesky", "x", "instagram"])).toEqual([60])
    expect(sharedSplits(splits, ["bluesky", "x", "instagram"], "instagram")).toEqual([60])
    expect(sameSplits([60, 100], [100, 60.01])).toBe(true)
  })

  it("pulls a split onto the nearest other split close enough to join", () => {
    expect(snapTo(61, [30, 60, 62.5], 2)).toBe(60)
    expect(snapTo(61.6, [60, 62], 2)).toBe(62)
    expect(snapTo(70, [60], 2)).toBe(70)
  })

  it("groups splits at one time into one mark", () => {
    const groups = groupMarks([
      { id: bluesky.id, marks: [{ t: 60, index: 2, manual: true }] },
      { id: x.id, marks: [{ t: 60, index: 2, manual: true }] },
      { id: instagram.id, marks: [{ t: 60, index: 2, manual: true }, { t: 105, index: 3, manual: false }] },
    ])
    expect(groups.map((g) => [g.t, g.platforms.length])).toEqual([
      [60, 3],
      [105, 1],
    ])
  })
})
