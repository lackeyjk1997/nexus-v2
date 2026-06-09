/**
 * Demo-path e2e — real-browser verification of the exact 2026-06-10 demo
 * click-path against production (or any base URL).
 *
 * Standing rule: CLI smoke misses browser-only bugs — this drives headless
 * Chromium through the same clicks the demo makes:
 *
 *   1. /api/demo-login (token-gated) → lands authenticated on /intelligence
 *   2. /intelligence renders ≥2 pattern notes, the emerging-candidate
 *      section, and the silence-ledger footnote
 *   3. Click-through: first affected deal → /pipeline/<dealId> deal detail
 *   4. /pipeline portfolio view shows the seeded deals
 *   5. Unauthenticated context → /intelligence redirects to /login
 *   6. /api/demo-login with a wrong token → 404, no session
 *
 * Screenshots land in apps/web/e2e/artifacts/ (gitignored).
 *
 * Usage:
 *   node apps/web/e2e/demo-path.mjs
 *   E2E_BASE_URL=http://localhost:3001 node apps/web/e2e/demo-path.mjs
 *
 * Token: DEMO_LOGIN_TOKEN ?? CRON_SECRET, read from env or ../../.env.local.
 * Never print the token.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = resolve(here, "artifacts");
mkdirSync(ARTIFACTS, { recursive: true });

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(here, "../../../.env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
      }
    }
  } catch {
    /* env may already be set */
  }
}
loadEnvLocal();

const BASE = process.env.E2E_BASE_URL ?? "https://nexus-v2-five.vercel.app";
const TOKEN = process.env.DEMO_LOGIN_TOKEN ?? process.env.CRON_SECRET ?? "";
if (TOKEN.length < 16) {
  console.error("FAIL: no demo-login token available in env/.env.local");
  process.exit(1);
}

let failures = 0;
function check(cond, label) {
  console.log(`  ${cond ? "✓" : "✗ FAIL"} ${label}`);
  if (!cond) failures++;
}

const browser = await chromium.launch();
try {
  console.log(`Demo-path e2e against ${BASE}\n`);

  // ── 1+2: demo-login → /intelligence ────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  console.log("[1] demo-login → /intelligence");
  await page.goto(
    `${BASE}/api/demo-login?token=${encodeURIComponent(TOKEN)}&next=/intelligence`,
    { waitUntil: "networkidle", timeout: 45_000 },
  );
  check(page.url().endsWith("/intelligence"), `landed on /intelligence (got ${page.url().replace(TOKEN, "…")})`);
  check(
    (await page.locator("h1", { hasText: "Intelligence" }).count()) === 1,
    "h1 'Intelligence' present",
  );

  console.log("[2] briefing content");
  const patternCount = await page.locator("article", { has: page.locator("h2") }).count();
  check(patternCount >= 2, `≥2 pattern notes rendered (got ${patternCount})`);
  const emergingCount = await page
    .locator("section[aria-label='Emerging from the field'] article")
    .count();
  check(emergingCount >= 1, `≥1 emerging candidate rendered (got ${emergingCount})`);
  check(
    (await page.getByText(/held below the\s+evidence threshold/).count()) >= 1,
    "silence-ledger footnote present",
  );
  await page.screenshot({ path: `${ARTIFACTS}/1-intelligence.png`, fullPage: true });

  // ── 3: click-through to deal detail ─────────────────────────────────
  console.log("[3] pattern → deal detail click-through");
  const dealLinkCount = await page.locator("article a[href^='/pipeline/']").count();
  if (dealLinkCount === 0) {
    check(false, "no deal links in pattern notes — click-through untestable");
  } else {
    const firstDealLink = page.locator("article a[href^='/pipeline/']").first();
    const dealHref = await firstDealLink.getAttribute("href");
    await firstDealLink.click();
    await page.waitForURL(`**${dealHref}`, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    check(page.url().includes("/pipeline/"), `deal detail loaded (${dealHref})`);
    const meddpiccVisible = (await page.getByText(/MEDDPICC/i).count()) >= 1;
    check(meddpiccVisible, "MEDDPICC section present on deal detail");
    await page.screenshot({ path: `${ARTIFACTS}/2-deal-detail.png`, fullPage: true });
  }

  // ── 4: portfolio view ───────────────────────────────────────────────
  console.log("[4] /pipeline portfolio");
  await page.goto(`${BASE}/pipeline`, { waitUntil: "networkidle", timeout: 45_000 });
  const northpeak = (await page.getByText("Northpeak Labs").count()) >= 1;
  check(northpeak, "seeded deal visible on /pipeline (Northpeak Labs)");
  await page.screenshot({ path: `${ARTIFACTS}/3-pipeline.png`, fullPage: true });

  check(consoleErrors.length === 0, `no page errors (got ${consoleErrors.length}${consoleErrors.length ? `: ${consoleErrors[0].slice(0, 120)}` : ""})`);
  await ctx.close();

  // ── 5: auth wall holds for anonymous visitors ───────────────────────
  console.log("[5] anonymous → /intelligence redirects to /login");
  const anonCtx = await browser.newContext();
  const anonPage = await anonCtx.newPage();
  await anonPage.goto(`${BASE}/intelligence`, { waitUntil: "networkidle", timeout: 45_000 });
  check(anonPage.url().includes("/login"), `redirected to /login (got ${anonPage.url()})`);
  await anonCtx.close();

  // ── 6: wrong token mints nothing ────────────────────────────────────
  console.log("[6] wrong demo-login token → 404");
  const badCtx = await browser.newContext();
  const badPage = await badCtx.newPage();
  const resp = await badPage.goto(`${BASE}/api/demo-login?token=wrong-token-aaaaaaaa`, {
    timeout: 30_000,
  });
  check(resp?.status() === 404, `404 returned (got ${resp?.status()})`);
  const cookies = await badCtx.cookies();
  check(
    cookies.every((c) => !c.name.includes("auth-token")),
    "no session cookie set on bad token",
  );
  await badCtx.close();
} catch (err) {
  failures++;
  console.error(`  ✗ FAIL unhandled: ${String(err).slice(0, 300)}`);
} finally {
  await browser.close();
}

console.log(
  failures === 0
    ? "\ndemo-path e2e: ALL CHECKS PASS"
    : `\ndemo-path e2e: ${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
