// ── Colour picker (GPB #32, GPB #35) ──
// Chromium's native picker popup is browser chrome and can't be extended, so this mirrors
// its layout — saturation/value square, eyedropper, swatch, hue bar, R/G/B — and adds a hex
// field and "Use theme colour". It's an inline panel that always edits the selected dot.
// Edits apply live and update the dot in place: the dots row is never re-rendered by them.

import { writeClipboard } from "./clipboard.js";
import { hexToHsv, hexToRgb, hsvToHex, parseHex, resolveStop, rgbToHex, toHex } from "./colour.js";
import { modal } from "./modal.js";
import { clamp, renderStop } from "./stop-editor.js";
import { findStop, linkStopToTheme, selectedId, setStopColour } from "./stops.js";

export let pickerHsv = { h: 0, s: 0, v: 0 }; // kept apart from the hex so hue survives greys and black

export const pickerStop = () => (modal ? findStop(selectedId) : null);

// ── Hex copy button (GPB #56) ──
// Copies the selected stop's colour as #rrggbb (a theme stop's resolved colour), never the
// field's text, so half-typed or invalid input can't be copied. Through writeClipboard() (GPB #54);
// the icon turns into a check for HEX_COPIED_MS. Nothing else changes and nothing re-renders.

export const HEX_COPY_LABEL = "Copy hex code";

export const HEX_COPIED_MS = 1500;

export async function copyHex(m) {
  const stop = pickerStop();
  if (!stop) return null;
  const tier = await writeClipboard(resolveStop(stop));
  if (modal !== m) return tier;
  if (!tier) {
    m.hex.focus({ preventScroll: true }); // every tier failed: Ctrl+C on the selected field works
    m.hex.select();
    return null;
  }
  clearTimeout(m.hexCopiedTimer);
  showHexCopied(m, true);
  m.hexCopiedTimer = setTimeout(() => showHexCopied(m, false), HEX_COPIED_MS);
  m.announce.textContent = "Hex code copied";
  return tier;
}

// In place: only which icon is hidden changes, never the button (GPB #26).
function showHexCopied(m, copied) {
  m.hexCopyIcon.toggleAttribute("hidden", copied);
  m.hexCopyCheck.toggleAttribute("hidden", !copied);
}

// Loads a stop's current colour into the picker. The previous hue is kept for greys.
export function showInPicker(stop, from = null) {
  pickerHsv = hexToHsv(resolveStop(stop), pickerHsv.h);
  renderPicker(stop, from);
}

// `from` is the control being edited; it keeps its own text while you type.
function renderPicker(stop, from = null) {
  const m = modal;
  const hex = resolveStop(stop);
  const { h, s, v } = pickerHsv;
  m.sv.style.backgroundColor = `hsl(${h}, 100%, 50%)`;
  m.svHandle.style.left = `${s * 100}%`;
  m.svHandle.style.top = `${(1 - v) * 100}%`;
  m.sv.setAttribute("aria-valuetext", `Saturation ${Math.round(s * 100)}%, brightness ${Math.round(v * 100)}%`);
  m.hueHandle.style.left = `${(h / 360) * 100}%`;
  m.hue.setAttribute("aria-valuenow", String(Math.round(h)));
  m.swatch.style.backgroundColor = hex;
  if (from !== "rgb")
    hexToRgb(hex).forEach((n, i) => {
      m.rgb[i].value = String(n);
      m.rgb[i].setAttribute("aria-invalid", "false");
    });
  if (from !== "hex") {
    m.hex.value = hex;
    m.hex.setAttribute("aria-invalid", "false");
  }
  const isTheme = stop.kind === "theme";
  m.useThemeButton.disabled = isTheme;
  m.useThemeButton.textContent = isTheme ? "Following theme colour" : "Use theme colour";
}

// Applies a colour to the picker's stop: bar, preview and dot update in place; a theme stop
// becomes custom. Colours from the square or hue bar keep their exact HSV.
function commitPickerColour(hex, from = null) {
  const stop = pickerStop();
  if (!stop) return;
  if (from !== "hsv") pickerHsv = hexToHsv(hex, pickerHsv.h);
  if (stop.kind !== "custom" || stop.color !== hex) {
    setStopColour(stop.id, hex);
    renderStop(stop);
  }
  renderPicker(stop, from);
}

// Pointer drag on a picker area → apply({ x, y }) as fractions 0–1. Pointer capture keeps
// the drag (and its click) on the area even outside the modal; moves are coalesced to one
// update per frame, and the final position is applied on release.
function enablePointerDrag(el, apply) {
  let active = false;
  let pending = null;
  let frame = 0;
  const at = (e) => {
    const r = el.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / (r.width || 1), 0, 1), y: clamp((e.clientY - r.top) / (r.height || 1), 0, 1) };
  };
  const flush = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!pending) return;
    const p = pending;
    pending = null;
    apply(p);
  };
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection or native drag
    el.focus({ preventScroll: true });
    try {
      el.setPointerCapture(e.pointerId);
    } catch {} // synthetic events (self-test) have no active pointer
    active = true;
    apply(at(e));
  });
  el.addEventListener("pointermove", (e) => {
    if (!active) return;
    pending = at(e);
    frame ||= requestAnimationFrame(flush);
  });
  const end = (e) => {
    if (!active) return;
    active = false;
    if (e.type === "pointerup") pending = at(e);
    flush();
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

export function enableColourPicker(m) {
  const setHsv = (change) => {
    pickerHsv = { ...pickerHsv, ...change };
    commitPickerColour(hsvToHex(pickerHsv), "hsv");
  };
  enablePointerDrag(m.sv, ({ x, y }) => setHsv({ s: x, v: 1 - y }));
  enablePointerDrag(m.hue, ({ x }) => setHsv({ h: x * 360 }));

  // Arrow keys: 1 % (hue: 1°), with Shift 10 % (10°).
  m.sv.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowDown: [0, -step], ArrowUp: [0, step] }[e.key];
    if (!delta) return;
    e.preventDefault();
    setHsv({ s: clamp(pickerHsv.s + delta[0], 0, 1), v: clamp(pickerHsv.v + delta[1], 0, 1) });
  });
  m.hue.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 10 : 1;
    const delta = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[e.key];
    if (!delta) return;
    e.preventDefault();
    setHsv({ h: clamp(pickerHsv.h + delta, 0, 360) });
  });

  for (const field of m.rgb)
    field.addEventListener("input", () => {
      const texts = m.rgb.map((f) => f.value.trim());
      const values = texts.map((t) => (/^\d{1,3}$/.test(t) && +t <= 255 ? +t : null));
      m.rgb.forEach((f, i) => f.setAttribute("aria-invalid", String(values[i] === null && texts[i] !== "")));
      if (values.every((n) => n !== null)) commitPickerColour(rgbToHex(values), "rgb");
    });
  m.hex.addEventListener("input", () => {
    const hex = parseHex(m.hex.value);
    m.hex.setAttribute("aria-invalid", String(!hex && m.hex.value.trim() !== ""));
    if (hex) commitPickerColour(hex, "hex");
  });
  // Leaving a field (or Enter) shows the normalised value.
  for (const field of [...m.rgb, m.hex]) {
    field.addEventListener("change", () => pickerStop() && renderPicker(pickerStop()));
    field.addEventListener("keydown", (e) => e.key === "Enter" && field.blur());
  }

  // A mouse click leaves focus (and any half-typed text) in the field.
  m.hexCopy.addEventListener("mousedown", (e) => e.preventDefault());
  m.hexCopy.addEventListener("click", () => copyHex(m));
  m.cleanups.push(() => clearTimeout(m.hexCopiedTimer));

  m.useThemeButton.addEventListener("click", () => {
    const stop = pickerStop();
    if (!stop || stop.kind === "theme") return;
    const hadFocus = document.activeElement === m.useThemeButton; // it's about to be disabled
    linkStopToTheme(stop.id);
    renderStop(stop);
    showInPicker(stop);
    if (hadFocus) m.hex.focus({ preventScroll: true });
  });

  m.eyedropper?.addEventListener("click", async () => {
    const id = selectedId;
    try {
      const hex = toHex((await new window.EyeDropper().open()).sRGBHex);
      if (hex && modal === m && pickerStop()?.id === id) commitPickerColour(hex);
    } catch {} // cancelled with Escape
  });
}
