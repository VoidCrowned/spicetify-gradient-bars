// Gradient Bars: what the shared modules it uses (claim.js, report.js, clipboard.js) need to know.
// No imports.

export const P = "gb"; // the console tag [gb] and window.__gb
export const NAME = "Gradient Bars";
export const VERSION = "1.0.0";
export const FILE = "gradientBars.js";

// Where this copy was loaded from; currentScript is only set while the file first runs.
export const SOURCE = document.currentScript?.src || null;
