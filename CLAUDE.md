@AGENTS.md

# Crosspost

A static site (GitHub Pages) for writing a post once and copying or opening it on Bluesky, Threads, LinkedIn, X, Facebook, Instagram and Mastodon. No accounts, tokens or server: everything runs and is stored in the browser. X shows by default, with Mastodon off; a Twitter entry (the classic bird) is the same service, off by default, kept as a nod for anyone who prefers the old name. Spec, platform rules and backlog live in `docs/spec.md`; read the relevant section before touching a platform.

## Commands

- `bun install`, `bun run dev` (port 4321), `bun run test`, `bun run lint`, `bun run typecheck`, `bun run build` (static export to `out/`).
- Add UI components with `bunx shadcn@3.8.5 add <name>`. Pin 3.8.5: newer CLIs dropped the new-york style this project uses.
- Bun manages packages; Next runs on Node. No shell-specific scripts: everything must work on Windows and POSIX.

## Stack

Next.js 16 App Router with `output: "export"` (so no `cacheComponents`: partial prerendering needs a server), TypeScript, Tailwind v4, shadcn/ui (new-york, neutral, lucide), sonner toasts, next-themes, dnd-kit, vitest.

## Rules

- Writing: no em dashes anywhere (UI copy, comments, commits); American English.
- Static only: no API routes, server actions or secrets. The repo and site are public, so nothing personal or private goes in them.
- Asset paths must work under the `/crosspost` base path: import images (`import logoLight from "@/assets/logo-light.svg"`) rather than using `/public` paths.
- `src/lib/text.ts` holds counters, URL finding and splitting.
- One adapter per platform in `src/lib/adapters/<platform>.ts`, registered in `adapters/index.ts`.
- Browser storage keys start with `crosspost:`.
- Theme: dark grey by default (background `oklch(0.24 0 0)`, cards `oklch(0.28 0 0)`), not black. Grid columns use `minmax(0,1fr)` so `field-sizing: content` textareas can't widen them.

## Workflow

- Verify changes in the browser and leave them uncommitted. Commit and push only when Taylor asks: pushing to `main` deploys the public site through the Pages workflow.
- Branches: `main` > `dev` > `feature/<label>` (or `fix/<label>`). Merge with `--no-ff`, never fast-forward, so the branching shows.
- Tags are annotated. The last merge of each working day gets a date tag named for that day (`2026-10-22`, message "End of work day"). A working day runs until 6 AM, so a 2 AM commit belongs to the day before. Releases get semver tags with a `v` (`v1.1.0`): minor for features, patch for fixes; bump `package.json` to match in the release commit. Only version tags carry the `v`. Pushing a tag (`git push origin <tag>`) doesn't deploy; push tags only when Taylor asks.
