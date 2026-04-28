/**
 * Surfaces registry — Phase 4 Day 1 Session B.
 *
 * Per DECISIONS.md §2.26 (surfacing implementation requirements LOCKED):
 * "A TypeScript module defining every surface (call prep, deal detail,
 * intelligence dashboard, daily digest, etc.) with its admission
 * thresholds, maximum item count, and empty-state UI."
 *
 * Literal port of the rebuild plan's §6 Phase 4 lines 470-494 surfaces
 * registry literal — 4 surfaces total. Discriminated TS types front the
 * threshold-shape union so the admission engine's threshold check can
 * switch on surface kind. Forward-compat: future surfaces extend the
 * union additively without breaking existing code (per DECISIONS.md
 * §2.21 + Guardrail 32 structured-JSONB additive-extension pattern;
 * applies here too — the registry is the multi-surface single-source-
 * of-truth that scales to enterprise multi-rep without schema change).
 *
 * Empty-state component IDs are STRINGS (e.g. `'CallPrepEmptyState'`);
 * the actual UI components are Phase 4 Day 5 / Phase 6 work — registry
 * references symbols by name, not by import. `as const` preserves
 * literal types so consumers get a narrow `SurfaceId` autocomplete.
 *
 * NOT in scope for Session B beyond these 4 surfaces — new surfaces
 * land Phase 4 Day 5 / Phase 5 with their consuming UI.
 *
 * Productization-arc preservation (PRODUCTIZATION-NOTES.md "Surfaces
 * registry + dismissal + feedback tables (audit + explainability
 * primitives)"): the surfaces registry is the authoritative artifact
 * that an admin-tuning UI in Phase 5+ reads to surface "rule X
 * rejected N% of deals" + per-surface threshold calibration.
 */

/**
 * Per-surface kind discriminator. The admission engine routes by this
 * shape (see SurfaceAdmission.admit's surface-kind branch — deal-
 * specific surfaces resolve a DealState + call applies(); portfolio
 * surfaces skip applicability gating entirely because applicability is
 * a deal-context attribute and there's no deal context to gate
 * against).
 */
export type SurfaceKind = "deal_specific" | "portfolio";

/**
 * Threshold shape for `call_prep_brief` — the pre-call rep brief surface
 * that injects the top patterns + risks + experiments for a specific
 * deal. Per-Claude-score floor + stage-restriction.
 */
export interface CallPrepBriefAdmission {
  readonly minScore: number;
  readonly appliesWhenStageIn: readonly string[];
}

/**
 * Threshold shape for `intelligence_dashboard_patterns` — leadership-
 * facing portfolio view of detected coordinator patterns. Pattern-level
 * thresholds (NOT per-deal applicability) — see Decision 3 surface-kind
 * routing.
 */
export interface IntelligenceDashboardAdmission {
  readonly minDealsAffected: number;
  readonly minAggregateArr: number;
}

/**
 * Threshold shape for `daily_digest` — once-per-day rep summary of
 * what changed across their deals. Score floor + freshness window.
 * Job handler lands Phase 5 per rebuild plan §6 Phase 5 deliverable 9;
 * the registry entry lands here so the multi-surface SoT is complete.
 */
export interface DailyDigestAdmission {
  readonly minScore: number;
  readonly maxAgeHours: number;
}

/**
 * Threshold shape for `deal_detail_intelligence` — the patterns/risks/
 * experiments rendered on a specific deal's detail page. Like
 * call_prep_brief but with no stage restriction — the surface is
 * always rendering regardless of stage.
 */
export interface DealDetailIntelligenceAdmission {
  readonly dealSpecific: true;
  readonly minScore: number;
}

/**
 * Threshold shape for `category_candidates` — Phase 4 Day 3 admission
 * surface for new-taxonomy-category candidates per §1.16 LOCKED + §1.1.
 * 3+ deals with uncategorized reasons that cluster by Claude-generated
 * normalized_signature qualify as new-category candidates surfaced for
 * Marcus's promotion review. Portfolio-style (no per-deal applicability)
 * — the cluster is a portfolio-scope artifact across observations from
 * many deals.
 */
export interface CategoryCandidatesAdmission {
  readonly minMemberCount: number;
  readonly minConfidence: "low" | "medium" | "high";
}

/**
 * Per-surface maxItems shape. `call_prep_brief` admits multiple kinds
 * (patterns, risks, experiments) with separate caps per kind; the
 * other surfaces use a single overall cap. Discriminated union keeps
 * each surface's literal cap shape intact.
 */
export interface CallPrepBriefMaxItems {
  readonly patterns: number;
  readonly risks: number;
  readonly experiments: number;
}

/**
 * Per-surface configuration entries. Discriminated by `id` so consumers
 * narrow on surface kind via switch + exhaustiveness.
 */
export interface CallPrepBriefSurface {
  readonly id: "call_prep_brief";
  readonly kind: "deal_specific";
  readonly admission: CallPrepBriefAdmission;
  readonly maxItems: CallPrepBriefMaxItems;
  readonly emptyState: string;
}

export interface IntelligenceDashboardSurface {
  readonly id: "intelligence_dashboard_patterns";
  readonly kind: "portfolio";
  readonly admission: IntelligenceDashboardAdmission;
  readonly maxItems: number;
  readonly emptyState: string;
}

export interface DailyDigestSurface {
  readonly id: "daily_digest";
  readonly kind: "portfolio";
  readonly admission: DailyDigestAdmission;
  readonly maxItems: number;
  readonly emptyState: string;
}

export interface DealDetailIntelligenceSurface {
  readonly id: "deal_detail_intelligence";
  readonly kind: "deal_specific";
  readonly admission: DealDetailIntelligenceAdmission;
  readonly maxItems: number;
  readonly emptyState: string;
}

export interface CategoryCandidatesSurface {
  readonly id: "category_candidates";
  readonly kind: "portfolio";
  readonly admission: CategoryCandidatesAdmission;
  readonly maxItems: number;
  readonly emptyState: string;
}

export type SurfaceConfig =
  | CallPrepBriefSurface
  | IntelligenceDashboardSurface
  | DailyDigestSurface
  | DealDetailIntelligenceSurface
  | CategoryCandidatesSurface;

export type SurfaceId = SurfaceConfig["id"];

/**
 * Authoritative surfaces registry — literal port of rebuild plan §6
 * Phase 4 lines 470-494. `as const` narrows literal types so
 * `SURFACES.call_prep_brief.admission.minScore` reads as `70` not
 * `number`, and `SurfaceId` autocompletes to the 4 keys.
 *
 * Surface-kind routing (per Phase 4 Day 1 Session B kickoff Decision 3):
 *  - deal_specific surfaces (call_prep_brief, deal_detail_intelligence):
 *    admission engine resolves DealState + calls applies() per
 *    candidate; rejections write to applicability_rejections.
 *  - portfolio surfaces (intelligence_dashboard_patterns,
 *    daily_digest): admission engine skips applies() entirely (no
 *    DealState; applicability is a deal-context attribute that has no
 *    meaning without a deal). Filtering is pattern-level thresholds
 *    only.
 *
 * Threshold non-matches are silent per §1.18 (NOT applicability
 * rejections — different metadata shape, locked per Decision 7g; if
 * Phase 5+ admin-tuning UI needs threshold-fail diagnostics, that's a
 * NEW surface — `admission_threshold_evaluations` table or generic
 * audit log — NOT a retrofit on `applicability_rejections`).
 */
export const SURFACES = {
  call_prep_brief: {
    id: "call_prep_brief",
    kind: "deal_specific",
    admission: {
      minScore: 70,
      appliesWhenStageIn: [
        "discovery",
        "technical_validation",
        "proposal",
        "negotiation",
      ],
    },
    maxItems: { patterns: 3, risks: 5, experiments: 2 },
    emptyState: "CallPrepEmptyState",
  },
  intelligence_dashboard_patterns: {
    id: "intelligence_dashboard_patterns",
    kind: "portfolio",
    admission: { minDealsAffected: 2, minAggregateArr: 500_000 },
    maxItems: 20,
    emptyState: "PatternsEmptyState",
  },
  daily_digest: {
    id: "daily_digest",
    kind: "portfolio",
    admission: { minScore: 75, maxAgeHours: 24 },
    maxItems: 5,
    emptyState: "DigestNothingNewState",
  },
  deal_detail_intelligence: {
    id: "deal_detail_intelligence",
    kind: "deal_specific",
    admission: { dealSpecific: true, minScore: 60 },
    maxItems: 10,
    emptyState: "DealDetailEmptyState",
  },
  category_candidates: {
    id: "category_candidates",
    kind: "portfolio",
    admission: { minMemberCount: 3, minConfidence: "medium" },
    maxItems: 10,
    emptyState: "CategoryCandidatesEmptyState",
  },
} as const satisfies Record<string, SurfaceConfig>;

/**
 * Type-narrow lookup. Throws on unknown ID rather than returning
 * undefined — admission engine should never see an unknown ID at
 * runtime (callers pass literal `SurfaceId`).
 */
export function getSurface(id: SurfaceId): SurfaceConfig {
  const surface = (SURFACES as Record<string, SurfaceConfig>)[id];
  if (!surface) {
    throw new Error(`Unknown surfaceId: ${id}`);
  }
  return surface;
}

/**
 * Total surface count — type-level + value-level. Useful for the
 * registry sanity test (test:surfaces-registry asserts the keys count
 * matches the union arity).
 */
export const SURFACE_IDS = [
  "call_prep_brief",
  "intelligence_dashboard_patterns",
  "daily_digest",
  "deal_detail_intelligence",
  "category_candidates",
] as const satisfies readonly SurfaceId[];
