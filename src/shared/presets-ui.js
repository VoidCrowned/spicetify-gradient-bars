
// ── Presets row (GPB #21) ──
// Two chip rows (GPB #53): the built-ins, then own presets and + Save. Applying is always two-step: the
// first click arms the chip ("Apply?"; hidden sizers keep its width) and previews it in the
// strip, the second applies (GPB #51). Themes often hide the player behind the popup, so the strip
// is the preview, not the bar. No timeout while armed; the active chip does nothing. Undo for
// 10 s after applying, importing or deleting. Arming changes only a label and a class, in place;
// re-rendering the chip row (Save, Rename, Update, Delete) is deferred and closes the menu
// first, so a clicked chip or menu item is never detached during its own click (GPB #26).

import { IMPORTED, P } from "ext:config";
import { previewImage, renderPreview, settingsReplaced } from "ext:hooks";
import { writeClipboard } from "./clipboard.js";
import { decodeShareCode, encodeCode } from "./codes.js";
import { MAX_PRESETS } from "./constants.js";
import { modal } from "./modal.js";
import { BUILT_IN_PRESETS, addPreset, defaultPresetName, deletePreset, matchesPreset, presetById, presetSettings, presets, renamePreset, restorePreset, updatePreset } from "./presets.js";
import { disarmOnOutsideInput } from "./reset.js";
import { setSettings, settings, update } from "./settings.js";
import { closePopover, menuItems, popover, setMenuKind, showPopover } from "./stop-editor.js";
import { setSelectedId } from "./stops.js";

export const UNDO_MS = 10000;

export const APPLY_LABEL = "Apply?";

const SAVE_LABEL = "Save the current settings as a preset";

export const SAVE_FULL_LABEL = `Up to ${MAX_PRESETS} presets`;

const OWN_PRESET_HINT = "Right-click to rename, update or delete";


export const chipEl = (id) => modal?.chips.querySelector(`.${P}-preset-chip[data-preset="${CSS.escape(id)}"]`) ?? null;

const isOwnPreset = (id) => presets.some((p) => p.id === id);


export function enablePresets(m) {
  m.chips.addEventListener("click", (e) => {
    const chip = e.target.closest(`.${P}-chip`);
    if (!chip || chip.disabled) return;
    if (chip === m.saveChip) startNaming(m, "save");
    else clickChip(m, chip);
  });
  // Own chips only: built-ins can't be renamed, updated or deleted, so they have no menu.
  m.chips.addEventListener("contextmenu", (e) => {
    const chip = e.target.closest(`.${P}-preset-chip`);
    if (!chip || !isOwnPreset(chip.dataset.preset)) return;
    e.preventDefault();
    e.stopPropagation();
    const id = chip.dataset.preset;
    if (popover?.id === id && performance.now() - popover.openedAt < 500) return; // opened from keydown
    const r = chip.getBoundingClientRect();
    const onChip = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    openChipMenu(id, onChip ? { at: { x: e.clientX, y: e.clientY } } : { keyboard: true });
  });
  m.chips.addEventListener("keydown", (e) => {
    const chip = e.target.closest(`.${P}-preset-chip`);
    if (!chip || !isOwnPreset(chip.dataset.preset) || !(e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) return;
    e.preventDefault();
    openChipMenu(chip.dataset.preset, { keyboard: true });
  });
  m.chips.addEventListener("focusout", (e) => m.armed?.chip === e.target && disarmChip(m));
  disarmOnOutsideInput(m, () => m.armed?.chip ?? null, () => disarmChip(m));

  m.nameField.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      stopNaming(m, { commit: true });
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // the field closes, not the modal
      stopNaming(m, { refocus: true });
    }
  });
  m.nameField.addEventListener("blur", () => stopNaming(m));

  m.renameItem.addEventListener("click", () => runChipAction((id) => startNaming(m, "rename", id)));
  m.updatePresetItem.addEventListener("click", () =>
    runChipAction((id) => {
      if (pendingUndo?.kind === "preset") clearUndo(); // a restored preset could clash with this change
      if (updatePreset(id)) renderChipsLater(m, id);
    })
  );
  m.deletePresetItem.addEventListener("click", () => runChipAction((id) => deleteWithUndo(m, id)));
  m.undoButton.addEventListener("click", runUndo);
  enableSharing(m);
  m.cleanups.push(() => {
    disarmChip(m);
    clearUndo();
  });
}


// ── Sharing (GPB #21) ──
// Export puts a gpb1: code on the clipboard (writeClipboard()) and confirms on the button
// itself (GPB #54); only if every tier fails does the code show in a selected read-only field. Import is an inline paste field, never navigator.clipboard.readText()
// (that asks for a permission). While the field holds a valid code the strip previews it; Apply
// is the deliberate step, with Undo (GPB #51).

export const EXPORT_TITLE = "Copy a share code to the clipboard";

export const EXPORT_LABEL = "Export";

export const COPIED_LABEL = "Copied"; // on the button for COPIED_MS; hidden sizers keep its width (GPB #54)

export const COPIED_MS = 2000;

export const COPY_HINT = /Mac/i.test(navigator.platform) ? "Press ⌘C to copy" : "Press Ctrl+C to copy";

export const IMPORT_ERROR = "Not a valid code";

export const PREVIEW_CODE_MESSAGE = "Previewing code — Apply to use it";


function enableSharing(m) {
  m.exportButton.addEventListener("click", () => copyCode(m));
  m.codeOutput.addEventListener("blur", () => (m.codeFallback.hidden = true));
  m.importButton.addEventListener("click", () => toggleImport(m));
  m.importApply.addEventListener("click", () => importCode(m));
  m.codeInput.addEventListener("input", () => {
    setImportError(m, false);
    renderPreview(); // a valid code previews in the strip (GPB #51)
    renderStatus();
  });
  m.codeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      importCode(m);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // the field closes, not the modal
      toggleImport(m, false);
      m.importButton.focus({ preventScroll: true });
    }
  });
  m.cleanups.push(() => clearTimeout(m.copiedTimer));
}


// Resolves to the tier that copied the code, or null when the fallback field shows instead.
export async function copyCode(m) {
  const code = encodeCode(settings);
  const tier = await writeClipboard(code);
  if (modal !== m) return tier;
  showExportCopied(m, !!tier);
  if (!tier) {
    m.codeOutput.value = code;
    m.codeFallback.hidden = false;
    m.codeOutput.focus({ preventScroll: true });
    m.codeOutput.select();
    return null;
  }
  m.codeFallback.hidden = true;
  m.announce.textContent = "Share code copied";
  return tier;
}


// In place: only the label's text and which icon is hidden change, never the button (GPB #26).
function showExportCopied(m, copied) {
  clearTimeout(m.copiedTimer);
  m.exportLabel.textContent = copied ? COPIED_LABEL : EXPORT_LABEL;
  m.exportIcon.toggleAttribute("hidden", copied);
  m.exportCheck.toggleAttribute("hidden", !copied);
  if (copied) m.copiedTimer = setTimeout(() => showExportCopied(m, false), COPIED_MS);
}


// Opening empties the field and closing ends its preview, so the strip shows the current
// settings either way.
function toggleImport(m, open = m.importPanel.hidden) {
  m.importPanel.hidden = !open;
  m.importButton.setAttribute("aria-expanded", String(open));
  if (open) {
    m.codeInput.value = "";
    setImportError(m, false);
    m.codeInput.focus({ preventScroll: true });
  }
  if (modal !== m) return;
  renderPreview();
  renderStatus();
}


function setImportError(m, invalid) {
  if (invalid) m.codeInput.setAttribute("aria-invalid", "true");
  else m.codeInput.removeAttribute("aria-invalid");
  m.importError.textContent = invalid ? IMPORT_ERROR : "";
}


// An invalid code changes nothing. A valid one applies; the panel (with the clicked Apply in
// it) is hidden, not removed (GPB #26).
function importCode(m) {
  const decoded = decodeShareCode(m.codeInput.value);
  if (!decoded) {
    setImportError(m, true);
    return false;
  }
  toggleImport(m, false);
  m.importButton.focus({ preventScroll: true });
  // The message says where a code came from: GPB #59, GCB #36.
  applySettings(decoded.settings, IMPORTED[decoded.from], m.importButton);
  return true;
}


// The active chip does nothing; any other is armed (and previewed) by the first click and
// applied by the second. A click on another chip disarms this one first (outside input), so
// browsing moves the arm and the preview chip by chip.
function clickChip(m, chip) {
  const preset = presetById(chip.dataset.preset);
  if (!preset || matchesPreset(preset)) return;
  if (m.armed?.chip !== chip) return armChip(m, chip, preset);
  disarmChip(m);
  applySettings(presetSettings(preset), `Applied "${preset.name}"`, chip);
}


function armChip(m, chip, preset) {
  disarmChip(m);
  chip.classList.add(`${P}-armed`);
  chip.querySelector(`.${P}-chip-label`).textContent = APPLY_LABEL;
  chip.setAttribute("aria-label", `Apply "${preset.name}"?`);
  m.armed = { chip, name: preset.name, settings: presetSettings(preset) };
  renderPreview();
  renderStatus();
}


function disarmChip(m) {
  if (!m.armed) return;
  const { chip } = m.armed;
  m.armed = null;
  const name = presetById(chip.dataset.preset)?.name ?? "";
  chip.classList.remove(`${P}-armed`);
  chip.querySelector(`.${P}-chip-label`).textContent = name;
  chip.setAttribute("aria-label", name);
  if (modal !== m) return;
  renderPreview();
  renderStatus();
}


// What the strip shows instead of the current settings (GPB #51): the armed chip's preset, or a
// valid code in the open Import field. Null when nothing is being previewed.
export function previewing(m) {
  if (m.armed) return { settings: m.armed.settings, message: `Previewing "${m.armed.name}" — click it again to apply, Esc to cancel` };
  const code = m.importPanel.hidden ? null : decodeShareCode(m.codeInput.value);
  return code && { settings: code.settings, message: PREVIEW_CODE_MESSAGE };
}


// Replaces the settings (selection back on the first dot) and offers Undo for the old ones.
// settingsReplaced() is the extension's own follow-up before the update (GCB: the text colour is
// recalculated at once, so the bar and the strip agree straight away).
function applySettings(next, message, focusAfterUndo = null) {
  const previous = structuredClone(settings);
  setSettings(next);
  setSelectedId(settings.stops[0].id);
  settingsReplaced();
  update();
  offerUndo(message, (hadFocus) => {
    setSettings(previous);
    setSelectedId(previous.stops[0].id);
    settingsReplaced();
    update();
    if (hadFocus && focusAfterUndo?.isConnected) focusAfterUndo.focus({ preventScroll: true });
  }, { trackSettings: true });
}


function deleteWithUndo(m, id) {
  const removed = deletePreset(id);
  if (!removed) return;
  renderChipsLater(m, (presets[removed.index] ?? presets[removed.index - 1])?.id ?? "save");
  offerUndo(`Deleted "${removed.preset.name}"`, (hadFocus) => {
    restorePreset(removed);
    renderChipsLater(m, hadFocus ? removed.preset.id : null);
  }, { kind: "preset" });
}


// ── Undo (GPB #21) ──
// One pending undo at a time: a new action replaces it. It lasts UNDO_MS, ends when the modal
// closes, and a settings undo also ends when the settings change some other way (update()).

export let pendingUndo = null; // { message, kind, restore(hadFocus), after, timer }


function offerUndo(message, restore, { trackSettings = false, kind = "settings" } = {}) {
  clearUndo();
  const after = trackSettings ? JSON.stringify(settings) : null;
  pendingUndo = { message, kind, restore, after, timer: setTimeout(clearUndo, UNDO_MS) };
  renderStatus();
}


export function clearUndo() {
  if (!pendingUndo) return;
  clearTimeout(pendingUndo.timer);
  pendingUndo = null;
  renderStatus();
}


// The Undo button is hidden, not removed, in its own click (GPB #26).
function runUndo() {
  const undo = pendingUndo;
  if (!undo) return;
  const hadFocus = !!modal && document.activeElement === modal.undoButton;
  clearUndo();
  undo.restore(hadFocus);
}


// The status line under the chips: a preview's message wins (GPB #51); when the preview ends, a
// still-running Undo shows again.
function renderStatus() {
  if (!modal) return;
  const preview = previewing(modal);
  const undo = !preview && pendingUndo;
  modal.undoLine.classList.toggle(`${P}-has-status`, !!(preview || undo));
  modal.undoText.textContent = preview ? preview.message : undo ? `${undo.message} · ` : "";
  modal.undoButton.hidden = !undo;
}


// ── Chip row rendering ──

export function renderChips(m) {
  disarmChip(m);
  if (!m.naming) m.saveChip.after(m.nameField);
  for (const chip of m.chips.querySelectorAll(`.${P}-preset-chip`)) chip.remove();
  m.builtInRow.append(...BUILT_IN_PRESETS.map(presetChip)); // row 1: the built-ins only (GPB #53)
  for (const preset of presets) m.saveChip.before(presetChip(preset)); // row 2: own presets, then + Save
  const full = presets.length >= MAX_PRESETS;
  m.saveChip.disabled = full;
  m.saveChip.title = full ? SAVE_FULL_LABEL : SAVE_LABEL;
  renderPresetStates();
}


// After Save, Rename, Update and Delete: deferred, with the menu closed first (GPB #26).
function renderChipsLater(m, focusId = null) {
  closePopover();
  disarmChip(m);
  setTimeout(() => {
    if (modal !== m) return;
    renderChips(m);
    const target = focusId === "save" ? m.saveChip : focusId ? chipEl(focusId) : null;
    target?.focus({ preventScroll: true });
  }, 0);
}


// A pill: a 12 px swatch painted with the preset's previewImage(), and the name. Names are user
// text, so they only ever go in through textContent.
function presetChip(preset) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = `${P}-chip ${P}-preset-chip`;
  chip.dataset.preset = preset.id;
  chip.setAttribute("aria-pressed", "false");
  chip.setAttribute("aria-label", preset.name);
  chip.title = preset.builtIn ? preset.name : `${preset.name}\n${OWN_PRESET_HINT}`;
  chip.innerHTML =
    `<span class="${P}-chip-swatch" aria-hidden="true"></span><span class="${P}-chip-text">` +
    `<span class="${P}-chip-label" aria-live="polite"></span><span class="${P}-sizer" aria-hidden="true"></span>` +
    `<span class="${P}-sizer" aria-hidden="true">${APPLY_LABEL}</span></span>`;
  chip.querySelector(`.${P}-chip-swatch`).style.backgroundImage = previewImage(presetSettings(preset));
  chip.querySelector(`.${P}-chip-label`).textContent = preset.name;
  chip.querySelector(`.${P}-sizer`).textContent = preset.name;
  return chip;
}


// The chip whose settings equal the current ones is marked active.
export function renderPresetStates() {
  if (!modal) return;
  for (const chip of modal.chips.querySelectorAll(`.${P}-preset-chip`)) {
    const preset = presetById(chip.dataset.preset);
    chip.setAttribute("aria-pressed", String(!!preset && matchesPreset(preset)));
  }
}


// ── Naming (+ Save, Rename) ──
// One inline name field (not a popover) takes the place of the + Save chip or of the chip
// being renamed. Enter saves, Escape cancels, and so does leaving the field.

function startNaming(m, mode, id = null) {
  if (m.naming) return;
  const preset = mode === "rename" ? presets.find((p) => p.id === id) : null;
  const chip = mode === "rename" ? chipEl(id) : m.saveChip;
  if (!chip || (mode === "rename" && !preset)) return;
  disarmChip(m);
  m.naming = { mode, id, chip };
  chip.before(m.nameField);
  chip.hidden = true; // hidden, not removed: it may be the element being clicked (GPB #26)
  m.nameField.value = preset ? preset.name : defaultPresetName();
  m.nameField.setAttribute("aria-label", preset ? `New name for "${preset.name}"` : "Preset name");
  m.nameField.hidden = false;
  m.nameField.focus({ preventScroll: true });
  m.nameField.select();
}


function stopNaming(m, { commit = false, refocus = false } = {}) {
  const naming = m.naming;
  if (!naming) return;
  m.naming = null;
  m.nameField.hidden = true;
  m.saveChip.after(m.nameField);
  naming.chip.hidden = false;
  if (!commit) {
    if (refocus) naming.chip.focus({ preventScroll: true });
    return;
  }
  if (pendingUndo?.kind === "preset") clearUndo(); // a restored preset could clash with this change
  if (naming.mode === "save") renderChipsLater(m, addPreset(m.nameField.value)?.id ?? "save");
  else {
    renamePreset(naming.id, m.nameField.value); // an empty name keeps the old one
    renderChipsLater(m, naming.id);
  }
}


// ── Chip menu ──
// The dot menu's popover (GPB #33) with the preset items instead: inside the modal root, hidden,
// never removed.

function openChipMenu(id, { at = null, keyboard = false } = {}) {
  const anchor = chipEl(id);
  if (!anchor || !isOwnPreset(id)) return;
  disarmChip(modal);
  setMenuKind("chip");
  if (showPopover(id, modal.menu, at, anchor) && keyboard) menuItems()[0]?.focus({ preventScroll: true });
}


function runChipAction(action) {
  if (!popover) return;
  const { id } = popover;
  closePopover();
  action(id);
}
