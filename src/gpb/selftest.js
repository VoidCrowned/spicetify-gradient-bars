// ── Self-test (GPB #23) ─────────────────────────────────────────────────────
// `await __gpb.selfTest()` in devtools; the harness is shared/selftest.js, the checks are in
// checks.js.

import { copyStatus } from "../shared/claim.js";
import { SELF, entryText, menuItemUsable, menuRegistered, shared } from "../shared/entry.js";
import { presets } from "../shared/presets.js";
import { checkDuplicateGuard, checkEntryText, checkHoverSettings, closeOpenModal, copiesDetail, fileName, forwarders, lintCss, loadedCopies, otherFixes, runSelfTest, sameFileCopies, saveTestState, spicetifyVersion } from "../shared/selftest.js";
import { BRIGHTEN, DEFAULT_HOVER, HOVER_TRANSITION } from "../shared/hover.js";
import { setSettings, update } from "../shared/settings.js";
import { api, sleep, startup } from "../shared/startup.js";
import { checkEntryIcon, checkHoverCss, checkSharedEntry, runChecks } from "./checks.js";
import { SCHEMA_VERSION, SOURCE, VERSION } from "./config.js";
import { domProbe } from "./diagnostics.js";
import { FILL, HANDLE, SCOPE } from "./render.js";
import { DEFAULT_MODE } from "./settings.js";

export const songFill = () => document.querySelector(`${SCOPE} ${FILL}`);

export const songHandle = () => document.querySelector(`${SCOPE} ${HANDLE}`);

// Other extensions add and remove their own listeners at any time, so the self-test looks for
// ours by identity rather than comparing counts across the run (GPB #60).
export const songchangeListeners = () => [...(Spicetify.Player.eventListeners?.songchange ?? [])];

// Variables themes and other extensions read from the bar — we must never change them.
export function barVars(fill) {
  const cs = getComputedStyle(fill.closest(".progress-bar") ?? fill);
  return ["--fg-color", "--bg-color", "--is-active-fg-color"]
    .map((v) => `${v}: ${cs.getPropertyValue(v).trim()}`)
    .join("; ");
}

// Size, shape and masking of the song bar — identical with and without our rules.
export function barGeometry(fill) {
  const bar = fill.closest(".progress-bar") ?? fill;
  const cs = getComputedStyle(bar);
  const areas = [...bar.querySelectorAll(".x-progressBar-sliderArea")];
  return JSON.stringify({
    vars: ["--progress-bar-height", "--progress-bar-radius"].map((v) => cs.getPropertyValue(v).trim()),
    heights: [bar, ...areas, fill].map((el) => el.offsetHeight),
    masks: areas.map((a) => {
      const style = getComputedStyle(a);
      return style.maskImage || style.webkitMaskImage || "none";
    }),
  });
}

export function setTestSettings(gradient, stops, mode = DEFAULT_MODE, hover = DEFAULT_HOVER) {
  setSettings({ version: SCHEMA_VERSION, gradient, mode, hover, stops: stops.map((s) => ({ ...s })) });
  update();
}

// Declarations our stylesheet must never contain (CLAUDE.md → Hard rules).
const FORBIDDEN_PROP =
  /^(-webkit-)?(mask(-.+)?|height|width|transform|clip-path|filter|transition(-.+)?|--progress-bar-.+|--fg-color|--bg-color|--is-active-fg-color)$/;

// The hover rules (#3): the fill's filter only while the song bar is hovered, and its transition on
// the fill's resting rule. No pseudo-elements anywhere (the handle's ::before is
// playback-bar-waveform's timestamp tooltip), and :hover nowhere else.
export const HOVER_RULE = `${SCOPE}:hover ${FILL}`;

// `mode` is the mode the CSS was built for. The only exception (GPB #15): Anchored's fill rule
// may set `transform: none` and `clip-path`.
export function cssProblems(css, mode) {
  return lintCss(css, {
    rule: (sel) => [
      ...(sel.startsWith(SCOPE) ? [] : [`unscoped rule: ${sel}`]),
      ...(sel.includes("::") || /:(before|after)\b/.test(sel) ? [`pseudo-element: ${sel}`] : []),
      ...(sel.includes(":hover") && sel !== HOVER_RULE ? [`:hover outside the hover rule: ${sel}`] : []),
    ],
    declaration: (sel, name, value) => {
      const anchoredFill = mode === "anchored" && sel === `${SCOPE} ${FILL}`;
      const allowed =
        (anchoredFill && ((name === "transform" && value === "none") || name === "clip-path")) ||
        (sel === HOVER_RULE && name === "filter" && value === BRIGHTEN) ||
        (sel === `${SCOPE} ${FILL}` && name === "transition" && value === HOVER_TRANSITION);
      return FORBIDDEN_PROP.test(name) && !allowed ? `sets ${name}` : null;
    },
  });
}

// The fill's computed transform with our stylesheet and without it, read in the same task so
// playback can't move in between.
export function fillTransforms(fill) {
  const sheet = document.getElementById("gpb-style")?.sheet;
  if (sheet) sheet.disabled = true;
  const spotify = getComputedStyle(fill).transform;
  if (sheet) sheet.disabled = false;
  return { ours: getComputedStyle(fill).transform, spotify };
}

// playback-bar-waveform masks the song bar's slider areas with held Web Animations.
export function hasMaskAnimation(el) {
  return el.getAnimations().some(
    (a) =>
      a.playState !== "idle" &&
      a.effect?.getKeyframes().some((k) => Object.keys(k).some((p) => /^(webkitM|m)ask/.test(p)))
  );
}

export function waveformActive() {
  if (!document.getElementById("progress_bar_waveform_mask")) return false;
  return [...document.querySelectorAll(`${SCOPE} .x-progressBar-sliderArea`)].some(hasMaskAnimation);
}

function environment() {
  return {
    extension: VERSION,
    source: SOURCE,
    copies: loadedCopies(),
    forwarders: forwarders(), // #15: the old repos' files, which only load a copy from this repo
    copy: copyStatus(),
    spotify: Spicetify.Platform?.version ?? null,
    spicetify: spicetifyVersion(), // GPB #55: which Spicetify release fixed the top bar and MenuItem
    spicetifyFixes: otherFixes(), // GPB #55: whether a separate fix extension is what makes them work
    theme: Spicetify.Config?.current_theme ?? null,
    colourScheme: Spicetify.Config?.color_scheme ?? null,
    extensions: Spicetify.Config?.extensions ?? null,
    waveform: waveformActive(),
    eyedropper: !!window.EyeDropper, // the picker's eyedropper button exists only with it
    presets: presets.length, // own presets (GPB #21)
    spiceButton: getComputedStyle(document.documentElement).getPropertyValue("--spice-button").trim() || null,
    entry: entryText(),
    phase: startup.phase,
    entryErrors: startup.entryErrors,
    menu: { registered: menuRegistered, menuItemUsable: menuItemUsable() }, // GPB #27; info only, never a check
    topbar: { created: !!shared?.button, connected: !!shared?.button?.element?.isConnected }, // GPB #45
    shared: shared?.status() ?? null, // GPB #58
    startupError: startup.error,
    dom: domProbe(), // includes the song bar's DOM outline, for selector fixes after Spotify updates
  };
}

export function selfTest(options) {
  return runSelfTest(options, async ({ check, skip }) => {
    const env = environment();
    check(55, "The environment block reports the Spicetify version", typeof env.spicetify === "string" && !!env.spicetify, env.spicetify);
    const state = saveTestState();
    closeOpenModal();
    try {
      // The entries can take up to 15 s to register (the profile menu waits for ReactJSX).
      for (let waited = 0; startup.phase === "registering entry point" && waited < 21000; waited += 300) await sleep(300);
      check(3, "Settings entry registered (profile menu or top bar)", startup.entry,
        [`${entryText() ?? "none"} (${startup.phase})`, ...startup.entryErrors, startup.error?.split("\n")[0]].filter(Boolean).join("; "));
      const menuApplicable = !!(api("Menu")?.Item && api("ReactJSX"));
      check(27, "Menu entry registered without throwing", !menuApplicable || menuRegistered,
        menuApplicable
          ? startup.entryErrors.filter((e) => e.startsWith("Menu:")).join("; ") || `registered${menuItemUsable() ? "" : ", hidden while Spicetify's MenuItem is broken (spicetify/cli#4012)"}`
          : `not applicable: Spicetify.Menu.Item ${api("Menu")?.Item ? "exists" : "missing"}, Spicetify.ReactJSX ${api("ReactJSX") ? "exists" : "missing"}`);
      const role = shared?.role ?? "none";
      check(45, "Top-bar button created as well, not only as a fallback: our own (owner, or next to another protocol) or the owner's shared one (#58)",
        !api("Topbar")?.Button || (role === "member" ? !shared.button && !!shared.registry?.entries.some((e) => e.id === SELF.id) : !!shared?.button),
        !api("Topbar")?.Button
          ? "not applicable: Spicetify.Topbar.Button missing"
          : role === "member"
            ? `member: the shared button is ${shared.registry.owner}'s`
            : !shared?.button
              ? startup.entryErrors.filter((e) => e.startsWith("Topbar:")).join("; ") || "not created"
              : shared.button.element?.isConnected
                ? `${role}, "${shared.button.label}", on screen`
                : `${role}, created, waiting for Spicetify's top bar (#38)`);
      const copies = sameFileCopies(env.copies);
      check(39, "Exactly one copy of the extension is loaded", copies.length === 1,
        copies.length === 1
          ? copiesDetail(env.copies)
          : `${copies.length} copies: ${copies.join(", ") || "none found"} (running: ${SOURCE ?? "unknown"}). Keep either the Marketplace install or the local CLI install (spicetify config extensions ${fileName()}-), not both.`);
      checkDuplicateGuard(check); // #15
      checkEntryText(check); // #6
      await checkEntryIcon(check);
      await checkSharedEntry(check);
      await runChecks(check, state.rootStyle, state.restoreButton);
      checkHoverSettings(check); // #3
      checkHoverCss(check, skip); // #3
    } catch (e) {
      check(23, "Self-test ran to completion", false, e?.stack || e);
    } finally {
      state.restore();
      state.checkRealKeys(check); // #13
    }
    return env;
  });
}
