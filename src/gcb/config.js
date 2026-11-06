// Gradient Connect Bar: everything the shared modules need to know about this extension.
// No imports: the shared modules read these while they load.

export const P = "gcb"; // prefix of every id and class, the console tag [gcb] and window.__gcb
export const NAME = "Gradient Connect Bar"; // as in manifest.json; also the settings window's title
export const VERSION = "1.0.1";
export const FILE = "gradientConnectBar.js"; // the standalone file, for the copies check

// Where this copy was loaded from: the Marketplace (jsDelivr) or the CLI (Extensions folder).
// currentScript is only set before the first await, so capture it here.
export const SOURCE = document.currentScript?.src || null;

export const STORAGE_KEY = "gcb:settings";
export const PRESETS_KEY = "gcb:presets"; // GCB #29
export const GPB_STORAGE_KEY = "gpb:settings"; // Gradient Progress Bar's: never read or written, only compared (GCB #2)
export const SCHEMA_VERSION = 2; // 2: no transparency (MIGRATIONS[1])
// The setting next to gradient and stops: the text colour (GCB #11). Presets and share codes
// carry it under this key.
export const EXTRA_KEY = "textColour";
// Settings saved by a newer version: defaults in memory, the stored value left alone.
export const KEEP_NEWER_SETTINGS = true;
// No transparency anywhere: translucent colours count as no colour.
export const OPAQUE_ONLY = true;

export const ENTRY_LABEL = NAME;
export const TITLE = NAME; // the settings window's title
// startup.entry's text when we own the shared top-bar button.
export const OWNER_BUTTON_ENTRY = "top bar button (shared)";

export const HELP_LINES = [ // one line each, joined with <br>
  "Click a colour to edit it, drag to reorder, right-click to duplicate.",
  "+ adds a colour, − removes the selected one.",
  "Reset goes back to the bar's own colour.",
];

export const IMPORT_TITLE = "Paste a share code (Gradient Connect Bar or Gradient Progress Bar)";
export const CODE_PLACEHOLDER = "gcb1:… or gpb1:…";
// Undo messages after an import, by the code's origin (GCB #36).
export const IMPORTED = { gcb: "Imported code", gpb: "Imported code from Gradient Progress Bar" };
