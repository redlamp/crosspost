import { describe, expect, it } from "vitest"

import { sharedText, type SharedPost } from "./share-target"

const post = (fields: Partial<SharedPost>): SharedPost => ({ title: "", text: "", url: "", files: [], ...fields })

describe("sharedText", () => {
  it("joins the title, text and link on their own lines", () => {
    expect(sharedText(post({ title: "A page", text: "Worth a look", url: "https://example.com/a" }))).toBe(
      "A page\nWorth a look\nhttps://example.com/a",
    )
  })

  it("leaves out what's missing", () => {
    expect(sharedText(post({ text: "Just words" }))).toBe("Just words")
    expect(sharedText(post({ url: "https://example.com/" }))).toBe("https://example.com/")
    expect(sharedText(post({}))).toBe("")
  })

  it("doesn't add the link again when the text already has it (Chrome on Android)", () => {
    expect(sharedText(post({ title: "A page", text: "https://example.com/a", url: "https://example.com/a" }))).toBe(
      "A page\nhttps://example.com/a",
    )
  })

  it("doesn't repeat a title that equals the text", () => {
    expect(sharedText(post({ title: "Same", text: "Same" }))).toBe("Same")
  })
})
