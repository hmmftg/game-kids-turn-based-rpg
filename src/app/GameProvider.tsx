import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { isStableMode } from '../domain/game/checkpoints.ts';
import {
  createFreshPersistedState,
  createInitialState,
  toPersistedState,
} from '../domain/game/initialState.ts';
import { gameReducer } from '../domain/game/reducer.ts';
import type { AvatarId, Command, GameState, HeadwearId } from '../domain/game/types.ts';
import { audioService } from '../services/audio/audioService.ts';
import {
  currentOrientation,
  detectQualityTier,
  detectWebgl,
} from '../services/device/capabilities.ts';
import { createSaveRepository } from '../services/persistence/indexedDbRepository.ts';
import {
  healthFromLoadResult,
  LEGACY_SLOT_KEY,
  persistedFromLoadResult,
  profileSlotKey,
  type ProfileMeta,
  type SaveRepository,
} from '../services/persistence/repository.ts';
import { registerServiceWorker, type CacheStatus } from '../services/pwa/serviceWorker.ts';
import { listenForInstallPrompt } from '../services/pwa/installPrompt.ts';
import { pickProfileBadge } from '../ui/child/emoji.ts';
import { GameContext, type GameShell } from './gameContext.ts';

function reduce(state: GameState, command: Command): GameState {
  return gameReducer(state, command, Date.now());
}

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

export function GameProvider({
  children,
  repository,
}: {
  readonly children: ReactNode;
  readonly repository?: SaveRepository;
}) {
  const [state, dispatch] = useReducer(reduce, undefined, () => createInitialState(Date.now()));
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>(() =>
    import.meta.env.DEV ? 'unsupported' : 'caching',
  );
  const [updateReady, setUpdateReady] = useState(false);
  const [installReady, setInstallReady] = useState(false);
  const installPromptRef = useRef<(() => void) | null>(null);
  const [profiles, setProfiles] = useState<readonly ProfileMeta[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const repositoryRef = useRef<SaveRepository | null>(repository ?? null);
  const previousRef = useRef<GameState>(state);
  const lastSavedTokenRef = useRef(state.autosaveToken);
  const updateRef = useRef<() => void>(() => {});
  const profilesRef = useRef<readonly ProfileMeta[]>(profiles);
  const activeSlotKeyRef = useRef<string | null>(null);
  const activeProfileIdRef = useRef<string | null>(null);

  const setProfileList = useCallback((next: readonly ProfileMeta[]) => {
    profilesRef.current = next;
    setProfiles(next);
  }, []);

  const writeProfileList = useCallback(
    (next: readonly ProfileMeta[]) => {
      setProfileList(next);
      void repositoryRef.current?.writeProfiles(next).catch(() => {
        /* storage may be evicted; the game stays playable */
      });
    },
    [setProfileList],
  );

  const setActiveProfile = useCallback((id: string | null) => {
    activeProfileIdRef.current = id;
    activeSlotKeyRef.current = id === null ? null : profileSlotKey(id);
    setActiveProfileId(id);
  }, []);

  // Boot: capabilities first, then the profile index, so the reducer sees a
  // coherent world. A legacy single save is folded into a first profile; if
  // that write fails the session keeps using the legacy slot unchanged.
  useEffect(() => {
    let cancelled = false;
    const repo = repositoryRef.current ?? createSaveRepository();
    repositoryRef.current = repo;

    dispatch({ type: 'WEBGL_AVAILABILITY_CHANGED', available: detectWebgl() });
    dispatch({ type: 'ORIENTATION_CHANGED', orientation: currentOrientation() });

    void (async () => {
      try {
        let list = await repo.listProfiles();
        if (list.length === 0) {
          const legacy = await repo.load(LEGACY_SLOT_KEY);
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
              await repo.save(persisted, profileSlotKey(meta.id));
              await repo.writeProfiles([meta]);
              await repo.clear(LEGACY_SLOT_KEY);
              list = [meta];
            } catch {
              // Index write failed: run this session on the legacy slot.
              activeSlotKeyRef.current = LEGACY_SLOT_KEY;
              if (!cancelled) {
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
        if (cancelled) return;
        if (list.length > 0) {
          profilesRef.current = list;
          setProfiles(list);
          dispatch({ type: 'BOOT_LOADED', persisted: null, health: 'fresh', hasProfiles: true });
          return;
        }
        // Truly fresh device (or unreadable legacy data): classic title flow.
        const legacy = await repo.load(LEGACY_SLOT_KEY);
        const persisted = persistedFromLoadResult(legacy);
        dispatch({
          type: 'BOOT_LOADED',
          persisted,
          health: healthFromLoadResult(legacy),
        });
        if (persisted === null) dispatch({ type: 'SET_QUALITY_TIER', tier: detectQualityTier() });
      } catch (error) {
        if (cancelled) return;
        dispatch({
          type: 'BOOT_FAILED',
          reason: error instanceof Error ? error.message : 'boot failed',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Keeps a profile's picker card (sticker count, recency) in step with saves.
  const syncActiveProfileMeta = useCallback(
    (snapshot: GameState) => {
      const id = activeProfileIdRef.current;
      if (id === null) return;
      const current = profilesRef.current;
      const meta = current.find((entry) => entry.id === id);
      if (
        !meta ||
        (meta.stickerCount === snapshot.stickers.length &&
          meta.lastPlayedAt === snapshot.lastPlayedAt)
      ) {
        return;
      }
      writeProfileList(
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
    },
    [writeProfileList],
  );

  // Autosave once the game is back in a stable mode (never mid-encounter).
  // A token bump under an overlay stays pending until then, and audio/quality
  // changes always flush so pause-menu settings survive a reload. A corrupt or
  // newer-version save is never overwritten; the gated reset writes fresh data.
  // Writes go to the active profile's slot — none until a player is picked.
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = state;
    if (state.saveHealth === 'recovered') return;
    const settingsChanged =
      previous.audio !== state.audio || previous.qualityTier !== state.qualityTier;
    const stableSaveDue =
      isStableMode(state.mode) && state.autosaveToken !== lastSavedTokenRef.current;
    if (!settingsChanged && !stableSaveDue) return;
    const key = activeSlotKeyRef.current;
    if (key === null) return; // no player yet: the first real save flushes later
    lastSavedTokenRef.current = state.autosaveToken;
    void repositoryRef.current
      ?.save(toPersistedState(state), key)
      .then(() => syncActiveProfileMeta(state))
      .catch(() => {
        /* storage may be evicted; the game stays playable */
      });
  }, [state, syncActiveProfileMeta]);

  useEffect(() => {
    audioService.applySettings(state.audio);
  }, [state.audio]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () =>
      dispatch({ type: 'ORIENTATION_CHANGED', orientation: currentOrientation() });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      void audioService.setSuspended(document.hidden);
      if (document.hidden) dispatch({ type: 'PAUSE' });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    const handle = registerServiceWorker({
      onCacheStatus: setCacheStatus,
      onUpdateReady: () => setUpdateReady(true),
    });
    updateRef.current = handle.update;
    return handle.dispose;
  }, []);

  useEffect(() => {
    const handle = listenForInstallPrompt(setInstallReady);
    installPromptRef.current = handle.prompt;
    return handle.dispose;
  }, []);

  const selectProfile = useCallback(
    (id: string) => {
      const repo = repositoryRef.current;
      if (!repo || state.mode !== 'profileSelect') return;
      const key = profileSlotKey(id);
      void repo
        .load(key)
        .then((result) => {
          setActiveProfile(id);
          dispatch({
            type: 'SELECT_PROFILE',
            persisted: persistedFromLoadResult(result),
            health: healthFromLoadResult(result),
          });
          // The index card carries the cosmetic pick; the save slot doesn't.
          const meta = profilesRef.current.find((entry) => entry.id === id);
          dispatch({ type: 'SET_HEADWEAR', headwear: meta?.headwear ?? 'none' });
          if (persistedFromLoadResult(result) === null) {
            dispatch({ type: 'SET_QUALITY_TIER', tier: detectQualityTier() });
          }
        })
        .catch(() => {
          dispatch({ type: 'FATAL_ERROR', reason: 'profile-load-failed' });
        });
    },
    [setActiveProfile, state.mode],
  );

  const startNewPlayer = useCallback(() => {
    setActiveProfile(null);
    dispatch({ type: 'START_NEW_PLAYER' });
  }, [setActiveProfile]);

  const chooseAvatar = useCallback(
    (avatarId: AvatarId, badge: string, headwear: HeadwearId) => {
      const existingId = activeProfileIdRef.current;
      if (existingId === null) {
        const meta = makeProfile(avatarId, badge, headwear, 0, Date.now());
        setActiveProfile(meta.id);
        writeProfileList([...profilesRef.current, meta]);
      } else {
        writeProfileList(
          profilesRef.current.map((entry) =>
            entry.id === existingId ? { ...entry, avatarId, badge, headwear } : entry,
          ),
        );
      }
      dispatch({ type: 'SET_HEADWEAR', headwear });
      dispatch({ type: 'SELECT_AVATAR', avatarId });
    },
    [setActiveProfile, writeProfileList],
  );

  /** Wipes one profile's progress but keeps its card (avatar, badge, name). */
  const resetProfile = useCallback(
    (id: string) => {
      const repo = repositoryRef.current;
      const meta = profilesRef.current.find((entry) => entry.id === id);
      if (!repo || !meta) return;
      const now = Date.now();
      writeProfileList(
        profilesRef.current.map((entry) =>
          entry.id === id ? { ...entry, stickerCount: 0, lastPlayedAt: now } : entry,
        ),
      );
      void repo
        .save({ ...createFreshPersistedState(now), avatarId: meta.avatarId }, profileSlotKey(id))
        .catch(() => {
          /* storage may be evicted */
        });
      if (activeProfileIdRef.current === id) dispatch({ type: 'RESET_PROGRESS' });
    },
    [writeProfileList],
  );

  const renameProfile = useCallback(
    (id: string, nameFa: string) => {
      writeProfileList(
        profilesRef.current.map((entry) => (entry.id === id ? { ...entry, nameFa } : entry)),
      );
    },
    [writeProfileList],
  );

  const resetProgress = useCallback(() => {
    const repo = repositoryRef.current;
    if (!repo) {
      dispatch({ type: 'RESET_PROGRESS' });
      return;
    }
    const keys = [LEGACY_SLOT_KEY, activeSlotKeyRef.current].filter(
      (key): key is string => key !== null,
    );
    // Clear first so the autosave triggered by the reset cannot race it.
    void Promise.all(keys.map((key) => repo.clear(key).catch(() => undefined))).finally(() =>
      dispatch({ type: 'RESET_PROGRESS' }),
    );
  }, []);

  const playSfx = useCallback((id: string) => {
    void audioService.unlock().then(() => audioService.play(id));
  }, []);

  const shell = useMemo<GameShell>(
    () => ({
      state,
      dispatch,
      cacheStatus,
      updateReady,
      applyUpdate: () => updateRef.current(),
      installReady,
      installApp: () => installPromptRef.current?.(),
      resetProgress,
      playSfx,
      profiles,
      activeProfileId,
      selectProfile,
      startNewPlayer,
      chooseAvatar,
      resetProfile,
      renameProfile,
    }),
    [
      state,
      cacheStatus,
      updateReady,
      installReady,
      resetProgress,
      playSfx,
      profiles,
      activeProfileId,
      selectProfile,
      startNewPlayer,
      chooseAvatar,
      resetProfile,
      renameProfile,
    ],
  );

  return <GameContext.Provider value={shell}>{children}</GameContext.Provider>;
}
