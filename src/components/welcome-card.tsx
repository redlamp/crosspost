"use client"

import { CircleHelpIcon, PlayIcon, XIcon } from "lucide-react"
import { useEffect, useRef } from "react"

import { STEPS } from "@/components/intro-dialog"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { openIntro, setWelcomeFolded, takeJustFolded, useWelcome } from "@/lib/intro"

/** The card folded: a small "How it works" button that opens it again, drawing the eye as it first appears. */
function FoldedWelcome() {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!takeJustFolded() || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    ref.current?.animate(
      [
        { boxShadow: "0 0 0 0 color-mix(in oklab, var(--brand-blue) 70%, transparent)" },
        { boxShadow: "0 0 0 10px transparent" },
      ],
      { duration: 900, iterations: 3, easing: "ease-out" },
    )
  }, [])
  return (
    <Button
      ref={ref}
      variant="outline"
      onClick={() => setWelcomeFolded(false)}
      className="border-(--brand-blue)/40 bg-[color-mix(in_oklab,var(--brand-blue)_8%,var(--card))] hover:bg-[color-mix(in_oklab,var(--brand-blue)_16%,var(--card))]"
    >
      <CircleHelpIcon className="text-(--brand-blue)" />
      How it works
    </Button>
  )
}

/**
 * The welcome: the introduction's three steps, each opening it there under the header it has
 * there, Take the Tour (from the start) and, while Compose is empty, Try It (the example post).
 * Rendered in two places, `top` (above Compose) and `bottom` (below it, beside the split view
 * reminder), it shows in one: above as "Start here" on a first visit until it's folded, below as
 * "How it works" from then on, open or folded to its button. In place of the introduction opening
 * over the app, so nothing stands between a newcomer and the tool.
 */
export function WelcomeCard({ place, onTryExample }: { place: "top" | "bottom"; onTryExample?: () => void }) {
  const welcome = useWelcome()
  if (!welcome || (place === "top") !== welcome.first) return null
  if (welcome.folded) return <FoldedWelcome />

  return (
    <section
      aria-labelledby="welcome-title"
      className="@container w-full rounded-xl border border-(--brand-blue)/40 bg-[color-mix(in_oklab,var(--brand-blue)_8%,var(--card))] p-4"
    >
      <div className="flex items-center gap-2">
        <h2 id="welcome-title" className="mr-auto font-semibold">
          {welcome.first ? "Start here" : "How it works"}
        </h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setWelcomeFolded(true)}
              aria-label="Collapse How it works"
              className="-my-2 -mr-2 text-muted-foreground hover:text-foreground"
            >
              <XIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Collapse</TooltipContent>
        </Tooltip>
      </div>
      {/* Three across; the captions only where there is room for them (not on phones). */}
      <ol className="mt-3 grid grid-cols-3 gap-2">
        {STEPS.map(({ label, icon: Icon, title }, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => openIntro(i)}
              className="flex h-full w-full flex-col gap-1 rounded-lg border bg-card p-2.5 text-left transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none @md:p-3"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="size-4 shrink-0 text-(--brand-blue)" aria-hidden />
                <span>
                  <span className="hidden @md:inline">{i + 1}. </span>
                  {label}
                </span>
              </span>
              {/* Under the icon and name, so it has the tile's width. Line breaks in a title
                  are kept: Draft's breaks after its comma. */}
              <span className="hidden text-sm whitespace-pre-line text-muted-foreground @md:block">{title}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => openIntro(0)}>Take the Tour</Button>
        {onTryExample && (
          <Button variant="outline" onClick={onTryExample}>
            <PlayIcon />
            Try It
          </Button>
        )}
      </div>
    </section>
  )
}
