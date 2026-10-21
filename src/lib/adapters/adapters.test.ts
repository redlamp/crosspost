import { describe, expect, it } from "vitest";

import { adapters } from ".";
import { bluesky } from "./bluesky";
import { linkedin } from "./linkedin";
import { mastodon } from "./mastodon";
import { threads } from "./threads";

describe("open links", () => {
  it("prefill the first post where the platform allows it", () => {
    expect(bluesky.open.url("Hi & bye")).toBe("https://bsky.app/intent/compose?text=Hi%20%26%20bye");
    expect(threads.open.url("Hi & bye")).toBe("https://www.threads.com/intent/post?text=Hi%20%26%20bye");
    expect(linkedin.open.url("Hi & bye")).toBe("https://www.linkedin.com/feed/?shareActive=true&text=Hi%20%26%20bye");
  });

  it("open Mastodon's share page on the user's server", () => {
    expect(mastodon.open.url("Hi & bye", "fosstodon.org")).toBe("https://fosstodon.org/share?text=Hi%20%26%20bye");
  });

  it("are https links for every platform", () => {
    for (const a of adapters) expect(a.open.url("x")).toMatch(/^https:\/\//);
  });
});

describe("threads problems", () => {
  it("flags posts with more than 5 unique links", () => {
    const five = "a.com b.com c.com d.com e.com";
    expect(threads.problems!(five)).toBeNull();
    expect(threads.problems!(`${five} https://a.com`)).toBeNull();
    expect(threads.problems!(`${five} f.com`)).toMatch(/at most 5 links/);
  });
});
