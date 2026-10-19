import type { PlatformAdapter } from "@/lib/adapters"
import { cn } from "@/lib/utils"

/** The platform's square mark, filled with --brand (set by the card). */
export function PlatformLogo({ adapter, className }: { adapter: PlatformAdapter; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
      className={cn("size-5 shrink-0 fill-(--brand)", className)}
    >
      {adapter.brand.whiteGlyph === "circle" && <circle cx="12" cy="12" r="11.6" fill="white" />}
      {adapter.brand.whiteGlyph === "square" && <rect x="2" y="2" width="20" height="20" fill="white" />}
      <path d={adapter.brand.iconPath} />
    </svg>
  )
}
