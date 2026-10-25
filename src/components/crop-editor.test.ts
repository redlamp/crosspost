import { describe, expect, it } from "vitest"

import { adjusted } from "@/components/crop-editor"

describe("crop frame moves", () => {
  const frame = { x: 0.1, y: 0.1, w: 0.4, h: 0.4 }

  it("resize a held shape from either side's move", () => {
    // Square (in fractions of a square picture): Shift with down grows it, keeping the shape.
    const down = adjusted("se", frame, 0, 0.1, 1)!
    expect(down.h).toBeCloseTo(0.5)
    expect(down.w).toBeCloseTo(0.5)
    const right = adjusted("se", frame, 0.1, 0, 1)!
    expect(right.w).toBeCloseTo(0.5)
    expect(right.h).toBeCloseTo(0.5)
  })

  it("keep a held shape inside the picture", () => {
    const big = adjusted("se", frame, 0, 2, 1)!
    expect(big.x + big.w).toBeLessThanOrEqual(1)
    expect(big.y + big.h).toBeLessThanOrEqual(1)
    expect(big.w).toBeCloseTo(big.h)
  })
})
