// ── Entry points (GCB #34, GCB #35) ──

import { clipboardSources } from "../shared/clipboard.js";
import { CODE_PREFIX, encodeCode, toBase64Url } from "../shared/codes.js";
import { computedRgb, contrast, hexToRgb, hsvToHex, luminance, parseRgb, resolveStop, rgbToHex, themeHex, toHex } from "../shared/colour.js";
import { MAX_PRESETS, MAX_STOPS, PRESETS_VERSION, PRESET_NAME_MAX, SAVE_DELAY, THEME_COLOUR } from "../shared/constants.js";
import { ENTRY_ICON, SELF, joinGradientBars, menuItemUsable, menuRegistered, shared } from "../shared/entry.js";
import { ADD_FULL_LABEL, ADD_LABEL, PICKER_COLUMNS_MIN, REMOVE_LABEL, THEME_LABELS, closeModal, liveObservers, modal, modalCss, openModal } from "../shared/modal.js";
import { pickerHsv } from "../shared/picker.js";
import { APPLY_LABEL, COPIED_LABEL, COPIED_MS, EXPORT_LABEL, EXPORT_TITLE, IMPORT_ERROR, PREVIEW_CODE_MESSAGE, SAVE_FULL_LABEL, chipEl, copyCode, pendingUndo, renderChips } from "../shared/presets-ui.js";
import { BUILT_IN_PRESETS, addPreset, deletePreset, loadPresets, matchesPreset, presetSettings, presets, renamePreset, sameSettings, savePresets, setPresets, uniqueName, updatePreset } from "../shared/presets.js";
import { RESET_CONFIRM_LABEL, RESET_CONFIRM_MS } from "../shared/reset.js";
import { BLUE, GREEN, PROBE, RED, computedHex, custom, styleText, theme, tick, waitFor, withoutTransitions } from "../shared/selftest.js";
import { presetsKey, settingsKey } from "../shared/keys.js";
import { createResults, summarise } from "../shared/report.js";
import { loadSettings, setSettings, settings, update } from "../shared/settings.js";
import { api, sleep, startup } from "../shared/startup.js";
import { STOP_GAP, closePopover, dotEl, popover, selectStop } from "../shared/stop-editor.js";
import { findStop, selectedId, setStopColour } from "../shared/stops.js";
import { BAR_ICON, BAR_LINK, PARENT, SELECTOR, UNSCOPED, barBase, findBar } from "./bar.js";
import { ENTRY_LABEL, GPB_STORAGE_KEY, HELP_LINES, IMPORT_TITLE, PRESETS_KEY, SCHEMA_VERSION, STORAGE_KEY, TITLE } from "./config.js";
import { statusReport } from "./diagnostics.js";
import { barImage, buildCss } from "./render.js";
import { HASHED_SAMPLE, barGeometry, barWithAndWithout, computedImage, cssProblems, hashLike, opacityIn, parseProblems, setTestSettings, songchangeCount } from "./selftest.js";
import { DEFAULT_TEXT, GPB_CODE_PREFIX, MIGRATIONS, TEXT_MODES, decodeCode, defaultSettings } from "./settings.js";
import { BLACK, SAMPLES_BETWEEN, TEXT_DELAY, WHITE, appliedTextColour, asideObserver, gradientSamples, onThemeChange, pickTextColour, recalcTextColour, setTextRegion, textContext, textRegion, textResult, textRuns, watchedAside } from "./text-colour.js";
import { PREVIEW_LABEL, spotifyTextColour, textColourFor } from "./ui.js";

export async function checkEntries(check, skip) {
  const st = statusReport();
  const menuApplicable = !!(api("Menu")?.Item && api("ReactJSX"));
  check(35, "Profile-menu entry registered without throwing (its own entry, guarded by menuItemUsable())", !menuApplicable || menuRegistered,
    menuApplicable
      ? startup.entryErrors.filter((e) => e.startsWith("Menu:")).join("; ") || `registered${menuItemUsable() ? "" : ", hidden while Spicetify's MenuItem is broken (spicetify/cli#4012)"}`
      : `not applicable: Spicetify.Menu.Item ${api("Menu")?.Item ? "exists" : "missing"}, Spicetify.ReactJSX ${api("ReactJSX") ? "exists" : "missing"}`);
  // Product names are written with every word capitalised (CLAUDE.md → Conventions): the profile-menu
  // label, the settings window's title and the shared button's entry all match manifest.json's "name".
  const MANIFEST_NAME = "Gradient Connect Bar";
  const shownNames = { ENTRY_LABEL, "settings title": TITLE, "SELF.name": SELF.name };
  const misnamed = Object.entries(shownNames).filter(([, value]) => value !== MANIFEST_NAME);
  check(1, `Product name: ENTRY_LABEL, the settings window title and SELF.name all read "${MANIFEST_NAME}", the manifest name`,
    !misnamed.length, misnamed.map(([key, value]) => `${key} "${value}"`).join(", ") || JSON.stringify(shownNames));
  check(34, "Entry icon is GPB's: currentColor, 16 × 16 viewBox, no id= and no <defs>",
    ENTRY_ICON.includes("currentColor") && ENTRY_ICON.includes('viewBox="0 0 16 16"') && !ENTRY_ICON.includes("id=") && !ENTRY_ICON.includes("<defs"),
    `${ENTRY_ICON.length} characters`);
  check(34, "status() reports topbar, shared, entryErrors, menu and apis.ReactJSX",
    !!st.topbar && "created" in st.topbar && "connected" in st.topbar && !!st.shared && Array.isArray(st.entryErrors) &&
      !!st.menu && "menuItemUsable" in st.menu && "ReactJSX" in st.apis,
    JSON.stringify({ topbar: st.topbar, shared: st.shared, menu: st.menu }));
  const role = shared?.role ?? "none";
  check(34, "Top-bar entry: our own button (owner, or next to another protocol) or the owner's shared one (member)",
    !api("Topbar")?.Button || (role === "member" ? !shared.button && !!shared.registry?.entries.some((e) => e.id === SELF.id) : !!shared?.button),
    !api("Topbar")?.Button
      ? "not applicable: Spicetify.Topbar.Button missing"
      : `${role}${shared?.button ? `, button "${shared.button.label}" ${shared.button.element?.isConnected ? "on screen" : "not on screen yet"}` : ", no button of ours"}`);

  // The live registry: never touched by the self-test.
  const reg = window.__gradientBars;
  if (role.startsWith("own button")) check(34, "Live registry: protocol 1, our entry exactly once, sorted by name", true, `not ours to check: ${role}`);
  else {
    const names = reg?.entries.map((e) => e.name) ?? [];
    check(34, "Live registry: protocol 1, our entry exactly once, sorted by name",
      reg?.protocol === 1 && reg.entries.filter((e) => e.id === SELF.id).length === 1 &&
        names.join("|") === [...names].sort((a, b) => a.localeCompare(b)).join("|") && shared.registry === reg,
      `owner ${reg?.owner}, entries ${reg?.entries.map((e) => e.id).join(", ")}`);
  }
  const gpb = window.__gpb;
  if (!gpb) skip(34, "With Gradient Progress Bar: exactly one top-bar button, the owner's", "Gradient Progress Bar isn't running");
  else if (!reg?.entries.some((e) => e.id === "gpb"))
    skip(34, "With Gradient Progress Bar: exactly one top-bar button, the owner's",
      `Gradient Progress Bar ${gpb.version} doesn't share the button yet: two buttons are expected until it does`);
  else {
    const created = { gcb: !!window.__gcb.status().topbar?.created, gpb: !!gpb.status?.().topbar?.created };
    check(34, "With Gradient Progress Bar: exactly one top-bar button, the owner's",
      Object.values(created).filter(Boolean).length === 1 && created[reg.owner], `owner ${reg.owner}; created ${JSON.stringify(created)}`);
  }

  // A separate instance from the same factory: its own key and prefix, fake buttons, stub
  // opens; removed afterwards.
  const KEY = "__gradientBarsSelfTest";
  const OTHER_KEY = "__gradientBarsSelfTestOther";
  const PREFIX = "gradient-bars-selftest";
  const liveBefore = window.__gradientBars;
  const liveEntries = liveBefore?.entries.map((e) => e.id).join();
  const opened = [];
  const buttons = [];
  const fakeButton = (label, icon, onClick) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `${PREFIX}-anchor`;
    el.textContent = "♪";
    Object.assign(el.style, { position: "fixed", top: "12px", right: "60px", width: "32px", height: "32px", zIndex: "99999" });
    el.addEventListener("click", () => onClick());
    document.body.append(el);
    const fake = { element: el, label, icon };
    buttons.push(fake);
    return fake;
  };
  const entry = (id, name) => ({ id: `${id}-selftest`, name, open: () => opened.push(id) });
  const clickAt = (el, keyboard = false) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: keyboard ? 0 : 1 }));
  const key = (el, k) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  const menuEl = () => document.getElementById(`${PREFIX}-menu`);
  const shown = () => !!menuEl() && !menuEl().hidden;
  const menuItems = () => [...(menuEl()?.querySelectorAll(`.${PREFIX}-item`) ?? [])];
  let a, b, c;
  try {
    a = joinGradientBars({ self: entry("gcb", "Gradient Connect Bar"), key: KEY, prefix: PREFIX, createButton: fakeButton });
    a.ensureButton();
    const anchor = a.button?.element;
    clickAt(anchor);
    check(34, "Protocol test instance, one entry: the owner's button opens it directly (no menu), labelled with its name",
      a.role === "owner" && window[KEY]?.protocol === 1 && opened.join() === "gcb" && !shown() && a.button.label === "Gradient Connect Bar",
      `role ${a.role}, opened ${opened.join() || "nothing"}, menu ${shown() ? "shown" : "none"}, label "${a.button?.label}"`);

    b = joinGradientBars({ self: entry("gpb", "Gradient Progress Bar"), key: KEY, prefix: PREFIX, createButton: fakeButton });
    const memberButton = b.ensureButton();
    opened.length = 0;
    clickAt(anchor);
    const names = menuItems().map((el) => el.textContent).join(", ");
    const r = anchor.getBoundingClientRect();
    const mr = menuEl()?.getBoundingClientRect();
    const roles = menuEl()?.getAttribute("role") === "menu" && menuItems().every((el) => el.getAttribute("role") === "menuitem");
    check(34, "Two entries: one button only ('Gradient bars'); a click shows the menu with both, in name order, 8 px below the button, right edges aligned",
      b.role === "member" && !memberButton && buttons.length === 1 && a.button.label === "Gradient bars" && shown() && roles &&
        names === "Gradient Connect Bar, Gradient Progress Bar" && !opened.length && document.activeElement !== menuItems()[0] &&
        Math.abs(mr.top - (r.bottom + 8)) <= 1 && Math.abs(mr.right - r.right) <= 1 && menuEl().parentElement === document.body,
      `member ${b.role}, buttons ${buttons.length}, label "${a.button.label}", items ${names}; menu ${mr ? `${mr.left.toFixed(0)},${mr.top.toFixed(0)}–${mr.right.toFixed(0)}` : "none"}, button bottom ${r.bottom.toFixed(0)}, right ${r.right.toFixed(0)}`);

    const steps = [];
    const step = (label, ok) => steps.push(`${label}${ok ? "" : " ✗"}`);
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    step("outside pointerdown closes", !shown());
    anchor.focus();
    clickAt(anchor, true);
    const items = menuItems();
    step("keyboard open focuses the first item", shown() && document.activeElement === items[0]);
    key(document.activeElement, "ArrowDown");
    step("↓", document.activeElement === items[1]);
    key(document.activeElement, "ArrowDown");
    step("↓ wraps", document.activeElement === items[0]);
    key(document.activeElement, "ArrowUp");
    step("↑ wraps", document.activeElement === items[1]);
    key(document.activeElement, "Home");
    step("Home", document.activeElement === items[0]);
    key(document.activeElement, "End");
    step("End", document.activeElement === items[1]);
    key(document.activeElement, "Escape");
    step("Escape closes and refocuses the button", !shown() && document.activeElement === anchor);
    clickAt(anchor, true);
    key(document.activeElement, "Tab");
    step("Tab closes", !shown());
    clickAt(anchor);
    window.dispatchEvent(new Event("blur"));
    step("window blur closes", !shown());
    clickAt(anchor);
    window.dispatchEvent(new Event("resize"));
    step("resize closes", !shown());
    clickAt(anchor);
    clickAt(anchor);
    step("a second click on the button closes", !shown());
    check(34, "Menu keyboard and closing: first item focused from the keyboard, ↑/↓ wrap, Home/End, Escape, Tab, outside pointerdown, blur, resize",
      !steps.some((x) => x.endsWith("✗")), steps.join("; "));

    opened.length = 0;
    clickAt(anchor);
    const second = menuItems()[1];
    second.click();
    const hiddenFirst = !shown() && !opened.length && second.isConnected;
    await tick();
    const thenOpened = opened.join();
    anchor.focus();
    clickAt(anchor, true);
    key(document.activeElement, "Enter");
    const enterHidden = !shown() && opened.length === 1;
    await tick();
    check(34, "Activating an item hides the menu first, then opens that entry in the next task (click and Enter)",
      hiddenFirst && thenOpened === "gpb" && enterHidden && opened.join() === "gpb,gcb",
      `hidden first ${hiddenFirst}, then opened ${thenOpened}; Enter: hidden first ${enterHidden}, opened ${opened.join()}`);

    window[OTHER_KEY] = { protocol: 2, entries: [] };
    c = joinGradientBars({ self: entry("gcb", "Gradient Connect Bar"), key: OTHER_KEY, prefix: `${PREFIX}-other`, createButton: fakeButton });
    c.ensureButton();
    opened.length = 0;
    clickAt(c.button.element);
    check(34, "Another protocol: own button path, its own label, opens directly, the foreign registry untouched",
      c.role === "own button (protocol 2)" && !c.registry && c.button?.label === "Gradient Connect Bar" && opened.join() === "gcb" &&
        JSON.stringify(window[OTHER_KEY]) === JSON.stringify({ protocol: 2, entries: [] }) && c.status().role === "own button (protocol 2)",
      `role ${c.role}, label "${c.button?.label}", opened ${opened.join()}, registry ${JSON.stringify(window[OTHER_KEY])}`);
  } catch (e) {
    check(34, "Protocol test instance ran", false, e?.stack || e);
  } finally {
    a?.dispose();
    b?.dispose();
    c?.dispose();
    delete window[KEY];
    delete window[OTHER_KEY];
    for (const fake of buttons) fake.element.remove();
  }
  check(34, "The live registry is untouched by the test instance; nothing of the test instance is left",
    window.__gradientBars === liveBefore && window.__gradientBars?.entries.map((e) => e.id).join() === liveEntries &&
      !(KEY in window) && !(OTHER_KEY in window) && !document.querySelector(`[id^="${PREFIX}"], [class^="${PREFIX}"]`),
    `live entries ${window.__gradientBars?.entries.map((e) => e.id).join() ?? "none"}`);
}

// #14: remote playback can stop mid-run, and the Connect bar goes with it. Checks that need the
// bar re-check it before they start and record their result through barChecker(): once the bar
// the run started with is gone, the result is skipped (BAR_GONE) instead of failed.
export const BAR_GONE = "Connect bar gone mid-run";
const barStillThere = (bar) => !!bar?.isConnected && findBar() === bar;
export const barChecker = (check, skip, present) => (issue, name, pass, detail) =>
  present() ? check(issue, name, pass, detail) : skip(issue, name, BAR_GONE);

// Simulates the bar disappearing mid-run (#14), with its own results.
export function checkBarGone(check) {
  const sim = createResults();
  let present = true;
  const barCheck = barChecker(sim.check, sim.skip, () => present);
  barCheck(3, "before", false, "a real failure");
  present = false; // the bar disappears
  barCheck(3, "after, failing", false, "bar  , icon 0×0");
  barCheck(3, "after, passing", true);
  const [before, failing, passing] = sim.results;
  const detached = document.createElement("div");
  check("gradient-bars#14", "Bar gone mid-run: later bar checks are skipped (\"Connect bar gone mid-run\"), not failed; earlier results stay",
    before.pass === false && [failing, passing].every((r) => r.pass === null && r.skipped === BAR_GONE) &&
      summarise(sim.results) === "0/1 passed, 2 skipped, 1 FAILED" && !barStillThere(detached) && !barStillThere(null) &&
      (!findBar() || barStillThere(findBar())),
    `${summarise(sim.results)}; detached element counts as gone ${!barStillThere(detached)}`);
}

export async function runChecks(check, skip, rootStyle, restoreButton) {
  // ── Selector (GCB #3) ──
  const scoped = document.querySelectorAll(SELECTOR).length;
  const unscoped = document.querySelectorAll(UNSCOPED).length;
  const counts = `scoped ${scoped}, without the "${PARENT} >" prefix ${unscoped}`;
  if (scoped > 1 || unscoped > 1) check(3, "Selector matches at most one element", false, `${counts}: more than one match`);
  else if (!scoped && unscoped) check(3, "Selector finds the bar inside the now-playing aside", false, `${counts}: parent changed`);
  else if (!scoped) skip(3, "Selector finds exactly one bar");
  else check(3, "Selector finds exactly one bar", true, counts);
  const bar = scoped === 1 ? findBar() : null;
  const barCheck = barChecker(check, skip, () => barStillThere(bar)); // #14
  const gone = () => bar && !barStillThere(bar);

  // ── Gradient builder (GCB #3, GCB #4) ──
  const css = (gradient, stops, text = null) => buildCss({ version: SCHEMA_VERSION, gradient, textColour: DEFAULT_TEXT, stops }, text);
  const image = (gradient, stops) => barImage({ version: SCHEMA_VERSION, gradient, textColour: DEFAULT_TEXT, stops });
  const eight = ["#ff0000", "#ff8000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#8000ff", "#ff00ff"];
  const builds = {
    "1 stop (solid)": [image(false, [custom("s1", RED)]), `linear-gradient(to right, ${RED}, ${RED})`],
    "2 stops": [image(true, [custom("s1", RED), custom("s2", BLUE)]), `linear-gradient(to right, ${RED}, ${BLUE})`],
    "8 stops": [image(true, eight.map((c, i) => custom(`s${i + 1}`, c))), `linear-gradient(to right, ${eight.join(", ")})`],
    "theme stops": [image(true, [theme("s1"), custom("s2", RED), theme("s3")]), `linear-gradient(to right, ${THEME_COLOUR}, ${RED}, ${THEME_COLOUR})`],
    "gradient off, 3 stops → the first only": [image(false, [custom("s1", RED), custom("s2", GREEN), custom("s3", BLUE)]), `linear-gradient(to right, ${RED}, ${RED})`],
  };
  const wrongBuilds = Object.entries(builds).filter(([, [got, want]]) => got !== want);
  check(3, "Gradient builder: 1, 2 and 8 stops, theme stops, gradient off", !wrongBuilds.length,
    wrongBuilds.map(([label, [got, want]]) => `${label}: ${got} (expected ${want})`).join("; ") || `${Object.keys(builds).length} cases`);
  const inertCases = { default: buildCss(defaultSettings()), "solid theme with more stops": css(false, [theme("s1"), custom("s2", RED)]) };
  check(3, "A solid theme colour leaves the background alone (no rule without a text colour)",
    Object.values(inertCases).every((c) => c === ""), Object.entries(inertCases).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("; "));
  const themeCss = css(true, [theme("s1"), theme("s2")]);
  check(4, "Theme stop emits var(--spice-button …), never a resolved hex",
    themeCss.includes(THEME_COLOUR) && !/#[0-9a-f]{3,8}\b/i.test(themeCss.replaceAll(THEME_COLOUR, "")), themeCss.replace(/\s+/g, " "));
  check(6, "No Spread modes and no progress-bar code: the gradient spans the full width",
    !/background-(size|position|repeat)|clip-path|transform|progress-bar/.test(css(true, [custom("s1", RED), custom("s2", BLUE)])) &&
      !("mode" in defaultSettings()),
    css(true, [custom("s1", RED), custom("s2", BLUE)]).replace(/\s+/g, " "));

  // ── Injected CSS (GCB #3) ──
  const samples = [
    [false, [custom("s1", RED)]],
    [true, [theme("s1"), custom("s2", RED), custom("s3", GREEN)], WHITE],
    [true, eight.map((c, i) => custom(`s${i + 1}`, c)), BLACK],
    [false, [theme("s1")], WHITE], // inert background, text colour only
  ];
  const lint = samples.flatMap(([gradient, stops, text]) => cssProblems(css(gradient, stops, text)));
  check(3, "CSS: one rule on SELECTOR, no !important, no hash-like class names, never --background-base", !lint.length,
    lint.join("; ") || `${samples.length} samples clean`);
  const parse = samples.flatMap(([gradient, stops, text]) => parseProblems(css(gradient, stops, text)));
  check(3, "CSS parses: every rule and declaration survives the browser's parser", !parse.length,
    parse.join("; ") || `${samples.length} samples parsed`);
  // Opaque only: the generated CSS for every sample and every text colour mode, live included.
  const opaqueCases = [...samples, [true, [theme("s1"), custom("s2", RED)]], [false, [custom("s1", BLUE)]]];
  const translucent = [];
  for (const [gradient, stops] of opaqueCases)
    for (const mode of TEXT_MODES) {
      setTestSettings(gradient, stops, mode);
      for (const found of opacityIn(styleText() + css(gradient, stops, appliedTextColour()))) translucent.push(`${mode}: ${found}`);
    }
  check(4, "Generated CSS contains no rgba(, no transparent and no 8-digit hex (every sample, every text colour mode)",
    !translucent.length, translucent.join("; ") || `${opaqueCases.length * TEXT_MODES.length} stylesheets`);
  const flagged = {
    "!important": cssProblems(`${SELECTOR} {\n  background-image: none !important;\n}\n`),
    "a hashed class": cssProblems(`${SELECTOR}${HASHED_SAMPLE} {\n  background-image: none;\n}\n`),
    "--background-base": cssProblems(`${SELECTOR} {\n  --background-base: red;\n}\n`),
    "a global rule": cssProblems(`:root {\n  background-image: none;\n}\n`),
    "a global --text-base": cssProblems(`:root {\n  --text-base: #ffffff;\n}\n`),
    "transparent": cssProblems(`${SELECTOR} {\n  background-image: linear-gradient(to right, transparent, red);\n}\n`),
    "rgba(": cssProblems(`${SELECTOR} {\n  background-image: linear-gradient(to right, rgba(0, 0, 0, .5), red);\n}\n`),
    "an 8-digit hex": cssProblems(`${SELECTOR} {\n  background-image: linear-gradient(to right, #ff000080, red);\n}\n`),
  };
  const missed = Object.entries(flagged).filter(([, found]) => !found.length).map(([label]) => label);
  check(3, "The CSS lint itself flags !important, a hashed class, --background-base, rules elsewhere (a global --text-base too) and translucent colours", !missed.length,
    missed.length ? `not flagged: ${missed.join(", ")}` : Object.values(flagged).map((p) => p.join("/")).join("; "));
  const modalHashes = [...modalCss().matchAll(/([^{}]+)\{/g)].flatMap(([, sel]) => hashLike(sel));
  check(3, "Settings CSS: no hash-like class names, no !important, no --spice-rgb-button (Hazy leaves it stale)",
    !modalHashes.length && !/!important/.test(modalCss()) && !modalCss().includes("--spice-rgb-button"),
    modalHashes.join(", ") || "clean");

  // ── The live bar (GCB #3, GCB #4) ──
  const barChecks = [
    "Bar's computed background-image = the generated gradient",
    "Bar's background-color (--background-base), size and radius untouched by our rules",
    "No inline style added to the bar",
    "Theme stop on the live bar follows a runtime --spice-button change, no JS",
  ];
  if (!bar) barChecks.forEach((name) => skip(3, name));
  else if (gone()) barChecks.forEach((name) => skip(3, name, BAR_GONE));
  else {
    const styleBefore = bar.getAttribute("style");
    const gradients = [
      [true, [custom("s1", RED), custom("s2", GREEN), custom("s3", BLUE)]],
      [true, [theme("s1"), custom("s2", GREEN), custom("s3", RED)]],
      [false, [custom("s1", BLUE)]],
    ];
    const mismatches = [];
    for (const [gradient, stops] of gradients) {
      setTestSettings(gradient, stops);
      const got = getComputedStyle(bar).backgroundImage;
      const want = computedImage(image(gradient, stops));
      if (got !== want) mismatches.push(`${got} (expected ${want})`);
    }
    barCheck(3, barChecks[0], !mismatches.length, mismatches.join("; ") || `${gradients.length} gradients`);
    const geometry = barWithAndWithout(bar, barGeometry);
    barCheck(3, barChecks[1], geometry.ours === geometry.spotify, `ours ${geometry.ours}; Spotify's ${geometry.spotify}`);
    barCheck(3, barChecks[2], bar.getAttribute("style") === styleBefore, `style="${bar.getAttribute("style") ?? ""}"`);
    setTestSettings(true, [theme("s1"), theme("s2")]);
    rootStyle.setProperty("--spice-button", PROBE, "important");
    const followed = getComputedStyle(bar).backgroundImage;
    restoreButton();
    barCheck(4, barChecks[3], followed.includes("rgb(18, 52, 86)"), followed);
  }

  // ── Right-click (GCB #5) ──
  setSettings(defaultSettings());
  update();
  const closeIfOpen = () => {
    if (!modal) return;
    Spicetify.PopupModal.hide();
    closeModal(modal);
  };
  const contextMenu = (el) => el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
  // Not the song progress bar: that's Gradient Progress Bar's right-click, and would open its settings.
  const elsewhere = [document.body, document.querySelector(PARENT)].filter(Boolean);
  const openedElsewhere = elsewhere.filter((el) => {
    contextMenu(el);
    const opened = !!modal;
    closeIfOpen();
    return opened;
  });
  check(5, "Right-click elsewhere (the page, the now-playing aside around the bar) doesn't open the settings",
    !openedElsewhere.length, `${elsewhere.length} targets${openedElsewhere.length ? `, opened on ${openedElsewhere.map((el) => el.tagName.toLowerCase()).join(", ")}` : ""}`);
  if (!bar) skip(5, "Right-click on the bar opens the settings and suppresses Spotify's menu");
  else if (gone()) skip(5, "Right-click on the bar opens the settings and suppresses Spotify's menu", BAR_GONE);
  else {
    const target = bar.querySelector(BAR_LINK)?.querySelector("span") ?? bar;
    const kept = contextMenu(target);
    const opened = !!modal?.root.isConnected;
    closeIfOpen();
    barCheck(5, "Right-click on the bar opens the settings and suppresses Spotify's menu", opened && !kept,
      `opened ${opened}, default prevented ${!kept}`);
  }

  // ── Gradient Progress Bar alongside ──
  if (!window.__gpb) skip(4, "Gradient Progress Bar alongside: separate stylesheets, no overlap", "Gradient Progress Bar isn't running");
  else {
    setTestSettings(true, [custom("s1", RED), custom("s2", BLUE)]);
    const gpbStyle = document.getElementById("gpb-style");
    const ours = document.getElementById("gcb-style");
    const gpbRules = [...(gpbStyle?.sheet?.cssRules ?? [])].filter((r) => r.selectorText);
    const gpbTargets = [...new Set(gpbRules.flatMap((r) => [...document.querySelectorAll(r.selectorText)]))];
    const songBar = document.querySelector('[data-testid="playback-progressbar"]');
    const ourTargets = [...document.querySelectorAll(SELECTOR)];
    const touches = (a, b) => a === b || a.contains(b) || b.contains(a);
    const overlaps = ourTargets.filter((el) => gpbTargets.some((t) => touches(el, t)) || (songBar && touches(el, songBar)));
    const gpbOnOurs = gpbRules.filter((r) => ourTargets.some((el) => el.matches(r.selectorText)));
    check(4, "Gradient Progress Bar alongside: both stylesheets present, neither rule matches the other's target",
      !!gpbStyle && !!ours && gpbStyle !== ours && !overlaps.length && !gpbOnOurs.length &&
        !(songBar && songBar.matches(SELECTOR)) && !gpbRules.some((r) => r.selectorText === SELECTOR),
      `#gpb-style ${!!gpbStyle} (${gpbRules.length} rules, ${gpbTargets.length} targets), #gcb-style ${!!ours} (${ourTargets.length} targets); ` +
        `overlaps ${overlaps.length}, GPB rules on our bar ${gpbOnOurs.length}; GPB ${window.__gpb.version}`);
  }

  // ── Text colour: contrast unit tests (GCB #13) ──
  const about = (value, want, tolerance) => Math.abs(value - want) <= tolerance;
  const pairs = [[BLACK, WHITE, 21], ["#767676", WHITE, 4.54], ["#777777", WHITE, 4.48], [RED, WHITE, 4.0], [BLUE, WHITE, 8.59], ["#8372fd", BLACK, 5.79]];
  const wrongPairs = pairs.filter(([a, b, want]) => !about(contrast(hexToRgb(a), hexToRgb(b)), want, 0.01));
  check(13, "WCAG contrast of known pairs (21, 4.54, 4.48, 4.0, 8.59, 5.79 for #8372fd on black)", !wrongPairs.length,
    pairs.map(([a, b]) => `${a}/${b} ${contrast(hexToRgb(a), hexToRgb(b)).toFixed(3)}`).join(", "));
  // Pure runs with a fixed theme and bar colour (Hazy's custom GCB #8372fd), independent of the live theme.
  const hazy = { theme: hexToRgb("#8372fd"), base: hexToRgb("#8372fd") };
  const stopsOf = (colours) => colours.map((c, i) => (c === "theme" ? theme(`s${i + 1}`) : custom(`s${i + 1}`, c)));
  const pickFor = (colours, region, ctx = hazy) =>
    pickTextColour(gradientSamples({ version: SCHEMA_VERSION, gradient: colours.length > 1, textColour: "auto", stops: stopsOf(colours) }, region, ctx));
  const whole = { from: 0, to: 1 };
  const right = { from: 0.8, to: 1 };
  const fmt = (p) => `${p.colour} (black ${p.black.toFixed(2)}, white ${p.white.toFixed(2)})`;
  const solidHazy = pickFor(["#8372fd"], whole);
  const inertHazy = pickFor(["theme"], whole);
  check(13, "#8372fd → black, ≈ 5.8:1 (as a colour and as Hazy's own bar colour behind a solid theme stop)",
    solidHazy.colour === BLACK && about(solidHazy.black, 5.79, 0.01) && inertHazy.colour === BLACK && about(inertHazy.black, 5.79, 0.01),
    `${fmt(solidHazy)}; inert ${fmt(inertHazy)}`);
  const darkToLight = pickFor([BLACK, WHITE], right);
  const lightToDark = pickFor([WHITE, BLACK], right);
  check(13, "Dark-left / light-right gradient, text at the right → black; the reverse → white",
    darkToLight.colour === BLACK && lightToDark.colour === WHITE, `${fmt(darkToLight)}; reverse ${fmt(lightToDark)}`);
  const lightWithDark = [WHITE, "#fff8e1", WHITE, "#1a1a1a", WHITE];
  const darkStopRegion = { from: 0.55, to: 0.95 };
  const worstCase = pickFor(lightWithDark, darkStopRegion);
  const darkSamples = gradientSamples({ version: SCHEMA_VERSION, gradient: true, textColour: "auto", stops: stopsOf(lightWithDark) }, darkStopRegion, hazy);
  const meanLuminance = darkSamples.reduce((sum, sample) => sum + luminance(sample.rgb), 0) / darkSamples.length;
  const byAverage = (meanLuminance + 0.05) / 0.05 > 1.05 / (meanLuminance + 0.05) ? "black" : "white";
  check(13, "A light gradient with a dark stop inside the text region → white (the worst case, not an average)",
    worstCase.colour === WHITE && byAverage === "black",
    `${fmt(worstCase)}; an average luminance (${meanLuminance.toFixed(3)}) would have picked ${byAverage}`);
  const counted = gradientSamples({ version: SCHEMA_VERSION, gradient: true, textColour: "auto", stops: stopsOf([RED, GREEN, BLUE, WHITE, BLACK]) }, { from: 0.2, to: 0.8 }, hazy);
  const atStops = counted.filter((sample) => [0.25, 0.5, 0.75].includes(sample.t)).map((sample) => rgbToHex(sample.rgb.map(Math.round)));
  const midway = gradientSamples({ version: SCHEMA_VERSION, gradient: true, textColour: "auto", stops: stopsOf([BLACK, WHITE]) }, { from: 0.5, to: 0.5 }, hazy);
  check(13, "Samples: both edges + every stop inside + 8 in between; at a stop the sample is the stop's own colour, between stops plain sRGB interpolation",
    counted.length === 2 + 3 + SAMPLES_BETWEEN && counted[0].t === 0.2 && counted[counted.length - 1].t === 0.8 &&
      atStops.join() === [GREEN, BLUE, WHITE].join() && midway.every((sample) => sample.rgb.every((v) => about(v, 127.5, 0.01))),
    `${counted.length} samples at ${counted.map((sample) => sample.t.toFixed(2)).join(", ")}; at the stops ${atStops.join(", ")}; black→white at 50 %: ${midway[0].rgb.map((v) => v.toFixed(1)).join(", ")}`);
  rootStyle.setProperty("--spice-button", PROBE, "important");
  const liveTheme = textContext().theme;
  restoreButton();
  check(13, "Theme stops are resolved from getComputedStyle(document.documentElement) at the time of the calculation",
    rgbToHex(liveTheme) === PROBE, `${rgbToHex(liveTheme)} with --spice-button ${PROBE}`);
  const hopeless = pickFor([BLACK, WHITE], whole);
  check(13, "Both contrasts low (black → white across the text) → still the better one (tie: black), and no warning",
    hopeless.colour === BLACK && Object.keys(hopeless).join() === "colour,black,white", `${fmt(hopeless)}; keys ${Object.keys(hopeless).join()}`);

  // ── Text colour on the live bar (GCB #12, GCB #14) ──
  const textChecks = [
    "Text region measured from the icon's left edge to the text's right edge, at the right-hand end",
    "Auto / Black / White: the text span's and the icon's computed colours equal the chosen colour",
    "Spotify default leaves the text and icon colours unchanged and writes no --text-base",
  ];
  if (!bar) {
    textChecks.forEach((name) => skip(textChecks.indexOf(name) ? 14 : 12, name));
    const keptRegion = textRegion;
    try {
      setTextRegion({ from: 0.9, to: 0.95 });
      const kept = recalcTextColour();
      setTextRegion(null);
      const unseen = recalcTextColour();
      check(15, "Without the bar the last region is kept; before it has ever been seen, the whole width counts",
        kept.region.from === 0.9 && kept.region.to === 0.95 && kept.measured && !kept.barPresent &&
          unseen.region.from === 0 && unseen.region.to === 1 && !unseen.measured,
        `kept ${JSON.stringify(kept.region)}, never seen ${JSON.stringify(unseen.region)}`);
    } finally {
      setTextRegion(keptRegion);
      recalcTextColour();
    }
  } else if (gone()) textChecks.forEach((name) => skip(textChecks.indexOf(name) ? 14 : 12, name, BAR_GONE));
  else {
    const link = bar.querySelector(BAR_LINK);
    const span = link?.querySelector("span") ?? link;
    const icon = bar.querySelector(BAR_ICON);
    setTestSettings(false, [custom("s1", "#8372fd")]);
    const r = textResult.region;
    const box = bar.getBoundingClientRect();
    const width = bar.clientWidth || box.width;
    const left = box.left + bar.clientLeft;
    const iconFrom = (icon.getBoundingClientRect().left - left) / width;
    const linkTo = (link.getBoundingClientRect().right - left) / width;
    barCheck(12, textChecks[0],
      textResult.measured && about(r.from, iconFrom, 0.001) && about(r.to, linkTo, 0.001) && r.from < r.to && r.from > 0.5 && r.to <= 1,
      `${r.from.toFixed(3)}–${r.to.toFixed(3)} of ${width} px (icon ${iconFrom.toFixed(3)}, text ends ${linkTo.toFixed(3)})`);
    const shown = () => ({ text: computedHex(span, "color"), icon: toHex(getComputedStyle(icon).fill) });
    const cases = [["auto", "#202020", WHITE], ["auto", "#8372fd", BLACK], ["black", "#202020", BLACK], ["white", "#8372fd", WHITE]];
    const wrongText = cases.filter(([mode, colour, want]) => {
      setTestSettings(false, [custom("s1", colour)], mode);
      const got = shown();
      return got.text !== want || got.icon !== want || appliedTextColour() !== want;
    }).map(([mode, colour, want]) => `${mode} on ${colour}: expected ${want}`);
    const last = shown();
    barCheck(14, textChecks[1], !wrongText.length, wrongText.join("; ") || `${cases.length} cases; last: text ${last.text}, icon ${last.icon}`);
    setTestSettings(true, [custom("s1", "#202020"), custom("s2", "#303030")], "default");
    const spotify = barWithAndWithout(bar, () => JSON.stringify(shown()));
    barCheck(14, textChecks[2], spotify.ours === spotify.spotify && !styleText().includes("--text-base") && appliedTextColour() === null,
      `ours ${spotify.ours}, Spotify's ${spotify.spotify}`);
  }

  // ── Recalculation triggers (GCB #15) ──
  const runsAfter = async (action) => {
    const before = textRuns;
    await action();
    await sleep(TEXT_DELAY + 60);
    return textRuns - before;
  };
  setTestSettings(true, [custom("s1", RED), custom("s2", BLUE)]);
  const onSettings = await runsAfter(() => {
    settings.stops[0].color = GREEN;
    update({ rerender: false });
    settings.stops[0].color = RED;
    update({ rerender: false });
  });
  const onResize = await runsAfter(() => window.dispatchEvent(new Event("resize")));
  const customSong = await runsAfter(() => onThemeChange());
  setTestSettings(true, [theme("s1"), custom("s2", BLUE)]);
  const themeSong = await runsAfter(() => onThemeChange());
  const themeRoot = await runsAfter(async () => {
    rootStyle.setProperty("--spice-button", PROBE, "important");
    await tick();
  });
  const followedProbe = textResult.black === pickTextColour(gradientSamples(settings, textResult.region, textContext())).black;
  restoreButton();
  await sleep(TEXT_DELAY + 60);
  const registered = Spicetify.Player.eventListeners?.songchange;
  const aside = document.querySelector(PARENT);
  check(15, "Debounced recalculation on settings changes (two quick edits → one run) and on window resize",
    onSettings === 1 && onResize === 1, `settings ${onSettings} run(s), resize ${onResize}`);
  check(15, "Song and :root colour changes recalculate only while a theme-colour stop is used",
    customSong === 0 && themeSong === 1 && themeRoot >= 1 && followedProbe && (!registered || registered.includes(onThemeChange)),
    `custom only ${customSong}, theme stop ${themeSong}, :root change ${themeRoot}; songchange listener ${registered ? (registered.includes(onThemeChange) ? "registered" : "MISSING") : "not inspectable"}`);
  check(15, "The now-playing aside is watched for the bar appearing", !aside || (watchedAside === aside && !!asideObserver),
    aside ? `watching ${watchedAside === aside ? "the current aside" : "a stale aside"}` : "no aside on the page; waiting for it");

  // ── status() (GCB #17) ──
  const st = window.__gcb.status().textColour;
  const statusKeys = ["mode", "colour", "contrast", "region", "barPresent"];
  check(17, "status() reports the text colour as plain values: mode, chosen colour, worst-case contrast, region fractions, bar present; no warning",
    !!st && statusKeys.every((key) => key in st) && !("warning" in st) && st.mode === settings.textColour && st.colour === textResult.colour &&
      typeof st.contrast === "number" && typeof st.region?.from === "number" && st.barPresent === !!bar,
    JSON.stringify(st));

  // ── Modal (GCB #5, GCB #7) ──
  setSettings(defaultSettings());
  update();
  const listenersBefore = songchangeCount();
  window.__gcb.openSettings();
  let m = modal;
  check(5, "Settings open with __gcb.openSettings()", m?.root.isConnected, "");
  if (!m) return;
  // Records whether the modal survived an action; reopens it so later checks still run.
  const stillOpen = (after) => {
    const open = m.root.isConnected && modal === m;
    check(5, `Settings still open after ${after}`, open, open ? "" : "modal closed itself");
    if (!open) {
      if (modal) closeModal(modal);
      openModal();
      m = modal;
    }
  };

  const dots = () => [...m.stopsRow.querySelectorAll(".gcb-stop")];
  const ringed = () => dots().filter((el) => el.classList.contains("gcb-selected"));
  // Exactly one ring, on `id`'s dot, and the picker (hex and R/G/B) shows that stop's colour.
  const selectionIs = (id) => {
    const stop = findStop(id);
    const hex = stop && resolveStop(stop);
    return !!stop && selectedId === id && ringed().length === 1 && ringed()[0].dataset.id === id &&
      m.hex.value === hex && m.rgb.map((f) => f.value).join() === hexToRgb(hex).join();
  };
  const selection = () =>
    `selected ${selectedId}, ring on ${ringed().map((el) => el.dataset.id).join() || "none"}, hex "${m.hex.value}", ` +
    `stops ${settings.stops.map((s) => s.id).join()}`;
  const click = (el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));

  check(5, "On open the first dot is selected and the picker shows its colour",
    selectionIs(settings.stops[0].id) && m.hex.value !== "", selection());
  // ── Gradient switch with one colour: it adds a second colour instead of being disabled ──
  const switchNode = m.switchButton;
  const switchState = () =>
    `${settings.stops.map((s) => `${s.id}:${s.kind}${s.color ? ` ${s.color}` : ""}`).join(", ")}; gradient ${settings.gradient}, ` +
    `aria-checked ${switchNode.getAttribute("aria-checked")}, disabled ${switchNode.disabled}, focus .${document.activeElement?.className}`;
  check(5, "One stop → switch enabled and off",
    settings.stops.length === 1 && !switchNode.disabled && switchNode.getAttribute("aria-checked") === "false" && !settings.gradient,
    switchState());
  const onlyStop = { ...settings.stops[0] };
  switchNode.focus();
  click(switchNode);
  await sleep(20);
  check(5, "Switch on with one colour → a copy of it after it (theme stays theme), gradient on, the new dot selected, focus on the switch",
    settings.stops.length === 2 && settings.gradient && settings.stops[0].id === onlyStop.id &&
      settings.stops[1].kind === onlyStop.kind && selectionIs(settings.stops[1].id) &&
      document.activeElement === switchNode && m.switchButton === switchNode && switchNode.getAttribute("aria-checked") === "true",
    `${switchState()}; ${selection()}`);
  stillOpen("switching the gradient on with one colour");
  click(m.switchButton);
  check(5, "Switch off → both stops kept, colour 2 dimmed",
    settings.stops.length === 2 && !settings.gradient && dots()[1]?.classList.contains("gcb-unused"), switchState());
  click(m.switchButton);

  const foreign = [m.root, ...m.root.querySelectorAll("*")].filter(
    (el) => (el.id && !el.id.startsWith("gcb-")) || [...el.classList].some((c) => !c.startsWith("gcb-"))
  );
  check(5, "Every id and class in the settings starts with gcb-", !foreign.length,
    foreign.map((el) => `${el.tagName.toLowerCase()}#${el.id}.${[...el.classList].join(".")}`).join(", ") || "all prefixed");
  const hazyHooks = m.root.querySelectorAll("#color-input, .slider, .toggle, .toggleWrapper, select");
  check(5, "Settings use none of Hazy's global hooks (#color-input, .slider, .toggle, .toggleWrapper, select)",
    !hazyHooks.length, `${hazyHooks.length} found`);
  const ownBar = [...document.querySelectorAll(`${SELECTOR}, ${UNSCOPED}`)].filter((el) => m.root.contains(el));
  check(7, "The preview strip never matches the bar's selector", !ownBar.length, `${ownBar.length} matches inside the settings`);
  const help = m.help;
  const helpLines = help.innerHTML.split(/<br\s*\/?>/).map((line) => line.trim());
  check(5, "Help text is the last element, after the action row, in its lines in order",
    helpLines.length === HELP_LINES.length && helpLines.every((line, i) => line === HELP_LINES[i]) &&
      m.root.lastElementChild === help && m.actions.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING,
    `last child .${m.root.lastElementChild?.className}, text "${help.innerText ?? help.textContent}"`);
  check(5, "Picker is an inline panel between the dots and the Reset row, not a popover",
    m.picker.parentElement === m.root && m.picker.previousElementSibling === m.dotsLine &&
      m.picker.nextElementSibling === m.actions && !m.picker.hidden && getComputedStyle(m.picker).position === "static",
    `after .${m.picker.previousElementSibling?.className}, before .${m.picker.nextElementSibling?.className}`);
  const tabOrder = [...m.dotsLine.querySelectorAll("button")].filter((el) => el.tabIndex >= 0);
  const tabNames = tabOrder.map((el) => (el.classList.contains("gcb-stop") ? "dot" : el === m.minusButton ? "−" : el === m.plusButton ? "+" : el.className));
  check(5, "−|+ stepper: a group 'Colours' right after the dots, − then +, labelled, not draggable; tab order dots, −, +",
    m.stepper?.getAttribute("role") === "group" && m.stepper.getAttribute("aria-label") === "Colours" &&
      !m.stopsRow.contains(m.stepper) && m.stopsRow.nextElementSibling === m.stepper &&
      [...m.stepper.querySelectorAll("button")].every((b, i) => b === [m.minusButton, m.plusButton][i] && !b.draggable) &&
      m.minusButton.getAttribute("aria-label") === REMOVE_LABEL && m.plusButton.getAttribute("aria-label") === ADD_LABEL &&
      tabNames.join() === [...dots().map(() => "dot"), "−", "+"].join(),
    `tab order ${tabNames.join(", ")}`);

  // ── Dot menu ──
  const menuShown = () => !m.menu.hidden && popover?.el === m.menu && m.root.contains(m.menu);
  const rightClick = (el) => {
    const r = el.getBoundingClientRect();
    const at = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: at.x, clientY: at.y }));
    return at;
  };
  const press = (el, key, init = {}) =>
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  // Scrolled into view (not for the fixed menu), the element's centre hit-tests to the element
  // or a descendant: visible, not clipped or covered.
  const reachable = (el, scroll = true) => {
    if (scroll) el.scrollIntoView({ block: "nearest", behavior: "instant" });
    const r = el.getBoundingClientRect();
    return r.width > 0 && el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  };

  await sleep(350); // let the modal's opening animation settle before measuring positions
  const titleBar = [...(m.root.closest(".GenericModal") ?? document.body).querySelectorAll("*")].find(
    (el) => !el.contains(m.root) && !m.root.contains(el) && el.textContent.trim() === TITLE
  );
  const titleGap = titleBar ? m.gradientRow.getBoundingClientRect().top - titleBar.getBoundingClientRect().bottom : NaN;
  const helpGap = help.getBoundingClientRect().top - m.actions.getBoundingClientRect().bottom;
  check(5, "Spacing: title bar → Gradient row and action row → help text are both ≥ 16 px", titleGap >= 16 && helpGap >= 16,
    `title gap ${titleBar ? `${Math.round(titleGap)} px` : "title bar not found"}, help gap ${Math.round(helpGap)} px`);
  const rowRect = m.actions.getBoundingClientRect();
  const resetRect = m.resetButton.getBoundingClientRect();
  const centreX = (r) => r.left + r.width / 2;
  const centreY = (r) => r.top + r.height / 2;
  check(5, "Reset alone in the action row, centred (±1 px)",
    m.actions.children.length === 1 && Math.abs(centreX(resetRect) - centreX(rowRect)) <= 1,
    `Reset's centre ${(centreX(resetRect) - centreX(rowRect)).toFixed(1)} px from the row's`);
  const lastDot = dots()[dots().length - 1];
  const dotRect = lastDot.getBoundingClientRect();
  const stepperRect = m.stepper.getBoundingClientRect();
  const stepperGap = stepperRect.left - dotRect.right;
  check(5, `Stepper right after the last dot on the same line (${STOP_GAP} px), a dot's height, both halves hit-test to themselves`,
    Math.abs(centreY(stepperRect) - centreY(dotRect)) <= 2 && Math.abs(stepperGap - STOP_GAP) <= 1 &&
      Math.abs(stepperRect.height - dotRect.height) <= 1 && reachable(m.minusButton, false) && reachable(m.plusButton, false),
    `gap ${stepperGap.toFixed(1)} px, stepper ${stepperRect.width.toFixed(1)}×${stepperRect.height.toFixed(1)}`);
  // ── Bottom margin: help text → the dialog's bottom edge ≈ our root → its left edge ──
  const dialog = m.root.closest(".GenericModal");
  const scroller = m.root.closest(".spicetify-popup-content");
  const scrollBefore = scroller?.scrollTop ?? 0;
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
  const bottomGap = dialog ? dialog.getBoundingClientRect().bottom - help.getBoundingClientRect().bottom : NaN;
  const sideGap = dialog ? m.root.getBoundingClientRect().left - dialog.getBoundingClientRect().left : NaN;
  if (scroller) scroller.scrollTop = scrollBefore;
  check(5, "Space below the help text matches the sides (≤ 4 px)", Math.abs(bottomGap - sideGap) <= 4,
    dialog ? `bottom ${bottomGap.toFixed(1)} px, side ${sideGap.toFixed(1)} px` : "dialog (.GenericModal) not found");

  const cursor = rightClick(dots()[1]);
  const mr = m.menu.getBoundingClientRect();
  const near = (a, b) => Math.abs(a - b) < 1.5;
  const atCursor = (near(mr.left, cursor.x) || near(mr.right, cursor.x)) && (near(mr.top, cursor.y) || near(mr.bottom, cursor.y));
  check(5, "Right-click on a dot opens the menu inside the settings, at the cursor, both items reachable",
    menuShown() && atCursor && reachable(m.duplicateItem, false) && reachable(m.removeItem, false),
    `shown ${menuShown()}, menu ${Math.round(mr.left)},${Math.round(mr.top)}, cursor ${Math.round(cursor.x)},${Math.round(cursor.y)}`);
  m.removeItem.click();
  await sleep(20);
  stillOpen("Remove in the dot menu");
  check(5, "Remove down to one stop → gradient off, switch off but enabled, menu closed, the remaining dot selected",
    settings.stops.length === 1 && !settings.gradient && m.switchButton.getAttribute("aria-checked") === "false" &&
      !m.switchButton.disabled && !menuShown() && selectionIs(settings.stops[0].id),
    `${settings.stops.length} stop(s), gradient ${settings.gradient}; ${selection()}`);
  rightClick(dots()[0]);
  check(5, "One stop → Remove disabled, Duplicate enabled", m.removeItem.disabled && !m.duplicateItem.disabled,
    `remove disabled ${m.removeItem.disabled}, duplicate disabled ${m.duplicateItem.disabled}`);
  m.duplicateItem.click();
  await sleep(20);
  stillOpen("Duplicate in the dot menu");
  check(5, "Duplicate from one stop → an identical copy after it, gradient on, the copy selected",
    settings.stops.length === 2 && settings.gradient && settings.stops[1].kind === settings.stops[0].kind && selectionIs(settings.stops[1].id),
    JSON.stringify(settings.stops));

  setTestSettings(true, [theme("s1"), custom("s2", RED)]);
  rightClick(dots()[0]);
  m.duplicateItem.click();
  await sleep(20);
  check(4, "Duplicating a theme stop inserts a theme stop directly after it",
    settings.stops.map((s) => `${s.id}:${s.kind}`).join() === "s1:theme,s3:theme,s2:custom",
    settings.stops.map((s) => `${s.id}:${s.kind}`).join());
  dots()[0].focus();
  press(dots()[0], "F10", { shiftKey: true });
  const firstFocused = menuShown() && document.activeElement === m.duplicateItem;
  press(document.activeElement, "ArrowDown");
  const secondFocused = document.activeElement === m.removeItem;
  press(document.activeElement, "Escape");
  check(5, "Keyboard: Shift+F10 opens the menu, arrows move, Escape closes and refocuses the dot",
    firstFocused && secondFocused && !menuShown() && document.activeElement === dots()[0],
    `first ${firstFocused}, arrow ${secondFocused}, closed ${!menuShown()}, focus ${document.activeElement?.className}`);
  stillOpen("Escape in the dot menu");

  const plusNode = m.plusButton;
  plusNode.focus();
  for (let i = 0; i < MAX_STOPS + 2 && !m.plusButton.disabled; i++) click(m.plusButton);
  await sleep(20);
  stillOpen("+ up to eight colours");
  check(5, "+ adds up to 8 stops, then is disabled ('Up to 8 colours') and focus moves to the selected dot",
    settings.stops.length === MAX_STOPS && m.plusButton.disabled && m.plusButton.title === ADD_FULL_LABEL &&
      m.plusButton === plusNode && document.activeElement === dotEl(selectedId),
    `${settings.stops.length} stops, disabled ${m.plusButton.disabled}, title "${m.plusButton.title}"`);
  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN), custom("s3", BLUE)]);
  selectStop("s2");
  m.minusButton.focus();
  click(m.minusButton);
  await sleep(20);
  check(5, "− removes the selected dot; the one now in its place is selected; focus stays on −",
    settings.stops.map((s) => s.id).join() === "s1,s3" && selectionIs("s3") && document.activeElement === m.minusButton, selection());
  stillOpen("−");

  // ── Colour picker and theme stops (GCB #4, GCB #5) ──
  const frame = () => new Promise((r) => (requestAnimationFrame(() => r()), setTimeout(r, 100)));
  const pointer = (el, type, fx, fy) => {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: "mouse", isPrimary: true,
      button: type === "pointermove" ? -1 : 0, buttons: type === "pointerup" ? 0 : 1,
      clientX: r.left + r.width * fx, clientY: r.top + r.height * fy,
    }));
  };
  setTestSettings(true, [theme("s1"), custom("s2", RED), custom("s3", BLUE)]);
  const themeDot = dots()[0];
  const rowBefore = dots();
  const inPlace = (hex) =>
    dots().every((el, i) => el === rowBefore[i] && el.isConnected) && computedHex(themeDot, "backgroundColor") === hex &&
    styleText().includes(hex) && selectedId === themeDot.dataset.id;
  const state = () => `${JSON.stringify(settings.stops[0])}, dot ${computedHex(themeDot, "backgroundColor")}, selected ${selectedId}`;
  selectStop("s2");
  click(themeDot);
  check(5, "Clicking the theme dot shows it in the picker; 'Following theme colour' disabled",
    selectionIs("s1") && m.useThemeButton.disabled && m.useThemeButton.textContent === THEME_LABELS.on, selection());
  const opacityControls = [...m.root.querySelectorAll("button, input")].filter((el) =>
    /transparen|opacity|alpha/i.test(`${el.className} ${el.textContent} ${el.title} ${el.getAttribute("aria-label") ?? ""}`));
  check(4, "No 'Make transparent' control (or any other transparency or opacity control) in the settings",
    !opacityControls.length && !m.root.querySelector(".gcb-use-transparent") && m.picker.querySelectorAll(".gcb-controls > .gcb-button").length === 1,
    opacityControls.map((el) => `${el.tagName.toLowerCase()}.${el.className} "${el.textContent}"`).join(", ") || "none");
  const sr = m.sv.getBoundingClientRect();
  const cr = m.picker.querySelector(".gcb-controls").getBoundingClientRect();
  check(5, `Picker columns side by side (needs ≥ ${PICKER_COLUMNS_MIN} px of content)`, cr.left >= sr.right && Math.abs(cr.top - sr.top) < 1,
    `content ${Math.round(m.picker.getBoundingClientRect().width)} px`);
  const pickerControls = {
    "SV square": m.sv, "hue slider": m.hue, R: m.rgb[0], G: m.rgb[1], B: m.rgb[2], "hex field": m.hex, "hex copy button": m.hexCopy,
    "theme button": m.useThemeButton, ...(m.eyedropper ? { eyedropper: m.eyedropper } : {}),
  };
  const unreachable = Object.entries(pickerControls).filter(([, el]) => !reachable(el)).map(([name]) => name);
  check(5, "Every picker control is reachable (scrolled into view, its centre hit-tests to it)", !unreachable.length,
    unreachable.length ? `not reachable: ${unreachable.join(", ")}` : `${Object.keys(pickerControls).length} controls`);
  rootStyle.setProperty("--spice-button", PROBE, "important");
  await tick(); // let the :root MutationObserver run
  const swatch = computedHex(themeDot, "backgroundColor");
  const pickerSeen = m.hex.value;
  restoreButton();
  await tick();
  check(4, "Theme dot and picker follow a runtime --spice-button change", swatch === PROBE && pickerSeen === PROBE,
    `dot ${swatch}, picker ${pickerSeen}`);

  pointer(m.sv, "pointerdown", 0.9, 0.1);
  pointer(m.sv, "pointermove", 0.5, 0.5);
  await frame();
  const svExpected = hsvToHex({ h: pickerHsv.h, s: 0.5, v: 0.5 });
  pointer(m.sv, "pointerup", 0.5, 0.5);
  check(5, "Dragging in the square: theme stop → custom, live, dot updated in place, bar CSS follows",
    settings.stops[0].kind === "custom" && settings.stops[0].color === svExpected && inPlace(svExpected),
    `expected ${svExpected}; ${state()}`);
  pointer(m.hue, "pointerdown", 1 / 3, 0.5);
  pointer(m.hue, "pointerup", 1 / 3, 0.5);
  check(5, "Dragging the hue bar to 120° → #408040 everywhere", settings.stops[0].color === "#408040" && inPlace("#408040") &&
    m.hex.value === "#408040" && m.rgb.map((f) => f.value).join() === "64,128,64", state());
  [10, 20, 30].forEach((n, i) => (m.rgb[i].value = String(n)));
  m.rgb[2].dispatchEvent(new Event("input", { bubbles: true }));
  check(5, "R/G/B fields 10/20/30 → #0a141e everywhere", settings.stops[0].color === "#0a141e" && inPlace("#0a141e"), state());
  const typeHex = (value) => {
    m.hex.value = value;
    m.hex.dispatchEvent(new Event("input", { bubbles: true }));
  };
  typeHex("ABCDEF");
  const afterPlain = settings.stops[0].color;
  typeHex("#0f0");
  check(5, "Hex field accepts rrggbb and #rgb, case-insensitive", afterPlain === "#abcdef" && settings.stops[0].color === "#00ff00" &&
    inPlace("#00ff00"), `${afterPlain}; ${state()}`);
  typeHex("#zz12");
  check(5, "Invalid hex is flagged and ignored", m.hex.getAttribute("aria-invalid") === "true" && settings.stops[0].color === "#00ff00",
    `aria-invalid ${m.hex.getAttribute("aria-invalid")}, colour ${settings.stops[0].color}`);
  m.hex.dispatchEvent(new Event("change", { bubbles: true }));
  stillOpen("editing the colour");

  check(5, "Custom stop → 'Use theme colour' enabled", !m.useThemeButton.disabled && m.useThemeButton.textContent === THEME_LABELS.off,
    m.useThemeButton.textContent);
  m.useThemeButton.focus();
  m.useThemeButton.click();
  await sleep(20);
  check(4, "'Use theme colour' → a theme stop, dot updated in place, button disabled, focus on the hex field; CSS has var(--spice-button …)",
    settings.stops[0].kind === "theme" && !("color" in settings.stops[0]) && dots()[0] === themeDot && m.useThemeButton.disabled &&
      m.useThemeButton.textContent === THEME_LABELS.on && document.activeElement === m.hex && styleText().includes(THEME_COLOUR),
    JSON.stringify(settings.stops[0]));
  stillOpen("'Use theme colour'");

  // ── Hex copy button ──
  {
    const realSources = { ...clipboardSources };
    let copied = null;
    try {
      clipboardSources.api = () => ({ copy: async (text) => (copied = text) });
      setTestSettings(true, [custom("s1", RED), custom("s2", GREEN), theme("s3")]);
      selectStop("s2");
      m.hexCopy.click();
      await sleep(20);
      const first = copied;
      selectStop("s3");
      m.hexCopy.click();
      await sleep(20);
      check(5, "Hex copy button copies the selected #rrggbb (a theme stop's: the resolved theme colour) and announces it",
        first === GREEN && copied === themeHex() && m.announce.textContent === "Hex code copied", `copied ${first}, then ${copied}`);
    } finally {
      Object.assign(clipboardSources, realSources);
    }
  }

  // ── Drag and keyboard reordering, Delete ──
  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN), custom("s3", BLUE)]);
  selectStop("s3");
  const stopEls = m.stopsRow.querySelectorAll(".gcb-stop");
  const dt = new DataTransfer();
  stopEls[0].dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
  const lastRect = stopEls[2].getBoundingClientRect();
  const at = { clientX: lastRect.right + 4, clientY: lastRect.top + lastRect.height / 2 };
  m.stopsRow.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, ...at }));
  m.stopsRow.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt, ...at }));
  const dragged = settings.stops.map((s) => s.id).join();
  click(dots()[0]);
  check(5, "Dragging stop 1 past the last moves it to the end; a click straight after doesn't change the selection",
    dragged === "s2,s3,s1" && selectionIs("s3"), `order ${dragged}; ${selection()}`);
  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN), custom("s3", BLUE)]);
  selectStop("s2");
  const stopOrder = () => settings.stops.map((s) => s.id).join();
  dotEl("s1").focus();
  press(dotEl("s1"), "ArrowRight", { altKey: true });
  const afterRight = stopOrder();
  press(dotEl("s1"), "End", { altKey: true });
  check(5, "Alt+→ and Alt+End move the focused dot; focus kept, selection unchanged, announced",
    afterRight === "s2,s1,s3" && stopOrder() === "s2,s3,s1" && document.activeElement === dotEl("s1") && selectionIs("s2") &&
      m.announce.textContent === "Moved to position 3 of 3",
    `${afterRight} → ${stopOrder()}, announced "${m.announce.textContent}"`);
  stillOpen("Alt+arrow keys on a dot");
  dotEl("s3").focus();
  const deleteKept = press(dotEl("s3"), "Delete");
  check(5, "Delete on a focused dot removes it (key consumed), announced",
    stopOrder() === "s2,s1" && !deleteKept && m.announce.textContent === "Colour removed, 2 left", `${stopOrder()}`);
  stillOpen("Delete on a dot");

  // ── Two-step Reset ──
  const realClick = (el) => {
    const r = el.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, composed: true, button: 0, detail: 1,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    const ptr = { pointerId: 1, pointerType: "mouse", isPrimary: true };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...init, ...ptr, buttons: 1 }));
    el.dispatchEvent(new MouseEvent("mousedown", { ...init, buttons: 1 }));
    el.dispatchEvent(new PointerEvent("pointerup", { ...init, ...ptr, buttons: 0 }));
    el.dispatchEvent(new MouseEvent("mouseup", init));
    el.dispatchEvent(new MouseEvent("click", init));
  };
  const resetBtn = m.resetButton;
  const isArmed = () => resetBtn.classList.contains("gcb-armed") && m.resetLabel.textContent === RESET_CONFIRM_LABEL;
  const isIdle = () => !resetBtn.classList.contains("gcb-armed") && m.resetLabel.textContent === "Reset";
  const beforeReset = JSON.stringify(settings);
  const idleWidth = resetBtn.getBoundingClientRect().width;
  realClick(resetBtn);
  check(5, "First click on Reset doesn't reset; 'Confirm reset?', same width",
    JSON.stringify(settings) === beforeReset && isArmed() && Math.abs(resetBtn.getBoundingClientRect().width - idleWidth) <= 1,
    m.resetLabel.textContent);
  press(resetBtn, "Escape");
  check(5, "Escape disarms Reset without resetting", isIdle() && JSON.stringify(settings) === beforeReset, m.resetLabel.textContent);
  stillOpen("Escape on an armed Reset");
  realClick(resetBtn);
  realClick(resetBtn);
  await sleep(TEXT_DELAY + 60);
  check(5, "Second click on Reset → defaults (no background rule, Auto text), the first dot selected, the same button reads 'Reset'",
    JSON.stringify(settings) === JSON.stringify(defaultSettings()) && !styleText().includes("background-image") &&
      styleText() === buildCss(settings, appliedTextColour()) && settings.textColour === "auto" &&
      m.textButtons[0].getAttribute("aria-checked") === "true" &&
      selectionIs(settings.stops[0].id) && m.resetButton === resetBtn && isIdle(),
    `${JSON.stringify(settings)}; ${styleText().replace(/\s+/g, " ")}`);
  stillOpen("Reset");

  // ── Text colour row (GCB #11) ──
  const textRowNodes = [...m.textButtons];
  const textState = () =>
    `mode ${settings.textColour}, checked ${m.textButtons.filter((b) => b.getAttribute("aria-checked") === "true").map((b) => b.dataset.mode).join() || "none"}, ` +
    `tabindex ${m.textButtons.map((b) => b.tabIndex).join()}, focus ${document.activeElement?.dataset?.mode ?? document.activeElement?.className}`;
  const textShows = (mode) =>
    settings.textColour === mode && m.textButtons.every((b, i) => b === textRowNodes[i] && b.isConnected &&
      (b.getAttribute("aria-checked") === "true") === (b.dataset.mode === mode) && b.tabIndex === (b.dataset.mode === mode ? 0 : -1));
  check(11, "Text colour row between the Gradient row and the Presets row: a radiogroup of Auto, Black, White, Spotify default; no <select>",
    m.gradientRow.nextElementSibling === m.text && m.text.nextElementSibling === m.presets && m.textModes.getAttribute("role") === "radiogroup" &&
      m.textModes.getAttribute("aria-labelledby") === "gcb-text-label" &&
      m.textButtons.map((b) => b.textContent).join() === "Auto,Black,White,Spotify default" &&
      m.textButtons.every((b) => b.tagName === "BUTTON" && b.getAttribute("role") === "radio") && !m.root.querySelector("select") &&
      m.textButtons.every((b) => reachable(b)),
    textState());

  // No hint and no warning in any mode, even where neither black nor white reads well (black →
  // white across the whole bar), nothing logged, and the row sits right above the preview.
  setTestSettings(true, [custom("s1", BLACK), custom("s2", WHITE)]);
  const hintProblems = [];
  const ourWarnings = [];
  const warn = console.warn;
  console.warn = (...args) => (String(args[0]).startsWith("[gcb]") ? ourWarnings.push(args.join(" ")) : warn(...args));
  try {
    for (const [i, mode] of TEXT_MODES.entries()) {
      realClick(m.textButtons[i]);
      recalcTextColour({ region: { from: 0, to: 1 } });
      window.__gcb.status();
      const extra = [...m.text.children].filter((el) => el !== m.textLabel && el !== m.textModes);
      const hintLike = m.root.querySelector(".gcb-text-hint, .gcb-warning") ?? m.text.querySelector('[id$="-hint"], [aria-describedby]') ??
        (m.text.nextElementSibling === m.presets ? null : m.text.nextElementSibling);
      const words = /\d(\.\d)?:1\b|4\.5|contrast|readab|warning/i.exec(m.text.textContent);
      const gap = m.presets.getBoundingClientRect().top - m.text.getBoundingClientRect().bottom;
      const rowGap = parseFloat(getComputedStyle(m.root).rowGap);
      if (!textShows(mode) || extra.length || hintLike || words || Math.abs(gap - rowGap) > 0.5)
        hintProblems.push(`${mode}: ${extra.length} extra element(s), ${hintLike ? `.${hintLike.className}` : "no hint element"}, ` +
          `${words ? `"${words[0]}"` : "no contrast text"}, gap ${gap.toFixed(1)} px (modal gap ${rowGap} px)`);
    }
  } finally {
    console.warn = warn;
  }
  recalcTextColour();
  check(11, "No hint or warning under the Text colour row in any of the four modes, nothing logged; the Presets row follows at the modal's normal gap",
    !hintProblems.length && !ourWarnings.length,
    [...hintProblems, ...ourWarnings].join("; ") || `${TEXT_MODES.join(", ")}: no hint, ${m.text.children.length} children (label, radiogroup)`);

  setTestSettings(true, [custom("s1", RED), custom("s2", BLUE)]);
  realClick(m.textButtons[2]);
  const whiteCss = styleText();
  const previewWhite = toHex(getComputedStyle(m.previewLabel).color);
  check(11, "Clicking White applies it live: --text-base and --essential-base #ffffff in the bar's rule, the preview label white, the row updated in place",
    textShows("white") && whiteCss.includes("--text-base: #ffffff;") && whiteCss.includes("--essential-base: #ffffff;") &&
      previewWhite === WHITE && toHex(getComputedStyle(m.previewIcon).fill) === WHITE,
    `${textState()}; preview ${previewWhite}`);
  realClick(m.textButtons[3]);
  check(11, "Spotify default writes no text colour; the preview shows Spotify's own",
    textShows("default") && !styleText().includes("--text-base") && toHex(getComputedStyle(m.previewLabel).color) === spotifyTextColour(),
    `${textState()}; preview ${toHex(getComputedStyle(m.previewLabel).color)}, Spotify's ${spotifyTextColour()}`);
  m.textButtons[3].focus();
  const textKeys = [];
  for (const [key, expected] of [["Home", "auto"], ["ArrowRight", "black"], ["End", "default"], ["ArrowRight", "auto"]]) {
    press(document.activeElement, key);
    const ok = textShows(expected) && document.activeElement === m.textButtons[TEXT_MODES.indexOf(expected)];
    textKeys.push(`${key} → ${settings.textColour}${ok ? "" : ` (expected ${expected} focused)`}`);
  }
  const altText = press(document.activeElement, "ArrowRight", { altKey: true });
  textKeys.push(`Alt+→ → ${settings.textColour}${settings.textColour === "auto" && altText ? "" : " (expected no change)"}`);
  check(11, "Keyboard: Home, →, End and → (wrapping) change the text colour and move focus; Alt+→ doesn't",
    !textKeys.some((step) => step.includes("expected")), textKeys.join(", "));
  stillOpen("changing the text colour");
  realClick(m.textButtons[1]);
  await sleep(SAVE_DELAY + 100);
  const storedText = JSON.parse(Spicetify.LocalStorage.get(settingsKey()) ?? "{}").textColour;
  check(11, "The chosen text colour is saved", storedText === "black", `stored ${storedText}`);
  realClick(m.textButtons[0]);

  // The checked button is filled with the live --spice-button; its label takes whichever of
  // --spice-text and --spice-main contrasts more (GPB #43). A dark and a light probe.
  const fillProblems = [];
  await withoutTransitions(m.textButtons, async () => {
    for (const probe of ["#123456", "#ffe680"]) {
      rootStyle.setProperty("--spice-button", probe, "important");
      await sleep(250); // the :root observer and the re-render; the buttons' fade is off for this check (#12)
      const checked = m.textButtons.find((b) => b.getAttribute("aria-checked") === "true");
      const fill = parseRgb(getComputedStyle(checked).backgroundColor);
      const label = parseRgb(getComputedStyle(checked).color);
      const want = hexToRgb(probe);
      const ratio = label ? contrast(label, want) : 0;
      if (!fill || !fill.every((v, i) => Math.abs(v - want[i]) <= 1) || ratio < 4.5) // parseRgb() only takes opaque colours
        fillProblems.push(`${probe}: fill ${getComputedStyle(checked).backgroundColor}, label ${getComputedStyle(checked).color} (${ratio.toFixed(2)}:1)`);
    }
  });
  restoreButton();
  await sleep(250);
  check(11, "The checked text colour button is filled with a runtime --spice-button; its label reaches 4.5:1 on a dark and a light probe",
    !fillProblems.length, fillProblems.join("; ") || "both probes fine");

  // ── Presets and share codes (GCB #29, GCB #36) ──
  // Store and codes first: pure functions on crafted raw values, counting [gcb] warnings per load.
  const gcbWarnings = (fn) => {
    const original = console.warn;
    let count = 0;
    console.warn = (...args) => (String(args[0]).startsWith("[gcb]") ? count++ : original(...args));
    try {
      return [fn(), count];
    } finally {
      console.warn = original;
    }
  };
  const presetsJson = (list) => JSON.stringify({ version: PRESETS_VERSION, presets: list });
  const own = (id, name, sets) => ({ id, name, settings: sets });
  const sampleA = { gradient: true, textColour: "white", stops: [theme("s1"), custom("s2", RED)] };
  const sampleB = { gradient: false, textColour: "default", stops: [custom("s1", BLUE)] };
  const names = (list) => list.map((p) => p.name).join(", ");

  setPresets([own("p1", "One", sampleA), own("p2", "Two", sampleB)]);
  savePresets();
  const [reloadedPresets, reloadWarnings] = gcbWarnings(() => loadPresets());
  check(29, "Presets store: save → load round-trip in gcb:presets (theme and custom stops, gradient, text colour); gcb:settings untouched",
    JSON.stringify(reloadedPresets) === JSON.stringify(presets) && !reloadWarnings && PRESETS_KEY === "gcb:presets" &&
      JSON.parse(Spicetify.LocalStorage.get(presetsKey())).version === PRESETS_VERSION,
    `${names(reloadedPresets)}; ${reloadWarnings} warning(s); ${Spicetify.LocalStorage.get(presetsKey()).length} characters`);
  const [kept, dropWarnings] = gcbWarnings(() => loadPresets(presetsJson([
    own("p1", "  Good  ", sampleA),
    own("p2", "Bad hex", { ...sampleA, stops: [custom("s1", "#12345")] }),
    own("p3", "   ", sampleB),
    own("p4", "x".repeat(PRESET_NAME_MAX + 1), sampleB),
    own("p5", "Bad text colour", { ...sampleB, textColour: "grey" }),
    { id: "p6", name: "No settings" },
    own("p1", "Same id", sampleB),
    own("p7", "good", sampleB),
  ])));
  check(29, "Invalid presets are dropped with one [gcb] warning; names trimmed; a name clash gets ' (2)'",
    names(kept) === "Good, good (2)" && dropWarnings === 1, `kept ${names(kept)}; ${dropWarnings} warning(s)`);
  const corrupt = ["{nope", JSON.stringify({ version: 2, presets: [] }), JSON.stringify([1, 2]), JSON.stringify({ version: 1 })]
    .map((raw) => gcbWarnings(() => loadPresets(raw)));
  check(29, "A corrupt or unknown gcb:presets gives an empty list and one warning",
    corrupt.every(([list, warnings]) => list.length === 0 && warnings === 1),
    corrupt.map(([list, warnings]) => `${list.length} presets/${warnings} warning(s)`).join(", "));
  const [capped, capWarnings] = gcbWarnings(() =>
    loadPresets(presetsJson(Array.from({ length: MAX_PRESETS + 2 }, (_, i) => own(`p${i + 1}`, `Mine ${i + 1}`, sampleB))))
  );
  setPresets([own("p1", "Mine", sampleB)]);
  const clashes = [uniqueName("Mine"), uniqueName("fairy"), uniqueName(" Spaced "), uniqueName("y".repeat(30))];
  setPresets([own("p1", "y".repeat(PRESET_NAME_MAX), sampleB)]);
  const longClash = uniqueName("y".repeat(PRESET_NAME_MAX));
  check(29, `At most ${MAX_PRESETS} presets load; names are unique (built-ins included, any case), trimmed and ≤ ${PRESET_NAME_MAX} characters`,
    capped.length === MAX_PRESETS && capWarnings === 1 &&
      clashes.join("|") === `Mine (2)|fairy (2)|Spaced|${"y".repeat(PRESET_NAME_MAX)}` &&
      longClash.length === PRESET_NAME_MAX && longClash.endsWith(" (2)"),
    `${capped.length} loaded, ${capWarnings} warning(s); ${clashes.join(" | ")} | ${longClash}`);
  setPresets([]);
  savePresets();
  check(29, "Built-ins can't be deleted, renamed or updated",
    deletePreset("b:fairy") === null && !renamePreset("b:fairy", "Sea") && !updatePreset("b:fairy") && BUILT_IN_PRESETS[4].name === "Fairy",
    BUILT_IN_PRESETS.map((p) => p.id).join());
  const builtInColours = {
    "b:void": ["Void", "#8372fd,#5a82ff,#8372fd"], "b:sunset": ["Sunset", "#6e33ff,#ff5f6d,#ffc371"],
    "b:aurora": ["Aurora", "#00f5a0,#00d9f5,#7f5af0"], "b:neon": ["Neon", "#ff00cc,#3333ff,#33f7ff"], "b:fairy": ["Fairy", "#ff59d1,#ffb800,#77bc00"],
  };
  const builtInMismatches = Object.entries(builtInColours).filter(([id, [name, colours]], i) => {
    const preset = BUILT_IN_PRESETS[i];
    const applied = preset && presetSettings(preset, { textColour: "black" });
    const back = applied && decodeCode(encodeCode(applied));
    return !preset || preset.id !== id || preset.name !== name || preset.colours.join() !== colours ||
      applied.textColour !== "black" || !applied.gradient || !back || !sameSettings(back.settings, applied);
  }).map(([id]) => id);
  check(29, "The built-ins are GPB's five (Void, Sunset, Aurora, Neon, Fairy: ids, order, colours); applied they keep the current text colour",
    BUILT_IN_PRESETS.length === 5 && !builtInMismatches.length,
    builtInMismatches.length ? `mismatch: ${builtInMismatches.join(", ")}` : BUILT_IN_PRESETS.map((p) => `${p.name} ${p.colours.join("→")}`).join("; "));
  const [renamedOnLoad, renameWarnings] = gcbWarnings(() =>
    loadPresets(presetsJson([own("p3", "fairy", sampleB), own("p1", "Void", sampleA), own("p2", "Ocean", sampleB)]))
  );
  check(29, "Stored own presets whose names clash with a built-in are renamed on load (' (2)'), ids unchanged, no warning",
    names(renamedOnLoad) === "fairy (2), Void (2), Ocean" && renamedOnLoad.map((p) => p.id).join() === "p3,p1,p2" && !renameWarnings,
    `${names(renamedOnLoad)}; ids ${renamedOnLoad.map((p) => p.id).join()}; ${renameWarnings} warning(s)`);

  // Share codes (GCB #36): the fixtures GPB's self-test uses too, so both sides agree.
  const FIXTURES = {
    gpbVoid: "gpb1:eyJnIjoxLCJtIjoiYyIsInMiOlsiODM3MmZkIiwiNWE4MmZmIiwiODM3MmZkIl19",
    gpbThemeAnchored: "gpb1:eyJnIjoxLCJtIjoiYSIsInMiOlsidCIsImZmNWY2ZCJdfQ",
    gcbVoidAuto: "gcb1:eyJnIjoxLCJ4IjoiYSIsInMiOlsiODM3MmZkIiwiNWE4MmZmIiwiODM3MmZkIl19",
    gcbThemeWhite: "gcb1:eyJnIjoxLCJ4IjoidyIsInMiOlsidCIsImZmNWY2ZCJdfQ",
    gcbSolidThemeDefault: "gcb1:eyJnIjowLCJ4IjoiZCIsInMiOlsidCJdfQ",
  };
  const shape = (decoded) => decoded
    ? `${decoded.from}: g ${decoded.settings.gradient ? 1 : 0}, ${decoded.settings.textColour}, ${decoded.settings.stops.map((stop) => (stop.kind === "theme" ? "t" : stop.color)).join("→")}`
    : "null";
  const decodeWith = (code, textColour) => decodeCode(code, { textColour });
  const fixtureResults = {
    gpbVoid: [shape(decodeWith(FIXTURES.gpbVoid, "white")), "gpb: g 1, white, #8372fd→#5a82ff→#8372fd"],
    gpbVoidAuto: [shape(decodeWith(FIXTURES.gpbVoid, "auto")), "gpb: g 1, auto, #8372fd→#5a82ff→#8372fd"],
    gpbThemeAnchored: [shape(decodeWith(FIXTURES.gpbThemeAnchored, "default")), "gpb: g 1, default, t→#ff5f6d"],
    gcbVoidAuto: [shape(decodeWith(FIXTURES.gcbVoidAuto, "black")), "gcb: g 1, auto, #8372fd→#5a82ff→#8372fd"],
    gcbThemeWhite: [shape(decodeWith(FIXTURES.gcbThemeWhite, "black")), "gcb: g 1, white, t→#ff5f6d"],
    gcbSolidThemeDefault: [shape(decodeWith(FIXTURES.gcbSolidThemeDefault, "black")), "gcb: g 0, default, t"],
  };
  const wrongFixtures = Object.entries(fixtureResults).filter(([, [got, want]]) => got !== want);
  check(36, "Fixtures decode as specified: gpb1: keeps the current text colour (Spread dropped), gcb1: brings its own",
    !wrongFixtures.length, wrongFixtures.map(([k, [got, want]]) => `${k}: ${got} (expected ${want})`).join("; ") || `${Object.keys(fixtureResults).length} decodes`);
  const voidAuto = encodeCode(presetSettings(BUILT_IN_PRESETS[0], { textColour: "auto" }));
  const reEncoded = ["gcbThemeWhite", "gcbSolidThemeDefault"].map((k) => encodeCode(decodeCode(FIXTURES[k]).settings) === FIXTURES[k]);
  check(36, "Export of the Void built-in with Auto gives exactly the gcb1: Void fixture; the other gcb1: fixtures re-encode to themselves",
    voidAuto === FIXTURES.gcbVoidAuto && reEncoded.every(Boolean), `${voidAuto}; re-encoded ${reEncoded.join(", ")}`);
  const codeCases = TEXT_MODES.flatMap((textColour) => [true, false].map((gradient) =>
    ({ version: SCHEMA_VERSION, gradient, textColour, stops: [theme("a"), custom("b", RED), custom("c", "#00ff7f")] })));
  const roundTrips = codeCases.map((c) => {
    const back = decodeCode(encodeCode(c));
    return !!back && back.from === "gcb" && sameSettings(back.settings, c) && back.settings.stops.map((stop) => stop.id).join() === "s1,s2,s3";
  });
  check(36, "gcb1: round-trip: theme and custom stops, every text colour, gradient on and off (ids s1…sN)",
    roundTrips.every(Boolean) && voidAuto.startsWith(CODE_PREFIX), `${roundTrips.filter(Boolean).length}/${roundTrips.length}`);
  const raw = (prefix, data) => prefix + toBase64Url(data);
  const validBody = FIXTURES.gcbVoidAuto.slice(CODE_PREFIX.length);
  const invalidCodes = {
    garbage: "garbage",
    empty: "",
    "wrong prefix": `gcb2:${validBody}`,
    "prefix only": CODE_PREFIX,
    "not base64": `${CODE_PREFIX}@@@`,
    "9 stops": raw(CODE_PREFIX, { g: 1, x: "a", s: Array(9).fill("ff0000") }),
    "bad hex": raw(CODE_PREFIX, { g: 1, x: "a", s: ["zzzzzz"] }),
    "short hex": raw(CODE_PREFIX, { g: 1, x: "a", s: ["fff"] }),
    "unknown x": raw(CODE_PREFIX, { g: 1, x: "q", s: ["ff0000"] }),
    "no x": raw(CODE_PREFIX, { g: 1, s: ["ff0000"] }),
    "g 2": raw(CODE_PREFIX, { g: 2, x: "a", s: ["ff0000"] }),
    "gpb1: unknown m": raw(GPB_CODE_PREFIX, { g: 1, m: "x", s: ["ff0000"] }),
    "gpb1: no m": raw(GPB_CODE_PREFIX, { g: 1, s: ["ff0000"] }),
    "gpb1: x instead of m": raw(GPB_CODE_PREFIX, { g: 1, x: "a", s: ["ff0000"] }),
    "gpb1: 9 stops": raw(GPB_CODE_PREFIX, { g: 1, m: "c", s: Array(9).fill("ff0000") }),
    "gpb2:": `gpb2:${FIXTURES.gpbVoid.slice(5)}`,
  };
  const accepted = Object.entries(invalidCodes).filter(([, code]) => decodeCode(code) !== null).map(([label]) => label);
  check(36, "Invalid codes are rejected: garbage, wrong prefixes, 9 stops, bad hex, an unknown x, a gpb1: code GPB itself wouldn't accept",
    !accepted.length, accepted.length ? `accepted: ${accepted.join(", ")}` : `${Object.keys(invalidCodes).length} rejected`);
  check(36, "Whitespace around a code is accepted", !!decodeCode(`  \n${FIXTURES.gcbThemeWhite}\t `) && !!decodeCode(` ${FIXTURES.gpbVoid} `), "");

  // The Presets row in the open modal.
  renderChips(m);
  const chipIds = () => [...m.chips.querySelectorAll(".gcb-chip")].filter((el) => !el.hidden)
    .map((el) => (el === m.saveChip ? "save" : el.dataset.preset)).join();
  const chipOf = (id) => chipEl(id);
  const pressed = () => [...m.chips.querySelectorAll('.gcb-preset-chip[aria-pressed="true"]')].map((el) => el.dataset.preset).join() || "none";
  const undoState = () => `undo "${m.undoText.textContent}"${m.undoButton.hidden ? " (no button)" : " + Undo"}`;
  const undoShows = (message) => m.undoText.textContent === `${message} · ` && !m.undoButton.hidden &&
    m.undoLine.getAttribute("aria-live") === "polite";
  const presetsRect = m.presets.getBoundingClientRect();
  const toolsRect = m.presetsRow.querySelector(".gcb-presets-tools").getBoundingClientRect();
  const labelRect0 = m.presetsRow.querySelector(".gcb-label").getBoundingClientRect();
  const unreachableChips = [...m.chips.querySelectorAll(".gcb-chip"), m.exportButton, m.importButton].filter((el) => !reachable(el));
  check(29, "Presets row between the Text colour row and the preview: label left, Export and Import right, every chip reachable",
    m.presets.previousElementSibling === m.text && m.presets.nextElementSibling === m.preview &&
      Math.abs(labelRect0.left - presetsRect.left) <= 1 && Math.abs(toolsRect.right - presetsRect.right) <= 1 && !unreachableChips.length,
    `after .${m.presets.previousElementSibling?.className}, before .${m.presets.nextElementSibling?.className}` +
      (unreachableChips.length ? `; not reachable: ${unreachableChips.map((el) => el.textContent).join(", ")}` : ""));
  const shareButtons = [[m.exportButton, "Export", EXPORT_TITLE], [m.importButton, "Import", IMPORT_TITLE]];
  const shareProblems = shareButtons.flatMap(([el, label, title]) => {
    const cs = getComputedStyle(el);
    const svg = el.querySelector("svg");
    const problems = [];
    if (!(parseFloat(cs.borderTopWidth) >= 1) || cs.borderTopStyle !== "solid") problems.push(`${label}: border ${cs.borderTopWidth} ${cs.borderTopStyle}`);
    if (!svg || el.firstElementChild !== svg || Math.abs(svg.getBoundingClientRect().width - 14) > 0.5) problems.push(`${label}: icon`);
    const shownLabel = el.querySelector(".gcb-share-label")?.textContent;
    if (shownLabel !== label || el.title !== title) problems.push(`${label}: label "${shownLabel}", title "${el.title}"`);
    if (parseInt(cs.fontWeight, 10) < 700 || cs.borderTopLeftRadius === "0px") problems.push(`${label}: weight ${cs.fontWeight}, radius ${cs.borderTopLeftRadius}`);
    return problems;
  });
  check(36, "Export and Import are outlined pills with a 14 px icon first, bold labels and their titles", !shareProblems.length,
    shareProblems.join("; ") || "both fine");
  const chipSwatch = chipOf("b:aurora")?.querySelector(".gcb-chip-swatch");
  const swatchRect = chipSwatch?.getBoundingClientRect();
  const rowIds = (row) => [...row.querySelectorAll(".gcb-chip")].filter((el) => !el.hidden)
    .map((el) => (el === m.saveChip ? "save" : el.dataset.preset)).join();
  const rowsSplit = (ownIds) => rowIds(m.builtInRow) === BUILT_IN_PRESETS.map((p) => p.id).join() && rowIds(m.ownRow) === [...ownIds, "save"].join();
  const rowGap = m.ownRow.getBoundingClientRect().top - m.builtInRow.getBoundingClientRect().bottom;
  check(29, "Chips: two rows (the built-ins; own presets and + Save), 8 px apart, 12 px swatches painted with barImage()",
    chipIds() === "b:void,b:sunset,b:aurora,b:neon,b:fairy,save" && rowsSplit([]) && Math.abs(rowGap - 8) <= 1 &&
      swatchRect && Math.abs(swatchRect.width - 12) <= 0.5 && chipSwatch.style.backgroundImage.startsWith("linear-gradient"),
    `${chipIds()}; gap ${rowGap.toFixed(1)} px; swatch ${swatchRect?.width.toFixed(1)} px`);

  // Two-step apply with a preview in the strip, text colour included.
  setTestSettings(true, [custom("s1", BLACK)], "auto");
  setTestSettings(false, [custom("s1", BLACK)], "auto");
  const notAPreset = JSON.stringify(settings);
  const cssBeforePreview = styleText();
  const stripProbe = document.createElement("span"); // the same serialisation as the strip's inline style
  const stripShows = (sets) => {
    stripProbe.style.backgroundImage = barImage(sets);
    return m.preview.style.backgroundImage === stripProbe.style.backgroundImage;
  };
  const stripText = () => toHex(getComputedStyle(m.previewLabel).color);
  const statusText = () => m.undoText.textContent;
  const previewMessage = (name) => `Previewing "${name}" — click it again to apply, Esc to cancel`;
  const untouched = () => JSON.stringify(settings) === notAPreset && styleText() === cssBeforePreview;
  const fairy = chipOf("b:fairy");
  const fairyLabel = () => fairy.querySelector(".gcb-chip-label").textContent;
  const idleChipWidth = fairy.getBoundingClientRect().width;
  const textBefore = stripText();
  realClick(fairy);
  const fairyText = textColourFor(presetSettings(BUILT_IN_PRESETS[4]));
  check(29, "First click arms a chip ('Apply?', same width) and previews it in the strip, its text colour too (Auto computed for its colours); nothing applied",
    fairy.classList.contains("gcb-armed") && fairyLabel() === APPLY_LABEL && Math.abs(fairy.getBoundingClientRect().width - idleChipWidth) <= 1 &&
      stripShows(presetSettings(BUILT_IN_PRESETS[4])) && stripText() === fairyText && textBefore === WHITE && fairyText === BLACK && untouched() &&
      statusText() === previewMessage("Fairy") && m.undoButton.hidden,
    `label "${fairyLabel()}", strip text ${textBefore} → ${stripText()} (Fairy with Auto: ${fairyText}), status "${statusText()}"`);
  stillOpen("arming a preset chip");
  press(fairy, "Escape");
  check(29, "Escape disarms: the strip (colours and text) shows the current settings again, the status line is empty, nothing applied",
    !fairy.classList.contains("gcb-armed") && fairyLabel() === "Fairy" && stripShows(settings) && stripText() === WHITE && !statusText() && untouched(),
    `label "${fairyLabel()}", strip text ${stripText()}, status "${statusText()}"`);
  realClick(fairy);
  await sleep(RESET_CONFIRM_MS + 500);
  const stillArmed = fairy.classList.contains("gcb-armed") && stripShows(presetSettings(BUILT_IN_PRESETS[4]));
  const aurora = chipOf("b:aurora");
  realClick(aurora);
  check(29, "No timeout while previewing; a click on another chip moves the arm and the preview to it",
    stillArmed && !fairy.classList.contains("gcb-armed") && aurora.classList.contains("gcb-armed") &&
      stripShows(presetSettings(BUILT_IN_PRESETS[2])) && statusText() === previewMessage("Aurora") && untouched(),
    `still armed after ${(RESET_CONFIRM_MS + 500) / 1000} s ${stillArmed}; armed ${m.armed?.chip.dataset.preset}`);
  realClick(dots()[0]);
  check(29, "A click elsewhere disarms: the strip reverts, the status line clears, nothing applied",
    !aurora.classList.contains("gcb-armed") && !m.armed && stripShows(settings) && !statusText() && untouched(), `status "${statusText()}"`);
  stillOpen("a click outside an armed chip");

  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN)], "white");
  realClick(fairy);
  realClick(fairy);
  check(29, "Second click applies Fairy: its colours, gradient on, the text colour kept (White), the first dot selected; same chip node",
    sameSettings(settings, presetSettings(BUILT_IN_PRESETS[4])) && settings.textColour === "white" && styleText().includes("--text-base: #ffffff;") &&
      selectionIs(settings.stops[0].id) && chipOf("b:fairy") === fairy && fairy.isConnected && stripShows(settings),
    `${settings.textColour}, ${settings.stops.map((x) => x.color).join(", ")}; ${selection()}`);
  stillOpen("applying a preset");
  const fairyBorder = parseRgb(getComputedStyle(fairy).borderTopColor);
  const buttonColour = computedRgb(m.root, "var(--spice-button)");
  check(29, "The active chip is marked (aria-pressed, --spice-button border); a built-in matches by colours only, whatever the text colour",
    pressed() === "b:fairy" && !!fairyBorder && !!buttonColour && fairyBorder.every((v, i) => Math.abs(v - buttonColour[i]) <= 1) &&
      matchesPreset(BUILT_IN_PRESETS[4], { ...settings, textColour: "black" }),
    `pressed ${pressed()}, border ${getComputedStyle(fairy).borderTopColor}`);
  check(29, "Undo line after applying: 'Applied \"Fairy\" · Undo' in a polite live region", undoShows('Applied "Fairy"'), undoState());
  const fairyApplied = JSON.stringify(settings);
  realClick(fairy);
  check(29, "A click on the active chip does nothing: not armed, nothing applied, the Undo kept",
    !fairy.classList.contains("gcb-armed") && !m.armed && JSON.stringify(settings) === fairyApplied && undoShows('Applied "Fairy"'),
    `armed ${!!m.armed}, ${undoState()}`);
  const sunset = chipOf("b:sunset");
  realClick(sunset);
  realClick(sunset);
  const sunsetApplied = sameSettings(settings, presetSettings(BUILT_IN_PRESETS[1])) && pressed() === "b:sunset";
  realClick(m.undoButton);
  check(29, "A new action replaces the pending undo: Undo goes back to Fairy, not further",
    sunsetApplied && sameSettings(settings, presetSettings(BUILT_IN_PRESETS[4])) && m.undoButton.hidden && !m.undoText.textContent,
    `${settings.stops.map((x) => x.color).join(", ")}; ${undoState()}`);
  setTestSettings(true, [theme("s1"), custom("s2", RED), custom("s3", GREEN)], "black");
  selectStop("s3");
  const exact = JSON.stringify(settings);
  realClick(fairy);
  realClick(fairy);
  realClick(m.undoButton);
  check(29, "Undo after applying restores exactly the previous settings (ids and text colour included), the selection on the first dot",
    JSON.stringify(settings) === exact && selectionIs("s1"), `${JSON.stringify(settings)}; ${selection()}`);
  stillOpen("Undo after applying");
  realClick(chipOf("b:neon"));
  realClick(chipOf("b:neon"));
  setStopColour(settings.stops[0].id, BLUE);
  check(29, "Editing the colours afterwards drops the pending undo", m.undoButton.hidden && !pendingUndo, undoState());

  // + Save, the inline name field, own presets: they save and restore the text colour.
  setTestSettings(true, [theme("s1"), custom("s2", RED)], "default");
  const saveNode = m.saveChip;
  realClick(saveNode);
  const nameShown = !m.nameField.hidden && m.saveChip.hidden && document.activeElement === m.nameField && m.nameField.value === "Preset 1" &&
    !m.nameField.closest(".gcb-popover") && saveNode.isConnected;
  press(m.nameField, "Escape");
  const cancelled = !presets.length && m.nameField.hidden && !m.saveChip.hidden && document.activeElement === m.saveChip;
  realClick(m.saveChip);
  m.nameField.value = "  Mine  ";
  press(m.nameField, "Enter");
  await tick();
  await tick();
  const mineId = presets[0]?.id;
  const mineChip = mineId && chipOf(mineId);
  check(29, "+ Save: an inline name field ('Preset 1'); Escape cancels; Enter saves 'Mine' with the text colour, its chip in row 2, active and focused",
    nameShown && cancelled && presets.length === 1 && presets[0].name === "Mine" && presets[0].settings.textColour === "default" &&
      JSON.parse(Spicetify.LocalStorage.get(presetsKey()) ?? "{}").presets?.[0]?.settings.textColour === "default" &&
      rowsSplit([mineId]) && mineChip?.getAttribute("aria-pressed") === "true" && document.activeElement === mineChip && m.saveChip === saveNode,
    `field ${nameShown}, cancelled ${cancelled}; ${chipIds()}; pressed ${pressed()}`);
  stillOpen("saving a preset");
  setTestSettings(true, [custom("s1", GREEN), custom("s2", BLUE)], "white");
  check(29, "An own preset doesn't match other settings that differ only in the text colour",
    !matchesPreset(presets[0], { ...presetSettings(presets[0]), textColour: "white" }) && pressed() === "none", `pressed ${pressed()}`);
  realClick(chipOf(mineId));
  const ownText = stripText();
  realClick(chipOf(mineId));
  check(29, "An own preset previews and restores everything: gradient, stops (theme stays theme) and its text colour (Spotify default)",
    ownText === spotifyTextColour() && sameSettings(settings, { gradient: true, textColour: "default", stops: [theme("x"), custom("y", RED)] }) &&
      !styleText().includes("--text-base"),
    `preview text ${ownText}; ${JSON.stringify(settings)}`);
  stillOpen("applying an own preset");

  rightClick(chipOf("b:fairy"));
  const builtInMenu = menuShown();
  closePopover();
  rightClick(chipOf(mineId));
  const shownItems = [...m.menu.querySelectorAll(".gcb-menu-item")].filter((el) => !el.hidden).map((el) => el.textContent);
  const renameNode = m.renameItem;
  realClick(renameNode);
  const renaming = !m.nameField.hidden && m.nameField.value === "Mine" && chipOf(mineId)?.hidden && renameNode.isConnected && !menuShown();
  m.nameField.value = "Fairy";
  press(m.nameField, "Enter");
  await tick();
  await tick();
  check(29, "Own chips have Rename, Update to current colours, Delete (built-ins no menu); Rename in place, a clash with a built-in gets ' (2)'",
    !builtInMenu && shownItems.join() === "Rename,Update to current colours,Delete" && renaming && presets[0].name === "Fairy (2)" &&
      chipOf(mineId)?.textContent.includes("Fairy (2)"),
    `built-in menu ${builtInMenu}; items ${shownItems.join(", ")}; name "${presets[0].name}"`);
  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN), custom("s3", BLUE)], "black");
  rightClick(chipOf(mineId));
  realClick(m.updatePresetItem);
  await tick();
  await tick();
  check(29, "Update to current colours stores the current settings (text colour included); its chip turns active",
    sameSettings(presetSettings(presets[0]), settings) && presets[0].settings.textColour === "black" && chipOf(mineId)?.getAttribute("aria-pressed") === "true",
    `pressed ${pressed()}`);
  addPreset("Second");
  renderChips(m);
  const beforeDelete = JSON.stringify(presets);
  rightClick(chipOf(mineId));
  const deleteNode = m.deletePresetItem;
  realClick(deleteNode);
  await tick();
  await tick();
  const deleted = presets.length === 1 && !chipOf(mineId) && undoShows('Deleted "Fairy (2)"') && deleteNode.isConnected;
  realClick(m.undoButton);
  await tick();
  await tick();
  check(29, "Delete at once with 'Deleted \"…\" · Undo'; Undo restores the preset in its old place, in storage too",
    deleted && JSON.stringify(presets) === beforeDelete && Spicetify.LocalStorage.get(presetsKey()) === presetsJson(JSON.parse(beforeDelete)),
    `deleted ${deleted}; ${names(presets)}`);
  stillOpen("deleting a preset");
  while (presets.length < MAX_PRESETS) addPreset("Fill");
  renderChips(m);
  check(29, `+ Save is disabled at ${MAX_PRESETS} presets ('Up to ${MAX_PRESETS} presets'); a ${MAX_PRESETS + 1}th isn't added`,
    m.saveChip.disabled && m.saveChip.title === SAVE_FULL_LABEL && addPreset("One more") === null && presets.length === MAX_PRESETS,
    `${presets.length} presets, disabled ${m.saveChip.disabled}`);
  setPresets([]);
  savePresets();
  renderChips(m);

  // Import: gcb1: brings its text colour, gpb1: keeps the current one.
  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN)], "black");
  const beforeImport = JSON.stringify(settings);
  realClick(m.importButton);
  const importOpen = !m.importPanel.hidden && m.importButton.getAttribute("aria-expanded") === "true" && document.activeElement === m.codeInput;
  m.codeInput.value = "gcb1:not-a-code";
  const applyNode = m.importApply;
  realClick(applyNode);
  check(36, "Import: an invalid code is flagged (aria-invalid, 'Not a valid code') and changes nothing",
    importOpen && m.codeInput.getAttribute("aria-invalid") === "true" && m.importError.textContent === IMPORT_ERROR &&
      JSON.stringify(settings) === beforeImport, `panel ${importOpen}, error "${m.importError.textContent}"`);
  const typeCode = (value) => {
    m.codeInput.value = value;
    m.codeInput.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const cssBeforeImport = styleText();
  typeCode(`  ${FIXTURES.gcbThemeWhite}  `);
  const gcbPreview = stripShows(decodeCode(FIXTURES.gcbThemeWhite).settings) && stripText() === WHITE && statusText() === PREVIEW_CODE_MESSAGE &&
    JSON.stringify(settings) === beforeImport && styleText() === cssBeforeImport;
  typeCode(FIXTURES.gpbVoid);
  const gpbPreview = stripShows(decodeCode(FIXTURES.gpbVoid).settings) && stripText() === BLACK && JSON.stringify(settings) === beforeImport;
  typeCode("");
  const clearedReverts = stripShows(settings) && !statusText();
  check(36, "A valid code in the Import field previews in the strip, text colour included (gcb1: White; gpb1: the current Black); clearing reverts",
    gcbPreview && gpbPreview && clearedReverts, `gcb1 ${gcbPreview}, gpb1 ${gpbPreview}, cleared ${clearedReverts}`);
  typeCode(FIXTURES.gcbThemeWhite);
  realClick(applyNode);
  const gcbApplied = sameSettings(settings, decodeCode(FIXTURES.gcbThemeWhite).settings) && settings.textColour === "white" &&
    m.importPanel.hidden && undoShows("Imported code") && applyNode.isConnected;
  realClick(m.undoButton);
  const undone = JSON.stringify(settings) === beforeImport;
  check(36, "Import gcb1: applies its colours and its text colour (White), 'Imported code · Undo'; Undo restores exactly",
    gcbApplied && undone, `applied ${gcbApplied}, undone ${undone}; ${undoState()}`);
  realClick(m.importButton);
  typeCode(FIXTURES.gpbThemeAnchored);
  press(m.codeInput, "Enter");
  check(36, "Import gpb1: (GPB's code) applies its colours, keeps the current text colour (Black), 'Imported code from Gradient Progress Bar · Undo'",
    settings.gradient && settings.stops.map((x) => (x.kind === "theme" ? "t" : x.color)).join() === "t,#ff5f6d" && settings.textColour === "black" &&
      undoShows("Imported code from Gradient Progress Bar") && !("mode" in settings),
    `${JSON.stringify(settings)}; ${undoState()}`);
  stillOpen("importing a code");
  realClick(m.undoButton);

  // Export: writeClipboard()'s tiers in order with stubbed sources, then the real ones.
  const realSources = { ...clipboardSources };
  const exportWidth = () => m.exportButton.getBoundingClientRect().width;
  const idleExportWidth = exportWidth();
  const showsCopied = () => m.exportLabel.textContent === COPIED_LABEL && m.exportIcon.hasAttribute("hidden") && !m.exportCheck.hasAttribute("hidden") &&
    Math.abs(exportWidth() - idleExportWidth) <= 1;
  const showsExport = () => m.exportLabel.textContent === EXPORT_LABEL && !m.exportIcon.hasAttribute("hidden") && m.exportCheck.hasAttribute("hidden");
  let captured = null;
  const tierLog = [];
  const stubClipboard = ({ apiTier, write, exec }) => {
    tierLog.length = 0;
    captured = null;
    clipboardSources.api = () => apiTier && { copy: async (text) => {
      tierLog.push("ClipboardAPI");
      if (apiTier !== "ok") throw new Error("stub");
      captured = text;
    } };
    clipboardSources.clipboard = () => write && { writeText: async (text) => {
      tierLog.push("writeText");
      if (write !== "ok") throw new Error("stub");
      captured = text;
    } };
    clipboardSources.execCommand = (command) => {
      tierLog.push("execCommand");
      if (exec !== "ok" || command !== "copy") return false;
      captured = document.activeElement?.value ?? null;
      return true;
    };
  };
  try {
    setTestSettings(true, BUILT_IN_PRESETS[0].colours.map((c, i) => custom(`s${i + 1}`, c)), "auto");
    stubClipboard({ apiTier: "ok", write: "ok", exec: "ok" });
    const viaApi = await copyCode(m);
    check(36, "Export copies the gcb1: code through Spicetify's ClipboardAPI first (Void + Auto = the fixture); the button reads 'Copied' with the check, same width",
      viaApi === "ClipboardAPI" && tierLog.join() === "ClipboardAPI" && captured === FIXTURES.gcbVoidAuto && showsCopied() &&
        m.announce.textContent === "Share code copied" && m.codeFallback.hidden,
      `tiers ${tierLog.join(" → ")}; copied ${captured}`);
    await sleep(COPIED_MS + 200);
    const backToExport = showsExport();
    stubClipboard({ apiTier: "fail", write: "fail", exec: "ok" });
    const viaExec = await copyCode(m);
    stubClipboard({ apiTier: "fail", write: "fail", exec: "fail" });
    realClick(m.exportButton);
    await waitFor(() => !m.codeFallback.hidden);
    check(36, `Export: 'Export' again after ${COPIED_MS / 1000} s; execCommand when both async tiers fail; the selected code field when all three fail`,
      backToExport && viaExec === "execCommand" && tierLog.join() === "ClipboardAPI,writeText,execCommand" && !m.codeFallback.hidden &&
        m.codeOutput.value === FIXTURES.gcbVoidAuto && document.activeElement === m.codeOutput && showsExport(),
      `back ${backToExport}, exec ${viaExec}, fallback shown ${!m.codeFallback.hidden}`);
    stillOpen("Export");
  } finally {
    Object.assign(clipboardSources, realSources);
  }
  m.codeFallback.hidden = true;

  // ── Preview strip (GCB #7) ──
  setTestSettings(true, [theme("s1"), custom("s2", GREEN), custom("s3", RED)]);
  await sleep(50);
  const pv = m.preview;
  const pr = pv.getBoundingClientRect();
  const pcs = getComputedStyle(pv);
  const labelRect = m.previewLabel.getBoundingClientRect();
  const iconRect = m.previewIcon.getBoundingClientRect();
  check(7, "Preview strip: 24 px high, 4 px radius, between the Presets row and the dots",
    Math.abs(pr.height - 24) <= 0.5 && pcs.borderTopLeftRadius === "4px" && pcs.borderBottomRightRadius === "4px" &&
      m.presets.nextElementSibling === pv && pv.nextElementSibling === m.dotsLine,
    `${pr.width.toFixed(1)}×${pr.height.toFixed(1)}, radius ${pcs.borderRadius}`);
  check(7, "Preview strip: the bar's gradient over the bar's own colour",
    pcs.backgroundImage === computedImage(barImage(settings)) && toHex(pcs.backgroundColor) === barBase(),
    `image ${pcs.backgroundImage}; colour ${toHex(pcs.backgroundColor)} (bar ${barBase()})`);
  check(7, "Preview strip: 'Playing on Device' with the icon before it at the right-hand end",
    m.previewLabel.textContent === PREVIEW_LABEL && iconRect.right <= labelRect.left && pr.right - labelRect.right <= 16 &&
      labelRect.right <= pr.right && Math.abs(centreY(iconRect) - centreY(pr)) <= 1,
    `label ${labelRect.left.toFixed(1)}–${labelRect.right.toFixed(1)}, icon ${iconRect.left.toFixed(1)}–${iconRect.right.toFixed(1)}, strip right ${pr.right.toFixed(1)}`);
  setTestSettings(false, [theme("s1")]);
  check(7, "Preview strip with a solid theme colour: no image, just the bar's own colour",
    getComputedStyle(pv).backgroundImage === "none" && toHex(getComputedStyle(pv).backgroundColor) === barBase(),
    `${getComputedStyle(pv).backgroundImage}, ${getComputedStyle(pv).backgroundColor}`);
  if (!bar) skip(7, "Preview label matches the bar's text size, weight and icon size");
  else if (gone()) skip(7, "Preview label matches the bar's text size, weight and icon size", BAR_GONE);
  else {
    const link = bar.querySelector(BAR_LINK);
    const span = link?.querySelector("span") ?? link;
    const icon = bar.querySelector(BAR_ICON);
    const fontOf = (el) => `${getComputedStyle(el).fontSize} ${getComputedStyle(el).fontWeight}`;
    const size = (el) => `${el.getBoundingClientRect().width.toFixed(0)}×${el.getBoundingClientRect().height.toFixed(0)}`;
    barCheck(7, "Preview label matches the bar's text size, weight and icon size",
      fontOf(span) === fontOf(m.previewLabel) && size(icon) === size(m.previewIcon),
      `bar ${fontOf(span)}, icon ${size(icon)}; preview ${fontOf(m.previewLabel)}, icon ${size(m.previewIcon)}`);
  }

  // ── Clean-up on close ──
  const listenersOpen = songchangeCount();
  const observersOpen = liveObservers;
  Spicetify.PopupModal.hide();
  await tick();
  check(5, "Closing the settings removes the songchange listener and the observers, and leaves nothing of ours",
    listenersOpen === listenersBefore + 1 && songchangeCount() === listenersBefore && observersOpen > 0 && liveObservers === 0 &&
      modal === null && !document.querySelector(".gcb-modal, .gcb-stop, .gcb-switch"),
    `songchange ${listenersBefore} → ${listenersOpen} → ${songchangeCount()}, observers ${observersOpen} → ${liveObservers}`);

  // ── Persistence (GCB #2) ──
  // loadSettings() with console.warn captured; returns the result and the number of [gcb] warnings.
  const loadQuietly = (raw) => {
    const warnings = [];
    const warn = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
      return { loaded: loadSettings(raw), ours: warnings.filter((w) => w.startsWith("[gcb]")).length };
    } finally {
      console.warn = warn;
    }
  };
  check(2, "Storage key is our own (gcb:…), never Gradient Progress Bar's", STORAGE_KEY !== GPB_STORAGE_KEY && STORAGE_KEY.startsWith("gcb:"),
    `${STORAGE_KEY} vs GPB's ${GPB_STORAGE_KEY}`);
  check(2, "Defaults: one theme stop, gradient off, text colour Auto",
    JSON.stringify(defaultSettings()) === JSON.stringify({ version: 2, gradient: false, textColour: "auto", stops: [{ id: "s1", kind: "theme" }] }),
    JSON.stringify(defaultSettings()));
  const invalid = {
    "corrupt JSON": "{broken",
    "not an object": "42",
    "bad hex": JSON.stringify({ version: 1, gradient: false, stops: [{ id: "s1", kind: "custom", color: "red" }] }),
    "unknown kind": JSON.stringify({ version: 1, gradient: false, stops: [{ id: "s1", kind: "rainbow" }] }),
    "no stops": JSON.stringify({ version: 1, gradient: false, stops: [] }),
    "9 stops": JSON.stringify({ version: 1, gradient: true, stops: Array.from({ length: 9 }, (_, i) => theme(`s${i}`)) }),
    "duplicate ids": JSON.stringify({ version: 1, gradient: true, stops: [theme("s1"), theme("s1")] }),
    "unknown text colour": JSON.stringify({ version: 1, gradient: false, textColour: "grey", stops: [theme("s1")] }),
    "old version without a migration": JSON.stringify({ version: 0, gradient: false, stops: [theme("s1")] }),
    "a transparent stop in version 2": JSON.stringify({ version: 2, gradient: true, stops: [theme("s1"), { id: "s2", kind: "transparent" }] }),
    "an 8-digit hex in version 2": JSON.stringify({ version: 2, gradient: false, stops: [custom("s1", "#ff000080")] }),
  };
  const wrongLoads = Object.entries(invalid).map(([label, raw]) => [label, loadQuietly(raw)])
    .filter(([, { loaded, ours }]) => JSON.stringify(loaded) !== JSON.stringify(defaultSettings()) || ours !== 1);
  check(2, "Corrupt or old stored settings → defaults + exactly one [gcb] warning each", !wrongLoads.length,
    wrongLoads.map(([label, { ours }]) => `${label}: ${ours} warning(s)`).join("; ") || `${Object.keys(invalid).length} cases`);
  const newer = JSON.stringify({ version: SCHEMA_VERSION + 1, gradient: true, stops: [theme("s1")] });
  Spicetify.LocalStorage.set(settingsKey(), newer);
  const fromNewer = loadQuietly(newer);
  check(2, "Settings from a newer version → defaults + one warning; the stored value is left alone",
    JSON.stringify(fromNewer.loaded) === JSON.stringify(defaultSettings()) && fromNewer.ours === 1 && Spicetify.LocalStorage.get(settingsKey()) === newer,
    `${fromNewer.ours} warning(s)`);
  MIGRATIONS[0] = (data) => ({ ...data, version: 1, stops: data.colours.map((color, i) => custom(`s${i + 1}`, color)) });
  let migrated;
  try {
    migrated = loadQuietly(JSON.stringify({ version: 0, gradient: true, colours: [RED, BLUE] }));
  } finally {
    delete MIGRATIONS[0];
  }
  check(2, "Migration scaffold: a version-0 step (test only) upgrades old data without a warning",
    migrated.loaded.gradient && migrated.loaded.stops.map((s) => s.color).join() === `${RED},${BLUE}` && migrated.ours === 0,
    `${JSON.stringify(migrated.loaded)}, ${migrated.ours} warning(s)`);
  const beforeText = loadQuietly(JSON.stringify({ version: 1, gradient: true, stops: [theme("s1"), custom("s2", RED)] }));
  check(11, "Settings saved before the text colour option (no textColour) → Auto, no warning",
    beforeText.loaded.textColour === "auto" && beforeText.loaded.gradient && beforeText.loaded.stops.length === 2 && beforeText.ours === 0,
    `${JSON.stringify(beforeText.loaded)}, ${beforeText.ours} warning(s)`);
  // Version 1 → 2: transparency removed. A fully transparent stop (kind or alpha 00) goes, a half
  // transparent one keeps its RGB; nothing left → the defaults. No warning either way.
  const v1 = (stops, gradient = true) => JSON.stringify({ version: 1, gradient, textColour: "white", stops });
  const mixed = loadQuietly(v1([{ id: "s1", kind: "transparent" }, custom("s2", "#ff000080"), custom("s3", BLUE)]));
  const alphaZero = loadQuietly(v1([custom("s1", "#00ff0000"), theme("s2"), custom("s3", "#123456ff")]));
  const allClear = loadQuietly(v1([{ id: "s1", kind: "transparent" }, { id: "s2", kind: "transparent" }, custom("s3", "#ffffff00")]));
  const loaded = (r) => `${JSON.stringify(r.loaded)} (${r.ours} warning(s))`;
  check(2, "Migration 1 → 2: one transparent, one half-transparent and one opaque stop → two opaque stops (the half-transparent one keeps its RGB)",
    mixed.loaded.version === 2 && mixed.loaded.stops.map((stop) => stop.color).join() === `${RED},${BLUE}` && mixed.loaded.gradient &&
      mixed.loaded.textColour === "white" && !mixed.ours &&
      alphaZero.loaded.stops.map((stop) => `${stop.kind}${stop.color ? ` ${stop.color}` : ""}`).join() === "theme,custom #123456" && !alphaZero.ours,
    `${loaded(mixed)}; alpha 00 / opaque 8-digit: ${loaded(alphaZero)}`);
  check(2, "Migration 1 → 2: only transparent stops → the defaults",
    JSON.stringify(allClear.loaded) === JSON.stringify(defaultSettings()) && !allClear.ours, loaded(allClear));
  setTestSettings(true, [theme("s1"), custom("s2", RED), custom("s4", BLUE)], "white");
  const writtenAtOnce = Spicetify.LocalStorage.get(settingsKey()) === JSON.stringify(settings);
  await sleep(SAVE_DELAY + 100);
  const reloaded = loadSettings();
  check(2, "Saves are debounced, then a load returns identical settings (round-trip, theme and custom stops, the text colour)",
    !writtenAtOnce && JSON.stringify(reloaded) === JSON.stringify(settings), `written at once ${writtenAtOnce}, ${JSON.stringify(reloaded)}`);
}
