/**
 * TranscriptPreprocessor service — Phase 3 Day 2 Session A.
 *
 * Produces the canonical `analyzed_transcripts` row for a given
 * `transcripts.id` and writes per-transcript + per-speaker-turn rows
 * into `transcript_embeddings`. Consumed by Session B's
 * `transcript_pipeline` job handler (step 2: preprocess).
 *
 * §2.16.1 Decision 4 (speaker-turn preservation) — this service is the
 * writer that preserves turn-level granularity in
 * `analyzed_transcripts.speaker_turns`. Downstream surfaces read via the
 * jsonb column; summarization-only reduction is forbidden.
 *
 * §2.16.1 Decision 1 (embedding shape) — emits N+1 rows into
 * `transcript_embeddings`:
 *   - 1 row with scope='transcript' (whole-transcript embedding)
 *   - N rows with scope='speaker_turn' + speaker_turn_index = i
 * Per-row `embedding_model` populated from the Voyage response so a
 * future provider migration is row-traceable.
 *
 * Service template — follows MeddpiccService / StakeholderService /
 * ObservationService shape: postgres.js direct (no Drizzle), {databaseUrl,
 * sql?} injection so request-scoped factories in apps/web/src/lib/ pass
 * `getSharedSql()` and the service becomes a pool-sharing consumer.
 * `close()` is a no-op when sql was injected (shared pool stays alive).
 *
 * Idempotence — re-runs are safe:
 *   - `analyzed_transcripts` upserts on `transcript_id` PK.
 *   - `transcript_embeddings` has no natural unique key today; the
 *     service DELETEs existing rows for the transcript and re-INSERTs
 *     inside a single transaction. Alternative (composite unique) is a
 *     schema change; deferred.
 *
 * Voyage provider — raw fetch via `packages/shared/src/embeddings/voyage.ts`.
 * Data-retention opt-out deferred to pre-production (BUILD-LOG parked).
 */
import postgres from "postgres";

import { embedDocuments } from "../embeddings/voyage";

export interface SpeakerTurn {
  turnIndex: number;
  speaker: string;
  text: string;
  startChar: number;
  endChar: number;
}

export interface TranscriptEntities {
  competitors: string[];
  companies: string[];
  people: string[];
}

export interface PreprocessResult {
  transcriptId: string;
  speakerTurnCount: number;
  wordCount: number;
  competitorsMentioned: string[];
  embeddingModel: string;
  embeddingsWritten: number;
  embeddingTokensUsed: number;
}

export interface TranscriptPreprocessorOptions {
  databaseUrl: string;
  sql?: postgres.Sql;
}

type TranscriptRow = {
  id: string;
  hubspot_deal_id: string;
  title: string;
  transcript_text: string;
  participants: Array<{
    name: string;
    role?: string;
    side?: "buyer" | "seller";
    org?: string;
  }>;
};

/**
 * Competitor vocabulary — seeded with vendors the MedVista fixture names
 * (Microsoft, DAX, Nuance, Dragon, PowerScribe) plus the common enterprise
 * AI/sales-tooling competitive set. Case-insensitive substring matches.
 *
 * Day-2 MVP posture — vocabulary-list extraction. Richer NER (named-entity
 * recognition via a model or spaCy-port) is a Phase 4+ productization
 * concern per PRODUCTIZATION-NOTES corpus-intelligence arc.
 */
const COMPETITOR_VOCABULARY = [
  "Microsoft DAX Copilot",
  "Microsoft DAX",
  "DAX Copilot",
  "Microsoft Copilot",
  "Microsoft",
  "Nuance",
  "Dragon Medical",
  "Dragon",
  "PowerScribe",
  "Epic",
  "Cerner",
  "Google",
  "Amazon",
  "OpenAI",
  "Oracle",
  "Salesforce",
  "Gong",
  "Chorus",
  "Fireflies",
] as const;

const SPEAKER_LINE_RE = /^([A-Z][A-Z .]+?):\s+(.*)$/;

export class TranscriptPreprocessor {
  private readonly sql: postgres.Sql;
  private readonly ownedSql: boolean;

  constructor(options: TranscriptPreprocessorOptions) {
    this.sql =
      options.sql ??
      postgres(options.databaseUrl, {
        max: 1,
        idle_timeout: 30,
        prepare: false,
      });
    this.ownedSql = !options.sql;
  }

  /**
   * Preprocess a transcript end-to-end:
   *   1. Read the `transcripts` row.
   *   2. Segment speaker turns via line-prefix regex.
   *   3. Extract entities (competitor-vocabulary match + participant list).
   *   4. Call Voyage to embed the whole transcript + each turn.
   *   5. Upsert `analyzed_transcripts` + replace `transcript_embeddings` rows.
   *   6. Flip `transcripts.pipeline_processed = true`.
   *
   * Throws on any step failure (DECISIONS.md 2.24 — no graceful degradation).
   */
  async preprocess(transcriptId: string): Promise<PreprocessResult> {
    // 1. Read transcript.
    const rows = await this.sql<TranscriptRow[]>`
      SELECT id, hubspot_deal_id, title, transcript_text, participants
        FROM transcripts
       WHERE id = ${transcriptId}
       LIMIT 1
    `;
    if (rows.length === 0) {
      throw new Error(`TranscriptPreprocessor: transcript not found id=${transcriptId}`);
    }
    const transcript = rows[0]!;
    if (!transcript.transcript_text || transcript.transcript_text.length === 0) {
      throw new Error(`TranscriptPreprocessor: empty transcript_text id=${transcriptId}`);
    }

    // 2. Segment.
    const turns = segmentSpeakerTurns(transcript.transcript_text);
    if (turns.length === 0) {
      throw new Error(
        `TranscriptPreprocessor: zero speaker turns extracted (id=${transcriptId}, text=${transcript.transcript_text.length} chars)`,
      );
    }

    // 3. Entities.
    const competitors = extractCompetitors(transcript.transcript_text);
    const companies = uniqStrings(
      (transcript.participants ?? []).map((p) => p.org).filter(isTruthyString),
    );
    const people = uniqStrings(
      (transcript.participants ?? []).map((p) => p.name).filter(isTruthyString),
    );
    const entities: TranscriptEntities = { competitors, companies, people };
    const wordCount = countWords(transcript.transcript_text);

    // 4. Embeddings. N+1 texts: whole transcript + each turn.
    const embedInputs = [
      transcript.transcript_text,
      ...turns.map((t) => `${t.speaker}: ${t.text}`),
    ];
    const embedResult = await embedDocuments(embedInputs);
    if (embedResult.embeddings.length !== embedInputs.length) {
      throw new Error(
        `Voyage returned ${embedResult.embeddings.length} embeddings; expected ${embedInputs.length}`,
      );
    }

    // 5 + 6. Persist inside a transaction.
    await this.sql.begin(async (tx) => {
      // Upsert analyzed_transcripts. Use `tx.json()` for jsonb columns —
      // matches MeddpiccService / ObservationService precedent. The
      // double cast `as unknown as postgres.JSONValue` satisfies
      // postgres.js's strict JSONValue type (which rejects concrete
      // object shapes like SpeakerTurn[]); the values are plain-data
      // safe at runtime.
      await tx`
        INSERT INTO analyzed_transcripts (
          transcript_id, speaker_turns, entities, competitors_mentioned,
          topics, sentiment, word_count
        ) VALUES (
          ${transcriptId},
          ${tx.json(turns as unknown as postgres.JSONValue)},
          ${tx.json(entities as unknown as postgres.JSONValue)},
          ${competitors},
          ${tx.json([] as unknown as postgres.JSONValue)},
          ${tx.json({} as unknown as postgres.JSONValue)},
          ${wordCount}
        )
        ON CONFLICT (transcript_id) DO UPDATE SET
          speaker_turns = EXCLUDED.speaker_turns,
          entities = EXCLUDED.entities,
          competitors_mentioned = EXCLUDED.competitors_mentioned,
          word_count = EXCLUDED.word_count,
          analyzed_at = NOW()
      `;

      // Replace transcript_embeddings — delete then re-insert.
      await tx`DELETE FROM transcript_embeddings WHERE transcript_id = ${transcriptId}`;

      // Whole-transcript embedding (scope='transcript').
      const wholeVec = vectorLiteral(embedResult.embeddings[0]!);
      await tx`
        INSERT INTO transcript_embeddings (
          transcript_id, scope, speaker_turn_index, embedding, embedding_model
        ) VALUES (
          ${transcriptId},
          'transcript',
          NULL,
          ${wholeVec}::vector,
          ${embedResult.model}
        )
      `;

      // Per-turn embeddings (scope='speaker_turn').
      for (let i = 0; i < turns.length; i++) {
        const vec = vectorLiteral(embedResult.embeddings[i + 1]!);
        await tx`
          INSERT INTO transcript_embeddings (
            transcript_id, scope, speaker_turn_index, embedding, embedding_model
          ) VALUES (
            ${transcriptId},
            'speaker_turn',
            ${i},
            ${vec}::vector,
            ${embedResult.model}
          )
        `;
      }

      // Flip pipeline_processed so downstream consumers can skip
      // un-preprocessed rows. The transcript_pipeline handler (Session B)
      // may flip it earlier/later depending on step boundaries.
      await tx`
        UPDATE transcripts
           SET pipeline_processed = true, updated_at = NOW()
         WHERE id = ${transcriptId}
      `;
    });

    return {
      transcriptId,
      speakerTurnCount: turns.length,
      wordCount,
      competitorsMentioned: competitors,
      embeddingModel: embedResult.model,
      embeddingsWritten: embedInputs.length,
      embeddingTokensUsed: embedResult.totalTokens,
    };
  }

  async close(): Promise<void> {
    if (this.ownedSql) {
      await this.sql.end({ timeout: 5 });
    }
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function isTruthyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function uniqStrings(arr: string[]): string[] {
  return [...new Set(arr)];
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Segment a transcript text into speaker turns.
 *
 * Format assumption: each turn starts with an ALL-CAPS speaker prefix
 * followed by `:` followed by whitespace and the turn text, e.g.
 *   `SARAH CHEN: Thanks for making time this morning…`
 *   `DR. MICHAEL CHEN: Sure. The short version is…`
 * Continuation lines (no speaker prefix) belong to the previous turn.
 * Metadata lines in `[...]` brackets are skipped.
 *
 * Verified against `packages/shared/tests/fixtures/medvista-transcript.txt`
 * at Session A kickoff (Phase 3 Day 2 preflight gate).
 */
export function segmentSpeakerTurns(text: string): SpeakerTurn[] {
  const lines = text.split(/\r?\n/);
  const turns: SpeakerTurn[] = [];
  let current: {
    speaker: string;
    parts: string[];
    startChar: number;
  } | null = null;
  let charPos = 0;

  const flush = (endChar: number) => {
    if (!current) return;
    const turnText = current.parts.join(" ").trim();
    if (turnText.length > 0) {
      turns.push({
        turnIndex: turns.length,
        speaker: current.speaker,
        text: turnText,
        startChar: current.startChar,
        endChar,
      });
    }
    current = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const match = SPEAKER_LINE_RE.exec(line);
    if (match) {
      flush(charPos > 0 ? charPos - 1 : 0);
      current = {
        speaker: match[1]!.trim(),
        parts: match[2]!.length > 0 ? [match[2]!] : [],
        startChar: charPos,
      };
    } else if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      // metadata line — skip without disturbing current turn
    } else if (trimmed.length > 0 && current) {
      current.parts.push(trimmed);
    }
    charPos += line.length + 1; // +1 for \n
  }
  flush(charPos > 0 ? charPos - 1 : 0);

  return turns;
}

function extractCompetitors(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const vocab of COMPETITOR_VOCABULARY) {
    // Case-insensitive substring match. Skip shorter aliases when a longer
    // form is already captured (e.g., don't emit "Microsoft" alone when
    // "Microsoft DAX Copilot" is already in the list).
    if (lower.includes(vocab.toLowerCase())) {
      const alreadyCovered = found.some(
        (f) =>
          f.toLowerCase().includes(vocab.toLowerCase()) &&
          f.toLowerCase() !== vocab.toLowerCase(),
      );
      if (!alreadyCovered) {
        found.push(vocab);
      }
    }
  }
  return found;
}

/**
 * Convert a number[] vector to the Postgres `vector(1536)` textual
 * literal form: `[0.123,0.456,...]`. postgres.js + pgvector accept this
 * when cast with `::vector`.
 */
function vectorLiteral(vec: number[]): string {
  return "[" + vec.join(",") + "]";
}
