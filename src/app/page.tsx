import Image from "next/image";

import logo from "@/assets/logo.png";
import { ComposerLoader } from "@/components/composer-loader";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b bg-background/90 px-4 backdrop-blur sm:px-6">
        <h1 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <Image src={logo} alt="" width={28} height={28} loading="eager" />
          Crosspost
        </h1>
        <ThemeToggle />
      </header>
      <ComposerLoader />
    </div>
  );
}
