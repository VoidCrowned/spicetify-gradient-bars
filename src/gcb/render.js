
// The stops actually drawn: all of them for a gradient, otherwise just the first.

import { isInert, settings, stopColour } from "../shared/settings.js";
import { SELECTOR } from "./bar.js";
import { appliedTextColour } from "./text-colour.js";

export function activeStops(s) {
  return s.gradient ? s.stops : [s.stops[0]];
}


// The bar's background image — also used by the modal preview so the two can't drift. Stops are
// evenly spaced across the bar's full width; nothing follows playback (GCB #6).
export function barImage(s) {
  const colours = activeStops(s).map(stopColour);
  if (colours.length === 1) colours.push(colours[0]);
  return `linear-gradient(to right, ${colours.join(", ")})`;
}


// One rule on the bar. The selector is 0,4,2, so it beats any theme's rules without !important.
// background-image only: Spotify's background-color (var(--background-base)) stays underneath.
// `textColour` (GCB #14) is a literal colour for the text and the icon, or null to leave them to
// Spotify; --text-base and --essential-base change inside this rule only, never globally.
export function buildCss(s, textColour = null) {
  const declarations = [];
  if (!isInert(s)) declarations.push(`background-image: ${barImage(s)};`);
  if (textColour) declarations.push(`--text-base: ${textColour};`, `--essential-base: ${textColour};`);
  if (!declarations.length) return "";
  return [`${SELECTOR} {`, ...declarations.map((line) => `  ${line}`), `}`, ``].join("\n");
}


export function applyCss() {
  let style = document.getElementById("gcb-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "gcb-style";
    document.head.appendChild(style);
  }
  const css = buildCss(settings, appliedTextColour());
  if (style.textContent !== css) style.textContent = css;
}
