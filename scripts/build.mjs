// Builds dist/ from src/: one self-contained, unminified IIFE per extension.
//   npm run build   write dist/
//   npm run watch   rebuild on every change
//   npm run check   build in memory and fail if dist/ is out of date
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] ?? "--build";

const TARGETS = [
  { id: "gpb", entry: "src/gpb/index.js", out: "dist/gradientProgressBar.js" },
];

const common = {
  bundle: true,
  format: "iife",
  charset: "utf8",
  legalComments: "none",
  target: "esnext",
  write: false,
  logLevel: "warning",
};

async function buildAll() {
  const files = new Map();
  for (const t of TARGETS) {
    const result = await esbuild.build({ ...common, entryPoints: [path.join(root, t.entry)] });
    files.set(t.out, result.outputFiles[0].text);
  }
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
