import { describe, expect, it } from "vitest";

import { adapters } from ".";
import { bluesky } from "./bluesky";
import { linkedin } from "./linkedin";
import { mastodon } from "./mastodon";
import { threads } from "./threads";
import { twitter } from "./twitter";
import { x } from "./x";

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
    for (const a of adapters) {
      expect(a.open.url("x")).toMatch(/^https:\/\//);
      if (a.open.withMedia) expect(a.open.withMedia.url).toMatch(/^https:\/\//);
    }
  });

  it("send X to the regular composer when there are images", () => {
    expect(twitter.open.withMedia?.url).toBe("https://x.com/compose/post");
    expect(x.open.withMedia?.url).toBe("https://x.com/compose/post");
  });
});

describe("compose facts", () => {
  it("match what each composer takes", () => {
    const facts = Object.fromEntries(adapters.map((a) => [a.id, a.compose]));
    expect(facts.linkedin.image).toBe("file");
    expect(facts.instagram.image).toBe("file");
    expect(facts.facebook.text).toBe("paste");
    expect(facts.mastodon.thread).toBe("reply");
    // A platform that threads has a way to add the later posts; one that doesn't, none.
    for (const a of adapters) expect(a.compose.thread === "none").toBe(!a.chain);
  });

  it("let an agent fill only the open networks' composers", () => {
    const filled = adapters.filter((a) => a.compose.agent === "composer").map((a) => a.id);
    expect(filled.sort()).toEqual(["bluesky", "mastodon"]);
    // Every platform an agent only opens links its terms, so the guide can say why.
    for (const a of adapters) if (a.compose.agent === "open") expect(a.compose.terms).toMatch(/^https:\/\//);
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
