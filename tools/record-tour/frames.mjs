// Record the tour frame by frame, without a screen: headless Chrome under BeginFrame control and
// virtual time, so each tick moves the page's timers, animations, and view transitions by exactly
// one sixtieth of a second and renders one frame, which goes to ffmpeg as it comes. The frame is
// the approved one: the dialog centered with a 16px border, Done keeping Deliver's top edge.
//
//   node frames.mjs out.mp4 [smoke]     (smoke: 300 frames kept as PNGs in smoke/ here, no video; TOUR_URL picks the server)
import { spawn, execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const FPS = 60
const STEP_MS = 1000 / FPS
// BeginFrame screenshots come at the viewport's size whatever the device scale factor, so the
// page is zoomed instead: the viewport is the frame in real pixels, the page laid out 1.4x
// smaller inside it (the real width stays past the xl breakpoint, so the dialog keeps its 896).
const ZOOM = 1.4
const DIALOG = { width: 896, height: 812.4 }
const BORDER = 16
const even = (n) => Math.round(n / 2) * 2
const VIEW = { width: even((DIALOG.width + 2 * BORDER) * ZOOM), height: even((DIALOG.height + 2 * BORDER) * ZOOM) }
const OUT_W = 1200
const outH = even((OUT_W * VIEW.height) / VIEW.width)
const PRE_ROLL = 30 // frames of the page at rest before the click
const HOLD = 5 * FPS // frames on Done after it shows
const MAX = 150 * FPS
const out = process.argv[2] ?? "tour.mp4"
const smoke = process.argv[3] === "smoke"
// Beside this script whatever the working directory (ignored by git, as out/ is).
const smokeDir = join(dirname(fileURLToPath(import.meta.url)), "smoke")

const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-begin-frame-control",
    "--run-all-compositor-stages-before-draw",
    "--disable-new-content-rendering-timeout",
    "--disable-threaded-animation",
    "--disable-threaded-scrolling",
    "--disable-checker-imaging",
    "--disable-image-animation-resync",
    "--hide-scrollbars",
  ],
})
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, colorScheme: "dark" })
const page = await context.newPage()
await page.goto(process.env.TOUR_URL ?? "http://localhost:4323/", { waitUntil: "networkidle" })
await page.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom) }, ZOOM)
// The dialog centered, for the frame; on Done, which is shorter, it keeps the top edge the
// 812.4px steps had (a calc in its own coordinates, so the zoom doesn't enter into it).
await page.addStyleTag({
  content: `[role=dialog] { top: 50% !important; translate: -50% -50% !important; max-height: none !important; }
    [role=dialog].pinned { top: calc(50% - ${DIALOG.height / 2}px) !important; translate: -50% 0 !important; }`,
})
await page.evaluate(() => {
  new MutationObserver(() => {
    const d = document.querySelector("[role=dialog]")
    if (!d || d.classList.contains("pinned")) return
    if ([...d.querySelectorAll("h2")].some((h) => h.textContent?.trim() === "You're ready!")) d.classList.add("pinned")
  }).observe(document.body, { childList: true, subtree: true })
})
// The tour's chunk, fetched before the clock is taken over (a focus on the card asks for it).
await page.evaluate(() => { const b = document.querySelector('[aria-label^="Draft"]'); b?.focus(); b?.blur() })
await page.waitForTimeout(2000)
console.log("viewport", VIEW, "zoom", ZOOM, "output", OUT_W, "x", outH, "tour chunk in:", await page.evaluate(() => [...document.scripts].length))

const cdp = await context.newCDPSession(page)
await cdp.send("HeadlessExperimental.enable")
// From here the page's clock is ours.
// Frame timestamps count from where virtual time began, so the animation clock (driven by
// BeginFrame times) and the timers (driven by virtual time) agree.
const { virtualTimeTicksBase } = await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" })
let ticks = virtualTimeTicksBase
const budgetExpired = () => new Promise((resolve) => cdp.once("Emulation.virtualTimeBudgetExpired", resolve))
const frame = async () => {
  const expired = budgetExpired()
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pauseIfNetworkFetchesPending", budget: STEP_MS })
  await expired
  ticks += STEP_MS
  const r = await cdp.send("HeadlessExperimental.beginFrame", { frameTimeTicks: ticks, interval: STEP_MS, noDisplayUpdates: false, screenshot: { format: "png" } })
  return r.screenshotData ? Buffer.from(r.screenshotData, "base64") : null
}

let ffmpeg = null
if (!smoke) {
  // ffmpeg doesn't make the folder itself.
  mkdirSync(dirname(out), { recursive: true })
  ffmpeg = spawn("ffmpeg", [
    "-y", "-loglevel", "warning",
    "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
    "-vf", `scale=${OUT_W}:${outH}:flags=lanczos`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", "-an",
    out,
  ], { stdio: ["pipe", "inherit", "inherit"] })
} else mkdirSync(smokeDir, { recursive: true })
const write = (png) => new Promise((resolve) => { if (!ffmpeg.stdin.write(png)) ffmpeg.stdin.once("drain", resolve); else resolve() })

let last = null
let n = 0, doneAt = null
const started = Date.now()
const emit = async (png) => {
  if (png) last = png
  if (!last) return
  if (smoke) writeFileSync(join(smokeDir, `${String(n).padStart(5, "0")}.png`), last)
  else await write(last)
  n++
}
for (let i = 0; i < PRE_ROLL; i++) await emit(await frame())
await page.evaluate(() => document.querySelector('[aria-label^="Draft"]').click())
console.log("clicked at frame", n)
// The cap counts ticks, not frames written: a page that never yields a screenshot would
// otherwise loop forever, as n stays at 0.
for (let tick = 0; tick < MAX && n < MAX; tick++) {
  await emit(await frame())
  if (tick === 60 && n === 0) throw new Error("no screenshot in 60 ticks: BeginFrame control isn't on (Playwright's chromium headless shell is needed)")
  if (smoke && n % 60 === 0) console.log("t", (n / FPS).toFixed(1), await page.evaluate(() => ({ dialog: !!document.querySelector("[role=dialog]"), anims: document.getAnimations().length, times: document.getAnimations().slice(0, 3).map((a) => Math.round(a.currentTime ?? -1)), now: Math.round(performance.now()), vt: document.startViewTransition ? "vt" : "no-vt" })))
  if (smoke && n >= 300) break
  if (doneAt === null && n % 15 === 0) {
    const ready = await page.evaluate(() => [...document.querySelectorAll("[role=dialog] h2")].some((h) => h.textContent?.trim() === "You're ready!"))
    if (ready) { doneAt = n; console.log("Done at frame", n, `(${(n / FPS).toFixed(2)}s)`) }
  }
  if (doneAt !== null && n >= doneAt + HOLD) break
  if (n % 600 === 0) console.log(`frame ${n} (${(n / FPS).toFixed(0)}s of tour), ${((Date.now() - started) / 1000).toFixed(0)}s elapsed`)
}
console.log("frames", n, "video seconds", (n / FPS).toFixed(2))
if (ffmpeg) {
  ffmpeg.stdin.end()
  await new Promise((resolve) => ffmpeg.on("close", resolve))
}
await browser.close()
if (!smoke) console.log(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-count_packets", "-show_entries", "stream=width,height,r_frame_rate,nb_read_packets", "-show_entries", "format=duration,size", "-of", "default=nw=1", out]).toString())
