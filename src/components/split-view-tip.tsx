"use client"

import { ChevronRightIcon, Columns2Icon, LightbulbIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useStoredState } from "@/lib/use-stored-state"

/** Chrome (not Edge or other Chromium browsers) has "Open link in split view" in its link menu. */
function isChrome() {
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands
  return !!brands?.some((b) => b.brand === "Google Chrome")
}

/**
 * A reminder about opening the manual platforms beside Crosspost. Only shown in Chrome, and
 * not at phone widths, where there's no split view to open them in. Its X collapses it to a
 * bulb button that opens it again (remembered in this browser).
 */
export function SplitViewTip() {
  const [closed, setClosed] = useStoredState("crosspost:split-view-tip-closed", false)
  if (!isChrome()) return null

  if (closed) {
    return (
      // A wrapper, so the button keeps its own width in the Compose column. Folded buttons sort
      // after the open cards (order), so they gather at the bottom.
      <div data-glide="reminder" className="order-1 max-sm:hidden">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setClosed(false)}
              aria-label="Show Reminder"
              className="border-amber-500/40 bg-[color-mix(in_oklab,var(--color-amber-500)_8%,var(--card))] text-amber-600 hover:bg-[color-mix(in_oklab,var(--color-amber-500)_16%,var(--card))] hover:text-amber-700 dark:border-amber-400/35 dark:bg-[color-mix(in_oklab,var(--color-amber-400)_8%,var(--card))] dark:text-amber-400 dark:hover:bg-[color-mix(in_oklab,var(--color-amber-400)_16%,var(--card))] dark:hover:text-amber-300"
            >
              <LightbulbIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Show Reminder</TooltipContent>
        </Tooltip>
      </div>
    )
  }

  return (
    <aside
      data-glide="reminder"
      aria-label="Reminder"
      // Opaque (the card color with the amber tint mixed in), so the page's blue glow
      // doesn't show through and clash with the amber.
      className="flex w-full flex-wrap items-center gap-x-1.5 gap-y-2 rounded-xl border max-sm:hidden border-amber-500/40 bg-[color-mix(in_oklab,var(--color-amber-500)_8%,var(--card))] p-4 text-sm text-muted-foreground dark:border-amber-400/35 dark:bg-[color-mix(in_oklab,var(--color-amber-400)_8%,var(--card))]"
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
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setClosed(true)}
            aria-label="Collapse Reminder"
            className="-my-2 -mr-2 ml-auto text-muted-foreground hover:text-foreground"
          >
            <XIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Collapse Reminder</TooltipContent>
      </Tooltip>
    </aside>
  )
}
