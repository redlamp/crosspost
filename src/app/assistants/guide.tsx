import { PlatformLogo } from "@/components/platform-logo";
import { adapters, type PlatformAdapter } from "@/lib/adapters";
import { PAYLOAD_VERSION } from "@/lib/payload";

import { PlatformTable } from "./platform-table";

// A plain reference for people, and the browser agents some of them use: what an agent can do
// with Crosspost, what each platform leaves to the person, step by step, and how the page exposes
// the draft. Same content for everyone; it describes, and never addresses an agent. Built from the
// adapters' `compose` facts, so it stays in step with the cards. Shown on /assistants and in the
// app's sheet; linked from the footer, the header's agent panel, <link rel="help"> and llms.txt.

/** When the platform facts and terms were last checked. */
const CHECKED = "2026-10-27";

// Twitter is X under its old name and logo; one entry covers both, named both ways. Alphabetical
// throughout, unlike the app's rail (which the person orders).
const nameOf = (a: PlatformAdapter) => (a.id === "x" ? "X / Twitter" : a.name);
const platforms = adapters.filter((a) => a.id !== "twitter").sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
const filled = platforms.filter((a) => a.compose.agent === "composer");
const opened = platforms.filter((a) => a.compose.agent === "open");

/** "A, B and C", with the serial comma for three or more. */
function listOf(names: string[]) {
  if (names.length < 3) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

/** The platform's mark in its brand color, as on the cards (black marks follow the text color). */
function Logo({ adapter, className }: { adapter: PlatformAdapter; className?: string }) {
  return (
    <span style={{ "--brand": adapter.brand.color ?? "var(--foreground)" } as React.CSSProperties} className="contents">
      <PlatformLogo adapter={adapter} className={className} />
    </span>
  );
}

const TEXT: Record<PlatformAdapter["compose"]["text"], string> = { prefill: "Prefilled", paste: "Paste in" };
const IMAGE: Record<PlatformAdapter["compose"]["image"], string> = { paste: "Paste", file: "File upload" };
const THREAD: Record<PlatformAdapter["compose"]["thread"], string> = {
  "add-post": "Add in composer",
  reply: "Reply after posting",
  none: "Single post",
};

/** The steps to post there from the card, in order. */
function stepsFor(a: PlatformAdapter): React.ReactNode[] {
  const { compose, open } = a;
  const steps: React.ReactNode[] = [];
  steps.push(
    compose.text === "prefill" ? (
      <>
        Click <b>{open.label}</b> on the card. The first post arrives filled in.
        {open.withMedia && (
          <>
            {" "}
            With images, the button is <b>{open.withMedia.label}</b> instead: it copies the post, so paste it in.
          </>
        )}
      </>
    ) : (
      <>
        Click <b>{open.label}</b> on the card, then copy the post from the card and paste it in.
      </>
    ),
  );
  steps.push(
    compose.image === "paste" ? (
      <>Click each image on the card to copy it, and paste it into the post.</>
    ) : (
      <>Click each image on the card to save it as a file, then add that file in the composer.</>
    ),
  );
  steps.push(
    <>
      Copy each image&apos;s alt text with <b>ALT</b> under it, and paste it in. Where: {compose.alt}.
    </>,
  );
  if (compose.thread === "add-post") steps.push(<>Add each later post in the composer, copying it from the card.</>);
  // Later posts as replies: the platform's warning says how (Mastodon's share page takes one post).
  for (const w of compose.warnings ?? []) steps.push(w);
  steps.push(<>Press Post yourself, then tick anything the card hasn&apos;t ticked, or mark it posted.</>);
  return steps;
}

/** The Open link's shape, with the post's text as an ellipsis. */
function openPattern(a: PlatformAdapter) {
  const url = a.open.url("TEXT", a.server ? "your.server" : undefined);
  return url.replace("TEXT", "…");
}

function Code({ children }: { children: React.ReactNode }) {
  // Long URLs break anywhere, so they can't widen the page on a phone.
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] [overflow-wrap:anywhere]">{children}</code>;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

const ACTIONS: [string, string][] = [
  ["copy-post", "Copy a post"],
  ["mark-post", "Tick or clear a post"],
  ["open", "Open the platform"],
  ["copy-image", "Copy an image to the clipboard"],
  ["download-image", "Save an image or video as a file"],
  ["mark-image", "Tick or clear an image or video"],
  ["copy-alt", "Copy alt text"],
  ["mark-alt", "Tick or clear alt text"],
];

const cell = "border-b px-2 py-1.5 text-left align-top first:pl-0";
const link = "underline underline-offset-4 hover:text-foreground";

export const GUIDE_TITLE = "Using Crosspost with an agent";

/**
 * The guide's body, shared by the standalone page (`/assistants`, the address agents, llms.txt
 * and <link rel="help"> use) and the app's sheet (`#guide`), which shows it without leaving the
 * draft. `Title` renders the heading (an h1 on the page); the sheet leaves it out and shows the
 * title in its own bar, which stays put while the body scrolls.
 */
export function Guide({ Title }: { Title?: React.ElementType }) {
  return (
    <div className="min-w-0 space-y-10 text-base leading-relaxed">
      <header className="space-y-3">
        {Title && <Title className="text-3xl font-bold">{GUIDE_TITLE}</Title>}
        <p>
          Crosspost turns one draft into posts for each platform. It runs in your browser, doesn&apos;t ask for
          passwords or keys, and never posts on its own.
        </p>
        <p>
          It doesn&apos;t come with an agent, either. If you bring one, how you use it is your choice, under each
          platform&apos;s terms, on your own account. This page says what&apos;s here for it to work with, and where
          each platform draws the line.
        </p>
        {/* The payload's POSTING sentence, said to the reader. */}
        <p>
          You decide whether and when each post goes out. You may want to see it in the composer first, or may only
          have wanted a draft, so posting waits for your word.
        </p>
      </header>

      <Section id="who" title="What an agent can do, and what you do">
        <p>
          <b>In Crosspost, on any platform:</b> an agent can read the draft, copy posts, images, and alt text, open
          each platform from its card, and tick steps off.
        </p>
        <p>
          <b>In the composer, on {listOf(filled.map(nameOf))} only:</b> an agent can also add the posts, images,
          and alt text, following the steps below. These are open networks; their rules cover spam and manipulated
          reach, and say nothing about who types. Mastodon servers set their own rules, on each server&apos;s About
          page. Even here, the agent leaves Post to you unless you tell it otherwise.
        </p>
        <p>
          <b>On {listOf(opened.map(nameOf))}, you do it:</b> their terms don&apos;t allow automated use of their
          sites, and an account can be restricted or suspended for it. An agent opens these from the card and stops
          there. Follow the steps below; the card keeps track as you go.
        </p>
        <p>
          This is one draft, posted once per platform. Crosspost doesn&apos;t schedule, repeat, or bulk-post, and
          nothing here is for that.
        </p>
        <PlatformTable
          rows={platforms.map((a) => ({
            id: a.id,
            name: nameOf(a),
            composer: a.compose.agent === "composer" ? "Agent can fill it" : "You fill it",
            text: TEXT[a.compose.text],
            images: IMAGE[a.compose.image],
            thread: THREAD[a.compose.thread],
          }))}
        />
      </Section>

      <Section id="platforms" title="Steps for each platform">
        {/* Every platform's steps in one card, a rule between each. */}
        <div className="divide-y rounded-lg border bg-card">
          {platforms.map((a) => (
            <section key={a.id} id={`p-${a.id}`} aria-labelledby={`h-${a.id}`} className="scroll-mt-4 space-y-2 p-4">
              <h3 id={`h-${a.id}`} className="flex flex-wrap items-center gap-2 font-semibold">
                <Logo adapter={a} />
                {nameOf(a)}
                <span className="rounded-full border px-2 py-0.5 text-sm font-normal text-muted-foreground">
                  {a.compose.agent === "composer" ? "Agent can fill it" : "You fill it"}
                </span>
              </h3>
              <ol className="list-decimal space-y-1 pl-6">
                {stepsFor(a).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              {a.compose.tips?.length ? (
                <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
                  {a.compose.tips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Open link: <Code>{openPattern(a)}</Code>
                {a.server && <> (your server from Settings, or {a.server.default})</>}
                {a.open.withMedia && (
                  <>
                    ; with images, <Code>{a.open.withMedia.url}</Code>
                  </>
                )}
              </p>
              {a.compose.terms && (
                <p className="text-sm text-muted-foreground">
                  <a href={a.compose.terms} className={link}>
                    {a.name}&apos;s terms
                  </a>
                </p>
              )}
            </section>
          ))}
        </div>
      </Section>

      <Section id="draft" title="Reading the draft">
        <p>
          The Crosspost tab keeps the draft as JSON in <Code>{'<script id="crosspost-payload">'}</Code>, and{" "}
          <Code>window.crosspost.getPayload()</Code> returns the same object once the page has loaded. It updates as
          you edit and can&apos;t change anything. <Code>window.crosspost.getImage(n)</Code> returns tray image{" "}
          <Code>n</Code> as a data URL, with its file name and type, for attaching it where an agent may fill the
          composer.
        </p>
        <p>
          <Code>images</Code> lists the tray by number, with alt text. <Code>platforms</Code> lists each platform with
          its posts, Open link, composer facts (<Code>compose.agent</Code> is <Code>composer</Code> where an agent may
          fill it, <Code>open</Code> where it only opens it), and progress: one step per post, image, and alt text,
          plus one for @tags. <Code>posting</Code> is the sentence above about who decides that a post goes out, and{" "}
          <Code>guide</Code> is this page&apos;s path. This is version {PAYLOAD_VERSION}; new fields may appear without
          a new version.
        </p>
      </Section>

      <Section id="controls" title="Card buttons">
        <p>
          Each button has a fixed <Code>data-crosspost-action</Code>, plus <Code>data-platform</Code> and{" "}
          <Code>data-post</Code> or <Code>data-image</Code>. Post, image, and alt text rows have{" "}
          <Code>data-crosspost-step</Code> and <Code>data-done</Code>.
        </p>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {ACTIONS.map(([name, what]) => (
              <tr key={name}>
                <td className={cell}>
                  <Code>{name}</Code>
                </td>
                <td className={cell}>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Copying, saving, or opening ticks a step, and the mark buttons tick anything added another way. A card is
          marked posted when every step is ticked, or by hand. Copying an image can take a few seconds; a toast
          says when it&apos;s done.
        </p>
      </Section>

      <p className="text-muted-foreground">
        Platform composers and terms were read {CHECKED}. Both change, and it&apos;s your account, so go by the
        terms linked above. Report anything out of date on{" "}
        <a href="https://github.com/redlamp/crosspost/issues" className={link}>
          GitHub
        </a>
        .
      </p>
    </div>
  );
}
