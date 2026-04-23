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
  type DealEventContext,
  type DealIntelligenceOptions,
  type MeddpiccPromptRow,
} from "./deal-intelligence";

export {
  TranscriptPreprocessor,
  segmentSpeakerTurns,
  type SpeakerTurn,
  type TranscriptEntities,
  type PreprocessResult,
  type TranscriptPreprocessorOptions,
} from "./transcript-preprocessor";

export { embedDocuments, type EmbedDocumentsResult } from "../embeddings/voyage";
