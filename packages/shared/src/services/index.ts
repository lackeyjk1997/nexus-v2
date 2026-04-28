export {
  MeddpiccService,
  type MeddpiccConfidence,
  type MeddpiccEvidence,
  type MeddpiccRecord,
  type MeddpiccScores,
  type MeddpiccServiceOptions,
} from "./meddpicc";

export {
  StakeholderService,
  type StakeholderRoleRow,
  type StakeholderServiceOptions,
} from "./stakeholders";

export {
  ObservationService,
  type ObservationCategory,
  type ObservationRecord,
  type ObservationServiceOptions,
} from "./observations";

export {
  DealIntelligence,
  formatMeddpiccBlock,
  summarizeEventPayload,
  type DealEventContext,
  type DealEventType,
  type DealIntelligenceOptions,
  type DealTheory,
  type DealTheoryUpdatePayload,
  type Experiment,
  type MeddpiccPromptRow,
  type Pattern,
  type RecentEventSummary,
  type RiskFlag,
} from "./deal-intelligence";

export {
  IntelligenceCoordinator,
  type ActivePatternSummary,
  type IntelligenceCoordinatorOptions,
  type ReceivedSignalInput,
  type ReceiveSignalOutcome,
} from "./intelligence-coordinator";

export {
  TranscriptPreprocessor,
  segmentSpeakerTurns,
  type SpeakerTurn,
  type TranscriptEntities,
  type PreprocessResult,
  type TranscriptPreprocessorOptions,
} from "./transcript-preprocessor";

export {
  SurfaceAdmission,
  type AdmissionCandidate,
  type AdmittedInsight,
  type AdmitArgs,
  type AdmitResult,
  type AppliedRejection,
  type InsightKind,
  type ScoreInsightFn,
  type SurfaceAdmissionOptions,
} from "./surface-admission";

export { embedDocuments, type EmbedDocumentsResult } from "../embeddings/voyage";
