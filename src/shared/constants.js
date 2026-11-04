// Constants with no dependencies. A module without imports is always evaluated before the
// modules that import it, so these are safe to use in other modules' top-level code.

export const MAX_STOPS = 8;
export const SAVE_DELAY = 250;
export const HEX_RE = /^#[0-9a-f]{6}$/i;
// Never resolved to a hex, so it follows runtime theme changes (e.g. Hazy's per-song accent).
export const THEME_COLOUR = "var(--spice-button, var(--spice-text, #1db954))";

export const PRESETS_VERSION = 1;
export const MAX_PRESETS = 12;
export const PRESET_NAME_MAX = 24;
