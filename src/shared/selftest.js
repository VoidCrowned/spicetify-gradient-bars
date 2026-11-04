// ── Self-test harness ───────────────────────────────────────────────────────
// `await __gpb.selfTest()` / `await __gcb.selfTest()` in devtools. Each extension's suite drives
// the same functions and modal DOM the UI uses, checks computed styles on the live bar, then
// restores everything it touched. This module runs a suite and reports it:
//   - it resolves to the full report { summary, environment, results };
//   - it logs and copies only the summary line and one line per failed check;
//   - selfTest({ full: true }) copies the full report as JSON instead.

import { FILE, P, PRESETS_KEY, SOURCE, STORAGE_KEY } from "ext:config";
import { applyCss, settingsReplaced } from "ext:hooks";
import { writeClipboard } from "./clipboard.js";
import { toHex } from "./colour.js";
import { closeModal, modal } from "./modal.js";
import { presets, setPresets } from "./presets.js";
import { cancelSave, setSettings, settings } from "./settings.js";

export const RED = "#ff0000";
export const GREEN = "#00ff00";
export const BLUE = "#0000ff";
export const PROBE = "#123456"; // stand-in theme colour

export const tick = () => new Promise((r) => setTimeout(r, 0));
export const custom = (id, color) => ({ id, kind: "custom", color });
export const theme = (id) => ({ id, kind: "theme" });
export const styleText = () => document.getElementById(`${P}-style`)?.textContent ?? null;
export const computedHex = (el, prop) => (el ? toHex(getComputedStyle(el)[prop]) : null);

// The files that can carry this bar: its own and Gradient Bars, which runs both.
const BAR_FILES = [FILE, "gradientBars.js"];
const fileOf = (src) => src?.split(/[?#]/)[0].split("/").pop() ?? null;

// Every <script> that loads this bar, from either file (GPB #39).
export const loadedCopies = () =>
  [...document.querySelectorAll("script[src]")].map((el) => el.src).filter((src) => BAR_FILES.includes(fileOf(src)));

// The copies of the file this copy came from. More than one means a Marketplace install and a
// local CLI install are both active, and the second copy fights the first (GPB #39). A copy in
// the other file is handled by the conflict rule (see claim.js) and has its own checks.
export const sameFileCopies = (copies = loadedCopies()) => copies.filter((src) => fileOf(src) === fileOf(SOURCE ?? FILE));

// This copy's file name, for the advice in the copies check.
export const fileName = () => fileOf(SOURCE ?? FILE);

// The copies check's detail when it passes: our copy, then any copy in the other file.
export function copiesDetail(copies) {
  const own = sameFileCopies(copies);
  const others = copies.filter((src) => !own.includes(src));
  return [own[0], ...others.map((src) => `also ${src}, one of them skipped by the conflict rule`)].join("; ");
}

// A function declaration, so status() can use it from the first line on (GPB #55).
export function spicetifyVersion() {
  return window.Spicetify?.Config?.version ?? "unknown";
}

// The states reported by the separate spicetify-fixes extension (window.__fixes), if it runs: its
// workarounds for the top bar and MenuItem make ours work too. Read only, never relied on (GPB #55).
export function otherFixes() {
  const fixes = window.__fixes?.fixes;
  return Array.isArray(fixes) ? Object.fromEntries(fixes.map((fix) => [fix?.id, fix?.state])) : null;
}

export function closeOpenModal() {
  if (modal) {
    Spicetify.PopupModal.hide();
    closeModal(modal);
  }
}

// Saves what a suite changes: the settings and presets, in memory and stored, and :root's inline
// --spice-button. restore() closes the modal and puts all of it back.
export function saveTestState() {
  const savedSettings = structuredClone(settings);
  const savedRaw = Spicetify.LocalStorage.get(STORAGE_KEY);
  const savedPresets = structuredClone(presets); // GPB #21, GCB #29
  const savedPresetsRaw = Spicetify.LocalStorage.get(PRESETS_KEY);
  const rootStyle = document.documentElement.style;
  const savedButton = [rootStyle.getPropertyValue("--spice-button"), rootStyle.getPropertyPriority("--spice-button")];
  const restoreButton = () =>
    savedButton[0]
      ? rootStyle.setProperty("--spice-button", savedButton[0], savedButton[1])
      : rootStyle.removeProperty("--spice-button");
  const restore = () => {
    closeOpenModal();
    restoreButton();
    cancelSave();
    setSettings(savedSettings);
    settingsReplaced(); // GCB: the text colour for the restored settings
    applyCss();
    if (savedRaw == null) Spicetify.LocalStorage.remove(STORAGE_KEY);
    else Spicetify.LocalStorage.set(STORAGE_KEY, savedRaw);
    setPresets(savedPresets);
    if (savedPresetsRaw == null) Spicetify.LocalStorage.remove(PRESETS_KEY);
    else Spicetify.LocalStorage.set(PRESETS_KEY, savedPresetsRaw);
  };
  return { rootStyle, restoreButton, restore };
}

// Results in the order they were checked. pass: true, false, or null for a skipped check.
function createResults() {
  const results = [];
  const check = (issue, name, pass, detail = "") =>
    results.push({ id: results.length + 1, issue: `#${issue}`, check: name, pass: !!pass, detail: String(detail) });
  const skip = (issue, name, reason) =>
    results.push({ id: results.length + 1, issue: `#${issue}`, check: name, pass: null, skipped: reason, detail: "" });
  return { results, check, skip };
}

function summarise(results) {
  const failed = results.filter((r) => r.pass === false).length;
  const skipped = results.filter((r) => r.pass === null).length;
  const passed = results.length - failed - skipped;
  return `${passed}/${results.length - skipped} passed${skipped ? `, ${skipped} skipped` : ""}${failed ? `, ${failed} FAILED` : ""}`;
}

// The short report: the summary line, then one line per failed check (id, issue, check, detail).
function reportLines(tag, report) {
  const oneLine = (text) => String(text).replace(/\s*\n\s*/g, " ⏎ ");
  return [
    `[${tag}] self-test: ${report.summary}`,
    ...report.results.filter((r) => r.pass === false).map((r) => `  ✗ ${r.id} ${r.issue} ${r.check} — ${oneLine(r.detail)}`),
  ];
}

// Logs the lines and copies them, or with `full` the whole report as JSON.
async function printReport(lines, report, { full = false } = {}) {
  console.log(lines.join("\n"));
  const copied = !!(await writeClipboard(full ? JSON.stringify(report, null, 2) : lines.join("\n")));
  if (!copied) console.warn(`[${P}] Couldn't copy the report: it's the return value.`);
}

let selfTestRunning = false;

// Runs `suite({ check, skip })`, which returns the environment block. `quiet` (Gradient Bars)
// returns the report without logging or copying it.
export async function runSelfTest(options = {}, suite) {
  if (selfTestRunning) return console.warn(`[${P}] The self-test is already running.`);
  selfTestRunning = true;
  const { results, check, skip } = createResults();
  let environment = null;
  try {
    environment = await suite({ check, skip });
  } finally {
    selfTestRunning = false;
  }
  const report = { summary: summarise(results), environment, results };
  if (!options.quiet) await printReport(reportLines(P, report), report, options);
  return report;
}

// ── Diagnostics ─────────────────────────────────────────────────────────────

// Compact outline of a DOM subtree — enough to fix selectors after a Spotify update without
// another round trip. GPB's outline leaves out data-encore-id and goes deeper.
export function outline(el, depth = 0, maxDepth = 3, { encore = true } = {}) {
  if (!el || depth > maxDepth) return [];
  const testid = el.dataset?.testid ? `[data-testid="${el.dataset.testid}"]` : "";
  const encoreId = encore && el.dataset?.encoreId ? `[data-encore-id="${el.dataset.encoreId}"]` : "";
  const cls = [...(el.classList ?? [])].map((c) => `.${c}`).join("");
  const line = `${"  ".repeat(depth)}${el.tagName.toLowerCase()}${testid}${encoreId}${cls}`;
  return [line, ...[...el.children].flatMap((c) => outline(c, depth + 1, maxDepth, { encore }))];
}

// ── CSS lint ────────────────────────────────────────────────────────────────
// Checks a generated stylesheet against the extension's hard rules (CLAUDE.md → Hard rules):
// never !important, plus the extension's own rules for the whole text, each selector and each
// declaration. Returns one message per problem, in that order.
export function lintCss(css, { whole = () => [], rule = () => [], declaration = () => null }) {
  const problems = [];
  if (/!important/i.test(css)) problems.push("!important");
  problems.push(...whole(css));
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const sel = selector.trim();
    problems.push(...rule(sel));
    for (const decl of body.split(";")) {
      const [prop, ...rest] = decl.split(":");
      const problem = declaration(sel, prop.trim(), rest.join(":").trim());
      if (problem) problems.push(problem);
    }
  }
  return problems;
}
