// Gradient Progress Bar's settings: gradient, Spread mode and stops (GPB #2, #15).

// How a gradient spreads over the bar (GPB #15). Optional in storage: missing means "compress".

import { CODE_FORMATS, decodeShareCode } from "../shared/codes.js";
import { HEX_RE, MAX_STOPS } from "../shared/constants.js";
import { DEFAULT_HOVER, validHover } from "../shared/hover.js";
import { settings } from "../shared/settings.js";
import { SCHEMA_VERSION } from "./config.js";

export const MODES = ["compress", "anchored", "slide"];

export const DEFAULT_MODE = "compress";

// ── Settings ────────────────────────────────────────────────────────────────

export function defaultSettings() {
  return { version: SCHEMA_VERSION, gradient: false, mode: DEFAULT_MODE, hover: DEFAULT_HOVER, stops: [{ id: "s1", kind: "theme" }] };
}

// Returns a clean copy of `data`, or null if it isn't valid settings.
export function validateSettings(data) {
  if (!data || typeof data !== "object" || data.version !== SCHEMA_VERSION) return null;
  if (typeof data.gradient !== "boolean" || !Array.isArray(data.stops)) return null;
  if (data.stops.length < 1 || data.stops.length > MAX_STOPS) return null;
  // Settings saved before v1.2.0 have no mode; anything else unknown is invalid.
  const mode = data.mode === undefined ? DEFAULT_MODE : data.mode;
  if (!MODES.includes(mode)) return null;
  // The hover effect (#3) likewise: missing means "none".
  const hover = validHover(data.hover);
  if (!hover) return null;

  const ids = new Set();
  const stops = [];
  for (const stop of data.stops) {
    if (!stop || typeof stop.id !== "string" || !stop.id || ids.has(stop.id)) return null;
    ids.add(stop.id);
    if (stop.kind === "theme") stops.push({ id: stop.id, kind: "theme" });
    else if (stop.kind === "custom" && HEX_RE.test(stop.color))
      stops.push({ id: stop.id, kind: "custom", color: stop.color.toLowerCase() });
    else return null;
  }
  // A gradient needs at least two stops.
  return { version: SCHEMA_VERSION, gradient: data.gradient && stops.length > 1, mode, hover, stops };
}

// Settings migrations: none yet (schema version 1). See shared/settings.js → migrate().
export const MIGRATIONS = {};

// The share-code formats (shared/codes.js), under the names the self-test uses.
export const GCB_CODE_PREFIX = CODE_FORMATS.gcb.prefix; // Gradient Connect Bar's codes import too (GPB #59)
const MODE_CODES = CODE_FORMATS.gpb.codes;

// Settings from a share code, or null; decodeShareCode() also says where the code came from.
export function decodeCode(text, current = settings) {
  return decodeShareCode(text, current)?.settings ?? null;
}
