import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A static site for GitHub Pages: `next build` writes plain files to out/.
  output: "export",
  // Pages serves the site from /crosspost; the workflow sets BASE_PATH. Empty for local dev.
  basePath: process.env.BASE_PATH ?? "",
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
