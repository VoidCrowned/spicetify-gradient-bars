import { copyStatus } from "../shared/claim.js";
import { menuItemUsable, menuRegistered, shared } from "../shared/entry.js";
import { outline, spicetifyVersion } from "../shared/selftest.js";
import { api, startup } from "../shared/startup.js";
import { VERSION } from "./config.js";
import { FILL, HANDLE, SCOPE } from "./render.js";

export function domProbe() {
  const all = (sel) => document.querySelectorAll(sel).length;
  const wrapper =
    document.querySelector(SCOPE) ??
    document.querySelector('[data-testid="progress-bar"]')?.closest('[class*="playback"], [data-testid]')?.parentElement;
  return {
    scope: all(SCOPE),
    fill: all(`${SCOPE} ${FILL}`),
    handle: all(`${SCOPE} ${HANDLE}`),
    progressBars: all(".progress-bar, [data-testid='progress-bar']"),
    fillsAnywhere: all(FILL),
    songBarOutline: outline(wrapper, 0, 7, { encore: false }).join("\n") || "no progress bar found",
  };
}

export function statusReport() {
  const report = {
    version: VERSION,
    copy: copyStatus(), // which copy runs this bar: the standalone file or Gradient Bars
    phase: startup.phase,
    waitingFor: startup.waitingFor,
    entry: startup.entry,
    entryErrors: startup.entryErrors,
    error: startup.error,
    spotify: window.Spicetify?.Platform?.version ?? null,
    spicetify: spicetifyVersion(), // GPB #55
    apis: Object.fromEntries(["LocalStorage", "PopupModal", "Player", "Menu", "Topbar", "ReactJSX"].map((n) => [n, !!api(n)])),
    menu: { registered: menuRegistered, menuItemUsable: menuItemUsable() },
    topbar: { created: !!shared?.button, connected: !!shared?.button?.element?.isConnected },
    shared: shared?.status() ?? null, // GPB #58
    page: location.href,
    dom: domProbe(),
  };
  console.log(`[gpb] ${report.phase}${report.entry ? `, entry: ${report.entry}` : ""}`);
  return report;
}
