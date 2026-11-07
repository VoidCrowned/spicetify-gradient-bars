// Gradient Progress Bar's part of the settings window: the Spread row (GPB #15) and the preview
// strip (GPB #9), plus the hooks the shared modules call (see shared/modal.js, settings.js,
// presets-ui.js and entry.js).

// The Spread row and its radio buttons, and the preview strip: the bar at 100 %.

import { HOVER_ROW_CSS, enableHoverRow, hoverRefs, hoverRowMarkup, renderHoverRow } from "../shared/hover.js";
import { labelOnLight } from "../shared/colour.js";
import { modal, openModal } from "../shared/modal.js";
import { previewing } from "../shared/presets-ui.js";
import { settings, update } from "../shared/settings.js";
import { SCOPE, fillImage } from "./render.js";
import { MODES } from "./settings.js";

export const OPTION_ROW_CSS = HOVER_ROW_CSS + `
.gpb-spread { display: flex; flex-direction: column; gap: 8px; }
.gpb-spread-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.gpb-modes { display: flex; gap: 2px; padding: 2px; border-radius: 500px; background-color: rgba(var(--spice-rgb-text), .1); }
.gpb-mode { padding: 4px 12px; border: 1px solid transparent; border-radius: 500px; background: none; color: var(--spice-text); font: inherit; font-size: .875rem; font-weight: 700; cursor: pointer; transition: background-color .15s; }
.gpb-mode[aria-checked="true"] { background-color: var(--spice-button); }
.gpb-mode.gpb-on-light { color: var(--spice-main); }
.gpb-mode:hover:not(:disabled):not([aria-checked="true"]) { background-color: rgba(var(--spice-rgb-text), .1); }
.gpb-mode:disabled { opacity: .5; cursor: not-allowed; }
.gpb-mode:focus-visible { outline: 2px solid var(--spice-text); outline-offset: 2px; }
.gpb-spread-hint { margin: 0; font-size: .75rem; line-height: 1.4; color: var(--spice-subtext); }
.gpb-preview { height: 8px; border-radius: 4px; }
`;

export function optionRowMarkup() {
  return `
    <div class="gpb-spread">
      <div class="gpb-spread-row">
        <span class="gpb-label" id="gpb-spread-label">Spread</span>
        <div class="gpb-modes" role="radiogroup" aria-labelledby="gpb-spread-label" aria-describedby="gpb-spread-hint">
          ${MODES.map((mode) => `<button type="button" class="gpb-mode" role="radio" data-mode="${mode}">${MODE_LABELS[mode]}</button>`).join("")}
        </div>
      </div>
      <p class="gpb-spread-hint" id="gpb-spread-hint"></p>
    </div>` + hoverRowMarkup();
}

export function previewMarkup() {
  return `<div class="gpb-preview"></div>`;
}

export function extraRefs(root) {
  return {
    ...hoverRefs(root), // #3, #8
    spread: root.querySelector(".gpb-spread"),
    modes: root.querySelector(".gpb-modes"),
    modeButtons: [...root.querySelectorAll(".gpb-mode")],
    spreadHint: root.querySelector(".gpb-spread-hint"),
  };
}

export function enableOptionRow(m) {
  enableSpread(m);
  enableHoverRow(m);
}

export function renderOptionRow() {
  renderSpread();
  renderHoverRow();
}

// The theme colour changed while the modal is open: the checked mode's label colour follows it.
export function onThemeColour() {
  renderSpread();
  renderHoverRow();
}

// After applying a preset or a code, and after the self-test restores the settings.
export function settingsReplaced() {}

// After every settings change (shared/settings.js → update()).
export function afterSettingsChange() {}

// The gradient for the preview strip and the preset swatches.
export function previewImage(s) {
  return fillImage(s);
}

// The top-bar button and the profile-menu entry open the settings with this.
export function openFromEntry() {
  return openModal();
}

// Called from the Spread row, which is updated in place: the dots aren't re-rendered.
function setMode(mode) {
  if (!MODES.includes(mode) || mode === settings.mode) return;
  settings.mode = mode;
  update({ rerender: false });
  if (modal) renderSpread();
}

export const MODE_LABELS = { compress: "Compress", anchored: "Anchored", slide: "Slide" };

export const SPREAD_HINTS = {
  compress: "The whole gradient always fits between the start and the playhead.",
  anchored: "Colours stay fixed to the bar and are revealed as the song plays.",
  slide: "The gradient spans the whole bar and slides in with the playhead.",
};

export const SPREAD_OFF_HINT = "Applies when the gradient is on.";

// ── Spread (GPB #15) ──
// A radiogroup of plain buttons (no <select>: Hazy styles select globally). Built once per
// open and only updated in place, so a click never detaches its target (GPB #26). Roving
// tabindex; ←/→ (wrapping), Home and End move the choice, without modifier keys only.
function enableSpread(m) {
  m.modes.addEventListener("click", (e) => {
    const button = e.target.closest(".gpb-mode");
    if (button && !button.disabled) setMode(button.dataset.mode);
  });
  m.modes.addEventListener("keydown", (e) => {
    const button = e.target.closest(".gpb-mode");
    if (!button || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const i = m.modeButtons.indexOf(button);
    const last = m.modeButtons.length - 1;
    const next = { ArrowLeft: i ? i - 1 : last, ArrowRight: i === last ? 0 : i + 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setMode(m.modeButtons[next].dataset.mode);
    m.modeButtons[next].focus();
  });
}

// Also called by watchThemeColour(): the label colour depends on the live --spice-button.
function renderSpread() {
  const on = settings.gradient;
  const onLight = labelOnLight(modal.modes);
  for (const button of modal.modeButtons) {
    const checked = button.dataset.mode === settings.mode;
    button.setAttribute("aria-checked", String(checked));
    button.tabIndex = checked ? 0 : -1;
    button.disabled = !on;
    button.classList.toggle("gpb-on-light", checked && onLight);
  }
  modal.spreadHint.textContent = on ? SPREAD_HINTS[settings.mode] : SPREAD_OFF_HINT;
}

// The bar at 100 %, from the same gradient string as the stylesheet: the current settings, or
// the preset or code being previewed (GPB #51). Only the background-image changes, in place.
export function renderPreview() {
  modal.preview.style.backgroundImage = fillImage(previewing(modal)?.settings ?? settings);
}

// The settings always open by right-clicking the song progress bar: one delegated listener,
// no Spicetify UI wrappers, nothing for a Spotify update to remove. The profile menu and the top
// bar are extras, so neither can be the only way in.
export function enableBarContextMenu() {
  document.addEventListener(
    "contextmenu",
    (e) => {
      if (!e.target.closest?.(SCOPE)) return;
      e.preventDefault();
      e.stopPropagation();
      if (!modal) openModal();
    },
    true
  );
  return "right-click on the progress bar";
}
