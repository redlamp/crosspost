"use client"

import { CheckIcon, CopyIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

// The async clipboard API can be blocked (permissions, embedded browsers), so
// fall back to the older selection-based copy.
async function writeClipboard(text: string) {
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
}

export function CopyButton({ text, label = "Copy", what }: Props) {
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
      toast.success(`Copied ${what}`)
    } catch {
      toast.error(`Couldn't copy ${what}. Select the text and copy it instead.`)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={copy} aria-label={`Copy ${what}`}>
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : label}
    </Button>
  )
}
