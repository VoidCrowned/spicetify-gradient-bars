// ── Shared top-bar button (GPB #58) ──

import { clipboardSources } from "../shared/clipboard.js";
import { CODE_PREFIX, encodeCode } from "../shared/codes.js";
import { computedRgb, contrast, hexToRgb, hsvToHex, parseRgb, resolveStop, toHex } from "../shared/colour.js";
import { MAX_PRESETS, MAX_STOPS, PRESETS_VERSION, PRESET_NAME_MAX, SAVE_DELAY, THEME_COLOUR } from "../shared/constants.js";
import { ENTRY_ICON, SELF, SHARED_ENTRY_SHA256, joinGradientBars, sha256, shared } from "../shared/entry.js";
import { ADD_FULL_LABEL, ADD_LABEL, PICKER_COLUMNS_MIN, REMOVE_LABEL, REMOVE_LAST_LABEL, REORDER_HINT, closeModal, liveObservers, modal, modalCss, openModal } from "../shared/modal.js";
import { HEX_COPIED_MS, HEX_COPY_LABEL, copyHex, pickerHsv } from "../shared/picker.js";
import { APPLY_LABEL, COPIED_LABEL, COPIED_MS, COPY_HINT, EXPORT_LABEL, EXPORT_TITLE, IMPORT_ERROR, PREVIEW_CODE_MESSAGE, SAVE_FULL_LABEL, UNDO_MS, chipEl, copyCode, pendingUndo, renderChips } from "../shared/presets-ui.js";
import { BUILT_IN_PRESETS, addPreset, deletePreset, loadPresets, presetSettings, presets, renamePreset, sameSettings, savePresets, setPresets, uniqueName, updatePreset } from "../shared/presets.js";
import { RESET_CONFIRM_LABEL, RESET_CONFIRM_MS } from "../shared/reset.js";
import { BLUE, GREEN, PROBE, RED, computedHex, custom, styleText, theme, tick, waitFor, withoutTransitions } from "../shared/selftest.js";
import { loadSettings, setSettings, settings, update } from "../shared/settings.js";
import { api, sleep } from "../shared/startup.js";
import { STOP_GAP, closePopover, dotEl, popover, selectStop } from "../shared/stop-editor.js";
import { findStop, selectedId, setStopColour } from "../shared/stops.js";
import { ENTRY_LABEL, HELP_LINES, IMPORT_TITLE, PRESETS_KEY, SCHEMA_VERSION, STORAGE_KEY } from "./config.js";
import { statusReport } from "./diagnostics.js";
import { FILL, HANDLE, SCOPE, buildCss, fillImage } from "./render.js";
import { barGeometry, barVars, cssProblems, fillTransforms, hasMaskAnimation, setTestSettings, songFill, songHandle, songchangeListeners, waveformActive } from "./selftest.js";
import { GCB_CODE_PREFIX, MODES, decodeCode, defaultSettings } from "./settings.js";
import { MODE_LABELS, SPREAD_HINTS, SPREAD_OFF_HINT } from "./ui.js";

export async function checkSharedEntry(check) {
  const st = statusReport();
  const role = shared?.role ?? "none";
  check(58, "status() reports shared next to topbar",
    !!st.shared && ["protocol", "role", "owner", "entries"].every((k) => k in st.shared) && !!st.topbar && "created" in st.topbar,
    JSON.stringify({ topbar: st.topbar, shared: st.shared }));

  // The block's text is fixed. The build hashes joinGradientBars() as it lands in dist/ and puts
  // the hash into SHARED_ENTRY_SHA256, the same in every file it builds (npm run check fails
  // otherwise), so a hand-edited or mismatched build shows up here (GPB #58).
  let hashOk = false;
  let hashDetail;
  try {
    const block = Function.prototype.toString.call(joinGradientBars);
    const digest = await sha256(block);
    hashOk = digest === SHARED_ENTRY_SHA256;
    hashDetail = hashOk ? `${digest.slice(0, 16)}…, ${block.length} characters` : `${digest} — expected ${SHARED_ENTRY_SHA256}`;
  } catch (e) {
    hashDetail = `not measured: ${e?.message || e}`;
  }
  check(58, "Shared entry block unchanged: its SHA-256 (without SELF) is the one in SHARED_ENTRY_SHA256, as in GCB",
    hashOk || hashDetail.startsWith("not measured"), hashDetail);

  // The live registry: never touched by the self-test.
  const reg = window.__gradientBars;
  if (role.startsWith("own button")) check(58, "Live registry: protocol 1, our entry exactly once, sorted by name", true, `not ours to check: ${role}`);
  else {
    const names = reg?.entries.map((e) => e.name) ?? [];
    check(58, "Live registry: protocol 1, our entry exactly once, sorted by name",
      reg?.protocol === 1 && reg.entries.filter((e) => e.id === SELF.id).length === 1 &&
        names.join("|") === [...names].sort((a, b) => a.localeCompare(b)).join("|") && shared.registry === reg,
      `owner ${reg?.owner}, entries ${reg?.entries.map((e) => e.id).join(", ")}`);
  }
  const gcb = window.__gcb;
  if (!gcb) check(58, "With Gradient Connect Bar: exactly one top-bar button, the owner's", true, "not applicable: Gradient Connect Bar isn't running");
  else {
    const created = { gpb: !!st.topbar?.created, gcb: !!gcb.status?.().topbar?.created };
    check(58, "With Gradient Connect Bar: exactly one top-bar button, the owner's",
      Object.values(created).filter(Boolean).length === 1 && !!created[reg?.owner], `owner ${reg?.owner}; created ${JSON.stringify(created)}`);
  }
  // Alone, the button opens the settings directly, as in v1.6.1. Spicetify's Topbar.Button.element
  // is a wrapper <div>; the click handler is on its .button inside it.
  if (role === "owner" && reg?.entries.length === 1 && shared.button?.element?.isConnected) {
    (shared.button.button ?? shared.button.element).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    const opened = !!modal?.root.isConnected;
    const menuShown = !document.getElementById("gradient-bars-menu")?.hidden && !!document.getElementById("gradient-bars-menu");
    if (modal) {
      Spicetify.PopupModal.hide();
      closeModal(modal);
    }
    check(58, "Alone: the live top-bar button ('Gradient Progress Bar') opens the settings directly, no menu",
      opened && !menuShown && shared.button.label === "Gradient Progress Bar", `opened ${opened}, menu ${menuShown}, label "${shared.button.label}"`);
  } else
    check(58, "Alone: the live top-bar button ('Gradient Progress Bar') opens the settings directly, no menu", true,
      `not applicable: ${role}, ${reg?.entries.length ?? 0} entries, button ${shared?.button?.element?.isConnected ? "on screen" : "not on screen"}`);

  // A separate instance from the same factory: its own key and prefix, fake buttons, stub
  // opens; removed afterwards.
  const KEY = "__gradientBarsSelfTest";
  const OTHER_KEY = "__gradientBarsSelfTestOther";
  const PREFIX = "gradient-bars-selftest";
  const liveBefore = window.__gradientBars;
  const liveEntries = liveBefore?.entries.map((e) => e.id).join();
  const opened = [];
  const buttons = [];
  const fakeButton = (label, icon, onClick) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `${PREFIX}-anchor`;
    el.textContent = "♪";
    Object.assign(el.style, { position: "fixed", top: "12px", right: "60px", width: "32px", height: "32px", zIndex: "99999" });
    el.addEventListener("click", () => onClick());
    document.body.append(el);
    const fake = { element: el, label, icon };
    buttons.push(fake);
    return fake;
  };
  const entry = (id, name) => ({ id: `${id}-selftest`, name, open: () => opened.push(id) });
  const clickAt = (el, keyboard = false) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: keyboard ? 0 : 1 }));
  const key = (el, k) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  const menuEl = () => document.getElementById(`${PREFIX}-menu`);
  const shown = () => !!menuEl() && !menuEl().hidden;
  const items = () => [...(menuEl()?.querySelectorAll(`.${PREFIX}-item`) ?? [])];
  let a, b, c;
  try {
    a = joinGradientBars({ self: entry("gpb", "Gradient Progress Bar"), key: KEY, prefix: PREFIX, createButton: fakeButton });
    a.ensureButton();
    const anchor = a.button?.element;
    clickAt(anchor);
    check(58, "Protocol test instance, one entry: the owner's button opens it directly (no menu), labelled with its name",
      a.role === "owner" && window[KEY]?.protocol === 1 && opened.join() === "gpb" && !shown() && a.button.label === "Gradient Progress Bar",
      `role ${a.role}, opened ${opened.join() || "nothing"}, menu ${shown() ? "shown" : "none"}, label "${a.button?.label}"`);

    b = joinGradientBars({ self: entry("gcb", "Gradient Connect Bar"), key: KEY, prefix: PREFIX, createButton: fakeButton });
    const memberButton = b.ensureButton();
    opened.length = 0;
    clickAt(anchor);
    const names = items().map((el) => el.textContent).join(", ");
    const r = anchor.getBoundingClientRect();
    const mr = menuEl()?.getBoundingClientRect();
    const roles = menuEl()?.getAttribute("role") === "menu" && items().every((el) => el.getAttribute("role") === "menuitem");
    check(58, "Two entries: one button only ('Gradient bars'); a click shows the menu with both, in name order, 8 px below the button, right edges aligned",
      b.role === "member" && !memberButton && buttons.length === 1 && a.button.label === "Gradient bars" && shown() && roles &&
        names === "Gradient Connect Bar, Gradient Progress Bar" && !opened.length && document.activeElement !== items()[0] &&
        Math.abs(mr.top - (r.bottom + 8)) <= 1 && Math.abs(mr.right - r.right) <= 1 && menuEl().parentElement === document.body,
      `member ${b.role}, buttons ${buttons.length}, label "${a.button.label}", items ${names}; menu ${mr ? `${mr.left.toFixed(0)},${mr.top.toFixed(0)}–${mr.right.toFixed(0)}` : "none"}, button bottom ${r.bottom.toFixed(0)}, right ${r.right.toFixed(0)}`);

    const steps = [];
    const step = (label, ok) => steps.push(`${label}${ok ? "" : " ✗"}`);
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    step("outside pointerdown closes", !shown());
    anchor.focus();
    clickAt(anchor, true);
    const list = items();
    step("keyboard open focuses the first item", shown() && document.activeElement === list[0]);
    key(document.activeElement, "ArrowDown");
    step("↓", document.activeElement === list[1]);
    key(document.activeElement, "ArrowDown");
    step("↓ wraps", document.activeElement === list[0]);
    key(document.activeElement, "ArrowUp");
    step("↑ wraps", document.activeElement === list[1]);
    key(document.activeElement, "Home");
    step("Home", document.activeElement === list[0]);
    key(document.activeElement, "End");
    step("End", document.activeElement === list[1]);
    key(document.activeElement, "Escape");
    step("Escape closes and refocuses the button", !shown() && document.activeElement === anchor);
    clickAt(anchor, true);
    key(document.activeElement, "Tab");
    step("Tab closes", !shown());
    clickAt(anchor);
    window.dispatchEvent(new Event("blur"));
    step("window blur closes", !shown());
    clickAt(anchor);
    window.dispatchEvent(new Event("resize"));
    step("resize closes", !shown());
    clickAt(anchor);
    clickAt(anchor);
    step("a second click on the button closes", !shown());
    check(58, "Menu keyboard and closing: first item focused from the keyboard, ↑/↓ wrap, Home/End, Escape, Tab, outside pointerdown, blur, resize",
      !steps.some((x) => x.endsWith("✗")), steps.join("; "));

    opened.length = 0;
    clickAt(anchor);
    const second = items()[1];
    second.click();
    const hiddenFirst = !shown() && !opened.length && second.isConnected;
    await tick();
    const thenOpened = opened.join();
    anchor.focus();
    clickAt(anchor, true);
    key(document.activeElement, "Enter");
    const enterHidden = !shown() && opened.length === 1;
    await tick();
    check(58, "Activating an item hides the menu first, then opens that entry in the next task (click and Enter)",
      hiddenFirst && thenOpened === "gpb" && enterHidden && opened.join() === "gpb,gcb",
      `hidden first ${hiddenFirst}, then opened ${thenOpened}; Enter: hidden first ${enterHidden}, opened ${opened.join()}`);

    window[OTHER_KEY] = { protocol: 2, entries: [] };
    c = joinGradientBars({ self: entry("gpb", "Gradient Progress Bar"), key: OTHER_KEY, prefix: `${PREFIX}-other`, createButton: fakeButton });
    c.ensureButton();
    opened.length = 0;
    clickAt(c.button.element);
    check(58, "Another protocol: own button path, its own label, opens directly, the foreign registry untouched",
      c.role === "own button (protocol 2)" && !c.registry && c.button?.label === "Gradient Progress Bar" && opened.join() === "gpb" &&
        JSON.stringify(window[OTHER_KEY]) === JSON.stringify({ protocol: 2, entries: [] }) && c.status().role === "own button (protocol 2)",
      `role ${c.role}, label "${c.button?.label}", opened ${opened.join()}, registry ${JSON.stringify(window[OTHER_KEY])}`);
  } catch (e) {
    check(58, "Protocol test instance ran", false, e?.stack || e);
  } finally {
    a?.dispose();
    b?.dispose();
    c?.dispose();
    delete window[KEY];
    delete window[OTHER_KEY];
    for (const fake of buttons) fake.element.remove();
  }
  check(58, "The live registry is untouched by the test instance; nothing of the test instance is left",
    window.__gradientBars === liveBefore && window.__gradientBars?.entries.map((e) => e.id).join() === liveEntries &&
      !(KEY in window) && !(OTHER_KEY in window) && !document.querySelector(`[id^="${PREFIX}"], [class^="${PREFIX}"]`),
    `live entries ${window.__gradientBars?.entries.map((e) => e.id).join() ?? "none"}`);
}

// ── Entry icon (GPB #44) ──
export async function checkEntryIcon(check) {
  check(44, "Entry icon: currentColor, 16 × 16 viewBox, no id= and no <defs>",
    ENTRY_ICON.includes("currentColor") && ENTRY_ICON.includes('viewBox="0 0 16 16"') &&
      !ENTRY_ICON.includes("id=") && !ENTRY_ICON.includes("<defs"),
    `${ENTRY_ICON.length} characters`);

  // On-screen size of our 16 × 16 viewBox. Not getBoundingClientRect(): for a nested <svg>
  // that measures the painted shapes, not the viewport.
  const px = (svg) => {
    const m = svg?.getScreenCTM?.();
    return m ? [16 * Math.hypot(m.a, m.b), 16 * Math.hypot(m.c, m.d)] : null;
  };
  const size = (svg) => px(svg)?.map((n) => n.toFixed(1)).join(" × ").concat(" px") ?? "not rendered";
  const is16 = (svg) => !!px(svg)?.every((n) => Math.abs(n - 16) <= 1);

  // Ours, or the owner's shared one (GPB #58): the same icon either way.
  const button = shared?.button?.element ??
    [...document.querySelectorAll("button[aria-label]")].find((el) => ["Gradient bars", "Gradient Connect Bar"].includes(el.getAttribute("aria-label")));
  const svg = button?.querySelector("svg");
  if (svg) {
    const fill = getComputedStyle(svg).fill;
    const colour = getComputedStyle(button).color;
    const sameColour = fill === colour || String(parseRgb(fill)) === String(parseRgb(colour));
    check(44, "Top-bar icon renders at 16 × 16 px and takes the button's colour", is16(svg) && sameColour,
      `${size(svg)}, fill ${fill}, button colour ${colour}`);
  } else {
    check(44, "Top-bar icon renders at 16 × 16 px and takes the button's colour", true,
      "top-bar button not connected; expected on Spicetify ≤ 2.45.3 until its class-map fix for Spotify 1.3.4 is released (#38)");
  }

  // The profile menu renders only while it's open, so render the icon the way Spicetify's
  // createIconComponent() does — our string inside Spotify's IconComponent — off-screen.
  const Icon = api("ReactComponent")?.IconComponent;
  const React = api("React");
  const ReactDOM = api("ReactDOM");
  if (!Icon || !React || !ReactDOM) {
    check(44, "Profile-menu icon: nested in Spotify's IconComponent, our <svg> renders at 16 × 16 px", true,
      "IconComponent, React or ReactDOM not exposed by Spicetify; not measured");
    return;
  }
  const host = document.createElement("div");
  host.className = "gpb-icon-probe";
  host.style.cssText = "position: fixed; left: 0; top: 0; visibility: hidden; pointer-events: none";
  document.body.append(host);
  let root;
  try {
    root = ReactDOM.createRoot?.(host);
    const icon = React.createElement(Icon, { iconSize: 16, dangerouslySetInnerHTML: { __html: ENTRY_ICON } });
    if (root) root.render(icon);
    else ReactDOM.render(icon, host);
    await sleep(150);
    const outer = host.querySelector("svg");
    const inner = outer?.querySelector("svg");
    check(44, "Profile-menu icon: nested in Spotify's IconComponent, our <svg> renders at 16 × 16 px", is16(inner),
      inner
        ? `ours ${size(inner)}; IconComponent ${outer.getBoundingClientRect().width.toFixed(1)} px, viewBox ${outer.getAttribute("viewBox")}`
        : `no nested <svg>: ${host.innerHTML.slice(0, 120)}`);
  } catch (e) {
    check(44, "Profile-menu icon: nested in Spotify's IconComponent, our <svg> renders at 16 × 16 px", false,
      `rendering IconComponent failed: ${e?.message || e}`);
  } finally {
    try {
      if (root) root.unmount();
      else ReactDOM.unmountComponentAtNode?.(host);
    } catch {}
    host.remove();
  }
}

export async function runChecks(check, rootStyle, restoreButton) {
  // ── Rendering ──
  setSettings(defaultSettings());
  update();
  check(1, "Default settings → #gpb-style is empty", styleText() === "", JSON.stringify(styleText()));

  const samples = [
    [false, [custom("s1", RED)]],
    [true, [theme("s1"), custom("s2", RED), custom("s3", BLUE)]],
    [false, [custom("s1", RED), theme("s2"), custom("s3", BLUE)]],
  ];
  const css = (mode, gradient, stops) => buildCss({ version: SCHEMA_VERSION, gradient, mode, stops });
  const problems = MODES.flatMap((mode) =>
    samples.flatMap(([gradient, stops]) => cssProblems(css(mode, gradient, stops), mode).map((p) => `${mode}: ${p}`))
  );
  check(1, "CSS: every rule scoped, no !important, no forbidden properties (all three modes)", !problems.length,
    problems.join("; ") || `${samples.length} samples × ${MODES.length} modes clean`);
  // The linter itself: Anchored's exception must not leak into other modes or rules.
  const anchoredCss = css("anchored", true, [custom("s1", RED), custom("s2", BLUE)]);
  const leaks = {
    "Anchored CSS checked as Compress": cssProblems(anchoredCss, "compress"),
    "Anchored CSS checked as Slide": cssProblems(anchoredCss, "slide"),
    "transform other than none": cssProblems(anchoredCss.replace("transform: none", "transform: translateX(0)"), "anchored"),
    "transform on the handle": cssProblems(anchoredCss.replace(`${HANDLE} {`, `${HANDLE} {\n  transform: none;`), "anchored"),
  };
  const missed = Object.entries(leaks).filter(([, found]) => !found.length).map(([label]) => label);
  check(15, "CSS lint allows transform: none + clip-path only in Anchored's fill rule",
    !cssProblems(anchoredCss, "anchored").length && !missed.length,
    missed.length ? `not flagged: ${missed.join(", ")}` : `flagged: ${Object.values(leaks).map((p) => p.join("/")).join("; ")}`);
  const solids = MODES.map((mode) => css(mode, false, [custom("s1", RED), custom("s2", GREEN)]));
  const inert = MODES.map((mode) => buildCss({ ...defaultSettings(), mode }));
  check(15, "Solid output is identical in all three modes; default settings are inert in every mode",
    solids[0] !== "" && solids.every((c) => c === solids[0]) && inert.every((c) => c === ""),
    `solid ${solids.map((c) => c.length).join("/")} chars, defaults ${inert.map((c) => JSON.stringify(c)).join("/")}`);
  const perMode = Object.fromEntries(MODES.map((mode) => [mode, css(mode, true, [custom("s1", RED), custom("s2", BLUE)])]));
  check(15, "Gradient CSS per mode: Compress sizes to the playhead, Anchored clips, Slide has no overrides",
    perMode.compress.includes("background-size: var(--progress-bar-transform) 100%;") &&
      perMode.compress.includes("background-position: right center;") &&
      perMode.anchored.includes("transform: none;") &&
      perMode.anchored.includes("clip-path: inset(0 calc(100% - var(--progress-bar-transform)) 0 0 round var(--progress-bar-radius));") &&
      !/background-(size|position)|transform:|clip-path/.test(perMode.slide),
    MODES.map((mode) => `${mode}: ${perMode[mode].replace(/\s+/g, " ")}`).join(" | "));
  const themeCssPerMode = MODES.map((mode) => css(mode, true, [theme("s1"), theme("s2")]));
  check(7, "Theme stop emits var(--spice-button …) in every mode, never a resolved hex",
    themeCssPerMode.every((c) => c.includes(THEME_COLOUR) && !/#[0-9a-f]{3,8}\b/i.test(c.replaceAll(THEME_COLOUR, ""))),
    `${MODES.length} modes`);

  const fill = songFill();
  check(1, "Song progress bar found", fill && songHandle(), fill ? "" : "nothing matches SCOPE FILL — Spotify's DOM may have changed");

  if (fill) {
    const varsBefore = barVars(fill); // stylesheet is empty here
    const geometryBefore = barGeometry(fill);
    const waveform = waveformActive();
    const volumeFills = () => [...document.querySelectorAll(FILL)].filter((f) => !f.matches(`${SCOPE} ${FILL}`));
    const volumeState = () =>
      volumeFills().map((f) => `${getComputedStyle(f).backgroundImage} | ${getComputedStyle(f).transform}`).join("; ") || "no other fills";
    const volumeBefore = volumeState();
    setTestSettings(false, [custom("s1", RED)]);
    const solid = getComputedStyle(fill).backgroundImage;
    check(1, "Solid → song fill has a linear-gradient background-image", solid.startsWith("linear-gradient"), solid);
    const others = [...document.querySelectorAll(FILL)].filter((f) => !f.matches(`${SCOPE} ${FILL}`));
    const touched = others.filter((f) => getComputedStyle(f).backgroundImage !== "none");
    check(1, "Solid → every other fill (volume) has no background-image", !touched.length,
      `${others.length} other fill(s), ${touched.length} styled`);
    const solidHandle = computedHex(songHandle(), "backgroundColor");
    check(6, "Solid → handle is the solid colour", solidHandle === RED, solidHandle);

    // Every mode against the real song fill, with the same invariants (GPB #15).
    for (const mode of MODES) {
      const Mode = MODE_LABELS[mode];
      setTestSettings(true, [custom("s1", RED), custom("s2", GREEN), custom("s3", BLUE)], mode);
      const cs = getComputedStyle(fill);
      const progress = parseFloat(cs.getPropertyValue("--progress-bar-transform"));
      const area = fill.closest(".x-progressBar-sliderArea") ?? fill.parentElement;
      const leftGap = fill.getBoundingClientRect().left - area.getBoundingClientRect().left;
      const t = fillTransforms(fill);
      const where = `at ${progress}%: size ${cs.backgroundSize}, position ${cs.backgroundPosition}, repeat ${cs.backgroundRepeat}, ` +
        `transform ${t.ours} (Spotify's ${t.spotify}), clip-path ${cs.clipPath}, fill left ${leftGap.toFixed(1)} px from its slider area`;
      if (mode === "compress") {
        const sizeX = cs.backgroundSize.split(" ")[0];
        check(6, "Compress → background-size follows --progress-bar-transform",
          sizeX.endsWith("%") && Math.abs(parseFloat(sizeX) - progress) < 0.01, where);
        check(6, "Compress → anchored right, no-repeat", cs.backgroundPositionX === "100%" && cs.backgroundRepeat === "no-repeat", where);
        check(15, "Compress → Spotify's transform intact, no clip-path; below 100 % the fill starts left of its slider area",
          t.ours === t.spotify && cs.clipPath === "none" && (progress >= 99 || leftGap < -1), where);
      } else if (mode === "anchored") {
        check(15, "Anchored → transform none, clip-path inset(…), gradient sized to the whole track",
          t.ours === "none" && cs.clipPath.startsWith("inset(") && cs.backgroundSize === "100% 100%", where);
        check(15, "Anchored → the fill's left edge = its slider area's left edge (±1 px)", Math.abs(leftGap) <= 1, where);
      } else {
        check(15, "Slide → no background-size/position override, Spotify's transform intact, no clip-path",
          /^auto( auto)?$/.test(cs.backgroundSize) && cs.backgroundPositionX === "0%" && t.ours === t.spotify && cs.clipPath === "none",
          where);
      }
      const img = cs.backgroundImage;
      const order = ["rgb(255, 0, 0)", "rgb(0, 255, 0)", "rgb(0, 0, 255)"].map((c) => img.indexOf(c));
      const lastHandle = computedHex(songHandle(), "backgroundColor");
      check(6, `${Mode} → all stops in order, handle is the last stop`,
        order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1])) && lastHandle === BLUE, `${img}; handle ${lastHandle}`);
      check(11, `${Mode} → bar's --fg-color, --bg-color, --is-active-fg-color untouched`, barVars(fill) === varsBefore, barVars(fill));
      check(12, `${Mode} → bar height, radius and masks identical with our rules applied`, barGeometry(fill) === geometryBefore,
        barGeometry(fill));
      check(1, `${Mode} → volume fill untouched (no background-image, transform unchanged)`,
        volumeState() === volumeBefore && volumeFills().every((f) => getComputedStyle(f).backgroundImage === "none"), volumeState());
      if (waveform) {
        const areas = [...(fill.closest(".progress-bar") ?? fill).querySelectorAll(".x-progressBar-sliderArea")];
        check(12, `${Mode} → waveform: both slider areas still masked`, areas.every(hasMaskAnimation),
          areas.map((a) => getComputedStyle(a).maskImage || getComputedStyle(a).webkitMaskImage).join(" | "));
      }
    }
  }

  setTestSettings(false, [custom("s1", RED), custom("s2", GREEN), custom("s3", BLUE)]);
  const firstOnly = styleText();
  check(4, "Gradient off with 3 stops → CSS uses the first stop only",
    firstOnly.includes(RED) && !firstOnly.includes(GREEN) && !firstOnly.includes(BLUE), firstOnly.replace(/\s+/g, " "));

  // ── Theme colour ──
  setTestSettings(true, [theme("s1"), theme("s2")]);
  const themeCss = styleText();
  check(7, "Theme stop emits var(--spice-button …), never a resolved hex",
    themeCss.includes(THEME_COLOUR) && !/#[0-9a-f]{3,8}\b/i.test(themeCss.replaceAll(THEME_COLOUR, "")),
    themeCss.replace(/\s+/g, " "));
  const rootCs = getComputedStyle(document.documentElement);
  const expected =
    toHex(rootCs.getPropertyValue("--spice-button").trim()) ||
    toHex(rootCs.getPropertyValue("--spice-text").trim()) ||
    "#1db954";
  const resolved = resolveStop(theme("x"));
  check(7, "Theme stop resolves to the current computed --spice-button", resolved === expected,
    `${resolved} vs ${expected}${rootCs.getPropertyValue("--spice-button").trim() ? "" : " (--spice-button unset, fallback)"}`);
  if (fill) {
    const themeHandle = computedHex(songHandle(), "backgroundColor");
    check(7, "Theme stop on the live bar = current --spice-button", themeHandle === expected, themeHandle);
    // Hazy rewrites --spice-button inline on :root on every songchange.
    rootStyle.setProperty("--spice-button", PROBE, "important");
    const followedHandle = computedHex(songHandle(), "backgroundColor");
    const followedFill = getComputedStyle(fill).backgroundImage;
    restoreButton();
    check(11, "Runtime --spice-button change (as Hazy does per song) → bar follows, no JS",
      followedHandle === PROBE && followedFill.includes("rgb(18, 52, 86)"), `handle ${followedHandle}`);
  }

  // ── Modal ──
  setSettings(defaultSettings());
  update();
  if (fill) {
    const others = [...document.querySelectorAll(FILL)].filter((f) => !f.matches(`${SCOPE} ${FILL}`));
    for (const other of others) other.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const volumeOpened = !!modal;
    if (modal) {
      Spicetify.PopupModal.hide();
      closeModal(modal);
    }
    fill.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const opened = !!modal?.root.isConnected;
    check(28, "Right-click on the song bar opens the settings (volume bar doesn't)", opened && !volumeOpened,
      `song ${opened}, volume ${volumeOpened}`);
    if (modal) {
      Spicetify.PopupModal.hide();
      closeModal(modal);
    }
  }
  openModal();
  let m = modal;
  check(3, "Modal opens", m?.root.isConnected, "");
  if (!m) return;
  {
    const name = "Gradient Progress Bar"; // manifest.json
    const title = m.root.closest('[role="dialog"]')?.querySelector("h1")?.textContent.trim();
    check(58, "The menu entry's label and the settings window's title are the manifest name, 'Gradient Progress Bar'",
      ENTRY_LABEL === name && title === name, `entry "${ENTRY_LABEL}", title "${title}"`);
  }
  // Records whether the modal survived an action; reopens it so later checks still run.
  const stillOpen = (after) => {
    const open = m.root.isConnected && modal === m;
    check(26, `Modal still open after ${after}`, open, open ? "" : "modal closed itself");
    if (!open) {
      if (modal) closeModal(modal);
      openModal();
      m = modal;
    }
  };

  const dots = () => [...m.stopsRow.querySelectorAll(".gpb-stop")];
  const ringed = () => dots().filter((el) => el.classList.contains("gpb-selected"));
  // Exactly one ring, on `id`'s dot, and the picker (hex and R/G/B) shows that stop's colour.
  const selectionIs = (id) => {
    const stop = findStop(id);
    const hex = stop && resolveStop(stop);
    return !!stop && selectedId === id && ringed().length === 1 && ringed()[0].dataset.id === id &&
      m.hex.value === hex && m.rgb.map((f) => f.value).join() === hexToRgb(hex).join();
  };
  const selection = () =>
    `selected ${selectedId}, ring on ${ringed().map((el) => el.dataset.id).join() || "none"}, hex "${m.hex.value}", ` +
    `stops ${settings.stops.map((s) => s.id).join()}`;
  const click = (el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));

  check(35, "On open the first dot is selected and the picker shows its colour",
    selectionIs(settings.stops[0].id) && m.hex.value !== "", selection());
  // ── Gradient switch with one colour (GPB #46): it adds a second colour instead of being disabled ──
  const switchNode = m.switchButton;
  const switchState = () =>
    `${settings.stops.map((s) => `${s.id}:${s.kind}${s.color ? ` ${s.color}` : ""}`).join(", ")}; gradient ${settings.gradient}, ` +
    `aria-checked ${switchNode.getAttribute("aria-checked")}, disabled ${switchNode.disabled}, focus .${document.activeElement?.className}`;
  check(46, "One stop → switch enabled and off, no row tooltip",
    settings.stops.length === 1 && !switchNode.disabled && switchNode.getAttribute("aria-checked") === "false" &&
      !settings.gradient && !m.gradientRow.title && !switchNode.title,
    `${switchState()}, row title "${m.gradientRow.title}"`);
  const onlyStop = { ...settings.stops[0] };
  switchNode.focus();
  click(switchNode);
  await sleep(20);
  const openAfterSwitch = m.root.isConnected && modal === m;
  check(46, "Switch on with one colour → a copy of it after it (theme stays theme), gradient on, the new dot selected",
    settings.stops.length === 2 && settings.gradient && settings.stops[0].id === onlyStop.id &&
      settings.stops[1].kind === onlyStop.kind && settings.stops[1].color === onlyStop.color && selectionIs(settings.stops[1].id),
    `${switchState()}; ${selection()}`);
  check(46, "…focus stays on the switch, updated in place; Spread row enabled; modal still open",
    openAfterSwitch && document.activeElement === switchNode && m.switchButton === switchNode && switchNode.isConnected &&
      switchNode.getAttribute("aria-checked") === "true" && m.modeButtons.every((b) => !b.disabled),
    `${switchState()}, Spread disabled ${m.modeButtons.map((b) => b.disabled).join()}, open ${openAfterSwitch}`);
  stillOpen("switching the gradient on with one colour");
  click(m.switchButton);
  check(46, "Switch off → both stops kept, colour 2 dimmed",
    settings.stops.length === 2 && !settings.gradient && dots()[1]?.classList.contains("gpb-unused"), switchState());
  click(m.switchButton);
  check(46, "Switch on again with two colours → no third colour added",
    settings.stops.length === 2 && settings.gradient && !dots()[1]?.classList.contains("gpb-unused"), switchState());

  const foreign = [m.root, ...m.root.querySelectorAll("*")].filter(
    (el) => (el.id && !el.id.startsWith("gpb-")) || [...el.classList].some((c) => !c.startsWith("gpb-"))
  );
  check(3, "Every id and class in the modal starts with gpb-", !foreign.length,
    foreign.map((el) => `${el.tagName.toLowerCase()}#${el.id}.${[...el.classList].join(".")}`).join(", ") || "all prefixed");
  const hazyHooks = m.root.querySelectorAll("#color-input, .slider, .toggle, .toggleWrapper, select");
  check(11, "Modal uses none of Hazy's global hooks (#color-input, .slider, .toggle, .toggleWrapper, select)",
    !hazyHooks.length, `${hazyHooks.length} found`);
  const colorInput = document.getElementById("color-input");
  check(3, "No id=color-input of ours (Hazy looks it up)", !colorInput || !m.root.contains(colorInput),
    colorInput ? "exists, but it's not ours" : "none in the document");
  const help = m.help;
  const helpLines = help.innerHTML.split(/<br\s*\/?>/).map((line) => line.trim());
  check(52, "Help text is the last element of the modal content, after the action row, in three lines in order",
    helpLines.length === HELP_LINES.length && helpLines.every((line, i) => line === HELP_LINES[i]) &&
      help.querySelectorAll("br").length === 2 && m.root.lastElementChild === help &&
      m.actions.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING && !m.root.querySelector(".gpb-footer"),
    `last child .${m.root.lastElementChild?.className}, text "${help.innerText ?? help.textContent}"`);
  check(47, "No + Add colour button left; Reset alone in the action row",
    !m.root.querySelector(".gpb-add") && m.actions.children.length === 1 && m.actions.firstElementChild === m.resetButton,
    `.gpb-add ${!!m.root.querySelector(".gpb-add")}, action row [${[...m.actions.children].map((el) => `.${el.className}`).join(", ")}]`);
  // Tab order inside the dots line: the dots, then −, then +.
  const tabOrder = [...m.dotsLine.querySelectorAll("button")].filter((el) => el.tabIndex >= 0);
  const tabNames = tabOrder.map((el) => (el.classList.contains("gpb-stop") ? "dot" : el === m.minusButton ? "−" : el === m.plusButton ? "+" : el.className));
  check(49, "−|+ stepper: a group 'Colours' outside .gpb-stops, right after it; − then +, labelled; not draggable; tab order dots, −, +",
    m.stepper?.getAttribute("role") === "group" && m.stepper.getAttribute("aria-label") === "Colours" &&
      !m.stopsRow.contains(m.stepper) && m.stopsRow.nextElementSibling === m.stepper && !m.root.querySelector(".gpb-stepper ~ .gpb-plus, .gpb-dots > .gpb-plus") &&
      [...m.stepper.querySelectorAll("button")].every((b, i) => b === [m.minusButton, m.plusButton][i] && !b.draggable) &&
      m.minusButton.getAttribute("aria-label") === REMOVE_LABEL && m.minusButton.title === REMOVE_LABEL && !m.minusButton.disabled &&
      m.plusButton.getAttribute("aria-label") === ADD_LABEL && m.plusButton.title === ADD_LABEL && !m.plusButton.disabled &&
      tabNames.join() === [...dots().map(() => "dot"), "−", "+"].join(),
    `after .${m.stepper?.previousElementSibling?.className}, role ${m.stepper?.getAttribute("role")}, ` +
      `− "${m.minusButton.title}" disabled ${m.minusButton.disabled}, + "${m.plusButton.title}" disabled ${m.plusButton.disabled}, tab order ${tabNames.join(", ")}`);
  const icons = m.stopsRow.querySelectorAll("svg, .gpb-action, .gpb-badge, .gpb-grip");
  check(31, "No icons on the colour dots", !icons.length, `${icons.length} found`);
  const editorRow = m.root.querySelectorAll('.gpb-editor, input[type="color"]');
  check(32, "No editor row and no native colour input", !editorRow.length, `${editorRow.length} found`);
  check(35, "Picker is an inline panel between the dots and the Reset row, not a popover",
    m.picker.parentElement === m.root && m.picker.previousElementSibling === m.dotsLine &&
      m.picker.nextElementSibling === m.actions && !m.picker.hidden && getComputedStyle(m.picker).position === "static",
    `after .${m.picker.previousElementSibling?.className}, before .${m.picker.nextElementSibling?.className}, ` +
      `position ${getComputedStyle(m.picker).position}`);

  check(15, "Spread row sits between the Gradient row and the Presets row (#21): a radiogroup of three radio buttons",
    m.spread.previousElementSibling === m.gradientRow && m.spread.nextElementSibling === m.presets &&
      m.modes.getAttribute("role") === "radiogroup" && m.modes.getAttribute("aria-labelledby") === "gpb-spread-label" &&
      m.modeButtons.length === 3 && m.modeButtons.every((b) => b.tagName === "BUTTON" && b.getAttribute("role") === "radio") &&
      m.modeButtons.map((b) => b.textContent).join() === "Compress,Anchored,Slide",
    `after .${m.spread.previousElementSibling?.className}, before .${m.spread.nextElementSibling?.className}, ` +
      `buttons ${m.modeButtons.map((b) => `${b.textContent}[${b.getAttribute("role")}]`).join(", ")}`);

  // ── Dot menu (GPB #33) ──
  const menuShown = () => !m.menu.hidden && popover?.el === m.menu && m.root.contains(m.menu);
  const rightClick = (el) => {
    const r = el.getBoundingClientRect();
    const at = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: at.x, clientY: at.y }));
    return at;
  };
  const press = (el, key, init = {}) =>
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  // Scrolled into view (not for the fixed menu), the element's centre hit-tests to the element
  // or a descendant: visible, not clipped or covered (GPB #35).
  const reachable = (el, scroll = true) => {
    if (scroll) el.scrollIntoView({ block: "nearest", behavior: "instant" });
    const r = el.getBoundingClientRect();
    return r.width > 0 && el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  };

  await sleep(350); // let the modal's opening animation settle before measuring positions
  // The title bar is Spicetify's: the outermost element whose whole text is our title.
  const titleBar = [...(m.root.closest(".GenericModal") ?? document.body).querySelectorAll("*")].find(
    (el) => !el.contains(m.root) && !m.root.contains(el) && el.textContent.trim() === "Gradient Progress Bar"
  );
  const titleGap = titleBar ? m.gradientRow.getBoundingClientRect().top - titleBar.getBoundingClientRect().bottom : NaN;
  const helpGap = help.getBoundingClientRect().top - m.actions.getBoundingClientRect().bottom;
  check(34, "Spacing: title bar → Gradient row and action row → help text are both ≥ 16 px",
    titleGap >= 16 && helpGap >= 16,
    `title gap ${titleBar ? `${Math.round(titleGap)} px` : "title bar not found"}, help gap ${Math.round(helpGap)} px`);

  // ── Action row (GPB #37) ──
  const rowRect = m.actions.getBoundingClientRect();
  const resetRect = m.resetButton.getBoundingClientRect();
  const centreX = (r) => r.left + r.width / 2;
  const centreY = (r) => r.top + r.height / 2;
  const resetOff = centreX(resetRect) - centreX(rowRect);
  check(47, "Reset alone in the action row, centred (±1 px)", m.actions.children.length === 1 && Math.abs(resetOff) <= 1,
    `Reset's centre ${resetOff.toFixed(1)} px from the row's, row ${Math.round(rowRect.width)} px`);
  // ── −|+ stepper after the dots (GPB #49) ──
  const lastDot = dots()[dots().length - 1];
  const dotRect = lastDot.getBoundingClientRect();
  const stepperRect = m.stepper.getBoundingClientRect();
  const stepperGap = stepperRect.left - dotRect.right;
  const stepperCentreDiff = Math.abs(centreY(stepperRect) - centreY(dotRect));
  check(49, `Stepper sits right after the last dot on the same line (centres within 2 px, ${STOP_GAP} px apart like the dots), a dot's height (±1 px)`,
    stepperCentreDiff <= 2 && Math.abs(stepperGap - STOP_GAP) <= 1 && Math.abs(stepperRect.height - dotRect.height) <= 1,
    `centres differ ${stepperCentreDiff.toFixed(1)} px, gap ${stepperGap.toFixed(1)} px, ` +
      `stepper ${stepperRect.width.toFixed(1)}×${stepperRect.height.toFixed(1)}, dot ${dotRect.width.toFixed(1)}×${dotRect.height.toFixed(1)}`);
  const halves = { "−": m.minusButton, "+": m.plusButton };
  const halfSizes = Object.entries(halves).map(([name, el]) => {
    const r = el.getBoundingClientRect();
    return `${name} ${r.width.toFixed(1)}×${r.height.toFixed(1)}`;
  });
  const missedHalves = Object.entries(halves).filter(([, el]) => !reachable(el, false)).map(([name]) => name);
  const inner = Object.values(halves).map((el) => el.clientWidth); // between the borders
  check(49, "Both stepper halves are 34 px wide between their borders (pill 71 × 32 px) and hit-test to themselves",
    !missedHalves.length && inner.every((w) => Math.abs(w - 34) <= 1) && Math.abs(stepperRect.width - 71) <= 1,
    `${halfSizes.join(", ")}, inside the borders ${inner.join(" and ")} px, pill ${stepperRect.width.toFixed(1)} px` +
      `${missedHalves.length ? `; not hit: ${missedHalves.join(", ")}` : ""}`);
  // Real :hover can't be triggered from script, so the hover rules are read from our stylesheet (GPB #50).
  const modalRules = [...(m.root.querySelector("style")?.sheet?.cssRules ?? [])].filter((r) => r.selectorText);
  const hoverRule = modalRules.find((r) => /\.gpb-step:hover:not\(:disabled\)/.test(r.selectorText) &&
    r.style.getPropertyValue("border-color").trim() === "var(--spice-text)" && r.style.getPropertyValue("color").trim() === "var(--spice-text)");
  const raiseRule = modalRules.find((r) => /\.gpb-plus:hover:not\(:disabled\)/.test(r.selectorText) &&
    r.style.getPropertyValue("z-index").trim() === "1" && r.style.getPropertyValue("position").trim() === "relative");
  check(50, "Hover on an enabled half: its whole outline and its glyph → --spice-text; + is raised over −'s edge",
    !!hoverRule && !!raiseRule,
    `${hoverRule ? `"${hoverRule.cssText}"` : "no .gpb-step:hover:not(:disabled) rule with border-color and color var(--spice-text)"}; ` +
      `${raiseRule ? `"${raiseRule.cssText}"` : "no .gpb-plus:hover:not(:disabled) rule with position: relative; z-index: 1"}`);
  const minusStyle = getComputedStyle(m.minusButton);
  const plusLeft = parseRgb(getComputedStyle(m.plusButton).borderLeftColor);
  const middle = parseRgb(minusStyle.borderRightColor);
  check(50, "At rest the middle is one line: +'s left border is transparent, −'s right border has the normal colour",
    !!plusLeft && plusLeft[3] === 0 && !!middle && middle[3] > 0 && minusStyle.borderRightColor === minusStyle.borderTopColor &&
      !m.stepper.querySelector(".gpb-step-divider"),
    `+ left ${getComputedStyle(m.plusButton).borderLeftColor}, − right ${minusStyle.borderRightColor}, − top ${minusStyle.borderTopColor}`);
  check(37, "Action row → help text gap is ≥ 16 px", helpGap >= 16, `${helpGap.toFixed(1)} px`);
  // ── Bottom margin (GPB #48): help text → the dialog's bottom edge ≈ our root → its left edge ──
  // Scrolled to the end; every ancestor's share of the bottom gap goes into the detail.
  const dialog = m.root.closest(".GenericModal");
  const scroller = m.root.closest(".spicetify-popup-content");
  const scrollBefore = scroller?.scrollTop ?? 0;
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
  const chain = [help];
  for (let el = help.parentElement; dialog && el && chain[chain.length - 1] !== dialog; el = el.parentElement) chain.push(el);
  const bottom = (el) => el.getBoundingClientRect().bottom;
  const bottomGap = dialog ? bottom(dialog) - bottom(help) : NaN;
  const sideGap = dialog ? m.root.getBoundingClientRect().left - dialog.getBoundingClientRect().left : NaN;
  const nameOf = (el) => (el === m.root ? "our root" : el.classList[0] ? `.${el.classList[0]}` : `<${el.tagName.toLowerCase()}>`);
  const shares = chain.slice(1).map((el, i) => {
    const cs = getComputedStyle(el);
    return `${nameOf(el)} ${(bottom(el) - bottom(chain[i])).toFixed(1)} (padding ${cs.paddingBottom}, border ${cs.borderBottomWidth}, ` +
      `${nameOf(chain[i])} margin ${getComputedStyle(chain[i]).marginBottom})`;
  });
  if (scroller) scroller.scrollTop = scrollBefore;
  check(48, "Space below the help text matches the sides (≤ 4 px), to the dialog's edges, scrolled to the end",
    Math.abs(bottomGap - sideGap) <= 4,
    dialog
      ? `bottom ${bottomGap.toFixed(1)} px, side ${sideGap.toFixed(1)} px; help line-height ${getComputedStyle(help).lineHeight}; ${shares.join(" · ")}`
      : "dialog (.GenericModal) not found");

  const cursor = rightClick(dots()[1]);
  const mr = m.menu.getBoundingClientRect();
  const near = (a, b) => Math.abs(a - b) < 1.5;
  const atCursor = (near(mr.left, cursor.x) || near(mr.right, cursor.x)) && (near(mr.top, cursor.y) || near(mr.bottom, cursor.y));
  check(33, "Right-click on a dot opens the menu inside the modal root, at the cursor", menuShown() && atCursor,
    `shown ${menuShown()}, menu ${Math.round(mr.left)},${Math.round(mr.top)}, cursor ${Math.round(cursor.x)},${Math.round(cursor.y)}`);
  const menuHidden = [m.duplicateItem, m.removeItem].filter((el) => !reachable(el, false));
  check(33, "Menu is visible on top: Duplicate and Remove are reachable (not clipped by the modal)", !menuHidden.length,
    menuHidden.map((el) => el.textContent).join(", ") || "both reachable");
  m.removeItem.click();
  await sleep(20);
  stillOpen("Remove in the dot menu");
  check(5, "Remove down to one stop → gradient off, switch off but enabled (#46), menu closed",
    settings.stops.length === 1 && !settings.gradient && m.switchButton.getAttribute("aria-checked") === "false" &&
      !m.switchButton.disabled && !menuShown(),
    `${settings.stops.length} stop(s), gradient ${settings.gradient}`);
  check(35, "Removing the selected (last) dot selects the new last one", selectionIs(settings.stops[0].id), selection());

  rightClick(dots()[0]);
  check(33, "One stop → Remove disabled, Duplicate enabled", m.removeItem.disabled && !m.duplicateItem.disabled,
    `remove disabled ${m.removeItem.disabled}, duplicate disabled ${m.duplicateItem.disabled}`);
  const original = { ...settings.stops[0] };
  m.duplicateItem.click();
  await sleep(20);
  stillOpen("Duplicate in the dot menu");
  check(33, "Duplicate from one stop → identical copy after it, gradient on",
    settings.stops.length === 2 && settings.gradient && settings.stops[1].kind === original.kind &&
      settings.stops[1].color === original.color && settings.stops[0].id === original.id,
    JSON.stringify(settings.stops));
  check(35, "Duplicate selects the copy", selectionIs(settings.stops[1]?.id), selection());

  setTestSettings(true, [theme("s1"), custom("s2", RED)]);
  rightClick(dots()[0]);
  m.duplicateItem.click();
  await sleep(20);
  stillOpen("duplicating a theme stop");
  check(33, "Duplicating a theme stop inserts a theme stop directly after it",
    settings.stops.map((s) => `${s.id}:${s.kind}`).join() === "s1:theme,s3:theme,s2:custom",
    settings.stops.map((s) => `${s.id}:${s.kind}`).join());

  dots()[0].focus();
  press(dots()[0], "F10", { shiftKey: true });
  const items = [m.duplicateItem, m.removeItem];
  const firstFocused = menuShown() && document.activeElement === items[0];
  press(document.activeElement, "ArrowDown");
  const secondFocused = document.activeElement === items[1];
  press(document.activeElement, "Escape");
  check(33, "Keyboard: Shift+F10 opens the menu, arrows move, Escape closes and refocuses the dot",
    firstFocused && secondFocused && !menuShown() && document.activeElement === dots()[0],
    `first ${firstFocused}, arrow ${secondFocused}, closed ${!menuShown()}, focus ${document.activeElement?.className}`);
  stillOpen("Escape in the dot menu");

  rightClick(dots()[0]);
  m.gradientRow.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
  check(33, "A click elsewhere in the modal closes the menu", !menuShown(), "");
  stillOpen("clicking away from the dot menu");

  const lastBeforeAdd = { ...settings.stops[settings.stops.length - 1] };
  const plusNode = m.plusButton;
  click(plusNode);
  await sleep(20);
  stillOpen("the + button");
  const added = settings.stops[settings.stops.length - 1];
  check(35, "+ selects the new dot", selectionIs(added.id), selection());
  check(4, "New stop = a copy of the last stop (theme stays theme, #46)",
    added.id !== lastBeforeAdd.id && added.kind === lastBeforeAdd.kind && added.color === lastBeforeAdd.color,
    `${JSON.stringify(added)} after ${JSON.stringify(lastBeforeAdd)}`);
  const stepperMenus = [m.minusButton, plusNode].map((el) => (rightClick(el), menuShown()));
  closePopover();
  check(49, "The stepper isn't a dot: same nodes after adding, no dot menu on right-click",
    m.plusButton === plusNode && plusNode.isConnected && m.minusButton.isConnected && !stepperMenus.some(Boolean) &&
      !dots().includes(plusNode) && !dots().includes(m.minusButton),
    `connected ${plusNode.isConnected}/${m.minusButton.isConnected}, menu ${stepperMenus.join("/")}`);
  plusNode.focus();
  for (let i = 0; i < MAX_STOPS + 2 && !m.plusButton.disabled; i++) click(m.plusButton);
  await sleep(20);
  stillOpen("+ up to eight colours");
  check(4, "Add stops at 8, + disabled with the title 'Up to 8 colours'",
    settings.stops.length === MAX_STOPS && m.plusButton.disabled && m.plusButton.title === ADD_FULL_LABEL,
    `${settings.stops.length} stops, disabled ${m.plusButton.disabled}, title "${m.plusButton.title}"`);
  check(49, "+ disabled while focused → focus moves to the selected dot",
    document.activeElement === dotEl(selectedId), `focus ${document.activeElement?.dataset?.id ?? document.activeElement?.className}, selected ${selectedId}`);
  rightClick(dots()[0]);
  check(33, "Eight stops → Duplicate disabled", m.duplicateItem.disabled, `disabled ${m.duplicateItem.disabled}`);
  closePopover();

  // ── − removes the selected dot (GPB #49): the dot menu's Remove, so the GPB #35 rule applies ──
  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN), custom("s3", BLUE)]);
  selectStop("s2");
  const minusNode = m.minusButton;
  const minusState = () =>
    `stops ${settings.stops.map((s) => s.id).join()}, gradient ${settings.gradient}, ${selection()}, ` +
    `− disabled ${minusNode.disabled} "${minusNode.title}", focus ${document.activeElement?.dataset?.id ?? document.activeElement?.className}`;
  minusNode.focus();
  click(minusNode);
  await sleep(20);
  const minusOpen = m.root.isConnected && modal === m;
  check(49, "− removes the selected dot; the one now in its place is selected; focus stays on −; modal open",
    minusOpen && settings.stops.map((s) => s.id).join() === "s1,s3" && selectionIs("s3") &&
      m.minusButton === minusNode && minusNode.isConnected && document.activeElement === minusNode,
    minusState());
  stillOpen("−");
  click(minusNode);
  await sleep(20);
  const lastOpen = m.root.isConnected && modal === m;
  check(49, "− down to one colour → gradient off, − disabled ('At least one colour'), focus moves to the selected dot",
    lastOpen && settings.stops.length === 1 && !settings.gradient && minusNode.disabled && minusNode.title === REMOVE_LAST_LABEL &&
      selectionIs(settings.stops[0].id) && document.activeElement === dotEl(selectedId),
    minusState());
  stillOpen("− down to one colour");

  // ── Selection (GPB #35) ──
  const removeVia = async (el, after) => {
    rightClick(el);
    m.removeItem.click();
    await sleep(20);
    stillOpen(after);
  };
  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN), custom("s3", BLUE)]);
  selectStop("s1");
  const rowNodes = dots();
  click(rowNodes[2]);
  check(35, "Clicking a dot moves the ring and loads its colour, without re-rendering the dots",
    selectionIs("s3") && m.hex.value === BLUE && dots().every((el, i) => el === rowNodes[i] && el.isConnected),
    selection());
  stillOpen("selecting a dot");
  rowNodes[1].focus();
  rowNodes[1].click(); // detail 0, like Enter/Space
  check(35, "Enter/Space on a dot selects it and moves focus to the hex field",
    selectionIs("s2") && document.activeElement === m.hex, `${selection()}, focus ${document.activeElement?.className}`);
  await removeVia(dots()[1], "removing the selected dot");
  check(35, "Removing the selected dot selects the one now in its place", selectionIs("s3"), selection());
  await removeVia(dots()[0], "removing an unselected dot");
  check(35, "Removing an unselected dot keeps the selection", selectionIs("s3"), selection());

  setTestSettings(false, [custom("s1", RED), custom("s2", GREEN), custom("s3", BLUE)]);
  const opacities = [...m.stopsRow.querySelectorAll(".gpb-stop")].map((el) => getComputedStyle(el).opacity || "1");
  check(4, "Gradient off with 3 stops → stops 2–3 at 50 % opacity", opacities.join() === "1,0.5,0.5", opacities.join(", "));

  setTestSettings(true, [theme("s1"), custom("s2", RED)]);
  if (fill) {
    const preview = getComputedStyle(m.preview).backgroundImage;
    const bar = getComputedStyle(fill).backgroundImage;
    check(9, "Preview shows the same gradient as the bar", preview === bar, preview);
  }

  // ── Colour picker (GPB #32, GPB #35) ──
  // One animation frame, or 100 ms if frames are paused (minimised window).
  const frame = () => new Promise((r) => (requestAnimationFrame(() => r()), setTimeout(r, 100)));
  const pointer = (el, type, fx, fy) => {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: "mouse", isPrimary: true,
      button: type === "pointermove" ? -1 : 0, buttons: type === "pointerup" ? 0 : 1,
      clientX: r.left + r.width * fx, clientY: r.top + r.height * fy,
    }));
  };
  const themeDot = dots()[0];
  const rowBefore = dots();
  // In place: the dots row not re-rendered (same, connected nodes), the dot showing the colour,
  // the bar has it too, and the dot is still the selected one.
  const inPlace = (hex) =>
    dots().every((el, i) => el === rowBefore[i] && el.isConnected) && computedHex(themeDot, "backgroundColor") === hex &&
    styleText().includes(hex) && selectedId === themeDot.dataset.id;
  const state = () => `${JSON.stringify(settings.stops[0])}, dot ${computedHex(themeDot, "backgroundColor")}, selected ${selectedId}`;

  selectStop("s2");
  click(themeDot);
  check(32, "Clicking the theme dot shows it in the picker", selectionIs("s1"), selection());

  // Layout, then reachability with the theme stop shown (theme button disabled but present).
  const controls = m.picker.querySelector(".gpb-controls");
  const sr = m.sv.getBoundingClientRect();
  const cr = controls.getBoundingClientRect();
  const contentWidth = m.picker.getBoundingClientRect().width;
  const sideBySide = cr.left >= sr.right && Math.abs(cr.top - sr.top) < 1;
  check(35, `Picker columns side by side (needs ≥ ${PICKER_COLUMNS_MIN} px of content)`, sideBySide,
    `content ${Math.round(contentWidth)} px, ${sideBySide ? "side by side" : cr.top >= sr.bottom ? "stacked" : "overlapping"}`);
  const pickerControls = {
    "SV square": m.sv, "hue slider": m.hue, R: m.rgb[0], G: m.rgb[1], B: m.rgb[2], "hex field": m.hex, "hex copy button": m.hexCopy,
    "theme button": m.useThemeButton, ...(m.eyedropper ? { eyedropper: m.eyedropper } : {}),
  };
  const unreachable = Object.entries(pickerControls).filter(([, el]) => !reachable(el)).map(([name]) => name);
  check(35, "Every picker control is reachable (scrolled into view, its centre hit-tests to it)", !unreachable.length,
    unreachable.length ? `not reachable: ${unreachable.join(", ")}` : `${Object.keys(pickerControls).length} controls`);
  const hexLabel = m.root.querySelector(".gpb-hex-row > label");
  check(36, "Hex label reads 'HEX:'", hexLabel?.textContent === "HEX:", JSON.stringify(hexLabel?.textContent ?? null));
  const columnRect = controls.getBoundingClientRect();
  const hexRect = m.hexWrap.getBoundingClientRect(); // the field with its copy button (GPB #56)
  check(36, "Hex field (with its copy button) is at most 55 % of the right column's width", hexRect.width <= 0.55 * columnRect.width,
    `field ${Math.round(hexRect.width)} px, column ${Math.round(columnRect.width)} px`);
  const leftGap = hexLabel.getBoundingClientRect().left - columnRect.left;
  const rightGap = columnRect.right - hexRect.right;
  check(36, "Hex row is centred in the right column (gaps differ by ≤ 2 px)", Math.abs(leftGap - rightGap) <= 2,
    `left gap ${leftGap.toFixed(1)} px, right gap ${rightGap.toFixed(1)} px`);
  check(32, "Theme stop → 'Following theme colour', disabled",
    m.useThemeButton.disabled && m.useThemeButton.textContent === "Following theme colour", m.useThemeButton.textContent);
  check(32, "Eyedropper shown exactly when window.EyeDropper exists", !!m.eyedropper === !!window.EyeDropper,
    `EyeDropper ${!!window.EyeDropper}, button ${!!m.eyedropper}`);

  rootStyle.setProperty("--spice-button", PROBE, "important");
  await tick(); // let the :root MutationObserver run
  const swatch = computedHex(themeDot, "backgroundColor");
  const pickerSeen = m.hex.value;
  restoreButton();
  await tick();
  check(11, "Picker: theme dot and picker follow a runtime --spice-button change", swatch === PROBE && pickerSeen === PROBE,
    `dot ${swatch}, picker ${pickerSeen}`);
  check(34, "Theme dots: no dashed ring, 'Theme colour' tooltip",
    getComputedStyle(themeDot).borderTopStyle !== "dashed" && themeDot.title.split("\n")[0] === "Theme colour",
    `border ${getComputedStyle(themeDot).borderTopStyle}, title "${themeDot.title}"`);

  pointer(m.sv, "pointerdown", 0.9, 0.1);
  pointer(m.sv, "pointermove", 0.5, 0.5);
  await frame();
  const svExpected = hsvToHex({ h: pickerHsv.h, s: 0.5, v: 0.5 });
  const svLive = settings.stops[0].color;
  pointer(m.sv, "pointerup", 0.5, 0.5);
  check(32, "Dragging in the square: theme stop → custom, live, dot updated in place, bar follows",
    settings.stops[0].kind === "custom" && svLive === svExpected && settings.stops[0].color === svExpected &&
      !themeDot.classList.contains("gpb-theme") && inPlace(svExpected),
    `expected ${svExpected}, live ${svLive}; ${state()}`);
  stillOpen("dragging in the picker's square");

  pointer(m.hue, "pointerdown", 1 / 3, 0.5);
  pointer(m.hue, "pointerup", 1 / 3, 0.5);
  check(32, "Dragging the hue bar to 120° → #408040 everywhere", settings.stops[0].color === "#408040" && inPlace("#408040") &&
    m.hex.value === "#408040" && m.rgb.map((f) => f.value).join() === "64,128,64", state());
  stillOpen("dragging the hue bar");

  [10, 20, 30].forEach((n, i) => (m.rgb[i].value = String(n)));
  m.rgb[2].dispatchEvent(new Event("input", { bubbles: true }));
  check(32, "R/G/B fields 10/20/30 → #0a141e everywhere", settings.stops[0].color === "#0a141e" && inPlace("#0a141e") &&
    m.hex.value === "#0a141e", state());
  m.rgb[0].value = "300";
  m.rgb[0].dispatchEvent(new Event("input", { bubbles: true }));
  check(32, "R/G/B: 300 is flagged and ignored", m.rgb[0].getAttribute("aria-invalid") === "true" &&
    settings.stops[0].color === "#0a141e", state());
  m.rgb[0].dispatchEvent(new Event("change", { bubbles: true }));

  const typeHex = (value) => {
    m.hex.value = value;
    m.hex.dispatchEvent(new Event("input", { bubbles: true }));
  };
  typeHex("ABCDEF");
  const afterPlain = settings.stops[0].color;
  typeHex("#0f0");
  check(32, "Hex field accepts rrggbb and #rgb, case-insensitive; dot, bar and R/G/B follow",
    afterPlain === "#abcdef" && settings.stops[0].color === "#00ff00" && inPlace("#00ff00") &&
      m.rgb.map((f) => f.value).join() === "0,255,0",
    `${afterPlain}; ${state()}`);
  typeHex("#zz12");
  check(32, "Invalid hex is flagged and ignored", m.hex.getAttribute("aria-invalid") === "true" && settings.stops[0].color === "#00ff00",
    `aria-invalid ${m.hex.getAttribute("aria-invalid")}, colour ${settings.stops[0].color}`);
  m.hex.dispatchEvent(new Event("change", { bubbles: true }));
  check(32, "Leaving the hex field restores the normalised value", m.hex.value === "#00ff00" && m.hex.getAttribute("aria-invalid") === "false",
    m.hex.value);
  stillOpen("editing R/G/B and hex");

  check(32, "Custom stop → 'Use theme colour' enabled", !m.useThemeButton.disabled && m.useThemeButton.textContent === "Use theme colour",
    m.useThemeButton.textContent);
  m.useThemeButton.click();
  await sleep(20);
  stillOpen("'Use theme colour'");
  check(32, "'Use theme colour' → theme stop, button shows 'Following theme colour', dot updated in place",
    settings.stops[0].kind === "theme" && !("color" in settings.stops[0]) && m.useThemeButton.disabled &&
      m.useThemeButton.textContent === "Following theme colour" && dots()[0] === themeDot && selectionIs("s1") &&
      styleText().includes(THEME_COLOUR),
    `${JSON.stringify(settings.stops[0])}, button "${m.useThemeButton.textContent}"`);

  rightClick(dots()[1]);
  check(35, "Right-click opens the menu without changing the selection", menuShown() && selectionIs("s1"), selection());
  closePopover();

  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN), custom("s3", BLUE)]);
  selectStop("s3");
  const draggable = [...m.root.querySelectorAll('[draggable="true"]')];
  const stopEls = m.stopsRow.querySelectorAll(".gpb-stop");
  if (stopEls.length < 3) {
    check(8, "Drag-and-drop test setup", false, `${stopEls.length} stop element(s), expected 3`);
    return;
  }
  const dt = new DataTransfer();
  stopEls[0].dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
  const lastRect = stopEls[2].getBoundingClientRect();
  const at = { clientX: lastRect.right + 4, clientY: lastRect.top + lastRect.height / 2 };
  m.stopsRow.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, ...at }));
  const markerShown = !m.stopsRow.querySelector(".gpb-marker").hidden;
  m.stopsRow.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt, ...at }));
  const order = settings.stops.map((s) => s.id).join();
  check(8, "Dragging stop 1 past the last stop moves it to the end",
    order === "s2,s3,s1" && markerShown, `order ${order}, marker shown ${markerShown}`);
  click(dots()[0]);
  check(8, "A click straight after a drag doesn't change the selection", selectionIs("s3"), selection());
  check(8, "Only the colour dots are draggable, never an input",
    draggable.length === 3 && draggable.every((el) => el.classList.contains("gpb-stop") && el.tagName === "BUTTON"),
    draggable.map((el) => `${el.tagName.toLowerCase()}.${el.className}`).join(", "));

  stillOpen("dragging a stop");

  // ── Keyboard reordering (GPB #24): real keydown events on the dot nodes ──
  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN), custom("s3", BLUE)]);
  selectStop("s2");
  const stopOrder = () => settings.stops.map((s) => s.id).join();
  // Stop order in the bar's gradient: each colour's first occurrence in the stylesheet.
  const barOrder = () => {
    const css = styleText();
    return settings.stops.map((s) => [s.id, css.indexOf(s.color)]).sort((a, b) => a[1] - b[1]).map(([id]) => id).join();
  };
  const altKey = (id, key) => press(dotEl(id), key, { altKey: true }); // false if the default was prevented
  const focusedOn = (id) => !!dotEl(id) && document.activeElement === dotEl(id);
  const kbState = () =>
    `order ${stopOrder()}, bar ${barOrder()}, focus ${document.activeElement?.dataset?.id ?? document.activeElement?.className ?? "none"}, ` +
    `${selection()}, announced "${m.announce.textContent}"`;
  const moved = (expected, position) =>
    stopOrder() === expected && barOrder() === expected && focusedOn("s1") && selectionIs("s2") &&
    m.announce.textContent === `Moved to position ${position} of 3`;
  const navState = () => `${location.href} ${window.Spicetify?.Platform?.History?.location?.pathname ?? ""}`;
  const navBefore = navState();

  dotEl("s1").focus();
  altKey("s1", "ArrowRight");
  check(24, "Alt+→ on the first of three moves it to position 2; the bar's gradient order follows",
    stopOrder() === "s2,s1,s3" && barOrder() === "s2,s1,s3", kbState());
  check(24, "After the move, focus is on the moved dot and the selection is unchanged",
    focusedOn("s1") && selectionIs("s2"), kbState());
  check(24, "The new position is announced in a polite live region and the aria-label",
    m.announce.textContent === "Moved to position 2 of 3" && m.announce.getAttribute("aria-live") === "polite" &&
      dotEl("s1").getAttribute("aria-label") === `Colour 2 of 3: ${RED}`,
    `announced "${m.announce.textContent}", aria-label "${dotEl("s1")?.getAttribute("aria-label")}"`);
  stillOpen("Alt+→ on a dot");
  altKey("s1", "End");
  check(24, "Alt+End moves it to last (focus kept, selection unchanged, announced)", moved("s2,s3,s1", 3), kbState());
  stillOpen("Alt+End on a dot");
  altKey("s1", "Home");
  check(24, "Alt+Home moves it back to first (focus kept, selection unchanged, announced)", moved("s1,s2,s3", 1), kbState());
  stillOpen("Alt+Home on a dot");

  const unmoved = dots();
  const leftKept = altKey("s1", "ArrowLeft");
  const rightKept = altKey("s3", "ArrowRight");
  check(24, "Alt+← on the first dot and Alt+→ on the last change nothing (the keys are still consumed)",
    stopOrder() === "s1,s2,s3" && dots().every((el, i) => el === unmoved[i]) && !leftKept && !rightKept,
    `${kbState()}, default prevented ${!leftKept}/${!rightKept}`);
  stillOpen("Alt+arrows at the edges");
  dotEl("s1").focus();
  const plainKept = press(dotEl("s1"), "ArrowRight");
  check(24, "Plain → without Alt doesn't reorder",
    stopOrder() === "s1,s2,s3" && dots().every((el, i) => el === unmoved[i]) && plainKept, kbState());
  check(24, "Every dot's tooltip includes 'Drag or Alt+←/→ to reorder'",
    dots().every((el) => el.title.endsWith(`\n${REORDER_HINT}`)), dots().map((el) => JSON.stringify(el.title)).join(", "));
  await sleep(50);
  check(24, "Alt+arrow keys on a dot don't navigate Spotify (Back/Forward)", navState() === navBefore,
    `before ${navBefore}, after ${navState()}`);

  // ── Delete / Backspace on a focused dot (GPB #49): real keydown events on the dot nodes ──
  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN), custom("s3", BLUE)]);
  selectStop("s1");
  dotEl("s2").focus();
  const deleteKept = press(dotEl("s2"), "Delete");
  await sleep(20);
  const deleteOpen = m.root.isConnected && modal === m;
  check(49, "Delete on a focused, unselected dot removes that dot and keeps the selection; focus on the dot now at its index; announced",
    deleteOpen && !deleteKept && stopOrder() === "s1,s3" && selectionIs("s1") && focusedOn("s3") &&
      m.announce.textContent === "Colour removed, 2 left",
    `${kbState()}, default prevented ${!deleteKept}`);
  stillOpen("Delete on a dot");
  selectStop("s3");
  dotEl("s3").focus();
  const backspaceKept = press(dotEl("s3"), "Backspace");
  await sleep(20);
  const backspaceOpen = m.root.isConnected && modal === m;
  check(49, "Backspace on the selected (last) dot removes it; the selection moves as with Remove; focus on the dot now at that index (clamped)",
    backspaceOpen && !backspaceKept && stopOrder() === "s1" && selectionIs("s1") && focusedOn("s1") && !settings.gradient &&
      m.announce.textContent === "Colour removed, 1 left",
    `${kbState()}, gradient ${settings.gradient}, default prevented ${!backspaceKept}`);
  stillOpen("Backspace on a dot");
  const lastKept = press(dotEl("s1"), "Delete");
  check(49, "Delete with one colour removes nothing, but the key is consumed", stopOrder() === "s1" && !lastKept,
    `${kbState()}, default prevented ${!lastKept}`);
  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN)]);
  selectStop("s2");
  m.hex.focus();
  const hexKept = press(m.hex, "Backspace");
  check(49, "Backspace in the hex field removes no dot (and isn't consumed)", stopOrder() === "s1,s2" && hexKept,
    `${kbState()}, default prevented ${!hexKept}`);
  await sleep(50);
  check(49, "Delete and Backspace on a dot don't navigate Spotify", navState() === navBefore, `before ${navBefore}, after ${navState()}`);

  // ── Two-step Reset (GPB #37): real pointer/mouse sequences and keys on the same button node ──
  const realClick = (el) => {
    const r = el.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, composed: true, button: 0, detail: 1,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    const ptr = { pointerId: 1, pointerType: "mouse", isPrimary: true };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...init, ...ptr, buttons: 1 }));
    el.dispatchEvent(new MouseEvent("mousedown", { ...init, buttons: 1 }));
    el.dispatchEvent(new PointerEvent("pointerup", { ...init, ...ptr, buttons: 0 }));
    el.dispatchEvent(new MouseEvent("mouseup", init));
    el.dispatchEvent(new MouseEvent("click", init));
  };

  // ── Hex copy button (GPB #56) ──
  const copyRect = m.hexCopy.getBoundingClientRect();
  const wrapRect = m.hexWrap.getBoundingClientRect();
  const hexStyle = getComputedStyle(m.hex);
  const copySvg = m.hexCopy.querySelector("svg:not([hidden])");
  const focusables = [...m.root.querySelectorAll("button, input, [tabindex]")].filter((el) => el.tabIndex >= 0 && !el.disabled && !el.hidden);
  check(56, "The copy button sits inside the hex field's wrap at its right edge, about 24 × 24 px, with a 14 px icon; the text box ends before it; Tab order after the field",
    m.hexWrap.contains(m.hexCopy) && m.hexWrap.contains(m.hex) && Math.abs(wrapRect.right - copyRect.right) <= 4 &&
      copyRect.left >= wrapRect.left && Math.abs(copyRect.width - 24) <= 1 && Math.abs(copyRect.height - 24) <= 1 &&
      Math.abs((copyRect.top + copyRect.bottom) / 2 - (wrapRect.top + wrapRect.bottom) / 2) <= 1 &&
      parseFloat(hexStyle.paddingRight) >= copyRect.width && Math.abs(copySvg?.getBoundingClientRect().width - 14) <= 0.5 &&
      m.hexCopy.getAttribute("aria-label") === HEX_COPY_LABEL && m.hexCopy.title === HEX_COPY_LABEL && m.hexCopy.type === "button" &&
      focusables.indexOf(m.hexCopy) === focusables.indexOf(m.hex) + 1,
    `button ${copyRect.width.toFixed(1)}×${copyRect.height.toFixed(1)}, ${(wrapRect.right - copyRect.right).toFixed(1)} px from the right; ` +
      `padding-right ${hexStyle.paddingRight}; wrap ${wrapRect.width.toFixed(1)} px, field ${m.hex.getBoundingClientRect().width.toFixed(1)} px`);
  const hexCopyRules = [...(m.root.querySelector("style")?.sheet?.cssRules ?? [])].filter((r) => r.selectorText);
  const hexCopyHover = hexCopyRules.find((r) => /\.gpb-hex-copy:hover/.test(r.selectorText) && r.style.getPropertyValue("color").trim() === "var(--spice-text)");
  const subtextProbe = document.createElement("span"); // the same computed form as the button colour
  subtextProbe.style.color = "var(--spice-subtext)";
  m.hexWrap.append(subtextProbe);
  const subtextColour = getComputedStyle(subtextProbe).color;
  subtextProbe.remove();
  check(56, "The copy button is --spice-subtext at rest and --spice-text on hover (CSSOM), with a focus ring",
    !!hexCopyHover && getComputedStyle(m.hexCopy).color === subtextColour &&
      hexCopyRules.some((r) => /\.gpb-hex-copy:focus-visible/.test(r.selectorText) && /outline: 2px solid/.test(r.cssText)),
    `rest ${getComputedStyle(m.hexCopy).color} (subtext ${subtextColour}); ${hexCopyHover ? `"${hexCopyHover.cssText}"` : "no hover rule"}`);
  {
    const realSources = { ...clipboardSources };
    let copied = null;
    let failing = false;
    try {
      clipboardSources.api = () => ({ copy: async (text) => {
        if (failing) throw new Error("stub");
        copied = text;
      } });
      clipboardSources.clipboard = () => ({ writeText: async () => { throw new Error("stub"); } });
      clipboardSources.execCommand = () => !failing && false;
      const iconShows = (name) => (name === "check") === !m.hexCopyCheck.hasAttribute("hidden") && (name === "check") === m.hexCopyIcon.hasAttribute("hidden");
      const copyNode = m.hexCopy;
      setTestSettings(true, [custom("s1", RED), custom("s2", GREEN), theme("s3")]);
      selectStop("s2");
      const before = JSON.stringify(settings);
      const dotNodes = dots();
      realClick(copyNode);
      await sleep(20);
      const unchanged = () => JSON.stringify(settings) === before && selectionIs("s2") && dots().every((el, i) => el === dotNodes[i]) &&
        dots().length === dotNodes.length && copyNode.isConnected;
      check(56, "A click copies the selected stop's #rrggbb, shows the check and announces 'Hex code copied'; settings, selection and dots unchanged",
        copied === GREEN && iconShows("check") && m.announce.textContent === "Hex code copied" && unchanged() && m.hex.value === GREEN,
        `copied ${copied}, icon ${iconShows("check") ? "check" : "copy"}, announced "${m.announce.textContent}"`);
      stillOpen("the hex copy button");
      await sleep(HEX_COPIED_MS + 200);
      check(56, `The copy icon is back after ${HEX_COPIED_MS / 1000} s`, iconShows("copy"), iconShows("copy") ? "copy icon" : "still the check");
      copied = null;
      selectStop("s3");
      realClick(copyNode);
      await sleep(20);
      const themeHex = resolveStop(theme("s3"));
      check(56, "On a theme stop it copies the resolved colour as #rrggbb, and the stop stays a theme stop",
        copied === themeHex && /^#[0-9a-f]{6}$/.test(copied ?? "") && findStop("s3")?.kind === "theme",
        `copied ${copied}, resolved ${themeHex}`);
      selectStop("s1");
      m.hex.focus({ preventScroll: true });
      m.hex.value = "#12";
      m.hex.dispatchEvent(new Event("input", { bubbles: true }));
      copied = null;
      const beforeInvalid = JSON.stringify(settings);
      realClick(copyNode);
      await sleep(20);
      check(56, "While the field holds invalid text, it copies the last valid colour; the field keeps its text and focus",
        copied === RED && m.hex.value === "#12" && document.activeElement === m.hex && JSON.stringify(settings) === beforeInvalid,
        `copied ${copied}, field "${m.hex.value}", focus .${document.activeElement?.className}`);
      m.hex.dispatchEvent(new Event("change", { bubbles: true }));
      failing = true;
      copyNode.focus({ preventScroll: true });
      await copyHex(m);
      check(56, "If every tier fails, the field's text is selected so Ctrl+C works",
        document.activeElement === m.hex && m.hex.selectionStart === 0 && m.hex.selectionEnd === m.hex.value.length && m.hex.value === RED,
        `focus .${document.activeElement?.className}, selected ${m.hex.selectionStart}–${m.hex.selectionEnd}`);
      stillOpen("the hex copy button");
    } finally {
      Object.assign(clipboardSources, realSources);
    }
  }

  const resetBtn = m.resetButton;
  const isArmed = () => resetBtn.classList.contains("gpb-armed") && m.resetLabel.textContent === RESET_CONFIRM_LABEL;
  const isIdle = () => !resetBtn.classList.contains("gpb-armed") && m.resetLabel.textContent === "Reset";
  const resetState = () => `label "${m.resetLabel.textContent}", armed class ${resetBtn.classList.contains("gpb-armed")}, ` +
    `stops ${settings.stops.map((s) => s.id).join()}`;

  const beforeReset = JSON.stringify(settings);
  const idleWidth = resetBtn.getBoundingClientRect().width;
  realClick(resetBtn);
  const armedWidth = resetBtn.getBoundingClientRect().width;
  check(37, "First click on Reset doesn't reset; label 'Confirm reset?' with the warning class",
    JSON.stringify(settings) === beforeReset && isArmed(), resetState());
  check(37, "Reset button keeps its width when armed (≤ 1 px)", Math.abs(armedWidth - idleWidth) <= 1,
    `Reset ${idleWidth.toFixed(1)} px, Confirm reset? ${armedWidth.toFixed(1)} px`);
  realClick(resetBtn);
  check(10, "Second click on Reset → defaults and an empty stylesheet",
    JSON.stringify(settings) === JSON.stringify(defaultSettings()) && styleText() === "", JSON.stringify(settings));
  stillOpen("Reset");
  check(35, "Reset selects the first dot", selectionIs(settings.stops[0].id), selection());
  check(37, "After resetting, the same button reads 'Reset' again",
    m.resetButton === resetBtn && resetBtn.isConnected && isIdle(), resetState());

  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN)]);
  selectStop("s1");
  const armedBase = JSON.stringify(settings);
  realClick(resetBtn);
  const armedAtStart = isArmed();
  await sleep(RESET_CONFIRM_MS + 200);
  check(37, `Armed Reset disarms after ${RESET_CONFIRM_MS / 1000} s without resetting`,
    armedAtStart && isIdle() && JSON.stringify(settings) === armedBase, resetState());

  realClick(resetBtn);
  press(resetBtn, "Escape");
  check(37, "Escape disarms Reset without resetting", isIdle() && JSON.stringify(settings) === armedBase, resetState());
  stillOpen("Escape on an armed Reset");

  realClick(resetBtn);
  realClick(dots()[1]);
  check(37, "Clicking a dot disarms Reset without resetting; the selection moves",
    isIdle() && JSON.stringify(settings) === armedBase && selectionIs("s2"), `${resetState()}; ${selection()}`);

  // ── Spread row (GPB #15): real clicks and keys; the nodes are only ever updated in place ──
  const modeNodes = [...m.modeButtons];
  const modeBtn = (mode) => modeNodes[MODES.indexOf(mode)];
  const spreadState = () =>
    `mode ${settings.mode}, gradient ${settings.gradient}, ` +
    `checked ${modeNodes.filter((b) => b.getAttribute("aria-checked") === "true").map((b) => b.dataset.mode).join() || "none"}, ` +
    `tabindex ${modeNodes.map((b) => b.tabIndex).join()}, disabled ${modeNodes.map((b) => b.disabled).join()}, ` +
    `focus ${document.activeElement?.dataset?.mode ?? document.activeElement?.className}, hint "${m.spreadHint.textContent}"`;
  const spreadShows = (mode, enabled) =>
    settings.mode === mode && m.spread.isConnected &&
    [...m.modes.querySelectorAll(".gpb-mode")].every((b, i) => b === modeNodes[i] && b.isConnected) &&
    modeNodes.every((b) => {
      const on = b.dataset.mode === mode;
      return (b.getAttribute("aria-checked") === "true") === on && b.tabIndex === (on ? 0 : -1) && b.disabled === !enabled;
    }) &&
    m.spreadHint.textContent === (enabled ? SPREAD_HINTS[mode] : SPREAD_OFF_HINT);

  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN), custom("s3", BLUE)]);
  const dotsBeforeMode = dots();
  realClick(modeBtn("anchored"));
  check(15, "Clicking Anchored applies it live (clip-path in the stylesheet), updates the row in place, dots not re-rendered",
    spreadShows("anchored", true) && styleText().includes("clip-path:") && dots().every((el, i) => el === dotsBeforeMode[i]),
    spreadState());
  stillOpen("choosing Anchored");
  // Hazy changes --spice-button at runtime; --spice-rgb-button stays stale (GPB #40). The checked
  // button is filled with the live colour, its label in whichever of --spice-text and
  // --spice-main contrasts more (GPB #43). A dark and a light probe exercise both labels.
  check(40, "No --spice-rgb-button in the modal CSS (Hazy leaves it stale)", !modalCss().includes("--spice-rgb-button"),
    modalCss().match(/[^\n]*--spice-rgb-button[^\n]*/)?.[0] ?? "not used");
  const fmt = (rgb) => (rgb ? `rgb(${rgb.slice(0, 3).map(Math.round).join(", ")}${rgb[3] < 1 ? ` / ${rgb[3]}` : ""})` : "unparsed");
  await withoutTransitions(modeNodes, async () => {
    for (const probe of ["#123456", "#ffe680"]) {
      rootStyle.setProperty("--spice-button", probe, "important");
      await sleep(250); // the :root observer and the re-render; the buttons' fade is off for this check (#12)
      const button = modeBtn("anchored");
      const bg = parseRgb(getComputedStyle(button).backgroundColor);
      const label = parseRgb(getComputedStyle(button).color);
      const options = { "--spice-text": computedRgb(m.modes, "var(--spice-text)"), "--spice-main": computedRgb(m.modes, "var(--spice-main)") };
      const want = hexToRgb(probe);
      const [best, bestRgb] = Object.entries(options).sort(([, a], [, b]) => (b ? contrast(b, want) : 0) - (a ? contrast(a, want) : 0))[0];
      const same = (a, b) => !!(a && b) && a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= 1);
      const ratio = label ? contrast(label, want) : 0;
      check(43, `Checked Spread button is filled with a runtime --spice-button (${probe}, opaque); its label uses the higher-contrast option, ≥ 4.5:1`,
        same(bg, want) && bg[3] === 1 && same(label, bestRgb) && label[3] === 1 && ratio >= 4.5,
        `background ${fmt(bg)}, label ${fmt(label)} (${ratio.toFixed(2)}:1), expected ${best} ${fmt(bestRgb)}; ` +
          Object.entries(options).map(([k, v]) => `${k} ${v ? contrast(v, want).toFixed(2) : "?"}:1`).join(", "));
    }
  });
  restoreButton();
  await sleep(250);
  realClick(modeBtn("slide"));
  check(15, "Clicking Slide → Slide, hint updated in place", spreadShows("slide", true) && !styleText().includes("clip-path:"),
    spreadState());
  stillOpen("choosing Slide");
  await sleep(SAVE_DELAY + 100);
  const savedMode = JSON.parse(Spicetify.LocalStorage.get(STORAGE_KEY) ?? "{}").mode;
  check(15, "The chosen mode is saved", savedMode === "slide", `stored mode ${savedMode}`);

  realClick(modeBtn("compress"));
  modeBtn("compress").focus();
  const keySteps = [];
  for (const [key, expected] of [["ArrowRight", "anchored"], ["End", "slide"], ["Home", "compress"], ["ArrowLeft", "slide"]]) {
    press(document.activeElement, key);
    keySteps.push(`${key} → ${settings.mode}${settings.mode === expected && document.activeElement === modeBtn(expected) && spreadShows(expected, true) ? "" : ` (expected ${expected} focused)`}`);
  }
  const altKept = press(document.activeElement, "ArrowRight", { altKey: true });
  keySteps.push(`Alt+→ → ${settings.mode}${settings.mode === "slide" && altKept ? "" : " (expected no change)"}`);
  check(15, "Spread keyboard: →, End, Home and ← (wrapping) change the mode and move focus; Alt+→ doesn't",
    !keySteps.some((step) => step.includes("expected")), keySteps.join(", "));
  stillOpen("changing Spread with the keyboard");

  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN)], "anchored");
  const gradientSteps = [];
  const step = (label, enabled) => gradientSteps.push(`${label}: ${spreadShows("anchored", enabled) ? "ok" : `wrong (${spreadState()})`}`);
  realClick(m.switchButton);
  step("switch off", false);
  realClick(m.switchButton);
  step("switch on", true);
  rightClick(dots()[1]);
  m.removeItem.click();
  await sleep(20);
  step("remove to one colour", false);
  const disabledWithOne = spreadShows("anchored", false) && settings.stops.length === 1;
  realClick(m.plusButton);
  step("+", true);
  realClick(m.minusButton);
  await sleep(20);
  step("− to one colour", false);
  rightClick(dots()[0]);
  m.duplicateItem.click();
  await sleep(20);
  step("Duplicate", true);
  check(15, "Row disabled with one colour: buttons disabled, hint 'Applies when the gradient is on.'", disabledWithOne,
    gradientSteps[2]);
  check(15, "The Gradient switch, Remove, the stepper's + and − and Duplicate disable/enable the row in place (mode kept)",
    gradientSteps.every((s) => s.endsWith(": ok")), gradientSteps.join("; "));
  stillOpen("gradient changes with the Spread row");

  // ── Presets and share codes (GPB #21) ──
  // Store first: pure functions on crafted raw values, counting [gpb] warnings per load.
  const gpbWarnings = (fn) => {
    const original = console.warn;
    let count = 0;
    console.warn = (...args) => (String(args[0]).startsWith("[gpb]") ? count++ : original(...args));
    try {
      return [fn(), count];
    } finally {
      console.warn = original;
    }
  };
  const presetsJson = (list) => JSON.stringify({ version: PRESETS_VERSION, presets: list });
  const own = (id, name, s) => ({ id, name, settings: s });
  const sampleA = { gradient: true, mode: "anchored", stops: [theme("s1"), custom("s2", RED)] };
  const sampleB = { gradient: false, mode: "slide", stops: [custom("s1", BLUE)] };
  const names = (list) => list.map((p) => p.name).join(", ");

  setPresets([own("p1", "One", sampleA), own("p2", "Two", sampleB)]);
  savePresets();
  const [reloadedPresets, reloadWarnings] = gpbWarnings(() => loadPresets());
  check(21, "Presets store: save → load round-trip in gpb:presets (theme and custom stops, gradient, mode); gpb:settings untouched",
    JSON.stringify(reloadedPresets) === JSON.stringify(presets) && !reloadWarnings &&
      JSON.parse(Spicetify.LocalStorage.get(PRESETS_KEY)).version === PRESETS_VERSION,
    `${names(reloadedPresets)}; ${reloadWarnings} warning(s); ${Spicetify.LocalStorage.get(PRESETS_KEY).length} characters`);
  const [kept, dropWarnings] = gpbWarnings(() => loadPresets(presetsJson([
    own("p1", "  Good  ", sampleA),
    own("p2", "Bad hex", { ...sampleA, stops: [custom("s1", "#12345")] }),
    own("p3", "   ", sampleB),
    own("p4", "x".repeat(PRESET_NAME_MAX + 1), sampleB),
    own("p5", "Bad mode", { ...sampleB, mode: "sideways" }),
    { id: "p6", name: "No settings" },
    own("p1", "Same id", sampleB),
    own("p7", "good", sampleB),
  ])));
  check(21, "Invalid presets are dropped with one [gpb] warning; names trimmed; a name clash gets ' (2)'",
    names(kept) === "Good, good (2)" && dropWarnings === 1, `kept ${names(kept)}; ${dropWarnings} warning(s)`);
  const corrupt = ["{nope", JSON.stringify({ version: 2, presets: [] }), JSON.stringify([1, 2]), JSON.stringify({ version: 1 })]
    .map((raw) => gpbWarnings(() => loadPresets(raw)));
  check(21, "A corrupt or unknown gpb:presets gives an empty list and one warning",
    corrupt.every(([list, warnings]) => list.length === 0 && warnings === 1),
    corrupt.map(([list, warnings]) => `${list.length} presets/${warnings} warning(s)`).join(", "));
  const [capped, capWarnings] = gpbWarnings(() =>
    loadPresets(presetsJson(Array.from({ length: MAX_PRESETS + 2 }, (_, i) => own(`p${i + 1}`, `Mine ${i + 1}`, sampleB))))
  );
  setPresets([own("p1", "Mine", sampleB)]);
  const clashes = [uniqueName("Mine"), uniqueName("fairy"), uniqueName(" Spaced "), uniqueName("y".repeat(30))];
  setPresets([own("p1", "y".repeat(PRESET_NAME_MAX), sampleB)]);
  const longClash = uniqueName("y".repeat(PRESET_NAME_MAX));
  check(21, `At most ${MAX_PRESETS} presets load; names are unique (built-ins included, any case), trimmed and ≤ ${PRESET_NAME_MAX} characters`,
    capped.length === MAX_PRESETS && capWarnings === 1 &&
      clashes.join("|") === `Mine (2)|fairy (2)|Spaced|${"y".repeat(PRESET_NAME_MAX)}` &&
      longClash.length === PRESET_NAME_MAX && longClash.endsWith(" (2)"),
    `${capped.length} loaded, ${capWarnings} warning(s); ${clashes.join(" | ")} | ${longClash}`);
  setPresets([]);
  savePresets();
  const builtInsBefore = BUILT_IN_PRESETS.map((p) => p.id).join();
  check(21, "Built-ins can't be deleted, renamed or updated",
    deletePreset("b:fairy") === null && !renamePreset("b:fairy", "Sea") && !updatePreset("b:fairy") &&
      BUILT_IN_PRESETS.map((p) => p.id).join() === builtInsBefore && BUILT_IN_PRESETS[4].name === "Fairy",
    builtInsBefore);
  // The maintainer's set (GPB #53), as share codes: names, order and colours, all fixed.
  const expectedBuiltIns = [
    ["b:void", "Void", "gpb1:eyJnIjoxLCJtIjoiYyIsInMiOlsiODM3MmZkIiwiNWE4MmZmIiwiODM3MmZkIl19"],
    ["b:sunset", "Sunset", "gpb1:eyJnIjoxLCJtIjoiYyIsInMiOlsiNmUzM2ZmIiwiZmY1ZjZkIiwiZmZjMzcxIl19"],
    ["b:aurora", "Aurora", "gpb1:eyJnIjoxLCJtIjoiYyIsInMiOlsiMDBmNWEwIiwiMDBkOWY1IiwiN2Y1YWYwIl19"],
    ["b:neon", "Neon", "gpb1:eyJnIjoxLCJtIjoiYyIsInMiOlsiZmYwMGNjIiwiMzMzM2ZmIiwiMzNmN2ZmIl19"],
    ["b:fairy", "Fairy", "gpb1:eyJnIjoxLCJtIjoiYyIsInMiOlsiZmY1OWQxIiwiZmZiODAwIiwiNzdiYzAwIl19"],
  ];
  const builtInMismatches = expectedBuiltIns.filter(([id, name, code], i) => {
    const preset = BUILT_IN_PRESETS[i];
    const applied = preset && presetSettings(preset, { mode: "compress" });
    const decoded = decodeCode(code);
    return !preset || preset.id !== id || preset.name !== name || encodeCode(applied) !== code ||
      !decoded || !sameSettings(decoded, applied) || applied.stops.some((stop) => stop.kind !== "custom");
  }).map(([id]) => id);
  check(53, "The built-ins are exactly Void, Sunset, Aurora, Neon, Fairy (in order, fixed colours); each encodes to and decodes from its code",
    BUILT_IN_PRESETS.length === expectedBuiltIns.length && !builtInMismatches.length,
    builtInMismatches.length ? `mismatch: ${builtInMismatches.join(", ")}` : BUILT_IN_PRESETS.map((p) => `${p.name} ${p.colours.join("→")}`).join("; "));
  const [renamedOnLoad, renameWarnings] = gpbWarnings(() =>
    loadPresets(presetsJson([own("p3", "fairy", sampleB), own("p1", "Void", sampleA), own("p2", "Ocean", sampleB)]))
  );
  check(53, "Stored own presets whose names clash with a built-in are renamed on load (' (2)'), ids unchanged, no warning",
    names(renamedOnLoad) === "fairy (2), Void (2), Ocean" && renamedOnLoad.map((p) => p.id).join() === "p3,p1,p2" && !renameWarnings,
    `${names(renamedOnLoad)}; ids ${renamedOnLoad.map((p) => p.id).join()}; ${renameWarnings} warning(s)`);

  // Share codes: round-trip and rejection, all through validateSettings().
  const codeCases = MODES.flatMap((mode) => [true, false].map((gradient) =>
    ({ version: SCHEMA_VERSION, gradient, mode, stops: [theme("a"), custom("b", RED), custom("c", "#00ff7f")] })));
  const roundTrips = codeCases.map((s) => {
    const back = decodeCode(encodeCode(s));
    return !!back && sameSettings(back, s) && back.stops.map((stop) => stop.id).join() === "s1,s2,s3";
  });
  const threeColours = encodeCode({ version: SCHEMA_VERSION, gradient: true, mode: "compress", stops: [custom("a", RED), custom("b", GREEN), custom("c", BLUE)] });
  check(21, "Code round-trip: theme and custom stops, every mode, gradient on and off (ids s1…sN)",
    roundTrips.every(Boolean) && threeColours.startsWith(CODE_PREFIX),
    `${roundTrips.filter(Boolean).length}/${roundTrips.length}; three colours: ${threeColours} (${threeColours.length} characters)`);
  const rawCode = (data) => CODE_PREFIX + btoa(JSON.stringify(data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const validBody = threeColours.slice(CODE_PREFIX.length);
  const invalidCodes = {
    garbage: "garbage",
    empty: "",
    "wrong prefix": `gpb2:${validBody}`,
    "prefix only": CODE_PREFIX,
    "not base64": `${CODE_PREFIX}@@@`,
    "9 stops": rawCode({ g: 1, m: "c", s: Array(9).fill("ff0000") }),
    "bad hex": rawCode({ g: 1, m: "c", s: ["zzzzzz"] }),
    "short hex": rawCode({ g: 1, m: "c", s: ["fff"] }),
    "unknown mode": rawCode({ g: 1, m: "x", s: ["ff0000"] }),
    "no mode": rawCode({ g: 1, s: ["ff0000"] }),
    "g 2": rawCode({ g: 2, m: "c", s: ["ff0000"] }),
  };
  const accepted = Object.entries(invalidCodes).filter(([, code]) => decodeCode(code) !== null).map(([name]) => name);
  check(21, "Invalid codes are rejected: garbage, a wrong prefix, 9 stops, a bad hex and more", !accepted.length,
    accepted.length ? `accepted: ${accepted.join(", ")}` : `${Object.keys(invalidCodes).length} rejected`);
  check(21, "Whitespace around a code is accepted", !!decodeCode(`  \n${threeColours}\t `), "");

  // Gradient Connect Bar's codes (GPB #59). The fixtures are shared with GCB's self-test (GCB #36).
  const FIXTURES = {
    gpbVoid: "gpb1:eyJnIjoxLCJtIjoiYyIsInMiOlsiODM3MmZkIiwiNWE4MmZmIiwiODM3MmZkIl19",
    gpbThemeAnchored: "gpb1:eyJnIjoxLCJtIjoiYSIsInMiOlsidCIsImZmNWY2ZCJdfQ",
    gcbVoidAuto: "gcb1:eyJnIjoxLCJ4IjoiYSIsInMiOlsiODM3MmZkIiwiNWE4MmZmIiwiODM3MmZkIl19",
    gcbThemeWhite: "gcb1:eyJnIjoxLCJ4IjoidyIsInMiOlsidCIsImZmNWY2ZCJdfQ",
    gcbSolidThemeDefault: "gcb1:eyJnIjowLCJ4IjoiZCIsInMiOlsidCJdfQ",
  };
  const shapeOf = (decoded) => decoded
    ? `g ${decoded.gradient ? 1 : 0}, ${decoded.mode}, ${decoded.stops.map((stop) => (stop.kind === "theme" ? "t" : stop.color)).join("→")}`
    : "null";
  const fixtureResults = {
    gpbVoid: [shapeOf(decodeCode(FIXTURES.gpbVoid, { mode: "slide" })), "g 1, compress, #8372fd→#5a82ff→#8372fd"],
    gpbThemeAnchored: [shapeOf(decodeCode(FIXTURES.gpbThemeAnchored, { mode: "slide" })), "g 1, anchored, t→#ff5f6d"],
    gcbVoidAuto: [shapeOf(decodeCode(FIXTURES.gcbVoidAuto, { mode: "anchored" })), "g 1, anchored, #8372fd→#5a82ff→#8372fd"],
    gcbVoidAutoSlide: [shapeOf(decodeCode(FIXTURES.gcbVoidAuto, { mode: "slide" })), "g 1, slide, #8372fd→#5a82ff→#8372fd"],
    gcbThemeWhite: [shapeOf(decodeCode(FIXTURES.gcbThemeWhite, { mode: "compress" })), "g 1, compress, t→#ff5f6d"],
    gcbSolidThemeDefault: [shapeOf(decodeCode(FIXTURES.gcbSolidThemeDefault, { mode: "anchored" })), "g 0, anchored, t"],
  };
  const wrongFixtures = Object.entries(fixtureResults).filter(([, [got, want]]) => got !== want);
  check(59, "Fixtures decode as specified: gpb1: brings its mode; gcb1: brings colours and gradient, keeps the current mode (text colour dropped)",
    !wrongFixtures.length && sameSettings(decodeCode(FIXTURES.gpbVoid), presetSettings(BUILT_IN_PRESETS[0], { mode: "compress" })),
    wrongFixtures.map(([k, [got, want]]) => `${k}: ${got} (expected ${want})`).join("; ") || `${Object.keys(fixtureResults).length} decodes`);
  const gcbCode = (data) => GCB_CODE_PREFIX + btoa(JSON.stringify(data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const invalidGcbCodes = {
    "unknown x": gcbCode({ g: 1, x: "q", s: ["ff0000"] }),
    "no x": gcbCode({ g: 1, s: ["ff0000"] }),
    "m instead of x": gcbCode({ g: 1, m: "c", s: ["ff0000"] }),
    "9 stops": gcbCode({ g: 1, x: "a", s: Array(9).fill("ff0000") }),
    "bad hex": gcbCode({ g: 1, x: "a", s: ["zzzzzz"] }),
    "g 2": gcbCode({ g: 2, x: "a", s: ["ff0000"] }),
    "gcb2:": `gcb2:${FIXTURES.gcbVoidAuto.slice(5)}`,
    "prefix only": GCB_CODE_PREFIX,
  };
  const acceptedGcb = Object.entries(invalidGcbCodes).filter(([, code]) => decodeCode(code) !== null).map(([name]) => name);
  check(59, "Invalid gcb1: codes are rejected, as GCB rejects them: an unknown or missing x, 9 stops, a bad hex, g 2, gcb2:",
    !acceptedGcb.length && !!decodeCode(` ${FIXTURES.gcbThemeWhite} `),
    acceptedGcb.length ? `accepted: ${acceptedGcb.join(", ")}` : `${Object.keys(invalidGcbCodes).length} rejected`);
  check(59, "Export stays gpb1:", encodeCode(settings).startsWith(CODE_PREFIX) && !encodeCode(settings).startsWith(GCB_CODE_PREFIX), encodeCode(settings));

  // The Presets row in the open modal.
  renderChips(m);
  const chipIds = () => [...m.chips.querySelectorAll(".gpb-chip")].filter((el) => !el.hidden)
    .map((el) => (el === m.saveChip ? "save" : el.dataset.preset)).join();
  const chipOf = (id) => chipEl(id);
  const pressed = () => [...m.chips.querySelectorAll('.gpb-preset-chip[aria-pressed="true"]')].map((el) => el.dataset.preset).join() || "none";
  const undoState = () => `undo "${m.undoText.textContent}"${m.undoButton.hidden ? " (no button)" : " + Undo"}`;
  const undoShows = (message) => m.undoText.textContent === `${message} · ` && !m.undoButton.hidden &&
    m.undoLine.getAttribute("aria-live") === "polite";
  const presetsRect = m.presets.getBoundingClientRect();
  const toolsRect = m.presetsRow.querySelector(".gpb-presets-tools").getBoundingClientRect();
  const labelRect = m.presetsRow.querySelector(".gpb-label").getBoundingClientRect();
  const unreachableChips = [...m.chips.querySelectorAll(".gpb-chip"), m.exportButton, m.importButton].filter((el) => !reachable(el));
  check(21, "Presets row between Spread and the preview: label left, Export and Import right, every chip reachable",
    m.presets.previousElementSibling === m.spread && m.presets.nextElementSibling === m.preview &&
      Math.abs(labelRect.left - presetsRect.left) <= 1 && Math.abs(toolsRect.right - presetsRect.right) <= 1 && !unreachableChips.length,
    `after .${m.presets.previousElementSibling?.className}, before .${m.presets.nextElementSibling?.className}; ` +
      `tools ${(presetsRect.right - toolsRect.right).toFixed(1)} px from the right` +
      (unreachableChips.length ? `; not reachable: ${unreachableChips.map((el) => el.textContent).join(", ")}` : ""));
  // Export and Import look like buttons (GPB #52): an outline, an icon, a bold label; hover read through CSSOM (GPB #50).
  const shareButtons = [[m.exportButton, "Export", EXPORT_TITLE], [m.importButton, "Import", IMPORT_TITLE]];
  const shareProblems = shareButtons.flatMap(([el, label, title]) => {
    const cs = getComputedStyle(el);
    const border = parseRgb(cs.borderTopColor);
    const svg = el.querySelector("svg");
    const problems = [];
    if (!(parseFloat(cs.borderTopWidth) >= 1) || cs.borderTopStyle !== "solid" || !border || border[3] === 0) problems.push(`${label}: border ${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`);
    if (!svg || el.firstElementChild !== svg || Math.abs(svg.getBoundingClientRect().width - 14) > 0.5) problems.push(`${label}: icon ${svg ? svg.getBoundingClientRect().width.toFixed(1) + " px" : "missing"}`);
    const shown = el.querySelector(".gpb-share-label")?.textContent;
    if (shown !== label || el.title !== title) problems.push(`${label}: label "${shown}", title "${el.title}"`);
    if (parseInt(cs.fontWeight, 10) < 700 || cs.borderTopLeftRadius === "0px") problems.push(`${label}: weight ${cs.fontWeight}, radius ${cs.borderTopLeftRadius}`);
    return problems;
  });
  const copyCodeLeft = [...m.root.querySelectorAll("*")].filter((el) => el.childElementCount === 0 && /copy code/i.test(el.textContent));
  check(52, "Export and Import are outlined pills with a 14 px icon first, bold labels 'Export' / 'Import' and their titles; no 'Copy code' left",
    !shareProblems.length && !copyCodeLeft.length,
    [...shareProblems, ...copyCodeLeft.map((el) => `"Copy code" in .${el.className}`)].join("; ") || "both fine");
  const shareRules = [...(m.root.querySelector("style")?.sheet?.cssRules ?? [])].filter((r) => r.selectorText);
  const shareHover = shareRules.find((r) => r.selectorText.split(",").some((sel) => sel.trim() === ".gpb-button:hover:not(:disabled)") &&
    r.style.getPropertyValue("border-color").trim() === "var(--spice-text)");
  const shareOverride = shareRules.find((r) => /\.gpb-share-button/.test(r.selectorText) && /:hover/.test(r.selectorText));
  check(52, "Hover on Export / Import: the border → --spice-text, as for Reset (read through CSSOM)",
    !!shareHover && !shareOverride && m.exportButton.matches(".gpb-button") && m.importButton.matches(".gpb-button"),
    shareHover ? `"${shareHover.cssText}"` : "no .gpb-button:hover:not(:disabled) rule with border-color var(--spice-text)");
  const chipSwatch = chipOf("b:aurora")?.querySelector(".gpb-chip-swatch");
  const swatchRect = chipSwatch?.getBoundingClientRect();
  const swatchProbe = document.createElement("span"); // the same serialisation as the chip's inline style
  swatchProbe.style.backgroundImage = fillImage(presetSettings(BUILT_IN_PRESETS[2]));
  check(21, "Chips: the built-ins first, then own presets, + Save last; 12 px swatches painted with fillImage()",
    chipIds() === "b:void,b:sunset,b:aurora,b:neon,b:fairy,save" && swatchRect && Math.abs(swatchRect.width - 12) <= 0.5 &&
      Math.abs(swatchRect.height - 12) <= 0.5 && getComputedStyle(chipSwatch).borderRadius === "50%" &&
      chipSwatch.style.backgroundImage === swatchProbe.style.backgroundImage,
    `${chipIds()}; swatch ${swatchRect?.width.toFixed(1)}×${swatchRect?.height.toFixed(1)}, ${chipSwatch?.style.backgroundImage}`);
  // Two rows (GPB #53): the built-ins alone, then own presets and + Save (always there).
  const rowIds = (row) => [...row.querySelectorAll(".gpb-chip")].filter((el) => !el.hidden)
    .map((el) => (el === m.saveChip ? "save" : el.dataset.preset)).join();
  const rowsSplit = (own) => rowIds(m.builtInRow) === BUILT_IN_PRESETS.map((p) => p.id).join() && rowIds(m.ownRow) === [...own, "save"].join() &&
    m.builtInRow.parentElement === m.chips && m.ownRow.parentElement === m.chips && m.builtInRow.nextElementSibling === m.ownRow;
  const rowGap = m.ownRow.getBoundingClientRect().top - m.builtInRow.getBoundingClientRect().bottom;
  check(53, "Row 1 holds only the built-ins; row 2 holds just + Save with no own presets; about 8 px between the rows",
    rowsSplit([]) && Math.abs(rowGap - 8) <= 1, `row 1 ${rowIds(m.builtInRow)}; row 2 ${rowIds(m.ownRow)}; gap ${rowGap.toFixed(1)} px`);

  // Two-step apply with a preview in the strip (GPB #51): always two clicks, no timeout.
  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN)], "anchored");
  const notAPreset = JSON.stringify(settings);
  const cssBeforePreview = styleText();
  const stripProbe = document.createElement("span"); // the same serialisation as the strip's inline style
  const stripShows = (s) => {
    stripProbe.style.backgroundImage = fillImage(s);
    return m.preview.style.backgroundImage === stripProbe.style.backgroundImage;
  };
  const statusText = () => m.undoText.textContent;
  const previewMessage = (name) => `Previewing "${name}" — click it again to apply, Esc to cancel`;
  const untouched = () => JSON.stringify(settings) === notAPreset && styleText() === cssBeforePreview;
  const fairy = chipOf("b:fairy");
  const fairyLabel = () => fairy.querySelector(".gpb-chip-label").textContent;
  const idleChipWidth = fairy.getBoundingClientRect().width;
  const dotNodes = dots();
  const hexBefore = m.hex.value;
  realClick(fairy);
  const armedChipWidth = fairy.getBoundingClientRect().width;
  check(51, "First click on a chip arms it ('Apply?', width ±1 px) and previews it in the strip; settings, #gpb-style, dots and picker unchanged",
    fairy.classList.contains("gpb-armed") && fairyLabel() === APPLY_LABEL && Math.abs(armedChipWidth - idleChipWidth) <= 1 &&
      stripShows(presetSettings(BUILT_IN_PRESETS[4])) && untouched() &&
      dots().every((el, i) => el === dotNodes[i]) && dots().length === dotNodes.length && m.hex.value === hexBefore,
    `label "${fairyLabel()}", width ${idleChipWidth.toFixed(1)} → ${armedChipWidth.toFixed(1)} px; strip ${m.preview.style.backgroundImage}`);
  check(51, "While previewing, the status line (polite live region) reads 'Previewing \"Fairy\" — click it again to apply, Esc to cancel'",
    statusText() === previewMessage("Fairy") && m.undoButton.hidden && m.undoLine.getAttribute("aria-live") === "polite",
    `"${statusText()}"`);
  stillOpen("arming a preset chip");
  press(fairy, "Escape");
  check(51, "Escape disarms the chip: the strip shows the current settings again, the status line is empty, nothing applied",
    !fairy.classList.contains("gpb-armed") && fairyLabel() === "Fairy" && stripShows(settings) && !statusText() && untouched(),
    `label "${fairyLabel()}", status "${statusText()}"`);
  stillOpen("Escape on an armed chip");
  realClick(fairy);
  await sleep(RESET_CONFIRM_MS + 500);
  check(51, `No timeout while previewing: still armed and previewing after ${(RESET_CONFIRM_MS + 500) / 1000} s`,
    fairy.classList.contains("gpb-armed") && stripShows(presetSettings(BUILT_IN_PRESETS[4])) && statusText() === previewMessage("Fairy") && untouched(),
    `label "${fairyLabel()}", status "${statusText()}"`);
  const aurora = chipOf("b:aurora");
  realClick(aurora);
  check(51, "A click on another chip moves the arm and the preview to it in one click",
    !fairy.classList.contains("gpb-armed") && fairyLabel() === "Fairy" && aurora.classList.contains("gpb-armed") &&
      stripShows(presetSettings(BUILT_IN_PRESETS[2])) && statusText() === previewMessage("Aurora") && untouched(),
    `armed ${m.armed?.chip.dataset.preset}, status "${statusText()}"`);
  stillOpen("moving the arm to another chip");
  realClick(dots()[0]);
  check(51, "A click elsewhere disarms: the strip reverts, the status line clears, nothing applied",
    !aurora.classList.contains("gpb-armed") && !m.armed && stripShows(settings) && !statusText() && untouched(),
    `status "${statusText()}"`);
  stillOpen("a click outside an armed chip");
  selectStop("s2");
  realClick(fairy);
  realClick(fairy);
  const appliedOpen = m.root.isConnected && modal === m;
  check(21, "Second click applies Fairy: its colours, gradient on, the mode kept (Anchored), the first dot selected; same chip node",
    appliedOpen && sameSettings(settings, presetSettings(BUILT_IN_PRESETS[4])) && settings.mode === "anchored" &&
      selectionIs(settings.stops[0].id) && chipOf("b:fairy") === fairy && fairy.isConnected,
    `${settings.mode}, ${settings.stops.map((s) => s.color).join(", ")}; ${selection()}`);
  check(51, "After applying, the strip and #gpb-style show the applied settings",
    stripShows(settings) && styleText() === buildCss(settings) && !fairy.classList.contains("gpb-armed"), m.preview.style.backgroundImage);
  stillOpen("applying a preset");
  const buttonColour = computedRgb(m.root, "var(--spice-button)");
  const fairyBorder = parseRgb(getComputedStyle(fairy).borderTopColor);
  check(21, "The active chip is marked: aria-pressed on Fairy only, with a --spice-button border",
    pressed() === "b:fairy" && !!fairyBorder && !!buttonColour && fairyBorder.slice(0, 3).every((v, i) => Math.abs(v - buttonColour[i]) <= 1),
    `pressed ${pressed()}, border ${getComputedStyle(fairy).borderTopColor}`);
  check(21, "Undo line after applying: 'Applied \"Fairy\" · Undo' in a polite live region", undoShows('Applied "Fairy"'), undoState());
  const fairyApplied = JSON.stringify(settings);
  realClick(fairy);
  check(51, "A click on the active chip does nothing: not armed, nothing applied, the Undo kept",
    !fairy.classList.contains("gpb-armed") && !m.armed && JSON.stringify(settings) === fairyApplied && undoShows('Applied "Fairy"'),
    `armed ${!!m.armed}, ${undoState()}`);

  const sunset = chipOf("b:sunset");
  realClick(sunset);
  const sunsetPreview = statusText() === previewMessage("Sunset") && m.undoButton.hidden && JSON.stringify(settings) === fairyApplied;
  press(sunset, "Escape");
  check(51, "Two clicks even when the current settings are a preset; disarming shows the still-running Undo again",
    sunsetPreview && undoShows('Applied "Fairy"') && JSON.stringify(settings) === fairyApplied, `previewed ${sunsetPreview}; ${undoState()}`);
  realClick(sunset);
  realClick(sunset);
  const sunsetApplied = sameSettings(settings, presetSettings(BUILT_IN_PRESETS[1])) && pressed() === "b:sunset";
  const fairyState = presetSettings(BUILT_IN_PRESETS[4]);
  realClick(m.undoButton);
  check(21, "A new action replaces the pending undo: Undo goes back to Fairy, not further",
    sunsetApplied && sameSettings(settings, fairyState) && selectionIs(settings.stops[0].id) && m.undoButton.hidden && !m.undoText.textContent,
    `${settings.stops.map((s) => s.color).join(", ")}; ${undoState()}`);
  stillOpen("Undo after applying");

  setTestSettings(true, [theme("s1"), custom("s2", RED), custom("s3", GREEN)], "slide");
  selectStop("s3");
  const exact = JSON.stringify(settings);
  realClick(fairy);
  realClick(fairy);
  realClick(m.undoButton);
  check(21, "Undo after applying restores exactly the previous settings (ids included), the selection on the first dot",
    JSON.stringify(settings) === exact && selectedId === "s1" && selectionIs("s1"), `${JSON.stringify(settings)}; ${selection()}`);
  stillOpen("Undo after applying");
  setTestSettings(false, [theme("s1")]);
  realClick(chipOf("b:neon"));
  const neonArmed = chipOf("b:neon").classList.contains("gpb-armed") && sameSettings(settings, defaultSettings());
  realClick(chipOf("b:neon"));
  check(51, "Two clicks from the defaults too: the first only arms, the second applies Neon",
    neonArmed && sameSettings(settings, presetSettings(BUILT_IN_PRESETS[3])) && pressed() === "b:neon",
    `armed first ${neonArmed}, pressed ${pressed()}`);
  setStopColour(settings.stops[0].id, BLUE);
  check(21, "Editing the colours afterwards drops the pending undo, so it never throws away later edits",
    m.undoButton.hidden && !pendingUndo, undoState());
  realClick(chipOf("b:neon"));
  realClick(chipOf("b:neon"));
  await sleep(UNDO_MS + 200);
  check(21, `Undo expires after ${UNDO_MS / 1000} s`, m.undoButton.hidden && !m.undoText.textContent && !pendingUndo, undoState());

  // + Save, the inline name field, own presets.
  setTestSettings(true, [theme("s1"), custom("s2", RED)], "slide");
  const saveNode = m.saveChip;
  realClick(saveNode);
  const nameShown = !m.nameField.hidden && m.saveChip.hidden && document.activeElement === m.nameField && m.nameField.value === "Preset 1" &&
    m.nameField.tagName === "INPUT" && !m.nameField.closest(".gpb-popover") && saveNode.isConnected;
  check(21, "+ Save turns into an inline name field (not a popover), prefilled 'Preset 1' and focused",
    nameShown, `field hidden ${m.nameField.hidden}, value "${m.nameField.value}", focus .${document.activeElement?.className}`);
  stillOpen("+ Save");
  press(m.nameField, "Escape");
  check(21, "Escape in the name field cancels: nothing saved, + Save back and focused",
    !presets.length && m.nameField.hidden && !m.saveChip.hidden && document.activeElement === m.saveChip,
    `${presets.length} presets, focus .${document.activeElement?.className}`);
  stillOpen("Escape in the name field");
  realClick(m.saveChip);
  m.nameField.value = "  Mine  ";
  press(m.nameField, "Enter");
  await tick();
  await tick();
  const mineId = presets[0]?.id;
  const mineChip = mineId && chipOf(mineId);
  const storedPresets = JSON.parse(Spicetify.LocalStorage.get(PRESETS_KEY) ?? "{}").presets ?? [];
  check(21, "Enter saves the current settings as 'Mine' (stored), its chip appears after the built-ins, active and focused",
    presets.length === 1 && presets[0].name === "Mine" && sameSettings(presetSettings(presets[0]), settings) &&
      storedPresets[0]?.name === "Mine" && chipIds() === `b:void,b:sunset,b:aurora,b:neon,b:fairy,${mineId},save` &&
      mineChip?.getAttribute("aria-pressed") === "true" && document.activeElement === mineChip && m.saveChip === saveNode,
    `${chipIds()}; pressed ${pressed()}; focus ${document.activeElement?.dataset?.preset ?? document.activeElement?.className}`);
  stillOpen("saving a preset");
  check(53, "With an own preset, row 1 still holds only the built-ins and row 2 holds the own chip, then + Save",
    rowsSplit([mineId]), `row 1 ${rowIds(m.builtInRow)}; row 2 ${rowIds(m.ownRow)}`);

  setTestSettings(true, [custom("s1", GREEN), custom("s2", BLUE)], "compress");
  realClick(chipOf(mineId));
  realClick(chipOf(mineId));
  check(21, "An own preset restores everything: gradient, mode (Slide) and stops, theme stops stay theme",
    sameSettings(settings, { gradient: true, mode: "slide", stops: [theme("x"), custom("y", RED)] }), JSON.stringify(settings));
  stillOpen("applying an own preset");

  rightClick(chipOf("b:fairy"));
  const builtInMenu = menuShown();
  closePopover();
  rightClick(chipOf(mineId));
  const shownItems = [...m.menu.querySelectorAll(".gpb-menu-item")].filter((el) => !el.hidden).map((el) => el.textContent);
  check(21, "Right-click on an own chip opens the existing menu inside the modal root: Rename, Update to current colours, Delete; built-ins have none",
    !builtInMenu && menuShown() && m.root.contains(m.menu) && popover?.anchor === chipOf(mineId) &&
      shownItems.join() === "Rename,Update to current colours,Delete" && m.menu.getAttribute("aria-label") === "Preset actions",
    `built-in menu ${builtInMenu}; items ${shownItems.join(", ")}`);
  const renameNode = m.renameItem;
  realClick(renameNode);
  const renaming = !m.nameField.hidden && m.nameField.value === "Mine" && chipOf(mineId)?.hidden &&
    m.nameField.nextElementSibling === chipOf(mineId) && renameNode.isConnected && !menuShown();
  m.nameField.value = "Fairy";
  press(m.nameField, "Enter");
  await tick();
  await tick();
  check(21, "Rename: an inline field in the chip's place; a clash with a built-in gets ' (2)'; the menu item stays connected",
    renaming && presets[0].name === "Fairy (2)" && chipOf(mineId)?.textContent.includes("Fairy (2)") && !chipOf(mineId)?.hidden,
    `field shown in place ${renaming}; name "${presets[0].name}"`);
  stillOpen("renaming a preset");
  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN), custom("s3", BLUE)], "compress");
  rightClick(chipOf(mineId));
  realClick(m.updatePresetItem);
  await tick();
  await tick();
  check(21, "Update to current colours stores the current settings in the preset; its chip turns active",
    sameSettings(presetSettings(presets[0]), settings) && chipOf(mineId)?.getAttribute("aria-pressed") === "true",
    `pressed ${pressed()}`);
  stillOpen("updating a preset");

  chipOf(mineId).focus();
  press(chipOf(mineId), "F10", { shiftKey: true });
  const keyboardMenu = menuShown() && document.activeElement === m.renameItem;
  press(document.activeElement, "Escape");
  check(21, "Keyboard: Shift+F10 on an own chip opens the menu on Rename; Escape closes it and refocuses the chip",
    keyboardMenu && !menuShown() && document.activeElement === chipOf(mineId),
    `menu ${keyboardMenu}, focus ${document.activeElement?.dataset?.preset ?? document.activeElement?.className}`);
  stillOpen("Escape in the chip menu");

  addPreset("Second");
  renderChips(m);
  const beforeDelete = JSON.stringify(presets);
  rightClick(chipOf(mineId));
  const deleteNode = m.deletePresetItem;
  realClick(deleteNode);
  await tick();
  await tick();
  check(21, "Delete removes the preset at once (storage too); 'Deleted \"Fairy (2)\" · Undo'; the menu item stays connected",
    presets.length === 1 && !chipOf(mineId) && !Spicetify.LocalStorage.get(PRESETS_KEY).includes('"Fairy (2)"') &&
      undoShows('Deleted "Fairy (2)"') && deleteNode.isConnected,
    `${names(presets)}; ${undoState()}`);
  stillOpen("deleting a preset");
  realClick(m.undoButton);
  await tick();
  await tick();
  check(21, "Undo after Delete restores the preset in its old place, in storage too",
    JSON.stringify(presets) === beforeDelete && Spicetify.LocalStorage.get(PRESETS_KEY) === presetsJson(JSON.parse(beforeDelete)) &&
      chipIds().startsWith(`b:void,b:sunset,b:aurora,b:neon,b:fairy,${mineId},`),
    `${names(presets)}; ${chipIds()}`);
  stillOpen("Undo after deleting");

  while (presets.length < MAX_PRESETS) addPreset("Fill");
  renderChips(m);
  check(21, `+ Save is disabled at ${MAX_PRESETS} presets with the title 'Up to ${MAX_PRESETS} presets'; a ${MAX_PRESETS + 1}th isn't added`,
    m.saveChip.disabled && m.saveChip.title === SAVE_FULL_LABEL && addPreset("One more") === null && presets.length === MAX_PRESETS,
    `${presets.length} presets, disabled ${m.saveChip.disabled}, title "${m.saveChip.title}"`);
  setPresets([]);
  savePresets();
  renderChips(m);

  // Import: an inline paste field; nothing changes on an invalid code.
  setTestSettings(true, [custom("s1", RED), custom("s2", GREEN)], "anchored");
  const beforeImport = JSON.stringify(settings);
  realClick(m.importButton);
  const importOpen = !m.importPanel.hidden && m.importButton.getAttribute("aria-expanded") === "true" && document.activeElement === m.codeInput;
  m.codeInput.value = "gpb1:not-a-code";
  const applyNode = m.importApply;
  realClick(applyNode);
  check(21, "Import: an invalid code is flagged (aria-invalid, 'Not a valid code') and changes nothing",
    importOpen && m.codeInput.getAttribute("aria-invalid") === "true" && m.importError.textContent === IMPORT_ERROR &&
      JSON.stringify(settings) === beforeImport,
    `panel open ${importOpen}, aria-invalid ${m.codeInput.getAttribute("aria-invalid")}, error "${m.importError.textContent}"`);
  stillOpen("an invalid import");
  const codeSample = { version: SCHEMA_VERSION, gradient: true, mode: "slide", stops: [theme("x"), custom("y", BLUE)] };
  const cssBeforeImport = styleText();
  const typeCode = (value) => {
    m.codeInput.value = value;
    m.codeInput.dispatchEvent(new Event("input", { bubbles: true }));
  };
  typeCode(`  ${encodeCode(codeSample)}  `);
  const errorCleared = !m.codeInput.hasAttribute("aria-invalid") && !m.importError.textContent;
  check(51, "A valid code in the Import field previews in the strip ('Previewing code — Apply to use it'); settings and #gpb-style unchanged",
    errorCleared && stripShows(codeSample) && statusText() === PREVIEW_CODE_MESSAGE && JSON.stringify(settings) === beforeImport &&
      styleText() === cssBeforeImport, `status "${statusText()}"`);
  typeCode("");
  const clearedReverts = stripShows(settings) && !statusText();
  typeCode(encodeCode(codeSample));
  press(m.codeInput, "Escape");
  check(51, "Clearing the field or Escape (field closed) reverts the strip and the status line",
    clearedReverts && m.importPanel.hidden && stripShows(settings) && !statusText() && JSON.stringify(settings) === beforeImport,
    `cleared reverts ${clearedReverts}; panel hidden ${m.importPanel.hidden}, status "${statusText()}"`);
  stillOpen("previewing a code");
  realClick(m.importButton);
  typeCode(`  ${encodeCode(codeSample)}  `);
  realClick(applyNode);
  check(21, "Import: a valid code applies at once (no arming), the field closes, 'Imported code · Undo'; Apply stays connected",
    errorCleared && sameSettings(settings, codeSample) && m.importPanel.hidden && undoShows("Imported code") && applyNode.isConnected,
    `${JSON.stringify(settings)}; ${undoState()}`);
  stillOpen("importing a code");
  realClick(m.undoButton);
  check(21, "Undo after Import restores exactly", JSON.stringify(settings) === beforeImport, JSON.stringify(settings));
  stillOpen("Undo after importing");
  // A gcb1: code (GPB #59): previews and applies with the current mode, and says where it's from.
  realClick(m.importButton);
  typeCode(FIXTURES.gcbThemeWhite);
  const gcbExpected = decodeCode(FIXTURES.gcbThemeWhite);
  const gcbPreviewed = stripShows(gcbExpected) && statusText() === PREVIEW_CODE_MESSAGE && JSON.stringify(settings) === beforeImport;
  press(m.codeInput, "Enter");
  check(59, "Import of a gcb1: code: previews in the strip, applies its colours with the current Spread mode, 'Imported code from Gradient Connect Bar · Undo'",
    gcbPreviewed && settings.mode === JSON.parse(beforeImport).mode && settings.stops.map((x) => (x.kind === "theme" ? "t" : x.color)).join() === "t,#ff5f6d" &&
      settings.gradient && undoShows("Imported code from Gradient Connect Bar") && m.importPanel.hidden,
    `previewed ${gcbPreviewed}; ${JSON.stringify(settings)}; ${undoState()}`);
  stillOpen("importing a gcb1: code");
  realClick(m.undoButton);

  // Export (GPB #54): writeClipboard()'s tiers in order with stubbed sources, then the real ones.
  const realSources = { ...clipboardSources };
  const exportWidth = () => m.exportButton.getBoundingClientRect().width;
  const idleExportWidth = exportWidth();
  const exportState = () => `"${m.exportLabel.textContent}", ${m.exportCheck.hasAttribute("hidden") ? "export" : "check"} icon, ${exportWidth().toFixed(1)} px`;
  const showsCopied = () => m.exportLabel.textContent === COPIED_LABEL && m.exportIcon.hasAttribute("hidden") && !m.exportCheck.hasAttribute("hidden") &&
    Math.abs(exportWidth() - idleExportWidth) <= 1;
  const showsExport = () => m.exportLabel.textContent === EXPORT_LABEL && !m.exportIcon.hasAttribute("hidden") && m.exportCheck.hasAttribute("hidden");
  let captured = null;
  let bufferSeen = "";
  const tierLog = [];
  const stubClipboard = ({ api, write, exec }) => { // each "ok", "fail" or undefined (not there)
    tierLog.length = 0;
    captured = null;
    bufferSeen = "";
    clipboardSources.api = () => api && { copy: async (text) => {
      tierLog.push("ClipboardAPI");
      if (api !== "ok") throw new Error("stub");
      captured = text;
    } };
    clipboardSources.clipboard = () => write && { writeText: async (text) => {
      tierLog.push("writeText");
      if (write !== "ok") throw new Error("stub");
      captured = text;
    } };
    clipboardSources.execCommand = (command) => {
      tierLog.push("execCommand");
      const buffer = document.activeElement;
      bufferSeen = buffer?.classList.contains("gpb-copy-buffer") && m.root.contains(buffer) &&
        buffer.selectionStart === 0 && buffer.selectionEnd === buffer.value.length ? "in the modal root, selected" : "not found";
      if (exec !== "ok" || command !== "copy") return false;
      captured = buffer?.value ?? null;
      return true;
    };
  };
  try {
    const code = encodeCode(settings);
    stubClipboard({ api: "ok", write: "ok", exec: "ok" });
    const viaApi = await copyCode(m);
    check(54, "Export uses Spicetify's ClipboardAPI first; the button itself reads 'Copied' with the check icon, width ±1 px; 'Share code copied' announced",
      viaApi === "ClipboardAPI" && tierLog.join() === "ClipboardAPI" && captured === code && showsCopied() &&
        m.announce.textContent === "Share code copied" && m.codeFallback.hidden,
      `tiers ${tierLog.join(" → ")}; ${exportState()} (was ${idleExportWidth.toFixed(1)} px); announced "${m.announce.textContent}"`);
    await sleep(COPIED_MS + 200);
    check(54, `The button reads 'Export' with its icon again after ${COPIED_MS / 1000} s`, showsExport(), exportState());
    stubClipboard({ write: "ok", exec: "ok" });
    const viaWrite = await copyCode(m);
    check(54, "Without ClipboardAPI, navigator.clipboard.writeText is used", viaWrite === "writeText" && tierLog.join() === "writeText" &&
      captured === code && showsCopied(), `tiers ${tierLog.join(" → ")}; ${exportState()}`);
    stubClipboard({ api: "fail", write: "fail", exec: "ok" });
    m.exportButton.focus({ preventScroll: true });
    const viaExec = await copyCode(m);
    check(54, "When both fail, execCommand('copy') copies from a hidden, selected textarea inside the modal root, which is removed again; focus returns",
      viaExec === "execCommand" && tierLog.join() === "ClipboardAPI,writeText,execCommand" && captured === code &&
        bufferSeen === "in the modal root, selected" && !document.querySelector(".gpb-copy-buffer") &&
        document.activeElement === m.exportButton && showsCopied(),
      `tiers ${tierLog.join(" → ")}; buffer ${bufferSeen}; focus .${document.activeElement?.className}`);
    stubClipboard({ api: "fail", write: "fail", exec: "fail" });
    const copyNode = m.exportButton;
    realClick(copyNode);
    await waitFor(() => !m.codeFallback.hidden);
    const out = m.codeOutput;
    check(54, "When all three fail, the code shows in a read-only field, selected, with the hint; the button reads 'Export'",
      tierLog.join() === "ClipboardAPI,writeText,execCommand" && !m.codeFallback.hidden && out.readOnly && out.value === code &&
        document.activeElement === out && out.selectionStart === 0 && out.selectionEnd === out.value.length &&
        m.codeFallback.querySelector(".gpb-code-hint")?.textContent === COPY_HINT && copyNode.isConnected && showsExport(),
      `tiers ${tierLog.join(" → ")}; shown ${!m.codeFallback.hidden}, selected ${out.selectionStart}–${out.selectionEnd}, hint "${m.codeFallback.querySelector(".gpb-code-hint")?.textContent}"`);
    stillOpen("Export");
  } finally {
    Object.assign(clipboardSources, realSources);
  }
  m.codeFallback.hidden = true;
  const realTier = await copyCode(m);
  check(54, "Export with the real clipboard: the code reaches it through one of the tiers, without the fallback field",
    !!realTier && m.codeFallback.hidden, realTier ? `via ${realTier}` : "every tier failed; fallback field shown");
  m.codeFallback.hidden = true;
      stillOpen("the Presets row");

  realClick(resetBtn);
  realClick(resetBtn);
  check(15, "Reset → Compress (row updated in place, disabled with one colour)", spreadShows("compress", false), spreadState());
  stillOpen("Reset from Anchored");
  const base = JSON.parse(armedBase); // back to the Reset checks' settings for the close-and-reopen check
  setTestSettings(base.gradient, base.stops, base.mode);

  realClick(resetBtn);
  const oldLabel = m.resetLabel;
  Spicetify.PopupModal.hide();
  await tick(); // the close observer runs the clean-ups
  const listenersBefore = songchangeListeners(); // nothing async until listenersOpen
  openModal();
  m = modal;
  check(37, "Arm, close and reopen → the button reads 'Reset' (timer cleared)",
    !!m && m.resetLabel.textContent === "Reset" && !m.resetButton.classList.contains("gpb-armed") &&
      oldLabel.textContent === "Reset" && JSON.stringify(settings) === armedBase,
    `new "${m?.resetLabel.textContent}", old "${oldLabel.textContent}"`);
  if (!m) return;

  const listenersOpen = songchangeListeners();
  const ours = listenersOpen.filter((fn) => !listenersBefore.includes(fn));
  const observersOpen = liveObservers;
  Spicetify.PopupModal.hide();
  await tick();
  const listenersAfter = songchangeListeners();
  check(7, "songchange listener: exactly one of ours while open, removed on close",
    ours.length === 1 && !listenersAfter.includes(ours[0]),
    `${listenersBefore.length} → ${listenersOpen.length} → ${listenersAfter.length}, ours added ${ours.length}, ` +
      `removed ${ours.length === 1 && !listenersAfter.includes(ours[0])}`);
  check(7, "Modal observers disconnected on close", observersOpen > 0 && liveObservers === 0 && modal === null,
    `${observersOpen} → ${liveObservers}`);
  check(11, "Nothing of ours left in the page after close (Hazy Settings can open cleanly)",
    !document.querySelector(".gpb-modal, .gpb-stop, .gpb-switch"), "");
  // Another extension's popup is rebuilt by display(), so our inline padding fix is gone (GPB #48).
  Spicetify.PopupModal.display({ title: "gpb self-test", content: document.createElement("p") });
  const otherPopup = [".spicetify-popup-container", ".spicetify-popup-content"]
    .map((sel) => Spicetify.PopupModal.querySelector(sel)?.getAttribute("style") ?? null);
  Spicetify.PopupModal.hide();
  check(48, "The next popup (another extension's) has none of our inline padding",
    otherPopup.every((style) => !style), `container style "${otherPopup[0] ?? ""}", content style "${otherPopup[1] ?? ""}"`);

  // ── Persistence ──
  const invalid = {
    "corrupt JSON": "{broken",
    "bad hex": JSON.stringify({ version: 1, gradient: false, stops: [{ id: "s1", kind: "custom", color: "red" }] }),
    "unknown version": JSON.stringify({ version: 99, gradient: false, stops: [theme("s1")] }),
    "9 stops": JSON.stringify({ version: 1, gradient: true, stops: Array.from({ length: 9 }, (_, i) => theme(`s${i}`)) }),
    "unknown mode": JSON.stringify({ version: 1, gradient: true, mode: "zoom", stops: [theme("s1"), theme("s2")] }),
  };
  // loadSettings() with console.warn captured; returns the result and the number of [gpb] warnings.
  const loadQuietly = (raw) => {
    const warnings = [];
    const warn = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
      return { loaded: loadSettings(raw), ours: warnings.filter((w) => w.startsWith("[gpb]")).length };
    } finally {
      console.warn = warn;
    }
  };
  for (const [label, raw] of Object.entries(invalid)) {
    const { loaded, ours } = loadQuietly(raw);
    check(label === "unknown mode" ? 15 : 2, `Invalid stored settings (${label}) → defaults + exactly one [gpb] warning`,
      JSON.stringify(loaded) === JSON.stringify(defaultSettings()) && ours === 1, `${ours} warning(s)`);
  }
  const legacy = loadQuietly(JSON.stringify({ version: 1, gradient: true, stops: [theme("s1"), custom("s2", RED)] }));
  check(15, "Stored settings without mode (before v1.2.0) → Compress, no warning",
    legacy.loaded.mode === "compress" && legacy.loaded.gradient && legacy.loaded.stops.length === 2 && legacy.ours === 0,
    `${JSON.stringify(legacy.loaded)}, ${legacy.ours} warning(s)`);

  setTestSettings(true, [theme("s1"), custom("s2", RED), custom("s4", BLUE)], "anchored");
  const writtenAtOnce = Spicetify.LocalStorage.get(STORAGE_KEY) === JSON.stringify(settings);
  await new Promise((r) => setTimeout(r, SAVE_DELAY + 100));
  const reloaded = loadSettings();
  check(2, "Saves are debounced, then a load returns identical settings (mode included)",
    !writtenAtOnce && JSON.stringify(reloaded) === JSON.stringify(settings) && reloaded.mode === "anchored",
    `written at once ${writtenAtOnce}, reloaded mode ${reloaded.mode}`);
}
