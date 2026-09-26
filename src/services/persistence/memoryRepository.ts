import { parseSave } from '../../domain/game/save.ts';
import type { PersistedState } from '../../domain/game/types.ts';
import type { LoadResult, SaveRepository } from './repository.ts';

/**
 * In-memory repository used by tests and as the fallback when IndexedDB is
 * unavailable (private windows, evicted storage). Progress then lasts for the
 * session only, which the parent area states explicitly.
 */
export class MemorySaveRepository implements SaveRepository {
  private raw: unknown = undefined;

  constructor(
    seed?: unknown,
    private readonly clock: () => number = () => Date.now(),
  ) {
    this.raw = seed;
  }

  load(): Promise<LoadResult> {
    if (this.raw === undefined) return Promise.resolve({ status: 'empty' });
    const parsed = parseSave(this.raw, this.clock());
    if (!parsed.ok) {
      return Promise.resolve({ status: 'corrupt', reason: parsed.reason, raw: this.raw });
    }
    return Promise.resolve({
      status: parsed.migrated ? 'migrated' : 'loaded',
      state: parsed.state,
    });
  }

  save(state: PersistedState): Promise<void> {
    this.raw = JSON.parse(JSON.stringify(state)) as unknown;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.raw = undefined;
    return Promise.resolve();
  }

  /** Test helper: inspect what was written without going through `load`. */
  peek(): unknown {
    return this.raw;
  }
}
