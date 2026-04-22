import type { MeddpiccDimension } from "@nexus/shared";

/**
 * Human labels for the 8 MEDDPICC dimensions. Separate from the canonical
 * enum tuple so future copy changes don't touch the schema source.
 */
export const MEDDPICC_LABELS: Record<MeddpiccDimension, string> = {
  metrics: "Metrics",
  economic_buyer: "Economic Buyer",
  decision_criteria: "Decision Criteria",
  decision_process: "Decision Process",
  paper_process: "Paper Process",
  identify_pain: "Identify Pain",
  champion: "Champion",
  competition: "Competition",
};

/**
 * 1-line description per dimension — shown as `<Label>` helper text so reps
 * don't have to remember the framework cold.
 */
export const MEDDPICC_HINTS: Record<MeddpiccDimension, string> = {
  metrics: "Quantified business impact the buyer is chasing.",
  economic_buyer: "Who signs the cheque; access + engagement.",
  decision_criteria: "How they'll choose — technical and business gates.",
  decision_process: "Steps + actors + timeline to a signed contract.",
  paper_process: "Procurement, legal, security review path.",
  identify_pain: "What breaks if they don't buy; urgency of the pain.",
  champion: "Internal advocate; power + access + motivation.",
  competition: "Incumbent, alternatives, and status-quo risk.",
};

export const MEDDPICC_SCORE_MIN = 0;
export const MEDDPICC_SCORE_MAX = 10;
