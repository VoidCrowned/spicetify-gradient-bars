// Builds dist/ from src/: one self-contained, unminified IIFE per extension.
//   npm run build   write dist/
//   npm run check   build in memory; fail if dist/ is out of date or a build check fails
//   npm run dev     write dev/ (gitignored): the same code plus an inline source map, so devtools
//                   shows src/ with its comments
//   npm run watch   like dev, and again whenever src/ changes
//
// src/shared/ is written once and built into each extension: its modules import the extension's
// own names from "ext:config" and "ext:hooks", which resolve to src/<id>/config.js and hooks.js.
// Gradient Bars is both bars' bundles (marked as the Gradient Bars copy) followed by src/gb/, in
// one file, so each bar keeps its own state exactly as when the two files are installed side by
// side.
//
// Build checks (also run by npm run build):
//  - no free variables except browser and Spicetify globals: a missing import would otherwise
//    only fail at run time;
//  - no top-level initialiser uses a constant declared further down (esbuild turns top-level
//    const into var, so that would be undefined, not an error);
//  - joinGradientBars() is the same text in every bundle, and its hash is filled in (GPB #58).
import * as esbuild from "esbuild";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import * as eslintScope from "eslint-scope";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] ?? "--build";
// dev/ gets the same code as dist/ plus a source map; dist/ stays without comments and maps.
const DEV = mode === "--dev" || mode === "--watch";

const FILES = { gpb: "gradientProgressBar.js", gcb: "gradientConnectBar.js", gb: "gradientBars.js" };
const OUT = Object.fromEntries(Object.entries(FILES).map(([id, file]) => [id, `${DEV ? "dev" : "dist"}/${file}`]));

const DESCRIPTIONS = {
  gpb: "Recolours the song progress bar with a solid colour or a multi-stop gradient.",
  gcb: "Recolours Spotify's Connect bar (\"Playing on …\") with a solid colour or a multi-stop gradient.",
  gb: "Gradient Progress Bar and Gradient Connect Bar in one extension.",
};

// "ext:config" and "ext:hooks" in src/shared/ → src/<id>/config.js and src/<id>/hooks.js.
const extModules = (id) => ({
  name: "ext-modules",
  setup(build) {
    build.onResolve({ filter: /^ext:\w+$/ }, (args) => ({ path: path.join(root, "src", id, `${args.path.slice(4)}.js`) }));
  },
});

const configValue = (id, name) => fs.readFileSync(path.join(root, "src", id, "config.js"), "utf8").match(new RegExp(`export const ${name} = "([^"]+)"`))[1];
const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");
const parse = (text) => acorn.parse(text, { ecmaVersion: "latest", ranges: true });

// A bundle's text and, in a dev build, its source map (sources named "spicetify-gradient-bars/src/…").
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
    ...(DEV && { sourcemap: "external", sourcesContent: true, outfile: path.join(root, "dev", "bundle.js") }),
  });
  const js = result.outputFiles.find((file) => !file.path.endsWith(".map"));
  const map = result.outputFiles.find((file) => file.path.endsWith(".map"));
  // Filling in the placeholders only shifts the columns after them on their own line.
  let text = js.text.replaceAll('"__COPY__"', JSON.stringify(copy));
  // The shared top-bar block's hash, as the self-test computes it: joinGradientBars() as built.
  const block = functionText(text, "joinGradientBars");
  if (block) text = text.replace('"__SHARED_ENTRY_SHA256__"', JSON.stringify(sha256(block)));
  if (!map) return { text };
  const parsed = JSON.parse(map.text);
  parsed.sources = parsed.sources.map((source) => `spicetify-gradient-bars/${source.replace(/^(\.\.\/)+/, "")}`);
  return { text, map: parsed };
}

// The source text of the top-level function `name` in a bundle, or null.
function functionText(text, name) {
  let found = null;
  walk.simple(parse(text), {
    FunctionDeclaration(node) {
      if (node.id?.name === name) found = text.slice(node.start, node.end);
    },
  });
  return found;
}

function header(id, lines) {
  return [
    `NAME: ${configValue(id === "gb" ? "gb" : id, "NAME")}`,
    `VERSION: ${configValue(id, "VERSION")}`,
    "AUTHOR: VoidCrowned",
    "REPO: https://github.com/VoidCrowned/spicetify-gradient-bars",
    `DESCRIPTION: ${DESCRIPTIONS[id]}`,
    "LICENSE: WTFPL v2, see LICENSE",
    "",
    ...lines,
  ].map((line) => `// ${line}`.trimEnd()).join("\n") + "\n\n";
}

// Joins a file from pieces (bundles, and plain text without a map: headers, separators). A dev
// build ends the file with one inline source map that covers every bundle at its line.
function join(pieces) {
  const text = pieces.map((piece) => piece.text).join("");
  if (!DEV) return text;
  const parts = [];
  let line = 0;
  for (const piece of pieces) {
    if (piece.map) parts.push({ line, map: piece.map });
    line += piece.text.split("\n").length - 1;
  }
  const map = Buffer.from(JSON.stringify(mergeMaps(parts))).toString("base64");
  return `${text}//# sourceMappingURL=data:application/json;charset=utf-8;base64,${map}\n`;
}

async function buildAll() {
  const files = new Map();
  const gpb = await bundle("gpb", "gpb");
  const gcb = await bundle("gcb", "gcb");
  files.set(OUT.gpb, join([{ text: header("gpb", ["Built from src/shared/ and src/gpb/ with esbuild: edit those, then run npm run build."]) }, gpb]));
  files.set(OUT.gcb, join([{ text: header("gcb", ["Built from src/shared/ and src/gcb/ with esbuild: edit those, then run npm run build."]) }, gcb]));
  const parts = [
    ["Gradient Progress Bar", await bundle("gpb", "gb")],
    ["Gradient Connect Bar", await bundle("gcb", "gb")],
    ["Gradient Bars: window.__gb", await bundle("gb", "gb")],
  ];
  files.set(OUT.gb, join([
    { text: header("gb", [
      `Contains Gradient Progress Bar ${configValue("gpb", "VERSION")} and Gradient Connect Bar ${configValue("gcb", "VERSION")}, each as built`,
      "for its own file, then window.__gb. Built from src/ with esbuild: edit that, then run npm run build.",
    ]) },
    ...parts.flatMap(([name, part], i) => [{ text: `${i ? "\n" : ""}// ── ${name} ${"─".repeat(Math.max(4, 96 - name.length))}\n` }, part]),
  ]));
  return files;
}

// Source maps for dev/: several maps merged into one flat map, each shifted to its line in the
// file. Flat rather than an index map ("sections"), which not every devtools version reads.
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// "mappings" → lines of segments with absolute values [column, source, sourceLine, sourceColumn, name?].
function decodeMappings(mappings) {
  const state = [0, 0, 0, 0, 0];
  return mappings.split(";").map((lineText) => {
    state[0] = 0;
    return (lineText ? lineText.split(",") : []).map((segmentText) => {
      const values = [];
      let value = 0, shift = 0;
      for (const char of segmentText) {
        const digit = BASE64.indexOf(char);
        value += (digit & 31) << shift;
        if (digit & 32) shift += 5;
        else {
          values.push(value & 1 ? -(value >>> 1) : value >>> 1);
          value = shift = 0;
        }
      }
      values.forEach((delta, i) => (state[i] += delta));
      return state.slice(0, values.length);
    });
  });
}

function encodeVlq(value) {
  let rest = value < 0 ? (-value << 1) | 1 : value << 1;
  let out = "";
  do {
    const digit = rest & 31;
    rest >>>= 5;
    out += BASE64[rest ? digit | 32 : digit];
  } while (rest);
  return out;
}

function encodeMappings(lines) {
  const state = [0, 0, 0, 0, 0];
  return Array.from(lines, (segments = []) => {
    state[0] = 0;
    return segments.map((segment) => segment.map((value, i) => {
      const delta = value - state[i];
      state[i] = value;
      return encodeVlq(delta);
    }).join("")).join(",");
  }).join(";");
}

function mergeMaps(parts) {
  const sources = [], sourcesContent = [], names = [], lines = [];
  const indexOf = (list, item) => (list.includes(item) ? list.indexOf(item) : list.push(item) - 1);
  for (const { line, map } of parts) {
    const sourceIndex = map.sources.map((source, i) => {
      if (!sources.includes(source)) sourcesContent.push(map.sourcesContent?.[i] ?? null);
      return indexOf(sources, source);
    });
    const nameIndex = (map.names ?? []).map((name) => indexOf(names, name));
    decodeMappings(map.mappings).forEach((segments, i) => {
      lines[line + i] = segments.map(([column, source, sourceLine, sourceColumn, name]) => [
        column,
        ...(source === undefined ? [] : [sourceIndex[source], sourceLine, sourceColumn]),
        ...(name === undefined ? [] : [nameIndex[name]]),
      ]);
    });
  }
  return { version: 3, sources, sourcesContent, names, mappings: encodeMappings(lines) };
}

const GLOBALS = new Set(("window document console navigator location Spicetify innerWidth innerHeight setTimeout clearTimeout " +
  "requestAnimationFrame cancelAnimationFrame getComputedStyle structuredClone queueMicrotask btoa atob crypto CSS " +
  "MutationObserver TextEncoder XMLHttpRequest Promise Date Math JSON Object Array String Number Boolean Map Set WeakMap " +
  "Error RegExp Symbol Function Uint8Array Infinity NaN undefined parseInt parseFloat isNaN performance Event MouseEvent " +
  "KeyboardEvent PointerEvent DragEvent DataTransfer Node CSSStyleSheet").split(" "));

function buildProblems(files) {
  const problems = [];
  const blocks = new Map();
  for (const [out, text] of files) {
    const ast = parse(text);
    const scopes = eslintScope.analyze(ast, { ecmaVersion: 2022 });
    const free = [...new Set([...scopes.globalScope.through].map((r) => r.identifier.name))].filter((n) => !GLOBALS.has(n));
    if (free.length) problems.push(`${out}: free variables ${free.join(", ")} (a missing import?)`);
    for (const statement of ast.body) {
      const body = statement.expression?.callee?.body?.body;
      if (!body) continue;
      const declared = new Map();
      body.forEach((stmt, i) => {
        if (stmt.type === "VariableDeclaration") for (const d of stmt.declarations) declared.set(d.id.name, i);
      });
      body.forEach((stmt, i) => {
        const inits = stmt.type === "VariableDeclaration" ? stmt.declarations.map((d) => d.init).filter(Boolean) : stmt.type === "ExpressionStatement" ? [stmt.expression] : [];
        for (const init of inits) walk.recursive(init, null, {
          Function() {},
          ArrowFunctionExpression() {},
          FunctionExpression() {},
          Identifier(node) {
            if (declared.get(node.name) > i) problems.push(`${out}: ${node.name} is used at load time before it's declared`);
          },
        });
      });
      walk.simple(statement, {
        FunctionDeclaration(node) {
          if (node.id?.name === "joinGradientBars") blocks.set(`${out}@${node.start}`, text.slice(node.start, node.end));
        },
      });
    }
    if (text.includes("__SHARED_ENTRY_SHA256__") || text.includes('"__COPY__"')) problems.push(`${out}: a placeholder wasn't filled in`);
  }
  if (new Set(blocks.values()).size !== 1) problems.push(`joinGradientBars() differs between bundles: ${[...blocks.keys()].join(", ")}`);
  return problems;
}

async function run() {
  const files = await buildAll();
  const problems = buildProblems(new Map([...files].map(([out, text]) => [out, text.replace(/\/\/# sourceMappingURL=.*\n$/, "")])));
  for (const problem of problems) console.error(`build check: ${problem}`);
  if (mode === "--check") {
    const stale = [...files].filter(([out, text]) => {
      const file = path.join(root, out);
      return !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text;
    });
    for (const [out] of stale) console.error(`${out} is out of date: run npm run build`);
    if (!stale.length && !problems.length) console.log("dist/ is up to date and passes the build checks.");
    return stale.length || problems.length ? 1 : 0;
  }
  if (problems.length) return 1;
  for (const [out, text] of files) {
    fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
    fs.writeFileSync(path.join(root, out), text);
    console.log(`${out}  ${(text.length / 1024).toFixed(0)} KB`);
  }
  return 0;
}

if (mode === "--watch") {
  let timer = 0;
  const rebuild = () => run().catch((e) => console.error(e.message)).then(() => console.log("watching src/ …"));
  await rebuild();
  fs.watch(path.join(root, "src"), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 100);
  });
} else {
  process.exit(await run());
}
