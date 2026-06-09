/**
 * Generate src/inline-files.generated.ts — a build-time mirror of
 * files/*.md as a TS module.
 *
 * Why this exists (Phase 4 Day 5 A): the canonical prompt source is the
 * .md files on disk (Guardrail 19 — no authored inline prompt strings).
 * But production serverless bundles only reliably contain what the JS
 * module graph references: Vercel's output tracing dropped the out-of-
 * project-root files/ dir even with outputFileTracingIncludes configured
 * (worker 500'd "Could not locate packages/prompts/files/" on the first
 * real production prompt-load). Importing the contents as a generated
 * module makes prompt availability a property of the bundle itself —
 * immune to tracing config, dashboard root-directory settings, and
 * runtime cwd.
 *
 * Discipline:
 *  - .md files stay canonical; this artifact is REGENERATED, never edited.
 *  - The loader prefers disk (strategies 1-3) so local authoring + tsx
 *    scripts read live files; the inline map is the bundled fallback.
 *  - `pnpm --filter @nexus/prompts test:inline-sync` fails if the
 *    artifact drifts from files/ — run generate:inline and commit both.
 *
 * Usage:
 *   pnpm --filter @nexus/prompts generate:inline
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const filesDir = resolve(here, "..", "files");
const outPath = resolve(here, "..", "src", "inline-files.generated.ts");

const names = readdirSync(filesDir)
  .filter((f) => f.endsWith(".md"))
  .sort();

const entries = names.map((f) => {
  const content = readFileSync(resolve(filesDir, f), "utf8");
  return `  ${JSON.stringify(f)}: ${JSON.stringify(content)},`;
});

const banner = `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Build-time mirror of packages/prompts/files/*.md. The .md files are
 * canonical (Guardrail 19); regenerate with:
 *   pnpm --filter @nexus/prompts generate:inline
 * Sync is enforced by test:inline-sync. See scripts/generate-inline.mts
 * for why this exists (Vercel serverless bundling).
 */
`;

const body = `${banner}
export const INLINE_PROMPT_FILES: Readonly<Record<string, string>> = {
${entries.join("\n")}
};
`;

writeFileSync(outPath, body);
console.log(`generated ${outPath} with ${names.length} prompt files`);
