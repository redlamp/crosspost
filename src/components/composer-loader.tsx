"use client"

import dynamic from "next/dynamic"

// The composer seeds its state from localStorage, so it renders only in the browser.
export const ComposerLoader = dynamic(() => import("@/components/composer"), {
  ssr: false,
  loading: () => <div className="p-6 text-sm text-muted-foreground">Loading…</div>,
})
