"use client"

import { useSyncExternalStore } from "react"

import type { PlatformAdapter } from "@/lib/adapters"

// Platform choices from Settings: which platforms show, and the server for
// platforms that need one (Mastodon). The Settings button lives in the page
// header, outside the composer, so both read it through this store.

const KEY = "crosspost:platforms"

export type PlatformSettings = {
  /** Shown (true) or hidden (false), where the user chose; otherwise the platform's default. */
  shown: Record<string, boolean>
  /** What the user typed for each platform's server. */
  servers: Record<string, string>
}

const DEFAULTS: PlatformSettings = { shown: {}, servers: {} }
const listeners = new Set<() => void>()

// The snapshot must keep its identity between reads, so it's cached.
let cache: PlatformSettings | null = null

function read(): PlatformSettings {
  if (cache) return cache
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as {
      shown?: Record<string, boolean>
      servers?: Record<string, string>
      hidden?: string[]
    } | null
    const shown = { ...stored?.shown }
    // The first version kept a list of hidden ids.
    for (const id of stored?.hidden ?? []) shown[id] ??= false
    cache = { shown, servers: { ...stored?.servers } }
  } catch {
    cache = DEFAULTS
  }
  return cache
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
  const { shown, servers } = change(read())
  cache = { shown, servers }
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    // Storage blocked: the choice holds until the page closes.
  }
  notify()
}

export const isShown = (settings: PlatformSettings, adapter: PlatformAdapter) =>
  settings.shown[adapter.id] ?? !adapter.hiddenByDefault

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
