import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

export interface PromptFrontmatter {
  name: string;
  prompt_id?: number;
  rewrite_source?: string;
  model: string;
  temperature: number;
  max_tokens: number;
  tool_name: string;
  version: string;
}

export interface LoadedPrompt {
  systemPrompt: string;
  userTemplate: string;
  frontmatter: PromptFrontmatter;
  filePath: string;
}

const REQUIRED_FRONTMATTER: (keyof PromptFrontmatter)[] = [
  "name",
  "model",
  "temperature",
  "max_tokens",
  "tool_name",
  "version",
];

/**
 * The .md files live in packages/prompts/files/. We resolve the directory from
 * this module's own location so that tsx (running packages/prompts/src from
 * source) and Next.js (which transpiles shared workspaces) both find it.
 */
function filesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // From src/: ../files; from transpiled dist/: ../files as well.
  return resolve(here, "..", "files");
}

const cache = new Map<string, LoadedPrompt>();

export function loadPrompt(name: string): LoadedPrompt {
  const cached = cache.get(name);
  if (cached) return cached;

  const filePath = join(filesDir(), `${name}.md`);
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (err) {
    throw new Error(
      `Prompt file not found: ${filePath} (name="${name}"). Looked in ${filesDir()}.`,
    );
  }

  const parsed = matter(raw);
  const fm = parsed.data as Partial<PromptFrontmatter>;

  const missing = REQUIRED_FRONTMATTER.filter((k) => fm[k] === undefined || fm[k] === null);
  if (missing.length > 0) {
    throw new Error(
      `Prompt "${name}" missing front-matter keys: ${missing.join(", ")}. File: ${filePath}`,
    );
  }

  const { systemPrompt, userTemplate } = splitSections(parsed.content, name);

  const loaded: LoadedPrompt = {
    systemPrompt,
    userTemplate,
    frontmatter: fm as PromptFrontmatter,
    filePath,
  };
  cache.set(name, loaded);
  return loaded;
}

/**
 * The rewrite files in docs/handoff/source/prompts/ use H1 section headers:
 *   # System Prompt
 *   # User Prompt Template
 *   # Interpolation Variables   ← human-reference only, discarded
 *   # Tool-Use Schema           ← human-reference only, discarded
 *   # Integration Notes         ← human-reference only, discarded
 *
 * We only need the first two at runtime; everything else is documentation
 * for the human operator.
 */
function splitSections(body: string, name: string): { systemPrompt: string; userTemplate: string } {
  const lines = body.split("\n");
  const sections = new Map<string, string[]>();
  let current: string | null = null;

  for (const line of lines) {
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match) {
      current = match[1]!.trim();
      sections.set(current, []);
      continue;
    }
    if (current) sections.get(current)!.push(line);
  }

  const systemPrompt = sections.get("System Prompt")?.join("\n").trim() ?? "";
  const userTemplate = sections.get("User Prompt Template")?.join("\n").trim() ?? "";

  if (!systemPrompt) {
    throw new Error(
      `Prompt "${name}" has no "# System Prompt" section — per Principle 5, system prompts are never empty.`,
    );
  }
  if (!userTemplate) {
    throw new Error(`Prompt "${name}" has no "# User Prompt Template" section.`);
  }
  return { systemPrompt, userTemplate };
}

/**
 * Replace `${varName}` tokens in a template with values from `vars`.
 * Throws PromptInterpolationError (defined in @nexus/shared/claude) if any
 * token is unmapped — we never silently leave a literal `${…}` in a prompt
 * sent to Claude.
 *
 * The error is constructed here lazily so packages/prompts doesn't depend on
 * packages/shared (would be a cycle).
 */
export function interpolate(
  template: string,
  vars: Record<string, unknown>,
  promptFile = "<unknown>",
): string {
  const missing: string[] = [];
  const result = template.replace(/\$\{(\w+)\}/g, (_, key: string) => {
    if (!(key in vars) || vars[key] === undefined || vars[key] === null) {
      missing.push(key);
      return `\${${key}}`;
    }
    return String(vars[key]);
  });
  if (missing.length > 0) {
    const err = new Error(
      `Prompt interpolation failed for "${promptFile}": missing ${missing.join(", ")}`,
    );
    err.name = "PromptInterpolationError";
    (err as Error & { promptFile: string; missingVars: string[] }).promptFile = promptFile;
    (err as Error & { promptFile: string; missingVars: string[] }).missingVars = missing;
    throw err;
  }
  return result;
}
