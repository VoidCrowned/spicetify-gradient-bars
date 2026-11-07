// ── Storage keys ────────────────────────────────────────────────────────────
// While a self-test runs, settings and presets are read and written under their own keys
// (<P>:selftest:settings, <P>:selftest:presets), so the real ones are never touched, however the
// run ends: force-close, crash or a devtools reload (#13). Start-up removes leftovers.

import { P, PRESETS_KEY, STORAGE_KEY } from "ext:config";

export const TEST_KEYS = { settings: `${P}:selftest:settings`, presets: `${P}:selftest:presets` };

let testKeys = false;

export const settingsKey = () => (testKeys ? TEST_KEYS.settings : STORAGE_KEY);
export const presetsKey = () => (testKeys ? TEST_KEYS.presets : PRESETS_KEY);

export function removeTestKeys() {
  Spicetify.LocalStorage.remove(TEST_KEYS.settings);
  Spicetify.LocalStorage.remove(TEST_KEYS.presets);
}

// On: the test keys start as copies of the real ones, so checks find what they'd find there.
// Off: back to the real keys, and the test keys are removed.
export function useTestKeys(on) {
  if (on) {
    for (const [real, test] of [[STORAGE_KEY, TEST_KEYS.settings], [PRESETS_KEY, TEST_KEYS.presets]]) {
      const value = Spicetify.LocalStorage.get(real);
      if (value == null) Spicetify.LocalStorage.remove(test);
      else Spicetify.LocalStorage.set(test, value);
    }
  }
  testKeys = on;
  if (!on) removeTestKeys();
}
