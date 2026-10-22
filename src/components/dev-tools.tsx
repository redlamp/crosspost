"use client"

import dynamic from "next/dynamic"

// Development-only tools. In a production build the condition is a constant, so the
// imports below are dropped and none of this code ships with the site.
const labs =
  process.env.NODE_ENV === "development"
    ? [
        dynamic(() => import("@/components/noise-lab").then((m) => m.NoiseLab), { ssr: false }),
        dynamic(() => import("@/components/clipboard-lab").then((m) => m.ClipboardLab), { ssr: false }),
      ]
    : []

export function DevTools() {
  return labs.map((Lab, i) => <Lab key={i} />)
}
