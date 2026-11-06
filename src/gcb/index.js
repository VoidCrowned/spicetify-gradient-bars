// Gradient Connect Bar: recolours Spotify's Connect bar ("Playing on …") with a solid colour or a
// multi-stop gradient. Built into dist/gradientConnectBar.js, and into dist/gradientBars.js with
// Gradient Progress Bar.
//
// Compatibility rules (details in CLAUDE.md → Hard rules):
//  1. One injected stylesheet (<style id="gcb-style">), fully regenerated. No inline styles on Spotify
//     elements and no stored reference to the bar: Spotify removes and re-creates it.
//  2. Every rule targets the Connect bar through SELECTOR only. No hashed class names.
//  3. Paints background-image only, opaque colours only. --background-base is never changed.
//  4. No !important — rules win by specificity only.
//  5. Never reads or writes Gradient Progress Bar's storage key; both run side by side.

import { COPY, claimBar } from "../shared/claim.js";
import { entryText, joinGradientBars, registerSpicetifyEntries, setShared } from "../shared/entry.js";
import { loadPresets, setPresets } from "../shared/presets.js";
import { flushSettings, loadSettings, setSettings } from "../shared/settings.js";
import { startup, waitForSpicetify } from "../shared/startup.js";
import { VERSION } from "./config.js";
import { notReady, statusReport } from "./diagnostics.js";
import { selfTest } from "./selftest.js";
import { recalcTextColour, watchTextTriggers } from "./text-colour.js";
import { enableBarContextMenu, openSettings } from "./ui.js";

export async function main() {
  // A second copy of this bar (the standalone file next to Gradient Bars) skips it entirely.
  if (!claimBar()) return;

  window.__gcb = {
    version: VERSION,
    copy: COPY,
    status: () => statusReport(),
    selfTest: async () => {
      notReady("the self-test")();
      return statusReport();
    },
    openSettings: notReady("the settings"),
  };

  const waiting = waitForSpicetify();
  if (waiting) await waiting;

  try {
    setSettings(loadSettings());
    setPresets(loadPresets()); // GCB #29
    window.addEventListener("beforeunload", flushSettings);
    recalcTextColour(); // applies the stylesheet, text colour included, so there's no flash of the old one
    watchTextTriggers();
    window.__gcb = { version: VERSION, copy: COPY, status: () => statusReport(), selfTest, openSettings };
    startup.entry = enableBarContextMenu();
    setShared(joinGradientBars()); // synchronous: the registry is claimed before anything awaits
    startup.phase = "registering entry point";
    const extra = await registerSpicetifyEntries();
    if (extra) startup.entry += ` + ${extra}`;
    startup.phase = "ready";
    console.log(`[gcb] v${VERSION} ready — open the settings with a ${entryText()}, or __gcb.openSettings().`);
    if (startup.entryErrors.length) console.warn("[gcb] Spicetify entry points unavailable:", startup.entryErrors.join("; "));
  } catch (e) {
    startup.phase = "failed";
    startup.error = e?.stack || String(e);
    console.error("[gcb] Start-up failed:", e);
  }
}

main();
