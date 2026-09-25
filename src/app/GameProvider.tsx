import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createInitialState, toPersistedState } from '../domain/game/initialState.ts';
import { gameReducer } from '../domain/game/reducer.ts';
import { shouldAutosave } from '../domain/game/selectors.ts';
import type { Command, GameState } from '../domain/game/types.ts';
import { audioService } from '../services/audio/audioService.ts';
import {
  currentOrientation,
  detectQualityTier,
  detectWebgl,
} from '../services/device/capabilities.ts';
import { createSaveRepository } from '../services/persistence/indexedDbRepository.ts';
import {
  healthFromLoadResult,
  persistedFromLoadResult,
  type SaveRepository,
} from '../services/persistence/repository.ts';
import { registerServiceWorker, type CacheStatus } from '../services/pwa/serviceWorker.ts';
import { GameContext, type GameShell } from './gameContext.ts';

function reduce(state: GameState, command: Command): GameState {
  return gameReducer(state, command, Date.now());
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
  const repositoryRef = useRef<SaveRepository | null>(repository ?? null);
  const previousRef = useRef<GameState>(state);
  const updateRef = useRef<() => void>(() => {});

  // Boot: capabilities first, then the save, so the reducer sees a coherent world.
  useEffect(() => {
    let cancelled = false;
    const repo = repositoryRef.current ?? createSaveRepository();
    repositoryRef.current = repo;

    dispatch({ type: 'WEBGL_AVAILABILITY_CHANGED', available: detectWebgl() });
    dispatch({ type: 'ORIENTATION_CHANGED', orientation: currentOrientation() });

    void repo
      .load()
      .then((result) => {
        if (cancelled) return;
        const persisted = persistedFromLoadResult(result);
        dispatch({ type: 'BOOT_LOADED', persisted, health: healthFromLoadResult(result) });
        if (persisted === null) dispatch({ type: 'SET_QUALITY_TIER', tier: detectQualityTier() });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        dispatch({
          type: 'BOOT_FAILED',
          reason: error instanceof Error ? error.message : 'boot failed',
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Autosave, but only after a stable transition (never mid-animation/encounter).
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = state;
    if (!shouldAutosave(previous, state)) return;
    void repositoryRef.current?.save(toPersistedState(state)).catch(() => {
      /* storage may be evicted; the game stays playable */
    });
  }, [state]);

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

  const resetProgress = useCallback(() => {
    void repositoryRef.current?.clear();
    dispatch({ type: 'RESET_PROGRESS' });
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
      resetProgress,
      playSfx,
    }),
    [state, cacheStatus, updateReady, resetProgress, playSfx],
  );

  return <GameContext.Provider value={shell}>{children}</GameContext.Provider>;
}
