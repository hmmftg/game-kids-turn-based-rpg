import type { DialogueNode } from '../../content/types.ts';
import { DIALOGUE_NODES, getDialogueNode } from '../../content/fa/dialogue.ts';
import { ENCOUNTER_PHASES, type QuestId } from '../game/types.ts';
import { getQuestStep, QUEST_DEFINITIONS } from './definitions.ts';

/**
 * InteractionSteps — the mandatory-action model over the interaction graph.
 *
 * Counts *forced child actions*, not dialogue structure or copy length:
 *
 *   auto presentation (intro/demonstrate/response/reinforce/complete)  = 0
 *   tap object (playerChoice)                                        = 1
 *   tap NPC / destination (entering the interaction)                 = 1
 *   outside-tap dismissal                                            = 0 — always free
 *   optional dialogue tap (line beats, linear "next")               = 0 — never forced
 *
 * A tap is only mandatory when the game cannot reach the next meaningful
 * state without it. The child can always leave — no interaction counts an
 * exit action.
 */

/** Forced taps per encounter phase. `playerChoice` is the only beat where a
 *  child decision IS the game state change; everything around it auto-plays. */
const PHASE_MANDATORY_ACTIONS: Record<(typeof ENCOUNTER_PHASES)[number], number> = {
  intro: 0,
  demonstrate: 0,
  playerChoice: 1,
  worldResponse: 0,
  reinforce: 0,
  complete: 0,
};

export interface QuestInteractionReport {
  readonly questId: QuestId;
  /** The tap that enters the interaction (quest chip / NPC + start). */
  readonly entry: number;
  /** Forced taps per step, in order. */
  readonly steps: readonly number[];
  /** entry + Σ steps — the full forced path of the quest. */
  readonly total: number;
}

export interface DialogueInteractionReport {
  readonly nodeId: string;
  /** Forced taps to *finish* this branch assuming the child keeps going:
   *  one per required choice on the heaviest path. Linear beats and exits
   *  are never mandatory. */
  readonly toComplete: number;
}

/** Hard product limits — the ratchet the UX overhaul is measured against. */
export const INTERACTION_LIMITS = {
  /** A standard encounter step forces at most 2 actions (1 today). */
  step: 2,
  /** A routine dialogue forces at most 1 action on its heaviest path. */
  dialogue: 1,
  /** A dialogue with no required choice costs 0 mandatory actions to exit. */
  exit: 0,
} as const;

/** Forced taps for one encounter step — 1 (the object choice). */
export function stepMandatoryActions(questId: QuestId, stepIndex: number): number {
  const step = getQuestStep(questId, stepIndex);
  if (step === null) return 0;
  // If a step ever stops offering a tappable choice it forces nothing — but
  // that is a content defect the validator reports separately, not a free pass.
  return step.choiceIconIds.length === 0
    ? 0
    : ENCOUNTER_PHASES.reduce((sum, phase) => sum + PHASE_MANDATORY_ACTIONS[phase], 0);
}

export function questMandatoryActions(questId: QuestId): QuestInteractionReport {
  const quest = QUEST_DEFINITIONS.find((entry) => entry.id === questId);
  const steps = (quest?.steps ?? []).map((_, index) => stepMandatoryActions(questId, index));
  const entry = 1;
  return { questId, entry, steps, total: entry + steps.reduce((a, b) => a + b, 0) };
}

/**
 * Forced taps inside a dialogue node — the heaviest required-choice path.
 * `lines` and `nextNodeId` are optional continuation (0): the child may leave
 * or pick a choice at any point; `choices` need exactly one pick to advance
 * (1), then the deepest branch continues.
 */
export function dialogueMandatoryActions(nodeId: string): DialogueInteractionReport {
  const seen = new Set<string>();
  const walk = (id: string): number => {
    if (seen.has(id)) return 0; // a dialogue loop can never force more taps
    seen.add(id);
    const node = getDialogueNode(id);
    if (!node) return 0;
    const choicePaths = (node.choices ?? []).map((choice) => walk(choice.nextNodeId));
    const linear = node.nextNodeId !== undefined ? walk(node.nextNodeId) : 0;
    const deepest = Math.max(linear, ...choicePaths, 0);
    return (node.choices && node.choices.length > 0 ? 1 : 0) + deepest;
  };
  return { nodeId, toComplete: walk(nodeId) };
}

/** Every dialogue node's report — used by the content gate and tests. */
export function allDialogueReports(): readonly DialogueInteractionReport[] {
  return DIALOGUE_NODES.map((node: DialogueNode) => dialogueMandatoryActions(node.id));
}

/** Every quest's report — used by the content gate and tests. */
export function allQuestReports(): readonly QuestInteractionReport[] {
  return QUEST_DEFINITIONS.map((quest) => questMandatoryActions(quest.id));
}
