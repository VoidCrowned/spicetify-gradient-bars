// Gradient Connect Bar's part of the settings window: the Text colour row (GCB #11) and the
// preview strip (GCB #7), plus the hooks the shared modules call (see shared/modal.js,
// settings.js, presets-ui.js and entry.js).

// The Text colour row and its radio buttons, and the preview strip: the bar with a fake label.

import { HOVER_ROW_CSS, enableHoverRow, hoverRefs, hoverRowMarkup, renderHoverRow } from "../shared/hover.js";
import { labelOnLight, parseRgb, rgbToHex, rootColour } from "../shared/colour.js";
import { modal, openModal, withClass } from "../shared/modal.js";
import { previewing } from "../shared/presets-ui.js";
import { isInert, settings, update } from "../shared/settings.js";
import { BAR_LINK, SELECTOR, barBase, findBar } from "./bar.js";
import { barImage } from "./render.js";
import { TEXT_MODES } from "./settings.js";
import { appliedTextColour, gradientSamples, pickTextColour, recalcTextColour, scheduleTextColour, textContext, textRegion, textResult } from "./text-colour.js";

export const OPTION_ROW_CSS = HOVER_ROW_CSS + `
.gcb-text { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
.gcb-modes { display: flex; gap: 2px; padding: 2px; border-radius: 500px; background-color: rgba(var(--spice-rgb-text), .1); }
.gcb-mode { padding: 4px 12px; border: 1px solid transparent; border-radius: 500px; background: none; color: var(--spice-text); font: inherit; font-size: .875rem; font-weight: 700; white-space: nowrap; cursor: pointer; transition: background-color .15s; }
.gcb-mode[aria-checked="true"] { background-color: var(--spice-button); }
.gcb-mode.gcb-on-light { color: var(--spice-main); }
.gcb-mode:hover:not([aria-checked="true"]) { background-color: rgba(var(--spice-rgb-text), .1); }
.gcb-mode:focus-visible { outline: 2px solid var(--spice-text); outline-offset: 2px; }
.gcb-preview { display: flex; align-items: center; justify-content: flex-end; gap: 8px; box-sizing: border-box; height: 24px; padding: 0 12px; border-radius: 4px; overflow: hidden; font-size: .875rem; font-weight: 700; white-space: nowrap; }
.gcb-preview-icon { flex: none; }
`;

export function optionRowMarkup() {
  return `
    <div class="gcb-text">
      <span class="gcb-label" id="gcb-text-label">Text colour</span>
      <div class="gcb-modes" role="radiogroup" aria-labelledby="gcb-text-label">
        ${TEXT_MODES.map((mode) => `<button type="button" class="gcb-mode" role="radio" data-mode="${mode}">${TEXT_LABELS[mode]}</button>`).join("")}
      </div>
    </div>` + hoverRowMarkup();
}

export function previewMarkup() {
  return `<div class="gcb-preview" role="img" aria-label="Preview of the Connect bar">${withClass(DEVICE_ICON, "gcb-preview-icon")}<span class="gcb-preview-label">${PREVIEW_LABEL}</span></div>`;
}

export function extraRefs(root) {
  return {
    ...hoverRefs(root), // #3, #8
    text: root.querySelector(".gcb-text"),
    textLabel: root.querySelector("#gcb-text-label"),
    textModes: root.querySelector(".gcb-modes"),
    textButtons: [...root.querySelectorAll(".gcb-mode")],
    previewIcon: root.querySelector(".gcb-preview-icon"),
    previewLabel: root.querySelector(".gcb-preview-label"),
  };
}

export function enableOptionRow(m) {
  enableTextColour(m);
  enableHoverRow(m);
}

export function renderOptionRow() {
  renderTextColour();
  renderHoverRow();
}

// The theme colour changed while the modal is open: the checked button's label colour depends
// on the live --spice-button, and the preview on the bar's own colour.
export function onThemeColour() {
  renderTextColour();
  renderHoverRow();
  renderPreview();
}

// After applying a preset or a code, and after the self-test restores the settings: the text
// colour is recalculated at once (it also applies the stylesheet).
export function settingsReplaced() {
  recalcTextColour();
}

// After every settings change (shared/settings.js → update()): the text colour, debounced (GCB #15).
export function afterSettingsChange() {
  scheduleTextColour();
}

// The gradient for the preview strip and the preset swatches.
export function previewImage(s) {
  return barImage(s);
}

// The top-bar button and the profile-menu entry open the settings with this.
export function openFromEntry() {
  return openSettings();
}

export const PREVIEW_LABEL = "Playing on Device";

// A speaker: the preview strip's stand-in for the bar's device icon. No data-encore-id, so the
// preview never matches SELECTOR or UNSCOPED.
const DEVICE_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="M4 1.5A1.5 1.5 0 0 1 5.5 0h5A1.5 1.5 0 0 1 12 1.5v13a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 4 14.5zm1.5 0v13h5v-13zM8 3.25a.75.75 0 1 0 0 1.5a.75.75 0 1 0 0-1.5zM8 7a2.25 2.25 0 1 0 0 4.5A2.25 2.25 0 1 0 8 7zm0 1.5a.75.75 0 1 0 0 1.5a.75.75 0 1 0 0-1.5z"/></svg>';

// ── Text colour row (GCB #11) ──
// A radiogroup of plain buttons (no <select>: Hazy styles select globally), ported from GPB's
// Spread row. Built once per open and only updated in place, so a click never detaches its
// target. Roving tabindex; ←/→ (wrapping), Home and End move the choice, without modifier keys.
// No hint and no warning under it: the user picks the text colour and judges the result.

const TEXT_LABELS = { auto: "Auto", black: "Black", white: "White", default: "Spotify default" };

function setTextColour(mode) {
  if (!TEXT_MODES.includes(mode) || mode === settings.textColour) return;
  settings.textColour = mode;
  recalcTextColour(); // at once: the bar and the preview show the new colour straight away
  update({ rerender: false });
}

function enableTextColour(m) {
  m.textModes.addEventListener("click", (e) => {
    const button = e.target.closest(".gcb-mode");
    if (button) setTextColour(button.dataset.mode);
  });
  m.textModes.addEventListener("keydown", (e) => {
    const button = e.target.closest(".gcb-mode");
    if (!button || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const i = m.textButtons.indexOf(button);
    const last = m.textButtons.length - 1;
    const next = { ArrowLeft: i ? i - 1 : last, ArrowRight: i === last ? 0 : i + 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setTextColour(m.textButtons[next].dataset.mode);
    m.textButtons[next].focus();
  });
}

// In place: aria-checked, tabindex, the label colour on the filled button.
export function renderTextColour() {
  const onLight = labelOnLight(modal.textModes);
  for (const button of modal.textButtons) {
    const checked = button.dataset.mode === settings.textColour;
    button.setAttribute("aria-checked", String(checked));
    button.tabIndex = checked ? 0 : -1;
    button.classList.toggle("gcb-on-light", checked && onLight);
  }
}

// The bar as it would look (GCB #7): the bar's own colour underneath, the same background-image
// string as the stylesheet on top, and the text colour the settings give. It shows the current
// settings, or the preset or code being previewed (GCB #29, GCB #36). Only inline styles of our own
// element change, in place.
export function renderPreview() {
  const { preview } = modal;
  const shown = previewing(modal)?.settings ?? settings;
  preview.style.backgroundColor = barBase();
  preview.style.backgroundImage = isInert(shown) ? "none" : barImage(shown);
  preview.style.color = textColourFor(shown);
}

// What Spotify draws the text in: the live bar's text colour, read only while our rule doesn't
// set it (otherwise it's ours), else the last one read, else Spicetify's mapping for
// .encore-bright-accent-set (--text-base: var(--spice-sidebar)).
let lastBarText = null;

export function spotifyTextColour() {
  const link = findBar()?.querySelector(BAR_LINK);
  const ours = document.getElementById("gcb-style")?.textContent.includes("--text-base");
  if (link && !ours) {
    const span = link.querySelector("span") ?? link;
    const rgb = parseRgb(getComputedStyle(span).color);
    if (rgb) lastBarText = rgbToHex(rgb.map(Math.round));
  }
  return lastBarText || rootColour("--spice-sidebar") || "#000000";
}

// The text colour settings `s` give the bar: Black and White literally, Spotify's own for
// Spotify default, and for Auto the current choice or, for other settings (a previewed preset or
// code), Auto computed for their colours over the last text region.
export function textColourFor(s) {
  if (s.textColour === "default") return spotifyTextColour();
  if (s.textColour !== "auto") return appliedTextColour(s);
  if (s === settings && textResult?.colour) return textResult.colour;
  return pickTextColour(gradientSamples(s, textRegion ?? { from: 0, to: 1 }, textContext())).colour;
}

// The settings open by right-clicking the Connect bar: one delegated capture-phase listener on
// document, so it survives Spotify removing and re-creating the bar. The bar only exists during
// remote playback, so the shared top-bar button (GCB #34), the profile menu (GCB #35) and
// __gcb.openSettings() open them too.
export function enableBarContextMenu() {
  document.addEventListener(
    "contextmenu",
    (e) => {
      if (!e.target.closest?.(SELECTOR)) return;
      e.preventDefault();
      e.stopPropagation();
      if (!modal) openModal();
    },
    true
  );
  return "right-click on the Connect bar";
}

// The settings, from anywhere: the top bar, the profile menu, __gcb.openSettings().
export function openSettings() {
  return modal || openModal();
}
