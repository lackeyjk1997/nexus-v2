/**
 * Granola public REST API client (demo 2026-06-10 Run 2).
 *
 * Base: https://public-api.granola.ai/v1 — Bearer auth with a `grn_`-prefixed
 * key from GRANOLA_API_KEY. Business-tier-or-higher feature; reachability is
 * verified from production via /api/granola/watch?selfcheck=1 before the
 * demo (the key lives in Vercel env, not necessarily locally).
 *
 * API contract (docs.granola.ai, verified 2026-06-09):
 *   GET /notes?created_after=<ISO>&cursor=<c>   → { notes: [...], hasMore, cursor }
 *   GET /notes/{note_id}?include=transcript     → note object incl. transcript[]
 *   - Note ids match /not_[a-zA-Z0-9]{14}/.
 *   - Notes 404 until Granola finishes AI summary + transcript processing —
 *     callers must treat 404 as RETRYABLE (the job retry path covers it).
 *   - transcript[] entries: { speaker: { source: "microphone" | "speaker",
 *     diarization_label? }, text }. Channel mapping for the demo:
 *     microphone = seller side (Jeff), speaker = buyer side (Ernesto).
 *   - Rate limits: 25 req / 5s burst, 5 req/s sustained.
 *
 * SECURITY: the key can read private notes. This client takes explicit note
 * ids only — there is deliberately NO "list everything" convenience beyond
 * the cursor-paged listNotes used by the production self-check (count-only).
 * The key is never logged; errors carry status codes, not headers.
 */

const GRANOLA_BASE = "https://public-api.granola.ai/v1";

export interface GranolaTranscriptEntry {
  speaker?: {
    source?: string;
    diarization_label?: string | null;
  } | null;
  /** Some payload variants flatten the channel onto the entry. */
  source?: string;
  text?: string;
}

export interface GranolaNote {
  id: string;
  title?: string | null;
  /** AI summary — field name observed as `summary`; tolerate `summary_markdown`. */
  summary?: string | null;
  summary_markdown?: string | null;
  owner?: { name?: string | null; email?: string | null } | null;
  created_at?: string | null;
  attendees?: Array<{ name?: string | null; email?: string | null }> | null;
  transcript?: GranolaTranscriptEntry[] | null;
  [key: string]: unknown;
}

export class GranolaApiError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GranolaApiError";
    this.status = status;
    // 404 = note still processing (per API contract); 429/5xx transient.
    this.retryable = status === 404 || status === 429 || status >= 500;
  }
}

export class GranolaClient {
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.GRANOLA_API_KEY ?? "";
    if (!key) {
      throw new Error("GRANOLA_API_KEY is not set (env var only; never committed)");
    }
    this.apiKey = key;
  }

  static isConfigured(): boolean {
    return Boolean(process.env.GRANOLA_API_KEY);
  }

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${GRANOLA_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      // Body may carry diagnostic info but never echo it wholesale (could
      // contain note content on partial errors) — status + statusText only.
      throw new GranolaApiError(
        res.status,
        `Granola API ${res.status} ${res.statusText} on ${path.split("?")[0]}`,
      );
    }
    return (await res.json()) as T;
  }

  /** Get a note; pass includeTranscript to fetch the raw transcript array. */
  async getNote(
    noteId: string,
    opts?: { includeTranscript?: boolean },
  ): Promise<GranolaNote> {
    const include = opts?.includeTranscript ? "?include=transcript" : "";
    return this.request<GranolaNote>(`/notes/${encodeURIComponent(noteId)}${include}`);
  }

  /**
   * Reachability/tier self-check — one page of notes metadata, returns only
   * the COUNT (no titles/content leave this method). Used by the production
   * watch route's ?selfcheck=1.
   */
  async healthCheck(): Promise<{ ok: boolean; status: number; noteCount: number }> {
    try {
      const body = await this.request<{ notes?: unknown[] }>("/notes");
      return { ok: true, status: 200, noteCount: body.notes?.length ?? 0 };
    } catch (err) {
      if (err instanceof GranolaApiError) {
        return { ok: false, status: err.status, noteCount: 0 };
      }
      throw err;
    }
  }
}

/** Extract a Granola note id (not_xxxxxxxxxxxxxx) from arbitrary text (e.g. a HubSpot note body). */
export function extractGranolaNoteId(text: string): string | null {
  const m = /not_[a-zA-Z0-9]{14,}/.exec(text);
  return m ? m[0] : null;
}

/**
 * Render a Granola channel-level transcript to the canonical transcript_text
 * shape the pipeline + fitness prompts consume: one paragraph per turn,
 * "Name (side): text". Channel mapping per the demo contract:
 * microphone = seller, speaker = buyer.
 */
export function renderGranolaTranscript(
  entries: GranolaTranscriptEntry[],
  names: { sellerName: string; buyerName: string },
): string {
  const lines: string[] = [];
  for (const e of entries) {
    const text = (e.text ?? "").trim();
    if (!text) continue;
    const source = e.speaker?.source ?? e.source ?? "speaker";
    const isSeller = source === "microphone";
    const name = isSeller ? names.sellerName : names.buyerName;
    const side = isSeller ? "seller" : "buyer";
    lines.push(`${name} (${side}): ${text}`);
  }
  return lines.join("\n\n");
}
