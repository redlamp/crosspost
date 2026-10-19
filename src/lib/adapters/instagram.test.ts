import { describe, expect, it } from "vitest";

import { instagram } from "./instagram";

describe("instagram", () => {
  it("flags captions with more than 30 hashtags", () => {
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `#tag${i}`).join(" ");
    expect(instagram.problems!(`Caption ${tags(30)}`)).toBeNull();
    expect(instagram.problems!(`Caption ${tags(31)}`)).toMatch(/at most 30 hashtags; this has 31/);
    expect(instagram.problems!("Not a tag: issue#5")).toBeNull();
  });
});
