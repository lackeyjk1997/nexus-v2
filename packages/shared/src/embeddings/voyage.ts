/**
 * Voyage AI embedding client — Phase 3 Day 2 Session A.
 *
 * DECISIONS.md §2.16.1 Decision 1 locks `vector(1536)` + voyage-large-2
 * as the default embedding model for the `transcript_embeddings` corpus-
 * intelligence surface. This module is the single client the pipeline
 * uses for document embeddings.
 *
 * Why raw fetch, not the `voyageai` npm SDK:
 *   - One fewer dependency in @nexus/shared.
 *   - The SDK is thin over the same HTTP shape.
 *   - Adapter-style injection (provider swap) is easier when the call site
 *     is a plain function.
 *
 * Forward-compat: §2.16.1 names OpenAI `text-embedding-3-small` (1536 dim
 * exact match) as the documented fallback. This project has never been
 * built on OpenAI — locked on Voyage per oversight guidance. If a future
 * migration needs it, add a sibling `packages/shared/src/embeddings/
 * openai.ts` and a dispatcher; do NOT inline fallback logic here.
 *
 * Data-retention posture: Voyage account is configured with a payment
 * method (Tier 1 rate limits). Data-retention opt-out is deliberately
 * NOT enabled during the build phase — today's traffic is seeded fixture
 * data (MedVista) only. Pre-production checklist item tracked in
 * BUILD-LOG parked items: opt-out must land before any real-customer
 * data flows through this client.
 */
import { requireEnv } from "../env";

const VOYAGE_ENDPOINT = "https://api.voyageai.com/v1/embeddings";
const DEFAULT_MODEL = "voyage-large-2";

export interface EmbedDocumentsResult {
  /** One embedding vector per input, same order as input. */
  embeddings: number[][];
  /** Model name the provider reports — stored per-row for traceability. */
  model: string;
  /** Token count reported by Voyage for billing/telemetry. */
  totalTokens: number;
}

interface VoyageResponseBody {
  object?: string;
  data?: Array<{ object?: string; embedding: number[]; index: number }>;
  model?: string;
  usage?: { total_tokens?: number };
  error?: { message?: string; type?: string };
}

/**
 * Embed one or more document-scope texts via voyage-large-2.
 *
 * Input: array of strings. Each string is a single chunk to embed
 * (transcript, speaker turn, etc.). Voyage imposes per-call token limits
 * (~32K tokens total); the preprocessor batches appropriately.
 *
 * Input-type "document" per Voyage docs — distinct from "query" for RAG
 * scenarios. All pipeline-time embeddings are document-scope; query-scope
 * lands later if a semantic-search surface ships.
 *
 * Throws on any non-2xx response, with the status code + body text in
 * the error message. Matches DECISIONS.md 2.24 (no graceful degradation
 * that fakes success).
 */
export async function embedDocuments(
  texts: string[],
): Promise<EmbedDocumentsResult> {
  if (texts.length === 0) {
    throw new Error("embedDocuments called with empty input array");
  }

  const apiKey = requireEnv("VOYAGE_API_KEY");

  const response = await fetch(VOYAGE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: texts,
      model: DEFAULT_MODEL,
      input_type: "document",
    }),
  });

  const bodyText = await response.text();
  let body: VoyageResponseBody;
  try {
    body = JSON.parse(bodyText) as VoyageResponseBody;
  } catch {
    throw new Error(
      `Voyage embedding call returned non-JSON (status=${response.status}): ${bodyText.slice(0, 500)}`,
    );
  }

  if (!response.ok) {
    const msg = body.error?.message ?? bodyText.slice(0, 500);
    throw new Error(`Voyage embedding call failed (status=${response.status}): ${msg}`);
  }

  if (!body.data || !Array.isArray(body.data) || body.data.length !== texts.length) {
    throw new Error(
      `Voyage response missing or mismatched data array (got ${body.data?.length ?? "none"}, expected ${texts.length})`,
    );
  }

  // Preserve input order — sort by index defensively in case the API
  // returns out-of-order.
  const ordered = [...body.data].sort((a, b) => a.index - b.index);

  return {
    embeddings: ordered.map((d) => d.embedding),
    model: body.model ?? DEFAULT_MODEL,
    totalTokens: body.usage?.total_tokens ?? 0,
  };
}
