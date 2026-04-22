/**
 * Seed 14 demo users = 11 team_members + 3 support_function_members.
 *
 * For each persona:
 *  1. Create an auth.users row via the Supabase Admin API (email_confirm=true).
 *  2. Upsert a public.users row with the same UUID.
 *  3. Upsert a team_members or support_function_members row linked to the user.
 *
 * Idempotent by email. Safe to re-run.
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { sql as rawSql } from "drizzle-orm";
import { createDb, users, teamMembers, supportFunctionMembers } from "../index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../../../../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const directUrl = process.env.DIRECT_URL ?? "";
if (!supabaseUrl || !serviceRoleKey || !directUrl) {
  throw new Error("Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DIRECT_URL.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const db = createDb(directUrl);

type Vertical =
  | "healthcare"
  | "financial_services"
  | "technology"
  | "retail"
  | "manufacturing"
  | "general";

type TeamPersona = {
  kind: "team";
  name: string;
  email: string;
  role: "AE" | "BDR" | "SA" | "CSM" | "MANAGER";
  vertical: Vertical;
  capacity: number;
};

type SupportPersona = {
  kind: "support";
  name: string;
  email: string;
  role: string;
  function: "enablement" | "product_marketing" | "deal_desk" | "customer_success";
  verticals: Vertical[];
  avatarInitials: string;
  avatarColor: string;
};

const PERSONAS: (TeamPersona | SupportPersona)[] = [
  // ── team_members (11) ──
  { kind: "team", name: "Sarah Chen", email: "sarah.chen@nexus-demo.com", role: "AE", vertical: "healthcare", capacity: 12 },
  { kind: "team", name: "David Park", email: "david.park@nexus-demo.com", role: "AE", vertical: "financial_services", capacity: 11 },
  { kind: "team", name: "Ryan Foster", email: "ryan.foster@nexus-demo.com", role: "AE", vertical: "healthcare", capacity: 12 },
  { kind: "team", name: "James Wilson", email: "james.wilson@nexus-demo.com", role: "AE", vertical: "manufacturing", capacity: 10 },
  { kind: "team", name: "Elena Rodriguez", email: "elena.rodriguez@nexus-demo.com", role: "AE", vertical: "retail", capacity: 10 },
  { kind: "team", name: "Marcus Thompson", email: "marcus.thompson@nexus-demo.com", role: "MANAGER", vertical: "general", capacity: 0 },
  { kind: "team", name: "Alex Kim", email: "alex.kim@nexus-demo.com", role: "SA", vertical: "healthcare", capacity: 8 },
  { kind: "team", name: "Maya Johnson", email: "maya.johnson@nexus-demo.com", role: "SA", vertical: "technology", capacity: 8 },
  { kind: "team", name: "Jordan Lee", email: "jordan.lee@nexus-demo.com", role: "BDR", vertical: "healthcare", capacity: 25 },
  { kind: "team", name: "Nina Patel", email: "nina.patel@nexus-demo.com", role: "CSM", vertical: "healthcare", capacity: 15 },
  { kind: "team", name: "Chris Okafor", email: "chris.okafor@nexus-demo.com", role: "CSM", vertical: "technology", capacity: 15 },
  // ── support_function_members (3) ──
  { kind: "support", name: "Lisa Park", email: "lisa.park@nexus-demo.com", role: "Enablement Lead", function: "enablement", verticals: [], avatarInitials: "LP", avatarColor: "#7C3AED" },
  { kind: "support", name: "Michael Torres", email: "michael.torres@nexus-demo.com", role: "Product Marketing Manager", function: "product_marketing", verticals: [], avatarInitials: "MT", avatarColor: "#2563EB" },
  { kind: "support", name: "Rachel Kim", email: "rachel.kim@nexus-demo.com", role: "Deal Desk Lead", function: "deal_desk", verticals: [], avatarInitials: "RK", avatarColor: "#D97706" },
];

async function ensureAuthUser(email: string, displayName: string): Promise<string> {
  // 1. Does an auth user with this email already exist?
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing.id;

  // 2. Create, auto-confirm email so magic-link works on first try.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  return data.user.id;
}

async function main() {
  console.log(`Seeding ${PERSONAS.length} demo users into Supabase Auth + public tables…`);

  for (const persona of PERSONAS) {
    const authId = await ensureAuthUser(persona.email, persona.name);

    await db
      .insert(users)
      .values({
        id: authId,
        email: persona.email,
        displayName: persona.name,
        isAdmin: false,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: { email: persona.email, displayName: persona.name, updatedAt: new Date() },
      });

    if (persona.kind === "team") {
      await db
        .insert(teamMembers)
        .values({
          userId: authId,
          name: persona.name,
          email: persona.email,
          role: persona.role,
          verticalSpecialization: persona.vertical,
          capacityTarget: persona.capacity,
        })
        .onConflictDoUpdate({
          target: teamMembers.userId,
          set: {
            name: persona.name,
            email: persona.email,
            role: persona.role,
            verticalSpecialization: persona.vertical,
            capacityTarget: persona.capacity,
            updatedAt: new Date(),
          },
        });
    } else {
      await db
        .insert(supportFunctionMembers)
        .values({
          userId: authId,
          name: persona.name,
          email: persona.email,
          role: persona.role,
          function: persona.function,
          verticalsCovered: persona.verticals,
          avatarInitials: persona.avatarInitials,
          avatarColor: persona.avatarColor,
        })
        .onConflictDoUpdate({
          target: supportFunctionMembers.userId,
          set: {
            name: persona.name,
            email: persona.email,
            role: persona.role,
            function: persona.function,
            verticalsCovered: persona.verticals,
            avatarInitials: persona.avatarInitials,
            avatarColor: persona.avatarColor,
            updatedAt: new Date(),
          },
        });
    }

    console.log(`  ✓ ${persona.name} (${persona.email})`);
  }

  const userRows = await db.execute<{ count: number }>(
    rawSql`SELECT count(*)::int AS count FROM public.users`,
  );
  const teamRows = await db.execute<{ count: number }>(
    rawSql`SELECT count(*)::int AS count FROM public.team_members`,
  );
  const supportRows = await db.execute<{ count: number }>(
    rawSql`SELECT count(*)::int AS count FROM public.support_function_members`,
  );
  const userCount = userRows[0]?.count ?? 0;
  const teamCount = teamRows[0]?.count ?? 0;
  const supportCount = supportRows[0]?.count ?? 0;

  console.log("");
  console.log(`users=${userCount}  team_members=${teamCount}  support_function_members=${supportCount}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
