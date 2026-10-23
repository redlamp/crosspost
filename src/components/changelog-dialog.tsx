"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { CHANGELOG } from "@/lib/changelog"
import { cn } from "@/lib/utils"

/** "2026-10-22" as "Oct 22, 2026", read as a calendar day (no time zone shift). */
const day = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

/** The footer's version, as a button that opens what changed in each release. */
export function ChangelogDialog({ className }: { className?: string }) {
  const version = process.env.NEXT_PUBLIC_VERSION
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Version ${version}: what's new`}
          className={cn("text-left tabular-nums underline-offset-4 transition-colors hover:text-foreground hover:underline", className)}
        >
          v{version}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What&apos;s New</DialogTitle>
          <DialogDescription className="sr-only">The main changes in each version of Crosspost.</DialogDescription>
        </DialogHeader>
        {CHANGELOG.map(({ version: v, date, changes }) => (
          <section key={v} aria-labelledby={`release-${v}`} className="space-y-2">
            <h3 id={`release-${v}`} className="flex items-baseline gap-2 text-sm font-medium">
              <span className="tabular-nums">v{v}</span>
              <span className="font-normal text-muted-foreground">{day(date)}</span>
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground marker:text-foreground/40">
              {changes.map((change) => (
                // Balanced lines, so no bullet ends on a short tail; the entries are kept to a
                // line or two, where balancing reads best.
                <li key={change} className="text-balance">
                  {change}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  )
}
