"use client"

import dynamic from "next/dynamic"

// Development-only tools. In a production build the condition is a constant, so the
// import below is dropped and none of this code ships with the site.
export const DevTools =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("@/components/noise-lab").then((m) => m.NoiseLab), { ssr: false })
    : () => null
