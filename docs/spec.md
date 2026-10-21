# Crosspost spec

## Goal

Write a post once, then publish it to several social platforms with as little copying and retyping as possible. Priorities: free, convenient, no risk of account bans, and nothing private stored anywhere but the user's own browser.

## Hosting

- A static site on GitHub Pages at `/crosspost`. No server, no API routes, no accounts or tokens.
- Drafts and preferences live in the browser's localStorage (keys start with `crosspost:`), so they stay on that device.
- A GitHub Actions workflow builds the static export (`out/`) and deploys it on every push to `main`.

## Stack

- Next.js 16 (App Router, `output: "export"`) and TypeScript.
- Tailwind v4 with shadcn/ui (style new-york, base color neutral, lucide icons, sonner toasts). Add components with `bunx shadcn@3.8.5 add`.
- Bun as the package manager. vitest for unit tests. dnd-kit for reordering.
- Cross-platform scripts only (Windows and POSIX).

## Platforms

Every platform is posted by hand: Crosspost shows the text per post with a Copy button, and an Open button that opens the platform, prefilled where the platform allows it.

| Platform | Limit and counting | Long posts | Open button |
| --- | --- | --- | --- |
| Bluesky | 300 graphemes (an emoji is 1) | Split into posts | Prefilled: `https://bsky.app/intent/compose?text=…` |
| Threads | 500; emoji count as their UTF-8 bytes (per Meta's docs); at most 5 links | Split into posts | Prefilled: `https://www.threads.com/intent/post?text=…` |
| LinkedIn | 3,000 | No threads: warn and require shortening | Prefilled: `https://www.linkedin.com/feed/?shareActive=true&text=…` (undocumented) |
| Twitter (X) | 280 weighted (see below) | Split into posts | Prefilled: `https://x.com/intent/post?text=…` |
| Facebook | 63,206 | n/a | Opens Facebook; Facebook forbids prefilled text |
| Instagram | 2,200; at most 30 hashtags | n/a | Opens Instagram; the photo or video is added there |
| Mastodon (hidden by default) | 500 on most servers; graphemes, links with a scheme as 23, mentions as @name only | Split into posts | Prefilled on the user's server: `https://<server>/share?text=…` |

### Platform notes

**Bluesky:** shows a "1/2" pill on thread posts itself, so Crosspost's " i/n" label is off by default for Bluesky, with an "Add 1/n anyway" switch on its card.

**Threads:** Meta's docs confirm emoji count as their UTF-8 byte length, and posts with more than 5 unique links are rejected; the card flags that.

**LinkedIn:** no threading, so a post over 3,000 shows a warning instead of splitting.

**Threads:** its mark is black, so the UI uses a neutral gray, `oklch(0.66 0 0)`, near the other brand colors' OKLCH lightness (0.52 to 0.68), so it sits level with them in both themes.

**Twitter / X:** two entries for the same service, so each person can pick the name they prefer: "Twitter" with the classic bird (shown by default) and "X" with the X logo (hidden until switched on in Settings). Both post through X's intent link and count the same way. Counting uses twitter-text v3 weighting: code points in 0–4351, 8192–8205, 8208–8223 and 8242–8247 weigh 1, all others 2; an emoji sequence weighs 2; every URL weighs 23, bare domains included; NFC-normalize first.

**Facebook:** breakpoints shown on the card (unofficial, widely reported): "Background color" (Facebook's name for colored-background text posts) up to ~130 characters and only without links; "See more" after ~480 on desktop.

**Instagram:** caption only, links aren't clickable, and the feed cuts captions at ~125 characters ("more").

**Mastodon:** counting follows Mastodon's own `StatusLengthValidator`: grapheme clusters, after each http(s) link becomes 23 characters and each `@name@server` mention becomes `@name` (bare domains aren't links there, so they count in full). Servers can raise the 500 limit; Crosspost uses 500. Hidden until shown in Settings, where the user can enter their server (a host, URL or handle all work); empty or unreadable means mastodon.social.

## Features

- **Compose box** with a character count, saved as you type.
- **A card per platform:** brand logo and tint, on/off switch, counter (amber near the limit, red over), a "?" tooltip with the counting rule, breakpoints where relevant, and the posts with Copy and Open buttons.
- **Splitting:** paragraphs, then lines, then sentences (`Intl.Segmenter`), then words; inside a word only as a last resort; URLs stay whole when they fit. A unit that has to be broken starts a new post. Optional " i/n" numbering reserves room for the label. Compose's "Number split posts" switch shows each platform it covers as its mark in a brand-color circle. Bluesky shows a post's place in a thread itself, so it's left out unless its card's switch ("Add 1/N anyway", hover: "Follow Compose setting") puts it under Compose's switch.
- **Split markers:** a caret and logo flag where each threading platform's next post starts. Drag a flag to move a split; drag one out of the text, or well below its last line (over a line and a half of empty box), to remove it, and while it would be removed the flag following the pointer is dimmed and destructive red; double-click to undo a manual one. A scissors handle moves splits shared by several platforms together. Wherever two or more platforms split at the same spot (an All split, including after some were dragged off on their own), the caret and tag take the All chip's neutral color, the tag shows the scissors and post number ("✂ 2"), and the platform flags stay hidden until the tag is hovered or focused, so one can be dragged off. Flags in the group carry no number unless theirs differs from the tag's. Splits before the drop point stay put; the rest reflow. Manual splits follow the text as it's edited. Placed markers rest at 80% opacity, so the text behind shows through, and go to full while hovered or focused. A card whose splits were moved by hand offers "Reset splits" (back to fitting the limit); when Compose's shared splits (the hand-placed ones most of the other threading platforms have, as an All split leaves them) differ from the card's, it also offers "Match Compose splits", including right after a reset.
- **Split chips** in the Compose header, after a "Drag to split" label (All plus one per threading platform): drag one into the text to add a split, or click to split at the cursor. Neither the chips nor the markers in the text have hover cards.
- **Status rail:** a tile per platform with its post count once the post splits; a red ring and warning badge when something needs attention (over the limit, too many links or hashtags). Click to jump to the card; drag to reorder platforms, and the cards reorder live to match while the tile moves, gliding to their new places with the tiles' own timing (250ms ease; none with reduced motion), with the dragged platform's card scrolled into view (Escape puts them back). The dragged tile is a copy fixed to the window under the pointer, with a faint placeholder where it will land; the rail is sticky, so dnd-kit's scroll compensation is bypassed (tiles are measured where they sit, for the pointer and the keyboard alike) and the page never auto-scrolls during the drag, only to bring the card into view. Tile tooltips open to the right, away from the cards, and flip left when the window has no room. A short legend below the tiles says so ("CLICK / GO TO", "DRAG / ORDER", the gestures bold), unselectable, at 25% opacity until the pointer is anywhere on the rail (tiles, legend or the gap between) or a tile has keyboard focus; it shows only in the side column, not the phone-width row.
- **Settings** (gear to the right of the theme toggle): choose which platforms to show, sorted by name (A to Z first), popularity (rough monthly users, shown beside each; most first) or launch date (year shown; oldest first), with a direction toggle, and the server for platforms that need one (Mastodon: an "Opens to server" field, mastodon.social when empty, with a Tab key cap in the field while Tab would fill that in). Hidden platforms leave the cards, the rail, the split chips and the numbering circles, and keep their place in the order for when they come back. At least one stays shown. Stored in `crosspost:platforms`, shared by the header and composer and synced across tabs.
- **Image staging:** up to 4 images (Bluesky and Twitter's limit, so every platform gets the same set), shown in one row under Compose. With none staged, a slim drop bar sits beside Clear Post; while an image is dragged over the page it moves up and left into the full-width spot the image row takes, and slides back when the images are cleared. While dragging, the drop targets say how many images the drag holds and how many will fit (Chrome and Firefox report this; Safari doesn't). Drop or paste them anywhere on the page (no field needs focus), or pick them; extras are left out with a note. While an image is dragged over the page, a soft radial glow spreads across the drop zone from where the drag entered the window, and recedes toward where it left. Images are kept in this browser's IndexedDB, never uploaded. Each can be copied (as PNG, to paste into a composer), dragged, downloaded or removed (the x turns red; a second click removes), and each card shows them on its first post (click to copy; numbers sit lower left; copied ones turn gray with a blue check badge on the lower right (it turns red on hover; a click clears it); a hover x over the top-right corner turns red on the first click and leaves the image off that platform only on the second, with "Show N hidden" to bring it back). On threaded platforms (Bluesky, Threads, Twitter), images go with the first post unless dragged onto another post. A move mirrors to all three threaded platforms by post number; with Ctrl (Cmd on a Mac) held on drop, it applies to that card only. Any post on the card takes the drop; while one is dragged, the other posts show a full-width "Move here" row in two fixed lines: "Move here", then "On all threads / <Platform> only" with a Ctrl key cap (⌘ on a Mac), the choice in effect in bold. Dragging the page's own images never stages them again. Image order follows the Compose tray (drag a tile beside another to reorder; a line marks where it lands). Dragging a card thumbnail beside another gives that platform its own order, with "Match Compose order" to go back; dropped beside an image in another post, it moves there too. Once any card has moved or reordered images, a Reset Image(s) button (with the confirm step and Undo) puts every card back on the tray's order with all images on the first post. Instagram's card notes that it needs one.
- **Clear Post** and, with images staged, **Clear Image(s)** (left-aligned): the first click turns the button red and reads "Confirm"; the second clears, with Undo in the toast. Clear Post clears the draft, manual splits and images.
- **Split-view reminder** (Chrome only): "External link > Right-click > Open link in split view", with an X ("Collapse Reminder") that shrinks it to an amber bulb button; the bulb ("Show Reminder") opens it again. Remembered in this browser (`crosspost:split-view-tip-closed`). Its background is opaque, so the page's blue glow doesn't show through.
- Dark grey theme by default, light/dark toggle. The page background is a radial gradient fixed to the window: a hint of the logo's blue (#40A8F8, OKLCH hue 246) at the center, easing out to the theme's background toward the edges; lighter than the background in dark mode, darker in light. A gray noise tile (SVG feTurbulence, contrast-stretched) sits over it: soft light at 35% in dark, multiply at 15% in light, where the gradient fades to an off-white so the grain has something to darken; on the dev server, ?lab opens a panel to tune it live (src/components/noise-lab.tsx, loaded through dev-tools.tsx so it never ships). The header's bottom edge and the Compose card's border (both 2px) run the other way, from that blue at 55% opacity at the upper left to the text box's border color with 20% of the blue on the right (`.brand-edge-b`, `.brand-edge`). Sticky header whose content lines up with the page's centered column, responsive down to phone width, scrollbar space always reserved. Hover hints use the styled tooltip (as on the footer links), never the browser's plain `title` tooltip.
- **Compose column (wide screens):** pinned below the header and at least the window's height, so the platform column's scrolling and height never move it. The text box takes up to 12rem of the room left in the window, shrinking with the window but never below its text (it grows with its text and never scrolls inside). When the column still doesn't fit (a short window or a long post), it has no scrollbar of its own: its pinned top moves up by the overflow, so the page scroll carries it until its bottom is in view, then it stays pinned. The editor measures this (fitToWindow in compose-editor.tsx). The page's bottom padding equals the column's gap to the window edge, since a pinned column can't reach past the end of its grid row.
- **Made by** footer: on wide screens at the bottom of the Compose column, its width, flush with the bottom of the window (the column is pinned and as tall as the window); on phone widths at the end of the page: the year, "Made by Taylor Wright", and icon links to the portfolio (redlamp.org), LinkedIn and this project on GitHub (github.com/redlamp/crosspost).

## Architecture

- `src/lib/text.ts`: counters (graphemes, code points, UTF-8 length, Twitter weighting, Threads emoji counting), URL finder, splitter with manual breaks, break shifting on edits, word snapping.
- `src/lib/adapters/<platform>.ts`: one file per platform with `id`, `name`, `limit`, `count`, `chain`, `countNote`, `brand`, `open`, and optional `breakpoints`, `problems` and `numbersThreads`. Adding a platform means one adapter file plus one line in `adapters/index.ts`.
- Images are imported (not referenced from `/public`) so they work under the base path.

## Tests (vitest)

Counters (family emoji, flags, CJK, URLs as 23), URL finding (http, www, bare domains, trailing punctuation, emails and handles ignored), the splitter (fallback levels, URLs kept whole, numbering within the limit, hard splits, manual breaks), break shifting and word snapping, open links, and the Threads and Instagram problem checks.

## Backlog

- **Post history**, stored in the browser: each finished post with a link per platform (pasted after posting), listed under Compose; selecting one shows its details in the cards.
- **Engagement:** Bluesky's public counts (`app.bsky.feed.getPosts`) work straight from the browser. Other platforms have no free public API; they'd need a local script checking pages logged out, or a person looking. Never automate a signed-in session.
- **Media, next steps:** video; keep image placement, card orders, hidden images and copied checks across a reload; confirm which composers accept an image dragged straight from Crosspost (most take only real files, so copy and paste is the reliable path).
- **Bluesky sign-in for direct posting**, if wanted again: Bluesky's OAuth for browser apps (`@atproto/oauth-client-browser`) keeps tokens in that browser only, bound to a non-exportable key. If added, host on a dedicated subdomain so no other site shares its storage.
- **Threads and LinkedIn API posting** were built and then removed: Threads needs a Meta developer app, and LinkedIn's Token Generator kept failing. Both need a server for secrets, so they don't fit a static site. The code is in git history.

## Out of scope

- Twitter API and Facebook Page posting.
- Instagram API posting (needs a public professional account).
- Scheduling, link-preview cards, per-platform text edits.
- Signed-in automated scraping of any platform.
