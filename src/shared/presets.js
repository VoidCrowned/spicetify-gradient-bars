// Presets (GPB #21, GCB #29): five built-ins and up to 12 of the user's own, in their own
// storage key (presetsKey(): PRESETS_KEY, or its self-test key, #13) with their own version.

// Colours only, all fixed (no theme stops): applying one keeps the current EXTRA_KEY setting (the
// Spread mode, the text colour). They can't be renamed or deleted, and they have their own chip
// row (GPB #53). Both extensions have the same five.

import { EXTRA_KEY, P, SCHEMA_VERSION } from "ext:config";
import { validateSettings } from "ext:hooks";
import { MAX_PRESETS, PRESETS_VERSION, PRESET_NAME_MAX } from "./constants.js";
import { presetsKey } from "./keys.js";
import { settings } from "./settings.js";

export const BUILT_IN_PRESETS = [
  { id: "b:void", name: "Void", colours: ["#8372fd", "#5a82ff", "#8372fd"] },
  { id: "b:sunset", name: "Sunset", colours: ["#6e33ff", "#ff5f6d", "#ffc371"] },
  { id: "b:aurora", name: "Aurora", colours: ["#00f5a0", "#00d9f5", "#7f5af0"] },
  { id: "b:neon", name: "Neon", colours: ["#ff00cc", "#3333ff", "#33f7ff"] },
  { id: "b:fairy", name: "Fairy", colours: ["#ff59d1", "#ffb800", "#77bc00"] },
].map((preset) => ({ ...preset, builtIn: true }));

// Own presets: [{ id, name, settings: { gradient, <EXTRA_KEY>, stops } }]. Only this module
// assigns it; everything else calls setPresets().
export let presets = [];

export function setPresets(next) {
  presets = next;
}

// What a preset stores: the settings without the schema version.
function snapshot(s) {
  return { gradient: s.gradient, [EXTRA_KEY]: s[EXTRA_KEY], stops: s.stops.map((stop) => ({ ...stop })) };
}

// The settings a preset applies. A built-in keeps the current EXTRA_KEY setting.
export function presetSettings(preset, current = settings) {
  if (!preset.builtIn) return { version: SCHEMA_VERSION, ...structuredClone(preset.settings) };
  const stops = preset.colours.map((color, i) => ({ id: `s${i + 1}`, kind: "custom", color }));
  return { version: SCHEMA_VERSION, gradient: true, [EXTRA_KEY]: current[EXTRA_KEY], stops };
}

// Equal settings, ignoring stop ids. Built-ins therefore compare colours only (their EXTRA_KEY
// setting is the current one).
export function sameSettings(a, b) {
  return a.gradient === b.gradient && a[EXTRA_KEY] === b[EXTRA_KEY] && a.stops.length === b.stops.length &&
    a.stops.every((stop, i) => stop.kind === b.stops[i].kind && stop.color === b.stops[i].color);
}

export const matchesPreset = (preset, s = settings) => sameSettings(s, presetSettings(preset, s));

export const presetById = (id) => BUILT_IN_PRESETS.find((p) => p.id === id) ?? presets.find((p) => p.id === id) ?? null;

// A clean own preset, or null. Names are trimmed and 1–24 characters long.
function validatePreset(entry) {
  if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id || typeof entry.name !== "string")
    return null;
  const name = entry.name.trim();
  if (!name || name.length > PRESET_NAME_MAX) return null;
  const valid = validateSettings({ ...entry.settings, version: SCHEMA_VERSION });
  return valid && { id: entry.id, name, settings: snapshot(valid) };
}

// Invalid entries (and any beyond 12) are dropped with one warning; an unreadable key gives
// an empty list and one warning. Storage is only rewritten by the next change.
export function loadPresets(raw = Spicetify.LocalStorage.get(presetsKey())) {
  if (raw == null) return [];
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {}
  if (!data || data.version !== PRESETS_VERSION || !Array.isArray(data.presets)) {
    console.warn(`[${P}] Saved presets were unreadable and have been ignored.`);
    return [];
  }
  const list = [];
  for (const entry of data.presets) {
    const preset = validatePreset(entry);
    if (!preset || list.length >= MAX_PRESETS || list.some((p) => p.id === preset.id)) continue;
    preset.name = uniqueName(preset.name, list);
    list.push(preset);
  }
  const dropped = data.presets.length - list.length;
  if (dropped) console.warn(`[${P}] ${dropped} saved preset${dropped === 1 ? " was" : "s were"} invalid and dropped.`);
  return list;
}

export function savePresets() {
  Spicetify.LocalStorage.set(presetsKey(), JSON.stringify({ version: PRESETS_VERSION, presets }));
}

// Trimmed, at most 24 characters, and unique among the built-ins and `list` (case-insensitive,
// `exceptId` aside): a clash gets " (2)", " (3)" and so on.
export function uniqueName(name, list = presets, exceptId = null) {
  const base = name.trim().slice(0, PRESET_NAME_MAX);
  const taken = new Set([...BUILT_IN_PRESETS, ...list].filter((p) => p.id !== exceptId).map((p) => p.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = base.slice(0, PRESET_NAME_MAX - suffix.length).trimEnd() + suffix;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export const defaultPresetName = () => uniqueName(`Preset ${presets.length + 1}`);

function nextPresetId() {
  const ids = new Set(presets.map((p) => p.id));
  let n = 1;
  while (ids.has(`p${n}`)) n++;
  return `p${n}`;
}

// Saves the current settings as a new own preset. Returns it, or null at the limit.
export function addPreset(name) {
  if (presets.length >= MAX_PRESETS) return null;
  const preset = { id: nextPresetId(), name: uniqueName(name.trim() || defaultPresetName()), settings: snapshot(settings) };
  presets.push(preset);
  savePresets();
  return preset;
}

export function renamePreset(id, name) {
  const preset = presets.find((p) => p.id === id);
  if (!preset || !name.trim()) return false;
  preset.name = uniqueName(name, presets, id);
  savePresets();
  return true;
}

export function updatePreset(id) {
  const preset = presets.find((p) => p.id === id);
  if (!preset) return false;
  preset.settings = snapshot(settings);
  savePresets();
  return true;
}

// Own presets only: a built-in id finds nothing. Returns { preset, index } for Undo, or null.
export function deletePreset(id) {
  const index = presets.findIndex((p) => p.id === id);
  if (index === -1) return null;
  const [preset] = presets.splice(index, 1);
  savePresets();
  return { preset, index };
}

export function restorePreset({ preset, index }) {
  presets.splice(Math.min(index, presets.length), 0, preset);
  savePresets();
}
