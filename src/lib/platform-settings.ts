"use client"

import { useSyncExternalStore } from "react"

import type { PlatformAdapter } from "@/lib/adapters"

// Platform choices: which platforms show, the server for platforms that need
// one (Mastodon), and the order the cards and rail take. Settings and the
// introduction live in the page header, outside the composer, so all of them
// read these through this store.

const KEY = "crosspost:platforms"

export type PlatformSort = { by: "name" | "popularity" | "launched"; dir: "asc" | "desc" }

export type PlatformSettings = {
  /** Shown (true) or hidden (false), where the user chose; otherwise the platform's default. */
  shown: Record<string, boolean>
  /** What the user typed for each platform's server. */
  servers: Record<string, string>
  /** How Settings lists the platforms. */
  sort: PlatformSort
  /** Platform ids in the order the user arranged the cards; any missing go last. */
  order: string[]
}

const DEFAULT_SORT: PlatformSort = { by: "name", dir: "asc" }

/** The direction each sort starts in: A to Z, oldest first, most users first. */
export const SORT_DEFAULT_DIR: Record<PlatformSort["by"], PlatformSort["dir"]> = {
  name: "asc",
  launched: "asc",
  popularity: "desc",
}
const DEFAULTS: PlatformSettings = { shown: {}, servers: {}, sort: DEFAULT_SORT, order: [] }
const listeners = new Set<() => void>()

// The snapshot must keep its identity between reads, so it's cached.
let cache: PlatformSettings | null = null

function read(): PlatformSettings {
  if (cache) return cache
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as {
      shown?: Record<string, boolean>
      servers?: Record<string, string>
      sort?: PlatformSort
      order?: string[]
      hidden?: string[]
    } | null
    const shown = { ...stored?.shown }
    // The first version kept a list of hidden ids.
    for (const id of stored?.hidden ?? []) shown[id] ??= false
    cache = {
      shown,
      servers: { ...stored?.servers },
      sort: { ...DEFAULT_SORT, ...stored?.sort },
      order: stored?.order ?? legacyOrder(),
    }
  } catch {
    cache = DEFAULTS
  }
  return cache
}

/** The order once lived with Compose's preferences. */
function legacyOrder(): string[] {
  try {
    const order = (JSON.parse(localStorage.getItem("crosspost:prefs") ?? "null") as { order?: string[] } | null)?.order
    return Array.isArray(order) ? order : []
  } catch {
    return []
  }
}

function notify() {
  for (const listener of listeners) listener()
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

/** The user's platform settings. Defaults on the server and until the page loads. */
export function usePlatformSettings(): PlatformSettings {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS)
}

export function updatePlatformSettings(change: (current: PlatformSettings) => PlatformSettings) {
  const { shown, servers, sort, order } = change(read())
  cache = { shown, servers, sort, order }
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    // Storage blocked: the choice holds until the page closes.
  }
  notify()
}

export const isShown = (settings: PlatformSettings, adapter: PlatformAdapter) =>
  settings.shown[adapter.id] ?? !adapter.hiddenByDefault

/** Platforms in the user's arranged order; any not in it (new ones) go last. */
export function arrangePlatforms(list: PlatformAdapter[], order: string[]): PlatformAdapter[] {
  const rank = (id: string) => {
    const i = order.indexOf(id)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return [...list].sort((a, b) => rank(a.id) - rank(b.id))
}

/** Platforms in the given order: by name, by rough monthly users, or by launch date. Ties go by name. */
export function sortPlatforms(list: PlatformAdapter[], { by, dir }: PlatformSort): PlatformAdapter[] {
  const sign = dir === "asc" ? 1 : -1
  const byName = (a: PlatformAdapter, b: PlatformAdapter) => a.name.localeCompare(b.name)
  return [...list].sort((a, b) => {
    const order =
      by === "popularity"
        ? a.users.millions - b.users.millions
        : by === "launched"
          ? a.launched.localeCompare(b.launched)
          : byName(a, b)
    return sign * order || byName(a, b)
  })
}

/**
 * A server's host name from whatever was typed: a host, a URL or a full
 * handle all work ("https://Fosstodon.org/@me", "@me@fosstodon.org"). Empty
 * when it isn't a host name.
 */
export function serverHost(input: string): string {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "") // scheme
    .replace(/^@?[^@/\s]+@/, "") // @name@ of a handle
    .split(/[/?#\s]/)[0]
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$/.test(host) ? host : ""
}

// Whether the Settings dialog is open, so a card can open it to ask for a server.
let settingsOpen = false
const openListeners = new Set<() => void>()

export function setSettingsOpen(open: boolean) {
  settingsOpen = open
  for (const listener of openListeners) listener()
}

export function useSettingsOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      openListeners.add(listener)
      return () => openListeners.delete(listener)
    },
    () => settingsOpen,
    () => false,
  )
}
