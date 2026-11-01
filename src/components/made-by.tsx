"use client"

import { CircleHelpIcon, GlobeIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { ChangelogDialog } from "@/components/changelog-dialog"
import { Dot } from "@/components/dot"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { linkedin } from "@/lib/adapters/linkedin"
import { fetchViewCount } from "@/lib/analytics"
import { cn } from "@/lib/utils"

// Simple Icons' GitHub mark (lucide no longer ships brand logos).
const GITHUB_PATH =
  "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"

const brandMark = (path: string) =>
  function Mark() {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
        <path d={path} />
      </svg>
    )
  }

const LINKS = [
  { label: "Portfolio", href: "https://redlamp.org", Icon: () => <GlobeIcon className="size-4" /> },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/redlamp/", Icon: brandMark(linkedin.brand.iconPath) },
  { label: "Crosspost on GitHub", href: "https://github.com/redlamp/crosspost", Icon: brandMark(GITHUB_PATH) },
]

/** Who made Crosspost, and where to find them. The caller places it. */
export function MadeBy({ className }: { className?: string }) {
  // Undefined while GoatCounter is asked; then its count, or 1 (this visit) when it has none to give.
  const [views, setViews] = useState<number>()
  useEffect(() => {
    let live = true
    fetchViewCount().then((n) => live && setViews(n ?? 1))
    return () => {
      live = false
    }
  }, [])
  return (
    <footer className={cn("@container flex items-center justify-between gap-3 text-sm text-foreground/70", className)}>
      {/* Rendered at build time; the year may differ from the visitor's clock until the next deploy. */}
      <p suppressHydrationWarning>
        {new Date().getFullYear()}
        <Dot />
        Made by Taylor Wright
        {/* The version and the views share a second line wherever the footer is too narrow for
            one (phones, and the side column on desktops), so no dot is left trailing a wrap. */}
        <Dot className="@max-[31rem]:hidden" />
        <span className="@max-[31rem]:block">
          {/* The version, from package.json, opening the changelog. */}
          <ChangelogDialog />
          <Dot />
          {/* The page's views from GoatCounter (src/lib/analytics.ts), with a ? saying how
              they're counted. The number shows once GoatCounter answers. As tall as the
              version's button (24px) and set at the line's top, so the ? centers with the
              links' icons; on the baseline it rode 3px high. */}
          <span className="inline-flex h-6 items-center gap-1.5 align-top">
            {views !== undefined && (
              <span className="tabular-nums">
                {views.toLocaleString()} {views === 1 ? "view" : "views"}
              </span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="About the view count: anonymous counts, no cookies stored"
                  // A 16px icon with a 28px hit area (the pseudo-element), for fingers.
                  className="relative rounded-full transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
                >
                  <CircleHelpIcon className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Anonymous counts.
                <br />
                No cookies stored.
              </TooltipContent>
            </Tooltip>
          </span>
        </span>
      </p>
      <ul className="flex items-center gap-1">
        {LINKS.map(({ label, href, Icon }) => (
          <li key={label}>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="grid size-9 place-items-center rounded-md transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Icon />
                </a>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ul>
    </footer>
  )
}
