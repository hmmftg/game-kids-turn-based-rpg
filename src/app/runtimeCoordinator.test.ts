import { describe, expect, it } from 'vitest';
import { createFreshPersistedState } from '../domain/game/initialState.ts';
import { gameReducer } from '../domain/game/reducer.ts';
import type { Command, GameState } from '../domain/game/types.ts';
import { MemorySaveRepository } from '../services/persistence/memoryRepository.ts';
import {
  LEGACY_SLOT_KEY,
  profileSlotKey,
  type ProfileMeta,
  type SaveRepository,
} from '../services/persistence/repository.ts';
import { createAppGameRuntime, gameRuntimeAdapter } from './gameRuntime.ts';
import { ProfileCoordinator } from './profileCoordinator.ts';
import { SaveCoordinator } from './saveCoordinator.ts';

const KID1: ProfileMeta = {
  id: 'profile-kid1',
  nameFa: '',
  avatarId: 'avatar-aban',
  badge: '🐱',
  createdAt: 1,
  lastPlayedAt: 1,
  stickerCount: 1,
};

function makeSession(repository?: SaveRepository) {
  const runtime = createAppGameRuntime();
  const commands: Command[] = [];
  const published: GameState[] = [];
  const profile = new ProfileCoordinator({
    repository,
    dispatch: (command) => {
      commands.push(command);
      runtime.dispatch(command);
    },
  });
  const save = new SaveCoordinator({
    repository: () => profile.saveRepository,
    activeSlotKey: () => profile.slotKey,
    syncActiveProfileMeta: (snapshot) => profile.syncActiveProfileMeta(snapshot),
  });
  runtime.subscribe((state) => {
    published.push(state);
    save.handleState(state);
  });
  return { runtime, profile, save, commands, published };
}

/** A repository whose listProfiles always rejects — the IndexedDB-down case. */
function failingRepository(): SaveRepository {
  return {
    load: () => Promise.reject(new Error('blocked')),
    save: () => Promise.reject(new Error('blocked')),
    clear: () => Promise.reject(new Error('blocked')),
    listProfiles: () => Promise.reject(new Error('blocked')),
    writeProfiles: () => Promise.reject(new Error('blocked')),
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe('game runtime (state machine only — no persistence)', () => {
  it('seeds the store with the game boot state and publishes a first snapshot', () => {
    const runtime = createAppGameRuntime();
    expect(runtime.getState().mode).toBe('boot');
    const seen: GameState[] = [];
    runtime.subscribe((state) => seen.push(state));
    runtime.dispatch({ type: 'ORIENTATION_CHANGED', orientation: 'portrait' });
    expect(seen.map((state) => state.mode)).toEqual(['boot']);
    expect(runtime.getState().orientation).toBe('portrait');
  });

  it('dispatches through the injected clock: transitions identical to direct reducer calls', () => {
    const fixed = 1_700_000_000_000;
    const runtime = createAppGameRuntime({ clock: () => fixed });
    const boot = runtime.getState();
    const commands: Command[] = [
      { type: 'ORIENTATION_CHANGED', orientation: 'portrait' },
      { type: 'SET_QUALITY_TIER', tier: 'low' },
      { type: 'SET_AUDIO_SETTINGS', audio: { musicMuted: true } },
    ];
    let expected = boot;
    for (const command of commands) {
      runtime.dispatch(command);
      expected = gameReducer(expected, command, fixed);
      expect(runtime.getState()).toEqual(expected);
    }
    // `now` propagates through ReducerContext on every dispatch.
    expect(runtime.getState().lastPlayedAt).toBe(fixed);
  });

  it('returns the identical object reference for inapplicable commands', () => {
    const runtime = createAppGameRuntime();
    const before = runtime.getState();
    runtime.dispatch({ type: 'START_BATTLE', definition: {} as never });
    expect(runtime.getState()).toBe(before);
  });

  it('pause suspends listeners while state advances; resume flushes once; dispose ends it', () => {
    const runtime = createAppGameRuntime();
    const seen: string[] = [];
    runtime.subscribe((state) => seen.push(state.orientation));
    runtime.pause();
    runtime.dispatch({ type: 'ORIENTATION_CHANGED', orientation: 'portrait' });
    expect(runtime.getState().orientation).toBe('portrait');
    expect(seen).toEqual([]);
    runtime.resume();
    expect(seen).toEqual(['portrait']);
    runtime.dispose();
    runtime.dispatch({ type: 'ORIENTATION_CHANGED', orientation: 'landscape' });
    expect(seen).toEqual(['portrait']);
  });

  it('adapter carries no persistence surface — only createInitialState and reducer', () => {
    expect(Object.keys(gameRuntimeAdapter).sort()).toEqual(['createInitialState', 'reducer']);
  });
});

describe('bootstrap coordinator — hydration order', () => {
  it('boots: boot state → index load → BOOT_LOADED → SELECT_PROFILE → published', async () => {
    const repository = new MemorySaveRepository();
    await repository.writeProfiles([KID1]);
    await repository.save(
      { ...createFreshPersistedState(1), stickers: ['sticker-greeting'] },
      profileSlotKey(KID1.id),
    );
    const { runtime, profile, commands, published } = makeSession(repository);

    // 1. The runtime's initial snapshot is the boot state, before any load.
    expect(runtime.getState().mode).toBe('boot');
    expect(published).toEqual([]);

    // 2-3. The coordinator loads the index, then dispatches BOOT_LOADED.
    await profile.boot();
    const bootIndex = commands.findIndex((c) => c.type === 'BOOT_LOADED');
    expect(bootIndex).toBeGreaterThan(-1);
    expect(runtime.getState().mode).toBe('profileSelect');

    // 4. Selecting a profile loads its slot, then dispatches SELECT_PROFILE.
    profile.selectProfile(KID1.id, runtime.getState().mode);
    await flushMicrotasks();
    expect(commands.map((c) => c.type)).toContain('SELECT_PROFILE');
    expect(runtime.getState().stickers).toEqual(['sticker-greeting']);

    // 5. Every transition reached subscribers through the runtime.
    expect(published[published.length - 1]).toBe(runtime.getState());
    expect(published.some((state) => state.mode === 'profileSelect')).toBe(true);
  });

  it('folds a legacy single save into a first profile: slot → index → clear → BOOT_LOADED', async () => {
    const repository = new MemorySaveRepository({
      ...createFreshPersistedState(7),
      stickers: ['sticker-greeting'],
    });
    const order: string[] = [];
    const spying: SaveRepository = {
      load: (key) => {
        order.push(`load:${key}`);
        return repository.load(key);
      },
      save: (state, key) => {
        order.push(`save:${key}`);
        return repository.save(state, key);
      },
      clear: (key) => {
        order.push(`clear:${key}`);
        return repository.clear(key);
      },
      listProfiles: () => {
        order.push('listProfiles');
        return repository.listProfiles();
      },
      writeProfiles: (profiles) => {
        order.push('writeProfiles');
        return repository.writeProfiles(profiles);
      },
    };
    const { profile, commands } = makeSession(spying);
    await profile.boot();

    expect(order[0]).toBe('listProfiles');
    expect(order).toContain(`load:${LEGACY_SLOT_KEY}`);
    const savedSlot = order.find((entry) => entry.startsWith('save:profile:'));
    expect(savedSlot).toBeDefined();
    expect(order.indexOf(savedSlot!)).toBeLessThan(order.indexOf('writeProfiles'));
    expect(order.indexOf('writeProfiles')).toBeLessThan(order.indexOf(`clear:${LEGACY_SLOT_KEY}`));
    expect(commands.map((c) => c.type)).toEqual([
      'WEBGL_AVAILABILITY_CHANGED',
      'ORIENTATION_CHANGED',
      'BOOT_LOADED',
    ]);
    expect(repository.peek(LEGACY_SLOT_KEY)).toBeUndefined();
  });

  it('falls back to the memory repository when IndexedDB fails, and still boots', async () => {
    const { runtime, profile, commands } = makeSession(failingRepository());
    await profile.boot();
    expect(profile.saveRepository).toBeInstanceOf(MemorySaveRepository);
    expect(commands.map((c) => c.type)).toContain('BOOT_LOADED');
    expect(runtime.getState().mode).toBe('title');
  });

  it('a cancelled session never lets async loads dispatch into a dead session', async () => {
    const repository = new MemorySaveRepository();
    await repository.writeProfiles([KID1]);
    const commands: Command[] = [];
    const runtime = createAppGameRuntime();
    const profile = new ProfileCoordinator({
      repository,
      dispatch: (command) => {
        commands.push(command);
        runtime.dispatch(command);
      },
    });
    const boot = profile.boot();
    profile.cancel();
    await boot;
    // Capability commands dispatch synchronously before any await; nothing
    // after the first async load may escape a cancelled session.
    expect(commands.map((c) => c.type)).not.toContain('BOOT_LOADED');
    expect(commands.map((c) => c.type)).not.toContain('BOOT_FAILED');
    expect(runtime.getState().mode).toBe('boot');
  });
});

describe('save coordinator — eligibility policy', () => {
  it('autosaves to the active slot on a stable-mode token bump, not mid-encounter', async () => {
    const repository = new MemorySaveRepository();
    const { runtime, profile } = makeSession(repository);
    await profile.boot();
    profile.startNewPlayer();
    profile.chooseAvatar('avatar-aban', 'none');
    await flushMicrotasks();
    const [meta] = await repository.listProfiles();
    expect(meta).toBeDefined();

    // A stable-mode command that bumps lastPlayedAt/autosaveToken.
    runtime.dispatch({ type: 'DISCOVER', discoveryId: 'discovery-cave-entrance' });
    await flushMicrotasks();
    const saved = repository.peek(profileSlotKey(meta!.id));
    expect(saved).toMatchObject({ discoveries: ['discovery-cave-entrance'] });
  });

  it('flushes audio/quality changes even without a token bump', async () => {
    const repository = new MemorySaveRepository();
    const { runtime, profile } = makeSession(repository);
    await profile.boot();
    profile.startNewPlayer();
    profile.chooseAvatar('avatar-aban', 'none');
    await flushMicrotasks();
    const [meta] = await repository.listProfiles();

    runtime.dispatch({ type: 'SET_AUDIO_SETTINGS', audio: { musicMuted: true } });
    await flushMicrotasks();
    expect(repository.peek(profileSlotKey(meta!.id))).toMatchObject({
      audio: { musicMuted: true },
    });
  });

  it('never overwrites a recovered-corrupt save before a gated reset', async () => {
    const corrupt = { schemaVersion: 'nope', avatarId: 'avatar-aban' };
    const repository = new MemorySaveRepository(corrupt);
    const { runtime, profile } = makeSession(repository);
    await profile.boot();
    expect(runtime.getState().saveHealth).toBe('recovered');
    runtime.dispatch({ type: 'START_PRESSED' });
    runtime.dispatch({ type: 'SET_AUDIO_SETTINGS', audio: { musicMuted: true } });
    await flushMicrotasks();
    expect(repository.peek(LEGACY_SLOT_KEY)).toEqual(corrupt);
  });
});

describe('reload resume', () => {
  it('a second session boots the same repository and resumes the saved profile', async () => {
    const repository = new MemorySaveRepository();
    const first = makeSession(repository);
    await first.profile.boot();
    first.profile.startNewPlayer();
    first.profile.chooseAvatar('avatar-aban', 'kolah');
    first.runtime.dispatch({ type: 'DISCOVER', discoveryId: 'discovery-cave-entrance' });
    await flushMicrotasks();
    const [meta] = await repository.listProfiles();
    expect(meta).toBeDefined();

    // Simulate a reload: fresh runtime + coordinators over the same storage.
    const second = makeSession(repository);
    expect(second.runtime.getState().mode).toBe('boot');
    await second.profile.boot();
    expect(second.runtime.getState().mode).toBe('profileSelect');
    second.profile.selectProfile(meta!.id, second.runtime.getState().mode);
    await flushMicrotasks();
    expect(second.runtime.getState().mode).toBe('hub');
    expect(second.runtime.getState().headwear).toBe('kolah');
  });

  it('profile select → switch-back → re-select keeps each profile separate', async () => {
    const repository = new MemorySaveRepository();
    await repository.writeProfiles([KID1, { ...KID1, id: 'profile-kid2', badge: '🦊' }]);
    await repository.save(
      { ...createFreshPersistedState(1), stickers: ['sticker-greeting'] },
      profileSlotKey(KID1.id),
    );
    const { runtime, profile } = makeSession(repository);
    await profile.boot();

    profile.selectProfile(KID1.id, runtime.getState().mode);
    await flushMicrotasks();
    expect(runtime.getState().stickers).toEqual(['sticker-greeting']);

    runtime.dispatch({ type: 'PAUSE' });
    runtime.dispatch({ type: 'SWITCH_PLAYER' });
    expect(runtime.getState().mode).toBe('profileSelect');

    // Kid2's slot is empty: SELECT_PROFILE lands on the title screen, and the
    // fresh-start command is what resets progress — never the slot load itself.
    profile.selectProfile('profile-kid2', runtime.getState().mode);
    await flushMicrotasks();
    expect(runtime.getState().mode).toBe('title');
    profile.startNewPlayer();
    expect(runtime.getState().stickers).toEqual([]);
  });
});
