// Gradient Progress Bar: recolours Spotify's song progress bar with a solid colour or a multi-stop
// gradient. Built into dist/gradientProgressBar.js, and into dist/gradientBars.js with Gradient
// Connect Bar.
//
// Compatibility rules (details in CLAUDE.md → Hard rules):
//  1. Every rule is scoped to the song progress bar — the volume slider never changes.
//  2. Never sets mask, height, width, transform, --progress-bar-height, --progress-bar-radius,
//     --progress-bar-transform or any other layout property on bar elements.
//     Only exception: Anchored mode sets transform: none and clip-path on the fill (GPB #15).
//  3. Never overrides --fg-color, --bg-color or --is-active-fg-color.
//  4. No !important — rules win by specificity only.
//  5. No element references from JS for the bar — one regenerated <style id="gpb-style">.
//  6. Inert by default: with default settings the stylesheet is empty.

import { COPY, claimBar } from "../shared/claim.js";
import { entryText, joinGradientBars, registerSpicetifyEntries, setShared } from "../shared/entry.js";
import { modal, openModal } from "../shared/modal.js";
import { loadPresets, setPresets } from "../shared/presets.js";
import { watchReducedMotion } from "../shared/hover.js";
import { removeTestKeys } from "../shared/keys.js";
import { flushSettings, loadSettings, setSettings } from "../shared/settings.js";
import { startup, waitForSpicetify } from "../shared/startup.js";
import { VERSION } from "./config.js";
import { statusReport } from "./diagnostics.js";
import { applyCss } from "./render.js";
import { selfTest } from "./selftest.js";
import { enableBarContextMenu } from "./ui.js";

export async function main() {
  // A second copy of this bar (the standalone file next to Gradient Bars) skips it entirely.
  if (!claimBar()) return;

  window.__gpb = {
    version: VERSION,
    copy: COPY,
    status: () => statusReport(),
    selfTest: async () => {
      console.warn(`[gpb] Not ready (${startup.phase}) — the self-test needs a started extension.`);
      return statusReport();
    },
  };

  const waiting = waitForSpicetify();
  if (waiting) await waiting;

  try {
    removeTestKeys(); // left over from a self-test that didn't end normally (#13)
    setSettings(loadSettings());
    setPresets(loadPresets()); // GPB #21
    window.addEventListener("beforeunload", flushSettings);
    applyCss(); // the bar works even if no entry point can be registered
    watchReducedMotion(applyCss); // the hover transition (#3)
    window.__gpb = { version: VERSION, copy: COPY, status: () => statusReport(), selfTest, open: () => modal || openModal() };
    startup.entry = enableBarContextMenu();
    setShared(joinGradientBars()); // GPB #58, synchronous: the registry is claimed before anything awaits
    startup.phase = "registering entry point";
    const extra = await registerSpicetifyEntries();
    if (extra) startup.entry += ` + ${extra}`;
    startup.phase = "ready";
    console.log(`[gpb] v${VERSION} ready — open the settings with a ${entryText()}.`);
    if (startup.entryErrors.length) console.warn("[gpb] Spicetify entry points unavailable:", startup.entryErrors.join("; "));
  } catch (e) {
    startup.phase = "failed";
    startup.error = e?.stack || String(e);
    console.error("[gpb] Start-up failed:", e);
  }
}

main();
