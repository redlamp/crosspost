"use client"

import {
  ArrowDownWideNarrowIcon,
  ArrowUpNarrowWideIcon,
  CalendarIcon,
  CaseSensitiveIcon,
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
  sortPlatforms,
  updatePlatformSettings,
  usePlatformSettings,
  useSettingsOpen,
  type PlatformSort,
} from "@/lib/platform-settings"
import { cn } from "@/lib/utils"

const SORTS: { by: PlatformSort["by"]; icon: LucideIcon; label: string; asc: string; desc: string }[] = [
  { by: "name", icon: CaseSensitiveIcon, label: "Alphabetical", asc: "A to Z", desc: "Z to A" },
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-sm">
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
                    onClick={() => setSort({ by })}
                    className={cn("size-8", settings.sort.by === by && "bg-accent text-foreground")}
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
                  className="size-8"
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
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {adapter.launched.slice(0, 4)}
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

/** Where a platform without one central site (Mastodon) should open: the user's own server. */
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
  const host = serverHost(value)
  // Tab fills in the suggested server while the field is empty or holds the start of it.
  const suggestion = adapter.server!.placeholder
  const typed = value.trim().toLowerCase()
  const canComplete = typed !== suggestion && suggestion.startsWith(typed)
  return (
    <div className="mt-2.5 space-y-1.5 pl-8">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        Your server
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Tab" || e.shiftKey || !canComplete) return
          e.preventDefault()
          onChange(suggestion)
        }}
        placeholder={suggestion}
        autoComplete="off"
        spellCheck={false}
        className="h-8"
      />
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {canComplete ? (
          <>
            Press <kbd className="rounded border px-1 font-sans text-[10px]">Tab</kbd> for {suggestion}, or type
            your server or handle
          </>
        ) : host ? (
          `Open goes to ${host}/share`
        ) : (
          `Enter a server name, like ${suggestion}`
        )}
      </p>
    </div>
  )
}
