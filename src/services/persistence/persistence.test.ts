import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbSaveRepository } from './indexedDbRepository.ts';
import { MemorySaveRepository } from './memoryRepository.ts';
import { healthFromLoadResult, parseProfileIndex, persistedFromLoadResult } from './repository.ts';
import type { SaveRepository } from './repository.ts';
import { createFreshPersistedState } from '../../domain/game/initialState.ts';

const NOW = 1_700_000_000_000;

function sampleState() {
  return {
    ...createFreshPersistedState(NOW),
    avatarId: 'avatar-aban' as const,
    stickers: ['sticker-greeting' as const],
  };
}

function contracts(name: string, create: () => SaveRepository) {
  describe(`${name} repository contract`, () => {
    it('reports an empty store before the first save', async () => {
      const result = await create().load();
      expect(result.status).toBe('empty');
      expect(persistedFromLoadResult(result)).toBeNull();
      expect(healthFromLoadResult(result)).toBe('fresh');
    });

    it('persists and reloads only stable domain data', async () => {
      const repository = create();
      await repository.save(sampleState());
      const result = await repository.load();
      expect(result.status).toBe('loaded');
      expect(persistedFromLoadResult(result)).toEqual(sampleState());
    });

    it('clears progress on a gated reset', async () => {
      const repository = create();
      await repository.save(sampleState());
      await repository.clear();
      expect((await repository.load()).status).toBe('empty');
    });

    it('keeps profile slots fully isolated', async () => {
      const repository = create();
      await repository.save(sampleState(), 'profile:one');
      await repository.save({ ...sampleState(), avatarId: 'avatar-arta' }, 'profile:two');
      const one = await repository.load('profile:one');
      const two = await repository.load('profile:two');
      expect(persistedFromLoadResult(one)?.avatarId).toBe('avatar-aban');
      expect(persistedFromLoadResult(two)?.avatarId).toBe('avatar-arta');
      await repository.clear('profile:one');
      expect((await repository.load('profile:one')).status).toBe('empty');
      expect((await repository.load('profile:two')).status).toBe('loaded');
    });

    it('round-trips the profile index and ignores malformed entries', async () => {
      const repository = create();
      const profiles = [
        {
          id: 'profile-a',
          nameFa: 'سارا',
          avatarId: 'avatar-aban' as const,
          badge: '🐱',
          headwear: 'scarf' as const,
          createdAt: NOW,
          lastPlayedAt: NOW,
          stickerCount: 2,
        },
      ];
      expect(await repository.listProfiles()).toEqual([]);
      await repository.writeProfiles(profiles);
      expect(await repository.listProfiles()).toEqual(profiles);
    });

    it('defaults missing or unknown headwear on profile cards to none', () => {
      const parsed = parseProfileIndex([
        { id: 'a', avatarId: 'avatar-aban', badge: '🐱' },
        { id: 'b', avatarId: 'avatar-arta', badge: '🦊', headwear: 'chador' },
        { id: 'c', avatarId: 'avatar-arta', badge: '🐰', headwear: 'crown' },
      ]);
      expect(parsed.map((profile) => profile.headwear)).toEqual(['none', 'chador', 'none']);
    });
  });
}

beforeEach(async () => {
  const repository = new IndexedDbSaveRepository(() => NOW);
  await repository.clear();
  await repository.clear('profiles');
  await repository.clear('profile:one');
  await repository.clear('profile:two');
});

contracts('memory', () => new MemorySaveRepository(undefined, () => NOW));
contracts('IndexedDB', () => new IndexedDbSaveRepository(() => NOW));

describe('save health reporting', () => {
  it('reports a migrated save', async () => {
    const repository = new MemorySaveRepository({ version: 1, completedQuests: [] }, () => NOW);
    const result = await repository.load();
    expect(result.status).toBe('migrated');
    expect(healthFromLoadResult(result)).toBe('migrated');
  });

  it('keeps corrupt data in memory rather than throwing or deleting it', async () => {
    const corrupt = { schemaVersion: 'nope', avatarId: 'avatar-aban' };
    const repository = new MemorySaveRepository(corrupt, () => NOW);
    const result = await repository.load();
    expect(result.status).toBe('corrupt');
    if (result.status !== 'corrupt') return;
    expect(result.raw).toEqual(corrupt);
    expect(healthFromLoadResult(result)).toBe('recovered');
    expect(repository.peek()).toEqual(corrupt);
  });

  it('survives a corrupt IndexedDB payload', async () => {
    const repository = new IndexedDbSaveRepository(() => NOW);
    await repository.save({ nonsense: true } as never);
    const result = await repository.load();
    expect(result.status).toBe('corrupt');
  });
});

describe('IndexedDB repository resilience', () => {
  it('reconnects after a transient open failure instead of staying broken', async () => {
    const repository = new IndexedDbSaveRepository(() => NOW);
    const realOpen = indexedDB.open.bind(indexedDB);
    let shouldFail = true;
    const spy = vi.spyOn(indexedDB, 'open').mockImplementation(((
      name: string,
      version?: number,
    ) => {
      if (!shouldFail) return realOpen(name, version);
      const request = { error: new Error('transient-open') } as IDBOpenDBRequest;
      queueMicrotask(() => request.onerror?.(new Event('error')));
      return request;
    }) as typeof indexedDB.open);
    try {
      await expect(repository.load()).rejects.toThrow('transient-open');
      shouldFail = false;
      await expect(repository.load()).resolves.toMatchObject({ status: 'empty' });
    } finally {
      spy.mockRestore();
    }
  });
});
