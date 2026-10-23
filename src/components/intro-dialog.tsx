"use client"

import { BotIcon, PenLineIcon, SendIcon, ShieldCheckIcon, SignpostBigIcon, XIcon, type LucideIcon } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"

import { DraftImagesArt, ImagesArt, SplitArt, useReducedMotion, useTouch, WriteArt, type ArtProps } from "@/components/intro-art"
import { DecideArt } from "@/components/intro-decide"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { FlapText } from "@/components/flap-text"
import { WaveText } from "@/components/wave-text"
import { registerIntroOpener, setTourOpen, setWelcomeFolded, useWelcome } from "@/lib/intro"
import { cn } from "@/lib/utils"

/** Draft's tabs, kept by the dialog so the timeline can move between them. */
type DraftTabs = {
  part: number
  /** The tab shown before this one: Images starts with Split's lit chips and dims them. */
  previous: number | null
  /** A tab was clicked: the drawings stop moving on by themselves. */
  picked: boolean
  show: (part: number) => void
  pick: (part: number) => void
  /** The last tab's drawing ended: on to Decide. */
  finish: () => void
}

type StepProps = {
  active: boolean
  draft: DraftTabs
  /** Deliver's tab (the way to post), kept by the dialog so Next and Back can move between them. */
  deliver: { way: number; pick: (way: number) => void }
  /** The step's drawing ended: on to the next step, so the introduction plays through. */
  next: () => void
}

/** A step's title, muted as in the Figma panels. */
function StepTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <DialogTitle className={cn("text-lg font-semibold text-muted-foreground", className)}>{children}</DialogTitle>
}

/**
 * A step's body, as the Figma panels lay it out. With controls (Draft's tabs), they come first
 * with the title centered under them, then the visual; otherwise the visual, then the title and
 * its text along the left edge (Deliver).
 */
function Step({
  visual,
  controls,
  title,
  children,
  align = "center",
}: {
  visual: React.ReactNode
  controls?: React.ReactNode
  title: string
  children?: React.ReactNode
  align?: "center" | "start"
}) {
  const start = align === "start"
  return (
    <div className={cn("flex flex-col gap-3", start ? "items-stretch" : "items-center")}>
      {!controls && <div className="w-full">{visual}</div>}
      {controls}
      {/* Keyed by its words, so a new caption fades in. */}
      <StepTitle key={title} className={cn("animate-in fade-in", !start && "text-center")}>
        {title}
      </StepTitle>
      {children && (
        <div className={cn("space-y-3 text-sm text-muted-foreground", start ? "w-full" : "w-full max-w-lg")}>{children}</div>
      )}
      {controls && <div className="mt-2 w-full">{visual}</div>}
    </div>
  )
}

/**
 * A step's tabs, as Draft's and Deliver's: a segmented row where, as tabs do, the arrow keys
 * move between them and only the one shown is in the Tab order. `id` names the tabs and their
 * panel; `tabClassName` sizes each tab.
 */
function StepTabs({
  id,
  label,
  tabs,
  current,
  onPick,
  tabClassName,
}: {
  id: string
  label: string
  tabs: string[]
  current: number
  onPick: (i: number) => void
  tabClassName: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex gap-1 rounded-[10px] bg-muted p-1"
      onKeyDown={(e) => {
        const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
        if (!step) return
        e.preventDefault()
        const to = (current + step + tabs.length) % tabs.length
        onPick(to)
        document.getElementById(`${id}-${to}`)?.focus()
      }}
    >
      {tabs.map((tab, i) => (
        <button
          key={tab}
          type="button"
          role="tab"
          id={`${id}-${i}`}
          aria-selected={i === current}
          aria-controls={`${id}-panel`}
          tabIndex={i === current ? 0 : -1}
          onClick={() => onPick(i)}
          className={cn(
            "rounded-lg py-1.5 text-sm font-medium transition-colors",
            tabClassName,
            i === current ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

function Decide({ active, next }: StepProps) {
  // When the drawing started, to learn how long a pass takes.
  const decideStart = useRef(0)
  useEffect(() => {
    decideStart.current = performance.now()
  }, [])
  return (
    // The title, the instruction and the note on the left, one after the other; the list on
    // the right, as in the Figma panel. Phones: the text first, then the list.
    <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
      <div className="flex flex-col gap-6 text-muted-foreground sm:min-w-0 sm:flex-1">
        <div className="space-y-3">
          <StepTitle>Pick your destinations</StepTitle>
          <p className="text-base leading-5">
            Drag the platforms you post to into the order you work in, and any you don&apos;t use down to Off. The
            cards follow.
          </p>
        </div>
        <div className="flex gap-2.5 rounded-lg border border-(--brand-blue)/40 bg-(--brand-blue)/8 p-3 text-sm">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-(--brand-blue)" />
          <p>
            <span className="block font-semibold text-foreground">Designed to be light</span>
            The app never holds an account, a password, or a key.
            <span className="block italic">There&apos;s nothing to connect and nothing to leak.</span>
          </p>
        </div>
      </div>
      <DecideArt
        active={active}
        onDone={() => {
          DECIDE_MS = settle(DECIDE_MS, performance.now() - decideStart.current)
          next()
        }}
        className="w-full shrink-0 sm:w-44"
      />
    </div>
  )
}

const DRAFT_PARTS: { label: string; Art: (props: ArtProps) => React.ReactNode; title: string; beats?: string[] }[] = [
  {
    label: "Write",
    Art: WriteArt,
    title: "Write once, preview everywhere",
  },
  {
    label: "Split",
    Art: SplitArt,
    title: "Easily drag or insert split markers in posts",
    /** Captions for the drawing's later beats, by beat (the first is the title). */
    beats: ["Drag markers out to remove"],
  },
  {
    label: "Images",
    Art: DraftImagesArt,
    title: "Preview and stage images",
  },
]

/**
 * A drawing's measured length, kept within half and double the current guess: in a background
 * tab the browser slows timers to about one a second, and one such pass shouldn't set the pace
 * of the timeline from then on.
 */
function settle(guess: number, measured: number) {
  return Math.min(guess * 2, Math.max(guess / 2, measured))
}

/**
 * How long each of Draft's drawings plays before moving on, in ms, for the timeline: a first
 * guess, then what the last pass took.
 */
const PART_MS = [7400, 24000, 11800]

/**
 * Write, Split and Images, one at a time: each moves on to the next when its drawing ends, and
 * the last on to Decide, until a tab is picked.
 */
function Draft({ active, draft }: StepProps) {
  const { part, previous, picked, show, pick, finish } = draft
  const { Art, title: first, beats = [] } = DRAFT_PARTS[part]
  // The caption follows the drawing's beats; a new tab starts on the first.
  const [beat, setBeat] = useState({ part, n: 0 })
  const title = beat.part === part && beat.n > 0 ? (beats[beat.n - 1] ?? first) : first
  // When this tab's drawing started, to learn how long a pass takes.
  const startedAt = useRef(0)
  useEffect(() => {
    startedAt.current = performance.now()
  }, [part])
  return (
    <Step
      visual={
        <div role="tabpanel" id="intro-draft-panel" aria-labelledby={`intro-draft-${part}`}>
          <Art
            key={part}
            active={active}
            litFrom={previous === 1}
            onBeat={(n) => setBeat({ part, n })}
            onDone={
              picked
                ? undefined
                : () => {
                    PART_MS[part] = settle(PART_MS[part], performance.now() - startedAt.current)
                    if (part === DRAFT_PARTS.length - 1) finish()
                    else show(part + 1)
                  }
            }
          />
        </div>
      }
      controls={
        <StepTabs
          id="intro-draft"
          label="Drafting"
          tabs={DRAFT_PARTS.map((p) => p.label)}
          current={part}
          onPick={pick}
          tabClassName="w-20"
        />
      }
      title={title}
    />
  )
}

/** Deliver's two ways to post: by hand, or handed to an agent. */
const DELIVER_WAYS = ["Post it yourself", "Have your agent do it"]

/**
 * Deliver: tabs for the two ways to post, as Draft's, with the title (the way's name) and a
 * line under them, then the drawing. Posting by hand is drawn; handing it to an agent is still
 * to come, so its panel says so.
 */
function Deliver({ active, deliver }: StepProps) {
  const touch = useTouch()
  const { way, pick: setWay } = deliver
  return (
    <Step
      controls={
        <StepTabs
          id="intro-deliver"
          label="Ways to post"
          tabs={DELIVER_WAYS}
          current={way}
          onPick={setWay}
          tabClassName="px-3"
        />
      }
      title={DELIVER_WAYS[way]}
      visual={
        <div role="tabpanel" id="intro-deliver-panel" aria-labelledby={`intro-deliver-${way}`}>
          {way === 0 ? (
            <ImagesArt active={active} />
          ) : (
            <div className="grid h-80 place-items-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              <div className="max-w-sm space-y-2">
                <BotIcon className="mx-auto size-8 text-(--brand-blue)" aria-hidden />
                <p className="font-medium text-foreground">Coming soon</p>
                <p className="text-balance">
                  An agent in your own browser fills in each platform&apos;s post from Crosspost and stops before Post, so
                  the last click stays yours.
                </p>
              </div>
            </div>
          )}
        </div>
      }
    >
      <p className="text-center text-base leading-5 text-balance">
        {way === 1
          ? "Hand the posts to an agent you already use."
          : touch
            ? "Open each post in the platform's app, or copy it, then bring the images over and post."
            : "Open each post prefilled, or copy it, then bring the images over and post."}
      </p>
    </Step>
  )
}

// What the app does, then what's in your hands, then the last steps, which are yours.
export const STEPS: { label: string; icon: LucideIcon; title: string; Body: (props: StepProps) => React.ReactNode }[] = [
  // The welcome card keeps the line breaks (its captions); the dialog's description reads them as spaces.
  { label: "Draft", icon: PenLineIcon, title: "Write once,\npreview everywhere", Body: Draft },
  { label: "Decide", icon: SignpostBigIcon, title: "Pick your\ndestinations", Body: Decide },
  // Both of Deliver's ways, by hand or handed off (its tabs).
  { label: "Deliver", icon: SendIcon, title: "Post it yourself,\nor let an agent", Body: Deliver },
]

// The steps as stops on a winding trail, a nod to the signpost, and a timeline of the
// introduction: a marker plays along the curve as the steps do, inking the way behind it, and
// can be dragged back and forth. Stops sit at 0, 50 and 100% along the path (the two halves
// are mirror images, so the same length): a place on the timeline runs from 0 (Draft) to 2
// (Deliver), each step taking the stretch up to the next stop.
// Exported for the welcome card, which draws the same trail (stretched to its width) and grows into this one.
export const TRAIL_W = 340
export const TRAIL_STOPS = [24, 170, 316]
export const TRAIL_Y = 58
export const TRAIL =
  "M24 58C60 58 65 70 97 70S135 58 170 58 205 46 243 46 280 58 316 58"
const TIMELINE_END = STEPS.length - 1
/** How long the marker takes to glide to a new place, after Next, Back or a stop. */
const JUMP_MS = 600
/** How long Decide's drawing plays before moving on to Deliver: a first guess, then what the last pass took. */
let DECIDE_MS = 8500
/** Dragged past here, the timeline is at its end: Deliver. */
const DELIVER_FROM = TIMELINE_END - 0.1

/** A stretch of the timeline for the marker to play: from one place to another over `ms`. */
type Stretch = { from: number; to: number; ms: number }

/** Whether the tour can grow out of the welcome card: view transitions, and motion not reduced. */
const canMorph = () =>
  typeof document.startViewTransition === "function" && !matchMedia("(prefers-reduced-motion: reduce)").matches

/** Held at a place: the marker stays put, once the person has taken over from auto-play. */
const still = (at: number): Stretch => ({ from: at, to: at, ms: 0 })

/**
 * Where Draft's tab `part` starts on the timeline: each tab's share of Draft's stretch is its
 * drawing's length, so the marker keeps one pace through them.
 */
function partStart(part: number) {
  const total = PART_MS.reduce((a, b) => a + b, 0)
  return PART_MS.slice(0, part).reduce((a, b) => a + b, 0) / total
}

/** Draft's tab at a place on its stretch. */
function partAt(place: number) {
  let part = 0
  while (part < DRAFT_PARTS.length - 1 && place >= partStart(part + 1)) part++
  return part
}

/** The stretch for `step` (and Draft's `part`), from `at` or the start of it. */
function stretchFor(step: number, part: number, at?: number): Stretch {
  if (step === 0) {
    const start = partStart(part)
    const end = partStart(part + 1)
    const from = Math.min(end, Math.max(start, at ?? start))
    return { from, to: end, ms: (PART_MS[part] * (end - from)) / (end - start) }
  }
  if (step === 1) {
    const from = Math.min(TIMELINE_END, Math.max(1, at ?? 1))
    return { from, to: TIMELINE_END, ms: DECIDE_MS * (TIMELINE_END - from) }
  }
  return { from: TIMELINE_END, to: TIMELINE_END, ms: 0 }
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

function Trail({
  step,
  stretch,
  onGo,
  onScrub,
  named,
}: {
  step: number
  stretch: Stretch
  onGo: (step: number) => void
  /** The marker was dragged to `at`; `done` once it's let go. */
  onScrub: (at: number, done: boolean) => void
  /** The stops' icons carry the welcome card's transition names (while the dialog is open, not as it closes). */
  named: boolean
}) {
  const reduced = useReducedMotion()
  const pathRef = useRef<SVGPathElement>(null)
  const inkRef = useRef<SVGPathElement>(null)
  const markerRef = useRef<HTMLSpanElement>(null)
  // Where the marker is drawn, and where it's held while dragged.
  const shown = useRef(stretch.from)
  const held = useRef<number | null>(null)
  const glide = useRef<{ from: number; start: number } | null>(null)

  const draw = (at: number) => {
    shown.current = at
    const percent = (at / TIMELINE_END) * 100
    if (markerRef.current) markerRef.current.style.offsetDistance = `${percent}%`
    if (inkRef.current) inkRef.current.style.strokeDashoffset = String(100 - percent)
  }

  // A new stretch: glide there from where the marker is (unless it was just let go there), then play it.
  useLayoutEffect(() => {
    glide.current = held.current === null && Math.abs(shown.current - stretch.from) > 0.001 ? { from: shown.current, start: performance.now() } : null
  }, [stretch])

  useEffect(() => {
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      let at: number
      if (held.current !== null) at = held.current
      else {
        const t = reduced || stretch.ms <= 0 ? 0 : Math.min(1, (now - start) / stretch.ms)
        at = stretch.from + (stretch.to - stretch.from) * t
        const g = glide.current
        if (g) {
          const k = reduced ? 1 : Math.min(1, (now - g.start) / JUMP_MS)
          if (k >= 1) glide.current = null
          else at = g.from + (at - g.from) * easeInOut(k)
        }
      }
      draw(at)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [stretch, reduced])

  /** The place on the timeline under the pointer: the point of the trail level with it, left to right. */
  const placeAt = (clientX: number) => {
    const path = pathRef.current
    const svg = path?.ownerSVGElement
    if (!path || !svg) return shown.current
    const box = svg.getBoundingClientRect()
    const x = (clientX - box.left) * (TRAIL_W / box.width)
    const total = path.getTotalLength()
    let lo = 0
    let hi = total
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2
      if (path.getPointAtLength(mid).x < x) lo = mid
      else hi = mid
    }
    return (lo / total) * TIMELINE_END
  }
  const hold = (e: React.PointerEvent) => {
    const at = placeAt(e.clientX)
    held.current = at
    glide.current = null
    onScrub(at, false)
  }
  const letGo = () => {
    const at = held.current
    if (at === null) return
    held.current = null
    onScrub(at, true)
  }

  return (
    <nav aria-label="Steps" className="relative h-[72px] shrink-0" style={{ width: TRAIL_W }}>
      <svg
        aria-hidden
        width={TRAIL_W}
        height={72}
        className="absolute inset-0 overflow-visible"
        fill="none"
        // The welcome card's trail grows into this one as the tour opens.
        style={{ viewTransitionName: named ? "tour-trail" : undefined }}
      >
        <path ref={pathRef} d={TRAIL} stroke="var(--border)" strokeWidth={2} strokeDasharray="2 5" strokeLinecap="round" />
        <path
          ref={inkRef}
          d={TRAIL}
          pathLength={100}
          stroke="var(--brand-blue)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray="100"
          strokeDashoffset={100}
        />
        {TRAIL_STOPS.map((x, i) => (
          <circle
            key={x}
            cx={x}
            cy={TRAIL_Y}
            r={4}
            className="transition-colors duration-700"
            style={{ fill: i <= step ? "var(--brand-blue)" : "var(--muted)" }}
          />
        ))}
      </svg>
      {/* The marker: a little fingerpost board, turning with the trail as it goes. */}
      <span
        ref={markerRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0"
        style={{ offsetPath: `path("${TRAIL}")`, offsetDistance: "0%", offsetRotate: "auto" }}
      >
        <svg width={18} height={12} viewBox="0 0 18 12" className="block drop-shadow-sm">
          <path d="M1 1.5h11.5L17 6l-4.5 4.5H1z" fill="var(--brand-blue)" stroke="var(--background)" strokeWidth={1.2} />
        </svg>
      </span>
      {/* The track, for dragging the marker: the pointer can wander off it, and the marker
          follows the curve, level with it. From the keyboard, the stops' buttons, and the arrow
          keys while the dialog itself has focus. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-[44px] bottom-0 cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          hold(e)
        }}
        onPointerMove={(e) => {
          if (held.current !== null) hold(e)
        }}
        onPointerUp={letGo}
        onPointerCancel={letGo}
      />
      {STEPS.map(({ label, icon: Icon }, i) => (
        <button
          key={label}
          type="button"
          onClick={() => onGo(i)}
          aria-current={i === step ? "step" : undefined}
          // The icon over the name, both centered on the step's stop.
          className={cn(
            "absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1.5 rounded-md px-1.5 py-0.5 text-base leading-5 font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            i === step ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          style={{ left: TRAIL_STOPS[i] }}
        >
          {/* Named for the view transition: the welcome card's stop icon flies here as the tour opens. */}
          <Icon
            className={cn("size-4 shrink-0", i === step && "text-(--brand-blue)")}
            style={{ viewTransitionName: named ? `tour-step-${i}` : undefined }}
          />
          {label}
        </button>
      ))}
    </nav>
  )
}

/**
 * The introduction, in three steps: Draft (what the app does), Decide (picking and ordering
 * the platforms, shown in a demonstration) and Deliver (the last steps, yours). It plays through
 * on its own until the person takes over (the trail, a stop, Next, Back or a tab), and from then
 * on goes only where they take it. The welcome card opens it (at any step, or from the start
 * with Take the Tour); it has no button of its own.
 */
export function IntroDialog() {
  const [open, setOpen] = useState(false)
  // Opened by growing out of the welcome card (a view transition), so it closes back into it:
  // the dialog's own fade and zoom stand aside for the morph.
  const [morph, setMorph] = useState(false)
  // Just grown out of the card: the step's content waits for the panel to arrive, then fades in.
  const [arriving, setArriving] = useState(false)
  const [step, setStep] = useState(0)
  const [part, setPart] = useState(0)
  const [previous, setPrevious] = useState<number | null>(null)
  const [picked, setPicked] = useState(false)
  // The person took over: no more moving on by itself, and the marker stays where it's put.
  const [manual, setManual] = useState(false)
  const [stretch, setStretch] = useState<Stretch>(() => stretchFor(0, 0))
  // Deliver's tab: Post it yourself, or Have your agent do it.
  const [way, setWay] = useState(0)
  // After Start, focus goes to Compose.
  const toCompose = useRef(false)
  // Next and Back walk every tab in turn: Draft's three, Decide, then Deliver's two. Back hides on
  // the first (Draft's Write); on the last (Deliver's agent tab), Next becomes Start.
  const first = step === 0 && part === 0
  const last = step === STEPS.length - 1 && way === DELIVER_WAYS.length - 1
  // The welcome card's title, which flaps into the tour's as the tour grows out of the card: read
  // when the tour opens (a ref, as the opener is registered once), and kept for that opening.
  const welcome = useWelcome()
  const cardTitle = useRef("Start here")
  useEffect(() => {
    cardTitle.current = welcome?.first ? "Start here" : "How it works"
  })
  const [titleFrom, setTitleFrom] = useState<string | undefined>(undefined)
  const { title, Body } = STEPS[step]

  /** Where the marker goes for a step: playing it, or held at its start once taken over. */
  const stretchAt = (to: number, toPart: number, held: boolean) => {
    const s = stretchFor(to, toPart)
    return held ? still(s.from) : s
  }
  /** Fresh at step `at` (Draft from its first tab), playing by itself. */
  const restart = (at = 0) => {
    setStep(at)
    setPart(0)
    setWay(0)
    setPrevious(null)
    setPicked(false)
    setManual(false)
    setStretch(stretchFor(at, 0))
  }
  // The welcome card opens it at a step.
  useEffect(
    () =>
      registerIntroOpener((at) => {
        const show = (grow: boolean) =>
          flushSync(() => {
            restart(at)
            setMorph(grow)
            setArriving(grow)
            setTitleFrom(grow ? cardTitle.current : undefined)
            setOpen(true)
            setTourOpen(true)
          })
        if (canMorph()) document.startViewTransition(() => show(true))
        else show(false)
      }),
    [],
  )
  const onOpenChange = (next: boolean) => {
    if (next) return
    const hide = () =>
      flushSync(() => {
        setOpen(false)
        setTourOpen(false)
      })
    // Back into the card it grew from (or, folded, just away).
    if (morph && canMorph()) document.startViewTransition(hide)
    else hide()
  }
  const contentRef = useRef<HTMLDivElement>(null)
  /** To step `to`: by the person's hand (taking over from auto-play), or as the drawings move on by themselves (`auto`). */
  const go = (to: number, auto = false) => {
    if (auto && manual) return
    const held = manual || !auto
    if (!auto) {
      setManual(true)
      setPicked(true)
    }
    const next = Math.min(STEPS.length - 1, Math.max(0, to))
    // Back hides on the first step: focus moves to the dialog, where the arrow keys work.
    if (next === 0 && contentRef.current?.contains(document.activeElement) && document.activeElement?.textContent === "Back")
      contentRef.current.focus()
    setStep(next)
    setStretch(stretchAt(next, part, held))
  }
  const showPart = (next: number, held = manual) => {
    setPrevious(part)
    setPart(next)
    setStretch(stretchAt(0, next, held))
  }
  const draft: DraftTabs = {
    part,
    previous,
    picked,
    show: (next) => showPart(next),
    finish: () => go(1, true),
    pick: (i) => {
      setManual(true)
      setPicked(true)
      if (i !== part) showPart(i, true)
    },
  }
  const pickWay = (next: number) => {
    setManual(true)
    setPicked(true)
    setWay(next)
  }
  /** Next: the next tab within a step (Draft's, Deliver's), else on to the next step's first. */
  const forward = () => {
    if (step === 0 && part < DRAFT_PARTS.length - 1) return draft.pick(part + 1)
    if (step === STEPS.length - 1) {
      if (way < DELIVER_WAYS.length - 1) pickWay(way + 1)
      return
    }
    if (step === 1) setWay(0)
    go(step + 1)
  }
  /** Back: the tab before within a step, else the last tab of the step before. */
  const backward = () => {
    if (step === STEPS.length - 1 && way > 0) return pickWay(way - 1)
    if (step === 0) {
      if (part === 0) return
      // Back hides on the first tab: focus moves to the dialog, where the arrow keys work.
      if (part === 1 && document.activeElement?.textContent === "Back") contentRef.current?.focus()
      return draft.pick(part - 1)
    }
    if (step === 1) {
      go(0)
      return showPart(DRAFT_PARTS.length - 1, true)
    }
    go(step - 1)
  }
  /** The marker dragged along the timeline: the step and Draft's tab follow it, and it plays on from where it's let go. */
  const scrub = (at: number, done: boolean) => {
    const place = at >= DELIVER_FROM ? TIMELINE_END : at
    const nextStep = place >= TIMELINE_END ? TIMELINE_END : Math.floor(place)
    const nextPart = nextStep === 0 ? partAt(place) : part
    if (nextStep !== step) setStep(nextStep)
    if (nextStep === 0 && nextPart !== part) {
      setPrevious(part)
      setPart(nextPart)
    }
    // Let go: it stays there, and nothing moves on by itself any more.
    if (done) {
      setManual(true)
      setPicked(true)
      setStretch(still(stretchFor(nextStep, nextPart, place).from))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        showCloseButton={false}
        // Pinned near the top rather than centered, so the steps and buttons stay put while
        // the content below changes height; a long step scrolls under them.
        className={cn(
          "top-[max(1rem,6dvh)] flex max-h-[calc(100dvh-max(1rem,6dvh)-1rem)] translate-y-0 flex-col gap-0 p-0 sm:max-w-2xl",
          // The welcome card's transition name while open, so the card grows into it and back.
          open && "[view-transition-name:tour]",
          // Important, to win over the dialog's own enter and exit animations.
          morph && "data-[state=closed]:animate-none! data-[state=open]:animate-none!",
        )}
        // Focus the dialog itself, as Settings does, so the arrow keys work straight away.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).focus()
        }}
        onCloseAutoFocus={(e) => {
          if (!toCompose.current) return
          toCompose.current = false
          e.preventDefault()
          document.getElementById("compose")?.focus()
        }}
        onKeyDown={(e) => {
          // Only on the dialog itself: tiles moved with the keyboard use the arrows too.
          if (e.target !== e.currentTarget) return
          if (e.key === "ArrowRight") forward()
          else if (e.key === "ArrowLeft") backward()
        }}
      >
        {/* The header, as the welcome card's: the title ("Take the tour", which "Start here" turns
            into as the tour grows out of the card) and an X that closes into Compose. Under it,
            Back on the left, the trail in the middle and Next on the right (Start on the last
            step, which also folds the welcome card). The trail and its labels never move: the
            button columns are fixed widths, and Back keeps its space while hidden. Phones: the
            trail on its own row, with Back and Next under it. */}
        <div className="border-b px-6 pt-4 pb-2 max-sm:px-4">
          <div className="flex items-center gap-2">
            {/* A fixed width, the same as the card's title, so the morph carries the words without
                stretching them. Grown out of the card, the card's title flaps into this one as it
                travels; otherwise it rises in. */}
            <p
              aria-hidden
              className="mr-auto inline-block w-40 text-lg font-semibold"
              style={{ viewTransitionName: open ? "tour-title" : undefined }}
            >
              {titleFrom ? (
                <FlapText from={titleFrom} to="Take the tour" />
              ) : (
                <WaveText text="Take the tour" mode="enter" />
              )}
            </p>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close the tour"
              className="-my-2 -mr-2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                toCompose.current = true
                onOpenChange(false)
              }}
            >
              <XIcon />
            </Button>
          </div>
          <div className="mt-1 grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center gap-x-4 max-sm:grid-cols-[4.5rem_4.5rem] max-sm:justify-between max-sm:gap-y-2 sm:gap-x-6">
            {/* Phones: the trail (340px) scaled to 90% so its end stops' names fit the panel. */}
            <div className="justify-self-center max-sm:col-span-2 max-sm:scale-90 sm:col-start-2">
              <Trail step={step} stretch={stretch} onGo={go} onScrub={scrub} named={open} />
            </div>
            <Button
              variant="secondary"
              onClick={backward}
              className={cn("w-full sm:col-start-1 sm:row-start-1", first && "invisible")}
              tabIndex={first ? -1 : undefined}
              aria-hidden={first || undefined}
            >
              Back
            </Button>
            <Button
              className="w-full sm:col-start-3 sm:row-start-1"
              onClick={() => {
                if (!last) return forward()
                toCompose.current = true
                // Start, at the end: the welcome card folds to its button below Compose.
                setWelcomeFolded(true)
                onOpenChange(false)
              }}
            >
              {last ? "Start" : "Next"}
            </Button>
          </div>
        </div>

        <div
          key={step}
          className={cn(
            "min-h-0 overflow-y-auto p-6 animate-in fade-in [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]",
            // Grown out of the card: the step's words, which faded with the card's captions on the
            // way, come back once the panel has arrived (the morph takes 450ms).
            arriving && "animation-duration-400 delay-450 fill-mode-backwards",
          )}
          onAnimationEnd={(e) => e.target === e.currentTarget && setArriving(false)}
        >
          <DialogDescription className="sr-only">
            How Crosspost works, step {step + 1} of {STEPS.length}: {title}.
          </DialogDescription>
          <Body active={open} draft={draft} deliver={{ way, pick: pickWay }} next={() => go(step + 1, true)} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
