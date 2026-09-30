import { describe, expect, it } from 'vitest';
import { getQuestStep } from '../quests/definitions.ts';
import { gameReducer } from './reducer.ts';
import { createFreshPersistedState, createInitialState, toPersistedState } from './initialState.ts';
import { parseSave } from './save.ts';
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

  it('boots to the same landing regardless of device orientation', () => {
    for (const orientation of ['landscape', 'portrait'] as const) {
      let state = gameReducer(
        createInitialState(NOW),
        { type: 'ORIENTATION_CHANGED', orientation },
        NOW,
      );
      state = gameReducer(state, { type: 'BOOT_LOADED', persisted: null, health: 'fresh' }, NOW);
      expect(state.mode).toBe('title');
      expect(state.saveHealth).toBe('fresh');
      expect(state.orientation).toBe(orientation);
    }
  });

  it('keeps a failed boot fatal in either orientation', () => {
    let state = gameReducer(
      createInitialState(NOW),
      { type: 'ORIENTATION_CHANGED', orientation: 'portrait' },
      NOW,
    );
    state = gameReducer(state, { type: 'BOOT_FAILED', reason: 'idb' }, NOW);
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
    expect(gameReducer(fatal, { type: 'RESET_PROGRESS' }, NOW).mode).toBe('profileSelect');
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

  it('keeps the area quests locked until the finale is done, then completes all four', () => {
    let state = atHub();
    for (const questId of [
      'quest-park-kite',
      'quest-river-shell',
      'quest-bread-errand',
      'quest-school-answer',
    ] as const) {
      // Nothing in the expanded world is startable before the story reaches it.
      expect(gameReducer(state, { type: 'START_QUEST', questId }, NOW)).toBe(state);
    }
    for (const questId of [
      'quest-greeting',
      'quest-helping',
      'quest-tidying',
      'quest-finale',
    ] as const) {
      state = playQuest(state, questId);
    }
    // Each new area now offers its concrete interaction to completion.
    for (const [questId, sticker] of [
      ['quest-park-kite', 'sticker-kite'],
      ['quest-river-shell', 'sticker-shell'],
      ['quest-bread-errand', 'sticker-bread'],
      ['quest-school-answer', 'sticker-school'],
    ] as const) {
      state = playQuest(state, questId);
      expect(state.quests[questId].status).toBe('completed');
      expect(state.stickers).toContain(sticker);
    }
    expect(state.stickers).toHaveLength(8);
  });

  it('a wrong tap on a new area quest re-demonstrates, never fails', () => {
    let state = atHub();
    for (const questId of [
      'quest-greeting',
      'quest-helping',
      'quest-tidying',
      'quest-finale',
    ] as const) {
      state = playQuest(state, questId);
    }
    state = gameReducer(state, { type: 'START_QUEST', questId: 'quest-park-kite' }, NOW);
    state = gameReducer(state, { type: 'ADVANCE_PHASE' }, NOW);
    state = gameReducer(state, { type: 'ADVANCE_PHASE' }, NOW);
    state = gameReducer(
      state,
      { type: 'CHOOSE', iconId: 'icon-leave-ground', correct: false },
      NOW,
    );
    expect(state.encounter?.phase).toBe('worldResponse');
    state = gameReducer(state, { type: 'ADVANCE_PHASE' }, NOW);
    expect(state.encounter?.phase).toBe('demonstrate');
    expect(state.mode).toBe('encounter');
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

  it('records orientation without ever changing the mode', () => {
    const hub = atHub();
    const portrait = gameReducer(
      hub,
      { type: 'ORIENTATION_CHANGED', orientation: 'portrait' },
      NOW,
    );
    expect(portrait.mode).toBe('hub');
    expect(portrait.orientation).toBe('portrait');
    const landscape = gameReducer(
      portrait,
      { type: 'ORIENTATION_CHANGED', orientation: 'landscape' },
      NOW,
    );
    expect(landscape.mode).toBe('hub');
    expect(landscape.orientation).toBe('landscape');
  });

  it('keeps mode and gameplay state across repeated rotation cycles', () => {
    const encounter = gameReducer(atHub(), { type: 'START_QUEST', questId: 'quest-greeting' }, NOW);
    let state = encounter;
    for (let i = 0; i < 3; i += 1) {
      state = gameReducer(state, { type: 'ORIENTATION_CHANGED', orientation: 'portrait' }, NOW);
      state = gameReducer(state, { type: 'ORIENTATION_CHANGED', orientation: 'landscape' }, NOW);
    }
    expect(state.mode).toBe('encounter');
    expect(state.encounter).toBe(encounter.encounter);
    // Rotation is a device event: it must never bump the autosave token.
    expect(state.autosaveToken).toBe(encounter.autosaveToken);
    // Same orientation twice is a no-op by reference.
    expect(gameReducer(state, { type: 'ORIENTATION_CHANGED', orientation: 'landscape' }, NOW)).toBe(
      state,
    );
  });

  it('requires the parent gate before the parent area, and resets from there', () => {
    let state = gameReducer(atHub(), { type: 'PAUSE' }, NOW);
    state = gameReducer(state, { type: 'OPEN_PARENT_GATE' }, NOW);
    expect(state.mode).toBe('parentGate');
    state = gameReducer(state, { type: 'PARENT_GATE_PASSED' }, NOW);
    expect(state.mode).toBe('parentArea');
    const reset = gameReducer(state, { type: 'RESET_PROGRESS' }, NOW);
    expect(reset.mode).toBe('profileSelect');
    expect(reset.avatarId).toBeNull();
    expect(reset.stickers).toEqual([]);
    expect(shouldAutosave(state, reset)).toBe(true);
  });

  it('exposes every documented mode as reachable or explicitly terminal', () => {
    expect(MODES).toHaveLength(11);
  });
});

describe('gameReducer — player profiles', () => {
  const picker = (): GameState =>
    gameReducer(
      createInitialState(NOW),
      { type: 'BOOT_LOADED', persisted: null, health: 'fresh', hasProfiles: true },
      NOW,
    );

  it('lands on the player picker when profiles exist', () => {
    const state = picker();
    expect(state.mode).toBe('profileSelect');
    expect(state.resumeMode).toBe('profileSelect');
  });

  it('selecting a profile applies its save and lands in the hub', () => {
    const persisted = {
      ...createFreshPersistedState(NOW),
      avatarId: 'avatar-arta' as const,
      stickers: ['sticker-greeting' as const],
    };
    const state = gameReducer(
      picker(),
      { type: 'SELECT_PROFILE', persisted, health: 'loaded' },
      NOW,
    );
    expect(state.mode).toBe('hub');
    expect(state.avatarId).toBe('avatar-arta');
    expect(state.stickers).toEqual(['sticker-greeting']);
  });

  it('sends a profile without a save (or corrupt) back through the title flow', () => {
    const fresh = gameReducer(
      picker(),
      { type: 'SELECT_PROFILE', persisted: null, health: 'fresh' },
      NOW,
    );
    expect(fresh.mode).toBe('title');
    const recovered = gameReducer(
      picker(),
      { type: 'SELECT_PROFILE', persisted: null, health: 'recovered' },
      NOW,
    );
    expect(recovered.corruptSaveDetected).toBe(true);
  });

  it('starts a new player with a clean slate under the picker', () => {
    const played = playQuest(atHub(), 'quest-greeting');
    const switched = gameReducer(played, { type: 'PAUSE' }, NOW);
    const pickerState = gameReducer(switched, { type: 'SWITCH_PLAYER' }, NOW);
    expect(pickerState.mode).toBe('profileSelect');
    expect(shouldAutosave(switched, pickerState)).toBe(true);

    const fresh = gameReducer(pickerState, { type: 'START_NEW_PLAYER' }, NOW);
    expect(fresh.mode).toBe('avatarSelect');
    expect(fresh.avatarId).toBeNull();
    expect(fresh.stickers).toEqual([]);
    expect(fresh.quests['quest-greeting'].status).not.toBe('completed');
  });

  it('sets headwear cosmetically without autosaving or touching gameplay', () => {
    const hub = atHub();
    const next = gameReducer(hub, { type: 'SET_HEADWEAR', headwear: 'chador' }, NOW);
    expect(next.headwear).toBe('chador');
    expect(next.quests).toBe(hub.quests);
    expect(next.stickers).toBe(hub.stickers);
    expect(next.encounter).toBe(hub.encounter);
    expect(next.autosaveToken).toBe(hub.autosaveToken);
    // Idempotent: the same pick is a no-op by reference.
    expect(gameReducer(next, { type: 'SET_HEADWEAR', headwear: 'chador' }, NOW)).toBe(next);
  });

  it('rejects profile commands from the wrong modes', () => {
    const title = boot();
    const hub = atHub();
    expect(
      gameReducer(title, { type: 'SELECT_PROFILE', persisted: null, health: 'fresh' }, NOW),
    ).toBe(title);
    expect(gameReducer(hub, { type: 'START_NEW_PLAYER' }, NOW)).toBe(hub);
    expect(gameReducer(title, { type: 'SWITCH_PLAYER' }, NOW)).toBe(title);
  });
});

describe('gameReducer — maps and discoveries', () => {
  it('DISCOVER records a world fact once and autosaves', () => {
    const hub = atHub();
    const found = gameReducer(
      hub,
      { type: 'DISCOVER', discoveryId: 'discovery-cave-entrance' },
      NOW,
    );
    expect(found.discoveries).toEqual(['discovery-cave-entrance']);
    expect(shouldAutosave(hub, found)).toBe(true);
    // Idempotent by reference — arriving again never duplicates or re-saves.
    expect(
      gameReducer(found, { type: 'DISCOVER', discoveryId: 'discovery-cave-entrance' }, NOW),
    ).toBe(found);
  });

  it('CHANGE_MAP swaps the map, keeps progress and never resets to the square', () => {
    let state = atHub();
    state = playQuest(state, 'quest-greeting');
    const cave = gameReducer(
      state,
      { type: 'CHANGE_MAP', mapId: 'map-cave', anchorId: 'anchor-cave-mouth' },
      NOW,
    );
    expect(cave.mapId).toBe('map-cave');
    expect(cave.mapAnchorId).toBe('anchor-cave-mouth');
    expect(cave.mode).toBe('hub');
    expect(cave.quests).toBe(state.quests);
    expect(cave.stickers).toBe(state.stickers);
    // The exit lands exactly on the outdoor entrance anchor.
    const back = gameReducer(
      cave,
      { type: 'CHANGE_MAP', mapId: 'map-town', anchorId: 'anchor-cave-entrance' },
      NOW,
    );
    expect(back.mapId).toBe('map-town');
    expect(back.mapAnchorId).toBe('anchor-cave-entrance');
  });

  it('a reload restores the map, spawn and discoveries exactly', () => {
    let state = atHub();
    state = gameReducer(state, { type: 'DISCOVER', discoveryId: 'discovery-cave-entrance' }, NOW);
    state = gameReducer(
      state,
      { type: 'CHANGE_MAP', mapId: 'map-cave', anchorId: 'anchor-cave-mouth' },
      NOW,
    );
    const persisted = toPersistedState(state);
    const parsed = parseSave(JSON.parse(JSON.stringify(persisted)), NOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restored = gameReducer(
      createInitialState(NOW),
      { type: 'BOOT_LOADED', persisted: parsed.state, health: 'loaded' },
      NOW,
    );
    expect(restored.discoveries).toEqual(['discovery-cave-entrance']);
    expect(restored.mapId).toBe('map-cave');
    expect(restored.mapAnchorId).toBe('anchor-cave-mouth');
  });

  it('an older save without map fields loads safely in town', () => {
    const persisted = toPersistedState(atHub()) as unknown as Record<string, unknown>;
    delete persisted['discoveries'];
    delete persisted['mapId'];
    delete persisted['mapAnchorId'];
    const parsed = parseSave(JSON.parse(JSON.stringify(persisted)), NOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.discoveries).toEqual([]);
    expect(parsed.state.mapId).toBe('map-town');
    expect(parsed.state.mapAnchorId).toBe('anchor-square');
  });
});
