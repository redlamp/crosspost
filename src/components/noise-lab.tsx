"use client"

import { useEffect, useState } from "react"

// A development-only panel for tuning the page background's noise live. Open the dev
// server with ?lab in the URL. It overrides the theme's values while open; copy the
// numbers it shows back into globals.css (--background-noise, --background-noise-size).

type Noise = { strength: number; frequency: number; octaves: number; size: number }

const START: Noise = { strength: 0.09, frequency: 0.85, octaves: 3, size: 200 }

function noiseUrl({ strength, frequency, octaves, size }: Noise) {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
    `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='${octaves}' stitchTiles='stitch'/>` +
    `<feColorMatrix type='saturate' values='0'/></filter>` +
    `<rect width='100%' height='100%' filter='url(#n)' opacity='${strength}'/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

const SLIDERS: { key: keyof Noise; label: string; min: number; max: number; step: number }[] = [
  { key: "strength", label: "Strength", min: 0, max: 0.4, step: 0.01 },
  { key: "frequency", label: "Grain (frequency)", min: 0.2, max: 2, step: 0.05 },
  { key: "octaves", label: "Detail (octaves)", min: 1, max: 5, step: 1 },
  { key: "size", label: "Tile size (px)", min: 64, max: 512, step: 16 },
]

export function NoiseLab() {
  const [open, setOpen] = useState(false)
  const [noise, setNoise] = useState(START)

  useEffect(() => {
    // Read after mount, so the server render and first client render match.
    const timer = setTimeout(() => setOpen(new URLSearchParams(location.search).has("lab")), 0)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!open) return
    const root = document.documentElement.style
    root.setProperty("--background-noise", noiseUrl(noise))
    root.setProperty("--background-noise-size", `${noise.size}px`)
    return () => {
      root.removeProperty("--background-noise")
      root.removeProperty("--background-noise-size")
    }
  }, [open, noise])

  if (!open) return null

  return (
    <aside
      aria-label="Noise lab"
      className="fixed bottom-4 left-4 z-50 w-72 space-y-3 rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-lg"
    >
      <h2 className="font-semibold">Noise lab</h2>
      {SLIDERS.map(({ key, label, min, max, step }) => (
        <label key={key} className="block space-y-1">
          <span className="flex justify-between text-muted-foreground">
            {label}
            <span className="font-mono text-foreground">{noise[key]}</span>
          </span>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={noise[key]}
            onChange={(e) => setNoise((n) => ({ ...n, [key]: Number(e.target.value) }))}
            className="w-full accent-(--brand-blue)"
          />
        </label>
      ))}
      <p className="text-muted-foreground">
        Applies to the current theme while this is open. Send me the numbers per theme.
      </p>
    </aside>
  )
}
