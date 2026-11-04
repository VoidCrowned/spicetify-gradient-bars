// ── Stops ───────────────────────────────────────────────────────────────────
// Changes to the colour stops, shared by the dots, the stepper, the menus and the picker.

// The selected stop: the dot with the ring (GPB #35). Only this module assigns it; everything else
// calls setSelectedId().

import { defaultSettings } from "ext:hooks";
import { MAX_STOPS } from "./constants.js";
import { setSettings, settings, update } from "./settings.js";

export let selectedId = null;

export function setSelectedId(id) {
  selectedId = id;
}

export function findStop(id) {
  return settings.stops.find((s) => s.id === id);
}

function nextStopId() {
  const ids = new Set(settings.stops.map((s) => s.id));
  let n = 1;
  while (ids.has(`s${n}`)) n++;
  return `s${n}`;
}

// A copy of the last stop at the end, selected: Duplicate on the last stop. With one colour
// the Gradient switch does the same (GPB #46).
export function addStop() {
  duplicateStop(settings.stops[settings.stops.length - 1].id);
}

// Inserts a copy directly after the stop (a theme stop stays a theme stop) and selects it.
// Returns the copy's id.
export function duplicateStop(id) {
  const index = settings.stops.findIndex((s) => s.id === id);
  if (index === -1 || settings.stops.length >= MAX_STOPS) return id;
  const copy = { ...settings.stops[index], id: nextStopId() };
  settings.stops.splice(index + 1, 0, copy);
  if (settings.stops.length === 2) settings.gradient = true; // a second colour implies a gradient
  selectedId = copy.id;
  update();
  return copy.id;
}

// Removing the selected stop selects the one now at its position (or the new last one).
// Returns that stop's id.
export function removeStop(id) {
  const index = settings.stops.findIndex((s) => s.id === id);
  if (index === -1 || settings.stops.length <= 1) return id;
  settings.stops.splice(index, 1);
  if (settings.stops.length === 1) settings.gradient = false;
  const neighbour = settings.stops[Math.min(index, settings.stops.length - 1)].id;
  if (selectedId === id) selectedId = neighbour;
  update();
  return neighbour;
}

// The button asks for a second click first (GPB #37, enableReset).
export function resetSettings() {
  setSettings(defaultSettings());
  selectedId = settings.stops[0].id;
  update();
}

// With one colour there's nothing to switch on, so the switch adds a second one, exactly
// like adding a colour; that turns the gradient on (GPB #46). The switch is never disabled.
export function toggleGradient() {
  if (settings.stops.length < 2) return addStop();
  settings.gradient = !settings.gradient;
  update();
}

// Editing a theme stop's colour turns it into a custom stop.
export function setStopColour(id, colour) {
  const stop = findStop(id);
  stop.kind = "custom";
  stop.color = colour;
  update({ rerender: false });
}

// `index` is an insertion point in the current order (0 … length).
export function moveStop(id, index) {
  const from = settings.stops.findIndex((s) => s.id === id);
  if (from === -1 || index === from || index === from + 1) return;
  const [stop] = settings.stops.splice(from, 1);
  settings.stops.splice(index > from ? index - 1 : index, 0, stop);
  update();
}

// Called from the picker, so the dots are updated in place, not re-rendered.
export function linkStopToTheme(id) {
  const stop = findStop(id);
  stop.kind = "theme";
  delete stop.color;
  update({ rerender: false });
}
