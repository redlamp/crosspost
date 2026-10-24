// Record the tour to a video, in one go: serve the static build, render it frame by frame, stop.
//
//   bun run build
//   node tools/record-tour/record.mjs [out.mp4]
//
// The video lands at tools/record-tour/out/tour-1200.mp4 unless a path is given (out/ is ignored
// by git: the renders are for sharing, not the repo). See README.md here.
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] ?? join(here, "out", "tour-1200.mp4")
const build = join(here, "..", "..", "out")
const PORT = 4323

if (!existsSync(join(build, "index.html"))) throw new Error("no build in out/: run bun run build first")
const server = spawn(process.execPath, [join(here, "serve.mjs"), build, String(PORT)], { stdio: ["ignore", "inherit", "inherit"] })
const up = async () => {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`the static server didn't come up on ${PORT}`)
}
try {
  await up()
  const code = await new Promise((resolve) => {
    spawn(process.execPath, [join(here, "frames.mjs"), out], { stdio: "inherit", env: { ...process.env, TOUR_URL: `http://localhost:${PORT}/` } }).on("close", resolve)
  })
  process.exitCode = code ?? 1
} finally {
  server.kill()
}
