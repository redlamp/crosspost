"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Props = {
  icon: React.ReactNode
  label: string
  /** What the button reads while it waits for the second click. */
  confirmLabel?: string
  onConfirm: () => void
  disabled?: boolean
}

/**
 * A button that turns red and reads "Confirm" on the first click, and acts on
 * the second. It backs out on blur, Escape, or after a few seconds.
 */
export function ConfirmButton({ icon, label, confirmLabel = "Confirm", onConfirm, disabled }: Props) {
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 5000)
    return () => clearTimeout(timer)
  }, [confirming])

  return (
    <Button
      variant={confirming ? "destructive" : "outline"}
      // Outline has a 1px border and destructive none; keep one so the width holds.
      className={cn("border", confirming && "border-transparent")}
      onClick={() => {
        if (!confirming) return setConfirming(true)
        setConfirming(false)
        onConfirm()
      }}
      onBlur={() => setConfirming(false)}
      onKeyDown={(e) => e.key === "Escape" && setConfirming(false)}
      disabled={disabled}
    >
      {icon}
      {/* Both labels share one grid cell, so the button keeps the wider one's width. */}
      <span className="grid">
        <span className={cn("col-start-1 row-start-1", confirming && "invisible")}>{label}</span>
        <span className={cn("col-start-1 row-start-1", !confirming && "invisible")}>{confirmLabel}</span>
      </span>
    </Button>
  )
}
