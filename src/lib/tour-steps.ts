import { FlagIcon, PenLineIcon, SendIcon, SignpostBigIcon, type LucideIcon } from "lucide-react"

// The tour's steps and its trail, shared by the welcome card and the tour's dialog
// (src/components/intro-dialog.tsx, which adds each step's body). Kept apart from the dialog so the
// card, which is on every page load, doesn't pull the dialog and its drawings in with it: those
// load on demand (src/components/intro-loader.tsx).

/**
 * What the app does, then what's in your hands, then the last steps, which are yours, then the
 * end of the trail (the tour only: the welcome card shows the first three). The card keeps the
 * titles' line breaks (its captions); the dialog's description reads them as spaces.
 */
export const TOUR_STEPS: { label: string; icon: LucideIcon; title: string }[] = [
  { label: "Draft", icon: PenLineIcon, title: "Write once,\npreview everywhere" },
  { label: "Decide", icon: SignpostBigIcon, title: "Pick your\ndestinations" },
  { label: "Deliver", icon: SendIcon, title: "Open or copy,\nthen post it" },
  { label: "Done", icon: FlagIcon, title: "You're ready!" },
]

// The steps as stops on a winding trail, a nod to the signpost, and a timeline of the
// introduction: a marker plays along the curve as the steps do, inking the way behind it, and
// can be dragged back and forth. The tour's trail goes one stop further than the card's, to
// Done. Its three stretches are the same curve (the middle one mirrored), so the stops sit at
// even thirds of its length: a place on the timeline runs from 0 (Draft) to 3 (Done), each
// step taking the stretch up to the next stop. Small unlabeled nodes mark the tabs within a
// step: Split and Images on Draft's stretch (and Deliver's ways, when it has more than one).
export const TRAIL_W = 430
export const TRAIL_STOPS = [20, 150, 280, 410]
export const TRAIL_Y = 58
export const TRAIL =
  "M20 58c32.5 0 32.5 10 65 10s32.5 -10 65 -10c32.5 0 32.5 -10 65 -10s32.5 10 65 10c32.5 0 32.5 10 65 10s32.5 -10 65 -10"
// The dotted way, in two: up to Deliver, the welcome card's own trail at the same size (so the
// card's Draft to Deliver keeps its width as it becomes the tour's), and on to Done, which then
// draws out from Deliver as the tour's addition.
export const TRAIL_TO_DELIVER = "M20 58c32.5 0 32.5 10 65 10s32.5 -10 65 -10c32.5 0 32.5 -10 65 -10s32.5 10 65 10"
export const TRAIL_TO_DONE = "M280 58c32.5 0 32.5 10 65 10s32.5 -10 65 -10"

// The welcome card's trail: Draft, Decide and Deliver, the tour's first two stretches as they are.
export const CARD_TRAIL_W = TRAIL_STOPS[2] + 20
export const CARD_TRAIL_STOPS = TRAIL_STOPS.slice(0, 3)
export const CARD_TRAIL_Y = TRAIL_Y
export const CARD_TRAIL = TRAIL_TO_DELIVER
