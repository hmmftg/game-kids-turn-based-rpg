import type { IconId, NpcId, QuestId } from '../domain/game/types.ts';

/**
 * Content and provenance types.
 *
 * Review status drives the release gate: production-reachable content must be
 * `approved`. Everything currently in the repository is `draft`, and draft
 * records are forbidden from carrying quotation text (see `validation.ts`).
 */
export const REVIEW_STATUSES = ['draft', 'religious-review', 'child-review', 'approved'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface ReviewMetadata {
  readonly status: ReviewStatus;
  /** Named Shia scholar who verified interpretation, authenticity and translation. */
  readonly scholarReviewer: string;
  /** Named child-development / editorial reviewer. */
  readonly childEditorReviewer: string;
  readonly persianProofreader: string;
  /** ISO date or empty while unreviewed. */
  readonly reviewedAt: string;
  readonly revisionNotes: string;
}

export interface Citation {
  readonly workTitle: string;
  readonly author: string;
  readonly edition: string;
  readonly publisher: string;
  readonly volume: string;
  readonly page: string;
  readonly chapter: string;
  readonly hadithNumber: string;
  readonly sourceUrl: string;
}

export interface RightsMetadata {
  /** Whether the permissioned edition allows reproducing the quotation in-app. */
  readonly mayReproduceQuotation: boolean;
  readonly mayReproduceTranslation: boolean;
  readonly attributionRequirement: string;
  readonly licenseNote: string;
}

/**
 * A parent-facing source card. Quotation fields stay empty until a permissioned
 * edition and a named reviewer supply them; nothing here may be invented.
 */
export interface SourceRecord {
  readonly id: `source-${string}`;
  readonly locale: 'fa-IR';
  readonly relatedQuestId: QuestId;
  /** Short, neutral Persian description of the principle — never a quotation. */
  readonly principleSummaryFa: string;
  /** Exact Arabic quotation. Empty until approved and permitted. */
  readonly arabicQuotation: string;
  /** Approved Persian translation. Empty until approved and permitted. */
  readonly persianTranslation: string;
  readonly citation: Citation;
  readonly rights: RightsMetadata;
  readonly learningObjective: string;
  readonly ageBand: '3-4' | '5-7' | '3-7';
  readonly mechanicNote: string;
  readonly review: ReviewMetadata;
}

export interface IconDefinition {
  readonly id: IconId;
  /** Accessible Persian label; meaning must also be carried by shape and animation. */
  readonly labelFa: string;
  /** Pictogram shape key rendered by `ui/child/Pictogram`. */
  readonly shape: string;
  readonly animationCue: string;
}

export interface QuestCopy {
  readonly questId: QuestId;
  readonly titleFa: string;
  /** One short idea per card, simple Persian, no shame/fear/merit claims. */
  readonly childSummaryFa: string;
  readonly steps: readonly QuestStepCopy[];
  readonly completionFa: string;
  readonly stickerLabelFa: string;
  readonly sourceIds: readonly SourceRecord['id'][];
  readonly review: ReviewMetadata;
}

export interface QuestStepCopy {
  readonly stepId: string;
  readonly introFa: string;
  readonly demonstrateFa: string;
  readonly promptFa: string;
  readonly successFa: string;
  readonly retryFa: string;
}

export interface DialogueNode {
  readonly id: string;
  readonly npcId: NpcId;
  readonly textFa: string;
  readonly iconId: IconId | null;
  /** Quest offered by this node, if any. */
  readonly offersQuestId: QuestId | null;
  readonly review: ReviewMetadata;
}

export interface NpcCopy {
  readonly npcId: NpcId;
  readonly nameFa: string;
  readonly roleFa: string;
}
