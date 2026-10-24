"use client"

import { CheckIcon, CopyIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// Copied: a finished task, not a disabled one. The app's blue, as on the copied-image checks; still clickable.
const DONE =
  "border-(--brand-blue)/60 bg-(--brand-blue)/10 text-(--brand-blue-text) hover:bg-(--brand-blue)/20 hover:text-(--brand-blue-text)"

// The async clipboard API can be blocked (permissions, embedded browsers), so
// fall back to the older selection-based copy.
export async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {}
  const area = document.createElement("textarea")
  area.value = text
  area.setAttribute("readonly", "")
  area.style.position = "fixed"
  area.style.opacity = "0"
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand("copy")
  area.remove()
  if (!ok) throw new Error("copy failed")
}

type Props = {
  text: string
  label?: string
  /** Names what was copied in the toast, e.g. "Twitter post 2". */
  what: string
  /** Copied before (kept across reloads): the button stays done until the text changes. */
  done?: boolean
  onCopied?: () => void
  /** Just the icon, with its label in a hover card below. */
  iconOnly?: boolean
}

export function CopyButton({ text, label = "Copy", what, done = false, onCopied, iconOnly = false }: Props) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const copy = async () => {
    try {
      await writeClipboard(text)
      setCopied(true)
      onCopied?.()
      toast.success(`Copied ${what}`)
    } catch {
      toast.error(`Couldn't copy ${what}. Select the text and copy it instead.`)
    }
  }

  const shown = copied || done
  const button = (
    <Button
      variant="outline"
      size={iconOnly ? "icon-sm" : "sm"}
      onClick={copy}
      aria-label={done ? `Copy ${what} again (copied)` : `Copy ${what}`}
      className={cn(shown && DONE)}
    >
      {shown ? <CheckIcon /> : <CopyIcon />}
      {!iconOnly && (shown ? "Copied" : label)}
    </Button>
  )
  if (!iconOnly) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom">{shown ? "Copied" : label}</TooltipContent>
    </Tooltip>
  )
}
