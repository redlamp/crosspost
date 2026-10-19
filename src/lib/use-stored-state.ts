"use client"

import { useEffect, useState } from "react"

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

/**
 * useState backed by localStorage. Only use it in components rendered with
 * `ssr: false`, since the initial value comes from storage. `revive` fixes up
 * a stored value once, on load.
 */
export function useStoredState<T>(key: string, fallback: T, revive?: (stored: T) => T) {
  const [value, setValue] = useState<T>(() => {
    const stored = read(key, fallback)
    return revive ? revive(stored) : stored
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Storage full or blocked: the app still works, it just won't remember.
    }
  }, [key, value])

  return [value, setValue] as const
}
