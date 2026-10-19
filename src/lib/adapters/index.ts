import { bluesky } from "./bluesky";
import { facebook } from "./facebook";
import { instagram } from "./instagram";
import { linkedin } from "./linkedin";
import { threads } from "./threads";
import { twitter } from "./twitter";
import type { PlatformAdapter } from "./types";

export type { Breakpoint, PlatformAdapter, PlatformBrand } from "./types";

export const adapters: PlatformAdapter[] = [bluesky, threads, linkedin, twitter, facebook, instagram];
