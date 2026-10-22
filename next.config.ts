import type { NextConfig } from "next";

// Pages serves the site from /crosspost; the workflow sets BASE_PATH. Empty for local dev.
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // A static site for GitHub Pages: `next build` writes plain files to out/.
  output: "export",
  basePath,
  // The same path for the client code that builds its own URLs (the service worker's).
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // The default image optimizer needs a server.
  images: { unoptimized: true },
  // No on-screen Next.js badge in development; compile and runtime errors still show.
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
