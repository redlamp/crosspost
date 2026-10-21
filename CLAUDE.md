@AGENTS.md

# Crosspost

A static site (GitHub Pages) for writing a post once and copying or opening it on Bluesky, Threads, LinkedIn, Twitter, Facebook, Instagram and Mastodon. No accounts, tokens or server: everything runs and is stored in the browser. The UI calls X "Twitter" with the classic bird, on purpose. Spec, platform rules and backlog live in `BRIEF - Crosspost v2.md`; read the relevant section before touching a platform.

## Commands

- `bun install`, `bun run dev` (port 4321), `bun run test`, `bun run lint`, `bun run typecheck`, `bun run build` (static export to `out/`).
- Add UI components with `bunx shadcn@3.8.5 add <name>`. Pin 3.8.5: newer CLIs dropped the new-york style this project uses.
- Bun manages packages; Next runs on Node. No shell-specific scripts: everything must work on Windows and POSIX.

## Stack

Next.js 16 App Router with `output: "export"` (so no `cacheComponents`: partial prerendering needs a server), TypeScript, Tailwind v4, shadcn/ui (new-york, neutral, lucide), sonner toasts, next-themes, dnd-kit, vitest.

## Rules

- Writing: no em dashes anywhere (UI copy, comments, commits); American English.
- Static only: no API routes, server actions or secrets. The repo and site are public, so nothing personal or private goes in them.
- Asset paths must work under the `/crosspost` base path: import images (`import logo from "@/assets/logo.png"`) rather than using `/public` paths.
- `src/lib/text.ts` holds counters, URL finding and splitting.
- One adapter per platform in `src/lib/adapters/<platform>.ts`, registered in `adapters/index.ts`.
- Browser storage keys start with `crosspost:`.
- Theme: dark grey by default (background `oklch(0.24 0 0)`, cards `oklch(0.28 0 0)`), not black. Grid columns use `minmax(0,1fr)` so `field-sizing: content` textareas can't widen them.

## Workflow

- Verify changes in the browser, then commit on `main` and push; the Pages workflow deploys.
