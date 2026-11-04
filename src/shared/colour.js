// Colour conversions and WCAG contrast, shared by the picker, the swatches and the self-tests.

import { OPAQUE_ONLY } from "ext:config";

let colourCtx = null;

// Any CSS colour → #rrggbb (alpha dropped), or null if it isn't a colour. With OPAQUE_ONLY
// (GCB: colours are opaque only) anything translucent counts as no colour: the canvas serialises
// it as rgba().
export function toHex(value) {
  if (!value || !CSS.supports("color", value)) return null;
  colourCtx ??= document.createElement("canvas").getContext("2d");
  colourCtx.fillStyle = "#000000";
  colourCtx.fillStyle = value;
  const out = colourCtx.fillStyle; // "#rrggbb", or "rgba(r, g, b, a)" when translucent
  if (out.startsWith("#")) return out;
  if (OPAQUE_ONLY) return null;
  const [r, g, b] = out.match(/[\d.]+/g);
  return "#" + [r, g, b].map((n) => Math.round(+n).toString(16).padStart(2, "0")).join("");
}

export const rootColour = (name) => toHex(getComputedStyle(document.documentElement).getPropertyValue(name).trim());

// The live theme colour a theme stop draws, as #rrggbb (the CSS itself uses THEME_COLOUR).
export const themeHex = () => rootColour("--spice-button") || rootColour("--spice-text") || "#1db954";

// A stop's current colour as #rrggbb — for UI swatches and the picker only.
export function resolveStop(stop) {
  return stop.kind === "theme" ? themeHex() : stop.color;
}

export const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export const rgbToHex = (rgb) => "#" + rgb.map((n) => n.toString(16).padStart(2, "0")).join("");

// `hue` is kept when the colour has none (greys).
export function hexToHsv(hex, hue = 0) {
  const [r, g, b] = hexToRgb(hex).map((n) => n / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = hue;
  if (d) h = 60 * (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }) {
  const channel = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return rgbToHex([channel(5), channel(3), channel(1)]);
}

// "#rrggbb", "rrggbb", "#rgb" or "rgb" → "#rrggbb", otherwise null.
export function parseHex(value) {
  let hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = [...hex].map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
}

// True when --spice-main contrasts more with the live --spice-button than --spice-text (GPB #43).
export function labelOnLight(el) {
  const fill = computedRgb(el, "var(--spice-button)");
  const text = computedRgb(el, "var(--spice-text)");
  const main = computedRgb(el, "var(--spice-main)");
  return !!(fill && text && main) && contrast(main, fill) > contrast(text, fill);
}

// The computed sRGB value of a CSS colour, as [r, g, b, a] (0–255, alpha 0–1), or [r, g, b] with
// OPAQUE_ONLY, or null. Read through caret-color on one of our own elements (never Spotify's: no
// inline styles there), which holds no editable text, so it has no visible effect. color-mix()
// converts any colour space to sRGB first. (GPB mixes with transparent, GCB with the colour
// itself; both give the colour unchanged.)
export function computedRgb(el, colour) {
  const mix = OPAQUE_ONLY ? `color-mix(in srgb, ${colour}, ${colour})` : `color-mix(in srgb, ${colour} 100%, transparent)`;
  el.style.setProperty("caret-color", mix);
  const rgb = parseRgb(getComputedStyle(el).caretColor);
  el.style.removeProperty("caret-color");
  return rgb;
}

// Computed colours come back as rgb(), rgba() or color(srgb …), with commas or spaces →
// [r, g, b, alpha] (0–255, alpha 0–1). With OPAQUE_ONLY → [r, g, b], and anything with an alpha
// below 1 (rgba(), "transparent") gives null.
export function parseRgb(colour) {
  const srgb = /^color\(srgb\s/.test(colour);
  if (!srgb && !/^rgba?\(/.test(colour)) return null;
  const n = colour.match(/-?[\d.]+(?:e-?\d+)?/g)?.map(Number) ?? [];
  if (n.length < 3 || n.some(Number.isNaN)) return null;
  const rgb = n.slice(0, 3).map((v) => Math.min(255, Math.max(0, srgb ? v * 255 : v)));
  const alpha = n[3] ?? 1;
  if (OPAQUE_ONLY) return alpha < 1 ? null : rgb;
  return [...rgb, alpha];
}

// WCAG 2 relative luminance and contrast ratio (alpha ignored).
export function luminance([r, g, b]) {
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
