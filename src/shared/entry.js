// ── Entry points ────────────────────────────────────────────────────────────
// The settings open by right-clicking the bar (the extension's own listener), the shared top-bar
// button, the profile menu and window.__gpb.open() / __gcb.openSettings(). The top bar and the
// profile menu are registered in parallel; neither is the other's fallback (GPB #45).

// Profile-menu entry state (GPB #27). Up here because status() can run while start-up still waits.

import { ENTRY_LABEL, NAME, OWNER_BUTTON_ENTRY, P } from "ext:config";
import { openFromEntry } from "ext:hooks";
import { api, sleep, startup } from "./startup.js";

export let menuRegistered = false;

export let shared = null; // our handle on the shared top-bar entry (GPB #45, #58): joinGradientBars()

export function setShared(handle) {
  shared = handle;
}

const menuItemVerdicts = new WeakMap(); // MenuItem component → usable?

// A brush over a progress bar (GPB #44). Monochrome (currentColor follows the theme and hover),
// 16 × 16, no <defs> and no ids: ids in inline SVG are document-global. Used as-is by the top
// bar (the button's innerHTML) and the profile menu (nested inside Spotify's IconComponent,
// the way Spicetify renders its own named icons).
export const ENTRY_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M14.6 1.4a1.3 1.3 0 0 0-1.85 0L7.6 6.55l1.85 1.85 5.15-5.15a1.3 1.3 0 0 0 0-1.85zM6.7 7.5c-1.3 0-2.2 1-2.2 2.3 0 .5-.3.9-.9 1.1 1.5.9 4.3.7 4.9-1.3.1-.4.1-.7 0-1z"/><rect x="0.5" y="12.5" width="15" height="2.5" rx="1.25" opacity=".35"/><rect x="0.5" y="12.5" width="9" height="2.5" rx="1.25"/></svg>';

// ── Shared top-bar button (protocol 1) ──
// Gradient Connect Bar and Gradient Progress Bar share one top-bar button. Whichever starts
// first creates window.__gradientBars (it's the owner) and the only button; the other registers
// its entry. One entry: the button opens it directly. Two: a small menu with both. Each
// extension keeps its own right-click and profile-menu entries; the only call across is
// entries[i].open. This block depends on nothing but SELF, ENTRY_ICON and window.Spicetify.
// joinGradientBars() takes overrides for a separate test instance (key, prefix, createButton);
// the live registry uses the defaults. Released copies (GPB 1.7.0, GCB 1.0.0) contain this
// function byte for byte, so old and new builds share the button; protocol 1 is frozen, later
// protocols may only add fields. The self-test compares its SHA-256 with SHARED_ENTRY_SHA256,
// which the build computes, so every build checks it runs the same block (GPB #58).
export const SELF = { id: P, name: NAME, open: openFromEntry };

// SHA-256 of joinGradientBars() as it appears in the built file; scripts/build.mjs fills it in.
export const SHARED_ENTRY_SHA256 = "__SHARED_ENTRY_SHA256__";

// Hex SHA-256 of a string.
export async function sha256(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function joinGradientBars({ self = SELF, key = "__gradientBars", prefix = "gradient-bars", createButton = null } = {}) {
  const PROTOCOL = 1;
  const MULTI_LABEL = "Gradient bars";
  const GAP = 8; // menu below the button, and its distance from the window edges
  const makeButton = createButton ?? ((label, icon, onClick) => new window.Spicetify.Topbar.Button(label, icon, onClick));
  let button = null;
  let hideMenu = () => {};
  const errors = [];

  // The registry: created by the first extension, a synchronous check-and-set, so two that
  // start close together can't both become owner. Its shape is frozen for protocol 1.
  function ownerRegistry() {
    let menu = null;
    let anchor = null;
    let detach = null; // removes the open menu's listeners
    const items = () => [...menu.querySelectorAll(`.${prefix}-item`)];
    const reg = {
      protocol: PROTOCOL,
      owner: self.id,
      entries: [],
      // Adds, or replaces by id; sorted by name.
      register(entry) {
        const i = reg.entries.findIndex((e) => e.id === entry.id);
        if (i === -1) reg.entries.push(entry);
        else reg.entries[i] = entry;
        reg.entries.sort((a, b) => a.name.localeCompare(b.name));
        reg.refresh();
      },
      refresh() {
        if (button) button.label = reg.entries.length === 1 ? reg.entries[0].name : MULTI_LABEL;
      },
      // One entry: open it. Two or more: toggle the menu. Entries are read at click time.
      click(at) {
        if (reg.entries.length === 1) return reg.entries[0].open();
        if (menu && !menu.hidden) return hide();
        // Keyboard activation clicks with detail 0 (or isn't a click at all).
        const e = window.event;
        show(at, e ? e.type !== "click" || e.detail === 0 : !!at?.matches?.(":focus-visible"));
      },
    };

    // One element, appended once, hidden and shown, never removed while the page lives.
    function build() {
      menu = document.getElementById(`${prefix}-menu`);
      if (menu) return;
      menu = document.createElement("div");
      menu.id = `${prefix}-menu`;
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", MULTI_LABEL);
      menu.hidden = true;
      menu.innerHTML = `<style>
#${prefix}-menu { position: fixed; z-index: 9999; display: flex; flex-direction: column; box-sizing: border-box; min-width: 180px; padding: 4px; border-radius: 8px; background-color: var(--spice-card, var(--spice-main)); color: var(--spice-text); box-shadow: 0 8px 24px rgba(0, 0, 0, .5); }
#${prefix}-menu[hidden] { display: none; }
.${prefix}-item { padding: 8px 12px; border: 0; border-radius: 4px; background: none; color: inherit; font: inherit; font-size: .875rem; text-align: left; white-space: nowrap; cursor: pointer; }
.${prefix}-item:hover, .${prefix}-item:focus-visible { outline: none; background-color: color-mix(in srgb, var(--spice-button) 20%, transparent); }
</style>`;
      menu.addEventListener("keydown", (e) => {
        const list = items();
        const i = list.indexOf(document.activeElement);
        const next = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 }[e.key];
        if (next !== undefined) {
          e.preventDefault();
          list[(next + list.length) % list.length]?.focus();
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (i !== -1) activate(i);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          hide({ refocus: true });
        } else if (e.key === "Tab") hide();
      });
      menu.addEventListener("click", (e) => {
        const item = e.target.closest(`.${prefix}-item`);
        if (item) activate(items().indexOf(item));
      });
      document.body.append(menu);
    }

    // The items are rebuilt on opening only, never during a click on one of them.
    function show(at, keyboard) {
      build();
      for (const item of items()) item.remove();
      for (const entry of reg.entries) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = `${prefix}-item`;
        item.setAttribute("role", "menuitem");
        item.dataset.entry = entry.id;
        item.textContent = entry.name;
        menu.append(item);
      }
      anchor = at ?? null;
      menu.hidden = false;
      place();
      const outside = (e) => !menu.contains(e.target) && !anchor?.contains(e.target) && hide();
      const close = () => hide();
      document.addEventListener("pointerdown", outside, true);
      document.addEventListener("scroll", close, true);
      window.addEventListener("blur", close);
      window.addEventListener("resize", close);
      detach = () => {
        document.removeEventListener("pointerdown", outside, true);
        document.removeEventListener("scroll", close, true);
        window.removeEventListener("blur", close);
        window.removeEventListener("resize", close);
      };
      if (keyboard) items()[0]?.focus({ preventScroll: true });
    }

    // 8 px below the button, right edges aligned, clamped into the window.
    function place() {
      const r = anchor?.getBoundingClientRect() ?? { right: innerWidth - GAP, bottom: GAP };
      const { width, height } = menu.getBoundingClientRect();
      const left = Math.min(Math.max(r.right - width, GAP), Math.max(GAP, innerWidth - GAP - width));
      const top = Math.min(Math.max(r.bottom + GAP, GAP), Math.max(GAP, innerHeight - GAP - height));
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    }

    function hide({ refocus = false } = {}) {
      if (!menu || menu.hidden) return;
      menu.hidden = true;
      detach?.();
      detach = null;
      if (refocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
    }
    hideMenu = hide;

    // Hidden first, then opened in the next task: the clicked item stays connected.
    function activate(i) {
      const entry = reg.entries[i];
      hide();
      if (entry) setTimeout(() => entry.open(), 0);
    }

    return reg;
  }

  const found = window[key];
  let registry = null;
  let role;
  if (found?.protocol === PROTOCOL) {
    registry = found;
    role = "member";
  } else if (found) role = `own button (protocol ${found.protocol})`;
  else {
    registry = window[key] = ownerRegistry();
    role = "owner";
  }
  registry?.register(self);

  // The owner (or, next to another protocol, each extension) creates one button at most. It
  // stays registered while it isn't on screen yet: Spicetify mounts it once it finds its top bar.
  function ensureButton() {
    if (button || role === "member") return button;
    if (!createButton && !window.Spicetify?.Topbar?.Button) return null;
    try {
      if (registry) {
        button = makeButton(self.name, ENTRY_ICON, () => registry.click(button?.element));
        registry.refresh();
      } else button = makeButton(self.name, ENTRY_ICON, () => self.open());
    } catch (e) {
      errors.push(`Topbar: ${e?.message || e}`);
    }
    return button;
  }

  return {
    role,
    registry,
    errors,
    ensureButton,
    get button() {
      return button;
    },
    status: () => ({
      protocol: registry?.protocol ?? found?.protocol ?? PROTOCOL,
      role,
      owner: registry?.owner ?? null,
      entries: registry ? registry.entries.map((e) => e.id) : [self.id],
    }),
    // Test instances only: the live menu and registry stay for the page's lifetime.
    dispose() {
      hideMenu();
      document.getElementById(`${prefix}-menu`)?.remove();
      button?.element?.remove();
      if (role === "owner" && window[key] === registry) delete window[key];
    },
  };
}

// Spicetify renders its profile-menu items inside Spotify's legacy menu. On Spotify 1.3.4,
// Spicetify.ReactComponent.MenuItem resolves to Spotify's V2-only item, which throws "cannot be
// rendered outside a collection" there, so with any Spicetify item registered the profile menu
// doesn't open at all (spicetify/cli#4012). The V2-only item's source has "forceV2LeadingIcon"
// but not "aria-describedby"; Spotify's layout-switching item, the right one, has both.
// Unknown shapes count as usable. Cached per component, since shouldAdd runs on every render.
export function menuItemUsable() {
  const component = api("ReactComponent")?.MenuItem;
  if (!component || !["function", "object"].includes(typeof component)) return true;
  if (!menuItemVerdicts.has(component)) {
    const fn = typeof component === "function" ? component : component.render ?? component.type?.render ?? component.type;
    let source = "";
    try {
      source = Function.prototype.toString.call(fn);
    } catch {}
    menuItemVerdicts.set(component, !(source.includes("forceV2LeadingIcon") && !source.includes("aria-describedby")));
  }
  return menuItemVerdicts.get(component);
}

// Both Spicetify entries, independently and at the same time, not one as the other's fallback:
// people look for settings in different places (GPB #45). The menu's ReactJSX wait never delays
// the top bar. Resolves to a description of what's registered, or null.
export async function registerSpicetifyEntries() {
  const entries = await Promise.all([registerMenuEntry(), registerTopbarEntry()]);
  return entries.filter(Boolean).join(" + ") || null;
}

async function registerMenuEntry() {
  if (!api("Menu")?.Item) return null;
  // Menu.Item's constructor calls Spicetify.ReactJSX.jsx() right away, and spicetify-bindings
  // set ReactJSX only after CLI extensions have started: "reading 'jsx'" (GPB #27). Right-click
  // on the bar already works, so only this entry waits.
  for (let waited = 0; !window.Spicetify?.ReactJSX?.jsx && waited < 15000; waited += 250) await sleep(250);
  if (!window.Spicetify?.ReactJSX?.jsx) {
    startup.entryErrors.push("Menu: Spicetify.ReactJSX not ready after 15 s");
    return null;
  }
  try {
    const item = new Spicetify.Menu.Item(ENTRY_LABEL, false, openFromEntry, ENTRY_ICON);
    // On an affected build our entry must never be what breaks the profile menu. shouldAdd
    // runs on every render, so the entry appears by itself once MenuItem is fixed.
    const base = item.shouldAdd;
    item.shouldAdd = (...a) => menuItemUsable() && base(...a);
    item.register();
    window[`__${P}`].menuItem = item;
    menuRegistered = true;
    // Items render when the menu opens, so this can't be checked here.
    return menuItemUsable() ? "profile menu" : "profile menu (hidden while Spicetify's MenuItem is broken)";
  } catch (e) {
    startup.entryErrors.push(`Menu: ${e?.message || e}`);
    return null;
  }
}

// The shared top-bar button (GPB #58): a member creates none (the owner's button lists us); the
// owner (or, next to another protocol, each extension) creates one once Spicetify.Topbar exists,
// waiting up to 15 s for it. One button at most. One that isn't on screen yet stays registered:
// Spicetify keeps it and mounts it once it finds its top bar (GPB #38). Alone, the button opens the
// settings directly, as before.
async function registerTopbarEntry() {
  if (shared.role === "member") return `shared top-bar button (owner: ${shared.registry.owner})`;
  for (let waited = 0; !api("Topbar")?.Button && waited < 15000; waited += 250) await sleep(250);
  if (!api("Topbar")?.Button) return null;
  if (!shared.ensureButton()) {
    startup.entryErrors.push(...shared.errors);
    return null;
  }
  window[`__${P}`].topbarButton = shared.button;
  for (let waited = 0; waited < 4000; waited += 250) {
    if (shared.button.element?.isConnected) return shared.role === "owner" ? OWNER_BUTTON_ENTRY : "top bar button";
    await sleep(250);
  }
  startup.entryErrors.push("Topbar: button created, not on screen yet (Spicetify hasn't found its top bar)");
  return null;
}
