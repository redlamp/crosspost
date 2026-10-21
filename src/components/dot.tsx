import { cn } from "@/lib/utils"

/**
 * A middle dot between bits of text, drawn rather than typed so it spaces the same in any
 * font (some, like Overpass, give "·" no width, so it crowds the text after it). Centered on
 * the x-height in running text. The typed dot stays for screen readers (and copying),
 * visually hidden.
 */
export function Dot({ className }: { className?: string }) {
  return (
    <>
      <span
        aria-hidden
        className={cn("mx-1.5 inline-block size-[3px] shrink-0 rounded-full bg-current align-middle", className)}
      />
      <span className="sr-only"> · </span>
    </>
  )
}
