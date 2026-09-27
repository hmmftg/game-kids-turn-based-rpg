import { parseSave } from '../../domain/game/save.ts';
import type { PersistedState } from '../../domain/game/types.ts';
import {
  LEGACY_SLOT_KEY,
  parseProfileIndex,
  PROFILES_INDEX_KEY,
  type LoadResult,
  type ProfileMeta,
  type SaveRepository,
} from './repository.ts';

/**
 * In-memory repository used by tests and as the fallback when IndexedDB is
 * unavailable (private windows, evicted storage). Progress then lasts for the
 * session only, which the parent area states explicitly.
 */
export class MemorySaveRepository implements SaveRepository {
  private readonly slots = new Map<string, unknown>();

  constructor(
    seed?: unknown,
    private readonly clock: () => number = () => Date.now(),
  ) {
    if (seed !== undefined) this.slots.set(LEGACY_SLOT_KEY, seed);
  }

  load(key: string = LEGACY_SLOT_KEY): Promise<LoadResult> {
    const raw = this.slots.get(key);
    if (raw === undefined) return Promise.resolve({ status: 'empty' });
    const parsed = parseSave(raw, this.clock());
    if (!parsed.ok) {
      return Promise.resolve({ status: 'corrupt', reason: parsed.reason, raw });
    }
    return Promise.resolve({
      status: parsed.migrated ? 'migrated' : 'loaded',
      state: parsed.state,
    });
  }

  save(state: PersistedState, key: string = LEGACY_SLOT_KEY): Promise<void> {
    this.slots.set(key, JSON.parse(JSON.stringify(state)));
    return Promise.resolve();
  }

  clear(key: string = LEGACY_SLOT_KEY): Promise<void> {
    this.slots.delete(key);
    return Promise.resolve();
  }

  listProfiles(): Promise<ProfileMeta[]> {
    return Promise.resolve(parseProfileIndex(this.slots.get(PROFILES_INDEX_KEY)));
  }

  writeProfiles(profiles: readonly ProfileMeta[]): Promise<void> {
    this.slots.set(PROFILES_INDEX_KEY, JSON.parse(JSON.stringify(profiles)));
    return Promise.resolve();
  }

  /** Test helper: inspect what was written without going through `load`. */
  peek(key: string = LEGACY_SLOT_KEY): unknown {
    return this.slots.get(key);
  }
}
