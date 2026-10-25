import { describe, expect, it } from "vitest"

import { TOUR_PLACES, tourPlace } from "./tour-steps"

describe("tourPlace", () => {
  it("names Draft's tabs, then each later step whatever its tab", () => {
    expect([0, 1, 2].map((part) => tourPlace(0, part))).toEqual(["write", "split", "images"])
    expect([1, 2, 3].map((step) => tourPlace(step, 2))).toEqual(["decide", "deliver", "done"])
  })

  it("round-trips every place a link can open", () => {
    for (const { name, step, part } of TOUR_PLACES) expect(tourPlace(step, part)).toBe(name)
  })
})
