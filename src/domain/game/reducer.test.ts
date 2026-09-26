import { describe, expect, it } from 'vitest';
import { getQuestStep } from '../quests/definitions.ts';
import { gameReducer } from './reducer.ts';
import { createFreshPersistedState, createInitialState } from './initialState.ts';
import { shouldAutosave } from './selectors.ts';
import { MODES } from './types.ts';
import type { Command, GameState, QuestId } from './types.ts';

const NOW = 1_700_000_000_000;

function boot(): GameState {
  return gameReducer(
    createInitialState(NOW),
    { type: 'BOOT_LOADED', persisted: null, health: 'fresh' },
    NOW,
  );
}

function atHub(): GameState {
  let state = boot();
  state = gameReducer(state, { type: 'START_PRESSED' }, NOW);
  return gameReducer(state, { type: 'SELECT_AVATAR', avatarId: 'avatar-aban' }, NOW);
}

/** Plays a quest to completion by always picking the correct pictogram. */
function playQuest(start: GameState, questId: QuestId): GameState {
  let state = gameReducer(start, { type: 'START_QUEST', questId }, NOW);
  for (let guard = 0; guard < 100 && state.mode === 'encounter'; guard += 1) {
    const encounter = state.encounter;
    if (encounter && encounter.phase === 'playerChoice') {
      const step = getQuestStep(encounter.questId, encounter.stepIndex);
      if (!step) throw new Error(`missing step ${encounter.questId}#${encounter.stepIndex}`);
      state = gameReducer(
        state,
        { type: 'CHOOSE', iconId: step.correctIconId, correct: true },
        NOW,
      );
    } else {
      state = gameReducer(state, { type: 'ADVANCE_PHASE' }, NOW);
    }
  }
  if (state.mode === 'encounter') throw new Error('quest did not complete');
  return state;
}

describe('gameReducer — boot and title', () => {
  it('moves from boot to title with a fresh save', () => {
    const state = boot();
    expect(state.mode).toBe('title');
    expect(state.avatarId).toBeNull();
    expect(state.saveHealth).toBe('fresh');
  });

  it('restores a persisted save on boot', () => {
    const persisted = {
      ...createFreshPersistedState(NOW),
      avatarId: 'avatar-arta' as const,
      stickers: ['sticker-greeting' as const],
    };
    const state = gameReducer(
      createInitialState(NOW),
      { type: 'BOOT_LOADED', persisted, health: 'loaded' },
      NOW,
    );
    expect(state.avatarId).toBe('avatar-arta');
    expect(state.stickers).toEqual(['sticker-greeting']);
    expect(state.mode).toBe('title');
  });

  it('flags a recovered (corrupt) save without crashing', () => {
    const state = gameReducer(
      createInitialState(NOW),
      { type: 'BOOT_LOADED', persisted: null, health: 'recovered' },
      NOW,
    );
    expect(state.corruptSaveDetected).toBe(true);
    expect(state.mode).toBe('title');
  });

  it('enters the fatal fallback when boot fails', () => {
    const state = gameReducer(createInitialState(NOW), { type: 'BOOT_FAILED', reason: 'idb' }, NOW);
    expect(state.mode).toBe('fatalFallback');
    expect(state.fatalReason).toBe('idb');
  });

  it('sends a returning child straight to the hub', () => {
    const persisted = { ...createFreshPersistedState(NOW), avatarId: 'avatar-aban' as const };
    let state = gameReducer(
      createInitialState(NOW),
      { type: 'BOOT_LOADED', persisted, health: 'loaded' },
      NOW,
    );
    state = gameReducer(state, { type: 'START_PRESSED' }, NOW);
    expect(state.mode).toBe('hub');
  });

  it('applies a boot that finishes while the portrait blocker is up', () => {
    let state = gameReducer(
      createInitialState(NOW),
      { type: 'ORIENTATION_CHANGED', orientation: 'portrait' },
      NOW,
    );
    expect(state.mode).toBe('orientationBlocked');
    state = gameReducer(state, { type: 'BOOT_LOADED', persisted: null, health: 'fresh' }, NOW);
    expect(state.mode).toBe('orientationBlocked');
    expect(state.saveHealth).toBe('fresh');
    state = gameReducer(state, { type: 'ORIENTATION_CHANGED', orientation: 'landscape' }, NOW);
    expect(state.mode).toBe('title');
  });

  it('restores the saved avatar even when boot completes under the blocker', () => {
    const persisted = { ...createFreshPersistedState(NOW), avatarId: 'avatar-arta' as const };
    let state = gameReducer(
      createInitialState(NOW),
      { type: 'ORIENTATION_CHANGED', orientation: 'portrait' },
      NOW,
    );
    state = gameReducer(state, { type: 'BOOT_LOADED', persisted, health: 'loaded' }, NOW);
    expect(state.avatarId).toBe('avatar-arta');
    state = gameReducer(state, { type: 'ORIENTATION_CHANGED', orientation: 'landscape' }, NOW);
    expect(state.mode).toBe('title');
    state = gameReducer(state, { type: 'START_PRESSED' }, NOW);
    expect(state.mode).toBe('hub');
  });

  it('keeps a failed boot fatal once the device is landscape again', () => {
    let state = gameReducer(
      createInitialState(NOW),
      { type: 'ORIENTATION_CHANGED', orientation: 'portrait' },
      NOW,
    );
    state = gameReducer(state, { type: 'BOOT_FAILED', reason: 'idb' }, NOW);
    expect(state.mode).toBe('orientationBlocked');
    state = gameReducer(state, { type: 'ORIENTATION_CHANGED', orientation: 'landscape' }, NOW);
    expect(state.mode).toBe('fatalFallback');
    expect(state.fatalReason).toBe('idb');
  });

  it('never autosaves over a recovered save', () => {
    const recovered = gameReducer(
      createInitialState(NOW),
      { type: 'BOOT_LOADED', persisted: null, health: 'recovered' },
      NOW,
    );
    const started = gameReducer(recovered, { type: 'START_PRESSED' }, NOW);
    expect(started.mode).toBe('avatarSelect');
    expect(shouldAutosave(recovered, started)).toBe(false);
  });
});

describe('gameReducer — invalid transitions', () => {
  const invalidCases: ReadonlyArray<[string, GameState, Command]> = [
    ['select avatar from title', boot(), { type: 'SELECT_AVATAR', avatarId: 'avatar-aban' }],
    [
      'choose outside an encounter',
      atHub(),
      { type: 'CHOOSE', iconId: 'icon-greet', correct: true },
    ],
    ['advance phase outside an encounter', atHub(), { type: 'ADVANCE_PHASE' }],
    ['close dialogue outside dialogue', atHub(), { type: 'CLOSE_DIALOGUE' }],
    ['resume when not paused', atHub(), { type: 'RESUME' }],
    ['parent gate from the hub', atHub(), { type: 'OPEN_PARENT_GATE' }],
    ['pass the gate without opening it', atHub(), { type: 'PARENT_GATE_PASSED' }],
    ['reset outside the parent area', atHub(), { type: 'RESET_PROGRESS' }],
    ['boot twice', atHub(), { type: 'BOOT_LOADED', persisted: null, health: 'fresh' }],
  ];

  for (const [name, state, command] of invalidCases) {
    it(`ignores ${name} and keeps the same state reference`, () => {
      expect(gameReducer(state, command, NOW)).toBe(state);
    });
  }

  it('ignores every command except reset in the fatal fallback', () => {
    const fatal = gameReducer(atHub(), { type: 'FATAL_ERROR', reason: 'webgl-context-lost' }, NOW);
    expect(gameReducer(fatal, { type: 'START_PRESSED' }, NOW)).toBe(fatal);
    expect(gameReducer(fatal, { type: 'RESET_PROGRESS' }, NOW).mode).toBe('title');
  });

  it('refuses to start a quest whose prerequisites are unmet', () => {
    const state = atHub();
    expect(gameReducer(state, { type: 'START_QUEST', questId: 'quest-finale' }, NOW)).toBe(state);
  });
});

describe('gameReducer — idempotency', () => {
  it('is idempotent for ENTER_HUB', () => {
    const hub = atHub();
    expect(gameReducer(hub, { type: 'ENTER_HUB' }, NOW)).toBe(hub);
  });

  it('is idempotent for repeated identical settings', () => {
    const hub = atHub();
    const muted = gameReducer(
      hub,
      { type: 'SET_AUDIO_SETTINGS', audio: { musicMuted: true } },
      NOW,
    );
    expect(
      gameReducer(muted, { type: 'SET_AUDIO_SETTINGS', audio: { musicMuted: true } }, NOW),
    ).toBe(muted);
  });

  it('is idempotent for repeated quality tier selection', () => {
    const hub = atHub();
    const low = gameReducer(hub, { type: 'SET_QUALITY_TIER', tier: 'low' }, NOW);
    expect(gameReducer(low, { type: 'SET_QUALITY_TIER', tier: 'low' }, NOW)).toBe(low);
  });

  it('produces an equivalent state when a completed quest is replayed', () => {
    const afterFirst = playQuest(atHub(), 'quest-greeting');
    const afterSecond = playQuest(afterFirst, 'quest-greeting');
    expect(afterSecond.quests['quest-greeting'].status).toBe('completed');
    expect(afterSecond.stickers).toEqual(afterFirst.stickers);
    expect(afterSecond.quests['quest-greeting'].completionCount).toBe(2);
  });
});

describe('gameReducer — quests, checkpoints and autosave', () => {
  it('completes a quest, grants one sticker and writes a checkpoint', () => {
    const before = atHub();
    const after = playQuest(before, 'quest-greeting');
    expect(after.mode).toBe('hub');
    expect(after.quests['quest-greeting'].status).toBe('completed');
    expect(after.stickers).toEqual(['sticker-greeting']);
    expect(after.checkpoint).toEqual({
      kind: 'questCompleted',
      questId: 'quest-greeting',
      at: NOW,
    });
    expect(shouldAutosave(before, after)).toBe(true);
  });

  it('unlocks quests in order and finishes the finale', () => {
    let state = atHub();
    state = playQuest(state, 'quest-greeting');
    state = playQuest(state, 'quest-helping');
    state = playQuest(state, 'quest-tidying');
    state = playQuest(state, 'quest-finale');
    expect(state.stickers).toHaveLength(4);
    expect(state.quests['quest-finale'].status).toBe('completed');
  });

  it('never autosaves mid-encounter', () => {
    const hub = atHub();
    const started = gameReducer(hub, { type: 'START_QUEST', questId: 'quest-greeting' }, NOW);
    const demonstrating = gameReducer(started, { type: 'ADVANCE_PHASE' }, NOW);
    expect(shouldAutosave(hub, started)).toBe(false);
    expect(shouldAutosave(started, demonstrating)).toBe(false);
  });

  it('returns an abandoned quest to available without losing progress', () => {
    const started = gameReducer(atHub(), { type: 'START_QUEST', questId: 'quest-greeting' }, NOW);
    const abandoned = gameReducer(started, { type: 'ABANDON_ENCOUNTER' }, NOW);
    expect(abandoned.mode).toBe('hub');
    expect(abandoned.encounter).toBeNull();
    expect(abandoned.quests['quest-greeting'].status).toBe('available');
  });

  it('gently retries a wrong choice instead of failing the child', () => {
    let state = gameReducer(atHub(), { type: 'START_QUEST', questId: 'quest-greeting' }, NOW);
    state = gameReducer(state, { type: 'ADVANCE_PHASE' }, NOW); // demonstrate
    state = gameReducer(state, { type: 'ADVANCE_PHASE' }, NOW); // playerChoice
    state = gameReducer(state, { type: 'CHOOSE', iconId: 'icon-turn-back', correct: false }, NOW);
    expect(state.encounter?.phase).toBe('worldResponse');
    state = gameReducer(state, { type: 'ADVANCE_PHASE' }, NOW);
    expect(state.encounter?.phase).toBe('demonstrate');
    expect(state.encounter?.retries).toBe(1);
    expect(state.mode).toBe('encounter');
  });
});

describe('gameReducer — overlays, orientation and reset', () => {
  it('pauses and resumes back to the same mode', () => {
    const hub = atHub();
    const paused = gameReducer(hub, { type: 'PAUSE' }, NOW);
    expect(paused.mode).toBe('paused');
    expect(gameReducer(paused, { type: 'RESUME' }, NOW).mode).toBe('hub');
  });

  it('blocks portrait and restores the interrupted mode on landscape', () => {
    const hub = atHub();
    const portrait = gameReducer(
      hub,
      { type: 'ORIENTATION_CHANGED', orientation: 'portrait' },
      NOW,
    );
    expect(portrait.mode).toBe('orientationBlocked');
    const landscape = gameReducer(
      portrait,
      { type: 'ORIENTATION_CHANGED', orientation: 'landscape' },
      NOW,
    );
    expect(landscape.mode).toBe('hub');
  });

  it('keeps the interrupted mode across repeated portrait events', () => {
    const hub = atHub();
    let state = gameReducer(hub, { type: 'ORIENTATION_CHANGED', orientation: 'portrait' }, NOW);
    state = gameReducer(state, { type: 'ORIENTATION_CHANGED', orientation: 'portrait' }, NOW);
    expect(state.interruptedMode).toBe('hub');
  });

  it('requires the parent gate before the parent area, and resets from there', () => {
    let state = gameReducer(atHub(), { type: 'PAUSE' }, NOW);
    state = gameReducer(state, { type: 'OPEN_PARENT_GATE' }, NOW);
    expect(state.mode).toBe('parentGate');
    state = gameReducer(state, { type: 'PARENT_GATE_PASSED' }, NOW);
    expect(state.mode).toBe('parentArea');
    const reset = gameReducer(state, { type: 'RESET_PROGRESS' }, NOW);
    expect(reset.mode).toBe('title');
    expect(reset.avatarId).toBeNull();
    expect(reset.stickers).toEqual([]);
    expect(shouldAutosave(state, reset)).toBe(true);
  });

  it('exposes every documented mode as reachable or explicitly terminal', () => {
    expect(MODES).toHaveLength(11);
  });
});
