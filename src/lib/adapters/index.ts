import { bluesky } from "./bluesky";
import { facebook } from "./facebook";
import { instagram } from "./instagram";
import { linkedin } from "./linkedin";
import { mastodon } from "./mastodon";
import { threads } from "./threads";
import { twitter } from "./twitter";
import { x } from "./x";
import type { PlatformAdapter } from "./types";

export type { Breakpoint, PlatformAdapter, PlatformBrand } from "./types";

export const adapters: PlatformAdapter[] = [bluesky, threads, mastodon, linkedin, twitter, x, facebook, instagram];
