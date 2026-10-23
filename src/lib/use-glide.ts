"use client"

import { useEffect, type RefObject } from "react"

/**
 * Glides the `[data-glide]` children of `ref` to their new places when the layout inside it
 * changes (one folding, opening or moving shifts the others): each that's still the same element
 * starts where it was and eases to where it now is. One replaced by another (a card folding into
 * its button) just appears; its own transition covers it. Places are kept relative to the
 * container, so scrolling doesn't count as a move. None with reduced motion.
 */
export function useGlide(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const box = ref.current
    if (!box) return
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
    type Place = { el: HTMLElement; x: number; y: number }
    const measure = () => {
      const origin = box.getBoundingClientRect()
      const places = new Map<string, Place>()
      box.querySelectorAll<HTMLElement>("[data-glide]").forEach((el) => {
        const r = el.getBoundingClientRect()
        places.set(el.dataset.glide!, { el, x: r.left - origin.left, y: r.top - origin.top })
      })
      return places
    }
    let last = measure()
    const changed = new MutationObserver(() => {
      const now = measure()
      if (!reduced) {
        for (const [key, { el, x, y }] of now) {
          const before = last.get(key)
          if (!before || before.el !== el) continue
          const dx = before.x - x
          const dy = before.y - y
          if (Math.abs(dx) + Math.abs(dy) < 1) continue
          el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
            duration: 300,
            easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
          })
        }
      }
      last = now
    })
    changed.observe(box, { childList: true, subtree: true, attributes: true })
    // A resize moves things without a change inside: just note where they are now.
    const resized = new ResizeObserver(() => {
      last = measure()
    })
    resized.observe(box)
    return () => {
      changed.disconnect()
      resized.disconnect()
    }
  }, [ref])
}
