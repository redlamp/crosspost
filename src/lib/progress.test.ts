import { describe, expect, it } from "vitest"

import { cardProgress, type CardNeeds } from "@/lib/progress"

const needs = (over: Partial<CardNeeds> = {}): CardNeeds => ({ posts: ["a", "b"], media: [], alts: [], tags: [], ...over })

describe("cardProgress", () => {
  it("counts a step per post, image or video, and alt text, and one for all the tags", () => {
    expect(cardProgress(needs(), {}).steps).toBe(2)
    expect(cardProgress(needs({ media: ["i1", "v1"] }), {}).steps).toBe(4)
    expect(cardProgress(needs({ media: ["i1"], alts: ["i1:x"] }), {}).steps).toBe(4)
    expect(cardProgress(needs({ tags: ["@a", "@b"] }), {}).steps).toBe(3)
  })

  it("completes once the last step is ticked, whichever it is", () => {
    const n = needs({ media: ["i1"], alts: ["i1:x"], tags: ["@a"] })
    const most = { copiedPosts: ["a", "b"], copiedImages: ["i1"], checkedTags: ["@a"] }
    expect(cardProgress(n, most).complete).toBe(false)
    expect(cardProgress(n, most).done).toBe(4)
    const all = cardProgress(n, { ...most, copiedAlts: ["i1:x"] })
    expect(all).toMatchObject({ steps: 5, done: 5, complete: true, tags: true })
  })

  it("undoes a step taken back", () => {
    const n = needs()
    expect(cardProgress(n, { copiedPosts: ["a", "b"] }).complete).toBe(true)
    expect(cardProgress(n, { copiedPosts: ["b"] })).toMatchObject({ complete: false, posts: [false, true] })
  })

  it("keys alt text by its text, so changed alt text is a step again", () => {
    expect(cardProgress(needs({ alts: ["i1:new"] }), { copiedAlts: ["i1:old"] }).alts).toEqual({ "i1:new": false })
  })

  it("never completes a card with nothing to post", () => {
    expect(cardProgress(needs({ posts: [] }), {})).toMatchObject({ steps: 0, complete: false })
  })

  it("reads a post as not done once its text changes", () => {
    expect(cardProgress(needs({ posts: ["a edited", "b"] }), { copiedPosts: ["a", "b"] }).posts).toEqual([false, true])
  })

  it("starts over when the marks are cleared", () => {
    const n = needs({ media: ["i1"] })
    expect(cardProgress(n, { copiedPosts: ["a", "b"], copiedImages: ["i1"] }).complete).toBe(true)
    expect(cardProgress(n, {}).done).toBe(0)
  })
})
