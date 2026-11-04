// Gradient Progress Bar: everything the shared modules need to know about this extension.
// No imports: the shared modules read these while they load.

export const P = "gpb"; // prefix of every id and class, the console tag [gpb] and window.__gpb
export const NAME = "Gradient Progress Bar"; // as in manifest.json; also the settings window's title
export const VERSION = "1.7.0";
export const FILE = "gradientProgressBar.js"; // the standalone file, for the copies check (GPB #39)

// Where this copy was loaded from: the Marketplace (jsDelivr) or the CLI (extensions/).
// currentScript is only set before the first await, so capture it here (GPB #39).
export const SOURCE = document.currentScript?.src || null;

export const STORAGE_KEY = "gpb:settings";
export const PRESETS_KEY = "gpb:presets"; // GPB #21
export const SCHEMA_VERSION = 1;
// The setting next to gradient and stops: the Spread mode (GPB #15). Presets and share codes
// carry it under this key.
export const EXTRA_KEY = "mode";
// Settings saved by a newer version count as invalid and are reset (GCB keeps them instead).
export const KEEP_NEWER_SETTINGS = false;
// GPB's colour helpers accept translucent colours and drop the alpha.
export const OPAQUE_ONLY = false;

// The product name as in manifest.json, every word capitalised; the self-test compares it with
// the settings window's title.
export const ENTRY_LABEL = NAME;
// startup.entry's text when we own the shared top-bar button.
export const OWNER_BUTTON_ENTRY = "top bar button";

export const HELP_LINES = [ // one line each, joined with <br> (GPB #47, #49, #52)
  "Click a colour to edit it, drag to reorder, right-click to duplicate.",
  "+ adds a colour, − removes the selected one.",
  "Reset goes back to a single colour that follows your theme.",
];

export const IMPORT_TITLE = "Paste a share code";
export const CODE_PLACEHOLDER = "gpb1:… or gcb1:…";
// Undo messages after an import, by the code's origin (GPB #59).
export const IMPORTED = { gpb: "Imported code", gcb: "Imported code from Gradient Connect Bar" };
