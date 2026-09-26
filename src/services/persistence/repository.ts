import type { PersistedState, SaveHealth } from '../../domain/game/types.ts';

export type LoadResult =
  | { readonly status: 'empty' }
  | { readonly status: 'loaded'; readonly state: PersistedState }
  | { readonly status: 'migrated'; readonly state: PersistedState }
  /** Kept in memory for this session only, so the parent can decide to reset. */
  | { readonly status: 'corrupt'; readonly reason: string; readonly raw: unknown };

export interface SaveRepository {
  load(): Promise<LoadResult>;
  save(state: PersistedState): Promise<void>;
  clear(): Promise<void>;
}

export function healthFromLoadResult(result: LoadResult): SaveHealth {
  switch (result.status) {
    case 'empty':
      return 'fresh';
    case 'loaded':
      return 'loaded';
    case 'migrated':
      return 'migrated';
    case 'corrupt':
      return 'recovered';
  }
}

export function persistedFromLoadResult(result: LoadResult): PersistedState | null {
  return result.status === 'loaded' || result.status === 'migrated' ? result.state : null;
}
