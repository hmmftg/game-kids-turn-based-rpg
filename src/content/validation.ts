import { QUEST_DEFINITIONS, getQuestDefinition } from '../domain/quests/definitions.ts';
import { DIALOGUE_NODES } from './fa/dialogue.ts';
import { hasIcon } from './fa/icons.ts';
import { NPCS, QUEST_COPY } from './fa/quests.ts';
import { SOURCE_RECORDS } from './sources/records.ts';
import type { Citation, QuestCopy, ReviewMetadata, SourceRecord } from './types.ts';

export interface ValidationIssue {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly where: string;
  readonly message: string;
}

export interface ValidationReport {
  readonly issues: readonly ValidationIssue[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly ok: boolean;
}

export interface ValidationOptions {
  /**
   * Release mode: production-reachable content must be `approved` and fully
   * cited. Development mode allows drafts but still forbids unsafe drafts.
   */
  readonly requireApproved: boolean;
}

/**
 * Words that must not appear in child-facing copy: shame, fear, violence, or
 * quantified spiritual merit ("ثواب"/"اجر" with numbers, punishment, hell…).
 */
const FORBIDDEN_CHILD_TERMS = [
  'ثواب',
  'اجر',
  'گناه',
  'عذاب',
  'جهنم',
  'دوزخ',
  'مجازات',
  'تنبیه',
  'بد ذات',
  'خجالت بکش',
  'بترس',
  'ترسناک',
  'کتک',
  'دعوا',
  'بزن',
  'می‌کشد',
  'احمق',
  'تنبل',
];

/** Markers that indicate a quotation or attribution was smuggled into draft copy. */
const QUOTATION_MARKERS = ['قال ', 'عن ', 'روایت', 'حدیث', 'امام', 'پیامبر', 'رسول', '«'];

function isEmptyCitation(citation: Citation): boolean {
  return Object.values(citation).every((value) => value.trim() === '');
}

function isCompleteCitation(citation: Citation): boolean {
  return (
    citation.workTitle.trim() !== '' &&
    citation.author.trim() !== '' &&
    citation.edition.trim() !== '' &&
    citation.publisher.trim() !== '' &&
    citation.volume.trim() !== '' &&
    citation.page.trim() !== ''
  );
}

function isFullyReviewed(review: ReviewMetadata): boolean {
  return (
    review.status === 'approved' &&
    review.scholarReviewer.trim() !== '' &&
    review.childEditorReviewer.trim() !== '' &&
    review.persianProofreader.trim() !== '' &&
    review.reviewedAt.trim() !== ''
  );
}

function childTextsOf(
  copy: QuestCopy,
): readonly { readonly where: string; readonly text: string }[] {
  const texts = [
    { where: `${copy.questId}.titleFa`, text: copy.titleFa },
    { where: `${copy.questId}.childSummaryFa`, text: copy.childSummaryFa },
    { where: `${copy.questId}.completionFa`, text: copy.completionFa },
    { where: `${copy.questId}.stickerLabelFa`, text: copy.stickerLabelFa },
  ];
  for (const step of copy.steps) {
    const base = `${copy.questId}.${step.stepId}`;
    texts.push(
      { where: `${base}.introFa`, text: step.introFa },
      { where: `${base}.demonstrateFa`, text: step.demonstrateFa },
      { where: `${base}.promptFa`, text: step.promptFa },
      { where: `${base}.successFa`, text: step.successFa },
      { where: `${base}.retryFa`, text: step.retryFa },
    );
  }
  return texts;
}

function validateSource(
  record: SourceRecord,
  options: ValidationOptions,
  issues: ValidationIssue[],
): void {
  const where = record.id;
  const hasQuotation =
    record.arabicQuotation.trim() !== '' || record.persianTranslation.trim() !== '';

  if (record.review.status !== 'approved') {
    if (hasQuotation) {
      issues.push({
        severity: 'error',
        code: 'draft-quotation',
        where,
        message: 'Draft source records must not contain quotation or translation text.',
      });
    }
    if (!isEmptyCitation(record.citation)) {
      issues.push({
        severity: 'error',
        code: 'draft-citation',
        where,
        message: 'Draft source records must leave every citation field empty.',
      });
    }
    if (record.rights.mayReproduceQuotation || record.rights.mayReproduceTranslation) {
      issues.push({
        severity: 'error',
        code: 'draft-rights',
        where,
        message: 'Draft source records must not claim reproduction rights.',
      });
    }
    if (options.requireApproved) {
      issues.push({
        severity: 'error',
        code: 'not-approved',
        where,
        message: `Source is "${record.review.status}"; production-reachable content must be approved.`,
      });
    } else {
      issues.push({
        severity: 'warning',
        code: 'draft-content',
        where,
        message: 'Draft source record: placeholder only, not releasable.',
      });
    }
    return;
  }

  if (!isFullyReviewed(record.review)) {
    issues.push({
      severity: 'error',
      code: 'incomplete-review',
      where,
      message: 'Approved source must name scholar, child editor, proofreader and review date.',
    });
  }
  if (!isCompleteCitation(record.citation)) {
    issues.push({
      severity: 'error',
      code: 'incomplete-citation',
      where,
      message:
        'Approved source must carry a complete citation (work, author, edition, publisher, volume, page).',
    });
  }
  if (record.arabicQuotation.trim() !== '' && !record.rights.mayReproduceQuotation) {
    issues.push({
      severity: 'error',
      code: 'missing-rights',
      where,
      message: 'Quotation present without reproduction rights.',
    });
  }
  if (record.persianTranslation.trim() !== '' && !record.rights.mayReproduceTranslation) {
    issues.push({
      severity: 'error',
      code: 'missing-translation-rights',
      where,
      message: 'Translation present without reproduction rights.',
    });
  }
}

export function validateContent(
  options: ValidationOptions = { requireApproved: false },
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const sourceIds = new Set(SOURCE_RECORDS.map((record) => record.id));
  const npcIds = new Set(NPCS.map((npc) => npc.npcId));

  for (const definition of QUEST_DEFINITIONS) {
    const copy = QUEST_COPY.find((entry) => entry.questId === definition.id);
    if (!copy) {
      issues.push({
        severity: 'error',
        code: 'missing-copy',
        where: definition.id,
        message: 'Quest definition has no Persian copy.',
      });
      continue;
    }
    if (copy.steps.length !== definition.steps.length) {
      issues.push({
        severity: 'error',
        code: 'step-count-mismatch',
        where: definition.id,
        message: `Copy has ${copy.steps.length} steps, definition has ${definition.steps.length}.`,
      });
    }
    for (const step of definition.steps) {
      if (!copy.steps.some((entry) => entry.stepId === step.id)) {
        issues.push({
          severity: 'error',
          code: 'missing-step-copy',
          where: `${definition.id}.${step.id}`,
          message: 'Encounter step has no copy.',
        });
      }
      if (step.choiceIconIds.length < 2 || step.choiceIconIds.length > 3) {
        issues.push({
          severity: 'error',
          code: 'choice-count',
          where: `${definition.id}.${step.id}`,
          message: 'Each step must offer two or three pictogram choices.',
        });
      }
      if (!step.choiceIconIds.includes(step.correctIconId)) {
        issues.push({
          severity: 'error',
          code: 'correct-choice-missing',
          where: `${definition.id}.${step.id}`,
          message: 'Correct icon is not among the offered choices.',
        });
      }
      for (const iconId of step.choiceIconIds) {
        if (!hasIcon(iconId)) {
          issues.push({
            severity: 'error',
            code: 'unknown-icon',
            where: `${definition.id}.${step.id}`,
            message: `Unknown icon ${iconId}.`,
          });
        }
      }
      if (!npcIds.has(step.npcId)) {
        issues.push({
          severity: 'error',
          code: 'unknown-npc',
          where: `${definition.id}.${step.id}`,
          message: `Unknown NPC ${step.npcId}.`,
        });
      }
    }

    for (const sourceId of copy.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        issues.push({
          severity: 'error',
          code: 'unknown-source',
          where: definition.id,
          message: `Unknown source record ${sourceId}.`,
        });
      }
    }
    if (copy.sourceIds.length === 0) {
      issues.push({
        severity: 'error',
        code: 'no-source',
        where: definition.id,
        message: 'Quest copy must reference at least one source card.',
      });
    }

    for (const { where, text } of childTextsOf(copy)) {
      for (const term of FORBIDDEN_CHILD_TERMS) {
        if (text.includes(term)) {
          issues.push({
            severity: 'error',
            code: 'forbidden-term',
            where,
            message: `Child-facing copy contains forbidden term "${term}".`,
          });
        }
      }
      for (const marker of QUOTATION_MARKERS) {
        if (text.includes(marker)) {
          issues.push({
            severity: 'error',
            code: 'child-quotation',
            where,
            message: `Child-facing copy looks like a quotation or attribution ("${marker.trim()}").`,
          });
        }
      }
    }

    if (copy.review.status !== 'approved') {
      issues.push({
        severity: options.requireApproved ? 'error' : 'warning',
        code: options.requireApproved ? 'not-approved' : 'draft-content',
        where: definition.id,
        message: `Quest copy is "${copy.review.status}".`,
      });
    } else if (!isFullyReviewed(copy.review)) {
      issues.push({
        severity: 'error',
        code: 'incomplete-review',
        where: definition.id,
        message: 'Approved quest copy must name its reviewers and review date.',
      });
    }
  }

  for (const node of DIALOGUE_NODES) {
    if (!npcIds.has(node.npcId)) {
      issues.push({
        severity: 'error',
        code: 'unknown-npc',
        where: node.id,
        message: `Dialogue references unknown NPC ${node.npcId}.`,
      });
    }
    if (node.iconId !== null && !hasIcon(node.iconId)) {
      issues.push({
        severity: 'error',
        code: 'unknown-icon',
        where: node.id,
        message: `Dialogue references unknown icon ${node.iconId}.`,
      });
    }
    if (node.offersQuestId !== null) {
      try {
        getQuestDefinition(node.offersQuestId);
      } catch {
        issues.push({
          severity: 'error',
          code: 'unknown-quest',
          where: node.id,
          message: `Dialogue offers unknown quest ${node.offersQuestId}.`,
        });
      }
    }
    if (node.review.status !== 'approved') {
      issues.push({
        severity: options.requireApproved ? 'error' : 'warning',
        code: options.requireApproved ? 'not-approved' : 'draft-content',
        where: node.id,
        message: `Dialogue node is "${node.review.status}".`,
      });
    }
  }

  for (const record of SOURCE_RECORDS) {
    validateSource(record, options, issues);
  }

  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.length - errorCount;
  return { issues, errorCount, warningCount, ok: errorCount === 0 };
}

export function formatReport(report: ValidationReport): string {
  if (report.issues.length === 0) return 'content: no issues';
  const lines = report.issues.map(
    (issue) =>
      `${issue.severity === 'error' ? 'ERROR' : 'warn '}  [${issue.code}] ${issue.where}: ${issue.message}`,
  );
  lines.push(`\n${report.errorCount} error(s), ${report.warningCount} warning(s)`);
  return lines.join('\n');
}
