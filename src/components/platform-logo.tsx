import type { PlatformAdapter } from "@/lib/adapters"
import { cn } from "@/lib/utils"

/**
 * The platform's square mark, filled with --brand (set by the card). `bare` leaves out the white
 * under a mark's cut-out letter (Facebook's f, LinkedIn's in), for a mark drawn in one color on
 * the brand's own, where the letter should show the color behind it.
 */
export function PlatformLogo({ adapter, className, bare }: { adapter: PlatformAdapter; className?: string; bare?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
      className={cn("size-5 shrink-0 fill-(--brand)", className)}
    >
      {!bare && adapter.brand.whiteGlyph === "circle" && <circle cx="12" cy="12" r="11.6" fill="white" />}
      {!bare && adapter.brand.whiteGlyph === "square" && <rect x="2" y="2" width="20" height="20" fill="white" />}
      <path d={adapter.brand.iconPath} />
    </svg>
  )
}
