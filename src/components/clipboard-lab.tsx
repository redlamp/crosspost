"use client"

import { ClipboardCopyIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"

// A development-only panel for one question: can a single clipboard item whose text/html
// carries every staged image as <img src="data:..."> paste all of them at once into a
// rich-text composer? Open the dev server with ?lab in the URL.
//
// Local results, 2026-10-22 (Chromium in the desktop app's built-in browser, two 160x120
// PNGs and a one-line draft; HTML about 5 KB):
// - HTML only, HTML + text, HTML + PNG: navigator.clipboard.write failed with "Write
//   permission denied" (that browser denies clipboard-write outright, writeText too), so
//   the three async variants are untested here. Run them in desktop Chrome or Edge.
// - Copy event (added for that reason): execCommand("copy") on a real click wrote
//   text/html and text/plain; the HTML carried the draft paragraph and both <img> tags.
// - Pasting: synthetic Ctrl+V in that browser never fires a paste event, so the boxes were
//   fed a dispatched paste event with the copied data. The report showed text/html with
//   2 <img>, and Chromium's insertHTML (what a rich editor does with pasted HTML) kept
//   both data: images in the contenteditable. A paste carrying a file stays in the panel
//   and is not staged by the page.
// So the payload survives a copy and an HTML insert; whether LinkedIn or Facebook keep
// data: images from pasted HTML, or strip them, needs a real paste on those sites.

type Variant = "html" | "html-text" | "html-png" | "copy-event"

const VARIANTS: { id: Variant; label: string; note: string }[] = [
  { id: "html", label: "HTML only", note: "text/html: every image plus the draft" },
  { id: "html-text", label: "HTML + text", note: "adds text/plain with the draft" },
  { id: "html-png", label: "HTML + PNG", note: "adds image/png of the first image" },
  { id: "copy-event", label: "Copy event", note: "HTML + text through a copy event, no async API" },
]

type Staged = { name: string; blob: Blob }

// Read the staged images straight from IndexedDB (the same store images.ts writes), read
// only, so this panel can never overwrite what the composer saved.
function loadStaged(): Promise<Staged[]> {
  return new Promise((resolve) => {
    const req = indexedDB.open("crosspost", 1)
    req.onupgradeneeded = () => req.result.createObjectStore("images")
    req.onerror = () => resolve([])
    req.onsuccess = () => {
      const db = req.result
      const get = db.transaction("images").objectStore("images").get("staged")
      get.onsuccess = () => {
        resolve((get.result as Staged[] | undefined) ?? [])
        db.close()
      }
      get.onerror = () => {
        resolve([])
        db.close()
      }
    }
  })
}

function loadDraft(): string {
  try {
    return (JSON.parse(localStorage.getItem("crosspost:draft") ?? '""') as string) || ""
  } catch {
    return ""
  }
}

// Same conversion as images.ts (not exported there): browsers only write PNG.
async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0)
  return new Promise((resolve, reject) =>
    canvas.toBlob((png) => (png ? resolve(png) : reject(new Error("convert failed"))), "image/png"),
  )
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

async function buildHtml(images: Staged[], draft: string): Promise<string> {
  const paragraphs = draft
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
  const imgs = await Promise.all(
    images.map(async (img) => `<img src="${await dataUrl(await toPng(img.blob))}" alt="${escape(img.name)}">`),
  )
  return `<div>${paragraphs.join("")}${imgs.map((i) => `<p>${i}</p>`).join("")}</div>`
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`

type Report = { target: string; lines: string[] }

function describePaste(e: React.ClipboardEvent, target: string): Report {
  const data = e.clipboardData
  const html = data.getData("text/html")
  const htmlImgs = html ? new DOMParser().parseFromString(html, "text/html").querySelectorAll("img").length : 0
  const files = [...data.files]
  return {
    target,
    lines: [
      `types: ${[...data.types].join(", ") || "none"}`,
      `text/html: ${html ? `${kb(html.length)}, ${htmlImgs} <img>` : "absent"}`,
      `files: ${files.length ? files.map((f) => `${f.type} ${kb(f.size)}`).join("; ") : "none"}`,
    ],
  }
}

export function ClipboardLab() {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [status, setStatus] = useState("")
  const [report, setReport] = useState<Report | null>(null)
  const box = useRef<HTMLDivElement>(null)
  // The copy-event variant has to set its data synchronously, so its HTML is built ahead.
  const prebuilt = useRef({ html: "", draft: "" })

  useEffect(() => {
    const timer = setTimeout(() => setOpen(new URLSearchParams(location.search).has("lab")), 0)
    return () => clearTimeout(timer)
  }, [])

  const refresh = async () => {
    const list = await loadStaged()
    const draft = loadDraft()
    prebuilt.current = { html: await buildHtml(list, draft), draft }
    setCount(list.length)
  }
  useEffect(() => {
    if (!open) return
    // Rebuilt every few seconds, so the copy-event variant carries the current draft.
    const timer = setTimeout(() => void refresh(), 0)
    const interval = setInterval(() => void refresh(), 3000)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [open])

  // The older path: execCommand("copy") fires a copy event whose clipboardData takes any
  // string types. It runs where the async clipboard API is blocked.
  const copyViaEvent = () => {
    const { html, draft } = prebuilt.current
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault()
      e.clipboardData?.setData("text/html", html)
      e.clipboardData?.setData("text/plain", draft)
    }
    document.addEventListener("copy", onCopy, { once: true })
    const ok = document.execCommand("copy")
    document.removeEventListener("copy", onCopy)
    setStatus(ok ? `Copied "Copy event": ${count} images, HTML ${kb(html.length)}` : "Copy failed: execCommand returned false")
  }

  const copy = async (variant: Variant) => {
    if (variant === "copy-event") return copyViaEvent()
    setStatus("Copying...")
    // Promises inside the item keep the click's permission while the images convert.
    const staged = loadStaged()
    const draft = loadDraft()
    const html = staged.then((images) => buildHtml(images, draft))
    const parts: Record<string, Promise<Blob>> = {
      "text/html": html.then((h) => new Blob([h], { type: "text/html" })),
    }
    if (variant === "html-text") parts["text/plain"] = Promise.resolve(new Blob([draft], { type: "text/plain" }))
    if (variant === "html-png") {
      parts["image/png"] = staged.then((images) => {
        if (!images[0]) throw new Error("no staged image")
        return toPng(images[0].blob)
      })
    }
    try {
      await navigator.clipboard.write([new ClipboardItem(parts)])
      const [h, images] = await Promise.all([html, staged])
      setCount(images.length)
      setStatus(`Copied "${VARIANTS.find((v) => v.id === variant)!.label}": ${images.length} images, HTML ${kb(h.length)}`)
    } catch (err) {
      setStatus(`Copy failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Stop the paste from reaching the page's own listener, which would stage pasted image
  // files; the browser's default insertion still happens.
  const onPasteBox = (e: React.ClipboardEvent) => {
    e.stopPropagation()
    const r = describePaste(e, "Rich box")
    setTimeout(() => {
      const imgs = [...(box.current?.querySelectorAll("img") ?? [])]
      const srcs = imgs.map((i) => i.src.slice(0, 15)).join(", ")
      r.lines.push(`rendered: ${imgs.length} <img>${srcs ? ` (${srcs}...)` : ""}, ${box.current?.innerText.trim().length ?? 0} chars of text`)
      setReport({ ...r })
    }, 50)
  }

  const onPasteText = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation()
    const r = describePaste(e, "Textarea")
    const area = e.currentTarget
    setTimeout(() => {
      r.lines.push(`rendered: ${area.value.length} chars of text`)
      setReport({ ...r })
    }, 50)
  }

  const clear = () => {
    if (box.current) box.current.innerHTML = ""
    const area = document.getElementById("clipboard-lab-text") as HTMLTextAreaElement | null
    if (area) area.value = ""
    setReport(null)
  }

  if (!open) return null

  return (
    <aside
      aria-label="Clipboard lab"
      className="fixed right-4 bottom-4 z-50 max-h-[calc(100vh-2rem)] w-96 space-y-3 overflow-y-auto rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-lg"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Clipboard lab</h2>
        <Button variant="ghost" size="icon" onClick={() => void refresh()} aria-label="Recount staged images">
          <RefreshCwIcon />
        </Button>
      </div>
      <p className="text-muted-foreground">
        {count} staged {count === 1 ? "image" : "images"}. Each button writes one clipboard item.
      </p>
      <div className="space-y-2">
        {VARIANTS.map(({ id, label, note }) => (
          <div key={id} className="flex items-center gap-3">
            <Button variant="outline" className="w-36 justify-start" onClick={() => void copy(id)}>
              <ClipboardCopyIcon />
              {label}
            </Button>
            <span className="text-muted-foreground">{note}</span>
          </div>
        ))}
      </div>
      {status && <p className="font-mono text-xs break-words">{status}</p>}
      <p className="text-muted-foreground">
        On LinkedIn or Facebook: copy a variant, paste once into the new post box, and note how many images attach.
      </p>
      <div
        ref={box}
        contentEditable
        suppressContentEditableWarning
        onPaste={onPasteBox}
        aria-label="Rich paste target"
        data-placeholder="Paste here (rich)"
        className="max-h-48 min-h-16 overflow-y-auto rounded-md border px-3 py-2 empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_img]:inline-block [&_img]:max-h-16"
      />
      <textarea
        id="clipboard-lab-text"
        onPaste={onPasteText}
        placeholder="Paste here (plain)"
        className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2"
      />
      {report && (
        <div className="space-y-1 rounded-md bg-muted p-2 font-mono text-xs">
          <p className="font-semibold">{report.target} paste</p>
          {report.lines.map((l) => (
            <p key={l} className="break-words">
              {l}
            </p>
          ))}
        </div>
      )}
      <Button variant="outline" onClick={clear}>
        <Trash2Icon />
        Clear boxes
      </Button>
    </aside>
  )
}
