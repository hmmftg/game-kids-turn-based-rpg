import { describe, expect, it } from 'vitest';
import { parseSave } from './save.ts';
import {
  createFreshPersistedState,
  SAVE_SCHEMA_VERSION,
  toPersistedState,
} from './initialState.ts';
import { createInitialState } from './initialState.ts';

const NOW = 1_700_000_000_000;

describe('save parsing and migration', () => {
  it('round-trips a current save', () => {
    const persisted = {
      ...createFreshPersistedState(NOW),
      avatarId: 'avatar-arta' as const,
      stickers: ['sticker-greeting' as const],
    };
    const result = parseSave(JSON.parse(JSON.stringify(persisted)), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migrated).toBe(false);
    expect(result.state).toEqual(persisted);
  });

  it('extracts only persistable fields from game state', () => {
    const state = createInitialState(NOW);
    const persisted = toPersistedState(state);
    expect(Object.keys(persisted).sort()).toEqual([
      'audio',
      'avatarId',
      'checkpoint',
      'lastPlayedAt',
      'qualityTier',
      'quests',
      'schemaVersion',
      'stickers',
    ]);
  });

  it('migrates a v1 save with a single mute flag into music/SFX buses', () => {
    const v1 = {
      version: 1,
      avatar: 'avatar-aban',
      completedQuests: ['quest-greeting'],
      stickers: ['sticker-greeting'],
      muted: true,
      lastPlayedAt: 42,
    };
    const result = parseSave(v1, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migrated).toBe(true);
    expect(result.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(result.state.avatarId).toBe('avatar-aban');
    expect(result.state.quests['quest-greeting'].status).toBe('completed');
    expect(result.state.quests['quest-helping'].status).toBe('locked');
    expect(result.state.audio.musicMuted).toBe(true);
    expect(result.state.audio.sfxMuted).toBe(true);
    expect(result.state.checkpoint.kind).toBe('hub');
  });

  it.each([
    ['null', null],
    ['a string', 'not-a-save'],
    ['an array', []],
    ['an object without a version', { avatarId: 'avatar-aban' }],
    ['a non-numeric version', { schemaVersion: 'two' }],
    ['a zero version', { schemaVersion: 0 }],
    ['a future version', { schemaVersion: SAVE_SCHEMA_VERSION + 1 }],
  ])('rejects %s safely', (_name, payload) => {
    const result = parseSave(payload, NOW);
    expect(result.ok).toBe(false);
  });

  it('repairs partially corrupt but versioned data instead of discarding it', () => {
    const result = parseSave(
      {
        schemaVersion: SAVE_SCHEMA_VERSION,
        avatarId: 'avatar-does-not-exist',
        quests: { 'quest-greeting': { status: 'nonsense', completedSteps: [1, 'greeting-1'] } },
        stickers: ['sticker-greeting', 7],
        audio: { musicVolume: 12, sfxMuted: 'yes' },
        qualityTier: 'ultra',
        checkpoint: { kind: 'mid-animation', questId: 'quest-unknown' },
      },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.avatarId).toBeNull();
    expect(result.state.quests['quest-greeting'].status).toBe('locked');
    expect(result.state.quests['quest-greeting'].completedSteps).toEqual(['greeting-1']);
    expect(result.state.stickers).toEqual(['sticker-greeting']);
    expect(result.state.audio.musicVolume).toBe(1);
    expect(result.state.audio.sfxMuted).toBe(false);
    expect(result.state.qualityTier).toBe('medium');
    expect(result.state.checkpoint).toEqual({ kind: 'title', questId: null, at: NOW });
  });
});
