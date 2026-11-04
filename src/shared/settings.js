// The settings store: one object per extension in Spicetify.LocalStorage (STORAGE_KEY), loaded
// through the extension's migrations and validateSettings(), applied on every change and saved
// debounced.

// The current settings. Only this module assigns it; everything else calls setSettings().

import { KEEP_NEWER_SETTINGS, P, SCHEMA_VERSION, STORAGE_KEY } from "ext:config";
import { MIGRATIONS, afterSettingsChange, applyCss, defaultSettings, renderPreview, validateSettings } from "ext:hooks";
import { SAVE_DELAY, THEME_COLOUR } from "./constants.js";
import { modal, renderModal } from "./modal.js";
import { clearUndo, pendingUndo, renderPresetStates } from "./presets-ui.js";

export let settings;

export function setSettings(next) {
  settings = next;
}

// Runs MIGRATIONS[n] (version n → n + 1) until the data reaches SCHEMA_VERSION (GCB #2). A schema
// change bumps SCHEMA_VERSION and adds its step instead of dropping old settings.
function migrate(data) {
  let current = data;
  while (current && typeof current === "object" && Number.isInteger(current.version) &&
    current.version < SCHEMA_VERSION && typeof MIGRATIONS[current.version] === "function") {
    current = MIGRATIONS[current.version](structuredClone(current));
  }
  return current;
}

// Invalid data → defaults (written back) and one warning. Settings from a newer version of the
// extension → with KEEP_NEWER_SETTINGS defaults too, but the stored value is left alone until
// the next save; without it they count as invalid.
export function loadSettings(raw = Spicetify.LocalStorage.get(STORAGE_KEY)) {
  if (raw == null) return defaultSettings();

  let data = null;
  try {
    data = migrate(JSON.parse(raw));
  } catch {}
  const valid = validateSettings(data);
  if (valid) return valid;

  if (KEEP_NEWER_SETTINGS && Number.isInteger(data?.version) && data.version > SCHEMA_VERSION) {
    console.warn(`[${P}] Saved settings are from a newer version of the extension; using defaults.`);
    return defaultSettings();
  }
  console.warn(`[${P}] Saved settings were invalid and have been reset to defaults.`);
  const defaults = defaultSettings();
  Spicetify.LocalStorage.set(STORAGE_KEY, JSON.stringify(defaults));
  return defaults;
}

let saveTimer = 0;

// Debounced: colour pickers fire many input events per second.
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSettings, SAVE_DELAY);
}

export function flushSettings() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = 0;
  Spicetify.LocalStorage.set(STORAGE_KEY, JSON.stringify(settings));
}

// Drops a pending save without writing it (the self-test, before it restores the stored value).
export function cancelSave() {
  clearTimeout(saveTimer);
  saveTimer = 0;
}

export function stopColour(stop) {
  return stop.kind === "theme" ? THEME_COLOUR : stop.color;
}

// Solid with a theme colour leaves the bar to the theme: no rules at all.
export function isInert(s) {
  return !s.gradient && s.stops[0].kind === "theme";
}

// Called after every settings change: bar first, then the open modal, then storage.
// `rerender: false` for picker edits — the dots are updated in place instead.
// afterSettingsChange() is the extension's own follow-up (GCB: the text colour, debounced).
export function update({ rerender = true } = {}) {
  applyCss();
  if (modal) {
    rerender ? renderModal() : renderPreview();
    renderPresetStates();
  }
  // An Undo for applied settings would throw away later edits, so any other change drops it (GPB #21).
  if (pendingUndo?.after && pendingUndo.after !== JSON.stringify(settings)) clearUndo();
  afterSettingsChange();
  saveSettings();
}
