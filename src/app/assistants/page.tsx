import type { Metadata } from "next";
import Link from "next/link";

import { Guide, GUIDE_TITLE } from "./guide";

// The guide as a page of its own, at the address llms.txt and <link rel="help">
// point to. In the app the same guide opens as a sheet (#guide), so a visit here usually came from
// an agent or a direct link; Back is a plain link, in this tab.

export const metadata: Metadata = {
  title: GUIDE_TITLE,
  description:
    "What a browser agent can do with Crosspost, what each platform's terms leave to you, and the steps to post on each.",
};

export default function AssistantsPage() {
  return (
    <main className="mx-auto w-full min-w-0 max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <p>
        <Link href="/" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Back to Crosspost
        </Link>
      </p>
      <Guide Title="h1" />
    </main>
  );
}
