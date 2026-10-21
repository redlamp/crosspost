import Image from "next/image";

import logo from "@/assets/logo.png";
import { ComposerLoader } from "@/components/composer-loader";
import { SettingsDialog } from "@/components/settings-dialog";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      {/* The bar spans the window; its content lines up with the page's centered column. */}
      <header className="sticky top-0 z-40 h-14 shrink-0 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <h1 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
            <Image src={logo} alt="" width={28} height={28} loading="eager" />
            Crosspost
          </h1>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <SettingsDialog />
          </div>
        </div>
      </header>
      <ComposerLoader />
    </div>
  );
}
