"use client"

import { ChevronRightIcon, Columns2Icon, LightbulbIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useStoredState } from "@/lib/use-stored-state"

/** Chrome (not Edge or other Chromium browsers) has "Open link in split view" in its link menu. */
function isChrome() {
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands
  return !!brands?.some((b) => b.brand === "Google Chrome")
}

/** A reminder about opening the manual platforms beside Crosspost. Only shown in Chrome, until closed. */
export function SplitViewTip() {
  const [closed, setClosed] = useStoredState("crosspost:split-view-tip-closed", false)
  if (closed || !isChrome()) return null

  return (
    <aside
      aria-label="Reminder"
      // Opaque (the card color with the amber tint mixed in), so the page's blue glow
      // doesn't show through and clash with the amber.
      className="flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-xl border border-amber-500/40 bg-[color-mix(in_oklab,var(--color-amber-500)_8%,var(--card))] p-4 text-sm text-muted-foreground dark:border-amber-400/35 dark:bg-[color-mix(in_oklab,var(--color-amber-400)_8%,var(--card))]"
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
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setClosed(true)}
        aria-label="Close the reminder"
        title="Close"
        className="-my-2 -mr-2 ml-auto text-muted-foreground hover:text-foreground"
      >
        <XIcon />
      </Button>
    </aside>
  )
}
