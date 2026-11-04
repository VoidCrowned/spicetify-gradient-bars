// ── One copy per bar ────────────────────────────────────────────────────────
// Gradient Bars (gradientBars.js) runs both bars; the standalone files run one each. If both are
// installed, the copy that starts second skips that bar entirely (no stylesheet, no listeners, no
// entries, no window.__gpb / __gcb) and logs exactly one warning. window.__gradientBarsCopies
// keeps, per bar, the active copy and the skipped ones, so status() can say which copy runs.
// A copy older than this rule (GPB 1.7.0, GCB 1.0.0) only shows as window.__gpb / __gcb.

// Which file this copy is: "gpb" or "gcb" for a standalone build, "gb" inside Gradient Bars.
// scripts/build.mjs replaces the string.

import { P, SOURCE, VERSION } from "ext:config";

export const COPY = "__COPY__";

const COPY_NAMES = { gpb: "Gradient Progress Bar", gcb: "Gradient Connect Bar", gb: "Gradient Bars" };

const describe = (copy) => `${COPY_NAMES[copy.copy] ?? copy.copy}${copy.version ? ` ${copy.version}` : ""}`;

// Claims bar `id` for this copy. Returns true if this copy runs it, false if it must skip it.
// The overrides are for the self-test's own registry and globals.
export function claimBar({ id = P, copy = COPY, version = VERSION, source = SOURCE, registry = null, globals = window, warn = console.warn } = {}) {
  const copies = registry ?? (globals.__gradientBarsCopies ??= {});
  const entry = (copies[id] ??= { active: null, skipped: [] });
  const me = { copy, version, source, warnings: 0 };
  const running = globals[`__${id}`];
  // A copy from before this rule has no registry entry, only its global.
  // Older copies were always standalone files.
  if (!entry.active && running) entry.active = { copy: running.copy ?? id, version: running.version ?? null, source: null, older: !running.copy };
  if (entry.active) {
    entry.skipped.push(me);
    me.warnings++;
    warn(`[${id}] ${COPY_NAMES[id]} is already running from ${describe(entry.active)}, so ${describe(me)} skips it. Keep one of them installed.`);
    return false;
  }
  entry.active = me;
  return true;
}

// For status() and the self-test: which copy runs this bar, and which were skipped.
export function copyStatus(id = P) {
  const entry = window.__gradientBarsCopies?.[id];
  return {
    this: COPY,
    active: entry?.active?.copy ?? null,
    skipped: entry?.skipped.map((c) => `${c.copy}${c.version ? ` ${c.version}` : ""}`) ?? [],
  };
}
