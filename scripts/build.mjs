// Builds dist/ from src/: one self-contained, unminified IIFE per extension.
//   npm run build   write dist/
//   npm run watch   rebuild on every change
//   npm run check   build in memory; fail if dist/ is out of date or a build check fails
//
// src/shared/ is written once and built into each extension: its modules import the extension's
// own names from "ext:config" and "ext:hooks", which resolve to src/<id>/config.js and hooks.js. Gradient Bars is both
// extensions' bundles (built with COPY = "gb") followed by src/gb/, in one file, so each bar keeps
// its own state exactly as when the two files are installed side by side.
import * as esbuild from "esbuild";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] ?? "--build";

const OUT = {
  gpb: "dist/gradientProgressBar.js",
  gcb: "dist/gradientConnectBar.js",
  gb: "dist/gradientBars.js",
};

// "ext:config" and "ext:hooks" in src/shared/ → src/<id>/config.js and src/<id>/hooks.js.
const extModules = (id) => ({
  name: "ext-modules",
  setup(build) {
    build.onResolve({ filter: /^ext:\w+$/ }, (args) => ({ path: path.join(root, "src", id, `${args.path.slice(4)}.js`) }));
  },
});

async function bundle(id, copy) {
  const result = await esbuild.build({
    entryPoints: [path.join(root, "src", id, "index.js")],
    bundle: true,
    format: "iife",
    charset: "utf8",
    legalComments: "none",
    target: "esnext",
    write: false,
    logLevel: "warning",
    plugins: [extModules(id)],
  });
  let text = result.outputFiles[0].text.replaceAll('"__COPY__"', JSON.stringify(copy));
  // The shared top-bar block's hash, as the self-test computes it: joinGradientBars() as built.
  const block = functionText(text, "joinGradientBars");
  if (block) text = text.replace('"__SHARED_ENTRY_SHA256__"', JSON.stringify(sha256(block)));
  return text;
}

const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

// The source text of the top-level function `name` in a bundle, or null.
function functionText(text, name) {
  let found = null;
  walk.simple(acorn.parse(text, { ecmaVersion: "latest" }), {
    FunctionDeclaration(node) {
      if (node.id?.name === name) found = text.slice(node.start, node.end);
    },
  });
  return found;
}

const banner = (lines) => lines.map((line) => `// ${line}`.trimEnd()).join("\n") + "\n";

const HEADERS = {
  gpb: ["NAME: Gradient Progress Bar", "AUTHOR: VoidCrowned", "REPO: https://github.com/VoidCrowned/spicetify-gradient-bars",
    "DESCRIPTION: Recolours the song progress bar with a solid colour or a multi-stop gradient.", "LICENSE: WTFPL v2, see LICENSE",
    "", "Built from src/ (shared/ and gpb/) with esbuild: edit those, then run npm run build."],
  gcb: ["NAME: Gradient Connect Bar", "AUTHOR: VoidCrowned", "REPO: https://github.com/VoidCrowned/spicetify-gradient-bars",
    "DESCRIPTION: Recolours Spotify's Connect bar (\"Playing on …\") with a solid colour or a multi-stop gradient.", "LICENSE: WTFPL v2, see LICENSE",
    "", "Built from src/ (shared/ and gcb/) with esbuild: edit those, then run npm run build."],
  gb: ["NAME: Gradient Bars", "AUTHOR: VoidCrowned", "REPO: https://github.com/VoidCrowned/spicetify-gradient-bars",
    "DESCRIPTION: Gradient Progress Bar and Gradient Connect Bar in one extension.", "LICENSE: WTFPL v2, see LICENSE",
    "", "Built from src/ with esbuild: Gradient Progress Bar, then Gradient Connect Bar, then src/gb/.",
    "Edit src/, then run npm run build."],
};

async function buildAll() {
  const files = new Map();
  files.set(OUT.gpb, banner(HEADERS.gpb) + "\n" + (await bundle("gpb", "gpb")));
  files.set(OUT.gcb, banner(HEADERS.gcb) + "\n" + (await bundle("gcb", "gcb")));
  return files;
}

async function main() {
  const files = await buildAll();
  if (mode === "--check") {
    const stale = [...files].filter(([out, text]) => {
      const file = path.join(root, out);
      return !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text;
    });
    for (const [out] of stale) console.error(`${out} is out of date: run npm run build`);
    process.exit(stale.length ? 1 : 0);
  }
  for (const [out, text] of files) {
    fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
    fs.writeFileSync(path.join(root, out), text);
    console.log(`${out}  ${(text.length / 1024).toFixed(0)} KB`);
  }
}

await main();
