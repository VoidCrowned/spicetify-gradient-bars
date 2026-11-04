// ── Two-step Reset (GPB #37) ──
// Reset can't be undone, so the first click only arms it
// ("Confirm reset?" in red); a second click within RESET_CONFIRM_MS resets. Only the label
// and a class change — the button node is never replaced, so its click target stays
// connected (GPB #26). A hidden copy of the longer label keeps the button's width fixed.

import { P } from "ext:config";
import { resetSettings } from "./stops.js";

export const RESET_CONFIRM_MS = 3000;

export const RESET_CONFIRM_LABEL = "Confirm reset?";

export function enableReset(m) {
  const button = m.resetButton;
  let timer = 0;
  const armed = () => button.classList.contains(`${P}-armed`);
  const disarm = () => {
    clearTimeout(timer);
    timer = 0;
    button.classList.remove(`${P}-armed`);
    m.resetLabel.textContent = "Reset";
  };
  button.addEventListener("click", () => {
    if (armed()) {
      disarm();
      resetSettings();
      return;
    }
    button.classList.add(`${P}-armed`);
    m.resetLabel.textContent = RESET_CONFIRM_LABEL;
    timer = setTimeout(disarm, RESET_CONFIRM_MS);
  });
  button.addEventListener("blur", () => armed() && disarm());
  disarmOnOutsideInput(m, () => (armed() ? button : null), disarm);
  m.cleanups.push(disarm); // clears the timer when the modal closes
}

// An armed two-step button (Reset, a preset chip) disarms on Escape — stopped there, so the
// modal stays — and on any pointerdown, click or keydown elsewhere. Enter/Space on the button
// itself is the confirmation. `armedEl()` returns the armed element or null.
export function disarmOnOutsideInput(m, armedEl, disarm) {
  const listen = (type, handler) => {
    document.addEventListener(type, handler, true);
    m.cleanups.push(() => document.removeEventListener(type, handler, true));
  };
  const elsewhere = (e) => {
    const el = armedEl();
    if (el && !el.contains(e.target)) disarm();
  };
  listen("pointerdown", elsewhere);
  listen("click", elsewhere);
  listen("keydown", (e) => {
    const el = armedEl();
    if (!el) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      disarm();
    } else if (!el.contains(e.target)) disarm();
  });
}
