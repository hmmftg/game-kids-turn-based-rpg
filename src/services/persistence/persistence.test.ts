import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDbSaveRepository } from './indexedDbRepository.ts';
import { MemorySaveRepository } from './memoryRepository.ts';
import { healthFromLoadResult, persistedFromLoadResult } from './repository.ts';
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
  });
}

beforeEach(async () => {
  await new IndexedDbSaveRepository(() => NOW).clear();
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
