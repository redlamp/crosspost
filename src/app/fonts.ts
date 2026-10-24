import localFont from "next/font/local";

// Overpass is the free cut of Highway Gothic, the lettering on US road signs: it suits a signpost
// logo. The files are Google Fonts' own subsets (src/assets/fonts, the ranges below theirs),
// loaded from here rather than next/font/google for the metric overrides, which only a local
// font can carry: Overpass reserves 0.883em above the baseline and 0.383em below (its caps are
// 0.70em), which centers lowercase but leaves caps and ascenders riding 0.08em high in anything
// that centers text (a button, a chip, a badge). The overrides keep the box's height (126.6%)
// and move the baseline down, so the caps' middle sits at 49% of the box, as Arial's does.
// One call per subset: a call's files share its declarations, the range among them. Only the
// latin files are preloaded and carry the CSS variables; the rest come in when a glyph needs them.
// The variables hold a name made from each call's identifier ("overpassMono"), not the family
// declared below, so globals.css names the families itself and keeps the variables after them for
// their fallback faces.

export const overpass = localFont({
  src: "../assets/fonts/overpass-latin.woff2",
  weight: "100 900",
  variable: "--font-overpass",
  declarations: [
    { prop: "font-family", value: "Overpass" },
    { prop: "ascent-override", value: "97%" },
    { prop: "descent-override", value: "29.6%" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});

export const overpassLatinExt = localFont({
  src: "../assets/fonts/overpass-latin-ext.woff2",
  weight: "100 900",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Overpass" },
    { prop: "ascent-override", value: "97%" },
    { prop: "descent-override", value: "29.6%" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
});

export const overpassCyrillic = localFont({
  src: "../assets/fonts/overpass-cyrillic.woff2",
  weight: "100 900",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Overpass" },
    { prop: "ascent-override", value: "97%" },
    { prop: "descent-override", value: "29.6%" },
    { prop: "unicode-range", value: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" },
  ],
});

export const overpassCyrillicExt = localFont({
  src: "../assets/fonts/overpass-cyrillic-ext.woff2",
  weight: "100 900",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Overpass" },
    { prop: "ascent-override", value: "97%" },
    { prop: "descent-override", value: "29.6%" },
    { prop: "unicode-range", value: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F" },
  ],
});

export const overpassVietnamese = localFont({
  src: "../assets/fonts/overpass-vietnamese.woff2",
  weight: "100 900",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Overpass" },
    { prop: "ascent-override", value: "97%" },
    { prop: "descent-override", value: "29.6%" },
    {
      prop: "unicode-range",
      value:
        "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
    },
  ],
});

export const overpassMono = localFont({
  src: "../assets/fonts/overpass-mono-latin.woff2",
  weight: "300 700",
  variable: "--font-overpass-mono",
  declarations: [
    { prop: "font-family", value: "Overpass Mono" },
    { prop: "ascent-override", value: "97%" },
    { prop: "descent-override", value: "29.6%" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});

export const overpassMonoLatinExt = localFont({
  src: "../assets/fonts/overpass-mono-latin-ext.woff2",
  weight: "300 700",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Overpass Mono" },
    { prop: "ascent-override", value: "97%" },
    { prop: "descent-override", value: "29.6%" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
});

export const overpassMonoCyrillic = localFont({
  src: "../assets/fonts/overpass-mono-cyrillic.woff2",
  weight: "300 700",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Overpass Mono" },
    { prop: "ascent-override", value: "97%" },
    { prop: "descent-override", value: "29.6%" },
    { prop: "unicode-range", value: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" },
  ],
});

export const overpassMonoCyrillicExt = localFont({
  src: "../assets/fonts/overpass-mono-cyrillic-ext.woff2",
  weight: "300 700",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Overpass Mono" },
    { prop: "ascent-override", value: "97%" },
    { prop: "descent-override", value: "29.6%" },
    { prop: "unicode-range", value: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F" },
  ],
});

export const overpassMonoVietnamese = localFont({
  src: "../assets/fonts/overpass-mono-vietnamese.woff2",
  weight: "300 700",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Overpass Mono" },
    { prop: "ascent-override", value: "97%" },
    { prop: "descent-override", value: "29.6%" },
    {
      prop: "unicode-range",
      value:
        "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
    },
  ],
});

/** The classes for the root element: the two CSS variables, and the other subsets' faces along with them. */
export const fontClassName = [
  overpass.variable,
  overpassMono.variable,
  overpassLatinExt.className,
  overpassCyrillic.className,
  overpassCyrillicExt.className,
  overpassVietnamese.className,
  overpassMonoLatinExt.className,
  overpassMonoCyrillic.className,
  overpassMonoCyrillicExt.className,
  overpassMonoVietnamese.className,
].join(" ");
