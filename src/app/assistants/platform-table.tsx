"use client"

import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from "lucide-react"
import { useState } from "react"

import { PlatformLogo } from "@/components/platform-logo"
import { adapters, type PlatformAdapter } from "@/lib/adapters"
import { cn } from "@/lib/utils"

/**
 * The platform's mark in its brand color, as on the cards (black marks follow the text color). The
 * page has its own copy: an adapter can't cross from the server page into this client component.
 */
function Logo({ adapter, className }: { adapter: PlatformAdapter; className?: string }) {
  return (
    <span style={{ "--brand": adapter.brand.color ?? "var(--foreground)" } as React.CSSProperties} className="contents">
      <PlatformLogo adapter={adapter} className={className} />
    </span>
  )
}

/** One platform's row: the labels as shown, so sorting is by what's on the page. */
export type PlatformRow = {
  id: string
  name: string
  composer: string
  text: string
  images: string
  thread: string
}

const COLUMNS: { key: keyof Omit<PlatformRow, "id">; label: string }[] = [
  { key: "name", label: "Platform" },
  { key: "composer", label: "Composer" },
  { key: "text", label: "Text" },
  { key: "images", label: "Images" },
  { key: "thread", label: "Thread posts" },
]

const cell = "border-b px-2 py-1.5 text-left align-top first:pl-0"

/**
 * The platforms summary, sortable by any column: a header click sorts by it, a second click
 * reverses, and ties keep the platform order. Platform ascending to start.
 */
export function PlatformTable({ rows }: { rows: PlatformRow[] }) {
  const [sort, setSort] = useState<{ key: keyof Omit<PlatformRow, "id">; desc: boolean }>({ key: "name", desc: false })
  const sorted = [...rows].sort(
    (a, b) => a[sort.key].localeCompare(b[sort.key]) * (sort.desc ? -1 : 1) || a.name.localeCompare(b.name),
  )
  return (
    <table className="w-full border-collapse text-sm">
      <thead className="text-muted-foreground">
        <tr>
          {COLUMNS.map(({ key, label }) => {
            const active = sort.key === key
            const Icon = !active ? ArrowUpDownIcon : sort.desc ? ArrowDownIcon : ArrowUpIcon
            return (
              <th
                key={key}
                scope="col"
                aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
                className={cn(cell, "font-medium")}
              >
                <button
                  type="button"
                  onClick={() => setSort((s) => ({ key, desc: s.key === key && !s.desc }))}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-(--brand-blue) focus-visible:outline-none",
                    active && "text-foreground",
                  )}
                >
                  {label}
                  <Icon className={cn("size-3.5", !active && "opacity-50")} aria-hidden />
                </button>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => {
          const adapter = adapters.find((a) => a.id === r.id)!
          return (
            <tr key={r.id}>
              <td className={cell}>
                <a href={`#p-${r.id}`} className="inline-flex items-center gap-2 underline underline-offset-4">
                  <Logo adapter={adapter} className="size-4" />
                  {r.name}
                </a>
              </td>
              <td className={cell}>{r.composer}</td>
              <td className={cell}>{r.text}</td>
              <td className={cell}>{r.images}</td>
              <td className={cell}>{r.thread}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
