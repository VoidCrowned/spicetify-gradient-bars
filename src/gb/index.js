// Gradient Bars: Gradient Progress Bar and Gradient Connect Bar in one file. Both bars run above
// this part of dist/gradientBars.js, each built exactly as its standalone file but marked as the
// Gradient Bars copy, with its own settings window, profile-menu entry, storage keys and
// window.__gpb / __gcb. They share the top-bar button through the same protocol as the two
// standalone files. This part only adds window.__gb.
//
// If a standalone copy of a bar is installed as well, whichever copy starts second skips that bar
// and logs one warning (shared/claim.js); __gb.status() says which copy runs each bar.

import { P, SOURCE, VERSION } from "./config.js";
import { COPY_NAMES } from "../shared/claim.js";
import { printReport, reportLines } from "../shared/report.js";
import { gbChecks } from "./checks.js";

export const BARS = ["gpb", "gcb"];

// Which copy runs each bar: "gb" (this file), "gpb" / "gcb" (the standalone file), or null.
export function status() {
  const bars = Object.fromEntries(BARS.map((id) => {
    const entry = window.__gradientBarsCopies?.[id];
    const api = window[`__${id}`];
    return [id, {
      name: COPY_NAMES[id],
      copy: entry?.active?.copy ?? (api ? id : null),
      version: entry?.active?.version ?? api?.version ?? null,
      skipped: entry?.skipped.map((c) => `${c.copy}${c.version ? ` ${c.version}` : ""}`) ?? [],
    }];
  }));
  return { version: VERSION, source: SOURCE, bars };
}

// Runs both bars' self-tests (whichever copy runs each) and Gradient Bars' own checks. Logs and
// copies one summary line per suite plus the failed checks; { full: true } copies all three
// reports as JSON. Resolves to { gpb, gcb, gb }.
export async function selfTest(options = {}) {
  const reports = {};
  const lines = [];
  for (const id of BARS) {
    const api = window[`__${id}`];
    const report = typeof api?.selfTest === "function" ? await api.selfTest({ quiet: true }) : null;
    reports[id] = report ?? null;
    if (report?.results) lines.push(...reportLines(id, report));
    else lines.push(`[${id}] self-test: not run (${api ? "already running, or this copy is too old to report" : `${COPY_NAMES[id]} isn't running`})`);
  }
  reports.gb = await gbChecks();
  lines.push(...reportLines(P, reports.gb));
  await printReport(P, lines, reports, options);
  return reports;
}

export function main() {
  window.__gb = { version: VERSION, status, selfTest };
}

main();
