"use client"

import { Settings2Icon } from "lucide-react"

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
import { adapters, type PlatformAdapter } from "@/lib/adapters"
import {
  isShown,
  serverHost,
  setSettingsOpen,
  updatePlatformSettings,
  usePlatformSettings,
  useSettingsOpen,
} from "@/lib/platform-settings"

export function SettingsDialog() {
  const settings = usePlatformSettings()
  const open = useSettingsOpen()
  const shownCount = adapters.filter((a) => isShown(settings, a)).length

  const setShown = (id: string, shown: boolean) =>
    updatePlatformSettings((s) => ({ ...s, shown: { ...s.shown, [id]: shown } }))
  const setServer = (id: string, server: string) =>
    updatePlatformSettings((s) => ({ ...s, servers: { ...s.servers, [id]: server } }))

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
            <p className="text-sm text-muted-foreground">
              Show the ones you post to. Hidden platforms leave the cards, the side column and the split buttons.
            </p>
          </div>
          <ul className="divide-y rounded-md border">
            {adapters.map((adapter) => {
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
  return (
    <div className="mt-2.5 space-y-1.5 pl-8">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        Your server
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={adapter.server!.placeholder}
        autoComplete="off"
        spellCheck={false}
        className="h-8"
      />
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {host
          ? `Open goes to ${host}/share`
          : value.trim()
            ? "Enter a server name, like mastodon.social"
            : `Your server's address or your handle, like @you@${adapter.server!.placeholder}`}
      </p>
    </div>
  )
}
