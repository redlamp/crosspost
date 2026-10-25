// A plain static server for the build, on localhost only: node serve.mjs <root> <port>.
import { createServer } from "node:http"
import { readFile, stat } from "node:fs/promises"
import { extname, join, normalize, relative, resolve, isAbsolute } from "node:path"

const root = resolve(process.argv[2])
const port = Number(process.argv[3] ?? 4323)
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
}

/** The file under the root a request means, or null when it points outside it (or isn't a path at all). */
function fileFor(url) {
  try {
    const file = normalize(join(root, decodeURIComponent(new URL(url, "http://x").pathname)))
    // Encoded separators (%2f, %5c) survive the URL parser and could climb out of the root.
    const inside = relative(root, file)
    return inside.startsWith("..") || isAbsolute(inside) ? null : file
  } catch {
    return null
  }
}

createServer(async (req, res) => {
  let file = fileFor(req.url)
  if (!file) {
    res.writeHead(404).end("not found")
    return
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html")
  } catch {
    if (!extname(file)) file += ".html"
  }
  let body
  try {
    body = await readFile(file)
  } catch {
    res.writeHead(404).end("not found")
    return
  }
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" })
  res.end(body)
}).listen(port, "127.0.0.1")
