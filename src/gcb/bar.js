// The Connect bar ("Playing on …" below the player), verified on Spotify 1.3.4.258 (CLAUDE.md →
// Verified facts). Spotify only renders it while audio plays on another device and removes it when
// playback comes back. Found by the aside's test id, Encore's readable set class and its icon +
// text-link children; its hashed classes change with every Spotify build.

import { parseRgb, rgbToHex, rootColour, themeHex } from "../shared/colour.js";

export const SELECTOR =
  '[data-testid="now-playing-bar"] > .encore-bright-accent-set:has(> svg[data-encore-id="icon"] + button[data-encore-id="textLink"])';

export const PARENT = '[data-testid="now-playing-bar"]'; // the aside the bar lives in

export const UNSCOPED = SELECTOR.slice(`${PARENT} > `.length); // the self-test counts this too ("parent changed")

export const BAR_ICON = ':scope > svg[data-encore-id="icon"]';

export const BAR_LINK = ':scope > button[data-encore-id="textLink"]';

// The bar, queried on demand. Never stored: Spotify removes and re-creates it.
export const findBar = () => document.querySelector(SELECTOR);

// The bar's own colour, kept under a solid theme colour and shown under the preview: the live
// bar's computed background-color (Spotify paints it with var(--background-base)), else the last
// one seen, else what Spicetify maps --background-base to for .encore-bright-accent-set:
// --spice-button-active.
let lastBarBase = null;

export function barBase() {
  const bar = findBar();
  if (bar) {
    const rgb = parseRgb(getComputedStyle(bar).backgroundColor);
    if (rgb) lastBarBase = rgbToHex(rgb.map(Math.round));
  }
  return lastBarBase || rootColour("--spice-button-active") || themeHex();
}
