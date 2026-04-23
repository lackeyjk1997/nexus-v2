/**
 * Prompt loader smoke test — Phase 3 Day 1 Session A permanent artifact.
 *
 * Validates that every `.md` file in `packages/prompts/files/` loads cleanly
 * through the gray-matter loader, carries the full required front-matter set
 * (name, model, temperature, max_tokens, tool_name, version), and produces
 * both a non-empty System Prompt and User Prompt Template section.
 *
 * Required because Session A moves 8 rewrites from the handoff into the v2
 * canonical location + adds `tool_name` per file. The loader's
 * `REQUIRED_FRONTMATTER` list makes tool_name mandatory; without it, every
 * consumer (transcript pipeline, call-prep orchestrator, close-analysis
 * writer) would throw at first call. This script is the canary that catches
 * missing keys at commit time, not at the first Claude call in prod.
 *
 * Precedent: `test-rls-*.ts` scripts are the canaries for schema/policy
 * drift; this one is the canary for prompt front-matter drift. Keep as a
 * permanent artifact — every new `.md` file in `packages/prompts/files/`
 * should pass this test.
 *
 * Expected output: for each prompt file, `[pass] <name> v<version>
 * tool=<tool_name>`. Exits 0 on all-pass; exits 1 on any missing key or
 * empty section.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:prompt-loader
 */
import { readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPrompt } from "@nexus/prompts";

const here = dirname(fileURLToPath(import.meta.url));
const promptsDir = resolve(here, "../../prompts/files");

interface Result {
  name: string;
  ok: boolean;
  detail: string;
}

function testPrompt(name: string): Result {
  try {
    const loaded = loadPrompt(name);
    const fm = loaded.frontmatter;

    const required = [
      "name",
      "model",
      "temperature",
      "max_tokens",
      "tool_name",
      "version",
    ] as const;
    const missing = required.filter(
      (k) => fm[k] === undefined || fm[k] === null || fm[k] === "",
    );
    if (missing.length > 0) {
      return {
        name,
        ok: false,
        detail: `missing or empty front-matter: ${missing.join(", ")}`,
      };
    }

    if (!loaded.systemPrompt.trim()) {
      return { name, ok: false, detail: "empty System Prompt section" };
    }
    if (!loaded.userTemplate.trim()) {
      return { name, ok: false, detail: "empty User Prompt Template section" };
    }

    return {
      name,
      ok: true,
      detail: `v${fm.version} tool=${fm.tool_name} model=${fm.model} temp=${fm.temperature} max_tokens=${fm.max_tokens}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name, ok: false, detail: `threw: ${msg}` };
  }
}

async function main(): Promise<void> {
  const files = readdirSync(promptsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => basename(f, ".md"))
    .sort();

  if (files.length === 0) {
    console.error(`No .md prompt files found in ${promptsDir}`);
    process.exit(1);
  }

  console.log(`Prompt loader smoke — ${files.length} files in ${promptsDir}\n`);

  const results = files.map((name) => testPrompt(name));

  let failed = 0;
  for (const r of results) {
    const tag = r.ok ? "[pass]" : "[FAIL]";
    console.log(`${tag} ${r.name} — ${r.detail}`);
    if (!r.ok) failed++;
  }

  console.log("");
  if (failed > 0) {
    console.error(`${failed}/${results.length} failed`);
    process.exit(1);
  }
  console.log(`all ${results.length} prompts load cleanly`);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
