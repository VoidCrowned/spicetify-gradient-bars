// ── Self-test (GCB #9) ──────────────────────────────────────────────────────
// `await __gcb.selfTest()` in devtools, ideally while audio plays on another device; the harness
// is shared/selftest.js, the checks are in checks.js. Checks that need the bar are skipped while
// it isn't there.

// ── Self-test ───────────────────────────────────────────────────────────────
// `await __gcb.selfTest()` in devtools. Drives the same functions and modal DOM the UI uses,
// checks computed styles on the live bar, then restores everything it touched. Checks that need
// the bar are skipped while it isn't there.

import { copyStatus } from "../shared/claim.js";
import { menuItemUsable, menuRegistered, shared } from "../shared/entry.js";
import { checkDuplicateGuard, closeOpenModal, copiesDetail, fileName, forwarders, lintCss, loadedCopies, otherFixes, runSelfTest, sameFileCopies, saveTestState, spicetifyVersion } from "../shared/selftest.js";
import { setSettings, update } from "../shared/settings.js";
import { sleep, startup } from "../shared/startup.js";
import { SELECTOR, barBase } from "./bar.js";
import { checkEntries, runChecks } from "./checks.js";
import { SCHEMA_VERSION, SOURCE, VERSION } from "./config.js";
import { domProbe, textStatus } from "./diagnostics.js";
import { DEFAULT_TEXT } from "./settings.js";
import { recalcTextColour } from "./text-colour.js";

const NO_BAR = "bar not present — play on another device";

// A hashed class from the verified markup; the lint must flag it.
export const HASHED_SAMPLE = ".alQyi9QVSuY6ma3oYVy6";

export const songchangeCount = () => Spicetify.Player.eventListeners?.songchange?.length ?? 0;

// Applies settings the way the UI does, then recalculates the text colour at once (no debounce).
export function setTestSettings(gradient, stops, textColour = DEFAULT_TEXT) {
  setSettings({ version: SCHEMA_VERSION, gradient, textColour, stops: stops.map((s) => ({ ...s })) });
  update();
  recalcTextColour();
}

// Properties our stylesheet may set, all inside the bar's rule.
const ALLOWED_PROPS = ["background-image", "--text-base", "--essential-base"];

// A hashed class name: a 16–20 character token with upper- and lower-case letters.
const HASH_LIKE = /(?<![\w-])[\w-]{16,20}(?![\w-])/g;

export const hashLike = (selector) => (selector.match(HASH_LIKE) ?? []).filter((t) => /[a-z]/.test(t) && /[A-Z]/.test(t));

// Anything translucent in the bar's CSS: colours are opaque only.
const OPACITY_RE = /rgba\(|\btransparent\b|#[0-9a-f]{8}\b/gi;

export const opacityIn = (css) => css.match(OPACITY_RE) ?? [];

// Everything our bar stylesheet must never do (CLAUDE.md → Hard rules).
export function cssProblems(css) {
  return lintCss(css, {
    whole: (text) => opacityIn(text).map((found) => `translucent colour ${found}`),
    rule: (sel) => [
      ...(sel !== SELECTOR ? [`rule not on the Connect bar: ${sel}`] : []),
      ...hashLike(sel).map((token) => `hash-like class name ${token}`),
    ],
    declaration: (sel, name) => {
      if (!name) return null;
      if (name === "--background-base") return "sets --background-base";
      return ALLOWED_PROPS.includes(name) ? null : `sets ${name}`;
    },
  });
}

// The CSS through the browser's own parser: every rule and every declaration must survive.
export function parseProblems(css) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const rules = [...sheet.cssRules];
  const written = [...css.matchAll(/\{([^}]*)\}/g)].map(([, body]) => body.split(";").filter((d) => d.trim()).length);
  const problems = [];
  if (rules.length !== written.length) problems.push(`${rules.length} of ${written.length} rules parsed`);
  rules.forEach((rule, i) => {
    if (rule.style?.length !== written[i]) problems.push(`rule ${i + 1}: ${rule.style?.length} of ${written[i]} declarations parsed`);
    if (rule.selectorText?.replace(/\s+/g, " ") !== SELECTOR) problems.push(`rule ${i + 1}: selector parsed as ${rule.selectorText}`);
  });
  return problems;
}

// A computed background-image as the browser serialises it, from one of our own elements.
let probeEl = null;

export function computedImage(image) {
  probeEl ??= Object.assign(document.createElement("span"), { className: "gcb-probe", hidden: true });
  if (!probeEl.isConnected) document.body.append(probeEl);
  probeEl.style.backgroundImage = image;
  const out = getComputedStyle(probeEl).backgroundImage;
  probeEl.remove();
  return out;
}

// The bar's computed state with our stylesheet on and off, read in the same task.
export function barWithAndWithout(bar, read) {
  const sheet = document.getElementById("gcb-style")?.sheet;
  if (sheet) sheet.disabled = true;
  const spotify = read(bar);
  if (sheet) sheet.disabled = false;
  return { ours: read(bar), spotify };
}

export const barGeometry = (bar) => {
  const cs = getComputedStyle(bar);
  const r = bar.getBoundingClientRect();
  return `${r.width.toFixed(1)}×${r.height.toFixed(1)}, radius ${cs.borderRadius}, background-color ${cs.backgroundColor}`;
};

function environment() {
  return {
    extension: VERSION,
    source: SOURCE,
    copies: loadedCopies(),
    forwarders: forwarders(), // #15: the old repos' files, which only load a copy from this repo
    copy: copyStatus(),
    spotify: Spicetify.Platform?.version ?? null,
    spicetify: spicetifyVersion(),
    theme: Spicetify.Config?.current_theme ?? null,
    colourScheme: Spicetify.Config?.color_scheme ?? null,
    extensions: Spicetify.Config?.extensions ?? null,
    gpb: window.__gpb?.version ?? null, // Gradient Progress Bar, if it runs alongside
    eyedropper: !!window.EyeDropper, // the picker's eyedropper button exists only with it
    spiceButton: getComputedStyle(document.documentElement).getPropertyValue("--spice-button").trim() || null,
    barBase: barBase(),
    textColour: textStatus(),
    entry: startup.entry,
    phase: startup.phase,
    entryErrors: startup.entryErrors,
    menu: { registered: menuRegistered, menuItemUsable: menuItemUsable() }, // info only, never a check
    topbar: { created: !!shared?.button, connected: !!shared?.button?.element?.isConnected },
    shared: shared?.status() ?? null,
    spicetifyFixes: otherFixes(), // whether the separate spicetify-fixes extension is what makes the entries work
    startupError: startup.error,
    dom: domProbe(), // includes an outline of the bar and the aside, for selector fixes after Spotify updates
  };
}

export function selfTest(options) {
  return runSelfTest(options, async ({ check, skip: skipFor }) => {
    const skip = (issue, name, reason = NO_BAR) => skipFor(issue, name, reason); // most skips: no bar
    // The entries can take up to 15 s to register (the profile menu waits for ReactJSX).
    for (let waited = 0; startup.phase === "registering entry point" && waited < 21000; waited += 300) await sleep(300);
    const env = environment();
    const state = saveTestState();
    closeOpenModal();
    try {
      const copies = sameFileCopies(env.copies);
      check(1, "Exactly one copy of the extension is loaded", copies.length === 1,
        copies.length === 1
          ? copiesDetail(env.copies)
          : `${copies.length} copies: ${copies.join(", ") || "none found"} (running: ${SOURCE ?? "unknown"}). Keep either the Marketplace install or the local CLI install (spicetify config extensions ${fileName()}-), not both.`);
      checkDuplicateGuard(check); // #15
      await checkEntries(check, skip);
      await runChecks(check, skip, state.rootStyle, state.restoreButton);
    } catch (e) {
      check(9, "Self-test ran to completion", false, e?.stack || e);
    } finally {
      state.restore();
    }
    return env;
  });
}
