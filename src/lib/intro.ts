"use client"

import { useSyncExternalStore } from "react"
import { flushSync } from "react-dom"

// The welcome card and the introduction it opens. On a first visit the card sits above Compose
// as "Start here"; after that (a later day, or once it has been folded) it lives below Compose as
// "How it works". Its X folds it to a small button there, beside the split view reminder's, and
// the button opens it again. Finishing the introduction with Start folds it too.

/** "true" folded, "false" opened again; absent until it's first folded. */
const FOLDED = "crosspost:welcome-folded"
/** The day of the first visit (YYYY-MM-DD, local). */
const FIRST_VISIT = "crosspost:first-visit"
/** From before the card: the introduction had been seen, so this is a returning visitor, folded. */
const OLD_SEEN = "crosspost:intro-seen"
/** A first visit recorded for someone who came before visits were (any day but today). */
const EARLIER = "earlier"

export type Welcome = {
  /** Folded to its button. */
  folded: boolean
  /** Above Compose, as "Start here": a first visit's day, and never folded. */
  first: boolean
}

const listeners = new Set<() => void>()
// Kept for this page too, so blocked storage still lets the card fold.
const here = new Map<string, string>()
let cached: { key: string; value: Welcome } | null = null

function get(key: string): string | null {
  if (here.has(key)) return here.get(key)!
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function set(key: string, value: string) {
  here.set(key, value)
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage blocked: it holds for this page only.
  }
}

/** Today, as the browser's calendar has it. */
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function read(): Welcome {
  const seenBefore = get(OLD_SEEN) !== null
  let firstVisit = get(FIRST_VISIT)
  if (firstVisit === null) {
    firstVisit = seenBefore ? EARLIER : today()
    set(FIRST_VISIT, firstVisit)
  }
  const folded = get(FOLDED)
  const key = `${firstVisit}|${folded}|${seenBefore}`
  if (cached?.key !== key) {
    cached = {
      key,
      value: {
        folded: folded === "true" || (folded === null && seenBefore),
        first: firstVisit === today() && folded === null && !seenBefore,
      },
    }
  }
  return cached.value
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The welcome card's state; null on the server, where it isn't known (so nothing renders until it is). */
export function useWelcome(): Welcome | null {
  return useSyncExternalStore(subscribe, read, () => null)
}

// Set as the card folds, so its button, appearing below Compose, can draw the eye once.
let justFolded = false

/** Fold the card to its button, or open it again. */
export function setWelcomeFolded(folded: boolean) {
  if (folded) justFolded = true
  set(FOLDED, String(folded))
  for (const listener of listeners) listener()
}

/** Whether the card has just folded, asked once by its button. */
export function takeJustFolded() {
  const was = justFolded
  justFolded = false
  return was
}

// Whether the tour (the introduction's dialog) is open. The welcome card grows into it and back
// (a view transition): while it's open, the dialog carries the card's transition names, so the
// card lets go of them.
let tourOpen = false
// How many times the tour has closed: the card's title, keyed by it, rolls back from the tour's.
let tourCloses = 0
const tourListeners = new Set<() => void>()

export function setTourOpen(open: boolean) {
  if (tourOpen && !open) tourCloses++
  tourOpen = open
  for (const listener of tourListeners) listener()
}

export function useTourCloses(): number {
  return useSyncExternalStore(
    (listener) => {
      tourListeners.add(listener)
      return () => tourListeners.delete(listener)
    },
    () => tourCloses,
    () => 0,
  )
}

export function useTourOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      tourListeners.add(listener)
      return () => tourListeners.delete(listener)
    },
    () => tourOpen,
    () => false,
  )
}

/** Whether the card and the tour can morph (view transitions, and motion not reduced). */
export const canMorph = () =>
  typeof document.startViewTransition === "function" && !matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * A morph of the welcome card (into the tour, its folded button, or back): a view transition
 * marked .tour-morphing for its length (globals.css), so the page itself holds still and only
 * the moving parts (and the tour's scrim) change, rather than the whole page crossfading.
 */
export function morphTo(update: () => void) {
  const root = document.documentElement
  root.classList.add("tour-morphing")
  const transition = document.startViewTransition(update)
  transition.ready.catch(() => {})
  transition.finished.finally(() => root.classList.remove("tour-morphing"))
}

/**
 * Fold the welcome card to its button below Compose, or open it again, gliding between the two
 * (the card and the button share the transition name "tour") where motion allows.
 */
export function foldWelcome(folded: boolean) {
  if (!canMorph()) return setWelcomeFolded(folded)
  morphTo(() => flushSync(() => setWelcomeFolded(folded)))
}

// The introduction's dialog sits on the page with no button of its own; the welcome card asks it to open at a step.
let opener: ((step: number) => void) | null = null

/** The dialog registers how it opens; the returned function unregisters it. */
export function registerIntroOpener(open: (step: number) => void) {
  opener = open
  return () => {
    if (opener === open) opener = null
  }
}

/** Open the introduction at `step` (0 Draft, 1 Decide, 2 Deliver). */
export function openIntro(step = 0) {
  opener?.(step)
}
