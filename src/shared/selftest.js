// ── Self-test harness ───────────────────────────────────────────────────────
// `await __gpb.selfTest()` / `await __gcb.selfTest()` in devtools. Each extension's suite drives
// the same functions and modal DOM the UI uses, checks computed styles on the live bar, then
// restores everything it touched. This module runs a suite and reports it:
//   - it resolves to the full report { summary, environment, results };
//   - it logs and copies only the summary line and one line per failed check;
//   - selfTest({ full: true }) copies the full report as JSON instead.

import { FILE, HOVER_ISSUE, HOVER_MODES, P, PRESETS_KEY, SOURCE, STORAGE_KEY } from "ext:config";
import { applyCss, defaultSettings, settingsReplaced, validateSettings } from "ext:hooks";
import { decodeShareCode, encodeCode } from "./codes.js";
import { claimBar, copyStatus } from "./claim.js";
import { toHex } from "./colour.js";
import { entryText, menuItemUsable, menuRegistered } from "./entry.js";
import { HOVER_LABELS } from "./hover.js";
import { TEST_KEYS, settingsKey, useTestKeys } from "./keys.js";
import { closeModal, modal } from "./modal.js";
import { BUILT_IN_PRESETS, loadPresets, presetSettings, presets, setPresets } from "./presets.js";
import { createResults, printReport, reportLines, summarise } from "./report.js";
import { cancelSave, flushSettings, loadSettings, setSettings, settings } from "./settings.js";
import { sleep } from "./startup.js";

export const RED = "#ff0000";
export const GREEN = "#00ff00";
export const BLUE = "#0000ff";
export const PROBE = "#123456"; // stand-in theme colour

export const tick = () => new Promise((r) => setTimeout(r, 0));
export const custom = (id, color) => ({ id, kind: "custom", color });
export const theme = (id) => ({ id, kind: "theme" });
export const styleText = () => document.getElementById(`${P}-style`)?.textContent ?? null;
export const computedHex = (el, prop) => (el ? toHex(getComputedStyle(el)[prop]) : null);

// Resolves once cond() is true, or after timeout ms; returns cond()'s last value. For checks that
// wait on async work (clipboard tiers, re-renders), instead of a fixed sleep that can be too short
// under load (#12).
export async function waitFor(cond, timeout = 1000) {
  const end = performance.now() + timeout;
  while (!cond() && performance.now() < end) await sleep(10);
  return cond();
}

// Runs fn with CSS transitions off on our own elements, so a computed colour read after a change
// is the end value at once instead of a frame of a .15 s fade (a fixed wait wasn't enough under
// load, #12). Test-only: each element's inline transition is put back afterwards.
export async function withoutTransitions(elements, fn) {
  const before = elements.map((el) => [el, el.getAttribute("style")]);
  for (const el of elements) el.style.setProperty("transition", "none", "important");
  try {
    return await fn();
  } finally {
    for (const [el, style] of before) style === null ? el.removeAttribute("style") : el.setAttribute("style", style);
  }
}

// The files that can carry this bar: its own and Gradient Bars, which runs both.
const BAR_FILES = [FILE, "gradientBars.js"];
const fileOf = (src) => src?.split(/[?#]/)[0].split("/").pop() ?? null;

// The old repos' forwarders mark their own <script> with this attribute (#15). They only load a
// copy from this repo, so they aren't copies themselves.
const FORWARDER_ATTR = "data-gradient-bars-forwarder";
const scriptTags = () => document.querySelectorAll("script[src]");

// Every <script> that loads this bar, from either file (GPB #39), forwarders left out.
export const loadedCopies = (scripts = scriptTags()) =>
  [...scripts].filter((el) => !el.hasAttribute(FORWARDER_ATTR)).map((el) => el.src).filter((src) => BAR_FILES.includes(fileOf(src)));

// The old repos' forwarders on the page (#15), for the environment block.
export const forwarders = (scripts = scriptTags()) => [...scripts].filter((el) => el.hasAttribute(FORWARDER_ATTR)).map((el) => el.src);

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

// The duplicate guard (claim.js, #15), tried on its own registry and globals; the live ones are
// never touched. Copies are described as claimBar() sees them: file, source URL, forwarder mark.
// ── Hover effect (#3, #8): storage, presets and share codes ──
export function checkHoverSettings(check) {
  const base = { ...defaultSettings(), gradient: true, stops: [custom("s1", RED), custom("s2", BLUE)] };
  const legacy = { ...base };
  delete legacy.hover;
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  let loaded;
  try {
    loaded = loadSettings(JSON.stringify(legacy));
  } finally {
    console.warn = warn;
  }
  check(HOVER_ISSUE, 'Stored settings without "hover" (from before this option) load as "none", no warning',
    loaded.hover === "none" && loaded.stops.length === 2 && !warnings.length, `${loaded.hover}, ${warnings.length} warning(s)`);
  const trips = HOVER_MODES.map((hover) => [hover, validateSettings(JSON.parse(JSON.stringify({ ...base, hover })))?.hover]);
  const others = ["sparkle", "", null, 1, "glow"].filter((value) => !HOVER_MODES.includes(value));
  const accepted = others.filter((value) => validateSettings({ ...base, hover: value }) !== null);
  check(HOVER_ISSUE, `Every hover option (${HOVER_MODES.join(", ")}) round-trips through storage; anything else is invalid settings`,
    trips.every(([hover, back]) => hover === back) && !accepted.length,
    `${trips.map(([hover, back]) => `${hover} → ${back}`).join(", ")}; ${accepted.length} of ${others.length} other values accepted`);
  const current = { ...base, hover: HOVER_MODES[HOVER_MODES.length - 1] };
  const { version, hover, ...saved } = structuredClone(base);
  const own = presetSettings({ id: "p1", name: "Mine", settings: saved }, current);
  const builtIn = presetSettings(BUILT_IN_PRESETS[0], current);
  const stored = loadPresets(JSON.stringify({ version: 1, presets: [{ id: "p1", name: "Mine", settings: { ...saved, hover: "brighten" } }] }));
  check(HOVER_ISSUE, "Presets don't store the hover effect; applying a built-in or an own preset keeps the current one",
    builtIn.hover === current.hover && own.hover === current.hover && stored.length === 1 && !("hover" in stored[0].settings),
    `built-in → ${builtIn.hover}, own → ${own.hover}, stored keys ${stored[0] ? Object.keys(stored[0].settings).join(",") : "none"} (current ${current.hover})`);
  const code = encodeCode(current);
  const body = atob(code.slice(code.indexOf(":") + 1).replace(/-/g, "+").replace(/_/g, "/"));
  const decoded = decodeShareCode(code, current)?.settings;
  const intoNone = decodeShareCode(code, { ...current, hover: "none" })?.settings;
  check(HOVER_ISSUE, "Share codes don't carry the hover effect (format unchanged); importing one keeps the current hover effect",
    code === encodeCode({ ...current, hover: "none" }) && !/hover|"h"/.test(body) && decoded?.hover === current.hover && intoNone?.hover === "none",
    `${code}; imported with ${current.hover} → ${decoded?.hover}, with none → ${intoNone?.hover}`);
}

// ── Hover row (#3, #8): mouse and keyboard, built once and updated in place ──
export async function checkHoverRow(check, m, { realClick, press, saveDelay }) {
  const nodes = [...m.hoverButtons];
  const shows = (hover) =>
    settings.hover === hover && m.hoverButtons.every((b, i) => b === nodes[i] && b.isConnected &&
      (b.getAttribute("aria-checked") === "true") === (b.dataset.hover === hover) && b.tabIndex === (b.dataset.hover === hover ? 0 : -1));
  const state = () =>
    `hover ${settings.hover}, checked ${m.hoverButtons.filter((b) => b.getAttribute("aria-checked") === "true").map((b) => b.dataset.hover).join() || "none"}, ` +
    `tabindex ${m.hoverButtons.map((b) => b.tabIndex).join()}, focus ${document.activeElement?.dataset?.hover ?? document.activeElement?.className}`;
  const style = () => document.getElementById(`${P}-style`)?.textContent ?? "";
  check(HOVER_ISSUE, `Hover row: a radiogroup of ${HOVER_MODES.map((h) => HOVER_LABELS[h]).join(", ")}, labelled "Hover"; plain buttons, no <select>`,
    m.hoverOptions.getAttribute("role") === "radiogroup" && m.hoverOptions.getAttribute("aria-labelledby") === `${P}-hover-label` &&
      m.root.querySelector(`#${P}-hover-label`)?.textContent === "Hover" &&
      m.hoverButtons.map((b) => b.textContent).join() === HOVER_MODES.map((h) => HOVER_LABELS[h]).join() &&
      m.hoverButtons.every((b) => b.tagName === "BUTTON" && b.getAttribute("role") === "radio") && !m.hover.querySelector("select"),
    state());
  const clicks = [];
  for (const hover of [...HOVER_MODES.slice(1), HOVER_MODES[0]]) {
    realClick(m.hoverButtons[HOVER_MODES.indexOf(hover)]);
    const live = hover === "none" ? !style().includes(":hover") : style().includes(":hover");
    clicks.push(`${hover}${shows(hover) && live ? "" : ` (expected ${hover}, stylesheet ${live ? "ok" : "wrong"})`}`);
  }
  check(HOVER_ISSUE, "Clicking each hover option applies it at once (:hover rules only when it isn't None), the row updated in place",
    !clicks.some((c) => c.includes("expected")), clicks.join(", "));
  m.hoverButtons[0].focus();
  const last = HOVER_MODES.length - 1;
  const keys = [];
  for (const [key, index] of [["ArrowRight", 1], ["End", last], ["Home", 0], ["ArrowLeft", last], ["ArrowRight", 0]]) {
    press(document.activeElement, key);
    const want = HOVER_MODES[index];
    keys.push(`${key} → ${settings.hover}${shows(want) && document.activeElement === m.hoverButtons[index] ? "" : ` (expected ${want} focused)`}`);
  }
  const altKept = press(document.activeElement, "ArrowRight", { altKey: true });
  keys.push(`Alt+→ → ${settings.hover}${settings.hover === HOVER_MODES[0] && altKept ? "" : " (expected no change)"}`);
  check(HOVER_ISSUE, "Hover keyboard: →, End, Home and ← (wrapping) change the option and move focus; Alt+→ doesn't",
    !keys.some((k) => k.includes("expected")), keys.join(", "));
  realClick(m.hoverButtons[last]);
  await sleep(saveDelay + 100);
  const stored = JSON.parse(Spicetify.LocalStorage.get(settingsKey()) ?? "{}").hover;
  realClick(m.hoverButtons[0]);
  check(HOVER_ISSUE, "The chosen hover option is saved", stored === HOVER_MODES[last], `stored ${stored}`);
}

// #6: the entry text says "hidden" exactly when Spicetify's MenuItem is broken, read when it's
// read, not when the entry was registered.
export function checkEntryText(check) {
  const ISSUE = "gradient-bars#6";
  const sample = "right-click on the bar + profile menu + top bar button";
  const usable = entryText(sample, true);
  const broken = entryText(sample, false);
  check(ISSUE, 'Entry text says "hidden" exactly when MenuItem is broken (both cases)',
    usable === sample && broken.includes("profile menu (hidden") && entryText(null, false) === null, `${usable} | ${broken}`);
  const live = entryText() ?? "";
  check(ISSUE, 'status().entry says "hidden" only while menuItemUsable() is false',
    live.includes("hidden") === (menuRegistered && !menuItemUsable()), `${live || "none"} (usable: ${menuItemUsable()}, registered: ${menuRegistered})`);
}

export function checkDuplicateGuard(check) {
  const ISSUE = "gradient-bars#15"; // this repo's #15; a bare #15 is GPB's Spread modes
  const local = { copy: P, source: `https://xpui.app.spotify.com/extensions/${FILE}`, via: null };
  const cdn = { copy: P, source: `https://cdn.jsdelivr.net/gh/VoidCrowned/spicetify-gradient-bars@main/dist/${FILE}?time=1`, via: null };
  const forwarded = { ...cdn, via: "forwarder" };
  const gb = { copy: "gb", source: "https://xpui.app.spotify.com/extensions/gradientBars.js", via: null };
  const older = { older: true };
  const trial = (first, second) => {
    const registry = {};
    const globals = {};
    const warnings = [];
    const warn = (message) => warnings.push(message);
    let firstRuns = true;
    if (first.older) globals[`__${P}`] = { version: "older" }; // a copy from before the guard: only its global
    else {
      firstRuns = claimBar({ id: P, ...first, version: "1", registry, globals, warn });
      globals[`__${P}`] = { version: "1", copy: first.copy };
    }
    const secondRuns = claimBar({ id: P, ...second, version: "2", registry, globals, warn });
    const entry = registry[P];
    const ok = firstRuns && !secondRuns && warnings.length === 1 && entry.skipped.length === 1 && entry.skipped[0].warnings === 1;
    return { ok, entry, detail: warnings.join(" | ") || "no warning" };
  };
  const twice = [
    ["a local file, then jsDelivr", local, cdn, "local file", "jsDelivr"],
    ["jsDelivr, then a local file", cdn, local, "jsDelivr", "local file"],
    ["the old-repo forwarder, then Gradient Bars", forwarded, gb, "old-repo forwarder", "local file"],
    ["Gradient Bars, then the old-repo forwarder", gb, forwarded, "local file", "old-repo forwarder"],
  ];
  for (const [order, first, second, activeFrom, skippedFrom] of twice) {
    const t = trial(first, second);
    check(ISSUE, `Duplicate guard, ${order}: the second copy skips with one warning naming both origins`,
      t.ok && t.entry.active.from === activeFrom && t.entry.skipped[0].from === skippedFrom &&
        t.detail.includes(`(${activeFrom})`) && t.detail.includes(`(${skippedFrom})`),
      t.detail);
  }
  for (const [what, second] of [["the standalone file", local], ["Gradient Bars", gb]]) {
    const t = trial(older, second);
    check(ISSUE, `Duplicate guard: with an older copy running (only window.__${P}), ${what} skips with one warning`,
      t.ok && t.entry.active.older === true, t.detail);
  }
  const tag = (src, forwarder) => {
    const el = document.createElement("script"); // never inserted, so never loaded
    el.src = src;
    if (forwarder) el.setAttribute(FORWARDER_ATTR, "");
    return el;
  };
  const tags = [tag(`https://cdn.jsdelivr.net/gh/VoidCrowned/old-repo@main/${FILE}?time=1`, true), tag(cdn.source, false)];
  check(ISSUE, "A forwarder's own <script> isn't counted as a copy",
    loadedCopies(tags).length === 1 && loadedCopies(tags)[0] === cdn.source && forwarders(tags).length === 1,
    `copies: ${loadedCopies(tags).join(", ")}; forwarders: ${forwarders(tags).join(", ")}`);
  const from = copyStatus().from;
  check(ISSUE, "This copy knows where it was loaded from (status().copy.from)",
    ["local file", "jsDelivr", "old-repo forwarder"].includes(from), `${from}: ${SOURCE ?? "no source"}`);
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

// Saves what a suite changes: the settings and presets in memory, and :root's inline
// --spice-button. Storage goes to the self-test keys meanwhile (#13), so the real keys are never
// written. restore() closes the modal, puts everything back and returns to the real keys;
// checkRealKeys() then checks that they're byte-identical to before the run.
export function saveTestState() {
  flushSettings(); // a pending save of the user's own still goes to the real key
  const realKeys = () => [STORAGE_KEY, PRESETS_KEY].map((key) => Spicetify.LocalStorage.get(key));
  const realBefore = realKeys();
  useTestKeys(true);
  const savedSettings = structuredClone(settings);
  const savedPresets = structuredClone(presets); // GPB #21, GCB #29
  const style = document.documentElement.style;
  const savedButton = [style.getPropertyValue("--spice-button"), style.getPropertyPriority("--spice-button")];
  // Checks set a probe --spice-button through rootStyle. Themes may write their own on :root at
  // any time (Hazy on every songchange), which would replace the probe mid-check (#12), so while a
  // probe is set, a write over it is undone at once.
  let probe = null;
  const guard = new MutationObserver(() => {
    if (probe && style.getPropertyValue("--spice-button").trim() !== probe) style.setProperty("--spice-button", probe, "important");
  });
  const rootStyle = {
    setProperty(name, value, priority) {
      if (name === "--spice-button") {
        probe = value;
        guard.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
      }
      style.setProperty(name, value, priority);
    },
  };
  const restoreButton = () => {
    probe = null;
    guard.disconnect();
    if (savedButton[0]) style.setProperty("--spice-button", savedButton[0], savedButton[1]);
    else style.removeProperty("--spice-button");
  };
  const restore = () => {
    closeOpenModal();
    restoreButton();
    cancelSave();
    setSettings(savedSettings);
    settingsReplaced(); // GCB: the text colour for the restored settings
    applyCss();
    setPresets(savedPresets);
    useTestKeys(false);
  };
  const checkRealKeys = (check) => {
    const after = realKeys();
    const changed = [STORAGE_KEY, PRESETS_KEY].filter((key, i) => after[i] !== realBefore[i]);
    const left = Object.values(TEST_KEYS).filter((key) => Spicetify.LocalStorage.get(key) != null);
    check("gradient-bars#13", "The real settings and presets keys are byte-identical before and after the run; the self-test keys are gone",
      !changed.length && !left.length,
      changed.length || left.length
        ? [changed.length && `changed: ${changed.join(", ")}`, left.length && `left: ${left.join(", ")}`].filter(Boolean).join("; ")
        : `${STORAGE_KEY} ${realBefore[0]?.length ?? "absent"}, ${PRESETS_KEY} ${realBefore[1]?.length ?? "absent"} characters, unchanged`);
  };
  return { rootStyle, restoreButton, restore, checkRealKeys };
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
  if (!options.quiet) await printReport(P, reportLines(P, report), report, options);
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
