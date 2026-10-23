"use client"

import { useEffect, type RefObject } from "react"

/** The glide's own animations, told apart from any others an element runs (a pulse, say). */
const GLIDE = "glide"

/**
 * Glides the `[data-glide]` children of `ref` to their new places when the layout inside it
 * changes (one folding, opening or moving shifts the others): each that's still the same element
 * starts where it was and eases to where it now is. One replaced by another (a card folding into
 * its button) just appears; its own transition covers it. Places are kept relative to the
 * container, so scrolling doesn't count as a move. None with reduced motion.
 *
 * Places are where the layout puts each element, leaving out any glide still under way: measured
 * mid-glide (another change, or a resize, while one is moving) they'd count the glide as a move
 * and start the next one from the wrong place, so a tip would jump when it landed. A change that
 * interrupts a glide starts the new one from where the element is on screen at that moment.
 */
export function useGlide(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const box = ref.current
    if (!box) return
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
    type Place = { el: HTMLElement; x: number; y: number }
    /** How far a glide under way has an element off its place now. */
    const gliding = (el: HTMLElement) => {
      if (!el.getAnimations().some((a) => a.id === GLIDE)) return { x: 0, y: 0 }
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
      return { x: m.m41, y: m.m42 }
    }
    const measure = () => {
      const origin = box.getBoundingClientRect()
      const places = new Map<string, Place>()
      box.querySelectorAll<HTMLElement>("[data-glide]").forEach((el) => {
        const r = el.getBoundingClientRect()
        const off = gliding(el)
        places.set(el.dataset.glide!, { el, x: r.left - off.x - origin.left, y: r.top - off.y - origin.top })
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
          if (Math.abs(before.x - x) + Math.abs(before.y - y) < 1) continue
          // From where it shows now (its old place, plus any glide still under way) to its new one.
          const off = gliding(el)
          const dx = before.x + off.x - x
          const dy = before.y + off.y - y
          for (const a of el.getAnimations()) if (a.id === GLIDE) a.cancel()
          const glide = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
            duration: 300,
            easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
          })
          glide.id = GLIDE
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
