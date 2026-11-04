// ── Clipboard (GPB #54) ──
// One helper for every copy: Export, the hex field's copy button (GPB #56) and the self-test report.
// Spotify's client refuses navigator.clipboard.writeText, so Spicetify's ClipboardAPI goes first,
// then writeText, then execCommand("copy") from a hidden, selected textarea. An async tier that
// hasn't settled after CLIPBOARD_TIMEOUT_MS counts as failed. execCommand needs the click's user
// activation, which Chromium keeps for 5 s, so it still works after the other two have failed.

import { P } from "ext:config";

const CLIPBOARD_TIMEOUT_MS = 1500;

// Where execCommand's textarea goes: the open modal's root (modal.js sets this), else <body>.
let copyContainer = () => document.body;

export function setCopyContainer(container) {
  copyContainer = container;
}

export const clipboardSources = { // where the tiers come from; the self-test swaps these for stubs
  api: () => window.Spicetify?.Platform?.ClipboardAPI,
  clipboard: () => navigator.clipboard,
  execCommand: (command) => document.execCommand(command),
};

// Resolves to the tier that worked ("ClipboardAPI", "writeText" or "execCommand"), or null.
export async function writeClipboard(text) {
  const settle = (promise) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("clipboard timeout")), CLIPBOARD_TIMEOUT_MS)),
  ]);
  const asyncTiers = [
    ["ClipboardAPI", () => {
      const clipboardApi = clipboardSources.api();
      if (typeof clipboardApi?.copy !== "function") throw new Error("no ClipboardAPI");
      return clipboardApi.copy(text);
    }],
    ["writeText", () => {
      const clipboard = clipboardSources.clipboard();
      if (typeof clipboard?.writeText !== "function") throw new Error("no clipboard");
      return clipboard.writeText(text);
    }],
  ];
  for (const [name, write] of asyncTiers) {
    try {
      await settle(Promise.resolve().then(write));
      return name;
    } catch {}
  }
  return execCommandCopy(text) ? "execCommand" : null;
}

// The textarea goes inside the modal root while it's open (never into Spotify's DOM around it)
// and is removed straight away; focus goes back to where it was.
function execCommandCopy(text) {
  const buffer = document.createElement("textarea");
  buffer.className = `${P}-copy-buffer`;
  buffer.value = text;
  buffer.readOnly = true;
  buffer.tabIndex = -1;
  buffer.setAttribute("aria-hidden", "true");
  Object.assign(buffer.style, { position: "fixed", top: "0", left: "0", width: "1px", height: "1px", padding: "0", border: "0", opacity: "0", pointerEvents: "none" });
  const focused = document.activeElement;
  copyContainer().append(buffer);
  buffer.focus({ preventScroll: true });
  buffer.select();
  let copied = false;
  try {
    copied = clipboardSources.execCommand("copy") === true;
  } catch {}
  buffer.remove();
  if (focused?.isConnected && focused !== document.body) focused.focus({ preventScroll: true });
  return copied;
}

async function copyText(text) {
  return !!(await writeClipboard(text));
}
