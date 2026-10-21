"use client"

import { RotateCcwIcon } from "lucide-react"
import { useEffect, useState, useSyncExternalStore } from "react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"

// A development-only panel for tuning the page background's noise live. Open the dev
// server with ?lab in the URL. Each theme has its own settings, and the panel edits the
// theme on screen; they override globals.css while it's open. Copy the values it shows
// back into globals.css (--background-noise, -size, -blend) to make them the defaults.

type Settings = {
  blend: string
  strength: number
  contrast: number
  frequency: number
  octaves: number
  size: number
}
type Theme = "dark" | "light"

// Where each theme starts: the site's defaults in globals.css, as tuned here. Dark uses soft
// light (keeps the page's brightness); light uses multiply (darker specks only).
const RECOMMENDED: Record<Theme, Settings> = {
  dark: { blend: "soft-light", strength: 0.35, contrast: 3, frequency: 0.7, octaves: 2, size: 256 },
  light: { blend: "multiply", strength: 0.15, contrast: 2.5, frequency: 0.7, octaves: 2, size: 256 },
}

// How the noise layer mixes with the gradient under it (CSS background-blend-mode).
const BLENDS = [
  { value: "normal", note: "lightens a dark page as it gets stronger" },
  { value: "soft-light", note: "keeps brightness; light and dark specks" },
  { value: "overlay", note: "like soft light, more contrast" },
  { value: "multiply", note: "darkens only" },
  { value: "screen", note: "lightens only" },
]

const SLIDERS: { key: Exclude<keyof Settings, "blend">; label: string; min: number; max: number; step: number }[] = [
  { key: "strength", label: "Strength", min: 0, max: 0.6, step: 0.01 },
  { key: "contrast", label: "Contrast", min: 1, max: 6, step: 0.25 },
  { key: "frequency", label: "Grain (frequency)", min: 0.2, max: 2, step: 0.05 },
  { key: "octaves", label: "Detail (octaves)", min: 1, max: 5, step: 1 },
  { key: "size", label: "Tile size (px)", min: 64, max: 512, step: 16 },
]

function noiseUrl({ strength, frequency, octaves, size, contrast }: Settings) {
  // Fractal noise clusters around middle gray; stretching it around 50% (slope = contrast)
  // pushes the specks toward black and white, so the grain reads at lower strength.
  const fn = (c: string) => `<feFunc${c} type='linear' slope='${contrast}' intercept='${(1 - contrast) / 2}'/>`
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
    `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='${octaves}' stitchTiles='stitch'/>` +
    `<feColorMatrix type='saturate' values='0'/>` +
    `<feComponentTransfer>${fn("R")}${fn("G")}${fn("B")}</feComponentTransfer></filter>` +
    `<rect width='100%' height='100%' filter='url(#n)' opacity='${strength}'/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** The theme on screen, following the class next-themes sets on <html>. */
function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => {
      const observer = new MutationObserver(listener)
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
      return () => observer.disconnect()
    },
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "dark",
  )
}

export function NoiseLab() {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState(RECOMMENDED)
  // Show or hide the noise, to compare the background with and without it.
  const [visible, setVisible] = useState(true)
  const theme = useTheme()
  const current = settings[theme]
  const update = (change: Partial<Settings>) => setSettings((s) => ({ ...s, [theme]: { ...s[theme], ...change } }))

  useEffect(() => {
    // Read after mount, so the server render and first client render match.
    const timer = setTimeout(() => setOpen(new URLSearchParams(location.search).has("lab")), 0)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!open) return
    const root = document.documentElement.style
    root.setProperty("--background-noise", visible ? noiseUrl(current) : "none")
    root.setProperty("--background-noise-size", `${current.size}px`)
    root.setProperty("--background-noise-blend", current.blend)
    return () => {
      root.removeProperty("--background-noise")
      root.removeProperty("--background-noise-size")
      root.removeProperty("--background-noise-blend")
    }
  }, [open, current, visible])

  if (!open) return null

  return (
    <aside
      aria-label="Noise lab"
      className="fixed bottom-4 left-4 z-50 w-72 space-y-3 rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-lg"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">
          Noise lab <span className="font-normal text-muted-foreground">· {theme} theme</span>
        </h2>
        <label className="flex items-center gap-2 text-muted-foreground">
          {visible ? "On" : "Off"}
          <Switch checked={visible} onCheckedChange={setVisible} aria-label="Show the noise" />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-muted-foreground">Blend mode</span>
        <select
          value={current.blend}
          onChange={(e) => update({ blend: e.target.value })}
          className="h-9 w-full rounded-md border bg-background px-2 text-foreground"
        >
          {BLENDS.map(({ value, note }) => (
            <option key={value} value={value}>
              {value} ({note})
            </option>
          ))}
        </select>
      </label>
      {SLIDERS.map(({ key, label, min, max, step }) => (
        <label key={key} className="block space-y-1">
          <span className="flex justify-between text-muted-foreground">
            {label}
            <span className="font-mono text-foreground">{current[key]}</span>
          </span>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={current[key]}
            onChange={(e) => update({ [key]: Number(e.target.value) })}
            className="w-full accent-(--brand-blue)"
          />
        </label>
      ))}
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground">Switch themes to tune the other one.</p>
        <Button variant="outline" size="sm" onClick={() => update(RECOMMENDED[theme])}>
          <RotateCcwIcon />
          Reset
        </Button>
      </div>
    </aside>
  )
}
