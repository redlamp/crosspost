"use client"

import { useEffect } from "react"

import { DARK_THEME_COLOR, LIGHT_THEME_COLOR } from "@/lib/theme"

// The base path, inlined at build time (next.config.ts): "" on the dev server, /crosspost on Pages.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

/**
 * What makes the site an app: registers the service worker (public/sw.js), which lets a
 * phone install Crosspost, opens it offline and receives shares from other apps; and keeps
 * the theme-color meta (the color around the page on a phone) in step with the theme.
 * Production builds only: on the dev server a worker would hand out stale files.
 */
export function AppShell() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return
    // The worker file itself is always fetched fresh, so a deploy reaches installed apps.
    navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/`, updateViaCache: "none" }).catch(() => {
      // Private windows and some embedded browsers refuse workers; the site works without one.
    })
    // On a first visit the page's scripts and styles load before the worker can keep them, so
    // the page keeps them itself once the worker is ready: the app then opens offline right away.
    navigator.serviceWorker.ready
      .then(async () => {
        const assets = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) => {
            const url = new URL(name)
            return url.origin === location.origin && url.pathname.startsWith(`${BASE}/_next/`)
          })
        // The worker's cache (public/sw.js).
        const cache = await caches.open("crosspost-v1")
        await cache.addAll(assets)
      })
      .catch(() => {
        // Storage full or blocked: the worker still keeps assets as they're fetched.
      })
  }, [])

  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) return
    const root = document.documentElement
    const sync = () => {
      meta.content = root.classList.contains("dark") ? DARK_THEME_COLOR : LIGHT_THEME_COLOR
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  return null
}
