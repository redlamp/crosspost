"use client"

import { CircleHelpIcon, PlayIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { CARD_TRAIL, CARD_TRAIL_STOPS, CARD_TRAIL_W, CARD_TRAIL_Y, STEPS } from "@/components/intro-dialog"

/** The card shows the tour's first three steps; Done is the tour's own. */
const CARD_STEPS = STEPS.slice(0, 3)
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { RollText } from "@/components/roll-text"
import { WaveText } from "@/components/wave-text"
import { foldWelcome, openIntro, takeJustFolded, useTourCloses, useTourOpen, useWelcome } from "@/lib/intro"
import { cn } from "@/lib/utils"

/**
 * The tour's trail, the way between Draft, Decide and Deliver: the same path as the tour's
 * header, stretched across the card, with its dots walking toward Deliver, and a stop for each
 * step (its icon over its name, as in the tour's header) that opens the tour there. Under the
 * track, where the card is wide enough (not on phones), each step's caption centered under its
 * stop: the header the tour shows for it, so the track runs between where you stop and what you
 * do there. There, the trail is drawn in from the card's sides (3rem each), so the end captions
 * have room to center under Draft and Deliver. As the
 * tour opens, the trail and the stops' icons grow into the tour's own (their transition names),
 * and the captions fade with the card; the step's own header then fades in under the tour's
 * trail, about where they were.
 */
function CardTrail({ touring }: { touring: boolean }) {
  const at = (x: number) => `${(x / CARD_TRAIL_W) * 100}%`
  return (
    <div className="mt-2 @md:mx-12">
      <nav aria-label="Tour steps" className="relative h-[72px]">
        <svg
          aria-hidden
          viewBox={`0 0 ${CARD_TRAIL_W} 72`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          fill="none"
          style={{ viewTransitionName: touring ? undefined : "tour-trail" }}
        >
          <path
            d={CARD_TRAIL}
            stroke="var(--brand-blue)"
            strokeOpacity={0.7}
            strokeWidth={2}
            strokeDasharray="2 5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="trail-walk"
          />
        </svg>
        {/* The stops' dots, as HTML: the stretched drawing would make circles ellipses. */}
        {CARD_TRAIL_STOPS.map((x) => (
          <span
            key={x}
            aria-hidden
            className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--brand-blue)"
            style={{ left: at(x), top: CARD_TRAIL_Y }}
          />
        ))}
        {CARD_STEPS.map(({ label, icon: Icon, title }, i) => (
          <button
            key={label}
            type="button"
            onClick={() => openIntro(i)}
            aria-label={`${label}: ${title.replace("\n", " ")}. Open the tour here`}
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1.5 rounded-md px-1.5 py-0.5 text-base leading-5 font-semibold text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            style={{ left: at(CARD_TRAIL_STOPS[i]) }}
          >
            {/* Flies to its stop on the tour's trail as the tour grows out of the card. */}
            <Icon
              className="size-4 shrink-0 text-(--brand-blue)"
              aria-hidden
              style={{ viewTransitionName: touring ? undefined : `tour-step-${i}` }}
            />
            {label}
          </button>
        ))}
      </nav>
      {/* The captions, under the track. Its stop's button already names each for screen
          readers, so these are only a wider place to click. */}
      <div aria-hidden className="relative mt-1 hidden h-12 @md:block">
        {CARD_STEPS.map(({ label, title }, i) => (
          <button
            key={label}
            type="button"
            tabIndex={-1}
            onClick={() => openIntro(i)}
            className="absolute top-0 w-40 -translate-x-1/2 text-center text-base leading-6 whitespace-pre-line text-muted-foreground transition-colors hover:text-foreground"
            style={{ left: at(CARD_TRAIL_STOPS[i]) }}
          >
            {title}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The card's title: "Start here" with its wave, or "How it works". Back from the tour, it first
 * rolls from the tour's title to its own (keyed by how often the tour has closed, so each close
 * rolls once), as the tour shrinks back into the card.
 */
function CardTitle({ first, fromTour }: { first: boolean; fromTour: boolean }) {
  const text = first ? "Start here" : "How it works"
  const [rolling, setRolling] = useState(fromTour)
  if (rolling) return <RollText from="Take the tour" to={text} onDone={() => setRolling(false)} />
  return first ? <WaveText text={text} mode="loop" /> : text
}

/**
 * The card folded: a small "How it works" button that opens it again, drawing the eye as it
 * first appears. Folded buttons sort after the open cards (order), so they gather at the bottom.
 */
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
      onClick={() => foldWelcome(false)}
      // The card's transition name: it glides from the card's place down to here, and back.
      style={{ viewTransitionName: "tour" }}
      className="order-1 border-(--brand-blue)/40 bg-[color-mix(in_oklab,var(--brand-blue)_8%,var(--card))] hover:bg-[color-mix(in_oklab,var(--brand-blue)_16%,var(--card))]"
    >
      <CircleHelpIcon className="text-(--brand-blue)" />
      How it works
    </Button>
  )
}

/**
 * The welcome: the tour's trail, its stops opening the tour at each step, then Take the Tour
 * (from the start) and Try It (the example post, while Compose is empty).
 * Rendered in two places, `top` (above Compose) and `bottom` (below it, beside the split view
 * reminder), it shows in one: above as "Start here" on a first visit until it's folded, below as
 * "How it works" from then on, open or folded to its button. In place of the introduction opening
 * over the app, so nothing stands between a newcomer and the tool.
 */
export function WelcomeCard({ place, onTryExample }: { place: "top" | "bottom"; onTryExample: () => void }) {
  const welcome = useWelcome()
  // While the tour is open it carries the card's transition names (it grew out of the card).
  const touring = useTourOpen()
  const tourCloses = useTourCloses()
  if (!welcome || (place === "top") !== welcome.first) return null
  if (welcome.folded) return <FoldedWelcome />

  return (
    <section
      aria-labelledby="welcome-title"
      style={{ viewTransitionName: touring ? undefined : "tour" }}
      className={cn(
        "@container w-full rounded-xl border border-(--brand-blue)/40 bg-[color-mix(in_oklab,var(--brand-blue)_8%,var(--card))] p-4",
        // It became the tour: hidden while the tour is open (keeping its place), to grow back into.
        touring && "invisible",
      )}
    >
      <div className="flex items-center gap-2">
        {/* "Start here" a size up, as Compose's heading, with its wave; "How it works" plainer. */}
        {/* The title's words travel to the tour's title as the tour grows out of the card (a
            fixed width, the same as the tour's, so the morph doesn't stretch them). */}
        <h2 id="welcome-title" className={cn("mr-auto font-semibold", welcome.first && "text-lg")}>
          <span className="inline-block w-40" style={{ viewTransitionName: touring ? undefined : "tour-title" }}>
            <CardTitle key={tourCloses} first={welcome.first} fromTour={tourCloses > 0} />
          </span>
        </h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => foldWelcome(true)}
              aria-label="Dismiss How it works"
              className="-my-2 -mr-2 text-muted-foreground hover:text-foreground"
            >
              <XIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Dismiss</TooltipContent>
        </Tooltip>
      </div>
      <CardTrail touring={touring} />
      {/* The two ways in, filling the card's width between them. Try It is always there: over a
          post of your own, it asks first (the composer's confirmation). */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="lg" onClick={() => openIntro(0)}>
          Take the Tour
        </Button>
        <Button size="lg" variant="outline" onClick={onTryExample}>
          <PlayIcon />
          Try It
        </Button>
      </div>
    </section>
  )
}
