"use client"

import { ChevronDownIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { CHANGELOG, splitLatest, type Release } from "@/lib/changelog"
import { cn } from "@/lib/utils"

/** "2026-10-22" as "Oct 22, 2026", read as a calendar day (no time zone shift). */
const day = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

/** One release: its version and day, then its changes (a new feature's points under it). */
function ReleaseNotes({ version: v, date, changes }: Release) {
  return (
    <section aria-labelledby={`release-${v}`} className="space-y-2">
      <h3 id={`release-${v}`} className="flex items-baseline gap-2 text-sm font-medium">
        <span className="tabular-nums">v{v}</span>
        <span className="font-normal text-muted-foreground">{day(date)}</span>
      </h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground marker:text-foreground/40">
        {changes.map((change) => {
          const { text, items } = typeof change === "string" ? { text: change, items: [] } : change
          return (
            // Balanced lines, so no bullet ends on a short tail; the entries are kept to a
            // line or two, where balancing reads best. A new feature's points sit under it.
            <li key={text} className="text-balance">
              {text}
              {items.length > 0 && (
                <ul className="mt-1 list-[circle] space-y-1 pl-5">
                  {items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const { latest, earlier } = splitLatest(CHANGELOG)

/**
 * The footer's version, as a button that opens what changed in each release: the newest minor
 * release and its patches, with the ones before behind "Show earlier versions" (and "Hide
 * earlier versions" to fold them again; folded each time it opens).
 */
export function ChangelogDialog({ className }: { className?: string }) {
  const version = process.env.NEXT_PUBLIC_VERSION
  const [showEarlier, setShowEarlier] = useState(false)
  return (
    <Dialog onOpenChange={(open) => !open && setShowEarlier(false)}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Version ${version}: what's new`}
          // Underlined at rest so it reads as a link (a soft line), lighting up with the text on hover.
          className={cn(
            "py-0.5 text-left tabular-nums underline decoration-current/40 underline-offset-4 transition-colors hover:text-foreground hover:decoration-current",
            className,
          )}
        >
          v{version}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What&apos;s New</DialogTitle>
          <DialogDescription className="sr-only">The main changes in each version of Crosspost.</DialogDescription>
        </DialogHeader>
        {latest.map((r) => (
          <ReleaseNotes key={r.version} {...r} />
        ))}
        {earlier.length > 0 && (
          // One button in one place, under the latest, that opens the earlier releases below it
          // and folds them away again: focus stays on it either way.
          <Button
            variant="outline"
            aria-expanded={showEarlier}
            aria-controls="earlier-releases"
            onClick={() => setShowEarlier(!showEarlier)}
            className="justify-self-start"
          >
            <ChevronDownIcon className={cn("transition-transform", showEarlier && "rotate-180")} />
            {showEarlier ? "Hide earlier versions" : "Show earlier versions"}
          </Button>
        )}
        {showEarlier && (
          <div id="earlier-releases" className="grid gap-4">
            {earlier.map((r) => (
              <ReleaseNotes key={r.version} {...r} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
