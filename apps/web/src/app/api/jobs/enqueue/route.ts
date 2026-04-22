import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDb, jobs } from "@nexus/db";
import { JOB_TYPES, type JobType } from "@/lib/jobs/handlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

const ALLOWED = new Set<JobType>(JOB_TYPES);

function isJobType(v: unknown): v is JobType {
  return typeof v === "string" && ALLOWED.has(v as JobType);
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: { type?: unknown; input?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!isJobType(payload.type)) {
    return NextResponse.json(
      { error: `invalid job type; must be one of ${JOB_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL missing" }, { status: 500 });
  }

  const db = createDb(process.env.DATABASE_URL);
  const inserted = await db
    .insert(jobs)
    .values({
      type: payload.type,
      input: (payload.input ?? {}) as never,
      userId: userData.user.id,
      status: "queued",
    })
    .returning({ id: jobs.id });

  return NextResponse.json({ jobId: inserted[0]?.id });
}
