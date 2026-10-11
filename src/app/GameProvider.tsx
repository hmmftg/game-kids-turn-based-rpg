import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { Command, GameState } from '../domain/game/types.ts';
import type { GameRuntime } from '../framework/index.ts';
import { audioService } from '../services/audio/audioService.ts';
import { currentOrientation } from '../services/device/capabilities.ts';
import type { SaveRepository } from '../services/persistence/repository.ts';
import { registerServiceWorker, type CacheStatus } from '../services/pwa/serviceWorker.ts';
import { listenForInstallPrompt } from '../services/pwa/installPrompt.ts';
import type { ProfileMeta } from '../services/persistence/repository.ts';
import { GameContext, type GameShell } from './gameContext.ts';
import { createAppGameRuntime } from './gameRuntime.ts';
import { ProfileCoordinator } from './profileCoordinator.ts';
import { SaveCoordinator } from './saveCoordinator.ts';

/**
 * Thin React binding over the game runtime. The runtime (framework) owns the
 * single state store and dispatch plumbing; the application coordinators own
 * everything persistence — `ProfileCoordinator` handles boot/migration and
 * profile commands, `SaveCoordinator` handles save eligibility. This
 * component only wires them to React: state via `useSyncExternalStore`,
 * profile-picker fields via callbacks, and shell/app lifecycle effects.
 */
export function GameProvider({
  children,
  repository,
}: {
  readonly children: ReactNode;
  readonly repository?: SaveRepository;
}) {
  // One runtime per provider instance, created once — it is never disposed by
  // an effect cleanup because React StrictMode's simulated unmount would kill
  // the store the remount still uses.
  const [runtime] = useState<GameRuntime<GameState, Command>>(() => createAppGameRuntime());
  const [profiles, setProfiles] = useState<readonly ProfileMeta[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [coordinators] = useState(() => {
    const dispatch = (command: Command) => {
      runtime.dispatch(command);
    };
    const profile = new ProfileCoordinator({
      repository,
      dispatch,
      onProfiles: setProfiles,
      onActiveProfile: setActiveProfileId,
    });
    const save = new SaveCoordinator({
      repository: () => profile.saveRepository,
      activeSlotKey: () => profile.slotKey,
      syncActiveProfileMeta: (snapshot) => profile.syncActiveProfileMeta(snapshot),
    });
    return { profile, save };
  });
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>(() =>
    import.meta.env.DEV ? 'unsupported' : 'caching',
  );
  const [updateReady, setUpdateReady] = useState(false);
  const [installReady, setInstallReady] = useState(false);
  const installPromptRef = useRef<(() => void) | null>(null);
  const updateRef = useRef<() => void>(() => {});

  const subscribe = useCallback(
    (listener: (state: GameState) => void) => runtime.subscribe(listener),
    [runtime],
  );
  const state = useSyncExternalStore(subscribe, () => runtime.getState());

  const dispatch = useCallback(
    (command: Command) => {
      runtime.dispatch(command);
    },
    [runtime],
  );

  // The save coordinator observes every published state transition.
  useEffect(() => {
    return runtime.subscribe((snapshot) => coordinators.save.handleState(snapshot));
  }, [runtime, coordinators]);

  // Boot is owned by the profile coordinator; cancellation guards its async
  // loads so a remount never dispatches into a dead session.
  useEffect(() => {
    void coordinators.profile.boot();
    return () => coordinators.profile.cancel();
  }, [coordinators]);

  useEffect(() => {
    audioService.applySettings(state.audio);
  }, [state.audio]);

  // Background music belongs to the playable world modes; menus are silent.
  // unlock() inside a settled-gesture context is a no-op once running, so the
  // first real tap (which reaches 'hub') is what actually starts the loop.
  useEffect(() => {
    const worldModes = ['hub', 'dialogue', 'encounter', 'paused'];
    if (worldModes.includes(state.mode)) {
      void audioService.unlock().then(() => audioService.play('music-hub'));
    } else {
      audioService.stopMusic();
    }
  }, [state.mode]);

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
  }, [dispatch]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      void audioService.setSuspended(document.hidden);
      if (document.hidden) dispatch({ type: 'PAUSE' });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [dispatch]);

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
    (id: string) => coordinators.profile.selectProfile(id, state.mode),
    [coordinators, state.mode],
  );

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
      resetProgress: () => coordinators.profile.resetProgress(),
      playSfx,
      profiles,
      activeProfileId,
      selectProfile,
      startNewPlayer: () => coordinators.profile.startNewPlayer(),
      chooseAvatar: (avatarId, headwear) => coordinators.profile.chooseAvatar(avatarId, headwear),
      resetProfile: (id) => coordinators.profile.resetProfile(id),
      renameProfile: (id, nameFa) => coordinators.profile.renameProfile(id, nameFa),
      deleteProfile: (id) => coordinators.profile.deleteProfile(id),
    }),
    [
      state,
      dispatch,
      cacheStatus,
      updateReady,
      installReady,
      coordinators,
      playSfx,
      profiles,
      activeProfileId,
      selectProfile,
    ],
  );

  return <GameContext.Provider value={shell}>{children}</GameContext.Provider>;
}
