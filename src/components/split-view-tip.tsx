"use client"

import { ChevronRightIcon, Columns2Icon, LightbulbIcon } from "lucide-react"

/** Chrome (not Edge or other Chromium browsers) has "Open link in split view" in its link menu. */
function isChrome() {
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands
  return !!brands?.some((b) => b.brand === "Google Chrome")
}

/** A reminder about opening the manual platforms beside Crosspost. Only shown in Chrome. */
export function SplitViewTip() {
  if (!isChrome()) return null

  return (
    <aside
      aria-label="Reminder"
      className="flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-xl border border-amber-500/40 bg-amber-500/8 p-4 text-sm text-muted-foreground dark:border-amber-400/35 dark:bg-amber-400/8"
    >
      <LightbulbIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <span className="mr-0.5 font-medium text-amber-700 dark:text-amber-300">Reminder:</span>
      <span>External link</span>
      <ChevronRightIcon className="size-3.5" aria-hidden />
      <span>Right-click</span>
      <ChevronRightIcon className="size-3.5" aria-hidden />
      {/* A look-alike of Chrome's link menu item, so it's easy to spot. */}
      <span className="inline-flex items-center gap-2.5 rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-sm">
        <Columns2Icon className="size-3.5" />
        Open link in split view
      </span>
    </aside>
  )
}
