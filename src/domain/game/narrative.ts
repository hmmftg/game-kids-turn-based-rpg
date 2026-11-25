import {
  compileNarrative,
  createNarrativeState,
  getQuestStatus,
  transitionNarrative,
  type NarrativeCommand,
  type NarrativeDefinition,
  type NarrativeCommandBase,
  type NarrativeState,
  type NarrativeTransitionResult,
} from 'waypoint-rpg-narrative';
import { DIALOGUE_NODES } from '../../content/fa/dialogue.ts';
import type { NpcId, PersistedState, QuestId, QuestProgress, QuestStatus } from './types.ts';
import { QUEST_DEFINITIONS } from '../quests/definitions.ts';

const DIALOGUE_NODE_BY_ID = new Map(DIALOGUE_NODES.map((node) => [node.id, node]));

/**
 * Mahalle-authored content translated to the reusable narrative vocabulary.
 * Persian copy and pictogram policy stay in `src/content/fa`; this module only
 * supplies stable graph/quest structure and app-owned completion triggers.
 */
export const MAHALLE_NARRATIVE = compileNarrative({
  schemaVersion: 1,
  id: 'mahalle-ye-mehrabani',
  contentVersion: 'fa-copy-1',
  compatibilityVersion: 'mahalle-quests-dialogue-1',
  defaultLocale: 'fa',
  entryDialogueId: 'mahalle-dialogue',
  quests: QUEST_DEFINITIONS.map((quest) => ({
    id: quest.id,
    ...(quest.requires.length === 0
      ? {}
      : {
          prerequisites: {
            op: 'all' as const,
            conditions: quest.requires.map((required) => ({
              op: 'quest-completed' as const,
              questId: required,
            })),
          },
        }),
    restartable: true,
    repeatable: true,
    stepIds: quest.steps.map((step) => step.id),
  })),
  dialogues: [
    {
      id: 'mahalle-dialogue',
      entryNodeId: DIALOGUE_NODES[0]!.id,
      exitPolicy: 'allowed',
      nodes: DIALOGUE_NODES.map((node) => ({
        id: node.id,
        speakerId: node.npcId,
        text: { fa: node.textFa },
        ...(node.nextNodeId === undefined ? {} : { nextNodeId: node.nextNodeId }),
        ...(node.choices === undefined
          ? {}
          : {
              choices: node.choices.map((choice) => ({
                id: choice.id,
                label: { fa: choice.labelFa },
                targetNodeId: choice.nextNodeId,
                repeatable: true,
              })),
            }),
        ...(node.choices === undefined && node.nextNodeId === undefined
          ? { closesDialogue: true }
          : {}),
      })),
    },
  ],
  triggers: QUEST_DEFINITIONS.flatMap((quest) => [
    {
      id: questTriggerId('start', quest.id),
      repeatable: true,
      effects: [{ op: 'start-quest' as const, questId: quest.id }],
    },
    {
      id: questTriggerId('complete', quest.id),
      repeatable: true,
      effects: [{ op: 'complete-quest' as const, questId: quest.id }],
    },
    {
      id: questTriggerId('cancel', quest.id),
      repeatable: true,
      effects: [{ op: 'cancel-quest' as const, questId: quest.id }],
    },
  ]),
} satisfies NarrativeDefinition);

export type MahalleNarrativeAction =
  | { readonly type: 'open-dialogue'; readonly nodeId: string }
  | { readonly type: 'dialogue-target'; readonly nodeId: string }
  | { readonly type: 'exit-dialogue' }
  | { readonly type: 'start-quest'; readonly questId: QuestId }
  | { readonly type: 'complete-quest'; readonly questId: QuestId }
  | { readonly type: 'cancel-quest'; readonly questId: QuestId };

type NarrativeRequest = NarrativeCommand extends infer Command
  ? Command extends NarrativeCommand
    ? Omit<Command, keyof NarrativeCommandBase>
    : never
  : never;

export function createMahalleNarrativeState(
  playthroughId: string,
  persisted?: PersistedState,
): NarrativeState {
  if (!persisted) return createNarrativeState(MAHALLE_NARRATIVE, playthroughId);

  const quests: Record<string, 'active' | 'completed'> = {};
  const questHistory: Record<
    string,
    { completionCount: number; completedSteps: readonly string[] }
  > = {};
  for (const definition of QUEST_DEFINITIONS) {
    const progress = persisted.quests[definition.id];
    if (progress.status === 'active' || progress.status === 'completed')
      quests[definition.id] = progress.status;
    const completionCount = Math.max(
      progress.completionCount,
      progress.status === 'completed' ? 1 : 0,
    );
    if (completionCount > 0 || progress.completedSteps.length > 0) {
      questHistory[definition.id] = {
        completionCount,
        completedSteps: progress.completedSteps,
      };
    }
  }
  return createNarrativeState(MAHALLE_NARRATIVE, playthroughId, { quests, questHistory });
}

export function transitionMahalleNarrative(
  state: NarrativeState,
  action: MahalleNarrativeAction,
): NarrativeState | null {
  const apply = (current: NarrativeState, command: NarrativeRequest) => {
    const result: NarrativeTransitionResult = transitionNarrative(MAHALLE_NARRATIVE, current, {
      ...command,
      playthroughId: current.playthroughId,
      expectedRevision: current.revision,
    } as NarrativeCommand);
    return result.accepted ? result.state : null;
  };

  switch (action.type) {
    case 'open-dialogue': {
      const cursor = apply(state, {
        type: 'open-dialogue',
        dialogueId: 'mahalle-dialogue',
        startNodeId: action.nodeId,
      });
      return cursor;
    }
    case 'dialogue-target': {
      const active = state.activeDialogue;
      if (!active) return null;
      const current = MAHALLE_NARRATIVE.definition.dialogues[0]?.nodes.find(
        (node) => node.id === active.nodeId,
      );
      if (!current) return null;
      if (current.nextNodeId === action.nodeId) return apply(state, { type: 'advance' });
      const choice = current.choices?.find((candidate) => candidate.targetNodeId === action.nodeId);
      return choice ? apply(state, { type: 'choose', choiceId: choice.id }) : null;
    }
    case 'exit-dialogue':
      return state.activeDialogue ? apply(state, { type: 'exit-dialogue' }) : state;
    case 'start-quest': {
      const base = state.activeDialogue ? apply(state, { type: 'exit-dialogue' }) : state;
      return base
        ? apply(base, { type: 'trigger', triggerId: questTriggerId('start', action.questId) })
        : null;
    }
    case 'complete-quest':
      return apply(state, {
        type: 'trigger',
        triggerId: questTriggerId('complete', action.questId),
      });
    case 'cancel-quest':
      return apply(state, {
        type: 'trigger',
        triggerId: questTriggerId('cancel', action.questId),
      });
  }
}

export function getMahalleQuestProgress(state: NarrativeState): Record<QuestId, QuestProgress> {
  const progress = {} as Record<QuestId, QuestProgress>;
  for (const definition of QUEST_DEFINITIONS) {
    const history = state.questHistory[definition.id] ?? {
      completionCount: 0,
      completedSteps: [],
    };
    const libraryStatus = getQuestStatus(MAHALLE_NARRATIVE, state, definition.id);
    let status: QuestStatus;
    if (libraryStatus === 'completed' || history.completionCount > 0) {
      status = 'completed';
    } else if (libraryStatus === 'active') {
      status = 'active';
    } else if (libraryStatus === 'failed' || libraryStatus === 'cancelled') {
      status = definition.requires.every(
        (required) =>
          (state.questHistory[required]?.completionCount ?? 0) > 0 ||
          state.quests[required] === 'completed',
      )
        ? 'available'
        : 'locked';
    } else {
      status = libraryStatus;
    }
    progress[definition.id] = {
      status,
      completedSteps: [...history.completedSteps],
      completionCount: history.completionCount,
    };
  }
  return progress;
}

export function getMahalleDialogueNpc(nodeId: string): NpcId | null {
  return DIALOGUE_NODE_BY_ID.get(nodeId)?.npcId ?? null;
}

export function getMahalleNarrativeDialogueNode(nodeId: string) {
  return (
    MAHALLE_NARRATIVE.definition.dialogues[0]?.nodes.find((node) => node.id === nodeId) ?? null
  );
}

function questTriggerId(operation: 'start' | 'complete' | 'cancel', questId: QuestId): string {
  return `quest-${operation}-${questId}`;
}
