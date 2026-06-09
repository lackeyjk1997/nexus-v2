/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@nexus/db", "@nexus/shared", "@nexus/prompts"],
  experimental: {
    // Prompt .md files are read from disk at runtime by @nexus/prompts'
    // loader (no inline prompt strings per Guardrail 19). Next's output
    // file tracing only follows JS imports, so the files/ dir must be
    // included explicitly or the worker 500s with "Could not locate
    // packages/prompts/files/". The worker route is the production
    // prompt consumer (all Claude calls run as jobs per Guardrail 5).
    // Phase 3 Day 2 Session B parked item — closed Phase 4 Day 5 A after
    // the first real production prompt-load (seed pipeline) surfaced it.
    outputFileTracingIncludes: {
      "/api/jobs/worker": ["../../packages/prompts/files/**"],
    },
  },
};

export default nextConfig;
