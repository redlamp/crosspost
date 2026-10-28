import type { Metadata, Viewport } from "next";
import Script from "next/script";

import { fontClassName } from "@/app/fonts";
import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GOATCOUNTER_SCRIPT, GOATCOUNTER_URL } from "@/lib/analytics";
import { DARK_THEME_COLOR } from "@/lib/theme";
import "./globals.css";

// The live site, for the absolute URLs share previews need. Next adds the /crosspost base path
// to file-based images (opengraph-image.jpg) itself, so metadataBase is the origin alone.
const SITE = "https://redlamp.github.io";
const DESCRIPTION =
  "Write a post once, then copy or open it on Bluesky, Threads, Mastodon, LinkedIn, X / Twitter, Facebook and Instagram. Runs entirely in your browser.";

// The share image is opengraph-image.jpg (with its .alt.txt), exported from the Dark Open Graph
// card in the Crosspost Figma file. X, Bluesky, Threads and Mastodon all fall back to og:image.
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Crosspost",
  applicationName: "Crosspost",
  description: DESCRIPTION,
  // Installed on an iPhone from Safari's Add to Home Screen: opens without browser chrome, with
  // an opaque black status bar above the page (the translucent kind would need safe-area
  // padding under it). The manifest (src/app/manifest.ts) covers Android and desktops.
  appleWebApp: { capable: true, title: "Crosspost", statusBarStyle: "black" },
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

// The color a phone paints around the page (Android's status bar in the installed app). The
// default theme's; the app shell switches it with the theme.
export const viewport: Viewport = { themeColor: DARK_THEME_COLOR };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontClassName} h-full antialiased`}
    >
      <head>
        {/* The guide to each platform's composer and the page's data (src/app/assistants). */}
        <link rel="help" href={`${process.env.BASE_PATH ?? ""}/assistants`} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange storageKey="crosspost:theme">
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
          <AppShell />
        </ThemeProvider>
        {/* Anonymous page views and usage counts (src/lib/analytics.ts; docs/spec.md, Analytics). */}
        <Script src={GOATCOUNTER_SCRIPT} data-goatcounter={GOATCOUNTER_URL} strategy="afterInteractive" />
      </body>
    </html>
  );
}
