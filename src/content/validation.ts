import { QUEST_DEFINITIONS, getQuestDefinition } from '../domain/quests/definitions.ts';
import type { AreaId } from '../domain/world/types.ts';
import { NPC_DEFINITIONS, WORLD_AREAS, insideBounds } from '../world/registry.ts';
import { ANCHORS, EDGES, getAnchorOrNull } from '../world/navigation/graph.ts';
import { MAP_TRANSITIONS, WORLD_MAPS } from '../world/maps.ts';
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
    { where: `${copy.questId}.objectiveFa`, text: copy.objectiveFa },
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

/**
 * Reading-budget ceilings for pre-readers: more story must never mean more
 * reading burden. One short idea per line, and choice labels short enough to
 * glance-and-tap. `parentNoteFa` is exempt — it is parent-facing copy.
 */
const MAX_DIALOGUE_LINE_WORDS = 9;
const MAX_CHOICE_LABEL_WORDS = 5;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function checkText(where: string, text: string, issues: ValidationIssue[]): void {
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

function checkLength(
  where: string,
  text: string,
  maxWords: number,
  issues: ValidationIssue[],
): void {
  const words = wordCount(text);
  if (words > maxWords) {
    issues.push({
      severity: 'error',
      code: 'copy-too-long',
      where,
      message: `Line is ${words} words; child-facing beats must stay ≤${maxWords} words.`,
    });
  }
}

/**
 * World-structure validation: the registries that make content scale must
 * stay internally consistent — unique ids, resolvable references, and world
 * content that always belongs to a real area.
 */
function validateWorld(issues: ValidationIssue[]): void {
  const areaIds = new Set<AreaId>();
  const MAP_IDS = new Set(WORLD_MAPS.map((map) => map.id));
  for (const area of WORLD_AREAS) {
    if (areaIds.has(area.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-area',
        where: area.id,
        message: 'Duplicate area id.',
      });
    }
    areaIds.add(area.id);
    if (area.bounds.minX >= area.bounds.maxX || area.bounds.minZ >= area.bounds.maxZ) {
      issues.push({
        severity: 'error',
        code: 'bad-bounds',
        where: area.id,
        message: 'Area bounds are contradictory (min must be below max).',
      });
    }
    const spawn = getAnchorOrNull(area.spawnAnchorId);
    if (!spawn) {
      issues.push({
        severity: 'error',
        code: 'unknown-anchor',
        where: area.id,
        message: `Spawn anchor ${area.spawnAnchorId} does not exist.`,
      });
    }
  }

  const dialogueIds = new Set(DIALOGUE_NODES.map((node) => node.id));

  for (const anchor of ANCHORS) {
    if (!areaIds.has(anchor.areaId)) {
      issues.push({
        severity: 'error',
        code: 'unknown-area',
        where: anchor.id,
        message: `Anchor references unknown area ${anchor.areaId}.`,
      });
      continue;
    }
    const bounds = WORLD_AREAS.find((area) => area.id === anchor.areaId)!.bounds;
    if (!insideBounds(bounds, anchor.x, anchor.z)) {
      issues.push({
        severity: 'error',
        code: 'anchor-outside-area',
        where: anchor.id,
        message: `Anchor (${anchor.x}, ${anchor.z}) lies outside ${anchor.areaId} bounds.`,
      });
    }
    if (anchor.npcId !== null && !NPC_DEFINITIONS.some((npc) => npc.id === anchor.npcId)) {
      issues.push({
        severity: 'error',
        code: 'unknown-npc',
        where: anchor.id,
        message: `Anchor references NPC ${anchor.npcId} with no definition.`,
      });
    }
    if (!MAP_IDS.has(anchor.mapId)) {
      issues.push({
        severity: 'error',
        code: 'unknown-map',
        where: anchor.id,
        message: `Anchor references unknown map ${anchor.mapId}.`,
      });
    }
  }

  // Maps and the transitions between them — the multi-map contract.
  const transitionIds = new Set<string>();
  for (const map of WORLD_MAPS) {
    if (map.bounds.minX >= map.bounds.maxX || map.bounds.minZ >= map.bounds.maxZ) {
      issues.push({
        severity: 'error',
        code: 'bad-bounds',
        where: map.id,
        message: 'Map bounds are contradictory (min must be below max).',
      });
    }
    const spawn = getAnchorOrNull(map.spawnAnchorId);
    if (!spawn || spawn.mapId !== map.id || !spawn.walkable) {
      issues.push({
        severity: 'error',
        code: 'unknown-anchor',
        where: map.id,
        message: `Map spawn ${map.spawnAnchorId} must be a walkable anchor on the map.`,
      });
    }
  }
  for (const transition of MAP_TRANSITIONS) {
    if (transitionIds.has(transition.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-transition',
        where: transition.id,
        message: 'Duplicate transition id.',
      });
    }
    transitionIds.add(transition.id);
    const from = getAnchorOrNull(transition.fromAnchor);
    const to = getAnchorOrNull(transition.toAnchor);
    if (!from || from.mapId !== transition.fromMap || from.transitionId !== transition.id) {
      issues.push({
        severity: 'error',
        code: 'bad-transition',
        where: transition.id,
        message: 'Transition fromAnchor must be an anchor on fromMap carrying this transitionId.',
      });
    }
    if (!to || to.mapId !== transition.toMap || !to.walkable) {
      issues.push({
        severity: 'error',
        code: 'bad-transition',
        where: transition.id,
        message: 'Transition toAnchor must be a walkable anchor on toMap.',
      });
    }
  }
  // Edges must never cross maps — cross-map travel is transitions only.
  for (const edge of EDGES) {
    const a = getAnchorOrNull(edge.from);
    const b = getAnchorOrNull(edge.to);
    if (a && b && a.mapId !== b.mapId) {
      issues.push({
        severity: 'error',
        code: 'cross-map-edge',
        where: `${edge.from}->${edge.to}`,
        message: 'Walk edge crosses maps; use a MapTransition instead.',
      });
    }
  }

  const npcIds = new Set<string>();
  for (const npc of NPC_DEFINITIONS) {
    if (npcIds.has(npc.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-npc',
        where: npc.id,
        message: 'Duplicate NPC id.',
      });
    }
    npcIds.add(npc.id);
    if (!areaIds.has(npc.homeAreaId)) {
      issues.push({
        severity: 'error',
        code: 'unknown-area',
        where: npc.id,
        message: `NPC home area ${npc.homeAreaId} does not exist.`,
      });
    }
    const home = getAnchorOrNull(npc.anchorId);
    if (!home) {
      issues.push({
        severity: 'error',
        code: 'unknown-anchor',
        where: npc.id,
        message: `NPC home anchor ${npc.anchorId} does not exist.`,
      });
    } else if (home.areaId !== npc.homeAreaId) {
      issues.push({
        severity: 'error',
        code: 'npc-area-mismatch',
        where: npc.id,
        message: `NPC home area ${npc.homeAreaId} does not match anchor area ${home.areaId}.`,
      });
    }
    for (const spot of npc.schedule?.spots ?? []) {
      if (!getAnchorOrNull(spot.anchorId)) {
        issues.push({
          severity: 'error',
          code: 'unknown-anchor',
          where: npc.id,
          message: `Schedule spot ${spot.anchorId} does not exist.`,
        });
      }
      // A contextual greeting belongs to the NPC saying it — a spot may only
      // point at a dialogue node owned by this NPC.
      if (spot.dialogueId !== undefined) {
        const spotNode = DIALOGUE_NODES.find((node) => node.id === spot.dialogueId) ?? null;
        if (spotNode === null) {
          issues.push({
            severity: 'error',
            code: 'unknown-dialogue',
            where: npc.id,
            message: `Schedule spot references unknown dialogue node ${spot.dialogueId}.`,
          });
        } else if (spotNode.npcId !== npc.id) {
          issues.push({
            severity: 'error',
            code: 'dialogue-owner-mismatch',
            where: npc.id,
            message: `Schedule spot dialogue ${spot.dialogueId} belongs to ${spotNode.npcId}, not ${npc.id}.`,
          });
        }
      }
    }
    if (npc.dialogueIds.length === 0) {
      issues.push({
        severity: 'error',
        code: 'no-dialogue',
        where: npc.id,
        message: 'NPC must reference at least one dialogue entry node.',
      });
    }
    for (const id of npc.dialogueIds) {
      if (!dialogueIds.has(id)) {
        issues.push({
          severity: 'error',
          code: 'unknown-dialogue',
          where: npc.id,
          message: `NPC references unknown dialogue node ${id}.`,
        });
      }
    }
  }
}

export function validateContent(
  options: ValidationOptions = { requireApproved: false },
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const sourceIds = new Set(SOURCE_RECORDS.map((record) => record.id));
  const npcIds = new Set(NPCS.map((npc) => npc.npcId));

  validateWorld(issues);

  // World NPCs must have copy rows; copy rows must describe real NPCs.
  for (const npc of NPC_DEFINITIONS) {
    if (!npcIds.has(npc.id)) {
      issues.push({
        severity: 'error',
        code: 'missing-npc-copy',
        where: npc.id,
        message: 'NPC definition has no Persian copy row.',
      });
    }
  }
  const definedNpcIds = new Set(NPC_DEFINITIONS.map((npc) => npc.id));
  for (const copy of NPCS) {
    if (!definedNpcIds.has(copy.npcId)) {
      issues.push({
        severity: 'error',
        code: 'orphan-npc-copy',
        where: copy.npcId,
        message: 'NPC copy exists without an NPC definition.',
      });
    }
  }

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
      checkText(where, text, issues);
    }
    if (copy.parentNoteFa !== undefined) {
      checkText(`${copy.questId}.parentNoteFa`, copy.parentNoteFa, issues);
    }

    // Reusable references — quests point at areas/NPCs/dialogue, not UI.
    if (!WORLD_AREAS.some((area) => area.id === definition.areaId)) {
      issues.push({
        severity: 'error',
        code: 'unknown-area',
        where: definition.id,
        message: `Quest references unknown area ${definition.areaId}.`,
      });
    }
    for (const npcId of definition.npcIds) {
      if (!npcIds.has(npcId)) {
        issues.push({
          severity: 'error',
          code: 'unknown-npc',
          where: definition.id,
          message: `Quest references unknown NPC ${npcId}.`,
        });
      }
    }
    const dialogueIdSet = new Set(DIALOGUE_NODES.map((node) => node.id));
    for (const id of definition.dialogueIds) {
      if (!dialogueIdSet.has(id)) {
        issues.push({
          severity: 'error',
          code: 'unknown-dialogue',
          where: definition.id,
          message: `Quest references unknown dialogue node ${id}.`,
        });
      }
    }
    for (const nextId of definition.nextQuestIds) {
      try {
        getQuestDefinition(nextId);
      } catch {
        issues.push({
          severity: 'error',
          code: 'unknown-quest',
          where: definition.id,
          message: `Quest chain links to unknown quest ${nextId}.`,
        });
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

  // The dialogue graph: unique ids, resolvable branches, no orphans.
  const nodeIds = new Set<string>();
  for (const node of DIALOGUE_NODES) {
    if (nodeIds.has(node.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-dialogue',
        where: node.id,
        message: 'Duplicate dialogue node id.',
      });
    }
    nodeIds.add(node.id);
  }
  const reachable = new Set<string>([
    ...NPC_DEFINITIONS.flatMap((npc) => [
      ...npc.dialogueIds,
      // Contextual greetings are entry points too: a routine spot's
      // dialogueId is how the child reaches that node.
      ...(npc.schedule?.spots.flatMap((spot) => (spot.dialogueId ? [spot.dialogueId] : [])) ?? []),
    ]),
    ...QUEST_DEFINITIONS.flatMap((quest) => [...quest.dialogueIds]),
  ]);
  for (const node of DIALOGUE_NODES) {
    if (!npcIds.has(node.npcId)) {
      issues.push({
        severity: 'error',
        code: 'unknown-npc',
        where: node.id,
        message: `Dialogue references unknown NPC ${node.npcId}.`,
      });
    }
    checkText(`${node.id}.textFa`, node.textFa, issues);
    checkLength(`${node.id}.textFa`, node.textFa, MAX_DIALOGUE_LINE_WORDS, issues);
    for (const [index, line] of (node.lines ?? []).entries()) {
      if (!npcIds.has(line.speakerId)) {
        issues.push({
          severity: 'error',
          code: 'unknown-npc',
          where: `${node.id}.lines[${index}]`,
          message: `Dialogue line has unknown speaker ${line.speakerId}.`,
        });
      }
      checkText(`${node.id}.lines[${index}]`, line.textFa, issues);
      checkLength(`${node.id}.lines[${index}]`, line.textFa, MAX_DIALOGUE_LINE_WORDS, issues);
    }
    const choiceIds = new Set<string>();
    for (const choice of node.choices ?? []) {
      if (choiceIds.has(choice.id)) {
        issues.push({
          severity: 'error',
          code: 'duplicate-choice',
          where: node.id,
          message: `Duplicate choice id ${choice.id}.`,
        });
      }
      choiceIds.add(choice.id);
      if (!hasIcon(choice.iconId)) {
        issues.push({
          severity: 'error',
          code: 'unknown-icon',
          where: `${node.id}.${choice.id}`,
          message: `Choice references unknown icon ${choice.iconId}.`,
        });
      }
      checkText(`${node.id}.${choice.id}`, choice.labelFa, issues);
      checkLength(`${node.id}.${choice.id}`, choice.labelFa, MAX_CHOICE_LABEL_WORDS, issues);
      if (!nodeIds.has(choice.nextNodeId)) {
        issues.push({
          severity: 'error',
          code: 'broken-dialogue-branch',
          where: `${node.id}.${choice.id}`,
          message: `Choice targets unknown node ${choice.nextNodeId}.`,
        });
      } else {
        reachable.add(choice.nextNodeId);
      }
    }
    if (node.nextNodeId !== undefined) {
      if (!nodeIds.has(node.nextNodeId)) {
        issues.push({
          severity: 'error',
          code: 'broken-dialogue-branch',
          where: node.id,
          message: `Node continues to unknown node ${node.nextNodeId}.`,
        });
      } else {
        reachable.add(node.nextNodeId);
      }
    }
    if (node.parentNoteFa !== undefined) {
      checkText(`${node.id}.parentNoteFa`, node.parentNoteFa, issues);
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
    } else if (!isFullyReviewed(node.review)) {
      issues.push({
        severity: 'error',
        code: 'incomplete-review',
        where: node.id,
        message: 'Approved dialogue must name its reviewers and review date.',
      });
    }
  }

  // Orphans: every node must be reachable from an NPC entry point or another node.
  for (const node of DIALOGUE_NODES) {
    if (!reachable.has(node.id)) {
      issues.push({
        severity: 'error',
        code: 'orphan-dialogue',
        where: node.id,
        message: 'Dialogue node is not reachable from any NPC or branch.',
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
