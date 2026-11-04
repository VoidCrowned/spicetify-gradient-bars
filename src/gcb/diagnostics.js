import { copyStatus } from "../shared/claim.js";
import { menuItemUsable, menuRegistered, shared } from "../shared/entry.js";
import { outline, spicetifyVersion } from "../shared/selftest.js";
import { settings } from "../shared/settings.js";
import { api, startup } from "../shared/startup.js";
import { PARENT, SELECTOR, UNSCOPED } from "./bar.js";
import { VERSION } from "./config.js";
import { textResult } from "./text-colour.js";

export function domProbe() {
  const all = (sel) => document.querySelectorAll(sel).length;
  const aside = document.querySelector(PARENT);
  return {
    bar: all(SELECTOR),
    unscoped: all(UNSCOPED),
    accentSets: all(".encore-bright-accent-set"),
    aside: !!aside,
    asideChildren: aside ? [...aside.children].map((c) => outline(c, 0, 0)[0]) : [],
    barOutline: [...document.querySelectorAll(".encore-bright-accent-set")].map((el) => outline(el, 0, 2).join("\n")).join("\n") || "no .encore-bright-accent-set on the page",
  };
}

export function statusReport() {
  const report = {
    version: VERSION,
    copy: copyStatus(), // which copy runs this bar: the standalone file or Gradient Bars
    phase: startup.phase,
    waitingFor: startup.waitingFor,
    entry: startup.entry,
    error: startup.error,
    spotify: window.Spicetify?.Platform?.version ?? null,
    spicetify: spicetifyVersion(),
    apis: Object.fromEntries(["LocalStorage", "PopupModal", "Player", "Menu", "Topbar", "ReactJSX"].map((n) => [n, !!api(n)])),
    entryErrors: startup.entryErrors,
    menu: { registered: menuRegistered, menuItemUsable: menuItemUsable() },
    topbar: { created: !!shared?.button, connected: !!shared?.button?.element?.isConnected },
    shared: shared?.status() ?? null,
    // While start-up waits for Spicetify, the text colour's state isn't initialised yet.
    textColour: startup.phase === "waiting for Spicetify" ? null : textStatus(),
    page: location.href,
    dom: domProbe(),
  };
  console.log(`[gcb] ${report.phase}${report.entry ? `, entry: ${report.entry}` : ""}`);
  return report;
}

// The text colour in status() (GCB #17), for debugging: mode, the chosen colour, its worst-case
// contrast, the text region as fractions of the bar's width, and whether the bar is there.
export function textStatus() {
  const r = textResult;
  const round = (n) => (typeof n === "number" ? Math.round(n * 1000) / 1000 : null);
  const mode = settings?.textColour ?? null;
  return {
    mode,
    colour: r?.colour ?? null,
    contrast: round(r?.contrast),
    black: round(r?.black),
    white: round(r?.white),
    region: r?.region ? { from: round(r.region.from), to: round(r.region.to), measured: r.measured } : null,
    barPresent: !!document.querySelector(SELECTOR),
  };
}

export const notReady = (what) => () => console.warn(`[gcb] Not ready (${startup.phase}) — ${what} needs a started extension.`);
