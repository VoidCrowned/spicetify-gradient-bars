// ── One copy per bar ────────────────────────────────────────────────────────
// Gradient Bars (gradientBars.js) runs both bars; the standalone files run one each. Whenever a
// bar already runs, the copy that starts second skips it entirely (no stylesheet, no listeners,
// no entries, no window.__gpb / __gcb) and logs exactly one warning: Gradient Bars next to a
// standalone file, or the same file twice, e.g. a local install and a Marketplace one (#15).
// window.__gradientBarsCopies keeps, per bar, the active copy and the skipped ones, so status()
// can say which copy runs and where it came from. A copy older than this rule (GPB 1.7.0,
// GCB 1.0.0) only shows as window.__gpb / __gcb.

// Which file this copy is: "gpb" or "gcb" for a standalone build, "gb" inside Gradient Bars.
// scripts/build.mjs replaces the string.

import { P, SOURCE, VERSION } from "ext:config";

export const COPY = "__COPY__";

export const COPY_NAMES = { gpb: "Gradient Progress Bar", gcb: "Gradient Connect Bar", gb: "Gradient Bars" };

const COPY_FILES = { gpb: "gradientProgressBar.js", gcb: "gradientConnectBar.js", gb: "gradientBars.js" };

const fileOf = (copy) => COPY_FILES[copy.copy] ?? copy.copy;

// The old repos' files only forward to this one: they insert a script tag for dist/ on jsDelivr
// marked data-gradient-bars-via="forwarder" (#15). currentScript is only set while the file
// first runs, so it's read here, as the module loads.
export const VIA = document.currentScript?.dataset?.gradientBarsVia ?? null;

// Where a copy was loaded from: "local file" (Spicetify's Extensions folder), "jsDelivr" (the
// Marketplace), "old-repo forwarder", "other" or "unknown".
export function originOf(source, via = null) {
  if (via === "forwarder") return "old-repo forwarder";
  if (!source) return "unknown";
  if (source.startsWith("https://cdn.jsdelivr.net/")) return "jsDelivr";
  if (new URL(source, location.href).pathname.startsWith("/extensions/")) return "local file";
  return "other";
}

const describe = (copy) => `${fileOf(copy)}${copy.from && copy.from !== "unknown" ? ` (${copy.from})` : ""}`;

// Claims bar `id` for this copy. Returns true if this copy runs it, false if it must skip it.
// The overrides are for the self-test's own registry and globals.
export function claimBar({ id = P, copy = COPY, version = VERSION, source = SOURCE, via = VIA, registry = null, globals = window, warn = console.warn } = {}) {
  const copies = registry ?? (globals.__gradientBarsCopies ??= {});
  const entry = (copies[id] ??= { active: null, skipped: [] });
  const me = { copy, version, source, via, from: originOf(source, via), warnings: 0 };
  const running = globals[`__${id}`];
  // A copy from before this rule has no registry entry, only its global.
  // Older copies were always standalone files.
  if (!entry.active && running) entry.active = { copy: running.copy ?? id, version: running.version ?? null, source: null, via: null, from: null, older: !running.copy };
  if (entry.active) {
    entry.skipped.push(me);
    me.warnings++;
    warn(`[${id}] ${COPY_NAMES[id]} already runs from ${describe(entry.active)}, so this copy (${describe(me)}) skips it. Keep only one of them installed.`);
    return false;
  }
  entry.active = me;
  return true;
}

// For status() and the self-test: which copy runs this bar and where it came from, and which
// copies were skipped.
export function copyStatus(id = P) {
  const entry = window.__gradientBarsCopies?.[id];
  return {
    this: COPY,
    from: originOf(SOURCE, VIA),
    active: entry?.active?.copy ?? null,
    activeFrom: entry?.active?.from ?? null,
    activeSource: entry?.active?.source ?? null,
    skipped: entry?.skipped.map((c) => `${c.copy}${c.version ? ` ${c.version}` : ""}${c.from ? ` (${c.from})` : ""}`) ?? [],
  };
}
