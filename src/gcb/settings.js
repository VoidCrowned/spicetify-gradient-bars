// Gradient Connect Bar's settings: gradient, text colour and stops (GCB #2, #11).

import { CODE_FORMATS, decodeShareCode } from "../shared/codes.js";
import { HEX_RE, MAX_STOPS } from "../shared/constants.js";
import { DEFAULT_HOVER, validHover } from "../shared/hover.js";
import { SCHEMA_VERSION } from "./config.js";

const KINDS = ["theme", "custom"]; // opaque only, like GPB

// Text colour (GCB #11): Auto picks black or white by worst-case contrast; "default" overrides nothing.
export const TEXT_MODES = ["auto", "black", "white", "default"];

export const DEFAULT_TEXT = "auto";

// ── Settings ────────────────────────────────────────────────────────────────

export function defaultSettings() {
  return { version: SCHEMA_VERSION, gradient: false, textColour: DEFAULT_TEXT, hover: DEFAULT_HOVER, stops: [{ id: "s1", kind: "theme" }] };
}

// One step per schema version: MIGRATIONS[n] turns version-n data into version n + 1. A schema
// change adds its step here instead of dropping older settings.
export const MIGRATIONS = {
  // 1 → 2: transparency is gone. Fully transparent stops (kind "transparent", or a #rrggbbaa with
  // alpha 00) are dropped, partly transparent ones (#rrggbbaa) keep their RGB. If that leaves no
  // stops, the defaults. Anything else is passed on as it was, for validateSettings() to judge.
  1: (data) => {
    if (!Array.isArray(data.stops) || !data.stops.length) return { ...data, version: 2 };
    const stops = data.stops.flatMap((stop) => {
      if (stop?.kind === "transparent") return [];
      const color = stop?.kind === "custom" && typeof stop.color === "string" ? stop.color : "";
      if (!/^#[0-9a-f]{8}$/i.test(color)) return [stop];
      return color.slice(7) === "00" ? [] : [{ ...stop, color: color.slice(0, 7) }];
    });
    return stops.length ? { ...data, version: 2, stops } : defaultSettings();
  },
};

// Returns a clean copy of `data`, or null if it isn't valid settings.
export function validateSettings(data) {
  if (!data || typeof data !== "object" || data.version !== SCHEMA_VERSION) return null;
  if (typeof data.gradient !== "boolean" || !Array.isArray(data.stops)) return null;
  if (data.stops.length < 1 || data.stops.length > MAX_STOPS) return null;
  // Settings saved before the text colour option (GCB #11) have none; anything else unknown is invalid.
  const textColour = data.textColour === undefined ? DEFAULT_TEXT : data.textColour;
  if (!TEXT_MODES.includes(textColour)) return null;
  // The hover effect (#8) likewise: missing means "none".
  const hover = validHover(data.hover);
  if (!hover) return null;

  const ids = new Set();
  const stops = [];
  for (const stop of data.stops) {
    if (!stop || typeof stop.id !== "string" || !stop.id || ids.has(stop.id) || !KINDS.includes(stop.kind)) return null;
    ids.add(stop.id);
    if (stop.kind === "theme") stops.push({ id: stop.id, kind: "theme" });
    else if (HEX_RE.test(stop.color)) stops.push({ id: stop.id, kind: "custom", color: stop.color.toLowerCase() });
    else return null;
  }
  // A gradient needs at least two stops.
  return { version: SCHEMA_VERSION, gradient: data.gradient && stops.length > 1, textColour, hover, stops };
}

// The share-code formats (shared/codes.js), under the names the self-test uses.
export const GPB_CODE_PREFIX = CODE_FORMATS.gpb.prefix; // Gradient Progress Bar's codes import too
const TEXT_CODES = CODE_FORMATS.gcb.codes;

// { settings, from } from a share code, or null.
export const decodeCode = decodeShareCode;
