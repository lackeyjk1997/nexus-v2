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
  type MeddpiccPromptRow,
  type RecentEventSummary,
} from "./deal-intelligence";

export {
  IntelligenceCoordinator,
  type ActivePatternSummary,
  type IntelligenceCoordinatorOptions,
  type ReceivedSignalInput,
} from "./intelligence-coordinator";

export {
  TranscriptPreprocessor,
  segmentSpeakerTurns,
  type SpeakerTurn,
  type TranscriptEntities,
  type PreprocessResult,
  type TranscriptPreprocessorOptions,
} from "./transcript-preprocessor";

export { embedDocuments, type EmbedDocumentsResult } from "../embeddings/voyage";
