"use client"

import { useSyncExternalStore } from "react"

// Which platforms the user has hidden in Settings. Kept apart from the
// composer's prefs because the Settings button lives in the page header,
// outside the composer; both read it through this store.

const KEY = "crosspost:platforms"
const listeners = new Set<() => void>()
const NONE: string[] = []

// The snapshot must keep its identity between reads, so it's cached.
let cache: string[] | null = null

function read(): string[] {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    const hidden = raw ? (JSON.parse(raw) as { hidden?: unknown }).hidden : null
    cache = Array.isArray(hidden) ? hidden.filter((id): id is string => typeof id === "string") : NONE
  } catch {
    cache = NONE
  }
  return cache
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Another tab changed it.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return
    cache = null
    listener()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

/** Ids of the platforms hidden in Settings. Empty on the server and until the page loads. */
export function useHiddenPlatforms(): string[] {
  return useSyncExternalStore(subscribe, read, () => NONE)
}

export function setHiddenPlatforms(hidden: string[]) {
  cache = hidden
  try {
    localStorage.setItem(KEY, JSON.stringify({ hidden }))
  } catch {
    // Storage blocked: the choice holds until the page closes.
  }
  for (const listener of listeners) listener()
}
