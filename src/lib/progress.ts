/**
 * What a platform's card needs before it counts as posted: one step per post, one per image or
 * video still on the card, one per alt text on those, and one for all its @tags together.
 */
export type CardNeeds = {
  /** The posts' texts, as they'll go out. */
  posts: readonly string[]
  /** Ids of the images and videos on the card (not those left off it). */
  media: readonly string[]
  /** `altKey`s of the alt texts on those. */
  alts: readonly string[]
  tags: readonly string[]
}

/** What has been done on the card: copied, opened, or ticked by hand. */
export type CardMarks = {
  copiedPosts?: readonly string[]
  copiedImages?: readonly string[]
  copiedAlts?: readonly string[]
  checkedTags?: readonly string[]
}

export type CardProgress = {
  steps: number
  done: number
  /** Every step done, on a card with something to post. */
  complete: boolean
  /** Each post's step, in order. */
  posts: boolean[]
  /** Each image's and alt text's step, by id and by `altKey`. */
  media: Record<string, boolean>
  alts: Record<string, boolean>
  /** The tags' step; null when the card has no tags. */
  tags: boolean | null
}

const doneIn = (list: readonly string[] | undefined) => (item: string) => !!list?.includes(item)

/** Where a card stands. Pure, so the card, the auto-mark and the page's payload agree. */
export function cardProgress(needs: CardNeeds, marks: CardMarks): CardProgress {
  const posts = needs.posts.map(doneIn(marks.copiedPosts))
  const media = Object.fromEntries(needs.media.map((id) => [id, doneIn(marks.copiedImages)(id)]))
  const alts = Object.fromEntries(needs.alts.map((key) => [key, doneIn(marks.copiedAlts)(key)]))
  const tags = needs.tags.length ? needs.tags.every(doneIn(marks.checkedTags)) : null
  const all = [...posts, ...Object.values(media), ...Object.values(alts), ...(tags === null ? [] : [tags])]
  const done = all.filter(Boolean).length
  return { steps: all.length, done, complete: posts.length > 0 && done === all.length, posts, media, alts, tags }
}
