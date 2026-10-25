import type { MetadataRoute } from "next";

import { DARK_THEME_COLOR } from "@/lib/theme";

// The web app manifest: what lets a phone (or Chrome and Edge on a desktop) install Crosspost
// as an app, and registers it as a share target so text, a link or images shared from another
// app land in Compose. Next writes it to <base>/manifest.webmanifest and links it from <head>.
//
// Its URLs are absolute paths, so under /crosspost on GitHub Pages they carry the base path
// too, read at build time as next.config.ts reads it. Icons are plain files in public/ (the
// manifest can't import them), rendered from src/app/icon.svg with sharp:
// transparent for "any", and on the dark background inside the safe zone for "maskable".
const base = process.env.BASE_PATH ?? "";

// A metadata route is a route handler, and the static export needs it marked static.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${base}/`,
    name: "Crosspost",
    short_name: "Crosspost",
    description:
      "Write a post once, then copy, share or open it on Bluesky, Threads, Mastodon, LinkedIn, X, Facebook and Instagram. Runs entirely in your browser.",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    background_color: DARK_THEME_COLOR,
    theme_color: DARK_THEME_COLOR,
    lang: "en",
    categories: ["social", "productivity"],
    icons: [
      { src: `${base}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png" },
      { src: `${base}/icon-maskable-192.png`, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: `${base}/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Shares from other apps arrive as a POST with a form (files need one), which the service
    // worker (public/sw.js) catches, since a static host can't answer it. The worker keeps what
    // came and opens the app, which stages the images and adds the text to the draft.
    // Installed web apps join the share sheet on Android (Chrome), ChromeOS and Windows through
    // Edge; Chrome on Windows and macOS, Safari (iOS included) and Firefox don't offer them.
    share_target: {
      action: `${base}/share`,
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          {
            name: "images",
            // Images, and the videos the platforms take most widely.
            accept: [
              "image/png",
              "image/jpeg",
              "image/gif",
              "image/webp",
              "image/avif",
              "video/mp4",
              "video/quicktime",
              "video/webm",
              ".png",
              ".jpg",
              ".jpeg",
              ".gif",
              ".webp",
              ".avif",
              ".mp4",
              ".mov",
              ".m4v",
              ".webm",
            ],
          },
        ],
      },
    },
  };
}
