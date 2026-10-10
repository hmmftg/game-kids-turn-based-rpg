/**
 * Generic persistence contract — scoped load/save with typed failure
 * reporting. Consumed by an application's own bootstrap/save coordinators;
 * the game runtime itself performs no persistence, so it owns no persistence
 * dependency. Profile/slot selection, save scheduling and the application's
 * state→persisted projection are never framework responsibilities.
 */

/** The application-selected scope for one save slot (e.g. a profile slot key). */
export interface SaveScope {
  readonly slotKey: string;
}

/**
 * Corruption never carries a payload: a `corrupt` result represents a save
 * that could not be read at all, so no `data` field exists that could let a
 * bad save masquerade as a valid hydrated state.
 */
export type LoadResult<P> =
  | { readonly kind: 'loaded'; readonly data: P }
  | { readonly kind: 'empty' }
  | { readonly kind: 'corrupt'; readonly reason?: string };

export type PersistenceFailure =
  | { readonly kind: 'corrupt'; readonly cause?: unknown }
  | { readonly kind: 'unavailable'; readonly cause?: unknown }
  | { readonly kind: 'quota'; readonly cause?: unknown };

export type StorageFallback =
  /** An in-memory store keeps the session playable but nothing persists. */
  { readonly kind: 'memory'; readonly authoritative: boolean } | { readonly kind: 'none' };

export interface PersistenceAdapter<P> {
  load(scope: SaveScope): Promise<LoadResult<P>>;
  save(data: P, scope: SaveScope): Promise<void>;
  /** Application-owned policy: what the session falls back to on a failure. */
  onFailure(kind: PersistenceFailure): StorageFallback;
}
