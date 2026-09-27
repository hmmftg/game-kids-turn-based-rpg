import type { AvatarId, PersistedState, SaveHealth } from '../../domain/game/types.ts';

/** The pre-profiles save key; kept so existing single-save data can migrate. */
export const LEGACY_SLOT_KEY = 'save';
const PROFILES_INDEX_KEY = 'profiles';
export { PROFILES_INDEX_KEY };

export function profileSlotKey(profileId: string): string {
  return `profile:${profileId}`;
}

/**
 * One kid's identity on this device. Lives in the `profiles` index; the actual
 * progress sits under `profileSlotKey(id)` as a regular `PersistedState`.
 */
export interface ProfileMeta {
  readonly id: string;
  /** Optional parent-entered display name; '' falls back to «بازیکن N». */
  readonly nameFa: string;
  readonly avatarId: AvatarId;
  /** Badge emoji the kid picked — their main way to recognise their card. */
  readonly badge: string;
  readonly createdAt: number;
  readonly lastPlayedAt: number;
  readonly stickerCount: number;
}

export function isProfileMeta(value: unknown): value is ProfileMeta {
  if (typeof value !== 'object' || value === null) return false;
  const meta = value as Record<string, unknown>;
  return (
    typeof meta['id'] === 'string' &&
    meta['id'].length > 0 &&
    typeof meta['avatarId'] === 'string' &&
    typeof meta['badge'] === 'string' &&
    meta['badge'].length > 0
  );
}

export function parseProfileIndex(raw: unknown): ProfileMeta[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const profiles: ProfileMeta[] = [];
  for (const entry of raw) {
    if (!isProfileMeta(entry) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    profiles.push({
      id: entry.id,
      nameFa: typeof entry.nameFa === 'string' ? entry.nameFa : '',
      avatarId: entry.avatarId,
      badge: entry.badge,
      createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : 0,
      lastPlayedAt: typeof entry.lastPlayedAt === 'number' ? entry.lastPlayedAt : 0,
      stickerCount: typeof entry.stickerCount === 'number' ? entry.stickerCount : 0,
    });
  }
  return profiles;
}

export type LoadResult =
  | { readonly status: 'empty' }
  | { readonly status: 'loaded'; readonly state: PersistedState }
  | { readonly status: 'migrated'; readonly state: PersistedState }
  /** Kept in memory for this session only, so the parent can decide to reset. */
  | { readonly status: 'corrupt'; readonly reason: string; readonly raw: unknown };

export interface SaveRepository {
  load(key?: string): Promise<LoadResult>;
  save(state: PersistedState, key?: string): Promise<void>;
  clear(key?: string): Promise<void>;
  listProfiles(): Promise<ProfileMeta[]>;
  writeProfiles(profiles: readonly ProfileMeta[]): Promise<void>;
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
