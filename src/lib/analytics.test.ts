import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

// A fresh module per case, since the count is fetched once and kept.
const load = async (response: Response | Error) => {
  const fetch = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal("fetch", fetch)
  const { fetchViewCount } = await import("./analytics")
  return { fetchViewCount, fetch }
}

describe("fetchViewCount", () => {
  it("reads GoatCounter's formatted count for the home page", async () => {
    const { fetchViewCount, fetch } = await load(Response.json({ count: "1,234", count_unique: "800" }))
    expect(await fetchViewCount()).toBe(1234)
    expect(fetch).toHaveBeenCalledWith("https://redlamp.goatcounter.com/counter/%2F.json")
  })

  it("asks for the base path as GoatCounter records it, with no trailing slash", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/crosspost")
    const { fetchViewCount, fetch } = await load(Response.json({ count: "3" }))
    expect(await fetchViewCount()).toBe(3)
    expect(fetch).toHaveBeenCalledWith("https://redlamp.goatcounter.com/counter/%2Fcrosspost.json")
  })

  it("asks once however many footers want it", async () => {
    const { fetchViewCount, fetch } = await load(Response.json({ count: "5" }))
    await Promise.all([fetchViewCount(), fetchViewCount()])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("gives null when the counter is off, empty or blocked", async () => {
    expect(await (await load(new Response("off", { status: 403 }))).fetchViewCount()).toBeNull()
    vi.resetModules()
    expect(await (await load(Response.json({}))).fetchViewCount()).toBeNull()
    vi.resetModules()
    expect(await (await load(new TypeError("blocked"))).fetchViewCount()).toBeNull()
  })
})
