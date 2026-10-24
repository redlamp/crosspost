"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

import { registerIntroLoader, useWelcome } from "@/lib/intro"

// The tour's dialog and its drawings are a good share of the page's code, and most visits never
// open them, so they're fetched apart from the page: ahead of time while the welcome card is
// showing (it's likely to be opened), on a hover or focus of the card, or at the latest when the
// card asks to open it (src/lib/intro.ts queues the step until the dialog is in).
const IntroDialog = dynamic(() => import("@/components/intro-dialog").then((m) => m.IntroDialog), { ssr: false })

/** How long after the page is up the dialog is fetched, while the welcome card is showing. */
const AHEAD_MS = 2000

export function IntroLoader() {
  const [wanted, setWanted] = useState(false)
  const welcome = useWelcome()
  useEffect(() => registerIntroLoader(() => setWanted(true)), [])
  // The card folded away: no fetch until it's hovered, focused or opened, so a visitor who put it
  // aside doesn't pay for it.
  useEffect(() => {
    if (wanted || !welcome || welcome.folded) return
    // Safari has no requestIdleCallback.
    const idle = (callback: () => void) =>
      typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(callback) : window.setTimeout(callback, 0)
    const timer = window.setTimeout(() => idle(() => setWanted(true)), AHEAD_MS)
    return () => window.clearTimeout(timer)
  }, [wanted, welcome])
  return wanted ? <IntroDialog /> : null
}
