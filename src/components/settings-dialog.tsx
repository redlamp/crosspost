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
import { Switch } from "@/components/ui/switch"
import { adapters } from "@/lib/adapters"
import { setHiddenPlatforms, useHiddenPlatforms } from "@/lib/platform-visibility"

export function SettingsDialog() {
  const hidden = useHiddenPlatforms()
  const shownCount = adapters.length - adapters.filter((a) => hidden.includes(a.id)).length

  const setShown = (id: string, shown: boolean) =>
    setHiddenPlatforms(shown ? hidden.filter((h) => h !== id) : [...hidden, id])

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings2Icon />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
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
              const shown = !hidden.includes(adapter.id)
              // At least one platform stays, or there'd be nothing to post to.
              const last = shown && shownCount === 1
              const id = `show-${adapter.id}`
              return (
                <li
                  key={adapter.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                  style={{ "--brand": adapter.brand.color ?? "var(--foreground)" } as React.CSSProperties}
                >
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
                </li>
              )
            })}
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  )
}
