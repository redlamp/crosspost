"use client"

import { MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * Switch the theme with the new one blooming out from the page's blue glow (its corner at the
 * lower right of the content) over the old: a view transition, masked by a soft-edged circle
 * that grows until it covers the window (see globals.css). Where there are no view transitions,
 * or motion is reduced, it simply switches.
 */
function switchTheme(next: string, setTheme: (theme: string) => void) {
  const root = document.documentElement
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
  if (reduced || typeof document.startViewTransition !== "function") return setTheme(next)
  // Where the glow sits: the body's radial gradient centers there (globals.css).
  const x = innerWidth / 2 + Math.min(innerWidth / 2, 640) - 24
  const y = innerHeight
  root.style.setProperty("--theme-x", `${x}px`)
  root.style.setProperty("--theme-y", `${y}px`)
  root.style.setProperty("--theme-r", `${Math.hypot(Math.max(x, innerWidth - x), y)}px`)
  const transition = document.startViewTransition(() => {
    // Applied at once, inside the transition, so the new snapshot has it; next-themes then
    // keeps the choice (and sets the same class again).
    root.classList.remove("light", "dark")
    root.classList.add(next)
    root.style.colorScheme = next
    setTheme(next)
  })
  // A second click mid-bloom skips this one (the theme still switches): nothing to report.
  transition.ready.catch(() => {})
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  // Both icons render and CSS picks one, so server and client markup match. The hover card
  // names the theme a click switches to (it only renders once open, on the client).
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle light and dark theme"
          onClick={() => switchTheme(resolvedTheme === "dark" ? "light" : "dark", setTheme)}
        >
          <SunIcon className="hidden dark:block" />
          <MoonIcon className="dark:hidden" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{resolvedTheme === "dark" ? "Light theme" : "Dark theme"}</TooltipContent>
    </Tooltip>
  )
}
