"use client"

import { useSyncExternalStore } from "react"

// Whether this browser has seen the introduction. It opens by itself until then, and
// Compose holds off focusing itself so it doesn't take focus from the dialog.

const KEY = "crosspost:intro-seen"
const listeners = new Set<() => void>()
// Remembered for this page too, so blocked storage still lets the dialog close.
let seenHere = false

function read() {
  if (seenHere) return true
  try {
    return localStorage.getItem(KEY) !== null
  } catch {
    return false
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Seen, or on the server (so the page renders with the introduction closed). */
export function useIntroSeen(): boolean {
  return useSyncExternalStore(subscribe, read, () => true)
}

export function markIntroSeen() {
  seenHere = true
  try {
    localStorage.setItem(KEY, "true")
  } catch {
    // Storage blocked: the introduction shows again on the next visit.
  }
  for (const listener of listeners) listener()
}
