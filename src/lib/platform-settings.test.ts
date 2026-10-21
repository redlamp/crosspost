import { describe, expect, it } from "vitest"

import { serverHost } from "./platform-settings"

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
