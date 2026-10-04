import { battleReducer } from '../battle/reducer.ts';
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
    discoveries: persisted.discoveries,
    mapId: persisted.mapId,
    mapAnchorId: persisted.mapAnchorId,
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
 * - While `battle !== null` the battle owns all child input: the commands in
 *   `BATTLE_BLOCKED_COMMANDS` return the same object, closing every escape
 *   path the still-`hub` mode would otherwise leave open.
 */
const BATTLE_BLOCKED_COMMANDS: ReadonlySet<Command['type']> = new Set([
  'OPEN_DIALOGUE',
  'START_QUEST',
  'CHANGE_MAP',
  'DISCOVER',
  'PAUSE',
  'SWITCH_PLAYER',
]);

export function gameReducer(state: GameState, command: Command, now = 0): GameState {
  if (state.mode === 'fatalFallback' && command.type !== 'RESET_PROGRESS') {
    return state;
  }
  if (state.battle !== null && BATTLE_BLOCKED_COMMANDS.has(command.type)) {
    return state;
  }

  switch (command.type) {
    case 'BOOT_LOADED': {
      if (state.mode !== 'boot') return state;
      const landing: ResumableMode = command.hasProfiles ? 'profileSelect' : 'title';
      const base: GameState = {
        ...state,
        mode: landing,
        resumeMode: landing,
        saveHealth: command.health,
        corruptSaveDetected: command.health === 'recovered',
      };
      return command.persisted ? applyPersisted(base, command.persisted) : base;
    }

    case 'BOOT_FAILED': {
      if (state.mode !== 'boot') return state;
      return { ...state, mode: 'fatalFallback', fatalReason: command.reason };
    }

    case 'ORIENTATION_CHANGED': {
      // Device/session record only: both orientations are playable, so a
      // rotation never changes the mode and must never autosave.
      if (state.orientation === command.orientation) return state;
      return { ...state, orientation: command.orientation };
    }

    case 'WEBGL_AVAILABILITY_CHANGED':
      if (state.webglAvailable === command.available) return state;
      return { ...state, webglAvailable: command.available };

    case 'SELECT_PROFILE': {
      // The provider has already loaded the slot; a missing payload means the
      // kid starts over under that profile (fresh or corrupt storage).
      if (state.mode !== 'profileSelect') return state;
      const persisted = command.persisted;
      const next: ResumableMode = persisted
        ? persisted.avatarId === null
          ? 'avatarSelect'
          : 'hub'
        : 'title';
      const base: GameState = {
        ...state,
        mode: next,
        resumeMode: next,
        encounter: null,
        dialogue: null,
        battle: null,
        saveHealth: command.health,
        corruptSaveDetected: command.health === 'recovered',
      };
      return persisted ? applyPersisted(base, persisted) : base;
    }

    case 'START_NEW_PLAYER': {
      if (state.mode !== 'profileSelect' && state.mode !== 'title') return state;
      return stable(
        {
          ...state,
          ...createFreshPersistedState(now),
          encounter: null,
          dialogue: null,
          battle: null,
          saveHealth: 'fresh',
          corruptSaveDetected: false,
          headwear: 'none',
        },
        { mode: 'avatarSelect', resumeMode: 'avatarSelect' },
        now,
      );
    }

    case 'SWITCH_PLAYER': {
      // Stable transition: the departing profile autosaves before the picker
      // opens, so progress is never lost by swapping players mid-session.
      if (state.mode !== 'paused' && state.mode !== 'hub') return state;
      return stable(
        state,
        { mode: 'profileSelect', resumeMode: 'profileSelect', encounter: null, dialogue: null },
        now,
      );
    }

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

    // Cosmetic only: never wrapped in stable() — changing how the avatar
    // looks must not bump autosave or touch gameplay state.
    case 'SET_HEADWEAR':
      if (state.headwear === command.headwear) return state;
      return { ...state, headwear: command.headwear };

    case 'DISCOVER': {
      // A world fact found by reaching its place (e.g. the hidden rock).
      // Idempotent — arriving again must not duplicate or re-save.
      if (state.mode !== 'hub' && state.mode !== 'dialogue') return state;
      if (state.discoveries.includes(command.discoveryId)) return state;
      return stable(state, { discoveries: [...state.discoveries, command.discoveryId] }, now);
    }

    case 'CHANGE_MAP': {
      // Deterministic map transition: the caller resolves the spawn from
      // MAP_TRANSITIONS data; the reducer just records where the child now
      // is so a reload restores the same map + safe local spawn.
      if (state.mode !== 'hub' && state.mode !== 'dialogue') return state;
      return stable(
        state,
        {
          mapId: command.mapId,
          mapAnchorId: command.anchorId,
          mode: 'hub',
          resumeMode: 'hub',
          dialogue: null,
          encounter: null,
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
      // Dialogue-mode dispatch retargets the open node — that is how
      // data-driven branches (`choices`/`nextNodeId`) jump without leaving
      // the dialogue card.
      if (state.mode !== 'hub' && state.mode !== 'dialogue') return state;
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

    case 'START_BATTLE': {
      // Session-only activity: never a Mode, never persisted. Starts only
      // from a free hub (no battle/encounter/dialogue already running) —
      // GameState guards stay here; the transition delegates to the battle
      // domain reducer like encounters delegate to `quests/encounter.ts`.
      if (state.mode !== 'hub' || state.battle !== null || state.dialogue !== null) return state;
      const battle = battleReducer(state.battle, command);
      if (battle === state.battle || battle === null) return state;
      return { ...state, battle };
    }

    case 'CHOOSE_BATTLE_ACTION':
    case 'ADVANCE_BATTLE_PHASE': {
      if (state.battle === null) return state;
      const battle = battleReducer(state.battle, command);
      if (battle === state.battle || battle === null) return state;
      return { ...state, battle };
    }

    case 'LEAVE_BATTLE': {
      // The only exit — victory/defeat are terminal battle states, leaving
      // returns to a plain hub with nothing persisted and nothing replayed.
      if (state.battle === null) return state;
      return {
        ...state,
        battle: battleReducer(state.battle, command),
        mode: 'hub',
        resumeMode: 'hub',
      };
    }

    case 'PAUSE':
      if (!isResumable(state.mode)) return state;
      return { ...state, mode: 'paused', resumeMode: state.mode };

    case 'RESUME':
      if (state.mode !== 'paused') return state;
      return { ...state, mode: state.resumeMode };

    case 'OPEN_PARENT_GATE':
      if (state.mode !== 'paused' && state.mode !== 'title' && state.mode !== 'profileSelect') {
        return state;
      }
      return {
        ...state,
        mode: 'parentGate',
        resumeMode: state.mode === 'paused' ? state.resumeMode : state.mode,
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
      if (
        state.mode !== 'parentArea' &&
        state.mode !== 'fatalFallback' &&
        state.mode !== 'profileSelect'
      ) {
        return state;
      }
      return stable(
        {
          ...state,
          ...createFreshPersistedState(now),
          encounter: null,
          dialogue: null,
          battle: null,
          saveHealth: 'fresh',
          corruptSaveDetected: false,
          headwear: 'none',
          fatalReason: null,
        },
        { mode: 'profileSelect', resumeMode: 'profileSelect' },
        now,
      );
    }

    case 'FATAL_ERROR':
      if (state.mode === 'fatalFallback') return state;
      return { ...state, mode: 'fatalFallback', fatalReason: command.reason };
  }
}
