/**
 * Gate: src/inline-files.generated.ts must mirror files/*.md exactly.
 *
 * Fails when a prompt file was edited/added/removed without regenerating
 * the inline mirror (pnpm --filter @nexus/prompts generate:inline).
 * Companion to generate-inline.mts — see its docblock for why the mirror
 * exists (Vercel serverless bundling, Phase 4 Day 5 A).
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { INLINE_PROMPT_FILES } from "../src/inline-files.generated";

const here = dirname(fileURLToPath(import.meta.url));
const filesDir = resolve(here, "..", "files");

const diskNames = readdirSync(filesDir)
  .filter((f) => f.endsWith(".md"))
  .sort();
const inlineNames = Object.keys(INLINE_PROMPT_FILES).sort();

let failures = 0;

const missing = diskNames.filter((n) => !inlineNames.includes(n));
const extra = inlineNames.filter((n) => !diskNames.includes(n));
if (missing.length > 0) {
  console.error(`MISSING from inline mirror: ${missing.join(", ")}`);
  failures++;
}
if (extra.length > 0) {
  console.error(`EXTRA in inline mirror (removed from disk?): ${extra.join(", ")}`);
  failures++;
}

for (const name of diskNames) {
  const disk = readFileSync(resolve(filesDir, name), "utf8");
  const inline = INLINE_PROMPT_FILES[name];
  if (inline !== undefined && inline !== disk) {
    console.error(`DRIFT: ${name} differs between disk and inline mirror`);
    failures++;
  }
}

if (failures > 0) {
  console.error(
    `\ntest:inline-sync FAILED (${failures}) — run: pnpm --filter @nexus/prompts generate:inline`,
  );
  process.exit(1);
}
console.log(
  `test:inline-sync PASS — ${diskNames.length}/${diskNames.length} prompt files byte-identical to inline mirror`,
);
