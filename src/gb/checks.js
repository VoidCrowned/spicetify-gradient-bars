// Gradient Bars' own checks: both bars run once, the conflict rule (shared/claim.js) and the
// shared top-bar button. Issue numbers are this repo's: #1 is the move into it, which added
// Gradient Bars.

import { claimBar, COPY_NAMES } from "../shared/claim.js";
import { createResults, summarise } from "../shared/report.js";
import { BARS, status } from "./index.js";

export async function gbChecks() {
  const { results, check } = createResults();
  const st = status();
  const copies = window.__gradientBarsCopies ?? {};

  // ── This file and both bars ──
  for (const id of BARS) {
    const entry = copies[id];
    const fromHere = entry && [entry.active, ...entry.skipped].some((c) => c?.copy === "gb");
    check(1, `${COPY_NAMES[id]}: this file started its copy (it runs, or skipped with a warning)`, fromHere,
      entry ? `active ${entry.active?.copy}, skipped ${entry.skipped.map((c) => c.copy).join(", ") || "none"}` : "no entry in window.__gradientBarsCopies");
    check(1, `${COPY_NAMES[id]}: exactly one copy runs, and status() names it`,
      !!entry?.active && st.bars[id].copy === entry.active.copy && ["gb", id].includes(entry.active.copy) && window[`__${id}`]?.copy === entry.active.copy,
      `status(): ${st.bars[id].copy}, registry: ${entry?.active?.copy}, window.__${id}.copy: ${window[`__${id}`]?.copy}`);
    const warned = entry?.skipped.map((c) => c.warnings) ?? [];
    check(1, `${COPY_NAMES[id]}: every skipped copy logged exactly one warning`, warned.every((n) => n === 1),
      warned.length ? `${entry.skipped.map((c) => `${c.copy}: ${c.warnings}`).join(", ")}` : "no copy skipped");
    const styles = document.querySelectorAll(`#${id}-style`).length;
    check(1, `${COPY_NAMES[id]}: one stylesheet, so a skipped copy added none`, styles === 1, `${styles} × <style id="${id}-style">`);
  }

  // ── Shared top-bar button ──
  const reg = window.__gradientBars;
  const ids = reg?.entries.map((e) => e.id) ?? [];
  check(1, "The shared top-bar button lists both bars, once each",
    !window.Spicetify?.Topbar?.Button || (reg?.protocol === 1 && ids.filter((i) => i === "gpb").length === 1 && ids.filter((i) => i === "gcb").length === 1),
    window.Spicetify?.Topbar?.Button ? `owner ${reg?.owner}, entries ${ids.join(", ") || "none"}` : "not applicable: Spicetify.Topbar.Button missing");

  // ── The conflict rule, on its own registry (the live one is never touched) ──
  const trial = (first, second, older = false) => {
    const registry = {};
    const globals = {};
    const warnings = [];
    const warn = (message) => warnings.push(message);
    let firstRuns = true;
    if (older) globals.__gpb = { version: "1.7.0" }; // a copy from before the rule: only its global
    else {
      firstRuns = claimBar({ id: "gpb", copy: first, version: "1", source: null, registry, globals, warn });
      globals.__gpb = { version: "1", copy: first };
    }
    const secondRuns = claimBar({ id: "gpb", copy: second, version: "2", source: null, registry, globals, warn });
    return { firstRuns, secondRuns, warnings, entry: registry.gpb };
  };
  const gbFirst = trial("gb", "gpb");
  check(1, "Conflict rule: Gradient Bars first, the standalone copy skips the bar with one warning",
    gbFirst.firstRuns && !gbFirst.secondRuns && gbFirst.warnings.length === 1 && gbFirst.entry.active.copy === "gb" &&
      gbFirst.entry.skipped.length === 1 && gbFirst.entry.skipped[0].copy === "gpb" && gbFirst.entry.skipped[0].warnings === 1,
    gbFirst.warnings[0] ?? "no warning");
  const standaloneFirst = trial("gpb", "gb");
  check(1, "Conflict rule: the standalone copy first, Gradient Bars skips the bar with one warning",
    standaloneFirst.firstRuns && !standaloneFirst.secondRuns && standaloneFirst.warnings.length === 1 &&
      standaloneFirst.entry.active.copy === "gpb" && standaloneFirst.entry.skipped[0]?.copy === "gb",
    standaloneFirst.warnings[0] ?? "no warning");
  const older = trial(null, "gb", true);
  check(1, "Conflict rule: an older copy without the rule (only window.__gpb) counts as running",
    !older.secondRuns && older.warnings.length === 1 && older.entry.active.copy === "gpb" && older.entry.active.older === true,
    older.warnings[0] ?? "no warning");

  return { summary: summarise(results), environment: st, results };
}
