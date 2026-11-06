// Self-test results and the short report, shared by both bars' self-tests and Gradient Bars'.
// The report is the summary line plus one line per failed check; the full JSON on request.

// Results in the order they were checked. pass: true, false, or null for a skipped check.

import { writeClipboard } from "./clipboard.js";

// A number is an issue of the bar's own (old) repo, as in the baselines; this repo's issues in
// a bar's suite are written out ("gradient-bars#15"), since the old numbers overlap.
const tagIssue = (issue) => (String(issue).includes("#") ? String(issue) : `#${issue}`);

export function createResults() {
  const results = [];
  const check = (issue, name, pass, detail = "") =>
    results.push({ id: results.length + 1, issue: tagIssue(issue), check: name, pass: !!pass, detail: String(detail) });
  const skip = (issue, name, reason) =>
    results.push({ id: results.length + 1, issue: tagIssue(issue), check: name, pass: null, skipped: reason, detail: "" });
  return { results, check, skip };
}

export function summarise(results) {
  const failed = results.filter((r) => r.pass === false).length;
  const skipped = results.filter((r) => r.pass === null).length;
  const passed = results.length - failed - skipped;
  return `${passed}/${results.length - skipped} passed${skipped ? `, ${skipped} skipped` : ""}${failed ? `, ${failed} FAILED` : ""}`;
}

// The short report: the summary line, then one line per failed check (id, issue, check, detail).
export function reportLines(tag, report) {
  const oneLine = (text) => String(text).replace(/\s*\n\s*/g, " ⏎ ");
  return [
    `[${tag}] self-test: ${report.summary}`,
    ...report.results.filter((r) => r.pass === false).map((r) => `  ✗ ${r.id} ${r.issue} ${r.check} — ${oneLine(r.detail)}`),
  ];
}

// Logs the lines and copies them, or with `full` the whole report as JSON.
export async function printReport(tag, lines, report, { full = false } = {}) {
  console.log(lines.join("\n"));
  const copied = !!(await writeClipboard(full ? JSON.stringify(report, null, 2) : lines.join("\n")));
  if (!copied) console.warn(`[${tag}] Couldn't copy the report: it's the return value.`);
}
