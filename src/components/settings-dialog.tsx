"use client"

import {
  ArrowDownWideNarrowIcon,
  ArrowUpNarrowWideIcon,
  CalendarIcon,
  ArrowDownAZIcon,
  Settings2Icon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { adapters, type PlatformAdapter } from "@/lib/adapters"
import {
  isShown,
  serverHost,
  setSettingsOpen,
  SORT_DEFAULT_DIR,
  sortPlatforms,
  updatePlatformSettings,
  usePlatformSettings,
  useSettingsOpen,
  type PlatformSort,
} from "@/lib/platform-settings"
import { cn } from "@/lib/utils"

const SORTS: { by: PlatformSort["by"]; icon: LucideIcon; label: string; asc: string; desc: string }[] = [
  { by: "name", icon: ArrowDownAZIcon, label: "Alphabetical", asc: "A to Z", desc: "Z to A" },
  { by: "popularity", icon: UsersIcon, label: "Popularity", asc: "Fewest users first", desc: "Most users first" },
  { by: "launched", icon: CalendarIcon, label: "Launch date", asc: "Oldest first", desc: "Newest first" },
]

export function SettingsDialog() {
  const settings = usePlatformSettings()
  const open = useSettingsOpen()
  const shownCount = adapters.filter((a) => isShown(settings, a)).length

  const setShown = (id: string, shown: boolean) =>
    updatePlatformSettings((s) => ({ ...s, shown: { ...s.shown, [id]: shown } }))
  const setServer = (id: string, server: string) =>
    updatePlatformSettings((s) => ({ ...s, servers: { ...s.servers, [id]: server } }))
  const setSort = (sort: Partial<PlatformSort>) =>
    updatePlatformSettings((s) => ({ ...s, sort: { ...s.sort, ...sort } }))
  const current = SORTS.find((o) => o.by === settings.sort.by)!

  return (
    <Dialog open={open} onOpenChange={setSettingsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings2Icon />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-sm"
        // Focus the dialog itself on open, not its first button: a focused sort button
        // would show its tooltip before anyone hovers it.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Saved in this browser.</DialogDescription>
        </DialogHeader>

        <section aria-labelledby="settings-platforms" className="space-y-3">
          <div className="space-y-1">
            <h3 id="settings-platforms" className="text-sm font-medium">
              Platforms
            </h3>
            <p className="text-sm text-muted-foreground">Adjust which platforms are displayed in the app.</p>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Sort platforms">
            {SORTS.map(({ by, icon: Icon, label }) => (
              <Tooltip key={by}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Sort by ${label.toLowerCase()}`}
                    aria-pressed={settings.sort.by === by}
                    // Each sort starts the way it's usually read: A to Z, oldest first, most users first.
                    onClick={() => settings.sort.by !== by && setSort({ by, dir: SORT_DEFAULT_DIR[by] })}
                    className={cn(settings.sort.by === by && "bg-accent text-foreground")}
                  >
                    <Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Order: ${current[settings.sort.dir]}. Click to reverse.`}
                  onClick={() => setSort({ dir: settings.sort.dir === "asc" ? "desc" : "asc" })}
                >
                  {settings.sort.dir === "asc" ? <ArrowUpNarrowWideIcon /> : <ArrowDownWideNarrowIcon />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{current[settings.sort.dir]}</TooltipContent>
            </Tooltip>
          </div>
          <ul className="divide-y rounded-md border">
            {sortPlatforms(adapters, settings.sort).map((adapter) => {
              const shown = isShown(settings, adapter)
              // At least one platform stays, or there'd be nothing to post to.
              const last = shown && shownCount === 1
              const id = `show-${adapter.id}`
              return (
                <li
                  key={adapter.id}
                  className="px-3 py-2.5"
                  style={{ "--brand": adapter.brand.color ?? "var(--foreground)" } as React.CSSProperties}
                >
                  <div className="flex items-center gap-3">
                    <PlatformLogo adapter={adapter} />
                    <label htmlFor={id} className="flex-1 text-sm">
                      {adapter.name}
                    </label>
                    {settings.sort.by === "launched" && (
                      <span className="text-sm text-muted-foreground tabular-nums">{adapter.launched.slice(0, 4)}</span>
                    )}
                    {settings.sort.by === "popularity" && (
                      <span className="text-sm text-muted-foreground tabular-nums" title="Rough monthly users">
                        {adapter.users.label}
                      </span>
                    )}
                    <Switch
                      id={id}
                      checked={shown}
                      disabled={last}
                      onCheckedChange={(on) => setShown(adapter.id, on)}
                      title={last ? "Keep at least one platform" : undefined}
                      className="data-[state=checked]:bg-(--brand)"
                    />
                  </div>
                  {shown && adapter.server && (
                    <ServerField
                      adapter={adapter}
                      value={settings.servers[adapter.id] ?? ""}
                      onChange={(v) => setServer(adapter.id, v)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Which server a platform without one central site (Mastodon) opens. Empty
 * means the default server; Tab fills it in while the field is empty or
 * holds the start of it.
 */
function ServerField({
  adapter,
  value,
  onChange,
}: {
  adapter: PlatformAdapter
  value: string
  onChange: (value: string) => void
}) {
  const id = `server-${adapter.id}`
  const fallback = adapter.server!.default
  const typed = value.trim().toLowerCase()
  const canComplete = typed !== fallback && fallback.startsWith(typed)
  const invalid = typed !== "" && !serverHost(value)
  return (
    <div className="mt-2.5 space-y-1.5 pl-8">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        Opens to server
      </label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Tab" || e.shiftKey || !canComplete) return
            e.preventDefault()
            onChange(fallback)
          }}
          placeholder={fallback}
          aria-invalid={invalid || undefined}
          aria-describedby={canComplete ? `${id}-tab` : undefined}
          autoComplete="off"
          spellCheck={false}
          className={cn(canComplete && "pr-14")}
        />
        {canComplete && (
          <kbd
            id={`${id}-tab`}
            aria-label={`Press Tab for ${fallback}`}
            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-muted px-1.5 font-sans text-xs text-muted-foreground"
          >
            Tab
          </kbd>
        )}
      </div>
    </div>
  )
}
