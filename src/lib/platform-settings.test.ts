import { describe, expect, it } from "vitest"

import { adapters } from "@/lib/adapters"

import { serverHost, sortPlatforms } from "./platform-settings"

describe("serverHost", () => {
  it("takes the host from a host, a URL or a handle", () => {
    expect(serverHost("mastodon.social")).toBe("mastodon.social")
    expect(serverHost("  https://Fosstodon.org/@me ")).toBe("fosstodon.org")
    expect(serverHost("@me@hachyderm.io")).toBe("hachyderm.io")
    expect(serverHost("me@hachyderm.io")).toBe("hachyderm.io")
    expect(serverHost("localhost.test:3000")).toBe("localhost.test:3000")
  })

  it("is empty for anything that isn't a host name", () => {
    expect(serverHost("")).toBe("")
    expect(serverHost("mastodon")).toBe("")
    expect(serverHost("not a server")).toBe("")
  })
})

describe("sortPlatforms", () => {
  const ids = (list: { id: string }[]) => list.map((a) => a.id)

  it("sorts by name, users or launch date, either way", () => {
    expect(ids(sortPlatforms(adapters, { by: "name", dir: "asc" }))).toEqual([
      "bluesky",
      "facebook",
      "instagram",
      "linkedin",
      "mastodon",
      "threads",
      "twitter",
      "x",
    ])
    expect(ids(sortPlatforms(adapters, { by: "popularity", dir: "desc" })).slice(0, 3)).toEqual(["facebook", "instagram", "twitter"])
    expect(ids(sortPlatforms(adapters, { by: "popularity", dir: "asc" }))[0]).toBe("mastodon")
    expect(ids(sortPlatforms(adapters, { by: "launched", dir: "asc" }))[0]).toBe("linkedin")
    expect(ids(sortPlatforms(adapters, { by: "launched", dir: "desc" }))[0]).toBe("threads")
  })
})
