// ── Start-up status ─────────────────────────────────────────────────────────
// window.__gpb / __gcb exists from the first line, so a stuck or failed start-up is visible in
// devtools (`__gpb.status()`) instead of failing silently. Spotify updates can remove or
// delay Spicetify APIs and change the bar's DOM; status() reports both.

import { P } from "ext:config";

export const startup = { phase: "waiting for Spicetify", waitingFor: [], entry: null, entryErrors: [], error: null, since: Date.now() };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const api = (name) => window.Spicetify?.[name];

// Rendering only needs storage; the modal needs PopupModal and Player; the entry point
// extras are the profile menu (Menu) and the top bar (Topbar), both at once (GPB #45).
const REQUIRED = ["LocalStorage", "PopupModal", "Player"];

// Waits for REQUIRED, warning once after 10 s which ones are missing. Returns null without
// waiting when they're already there, so start-up then runs on synchronously, as it always has:
// `const waiting = waitForSpicetify(); if (waiting) await waiting;`
export function waitForSpicetify() {
  const missing = () => REQUIRED.some((name) => !api(name));
  const started = () => {
    startup.waitingFor = [];
    startup.phase = "starting";
  };
  if (!missing()) {
    started();
    return null;
  }
  return (async () => {
    let warned = false;
    while (missing()) {
      startup.waitingFor = REQUIRED.filter((name) => !api(name));
      if (!warned && Date.now() - startup.since > 10000) {
        warned = true;
        console.warn(`[${P}] Still waiting for Spicetify APIs: ${startup.waitingFor.join(", ")}`);
      }
      await sleep(300);
    }
    started();
  })();
}
