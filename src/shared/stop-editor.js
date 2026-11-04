// ── Selection ──
// Exactly one dot is selected (it has the ring); the inline picker always edits it (GPB #35).
// selectedId lives in stops.js.

import { P } from "ext:config";
import { resolveStop } from "./colour.js";
import { MAX_STOPS } from "./constants.js";
import { REORDER_HINT, modal } from "./modal.js";
import { showInPicker } from "./picker.js";
import { settings } from "./settings.js";
import { duplicateStop, findStop, moveStop, removeStop, selectedId, setSelectedId } from "./stops.js";

export function dotEl(id) {
  return modal?.stopsRow.querySelector(`.${P}-stop[data-id="${CSS.escape(id)}"]`) ?? null;
}

// Moves the ring in place — the dots row is not re-rendered.
export function selectStop(id, { focusHex = false } = {}) {
  const stop = findStop(id);
  if (!stop || !modal) return;
  if (id !== selectedId) {
    dotEl(selectedId)?.classList.remove(`${P}-selected`);
    dotEl(selectedId)?.setAttribute("aria-current", "false");
    setSelectedId(id);
    dotEl(id).classList.add(`${P}-selected`);
    dotEl(id).setAttribute("aria-current", "true");
    showInPicker(stop);
  }
  if (focusHex) modal.hex.focus({ preventScroll: true });
}

// ── Dot menu popover (GPB #33) ──
// Rendered inside the modal root: Spicetify's PopupModal hides itself when a click lands
// outside .GenericModal (GPB #26). Shown and hidden, never removed while the modal is open, so a
// click is never dispatched to a detached element. Only the small menu is a popover: a theme
// can trap position: fixed inside the dialog (Hazy's backdrop-filter), so the picker is
// inline (GPB #35).

export let popover = null; // { id, el, anchor, at, openedAt } or null

const POPOVER_EDGE = 8; // min distance from the window edge

const POPOVER_GAP = 8; // between a dot and a popover anchored to it

// `at` is a viewport point (menu at the cursor); without it the popover sits under the dot.
// `anchor` is a dot by default, or a preset chip (GPB #21).
export function showPopover(id, el, at = null, anchor = dotEl(id)) {
  closePopover();
  if (!anchor) return false;
  popover = { id, el, anchor, at, openedAt: performance.now() };
  el.hidden = false;
  placePopover();
  return true;
}

export function closePopover({ focusDot = false } = {}) {
  if (!popover) return;
  const { el, anchor } = popover;
  popover = null;
  el.hidden = true; // hidden, not removed: it may contain the element being clicked (GPB #26)
  if (focusDot && anchor.isConnected) anchor.focus({ preventScroll: true });
}

export const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

// position: fixed escapes the modal's overflow clipping. A transformed ancestor would make
// it relative to that ancestor instead of the window; measuring at 0,0 finds the offset.
function placePopover() {
  const { el, anchor, at } = popover;
  el.style.left = el.style.top = "0px";
  const origin = el.getBoundingClientRect();
  const { width, height } = origin;
  let left, top;
  if (at) {
    left = at.x + width > innerWidth - POPOVER_EDGE ? at.x - width : at.x;
    top = at.y + height > innerHeight - POPOVER_EDGE ? at.y - height : at.y;
  } else {
    const r = anchor.getBoundingClientRect();
    left = r.left + r.width / 2 - width / 2;
    top = r.bottom + POPOVER_GAP;
    // Flip above the dot if it doesn't fit below but does above.
    if (top + height > innerHeight - POPOVER_EDGE && r.top - POPOVER_GAP - height >= POPOVER_EDGE)
      top = r.top - POPOVER_GAP - height;
  }
  left = clamp(left, POPOVER_EDGE, innerWidth - POPOVER_EDGE - width);
  top = clamp(top, POPOVER_EDGE, innerHeight - POPOVER_EDGE - height);
  el.style.left = `${left - origin.left}px`;
  el.style.top = `${top - origin.top}px`;
}

// Escape, or a click or focus anywhere outside the open menu, closes it. Listeners live
// only while the modal is open.
export function watchPopovers(m) {
  const listen = (target, type, handler) => {
    target.addEventListener(type, handler, true);
    m.cleanups.push(() => target.removeEventListener(type, handler, true));
  };
  const outside = (target) => popover && !popover.el.contains(target);
  listen(document, "pointerdown", (e) => outside(e.target) && closePopover());
  listen(document, "focusin", (e) => outside(e.target) && closePopover());
  listen(document, "keydown", (e) => {
    if (!popover || e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation(); // the menu closes, not the modal
    closePopover({ focusDot: true });
  });
  listen(window, "resize", () => closePopover());
  listen(document, "scroll", () => closePopover());
}

// Right-click (or the context-menu key / Shift+F10) on a dot: Duplicate, Remove (GPB #33).
export function enableDotMenu(m) {
  m.stopsRow.addEventListener("contextmenu", (e) => {
    const el = e.target.closest(`.${P}-stop`);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const id = el.dataset.id;
    // Shift+F10 / the menu key already opened it from keydown.
    if (popover?.id === id && performance.now() - popover.openedAt < 500) return;
    // A keyboard-triggered contextmenu has no pointer position on the dot.
    const r = el.getBoundingClientRect();
    const onDot = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    openMenu(id, onDot ? { at: { x: e.clientX, y: e.clientY } } : { keyboard: true });
  });
  m.stopsRow.addEventListener("keydown", (e) => {
    const el = e.target.closest(`.${P}-stop`);
    if (!el || !(e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) return;
    e.preventDefault();
    openMenu(el.dataset.id, { keyboard: true });
  });
  m.menu.addEventListener("keydown", (e) => {
    const items = menuItems();
    const i = items.indexOf(document.activeElement);
    const next = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (next !== undefined) {
      e.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    } else if (e.key === "Tab") {
      e.preventDefault();
      closePopover({ focusDot: true });
    }
  });
  m.duplicateItem.addEventListener("click", () => runMenuAction(duplicateStop));
  m.removeItem.addEventListener("click", () => runMenuAction(removeStop));
}

export const menuItems = () => [...modal.menu.querySelectorAll(`.${P}-menu-item:not(:disabled):not([hidden])`)];

// One menu element for dots (Duplicate, Remove) and own preset chips (Rename, Update, Delete).
export function setMenuKind(kind) {
  for (const item of [modal.duplicateItem, modal.removeItem]) item.hidden = kind !== "dot";
  for (const item of [modal.renameItem, modal.updatePresetItem, modal.deletePresetItem]) item.hidden = kind !== "chip";
  modal.menu.setAttribute("aria-label", kind === "dot" ? "Colour actions" : "Preset actions");
}

function openMenu(id, { at = null, keyboard = false } = {}) {
  setMenuKind("dot");
  modal.duplicateItem.disabled = settings.stops.length >= MAX_STOPS;
  modal.removeItem.disabled = settings.stops.length <= 1;
  if (showPopover(id, modal.menu, at) && keyboard) menuItems()[0]?.focus({ preventScroll: true });
}

// Hides the menu first, then acts: the clicked item stays connected, so the modal stays
// open (GPB #26). `action(id)` returns the id of the dot that should get focus afterwards.
function runMenuAction(action) {
  if (!popover) return;
  const { id } = popover;
  closePopover();
  const focusId = action(id);
  dotEl(focusId)?.focus({ preventScroll: true });
}

export let lastDragEnd = -Infinity; // set by drag-and-drop; a click right after a drag is ignored

export const STOP_GAP = 14; // matches .${P}-stops gap; .${P}-dots' 10 px gap + its 4 px padding put the stepper as far away (GPB #47, GPB #49)

// The dots are buttons, so dragging never fights a native colour input (GPB #8, GPB #31).
export function enableDragAndDrop(m) {
  const row = m.stopsRow;
  let dragId = null;
  let dropIndex = -1;

  const endDrag = () => {
    dragId = null;
    lastDragEnd = performance.now();
    row.querySelector(`.${P}-dragging`)?.classList.remove(`${P}-dragging`);
    row.querySelector(`.${P}-marker`).hidden = true;
  };

  row.addEventListener("dragstart", (e) => {
    const el = e.target.closest?.(`.${P}-stop`);
    if (!el || settings.stops.length < 2) return e.preventDefault();
    closePopover();
    dragId = el.dataset.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
    e.dataTransfer.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2);
    el.classList.add(`${P}-dragging`);
  });
  row.addEventListener("dragover", (e) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    dropIndex = dropIndexAt(row, e.clientX, e.clientY);
    showDropMarker(row, dropIndex);
  });
  row.addEventListener("dragleave", (e) => {
    if (!row.contains(e.relatedTarget)) row.querySelector(`.${P}-marker`).hidden = true;
  });
  row.addEventListener("drop", (e) => {
    e.preventDefault();
    const id = dragId;
    endDrag(); // before moveStop: re-rendering detaches the source, so its dragend never reaches us
    if (id) moveStop(id, dropIndex);
  });
  row.addEventListener("dragend", endDrag);
}

// Alt + ←/→ moves the focused dot one place, Alt + Home/End to the first or last place (GPB #24),
// through the same moveStop() as drag-and-drop. The row is re-rendered, so focus goes to the
// new node with the same id; the selection doesn't change. Plain arrows, Enter/Space and
// Shift+F10 are left alone.
export function enableKeyboardReorder(m) {
  m.stopsRow.addEventListener("keydown", (e) => {
    const el = e.target.closest(`.${P}-stop`);
    if (!el || !e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;
    const id = el.dataset.id;
    const from = settings.stops.findIndex((s) => s.id === id);
    const last = settings.stops.length - 1;
    const to = { ArrowLeft: from - 1, ArrowRight: from + 1, Home: 0, End: last }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    e.stopPropagation(); // Alt+←/→ is also Spotify's Back/Forward, even at the edges
    if (from === -1 || to < 0 || to > last || to === from) return;
    moveStop(id, to > from ? to + 1 : to); // moveStop takes an insertion point
    dotEl(id)?.focus();
    m.announce.textContent = `Moved to position ${to + 1} of ${last + 1}`;
  });
}

// Delete or Backspace on a focused dot removes that dot (GPB #49) through the same removeStop() as
// the dot menu and −, so the selection rule (GPB #35) applies. Focus goes to the dot now at its
// index. With one colour nothing is removed, but the key is still consumed. On .${P}-stops, so
// Backspace in the picker's text fields keeps editing text.
export function enableKeyboardRemove(m) {
  m.stopsRow.addEventListener("keydown", (e) => {
    const el = e.target.closest(`.${P}-stop`);
    if (!el || (e.key !== "Delete" && e.key !== "Backspace") || e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    const index = settings.stops.findIndex((s) => s.id === el.dataset.id);
    if (index === -1 || settings.stops.length <= 1) return;
    removeStop(el.dataset.id);
    dotEl(settings.stops[Math.min(index, settings.stops.length - 1)].id)?.focus();
    m.announce.textContent = `Colour removed, ${settings.stops.length} left`;
  });
}

// Insertion index under the pointer; the row wraps, so compare line first, then x.
function dropIndexAt(row, x, y) {
  const stops = [...row.querySelectorAll(`.${P}-stop`)];
  const i = stops.findIndex((el) => {
    const r = el.getBoundingClientRect();
    return y < r.top || (y <= r.bottom && x < r.left + r.width / 2);
  });
  return i === -1 ? stops.length : i;
}

// Absolutely positioned so showing it never reflows the row.
function showDropMarker(row, index) {
  const stops = row.querySelectorAll(`.${P}-stop`);
  const marker = row.querySelector(`.${P}-marker`);
  const rowRect = row.getBoundingClientRect();
  const ref = stops[Math.min(index, stops.length - 1)].getBoundingClientRect();
  const x = index < stops.length ? ref.left - STOP_GAP / 2 : ref.right + STOP_GAP / 2;
  marker.style.left = `${x - rowRect.left - 1}px`;
  marker.style.top = `${ref.top - rowRect.top}px`;
  marker.hidden = false;
}

export function renderStops() {
  const row = modal.stopsRow;
  row.textContent = "";
  settings.stops.forEach((stop, i) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `${P}-stop`;
    el.draggable = true;
    el.dataset.id = stop.id;
    el.dataset.index = String(i + 1);
    el.classList.toggle(`${P}-selected`, stop.id === selectedId);
    el.setAttribute("aria-current", String(stop.id === selectedId));
    // Kept but unused while the gradient is off.
    el.classList.toggle(`${P}-unused`, !settings.gradient && i > 0);
    row.appendChild(el);
    renderStop(stop);
  });
  const marker = document.createElement("div");
  marker.className = `${P}-marker`;
  marker.hidden = true;
  row.appendChild(marker);
}

// Updates one dot in place.
export function renderStop(stop) {
  const el = modal?.stopsRow.querySelector(`.${P}-stop[data-id="${stop.id}"]`);
  if (!el) return;
  const colour = resolveStop(stop);
  const isTheme = stop.kind === "theme";
  el.style.backgroundColor = colour;
  el.classList.toggle(`${P}-theme`, isTheme);
  const count = settings.stops.length;
  el.title = (isTheme ? "Theme colour" : colour) + (count > 1 ? `\n${REORDER_HINT}` : "");
  el.setAttribute("aria-label", `Colour ${el.dataset.index} of ${count}: ${isTheme ? "theme colour" : colour}`);
}
