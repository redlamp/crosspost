"use client"

import { CheckIcon, CircleHelpIcon, ExternalLinkIcon, MinusIcon, TriangleAlertIcon } from "lucide-react"

import { CopyButton } from "@/components/copy-button"
import { ImageStrip } from "@/components/image-tray"
import { PlatformLogo } from "@/components/platform-logo"
import { cardId } from "@/components/status-rail"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Breakpoint, PlatformAdapter } from "@/lib/adapters"
import type { StagedImage } from "@/lib/images"
import { cn } from "@/lib/utils"

const NEAR_LIMIT = 0.9

/** The first post the platform would reject for reasons other than length, described. */
export function firstProblem(adapter: PlatformAdapter, chunks: string[]): string | null {
  for (let i = 0; i < chunks.length; i++) {
    const problem = adapter.problems?.(chunks[i])
    if (problem) return chunks.length > 1 ? `Post ${i + 1}: ${problem}` : problem
  }
  return null
}

function counterTone(count: number, limit: number) {
  if (count > limit) return "text-destructive"
  if (count >= limit * NEAR_LIMIT) return "text-amber-600 dark:text-amber-400"
  return "text-muted-foreground"
}

function BreakpointList({ breakpoints, text, count }: { breakpoints: Breakpoint[]; text: string; count: number }) {
  return (
    <ul className="space-y-1.5 text-sm" aria-label="Length breakpoints">
      {breakpoints.map((bp) => {
        const blocked = bp.blockedBy?.(text) ?? null
        const ok = !blocked && count <= bp.limit
        const status = blocked ?? (ok ? bp.within : `${bp.beyond} (${(count - bp.limit).toLocaleString()} over)`)
        return (
          <li key={bp.label} className="flex items-center gap-2">
            {ok ? (
              <CheckIcon className="size-4 shrink-0 text-(--brand)" aria-label="Yes" />
            ) : (
              <MinusIcon className="size-4 shrink-0 text-muted-foreground" aria-label="No" />
            )}
            <span className={cn(!ok && "text-muted-foreground")}>{bp.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {bp.approximate ? "~" : "≤"}
              {bp.limit.toLocaleString()}
            </span>
            <span className="ml-auto text-right text-xs text-muted-foreground">{status}</span>
          </li>
        )
      })}
    </ul>
  )
}

type Props = {
  adapter: PlatformAdapter
  text: string
  chunks: string[]
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  /** The user has moved this platform's splits by hand. */
  customSplits?: boolean
  onResetSplits?: () => void
  /** Whether split posts get " i/n" labels here. */
  numbering?: boolean
  /** Set for platforms that number threads themselves, to let the user add labels anyway. */
  onNumberingChange?: (on: boolean) => void
  images?: StagedImage[]
}

export function PlatformCard({
  adapter,
  text,
  chunks,
  enabled,
  onEnabledChange,
  customSplits,
  onResetSplits,
  numbering,
  onNumberingChange,
  images = [],
}: Props) {
  const total = adapter.count(text.trim())
  const over = total > adapter.limit
  // When the post becomes a chain anyway, the header total isn't a problem.
  const splits = adapter.chain && chunks.length > 1
  const switchId = `platform-${adapter.id}`
  const problem = firstProblem(adapter, chunks)
  const needsImage = adapter.needsImage && images.length === 0 && chunks.length > 0

  return (
    <Card
      id={cardId(adapter.id)}
      tabIndex={-1}
      style={{ "--brand": adapter.brand.color ?? "var(--foreground)" } as React.CSSProperties}
      className={cn(
        "scroll-mt-32 gap-4 py-4 outline-none lg:scroll-mt-20",
        // A hint of the brand: tinted surface and border, stronger in dark mode.
        "border-[color-mix(in_oklab,var(--brand)_30%,var(--border))] bg-[color-mix(in_oklab,var(--brand)_5%,var(--card))]",
        "dark:border-[color-mix(in_oklab,var(--brand)_35%,var(--border))] dark:bg-[color-mix(in_oklab,var(--brand)_9%,var(--card))]",
        !enabled && "opacity-60",
      )}
    >
      <CardHeader className="grid-rows-1 items-center px-4">
        <CardTitle className="flex flex-wrap items-center gap-2">
          <PlatformLogo adapter={adapter} />
          <label htmlFor={switchId}>{adapter.name}</label>
        </CardTitle>
        <CardAction className="row-span-1 flex items-center gap-3 self-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`How ${adapter.name} counts: ${adapter.countNote}`}
                className="-mr-1.5 rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
              >
                <CircleHelpIcon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{adapter.countNote}</TooltipContent>
          </Tooltip>
          <span
            className={cn(
              "text-sm tabular-nums",
              splits ? "text-muted-foreground" : counterTone(total, adapter.limit),
            )}
          >
            {total.toLocaleString()} / {adapter.limit.toLocaleString()}
          </span>
          <Switch
            id={switchId}
            checked={enabled}
            onCheckedChange={onEnabledChange}
            aria-label={`Post to ${adapter.name}`}
            className="data-[state=checked]:bg-(--brand)"
          />
        </CardAction>
      </CardHeader>

      {enabled && adapter.breakpoints && (
        <CardContent className="px-4">
          <BreakpointList breakpoints={adapter.breakpoints} text={text.trim()} count={total} />
        </CardContent>
      )}

      {enabled && problem && (
        <CardContent className="px-4">
          <p className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            {problem}
          </p>
        </CardContent>
      )}

      {enabled && needsImage && (
        <CardContent className="px-4">
          <p className="text-sm text-muted-foreground">{adapter.name} posts need a photo or video. Add one above.</p>
        </CardContent>
      )}

      {enabled && over && !adapter.chain && (
        <CardContent className="px-4">
          <p className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            {adapter.name} can&apos;t thread long posts. Shorten by{" "}
            {(total - adapter.limit).toLocaleString()} to post here.
          </p>
        </CardContent>
      )}

      {enabled && chunks.length > 0 && (
        <CardContent className="space-y-2 px-4">
          {splits && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs whitespace-nowrap text-muted-foreground">
              <span>
                {chunks.length} posts to copy
              </span>
              {customSplits && (
                <>
                  <span>· split by hand ·</span>
                  <button
                    type="button"
                    onClick={onResetSplits}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    Reset splits
                  </button>
                </>
              )}
              {onNumberingChange && (
                <span className="ml-auto flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <label htmlFor={`${adapter.id}-numbering`} className="cursor-help">
                        Add 1/{chunks.length} anyway
                      </label>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-60">
                      {adapter.name} shows each post&apos;s place in a thread itself. Other apps and embeds may not, so
                      you can add the label to the text too.
                    </TooltipContent>
                  </Tooltip>
                  <Switch
                    id={`${adapter.id}-numbering`}
                    size="sm"
                    checked={!!numbering}
                    onCheckedChange={onNumberingChange}
                    className="data-[state=checked]:bg-(--brand)"
                  />
                </span>
              )}
            </p>
          )}
          <ol className="space-y-2">
            {chunks.map((chunk, i) => {
              const n = adapter.count(chunk)
              const what = chunks.length > 1 ? `${adapter.name} post ${i + 1}` : `${adapter.name} post`
              return (
                <li key={i} className="rounded-md border bg-background/40 p-3">
                  <p className="max-h-80 overflow-y-auto text-sm break-words whitespace-pre-wrap">{chunk}</p>
                  {i === 0 && images.length > 0 && (
                    <div className="mt-2">
                      <ImageStrip images={images} platform={adapter.name} />
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                    <span className={cn("mr-auto text-xs tabular-nums", counterTone(n, adapter.limit))}>
                      {chunks.length > 1 && `${i + 1} · `}
                      {n.toLocaleString()} / {adapter.limit.toLocaleString()}
                    </span>
                    {i === 0 && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={adapter.open.url(chunk)} target="_blank" rel="noopener noreferrer">
                          <ExternalLinkIcon />
                          {adapter.open.label}
                        </a>
                      </Button>
                    )}
                    <CopyButton text={chunk} what={what} />
                  </div>
                </li>
              )
            })}
          </ol>
        </CardContent>
      )}
    </Card>
  )
}
