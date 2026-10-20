import { describe, expect, it } from "vitest"

import { reorder } from "./images"

describe("reorder", () => {
  const ids = ["a", "b", "c", "d"]

  it("moves an image before or after another", () => {
    expect(reorder(ids, "d", "b", false)).toEqual(["a", "d", "b", "c"])
    expect(reorder(ids, "a", "c", true)).toEqual(["b", "c", "a", "d"])
    expect(reorder(ids, "a", "d", true)).toEqual(["b", "c", "d", "a"])
  })

  it("leaves the order alone for a drop on itself or an unknown id", () => {
    expect(reorder(ids, "b", "b", true)).toBe(ids)
    expect(reorder(ids, "x", "b", true)).toBe(ids)
    expect(reorder(ids, "b", "x", true)).toBe(ids)
  })
})
