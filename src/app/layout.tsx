import type { Metadata } from "next";
import { Overpass, Overpass_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Overpass is the free cut of Highway Gothic, the lettering on US road signs: it suits a signpost logo.
const overpass = Overpass({
  variable: "--font-overpass",
  subsets: ["latin"],
});

const overpassMono = Overpass_Mono({
  variable: "--font-overpass-mono",
  subsets: ["latin"],
});

// The live site, for the absolute URLs share previews need. Next adds the /crosspost base path
// to file-based images (opengraph-image.jpg) itself, so metadataBase is the origin alone.
const SITE = "https://redlamp.github.io";
const DESCRIPTION =
  "Write a post once, then copy or open it on Bluesky, Threads, Mastodon, LinkedIn, Twitter, Facebook and Instagram. Runs entirely in your browser.";

// The share image is opengraph-image.jpg (with its .alt.txt), exported from the Dark Open Graph
// card in the Crosspost Figma file. X, Bluesky, Threads and Mastodon all fall back to og:image.
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Crosspost",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Crosspost",
    title: "Crosspost",
    description: DESCRIPTION,
    url: `${SITE}/crosspost/`,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Crosspost",
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${overpass.variable} ${overpassMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
