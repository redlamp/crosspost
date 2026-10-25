import Image from "next/image";

import logoDark from "@/assets/logo-dark.svg";
import logoLight from "@/assets/logo-light.svg";
import { ComposerLoader } from "@/components/composer-loader";
import { DevTools } from "@/components/dev-tools";
import { IntroLoader } from "@/components/intro-loader";
import { MadeBy } from "@/components/made-by";
import { SettingsDialog } from "@/components/settings-dialog";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    // Fills the window, so the footer sits at the bottom when there is room and after the content when there isn't.
    <div className="flex flex-1 flex-col">
      {/* The bar spans the window; its content lines up with the page's centered column. */}
      <header className="sticky top-0 z-40 h-14 shrink-0 border-b-2 brand-edge-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <h1 className="flex items-center gap-2.5 text-[2rem]/10 font-bold">
            {/* The Threads plank is white on dark and black on light, so each theme gets its own file. */}
            <Image src={logoLight} alt="" loading="eager" className="h-8 w-auto dark:hidden" />
            <Image src={logoDark} alt="" loading="eager" className="hidden h-8 w-auto dark:block" />
            {/* Trim the line box to the capitals (cap height to baseline, no descender room) so the name centers
                on the logo by its letters. Browsers without text-box support keep the normal line box. */}
            <span className="[text-box:trim-both_cap_alphabetic]">Crosspost</span>
          </h1>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <SettingsDialog />
          </div>
        </div>
      </header>
      <ComposerLoader />
      {/* The introduction, opened from the welcome card (it has no button of its own), fetched on demand. */}
      <IntroLoader />
      {/* On wide screens the footer sits under the Compose column instead (see the composer). */}
      <MadeBy className="mx-auto mt-auto w-full max-w-7xl px-4 pb-4 sm:px-6 lg:hidden" />
      {/* A tuning panel for the background noise, on the dev server only (?lab). */}
      <DevTools />
    </div>
  );
}
