import type { PlatformAdapter } from "./types";
import { twitter } from "./twitter";

/**
 * The same service as Twitter, under its current name and logo, for people
 * who'd rather see X. Hidden by default: Twitter shows unless the user picks
 * this one in Settings.
 */
export const x: PlatformAdapter = {
  ...twitter,
  id: "x",
  name: "X",
  // A black mark, so it follows the theme's text color.
  brand: {
    iconPath:
      "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  },
  hiddenByDefault: true,
};
