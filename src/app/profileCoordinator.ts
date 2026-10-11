import { createFreshPersistedState } from '../domain/game/initialState.ts';
import type { AvatarId, Command, GameState, HeadwearId, Mode } from '../domain/game/types.ts';
import { currentOrientation, detectQualityTier, detectWebgl } from '../framework/index.ts';
import { createSaveRepository } from '../services/persistence/indexedDbRepository.ts';
import { MemorySaveRepository } from '../services/persistence/memoryRepository.ts';
import {
  healthFromLoadResult,
  LEGACY_SLOT_KEY,
  persistedFromLoadResult,
  profileSlotKey,
  type ProfileMeta,
  type SaveRepository,
} from '../services/persistence/repository.ts';
import { pickProfileBadge } from '../ui/child/emoji.ts';

function newProfileId(): string {
  return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeProfile(
  avatarId: AvatarId,
  badge: string,
  headwear: HeadwearId,
  stickerCount: number,
  now: number,
): ProfileMeta {
  return {
    id: newProfileId(),
    nameFa: '',
    avatarId,
    badge,
    headwear,
    createdAt: now,
    lastPlayedAt: now,
    stickerCount,
  };
}

export interface ProfileCoordinatorOptions {
  /** Injected for tests; a real IndexedDB repository is created on boot otherwise. */
  readonly repository?: SaveRepository | undefined;
  readonly dispatch: (command: Command) => void;
  /** React binding hooks — the coordinator is usable without them in tests. */
  readonly onProfiles?: (profiles: readonly ProfileMeta[]) => void;
  readonly onActiveProfile?: (id: string | null) => void;
}

/**
 * Application bootstrap + profile coordinator. It owns everything the game
 * runtime deliberately does not: the save repository, the profile index,
 * legacy-save migration, active-profile/slot selection, and every profile
 * lifecycle command. All state transitions still go through the reducer —
 * the coordinator only decides WHEN to dispatch BOOT_LOADED/SELECT_PROFILE
 * and which persisted payload they carry.
 */
export class ProfileCoordinator {
  private repository: SaveRepository | null;
  private profiles: readonly ProfileMeta[] = [];
  private activeProfileId: string | null = null;
  private activeSlotKey: string | null = null;
  private cancelled = false;

  constructor(private readonly options: ProfileCoordinatorOptions) {
    this.repository = options.repository ?? null;
  }

  /** The repository actually in use — may be the memory fallback after boot. */
  get saveRepository(): SaveRepository | null {
    return this.repository;
  }

  get slotKey(): string | null {
    return this.activeSlotKey;
  }

  /** Async boot work checks this before dispatching (React unmount guard). */
  cancel(): void {
    this.cancelled = true;
  }

  private setProfiles(next: readonly ProfileMeta[]): void {
    this.profiles = next;
    this.options.onProfiles?.(next);
  }

  private writeProfileList(next: readonly ProfileMeta[]): void {
    this.setProfiles(next);
    void this.repository?.writeProfiles(next).catch(() => {
      /* storage may be evicted; the game stays playable */
    });
  }

  private setActiveProfile(id: string | null): void {
    this.activeProfileId = id;
    this.activeSlotKey = id === null ? null : profileSlotKey(id);
    this.options.onActiveProfile?.(id);
  }

  /**
   * Boot: capabilities first, then the profile index, so the reducer sees a
   * coherent world. A legacy single save is folded into a first profile; if
   * that write fails the session keeps using the legacy slot unchanged.
   */
  async boot(): Promise<void> {
    this.cancelled = false;
    const repo = this.repository ?? createSaveRepository();
    this.repository = repo;
    const { dispatch } = this.options;

    dispatch({ type: 'WEBGL_AVAILABILITY_CHANGED', available: detectWebgl() });
    dispatch({ type: 'ORIENTATION_CHANGED', orientation: currentOrientation() });

    // Boot once with the real repository; on a total storage failure
    // (private window, evicted/blocked IndexedDB) fall back to session-only
    // memory saves so the game still boots instead of dead-ending at
    // BOOT_FAILED. A second failure is a real defect → BOOT_FAILED.
    try {
      await this.bootWithProfiles(repo);
    } catch {
      if (this.cancelled || repo instanceof MemorySaveRepository) return;
      this.repository = new MemorySaveRepository();
      try {
        await this.bootWithProfiles(this.repository);
      } catch (error) {
        if (this.cancelled) return;
        dispatch({
          type: 'BOOT_FAILED',
          reason: error instanceof Error ? error.message : 'boot failed',
        });
      }
    }
  }

  private async bootWithProfiles(repository: SaveRepository): Promise<void> {
    const { dispatch } = this.options;
    try {
      let list = await repository.listProfiles();
      if (list.length === 0) {
        const legacy = await repository.load(LEGACY_SLOT_KEY);
        const persisted = persistedFromLoadResult(legacy);
        if (persisted !== null) {
          const meta = makeProfile(
            persisted.avatarId ?? 'avatar-aban',
            pickProfileBadge(list),
            'none',
            persisted.stickers.length,
            persisted.lastPlayedAt,
          );
          try {
            await repository.save(persisted, profileSlotKey(meta.id));
            await repository.writeProfiles([meta]);
            await repository.clear(LEGACY_SLOT_KEY);
            list = [meta];
          } catch {
            // Index write failed: run this session on the legacy slot.
            this.activeSlotKey = LEGACY_SLOT_KEY;
            if (!this.cancelled) {
              dispatch({
                type: 'BOOT_LOADED',
                persisted,
                health: healthFromLoadResult(legacy),
              });
            }
            return;
          }
        }
      }
      if (this.cancelled) return;
      if (list.length > 0) {
        this.setProfiles(list);
        dispatch({ type: 'BOOT_LOADED', persisted: null, health: 'fresh', hasProfiles: true });
        return;
      }
      // Truly fresh device (or unreadable legacy data): classic title flow.
      const legacy = await repository.load(LEGACY_SLOT_KEY);
      const persisted = persistedFromLoadResult(legacy);
      dispatch({
        type: 'BOOT_LOADED',
        persisted,
        health: healthFromLoadResult(legacy),
      });
      if (persisted === null) dispatch({ type: 'SET_QUALITY_TIER', tier: detectQualityTier() });
    } catch (error) {
      if (this.cancelled) return;
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /** Loads a profile slot and lands on its checkpoint. Picker mode only. */
  selectProfile(id: string, mode: Mode): void {
    const repo = this.repository;
    if (!repo || mode !== 'profileSelect') return;
    const { dispatch } = this.options;
    void repo
      .load(profileSlotKey(id))
      .then((result) => {
        this.setActiveProfile(id);
        dispatch({
          type: 'SELECT_PROFILE',
          persisted: persistedFromLoadResult(result),
          health: healthFromLoadResult(result),
        });
        // The index card carries the cosmetic pick; the save slot doesn't.
        const meta = this.profiles.find((entry) => entry.id === id);
        dispatch({ type: 'SET_HEADWEAR', headwear: meta?.headwear ?? 'none' });
        if (persistedFromLoadResult(result) === null) {
          dispatch({ type: 'SET_QUALITY_TIER', tier: detectQualityTier() });
        }
      })
      .catch(() => {
        dispatch({ type: 'FATAL_ERROR', reason: 'profile-load-failed' });
      });
  }

  /** Clears the in-memory player and opens avatar + headwear select. */
  startNewPlayer(): void {
    this.setActiveProfile(null);
    this.options.dispatch({ type: 'START_NEW_PLAYER' });
  }

  /** Creates (or updates) the profile tied to this avatar + headwear pick. */
  chooseAvatar(avatarId: AvatarId, headwear: HeadwearId): void {
    const existingId = this.activeProfileId;
    if (existingId === null) {
      const meta = makeProfile(avatarId, pickProfileBadge(this.profiles), headwear, 0, Date.now());
      this.setActiveProfile(meta.id);
      this.writeProfileList([...this.profiles, meta]);
    } else {
      this.writeProfileList(
        this.profiles.map((entry) =>
          entry.id === existingId ? { ...entry, avatarId, headwear } : entry,
        ),
      );
    }
    this.options.dispatch({ type: 'SET_HEADWEAR', headwear });
    this.options.dispatch({ type: 'SELECT_AVATAR', avatarId });
  }

  /** Wipes one profile's progress but keeps its card (avatar, badge, name). */
  resetProfile(id: string): void {
    const repo = this.repository;
    const meta = this.profiles.find((entry) => entry.id === id);
    if (!repo || !meta) return;
    const now = Date.now();
    this.writeProfileList(
      this.profiles.map((entry) =>
        entry.id === id ? { ...entry, stickerCount: 0, lastPlayedAt: now } : entry,
      ),
    );
    void repo
      .save({ ...createFreshPersistedState(now), avatarId: meta.avatarId }, profileSlotKey(id))
      .catch(() => {
        /* storage may be evicted */
      });
    if (this.activeProfileId === id) this.options.dispatch({ type: 'RESET_PROGRESS' });
  }

  /** Removes a profile card AND its save slot entirely — no undo. */
  deleteProfile(id: string): void {
    this.writeProfileList(this.profiles.filter((entry) => entry.id !== id));
    void this.repository?.clear(profileSlotKey(id)).catch(() => {
      /* storage may be evicted */
    });
    // Deleting the profile the child is playing drops back to the picker.
    if (this.activeProfileId === id) {
      this.setActiveProfile(null);
      this.options.dispatch({ type: 'RESET_PROGRESS' });
    }
  }

  renameProfile(id: string, nameFa: string): void {
    this.writeProfileList(
      this.profiles.map((entry) => (entry.id === id ? { ...entry, nameFa } : entry)),
    );
  }

  /** Full reset: clears the legacy and active slots, then restarts fresh. */
  resetProgress(): void {
    const repo = this.repository;
    const { dispatch } = this.options;
    if (!repo) {
      dispatch({ type: 'RESET_PROGRESS' });
      return;
    }
    const keys = [LEGACY_SLOT_KEY, this.activeSlotKey].filter((key): key is string => key !== null);
    // Clear first so the autosave triggered by the reset cannot race it.
    void Promise.all(keys.map((key) => repo.clear(key).catch(() => undefined))).finally(() =>
      dispatch({ type: 'RESET_PROGRESS' }),
    );
  }

  /**
   * Keeps a profile's picker card (sticker count, recency) in step with saves.
   * Called by the save coordinator after each successful write.
   */
  syncActiveProfileMeta(snapshot: GameState): void {
    const id = this.activeProfileId;
    if (id === null) return;
    const current = this.profiles;
    const meta = current.find((entry) => entry.id === id);
    if (
      !meta ||
      (meta.stickerCount === snapshot.stickers.length &&
        meta.lastPlayedAt === snapshot.lastPlayedAt)
    ) {
      return;
    }
    this.writeProfileList(
      current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              stickerCount: snapshot.stickers.length,
              lastPlayedAt: snapshot.lastPlayedAt,
            }
          : entry,
      ),
    );
  }
}
