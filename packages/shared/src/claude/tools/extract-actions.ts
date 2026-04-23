/**
 * Tool-use schema for prompt #19 (pipeline-extract-actions, PORT-WITH-CLEANUPS).
 * Tool name matches the prompt body verbatim: `record_extracted_actions`.
 *
 * Port discipline per §2.13.1 + 04C Principle 6:
 * - `reasoning_trace` is the first required property (oversight-adjudicated
 *   INCLUDE for #19 per Phase 3 Day 3 Session A kickoff — extraction-with-
 *   attribution is classification-adjacent).
 * - `action_type` + `owner_side` enums are literal tuples (no cross-file
 *   single-source enum yet; action taxonomy lives in this file until a
 *   downstream consumer demands promotion).
 * - No transcript truncation at the prompt layer (Principle 13 — truncation
 *   is TranscriptPreprocessor's job).
 */

export const extractActionsTool = {
  name: "record_extracted_actions",
  description:
    "Record the action items, commitments, next steps, deliverables, decisions, blockers, and questions extracted from this transcript.",
  input_schema: {
    type: "object" as const,
    properties: {
      reasoning_trace: {
        type: "string" as const,
        description:
          "2-4 sentences: which candidate actions you considered, which you admitted into the final set, and why. Populated BEFORE the actions array. Required even when actions array is empty — explain the empty-output case.",
      },
      actions: {
        type: "array" as const,
        maxItems: 20,
        items: {
          type: "object" as const,
          properties: {
            action_type: {
              type: "string" as const,
              enum: [
                "commitment",
                "next_step",
                "deliverable",
                "decision",
                "blocker",
                "question",
              ] as const,
            },
            owner_side: {
              type: "string" as const,
              enum: ["buyer", "seller"] as const,
              description:
                "'seller' for the rep's team (listed in KNOWN SELLER-SIDE PARTICIPANTS); 'buyer' for everyone else who spoke.",
            },
            owner_name: {
              type: "string" as const,
              description:
                "Name of the person who will do the action, exactly as listed in KNOWN contacts/participants, or 'unassigned' if the transcript does not name an owner.",
            },
            description: {
              type: "string" as const,
              description: "One-sentence description of the action in the rep's voice.",
            },
            evidence_quote: {
              type: "string" as const,
              description:
                "Verbatim quote from the transcript supporting this action, OR a close paraphrase explicitly marked '(paraphrase)'.",
            },
            due_date: {
              type: ["string", "null"] as const,
              description:
                "Deadline if the speaker stated one explicitly (ISO date preferred; free-text 'by Friday' also acceptable). Null if no explicit deadline.",
            },
          },
          required: [
            "action_type",
            "owner_side",
            "owner_name",
            "description",
            "evidence_quote",
          ],
        },
      },
    },
    required: ["reasoning_trace", "actions"],
  },
} as const;

export type ActionType =
  | "commitment"
  | "next_step"
  | "deliverable"
  | "decision"
  | "blocker"
  | "question";

export type ActionOwnerSide = "buyer" | "seller";

export interface ExtractedAction {
  action_type: ActionType;
  owner_side: ActionOwnerSide;
  owner_name: string;
  description: string;
  evidence_quote: string;
  due_date?: string | null;
}

export interface ExtractActionsOutput {
  /**
   * 2-4 sentences of extraction reasoning that precedes the actions array.
   * Required per §2.13.1 kickoff Decision 1 (INCLUDE) — extraction-with-
   * attribution is classification-adjacent and benefits from reasoning-first
   * grounding. Populated even when `actions` is empty.
   */
  reasoning_trace: string;
  actions: ExtractedAction[];
}
