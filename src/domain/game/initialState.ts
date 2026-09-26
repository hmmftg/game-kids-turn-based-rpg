import { QUEST_IDS } from './types.ts';
import type { AudioSettings, GameState, PersistedState, QuestId, QuestProgress } from './types.ts';

export const SAVE_SCHEMA_VERSION = 2;

export const DEFAULT_AUDIO: AudioSettings = {
  musicMuted: false,
  sfxMuted: false,
  musicVolume: 0.6,
  sfxVolume: 0.8,
};

const EMPTY_QUEST: QuestProgress = { status: 'locked', completedSteps: [], completionCount: 0 };

export function createEmptyQuests(): Record<QuestId, QuestProgress> {
  const quests = {} as Record<QuestId, QuestProgress>;
  for (const id of QUEST_IDS) quests[id] = EMPTY_QUEST;
  return quests;
}

export function createFreshPersistedState(now = 0): PersistedState {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    avatarId: null,
    quests: createEmptyQuests(),
    checkpoint: { kind: 'title', questId: null, at: now },
    stickers: [],
    audio: DEFAULT_AUDIO,
    qualityTier: 'medium',
    lastPlayedAt: now,
  };
}

export function createInitialState(now = 0): GameState {
  return {
    ...createFreshPersistedState(now),
    mode: 'boot',
    resumeMode: 'title',
    encounter: null,
    dialogue: null,
    orientation: 'landscape',
    interruptedMode: null,
    webglAvailable: true,
    saveHealth: 'fresh',
    corruptSaveDetected: false,
    fatalReason: null,
    autosaveToken: 0,
  };
}

/** Extracts exactly the fields that may be written to storage. */
export function toPersistedState(state: GameState): PersistedState {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    avatarId: state.avatarId,
    quests: state.quests,
    checkpoint: state.checkpoint,
    stickers: state.stickers,
    audio: state.audio,
    qualityTier: state.qualityTier,
    lastPlayedAt: state.lastPlayedAt,
  };
}
