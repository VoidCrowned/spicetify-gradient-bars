// Song progress bar only — the volume slider is the same component without this test id.

import { BRIGHTEN, HOVER_TRANSITION, reducedMotion } from "../shared/hover.js";
import { isInert, settings, stopColour } from "../shared/settings.js";

export const SCOPE = ':is([data-testid="playback-progressbar"], .main-nowPlayingBar-center .playback-bar)';

export const FILL = ".x-progressBar-fillColor";

export const HANDLE = ':is([data-testid="progress-bar-handle"], .progress-bar__slider, .x-progressBar-handle)';

// The colours actually drawn: all stops for a gradient, otherwise just the first.
function activeColours(s) {
  return s.gradient ? s.stops.map(stopColour) : [stopColour(s.stops[0])];
}

// The fill's background image — also used by the modal preview so the two can't drift.
// Stops are evenly spaced.
export function fillImage(s) {
  const colours = activeColours(s);
  if (colours.length === 1) return `linear-gradient(${colours[0]}, ${colours[0]})`;
  return `linear-gradient(90deg, ${colours.join(", ")})`;
}

// The fill is a full-width element translated left, so only its rightmost
// --progress-bar-transform percent is visible. Gradient-only declarations per mode (GPB #15):
// - Compress: size the gradient to that visible slice and anchor it right, so the whole
//   gradient always spans bar start → playhead.
// - Anchored: undo Spotify's translate and clip at the playhead instead, so the colours stay
//   fixed to the track. The one deliberate exception to "never set transform" (CLAUDE.md).
// - Slide: no overrides; the full-track gradient moves with the fill.
const MODE_CSS = {
  compress: [
    "background-size: var(--progress-bar-transform) 100%;",
    "background-position: right center;",
    "background-repeat: no-repeat;",
  ],
  anchored: [
    "background-size: 100% 100%;",
    "transform: none;",
    "clip-path: inset(0 calc(100% - var(--progress-bar-transform)) 0 0 round var(--progress-bar-radius));",
  ],
  slide: [],
};

// Selectors are ≥ 0,2,0 so they beat themes' single-class rules without !important.
// background-image (not -color) keeps Spotify's hover swap of background-color hidden.
// Solid output is the same in every mode. Inert colours with a hover effect: only its rules.
export function buildCss(s, reduced = reducedMotion()) {
  const hover = hoverCss(s, reduced);
  if (isInert(s)) return hover.length ? [...hover, ``].join("\n") : "";
  const colours = activeColours(s);
  const handle = colours[colours.length - 1]; // the last stop in every mode (GPB #22 may refine Anchored)
  const spread = s.gradient ? MODE_CSS[s.mode].map((line) => `  ${line}`) : [];
  return [
    `${SCOPE} ${FILL} {`,
    `  background-image: ${fillImage(s)};`,
    ...spread,
    `}`,
    `${SCOPE} ${HANDLE} {`,
    `  background-color: ${handle};`,
    `}`,
    ...hover,
    ``,
  ].join("\n");
}

// The hover effect (#3): Brighten filters the fill while the song bar is hovered, nothing else.
// Never the handle, whose ::before is playback-bar-waveform's timestamp tooltip. The transition
// sits on the fill's resting rule so it runs both ways; reduced motion leaves it out.
export function hoverCss(s, reduced = reducedMotion()) {
  if (s.hover !== "brighten") return [];
  return [
    ...(reduced ? [] : [`${SCOPE} ${FILL} {`, `  transition: ${HOVER_TRANSITION};`, `}`]),
    `${SCOPE}:hover ${FILL} {`,
    `  filter: ${BRIGHTEN};`,
    `}`,
  ];
}

export function applyCss() {
  let style = document.getElementById("gpb-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "gpb-style";
    document.head.appendChild(style);
  }
  const css = buildCss(settings);
  if (style.textContent !== css) style.textContent = css;
}
