// ── Settings modal ──────────────────────────────────────────────────────────
// Colours come only from Spicetify variables so the modal follows any theme.
// Never use the id "color-input" or the classes .slider/.toggle/.toggleWrapper —
// Hazy looks them up and styles them globally.
//
// Dots are plain buttons: click to select one and edit it in the inline colour picker below
// (GPB #32, GPB #35), right-click for Duplicate / Remove (GPB #33), drag or Alt+arrows to reorder
// (GPB #8, GPB #24), Delete/Backspace to remove (GPB #49). No icons on the dots (GPB #31). Exactly one dot is
// selected whenever the modal is open. The −|+ stepper after them removes the selected dot
// and adds one (GPB #49).

// The selected Spread mode is filled with var(--spice-button), the live theme colour. Never
// --spice-rgb-button: Hazy rewrites --spice-button at runtime but leaves --spice-rgb-button
// at the colour scheme's value (GPB #40); tints use color-mix() on var(--spice-button) instead.
// The label switches to --spice-main (${P}-on-light) when that contrasts more (GPB #43).
// The −|+ stepper is two "D"s (GPB #50): − has the whole outline, its right edge is the middle
// line; + overlaps it by 1 px with a transparent left border, so at rest the middle is one
// line, not two translucent ones on top of each other. A hovered half lights up its whole
// outline, middle line included (+ is raised over −'s edge), like Reset's border.
// The stylesheet inside the modal. OPTION_ROW_CSS is the extension's own: its option row (Spread,
// Text colour), the radio buttons in it and the preview strip.

import { CODE_PLACEHOLDER, HELP_LINES, IMPORT_TITLE, NAME, P } from "ext:config";
import { OPTION_ROW_CSS, enableOptionRow, extraRefs, onThemeColour, optionRowMarkup, previewMarkup, renderOptionRow, renderPreview } from "ext:hooks";
import { setCopyContainer } from "./clipboard.js";
import { MAX_STOPS, PRESET_NAME_MAX } from "./constants.js";
import { HEX_COPY_LABEL, enableColourPicker, pickerStop, showInPicker } from "./picker.js";
import { COPIED_LABEL, COPY_HINT, EXPORT_LABEL, EXPORT_TITLE, enablePresets, renderChips } from "./presets-ui.js";
import { RESET_CONFIRM_LABEL, enableReset } from "./reset.js";
import { flushSettings, settings } from "./settings.js";
import { closePopover, dotEl, enableDotMenu, enableDragAndDrop, enableKeyboardRemove, enableKeyboardReorder, lastDragEnd, renderStop, renderStops, selectStop, watchPopovers } from "./stop-editor.js";
import { addStop, findStop, removeStop, selectedId, setSelectedId, toggleGradient } from "./stops.js";

export function modalCss() {
  return `
.${P}-modal { display: flex; flex-direction: column; gap: 20px; padding-top: 20px; color: var(--spice-text); }
.${P}-modal [hidden] { display: none; }
.${P}-gradient-row { display: flex; align-items: center; justify-content: space-between; }
.${P}-label { font-weight: 700; }
.${P}-switch { position: relative; flex: none; width: 40px; height: 22px; padding: 0; border: 0; border-radius: 11px; background-color: rgba(var(--spice-rgb-text), .3); cursor: pointer; transition: background-color .15s; }
.${P}-switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background-color: var(--spice-text); transition: transform .15s; }
.${P}-switch[aria-checked="true"] { background-color: var(--spice-button); }
.${P}-switch[aria-checked="true"]::after { transform: translateX(18px); }
.${P}-switch:focus-visible { outline: 2px solid var(--spice-text); outline-offset: 2px; }
${OPTION_ROW_CSS.trim()}
.${P}-dots { display: flex; align-items: flex-end; gap: 10px; }
.${P}-stops { position: relative; display: flex; flex-wrap: wrap; gap: 14px; padding: 4px; }
.${P}-stop { position: relative; width: 32px; height: 32px; padding: 0; border: 2px solid rgba(var(--spice-rgb-text), .25); border-radius: 50%; cursor: pointer; }
.${P}-stop.${P}-selected, .${P}-stop:focus-visible { outline: 2px solid var(--spice-text); outline-offset: 3px; }
.${P}-stop.${P}-unused { opacity: .5; }
.${P}-stop.${P}-dragging { opacity: .3; }
.${P}-announce { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.${P}-stepper { flex: none; display: flex; height: 32px; margin: 4px 0; }
.${P}-step { display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 36px; height: 100%; margin: 0; padding: 0; border: 1px solid rgba(var(--spice-rgb-text), .3); background: none; color: var(--spice-subtext); cursor: pointer; }
.${P}-minus { border-radius: 16px 0 0 16px; }
.${P}-plus { margin-left: -1px; border-left-color: transparent; border-radius: 0 16px 16px 0; }
.${P}-step:hover:not(:disabled) { border-color: var(--spice-text); color: var(--spice-text); }
.${P}-plus:hover:not(:disabled) { position: relative; z-index: 1; }
.${P}-step:disabled { cursor: not-allowed; }
.${P}-step:disabled > svg { opacity: .5; }
.${P}-step:focus-visible { outline: 2px solid var(--spice-text); outline-offset: -3px; }
.${P}-marker { position: absolute; width: 2px; height: 32px; border-radius: 1px; background-color: var(--spice-button); pointer-events: none; }
.${P}-button { align-self: flex-start; padding: 8px 16px; border: 1px solid rgba(var(--spice-rgb-text), .3); border-radius: 500px; background: none; color: var(--spice-text); font: inherit; font-weight: 700; cursor: pointer; }
.${P}-button:hover:not(:disabled) { border-color: var(--spice-text); }
.${P}-button:disabled { opacity: .5; cursor: not-allowed; }
.${P}-button:focus-visible { outline: 2px solid var(--spice-text); outline-offset: 2px; }
.${P}-share-button { display: inline-flex; align-items: center; align-self: center; gap: 6px; padding: 4px 12px 4px 10px; font-size: .8125rem; }
.${P}-share-button > svg { flex: none; }
.${P}-share-text { display: inline-grid; justify-items: center; }
.${P}-share-text > span { grid-area: 1 / 1; }
.${P}-share-button[aria-expanded="true"] { border-color: var(--spice-text); }
.${P}-actions { display: flex; justify-content: center; align-items: center; }
.${P}-actions > .${P}-button { align-self: center; }
.${P}-reset { display: inline-grid; justify-items: center; }
.${P}-reset > span { grid-area: 1 / 1; }
.${P}-reset-sizer { visibility: hidden; }
.${P}-reset.${P}-armed, .${P}-reset.${P}-armed:hover:not(:disabled) { border-color: var(--spice-notification-error, #e91429); color: var(--spice-notification-error, #e91429); }
.${P}-help { margin: 8px 0 0; font-size: .875rem; line-height: 1.5; color: var(--spice-subtext); }
.${P}-popover { position: fixed; z-index: 10; box-sizing: border-box; border-radius: 8px; background-color: var(--spice-card); box-shadow: 0 8px 24px rgba(0, 0, 0, .5); color: var(--spice-text); }
.${P}-popover[hidden] { display: none; }
.${P}-menu { display: flex; flex-direction: column; min-width: 140px; padding: 4px; }
.${P}-menu-item { padding: 8px 12px; border: 0; border-radius: 4px; background: none; color: var(--spice-text); font: inherit; font-size: .875rem; text-align: left; cursor: pointer; }
.${P}-menu-item:hover:not(:disabled), .${P}-menu-item:focus-visible { outline: none; background-color: rgba(var(--spice-rgb-text), .1); }
.${P}-menu-item:disabled { opacity: .5; cursor: default; }
.${P}-colour-picker { display: flex; flex-wrap: wrap; gap: 16px; }
.${P}-sv { position: relative; flex: 1 1 202px; min-height: 150px; border-radius: 4px; background-image: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent); cursor: crosshair; touch-action: none; }
.${P}-sv-handle, .${P}-hue-handle { position: absolute; box-sizing: border-box; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px rgba(0, 0, 0, .6); pointer-events: none; }
.${P}-sv-handle { width: 14px; height: 14px; margin: -7px 0 0 -7px; }
.${P}-controls { flex: 1 1 202px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.${P}-tools { display: flex; align-items: center; gap: 10px; }
.${P}-eyedropper { flex: none; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%; background: none; color: var(--spice-text); cursor: pointer; }
.${P}-eyedropper:hover { background-color: rgba(var(--spice-rgb-text), .1); }
.${P}-swatch { flex: none; box-sizing: border-box; width: 24px; height: 24px; border: 1px solid rgba(var(--spice-rgb-text), .3); border-radius: 50%; }
.${P}-hue { position: relative; flex: 1; height: 12px; border-radius: 6px; background-image: linear-gradient(90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); cursor: pointer; touch-action: none; }
.${P}-hue-handle { top: 50%; width: 16px; height: 16px; margin: -8px 0 0 -8px; }
.${P}-sv:focus-visible, .${P}-hue:focus-visible, .${P}-eyedropper:focus-visible { outline: 2px solid var(--spice-text); outline-offset: 2px; }
.${P}-rgb { display: flex; gap: 8px; }
.${P}-channel { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: .75rem; color: var(--spice-subtext); }
.${P}-hex-row { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: .75rem; color: var(--spice-subtext); }
.${P}-field { width: 100%; min-width: 0; height: 28px; box-sizing: border-box; padding: 0 6px; border: 1px solid rgba(var(--spice-rgb-text), .3); border-radius: 4px; background-color: rgba(var(--spice-rgb-text), .08); color: var(--spice-text); font: inherit; font-size: .875rem; text-align: center; }
.${P}-field:focus { outline: none; border-color: var(--spice-text); }
.${P}-field[aria-invalid="true"] { border-color: var(--spice-notification-error, #e91429); }
.${P}-hex-wrap { position: relative; flex: none; display: flex; }
.${P}-hex { flex: none; width: calc(10ch + 24px); padding-right: 28px; font-family: ui-monospace, Consolas, monospace; text-align: left; }
.${P}-hex-copy { position: absolute; top: 50%; right: 2px; display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 24px; height: 24px; margin: -12px 0 0; padding: 0; border: 0; border-radius: 4px; background: none; color: var(--spice-subtext); cursor: pointer; }
.${P}-hex-copy:hover { color: var(--spice-text); }
.${P}-hex-copy:focus-visible { outline: 2px solid var(--spice-text); outline-offset: -1px; }
.${P}-colour-picker .${P}-button { align-self: stretch; padding: 6px 12px; font-size: .875rem; }
.${P}-presets > * { margin: 0; }
.${P}-presets > * + * { margin-top: 8px; }
.${P}-presets > .${P}-undo:not(.${P}-has-status) { margin-top: 0; }
.${P}-presets-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.${P}-text-button { display: inline-grid; padding: 2px 8px; border: 0; border-radius: 500px; background: none; color: var(--spice-subtext); font: inherit; font-size: .8125rem; font-weight: 700; cursor: pointer; }
.${P}-text-button > span { grid-area: 1 / 1; }
.${P}-text-button:hover:not(:disabled) { background-color: rgba(var(--spice-rgb-text), .1); color: var(--spice-text); }
.${P}-text-button:focus-visible { outline: 2px solid var(--spice-text); outline-offset: 1px; }
.${P}-sizer { visibility: hidden; }
.${P}-chips { display: flex; flex-direction: column; gap: 8px; }
.${P}-chip-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.${P}-chip { display: inline-flex; align-items: center; gap: 6px; box-sizing: border-box; height: 28px; padding: 0 12px 0 7px; border: 1px solid rgba(var(--spice-rgb-text), .3); border-radius: 500px; background: none; color: var(--spice-text); font: inherit; font-size: .8125rem; cursor: pointer; }
.${P}-chip:hover:not(:disabled) { border-color: var(--spice-text); }
.${P}-chip[aria-pressed="true"], .${P}-chip[aria-pressed="true"]:hover:not(:disabled), .${P}-chip.${P}-armed, .${P}-chip.${P}-armed:hover:not(:disabled) { border-color: var(--spice-button); }
.${P}-chip.${P}-armed { background-color: color-mix(in srgb, var(--spice-button) 20%, transparent); }
.${P}-chip:disabled { opacity: .5; cursor: not-allowed; }
.${P}-chip:focus-visible { outline: 2px solid var(--spice-text); outline-offset: 2px; }
.${P}-save-chip { padding: 0 12px; color: var(--spice-subtext); }
.${P}-save-chip:hover:not(:disabled) { color: var(--spice-text); }
.${P}-chip-swatch { flex: none; width: 12px; height: 12px; border-radius: 50%; }
.${P}-chip-text { display: inline-grid; justify-items: center; }
.${P}-chip-text > span { grid-area: 1 / 1; white-space: nowrap; }
.${P}-name-field { flex: none; width: 18ch; height: 28px; padding: 0 12px; border-radius: 500px; text-align: left; }
.${P}-undo { font-size: .8125rem; color: var(--spice-subtext); }
.${P}-presets-tools { display: flex; align-items: center; gap: 8px; }
.${P}-code-hint { margin: 6px 0 0; font-size: .75rem; color: var(--spice-subtext); }
.${P}-code-output, .${P}-code-input { font-family: ui-monospace, Consolas, monospace; font-size: .8125rem; text-align: left; }
.${P}-import-row { display: flex; align-items: center; gap: 8px; }
.${P}-import-row > .${P}-code-input { flex: 1; }
.${P}-import-row > .${P}-button { flex: none; align-self: center; padding: 4px 14px; font-size: .875rem; }
.${P}-import-error { margin: 0; font-size: .75rem; color: var(--spice-notification-error, #e91429); }
.${P}-import-error:not(:empty) { margin-top: 6px; }
.${P}-undo-button { padding: 2px 4px; color: var(--spice-text); text-decoration: underline; }
`;
}

// Two columns from 420 px of content (202 + 16 + 202), stacked below that. Flex-wrap rather
// than a container query: inline-size containment could collapse a shrink-to-fit modal.
export const PICKER_COLUMNS_MIN = 420;

export const REORDER_HINT = "Drag or Alt+←/→ to reorder"; // second line of the dot tooltip (GPB #24)

export const ADD_LABEL = "Add colour";

export const ADD_FULL_LABEL = `Up to ${MAX_STOPS} colours`;

export const REMOVE_LABEL = "Remove selected colour"; // the stepper's − (GPB #49)

export const REMOVE_LAST_LABEL = "At least one colour";

export const THEME_LABELS = { off: "Use theme colour", on: "Following theme colour" };

const MINUS_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M2 7.25h12v1.5H2z"/></svg>';

const PLUS_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M7.25 2h1.5v5.25H14v1.5H8.75V14h-1.5V8.75H2v-1.5h5.25z"/></svg>';

const EXPORT_ICON = // arrow up out of a tray (GPB #52)
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 1.5 4.5 5h2.75v5.5h1.5V5h2.75z"/><path d="M1 9.5h1.5v4h11v-4H15V15H1z"/></svg>';

const IMPORT_ICON = // arrow down into a tray (GPB #52)
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M7.25 1.5h1.5V7h2.75L8 10.5 4.5 7h2.75z"/><path d="M1 9.5h1.5v4h11v-4H15V15H1z"/></svg>';

const COPY_ICON = // two overlapping rounded squares: the hex field's copy button (GPB #56)
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M5 1.75A1.75 1.75 0 0 1 6.75 0h6.5A1.75 1.75 0 0 1 15 1.75v6.5A1.75 1.75 0 0 1 13.25 10H11V8.5h2.25a.25.25 0 0 0 .25-.25v-6.5a.25.25 0 0 0-.25-.25h-6.5a.25.25 0 0 0-.25.25V4H5z"/><path d="M1 6.75C1 5.784 1.784 5 2.75 5h6.5c.966 0 1.75.784 1.75 1.75v6.5A1.75 1.75 0 0 1 9.25 15h-6.5A1.75 1.75 0 0 1 1 13.25zm1.75-.25a.25.25 0 0 0-.25.25v6.5c0 .138.112.25.25.25h6.5a.25.25 0 0 0 .25-.25v-6.5a.25.25 0 0 0-.25-.25z"/></svg>';

const CHECK_ICON = // shown in place of a copy button's icon after copying (GPB #54, GPB #56)
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M13.53 3.47a.75.75 0 0 1 0 1.06l-7 7a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L6 9.94l6.47-6.47a.75.75 0 0 1 1.06 0z"/></svg>';

// Both icons are in the markup and swapped with `hidden`, so no node is replaced (GPB #26).
export const withClass = (svg, className, hidden = false) => svg.replace("<svg ", `<svg class="${className}"${hidden ? " hidden" : ""} `);

const EYEDROPPER_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M13.35 2.65a2 2 0 0 0-2.83 0L8.9 4.27l-.7-.71-1.06 1.06.7.71-5.3 5.3a1.5 1.5 0 0 0-.44 1.07L2 14l2.3-.1a1.5 1.5 0 0 0 1.07-.44l5.3-5.3.71.7 1.06-1.06-.7-.71 1.61-1.61a2 2 0 0 0 0-2.83zM4.3 12.4l-.8.04.04-.8 5.37-5.37.76.76z"/></svg>';

export let modal = null; // the open modal's elements, or null

// Copies made while the modal is open use a textarea inside it (shared/clipboard.js).
setCopyContainer(() => modal?.root ?? document.body);

export function openModal() {
  const root = document.createElement("div");
  root.className = `${P}-modal`;
  root.innerHTML = `
    <style>${modalCss()}</style>
    <div class="${P}-popover ${P}-menu" role="menu" aria-label="Colour actions" hidden>
      <button type="button" role="menuitem" class="${P}-menu-item ${P}-duplicate">Duplicate</button>
      <button type="button" role="menuitem" class="${P}-menu-item ${P}-remove">Remove</button>
      <button type="button" role="menuitem" class="${P}-menu-item ${P}-rename" hidden>Rename</button>
      <button type="button" role="menuitem" class="${P}-menu-item ${P}-update-preset" hidden>Update to current colours</button>
      <button type="button" role="menuitem" class="${P}-menu-item ${P}-delete-preset" hidden>Delete</button>
    </div>
    <span class="${P}-announce" aria-live="polite"></span>
    <div class="${P}-gradient-row">
      <span class="${P}-label" id="${P}-gradient-label">Gradient</span>
      <button type="button" class="${P}-switch" role="switch" aria-labelledby="${P}-gradient-label"></button>
    </div>
    ${optionRowMarkup()}
    <div class="${P}-presets">
      <div class="${P}-presets-row">
        <span class="${P}-label" id="${P}-presets-label">Presets</span>
        <div class="${P}-presets-tools">
          <button type="button" class="${P}-button ${P}-share-button ${P}-export" title="${EXPORT_TITLE}">${withClass(EXPORT_ICON, `${P}-export-icon`)}${withClass(CHECK_ICON, `${P}-export-check`, true)}<span class="${P}-share-text"><span class="${P}-share-label ${P}-export-label">${EXPORT_LABEL}</span><span class="${P}-sizer" aria-hidden="true">${EXPORT_LABEL}</span><span class="${P}-sizer" aria-hidden="true">${COPIED_LABEL}</span></span></button>
          <button type="button" class="${P}-button ${P}-share-button ${P}-import" title="${IMPORT_TITLE}" aria-expanded="false" aria-controls="${P}-import-panel">${IMPORT_ICON}<span class="${P}-share-label">Import</span></button>
        </div>
      </div>
      <div class="${P}-chips" role="group" aria-labelledby="${P}-presets-label">
        <div class="${P}-chip-row ${P}-built-in-row"></div>
        <div class="${P}-chip-row ${P}-own-row">
          <button type="button" class="${P}-chip ${P}-save-chip">+ Save</button>
          <input type="text" class="${P}-field ${P}-name-field" maxlength="${PRESET_NAME_MAX}" spellcheck="false" autocomplete="off" aria-label="Preset name" hidden>
        </div>
      </div>
      <div class="${P}-code-fallback" hidden>
        <input type="text" class="${P}-field ${P}-code-output" readonly spellcheck="false" aria-label="Share code (copy it from here)" aria-describedby="${P}-code-hint">
        <p class="${P}-code-hint" id="${P}-code-hint">${COPY_HINT}</p>
      </div>
      <div class="${P}-import-panel" id="${P}-import-panel" hidden>
        <div class="${P}-import-row">
          <input type="text" class="${P}-field ${P}-code-input" spellcheck="false" autocomplete="off" placeholder="${CODE_PLACEHOLDER}" aria-label="Paste a share code" aria-describedby="${P}-import-error">
          <button type="button" class="${P}-button ${P}-import-apply">Apply</button>
        </div>
        <p class="${P}-import-error" id="${P}-import-error" aria-live="polite"></p>
      </div>
      <p class="${P}-undo" aria-live="polite"><span class="${P}-undo-text"></span><button type="button" class="${P}-text-button ${P}-undo-button" hidden>Undo</button></p>
    </div>
    ${previewMarkup()}
    <div class="${P}-dots">
      <div class="${P}-stops"></div>
      <div class="${P}-stepper" role="group" aria-label="Colours">
        <button type="button" class="${P}-step ${P}-minus" aria-label="${REMOVE_LABEL}" title="${REMOVE_LABEL}">${MINUS_ICON}</button>
        <button type="button" class="${P}-step ${P}-plus" aria-label="${ADD_LABEL}" title="${ADD_LABEL}">${PLUS_ICON}</button>
      </div>
    </div>
    <div class="${P}-colour-picker" role="group" aria-label="Selected colour">
      <div class="${P}-sv" role="slider" tabindex="0" aria-label="Saturation and brightness"><div class="${P}-sv-handle"></div></div>
      <div class="${P}-controls">
        <div class="${P}-tools">
          ${window.EyeDropper ? `<button type="button" class="${P}-eyedropper" aria-label="Pick a colour from the screen" title="Pick a colour from the screen">${EYEDROPPER_ICON}</button>` : ""}
          <div class="${P}-swatch"></div>
          <div class="${P}-hue" role="slider" tabindex="0" aria-label="Hue" aria-valuemin="0" aria-valuemax="360"><div class="${P}-hue-handle"></div></div>
        </div>
        <div class="${P}-rgb">
          ${["Red", "Green", "Blue"].map((name) =>
            `<label class="${P}-channel"><input type="text" class="${P}-field ${P}-channel-input" inputmode="numeric" maxlength="3" spellcheck="false" autocomplete="off" aria-label="${name}"><span>${name[0]}</span></label>`
          ).join("")}
        </div>
        <div class="${P}-hex-row">
          <label for="${P}-hex-input">HEX:</label>
          <span class="${P}-hex-wrap">
            <input type="text" class="${P}-field ${P}-hex" id="${P}-hex-input" spellcheck="false" autocomplete="off" maxlength="7" aria-label="Hex code">
            <button type="button" class="${P}-hex-copy" aria-label="${HEX_COPY_LABEL}" title="${HEX_COPY_LABEL}">${withClass(COPY_ICON, `${P}-hex-copy-icon`)}${withClass(CHECK_ICON, `${P}-hex-copy-check`, true)}</button>
          </span>
        </div>
        <button type="button" class="${P}-button ${P}-use-theme">${THEME_LABELS.off}</button>
      </div>
    </div>
    <div class="${P}-actions">
      <button type="button" class="${P}-button ${P}-reset"><span class="${P}-reset-label" aria-live="polite">Reset</span><span class="${P}-reset-sizer" aria-hidden="true">${RESET_CONFIRM_LABEL}</span></button>
    </div>
    <p class="${P}-help">${HELP_LINES.join("<br>")}</p>`;

  const m = {
    root,
    gradientRow: root.querySelector(`.${P}-gradient-row`),
    switchButton: root.querySelector(`.${P}-switch`),
    ...extraRefs(root), // the extension's option row and preview strip
    presets: root.querySelector(`.${P}-presets`),
    presetsRow: root.querySelector(`.${P}-presets-row`),
    chips: root.querySelector(`.${P}-chips`),
    builtInRow: root.querySelector(`.${P}-built-in-row`),
    ownRow: root.querySelector(`.${P}-own-row`),
    saveChip: root.querySelector(`.${P}-save-chip`),
    nameField: root.querySelector(`.${P}-name-field`),
    exportButton: root.querySelector(`.${P}-export`),
    exportLabel: root.querySelector(`.${P}-export-label`),
    exportIcon: root.querySelector(`.${P}-export-icon`),
    exportCheck: root.querySelector(`.${P}-export-check`),
    codeFallback: root.querySelector(`.${P}-code-fallback`),
    importButton: root.querySelector(`.${P}-import`),
    codeOutput: root.querySelector(`.${P}-code-output`),
    importPanel: root.querySelector(`.${P}-import-panel`),
    codeInput: root.querySelector(`.${P}-code-input`),
    importApply: root.querySelector(`.${P}-import-apply`),
    importError: root.querySelector(`.${P}-import-error`),
    undoLine: root.querySelector(`.${P}-undo`),
    undoText: root.querySelector(`.${P}-undo-text`),
    undoButton: root.querySelector(`.${P}-undo-button`),
    preview: root.querySelector(`.${P}-preview`),
    dotsLine: root.querySelector(`.${P}-dots`),
    stopsRow: root.querySelector(`.${P}-stops`),
    stepper: root.querySelector(`.${P}-stepper`),
    minusButton: root.querySelector(`.${P}-minus`),
    plusButton: root.querySelector(`.${P}-plus`),
    actions: root.querySelector(`.${P}-actions`),
    resetButton: root.querySelector(`.${P}-reset`),
    resetLabel: root.querySelector(`.${P}-reset-label`),
    help: root.querySelector(`.${P}-help`),
    menu: root.querySelector(`.${P}-menu`),
    announce: root.querySelector(`.${P}-announce`),
    duplicateItem: root.querySelector(`.${P}-duplicate`),
    removeItem: root.querySelector(`.${P}-remove`),
    renameItem: root.querySelector(`.${P}-rename`),
    updatePresetItem: root.querySelector(`.${P}-update-preset`),
    deletePresetItem: root.querySelector(`.${P}-delete-preset`),
    picker: root.querySelector(`.${P}-colour-picker`),
    sv: root.querySelector(`.${P}-sv`),
    svHandle: root.querySelector(`.${P}-sv-handle`),
    hue: root.querySelector(`.${P}-hue`),
    hueHandle: root.querySelector(`.${P}-hue-handle`),
    swatch: root.querySelector(`.${P}-swatch`),
    eyedropper: root.querySelector(`.${P}-eyedropper`),
    rgb: [...root.querySelectorAll(`.${P}-channel-input`)],
    hex: root.querySelector(`.${P}-hex`),
    hexWrap: root.querySelector(`.${P}-hex-wrap`),
    hexCopy: root.querySelector(`.${P}-hex-copy`),
    hexCopyIcon: root.querySelector(`.${P}-hex-copy-icon`),
    hexCopyCheck: root.querySelector(`.${P}-hex-copy-check`),
    useThemeButton: root.querySelector(`.${P}-use-theme`),
    cleanups: [],
  };

  m.switchButton.addEventListener("click", toggleGradient);
  enableOptionRow(m);
  // The −|+ stepper sits outside .${P}-stops, which renderStops() empties, so a clicked half is
  // never detached (GPB #26, GPB #47). − is the dot menu's Remove on the selected dot (GPB #49). Focus stays
  // on the clicked half; once that half is disabled (− at one colour, + at eight), it goes to
  // the selected dot.
  const stepper = (button, action) =>
    button.addEventListener("click", () => {
      const hadFocus = document.activeElement === button;
      action();
      if (hadFocus && button.disabled) dotEl(selectedId)?.focus({ preventScroll: true });
    });
  stepper(m.minusButton, () => removeStop(selectedId));
  stepper(m.plusButton, addStop);
  m.stopsRow.addEventListener("click", (e) => {
    const el = e.target.closest(`.${P}-stop`);
    if (!el || performance.now() - lastDragEnd < 300) return; // a drag never changes the selection
    selectStop(el.dataset.id, { focusHex: e.detail === 0 }); // detail 0: Enter/Space
  });
  enableDotMenu(m);
  enableColourPicker(m);
  enableReset(m);
  enablePresets(m);

  Spicetify.PopupModal.display({ title: NAME, content: root });
  evenPopupBottom(root);
  modal = m;
  setSelectedId(settings.stops[0].id); // the first dot is selected on open
  renderModal();
  renderChips(m);
  watchModalClose(m);
  watchThemeColour(m);
  watchPopovers(m);
  enableDragAndDrop(m);
  enableKeyboardReorder(m);
  enableKeyboardRemove(m);
}

// Spicetify pads the popup's content 0 24px 24px, but the popup also carries Spotify's
// track-credits classes, and themes style those: Hazy gives .main-trackCreditsModal-container
// padding-bottom: 32px, so there were 56 px below the help text against 24 px at the sides
// (GPB #48). Inline, on this display()'s elements only: PopupModal rebuilds its markup on every
// display(), so no other extension's popup is affected. Never a global rule.
function evenPopupBottom(root) {
  const content = root.closest(".spicetify-popup-content");
  const container = root.closest(".spicetify-popup-container");
  if (!content || !container) return;
  container.style.paddingBottom = "0px";
  content.style.paddingBottom = getComputedStyle(content).paddingLeft;
}

// Themes like Hazy rewrite --spice-button inline on :root (e.g. on every songchange),
// so keep the theme swatches and the Spread label colour (GPB #43) current while the modal is open.
function watchThemeColour(m) {
  const sync = () => {
    if (modal !== m) return;
    onThemeColour();
    for (const stop of settings.stops) if (stop.kind === "theme") renderStop(stop);
    const stop = pickerStop();
    if (stop?.kind === "theme") showInPicker(stop, document.activeElement === m.hex ? "hex" : null);
  };
  modalObserver(m, sync).observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  Spicetify.Player.addEventListener("songchange", sync);
  m.cleanups.push(() => Spicetify.Player.removeEventListener("songchange", sync));
}

// PopupModal has no close callback: hide() removes it from <body>, and another
// extension's display() replaces its contents. Either way our root is detached.
function watchModalClose(m) {
  const observer = modalObserver(m, () => {
    if (!m.root.isConnected) closeModal(m);
  });
  observer.observe(document.body, { childList: true });
  observer.observe(Spicetify.PopupModal, { childList: true });
}

export let liveObservers = 0; // checked by the self-test

// A MutationObserver that is disconnected when the modal closes.
function modalObserver(m, callback) {
  const observer = new MutationObserver(callback);
  liveObservers++;
  m.cleanups.push(() => {
    observer.disconnect();
    liveObservers--;
  });
  return observer;
}

export function closeModal(m) {
  if (m.closed) return;
  m.closed = true;
  for (const cleanup of m.cleanups) cleanup();
  if (modal === m) modal = null;
  flushSettings();
}

export function renderModal() {
  closePopover(); // the dots are rebuilt, so the menu would lose its anchor
  if (!findStop(selectedId)) setSelectedId(settings.stops[0].id); // never nothing selected
  renderSwitch();
  renderOptionRow(); // in place: the Spread / Text colour row is never rebuilt
  renderPreview();
  renderStops();
  showInPicker(findStop(selectedId));
  const count = settings.stops.length;
  modal.plusButton.disabled = count >= MAX_STOPS;
  modal.plusButton.title = count >= MAX_STOPS ? ADD_FULL_LABEL : ADD_LABEL;
  modal.minusButton.disabled = count <= 1;
  modal.minusButton.title = count <= 1 ? REMOVE_LAST_LABEL : REMOVE_LABEL;
}

// In place, never replaced: focus stays on the switch when it adds a colour (GPB #26, GPB #46).
function renderSwitch() {
  modal.switchButton.setAttribute("aria-checked", String(settings.gradient));
}
