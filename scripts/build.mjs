// Builds dist/ from src/: one self-contained, unminified IIFE per extension.
//   npm run build   write dist/
//   npm run watch   rebuild whenever src/ changes
//   npm run check   build in memory; fail if dist/ is out of date or a build check fails
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

const OUT = {
  gpb: "dist/gradientProgressBar.js",
  gcb: "dist/gradientConnectBar.js",
  gb: "dist/gradientBars.js",
};

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

async function buildAll() {
  const files = new Map();
  const gpb = await bundle("gpb", "gpb");
  const gcb = await bundle("gcb", "gcb");
  files.set(OUT.gpb, header("gpb", ["Built from src/shared/ and src/gpb/ with esbuild: edit those, then run npm run build."]) + gpb);
  files.set(OUT.gcb, header("gcb", ["Built from src/shared/ and src/gcb/ with esbuild: edit those, then run npm run build."]) + gcb);
  const parts = [
    ["Gradient Progress Bar", await bundle("gpb", "gb")],
    ["Gradient Connect Bar", await bundle("gcb", "gb")],
    ["Gradient Bars: window.__gb", await bundle("gb", "gb")],
  ];
  files.set(OUT.gb, header("gb", [
    `Contains Gradient Progress Bar ${configValue("gpb", "VERSION")} and Gradient Connect Bar ${configValue("gcb", "VERSION")}, each as built`,
    "for its own file, then window.__gb. Built from src/ with esbuild: edit that, then run npm run build.",
  ]) + parts.map(([name, text]) => `// ── ${name} ${"─".repeat(Math.max(4, 96 - name.length))}\n${text}`).join("\n"));
  return files;
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
  const problems = buildProblems(files);
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
