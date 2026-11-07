// Share codes (GPB #21, GCB #36): the extension's prefix and format version, then base64url (no
// padding) of { g: 0|1, <field>: <code>, s: ["t" | "rrggbb", …] }, t = a theme stop. Each
// extension writes its own format and reads both, so a gradient can move between the two bars.
//   gpb1:  field m, the Spread mode:  c = compress, a = anchored, s = slide
//   gcb1:  field x, the text colour:  a = auto, b = black, w = white, d = Spotify default

import { EXTRA_KEY, P, SCHEMA_VERSION } from "ext:config";
import { validateSettings } from "ext:hooks";
import { settings } from "./settings.js";

export const CODE_FORMATS = {
  gpb: { prefix: "gpb1:", field: "m", key: "mode", codes: { compress: "c", anchored: "a", slide: "s" } },
  gcb: { prefix: "gcb1:", field: "x", key: "textColour", codes: { auto: "a", black: "b", white: "w", default: "d" } },
};

const OWN_FORMAT = CODE_FORMATS[P];
export const CODE_PREFIX = OWN_FORMAT.prefix; // the code's format version; a future schema bumps it

export const toBase64Url = (data) => btoa(JSON.stringify(data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function encodeCode(s) {
  return CODE_PREFIX + toBase64Url({
    g: s.gradient ? 1 : 0,
    [OWN_FORMAT.field]: OWN_FORMAT.codes[s[EXTRA_KEY]],
    s: s.stops.map((stop) => (stop.kind === "theme" ? "t" : stop.color.slice(1))),
  });
}

// { settings, from: "gpb" | "gcb" } from a share code (stop ids s1…sN), checked by
// validateSettings(), or null. Surrounding whitespace is fine; an unknown prefix or version
// isn't. The other extension's codes are decoded exactly as it does — its field must hold one of
// its codes — then that field is dropped and `current`'s own setting kept (GPB #59, GCB #36).
export function decodeShareCode(text, current = settings) {
  const code = String(text ?? "").trim();
  const from = Object.keys(CODE_FORMATS).find((id) => code.startsWith(CODE_FORMATS[id].prefix));
  const format = CODE_FORMATS[from];
  const body = format ? code.slice(format.prefix.length) : "";
  if (!format || !/^[A-Za-z0-9_-]+$/.test(body)) return null;
  let data = null;
  try {
    data = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.s)) return null;
  const foreign = format !== OWN_FORMAT;
  if (foreign && !Object.values(format.codes).includes(data[format.field])) return null;
  // Anything unexpected is passed on as a value validateSettings() rejects.
  const extra = foreign
    ? current[EXTRA_KEY]
    : Object.keys(format.codes).find((key) => format.codes[key] === data[format.field]) ?? null;
  const valid = validateSettings({
    version: SCHEMA_VERSION,
    gradient: data.g === 1 ? true : data.g === 0 ? false : null,
    [EXTRA_KEY]: extra,
    hover: current.hover, // not in codes (#3, #8): an import keeps the current hover effect
    stops: data.s.map((value, i) =>
      value === "t"
        ? { id: `s${i + 1}`, kind: "theme" }
        : { id: `s${i + 1}`, kind: "custom", color: typeof value === "string" ? `#${value}` : null }
    ),
  });
  return valid && { settings: valid, from };
}
