// The stops actually drawn: all of them for a gradient, otherwise just the first.

import { BRIGHTEN, GLOW_BLUR, HOVER_TRANSITION, reducedMotion } from "../shared/hover.js";
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
export function buildCss(s, textColour = null, reduced = reducedMotion()) {
  const declarations = [];
  if (!isInert(s)) declarations.push(`background-image: ${barImage(s)};`);
  if (textColour) declarations.push(`--text-base: ${textColour};`, `--essential-base: ${textColour};`);
  const hover = hoverCss(s, reduced);
  if (!declarations.length && !hover.length) return "";
  const bar = declarations.length ? [`${SELECTOR} {`, ...declarations.map((line) => `  ${line}`), `}`] : [];
  return [...bar, ...hover, ``].join("\n");
}

// The hover and pseudo-element selectors (#8), the only ones besides SELECTOR.
export const HOVER_SELECTORS = { hover: `${SELECTOR}:hover`, glow: `${SELECTOR}::before`, glowHover: `${SELECTOR}:hover::before` };

// The hover effect (#8), only while the bar is hovered. The transition sits on the resting rule so
// it runs both ways; reduced motion leaves it out.
// - Brighten: a filter on the bar.
// - Glow: a copy of the bar's own gradient (one colour: that colour; an inert background: the
//   bar's own --background-base) behind the bar: z-index -1 puts it under the bar's background
//   (the bar is position: relative, its children static, the aside transparent). At rest it's
//   unblurred, so the bar covers it; hovered, it's blurred and shows around the bar.
export function hoverCss(s, reduced = reducedMotion()) {
  const transition = reduced ? [] : [`  transition: ${HOVER_TRANSITION};`];
  if (s.hover === "brighten")
    return [...(reduced ? [] : [`${SELECTOR} {`, ...transition, `}`]), `${HOVER_SELECTORS.hover} {`, `  filter: ${BRIGHTEN};`, `}`];
  if (s.hover !== "glow") return [];
  const image = isInert(s) ? "linear-gradient(var(--background-base), var(--background-base))" : barImage(s);
  return [
    `${HOVER_SELECTORS.glow} {`,
    `  content: "";`,
    `  position: absolute;`,
    `  inset: 0;`,
    `  z-index: -1;`,
    `  border-radius: inherit;`,
    `  background-image: ${image};`,
    `  filter: blur(0);`,
    ...transition,
    `  pointer-events: none;`,
    `}`,
    `${HOVER_SELECTORS.glowHover} {`,
    `  filter: blur(${GLOW_BLUR});`,
    `}`,
  ];
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
