// ── Text colour (GCB #11–GCB #17) ───────────────────────────────────────────────────
// Auto puts black or white text on the bar, whichever has the higher WORST-CASE contrast over the
// colours behind the text — not an average, so a dark stop under light text (or the reverse) is
// never hidden by the rest of the gradient. The result is written into the bar's rule as a
// literal colour by regenerating the stylesheet.

import { contrast, hexToRgb, themeHex } from "../shared/colour.js";
import { modal } from "../shared/modal.js";
import { isInert, settings } from "../shared/settings.js";
import { clamp } from "../shared/stop-editor.js";
import { BAR_ICON, BAR_LINK, PARENT, SELECTOR, barBase, findBar } from "./bar.js";
import { activeStops, applyCss } from "./render.js";
import { renderPreview, renderTextColour } from "./ui.js";

export const BLACK = "#000000";

export const WHITE = "#ffffff";

export const TEXT_DELAY = 100; // debounce for recalculations (GCB #15)

export const SAMPLES_BETWEEN = 8; // evenly spaced samples between the text region's edges (GCB #13)

export let textRegion = null; // { from, to }: the text's span as fractions of the bar's width, last measured

export function setTextRegion(region) {
  textRegion = region;
}

export let textResult = null; // the last calculation; kept while the bar is gone (GCB #15)

let textTimer = 0;

export let textRuns = 0; // counted for the self-test

// The colour written into the bar's rule now, or null to leave the text to Spotify. Black and
// White are literal; Auto is the last calculated choice.
export function appliedTextColour(s = settings) {
  if (s.textColour === "black") return BLACK;
  if (s.textColour === "white") return WHITE;
  if (s.textColour === "auto") return textResult?.colour ?? null;
  return null;
}

// The text's span (GCB #12): from the icon's left edge to the text button's right edge, as fractions
// of the bar's background area (its padding box). Null if the bar has no size or children.
function measureTextRegion(bar) {
  const icon = bar.querySelector(BAR_ICON);
  const link = bar.querySelector(BAR_LINK);
  const box = bar.getBoundingClientRect();
  const width = bar.clientWidth || box.width;
  if (!icon || !link || !width) return null;
  const left = box.left + bar.clientLeft;
  const from = clamp((icon.getBoundingClientRect().left - left) / width, 0, 1);
  const to = clamp((link.getBoundingClientRect().right - left) / width, 0, 1);
  return from <= to ? { from, to } : null;
}

// What the stops resolve to: the live theme colour from :root and the bar's own colour, as RGB.
export const textContext = () => ({ theme: hexToRgb(themeHex()), base: hexToRgb(barBase()) });

const stopRgb = (stop, { theme }) => (stop.kind === "theme" ? theme : hexToRgb(stop.color));

// The colours behind the text (GCB #13): both edges of the region, every stop inside it and 8 evenly
// spaced points in between, interpolated in sRGB between the opaque stop colours, as the
// browser draws the gradient. An inert background is just the bar's own colour (`base`).
export function gradientSamples(s, { from, to }, ctx) {
  const colours = isInert(s) ? [ctx.base] : activeStops(s).map((stop) => stopRgb(stop, ctx));
  const last = colours.length - 1;
  const positions = colours.map((_, i) => (last ? i / last : 0));
  const colourAt = (t) => {
    if (!last) return colours[0];
    const x = clamp(t, 0, 1) * last;
    const k = Math.min(Math.floor(x), last - 1);
    const u = x - k;
    return [0, 1, 2].map((i) => colours[k][i] + (colours[k + 1][i] - colours[k][i]) * u);
  };
  const between = Array.from({ length: SAMPLES_BETWEEN }, (_, k) => from + ((to - from) * (k + 1)) / (SAMPLES_BETWEEN + 1));
  const inside = positions.filter((p) => p > from && p < to);
  return [from, to, ...inside, ...between].sort((a, b) => a - b).map((t) => ({ t, rgb: colourAt(t) }));
}

// Black or white, whichever has the higher worst contrast over all samples (ties: black, as
// Spotify draws it). No warning when both are low: the user picks and judges the result.
export function pickTextColour(samples) {
  const worst = (rgb) => Math.min(...samples.map((sample) => contrast(rgb, sample.rgb)));
  const black = worst([0, 0, 0]);
  const white = worst([255, 255, 255]);
  return { colour: white > black ? WHITE : BLACK, black, white };
}

// Measures the bar if it's there (otherwise the last region is kept, or the whole width before
// the bar has ever been seen), samples, picks, and regenerates the stylesheet. `region` overrides
// the measurement (self-test only).
export function recalcTextColour({ region = null } = {}) {
  clearTimeout(textTimer);
  textTimer = 0;
  const bar = findBar();
  if (bar) textRegion = measureTextRegion(bar) ?? textRegion;
  const used = region ?? textRegion ?? { from: 0, to: 1 };
  const samples = gradientSamples(settings, used, textContext());
  const pick = pickTextColour(samples);
  const mode = settings.textColour;
  const colour = mode === "auto" ? pick.colour : appliedTextColour();
  textResult = {
    mode,
    colour,
    contrast: colour === BLACK ? pick.black : colour === WHITE ? pick.white : null,
    black: pick.black,
    white: pick.white,
    region: used,
    measured: !region && !!textRegion,
    barPresent: !!bar,
    samples: samples.length,
  };
  textRuns++;
  applyCss();
  if (modal) {
    renderTextColour();
    renderPreview();
  }
  return textResult;
}

export function scheduleTextColour() {
  clearTimeout(textTimer);
  textTimer = setTimeout(recalcTextColour, TEXT_DELAY);
}

// Theme colours (and the bar's own colour under a solid theme colour) change at runtime: Hazy
// rewrites them on :root after every song change.
const followsTheme = (s = settings) =>
  s.textColour !== "default" && (isInert(s) || activeStops(s).some((stop) => stop.kind === "theme"));

// Recalculation triggers (GCB #15): the bar appearing or changing (an observer on the now-playing
// aside), the window resizing, and — while a theme-colour stop is used — song changes and
// :root style changes (Hazy sets its colour after the song change, not with it). Settings
// changes come through update(). The aside is re-found if Spotify replaces it; before it
// exists, one body observer waits for it and then disconnects.
export let asideObserver = null;

export let watchedAside = null;

let bodyObserver = null;

function watchBar() {
  const aside = document.querySelector(PARENT);
  if (aside && aside === watchedAside) return;
  asideObserver?.disconnect();
  asideObserver = null;
  watchedAside = aside;
  if (!aside) {
    if (bodyObserver) return;
    bodyObserver = new MutationObserver(() => {
      if (!document.querySelector(PARENT)) return;
      bodyObserver.disconnect();
      bodyObserver = null;
      watchBar();
      scheduleTextColour();
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
    return;
  }
  asideObserver = new MutationObserver(onAsideMutation);
  // The bar is a direct child; its own subtree changes when the device name does. The aside's
  // parent tells us when the aside itself is replaced.
  asideObserver.observe(aside, { childList: true, subtree: true, characterData: true });
  if (aside.parentElement) asideObserver.observe(aside.parentElement, { childList: true });
}

// Most mutations in the aside are the player's own (the time label every second): only ones
// that add or remove a direct child, or happen inside the bar, schedule a recalculation.
function onAsideMutation(records) {
  if (!watchedAside?.isConnected) {
    watchBar();
    return scheduleTextColour();
  }
  const insideBar = (node) => (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest?.(SELECTOR);
  if (records.some((r) => (r.target === watchedAside && r.type === "childList") || insideBar(r.target))) scheduleTextColour();
}

export const onThemeChange = () => followsTheme() && scheduleTextColour();

export function watchTextTriggers() {
  watchBar();
  window.addEventListener("resize", scheduleTextColour);
  Spicetify.Player.addEventListener("songchange", onThemeChange);
  new MutationObserver(onThemeChange).observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
}
