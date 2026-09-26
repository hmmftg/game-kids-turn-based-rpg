import { advancePhase, applyChoice, createEncounter } from '../quests/encounter.ts';
import { getQuestDefinition } from '../quests/definitions.ts';
import { canStartQuest } from '../quests/prerequisites.ts';
import { createCheckpoint } from './checkpoints.ts';
import { createFreshPersistedState, SAVE_SCHEMA_VERSION } from './initialState.ts';
import { RESUMABLE_MODES } from './types.ts';
import type {
  Command,
  GameState,
  Mode,
  PersistedState,
  QuestId,
  QuestProgress,
  ResumableMode,
  StickerId,
} from './types.ts';

function isResumable(mode: Mode): mode is ResumableMode {
  return (RESUMABLE_MODES as readonly Mode[]).includes(mode);
}

/** Marks a stable transition: bumps the autosave token and refreshes the play timestamp. */
function stable(state: GameState, patch: Partial<GameState>, now: number): GameState {
  return {
    ...state,
    ...patch,
    lastPlayedAt: now,
    autosaveToken: state.autosaveToken + 1,
  };
}

function withQuest(
  state: GameState,
  questId: QuestId,
  progress: QuestProgress,
): Record<QuestId, QuestProgress> {
  return { ...state.quests, [questId]: progress };
}

function completeQuest(state: GameState, questId: QuestId, now: number): GameState {
  const definition = getQuestDefinition(questId);
  const previous = state.quests[questId];
  const completedSteps = definition.steps.map((step) => step.id);
  const stickers: readonly StickerId[] = state.stickers.includes(definition.stickerId)
    ? state.stickers
    : [...state.stickers, definition.stickerId];

  return stable(
    state,
    {
      mode: 'hub',
      resumeMode: 'hub',
      encounter: null,
      dialogue: null,
      quests: withQuest(state, questId, {
        status: 'completed',
        completedSteps,
        completionCount: previous.completionCount + 1,
      }),
      stickers,
      checkpoint: createCheckpoint('questCompleted', questId, now),
    },
    now,
  );
}

function applyPersisted(state: GameState, persisted: PersistedState): GameState {
  return {
    ...state,
    schemaVersion: SAVE_SCHEMA_VERSION,
    avatarId: persisted.avatarId,
    quests: persisted.quests,
    checkpoint: persisted.checkpoint,
    stickers: persisted.stickers,
    audio: persisted.audio,
    qualityTier: persisted.qualityTier,
    lastPlayedAt: persisted.lastPlayedAt,
  };
}

/**
 * The single pure transition function for the whole game.
 *
 * Invariants:
 * - Unknown or invalid commands return the *same object reference*, so callers can
 *   detect no-ops and tests can assert invalid transitions cheaply.
 * - Every transition is idempotent: re-applying a command in the resulting mode
 *   either no-ops or produces an equivalent state.
 * - Only transitions wrapped in `stable()` are autosaved.
 */
export function gameReducer(state: GameState, command: Command, now = 0): GameState {
  if (state.mode === 'fatalFallback' && command.type !== 'RESET_PROGRESS') {
    return state;
  }

  switch (command.type) {
    case 'BOOT_LOADED': {
      // A portrait rotation may interrupt boot; the result is still applied and
      // surfaces as soon as the device is landscape again.
      const booting = state.mode === 'boot' || state.interruptedMode === 'boot';
      if (!booting) return state;
      const blocked = state.mode === 'orientationBlocked';
      const base: GameState = {
        ...state,
        mode: blocked ? 'orientationBlocked' : 'title',
        resumeMode: 'title',
        interruptedMode: blocked ? 'title' : state.interruptedMode,
        saveHealth: command.health,
        corruptSaveDetected: command.health === 'recovered',
      };
      return command.persisted ? applyPersisted(base, command.persisted) : base;
    }

    case 'BOOT_FAILED': {
      const booting = state.mode === 'boot' || state.interruptedMode === 'boot';
      if (!booting) return state;
      if (state.mode === 'orientationBlocked') {
        return { ...state, interruptedMode: 'fatalFallback', fatalReason: command.reason };
      }
      return { ...state, mode: 'fatalFallback', fatalReason: command.reason };
    }

    case 'ORIENTATION_CHANGED': {
      if (state.orientation === command.orientation) return state;
      if (command.orientation === 'portrait') {
        return {
          ...state,
          orientation: 'portrait',
          interruptedMode: state.mode === 'orientationBlocked' ? state.interruptedMode : state.mode,
          mode: 'orientationBlocked',
        };
      }
      return {
        ...state,
        orientation: 'landscape',
        mode: state.interruptedMode ?? 'title',
        interruptedMode: null,
      };
    }

    case 'WEBGL_AVAILABILITY_CHANGED':
      if (state.webglAvailable === command.available) return state;
      return { ...state, webglAvailable: command.available };

    case 'START_PRESSED': {
      if (state.mode !== 'title') return state;
      const next: ResumableMode = state.avatarId === null ? 'avatarSelect' : 'hub';
      return stable(state, { mode: next, resumeMode: next }, now);
    }

    case 'SELECT_AVATAR': {
      if (state.mode !== 'avatarSelect') return state;
      return stable(
        state,
        {
          avatarId: command.avatarId,
          mode: 'hub',
          resumeMode: 'hub',
          checkpoint: createCheckpoint('hub', null, now),
        },
        now,
      );
    }

    case 'ENTER_HUB': {
      if (state.mode === 'hub') return state;
      if (state.mode !== 'dialogue' && state.mode !== 'encounter') return state;
      return { ...state, mode: 'hub', resumeMode: 'hub', dialogue: null, encounter: null };
    }

    case 'OPEN_DIALOGUE': {
      if (state.mode !== 'hub') return state;
      return {
        ...state,
        mode: 'dialogue',
        resumeMode: 'dialogue',
        dialogue: { npcId: command.npcId, nodeId: command.nodeId },
      };
    }

    case 'CLOSE_DIALOGUE':
      if (state.mode !== 'dialogue') return state;
      return { ...state, mode: 'hub', resumeMode: 'hub', dialogue: null };

    case 'START_QUEST': {
      if (state.mode !== 'hub' && state.mode !== 'dialogue') return state;
      if (!canStartQuest(state, command.questId)) return state;
      const progress = state.quests[command.questId];
      return {
        ...state,
        mode: 'encounter',
        resumeMode: 'encounter',
        dialogue: null,
        encounter: createEncounter(command.questId),
        quests:
          progress.status === 'completed'
            ? state.quests
            : withQuest(state, command.questId, { ...progress, status: 'active' }),
      };
    }

    case 'ADVANCE_PHASE': {
      if (state.mode !== 'encounter' || state.encounter === null) return state;
      const encounter = advancePhase(state.encounter);
      if (encounter === state.encounter) return state;
      if (encounter.phase === 'complete') return completeQuest(state, encounter.questId, now);
      return { ...state, encounter };
    }

    case 'CHOOSE': {
      if (state.mode !== 'encounter' || state.encounter === null) return state;
      const encounter = applyChoice(state.encounter, command.iconId);
      if (encounter === state.encounter) return state;
      return { ...state, encounter };
    }

    case 'ABANDON_ENCOUNTER': {
      if (state.mode !== 'encounter' || state.encounter === null) return state;
      const questId = state.encounter.questId;
      const progress = state.quests[questId];
      return {
        ...state,
        mode: 'hub',
        resumeMode: 'hub',
        encounter: null,
        quests:
          progress.status === 'active'
            ? withQuest(state, questId, { ...progress, status: 'available' })
            : state.quests,
      };
    }

    case 'PAUSE':
      if (!isResumable(state.mode)) return state;
      return { ...state, mode: 'paused', resumeMode: state.mode };

    case 'RESUME':
      if (state.mode !== 'paused') return state;
      return { ...state, mode: state.resumeMode };

    case 'OPEN_PARENT_GATE':
      if (state.mode !== 'paused' && state.mode !== 'title') return state;
      return {
        ...state,
        mode: 'parentGate',
        resumeMode: state.mode === 'title' ? 'title' : state.resumeMode,
      };

    case 'PARENT_GATE_PASSED':
      if (state.mode !== 'parentGate') return state;
      return { ...state, mode: 'parentArea' };

    case 'CLOSE_PARENT':
      if (state.mode !== 'parentGate' && state.mode !== 'parentArea') return state;
      return { ...state, mode: state.resumeMode };

    case 'SET_AUDIO_SETTINGS': {
      const audio = { ...state.audio, ...command.audio };
      const unchanged =
        audio.musicMuted === state.audio.musicMuted &&
        audio.sfxMuted === state.audio.sfxMuted &&
        audio.musicVolume === state.audio.musicVolume &&
        audio.sfxVolume === state.audio.sfxVolume;
      if (unchanged) return state;
      return stable(state, { audio }, now);
    }

    case 'SET_QUALITY_TIER':
      if (state.qualityTier === command.tier) return state;
      return stable(state, { qualityTier: command.tier }, now);

    case 'RESET_PROGRESS': {
      if (state.mode !== 'parentArea' && state.mode !== 'fatalFallback') return state;
      return stable(
        {
          ...state,
          ...createFreshPersistedState(now),
          encounter: null,
          dialogue: null,
          saveHealth: 'fresh',
          corruptSaveDetected: false,
          fatalReason: null,
        },
        { mode: 'title', resumeMode: 'title' },
        now,
      );
    }

    case 'FATAL_ERROR':
      if (state.mode === 'fatalFallback') return state;
      return { ...state, mode: 'fatalFallback', fatalReason: command.reason };
  }
}
