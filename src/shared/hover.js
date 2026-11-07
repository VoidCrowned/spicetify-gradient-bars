// ── Hover effect (#3, #8) ───────────────────────────────────────────────────
// settings.hover: "none" (default), "brighten", or, where the bar offers it (HOVER_MODES),
// "glow". Missing in storage means "none" (settings from before this option), silently. Not part
// of presets or share codes: applying either keeps the current hover effect.
// The effect applies only while the bar is hovered, with a short transition that's left out
// when the user prefers reduced motion (read from JS: the stylesheet stays a flat list of rules).

import { HOVER_MODES, P } from "ext:config";
import { labelOnLight } from "./colour.js";
import { modal } from "./modal.js";
import { settings, update } from "./settings.js";

export const DEFAULT_HOVER = "none";

export const HOVER_LABELS = { none: "None", brighten: "Brighten", glow: "Glow" };

// Brighten: visible on dark and light colours alike, without washing them out.
export const BRIGHTEN = "brightness(1.2)";

export const GLOW_BLUR = "8px";

export const HOVER_TRANSITION = "filter .2s ease-out";

// The stored value, or null if it isn't one of this bar's options.
export function validHover(value) {
  const hover = value === undefined ? DEFAULT_HOVER : value;
  return HOVER_MODES.includes(hover) ? hover : null;
}

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export const reducedMotion = () => !!window.matchMedia?.(MOTION_QUERY).matches;

// The stylesheet is rebuilt when the preference changes.
export function watchReducedMotion(apply) {
  window.matchMedia?.(MOTION_QUERY).addEventListener?.("change", () => apply());
}

// ── Hover row ──
// A radiogroup of plain buttons like the Spread and Text colour rows (no <select>: Hazy styles
// select globally). Built once per open and only updated in place, so a click never detaches its
// target. Roving tabindex; ←/→ (wrapping), Home and End move the choice, without modifier keys.

export const HOVER_ROW_CSS = `
.${P}-hover { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
.${P}-hover-options { display: flex; gap: 2px; padding: 2px; border-radius: 500px; background-color: rgba(var(--spice-rgb-text), .1); }
.${P}-hover-option { padding: 4px 12px; border: 1px solid transparent; border-radius: 500px; background: none; color: var(--spice-text); font: inherit; font-size: .875rem; font-weight: 700; white-space: nowrap; cursor: pointer; transition: background-color .15s; }
.${P}-hover-option[aria-checked="true"] { background-color: var(--spice-button); }
.${P}-hover-option.${P}-on-light { color: var(--spice-main); }
.${P}-hover-option:hover:not([aria-checked="true"]) { background-color: rgba(var(--spice-rgb-text), .1); }
.${P}-hover-option:focus-visible { outline: 2px solid var(--spice-text); outline-offset: 2px; }
`;

export function hoverRowMarkup() {
  return `
    <div class="${P}-hover">
      <span class="${P}-label" id="${P}-hover-label">Hover</span>
      <div class="${P}-hover-options" role="radiogroup" aria-labelledby="${P}-hover-label">
        ${HOVER_MODES.map((mode) => `<button type="button" class="${P}-hover-option" role="radio" data-hover="${mode}">${HOVER_LABELS[mode]}</button>`).join("")}
      </div>
    </div>`;
}

export function hoverRefs(root) {
  return {
    hover: root.querySelector(`.${P}-hover`),
    hoverOptions: root.querySelector(`.${P}-hover-options`),
    hoverButtons: [...root.querySelectorAll(`.${P}-hover-option`)],
  };
}

function setHover(mode) {
  if (!HOVER_MODES.includes(mode) || mode === settings.hover) return;
  settings.hover = mode;
  update({ rerender: false });
  if (modal) renderHoverRow();
}

export function enableHoverRow(m) {
  m.hoverOptions.addEventListener("click", (e) => {
    const button = e.target.closest(`.${P}-hover-option`);
    if (button) setHover(button.dataset.hover);
  });
  m.hoverOptions.addEventListener("keydown", (e) => {
    const button = e.target.closest(`.${P}-hover-option`);
    if (!button || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const i = m.hoverButtons.indexOf(button);
    const last = m.hoverButtons.length - 1;
    const next = { ArrowLeft: i ? i - 1 : last, ArrowRight: i === last ? 0 : i + 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setHover(m.hoverButtons[next].dataset.hover);
    m.hoverButtons[next].focus();
  });
}

// In place: aria-checked, tabindex, the label colour on the filled button.
export function renderHoverRow() {
  const onLight = labelOnLight(modal.hoverOptions);
  for (const button of modal.hoverButtons) {
    const checked = button.dataset.hover === settings.hover;
    button.setAttribute("aria-checked", String(checked));
    button.tabIndex = checked ? 0 : -1;
    button.classList.toggle(`${P}-on-light`, checked && onLight);
  }
}
