import { CHANGELOG } from "@/lib/changelog"

// The What's New entries as a static file (/crosspost/changelog.json), so other pages can mirror
// them; the portfolio's case study reads it. GitHub Pages serves it to any origin.
export const dynamic = "force-static"

export function GET() {
  return Response.json(CHANGELOG)
}
