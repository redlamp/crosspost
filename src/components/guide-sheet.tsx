"use client"

import { useEffect, useState } from "react"

import { XIcon } from "lucide-react"

import { Guide, GUIDE_TITLE } from "@/app/assistants/guide"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"

/** The hash that opens the guide in the app, on arrival or when a link to it is followed. */
export const GUIDE_HASH = "#guide"

/** The guide's own hashes: its opener, and its platform anchors (`#p-linkedin`), which open it there. */
const GUIDE_HASHES = /^#(guide|p-[a-z]+)$/

/**
 * The agent guide as a sheet over the app, so reading it doesn't mean leaving the draft or a
 * second tab: `#guide` opens it (Settings' Agent Guide points there), as does a platform anchor
 * inside it, and closing it clears the hash, so a reload or a
 * copied address doesn't reopen it. The same guide stands on its own at /assistants for agents
 * and direct links.
 */
export function GuideSheet() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const fromHash = () => {
      if (GUIDE_HASHES.test(location.hash)) setOpen(true)
    }
    fromHash()
    window.addEventListener("hashchange", fromHash)
    return () => window.removeEventListener("hashchange", fromHash)
  }, [])
  // Arriving on a platform anchor: the browser looked for it before the sheet was in, so scroll
  // there once it is.
  useEffect(() => {
    if (!open || !location.hash.startsWith("#p-")) return
    const id = location.hash.slice(1)
    const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView(), 0)
    return () => window.clearTimeout(timer)
  }, [open])
  const close = () => {
    setOpen(false)
    if (GUIDE_HASHES.test(location.hash)) history.replaceState(null, "", location.pathname + location.search)
  }
  return (
    <Sheet open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      {/* Wide enough for the tables; the whole window on a phone. The title bar and its X stay
          put while the guide scrolls under them, so leaving never means scrolling back up. */}
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b py-3 pr-4 pl-6 sm:pl-8">
          <SheetTitle className="text-lg">{GUIDE_TITLE}</SheetTitle>
          <SheetDescription className="sr-only">
            What an agent can do with Crosspost, and the steps for each platform.
          </SheetDescription>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close">
              <XIcon />
            </Button>
          </SheetClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 sm:px-8">
          <Guide />
        </div>
      </SheetContent>
    </Sheet>
  )
}
