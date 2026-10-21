# Crosspost

Write a post once, then copy or open it on Bluesky, Threads, LinkedIn, Twitter, Facebook and Instagram, plus Mastodon and X if you switch them on in Settings.

**Use it at [redlamp.github.io/crosspost](https://redlamp.github.io/crosspost/).**

## What it does

- Counts characters the way each platform does (graphemes on Bluesky, weighted characters on Twitter, emoji as bytes on Threads, links as 23 on Mastodon) and flags posts over a limit or with too many links or hashtags.
- Splits long posts into threads where the platform allows it. Drag a split marker to move it, for every platform at once or one at a time, and number the posts (1/3, 2/3, 3/3) if you like.
- Opens each platform with your text filled in where it can (Bluesky, Threads, LinkedIn, Twitter, Mastodon), with a Copy button for every post.
- Stages up to four images to copy, paste or drag into each platform's composer, and keeps track of which ones you've copied.
- Lets you choose, sort and reorder the platforms you use.

## Private by design

There are no accounts, sign-ins, tokens or servers. Your draft, settings and images stay in your browser (localStorage and IndexedDB), and nothing is posted for you: you publish each post yourself.

## Develop

Needs [Bun](https://bun.sh) and Node.js.

```bash
bun install
bun run dev
```

The dev server runs at http://localhost:4321. `bun run test`, `bun run lint` and `bun run typecheck` check the code, and `bun run build` writes the static site to `out/`. Pushing to `main` publishes it to GitHub Pages.

The spec, platform rules and backlog are in [docs/spec.md](docs/spec.md).

## Made by

[Taylor Wright](https://redlamp.org)
