import { Canvas } from '@react-three/fiber';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  getEffectiveCharacterAttributes,
  getInventorySlotCount,
  type GameplayCell,
  type GameplayPlayerIntent,
} from 'waypoint-rpg-gameplay';
import { getDialogueView, getFact, getQuestStatus } from 'waypoint-rpg-narrative';
import { faUi } from './content/fa/ui.js';
import {
  createGardenRuntime,
  getGardenProgress,
  type GardenRuntime,
  type GardenState,
} from './game/runtime.js';
import {
  inspectGardenSave,
  removeGardenSave,
  writeGardenSave,
  type GardenSaveInspection,
} from './persistence/garden-save.js';
import {
  gardenSnapshotFingerprint,
  isGardenSceneReadyForState,
  shouldAutosaveGardenSnapshot,
} from './persistence/garden-autosave.js';
import { registerGardenServiceWorker } from './pwa.js';
import { GardenScene } from './scenes/GardenScene.js';
import { GardenMeshyPilotProvider } from './scenes/MeshyPilot.js';
import type { GardenSceneReadiness } from './scenes/probe.js';
import { gardenTargets, getGardenTarget, type GardenTargetId } from './world/world.js';

export function App() {
  const runtime = useMemo(() => createGardenRuntime(), []);
  const state = useSyncExternalStore(runtime.subscribe, runtime.getState, runtime.getState);
  const [rendererReady, setRendererReady] = useState(false);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const [sceneReadiness, setSceneReadiness] = useState<GardenSceneReadiness | null>(null);
  const [manualRecapOpen, setManualRecapOpen] = useState(false);
  const [dismissedEndingId, setDismissedEndingId] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [initialInspection] = useState<GardenSaveInspection>(() => {
    try {
      return inspectGardenSave(
        window.localStorage,
        runtime.compiledNarrative,
        runtime.compiledGameplay,
      );
    } catch {
      return { status: 'unavailable' };
    }
  });
  const [saveInspection, setSaveInspection] = useState(initialInspection);
  const initialStorageMode =
    initialInspection.status === 'unavailable' ? 'session-only' : 'persistent';
  const lastSavedFingerprint = useRef<string | null>(null);
  const [storageMode, setStorageModeState] = useState<'persistent' | 'session-only'>(
    initialStorageMode,
  );
  const [saveFeedback, setSaveFeedback] = useState('');
  const [offlineStatus, setOfflineStatus] = useState<'checking' | 'ready' | 'failed'>('checking');
  const dialogue = getDialogueView(runtime.compiledNarrative, state.narrative, 'fa');
  const endingId = state.narrative.endingId;
  const recapVisible = manualRecapOpen || Boolean(endingId && endingId !== dismissedEndingId);
  const storyPath = getFact(state.narrative, 'story-path');
  const questId =
    storyPath === 'gardener' ? 'gardener-quest' : storyPath === 'lantern' ? 'lantern-quest' : null;
  const questStatus = questId
    ? getQuestStatus(runtime.compiledNarrative, state.narrative, questId)
    : null;
  const seedFound = getFact(state.narrative, 'seed-found') === true;
  const questObjective =
    storyPath === 'gardener'
      ? seedFound
        ? faUi.gardenerPlantObjective
        : faUi.gardenerSeedObjective
      : storyPath === 'lantern'
        ? faUi.guardianQuestObjective
        : faUi.talkToChoosePath;
  const progress = getGardenProgress(runtime, state);
  const inventorySlots = getInventorySlotCount(runtime.compiledGameplay, state.gameplay);
  const activeEncounter =
    state.gameplay.encounter?.outcome === null ? state.gameplay.encounter : null;
  const [battleNotice, setBattleNotice] = useState('');

  useEffect(() => () => runtime.dispose(), [runtime]);

  const setStorageMode = useCallback((mode: 'persistent' | 'session-only') => {
    setStorageModeState(mode);
  }, []);

  const onSceneReady = useCallback(
    (readiness: GardenSceneReadiness) => {
      const current = runtime.getState();
      if (
        current.phase !== 'playing' ||
        current.mapId !== readiness.mapId ||
        current.anchorId !== readiness.anchorId ||
        current.narrative.playthroughId !== readiness.playthroughId
      )
        return;
      setSceneReadiness(readiness);
    },
    [runtime],
  );

  useEffect(() => {
    let mounted = true;
    void registerGardenServiceWorker().then((ready) => {
      if (mounted) setOfflineStatus(ready ? 'ready' : 'failed');
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (
      !rendererReady ||
      storageMode !== 'persistent' ||
      state.phase !== 'playing' ||
      state.walk ||
      !isGardenSceneReadyForState(state, sceneReadiness)
    )
      return;
    try {
      const fingerprint = gardenSnapshotFingerprint(
        state,
        runtime.compiledNarrative,
        runtime.compiledGameplay,
      );
      if (
        !shouldAutosaveGardenSnapshot({
          state,
          readiness: sceneReadiness,
          storageMode,
          fingerprint,
          lastSavedFingerprint: lastSavedFingerprint.current,
        })
      )
        return;
      writeGardenSave(
        window.localStorage,
        {
          mapId: state.mapId,
          anchorId: state.anchorId,
          narrative: state.narrative,
          gameplay: state.gameplay,
        },
        runtime.compiledNarrative,
        runtime.compiledGameplay,
      );
      lastSavedFingerprint.current = fingerprint;
    } catch {
      queueMicrotask(() => {
        setStorageMode('session-only');
        setSaveFeedback(faUi.saveFailed);
      });
    }
  }, [rendererReady, runtime, sceneReadiness, setStorageMode, state, storageMode]);

  useEffect(() => {
    if (!canvasElement) return;
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setSceneReadiness(null);
      setRendererReady(false);
    };
    const onContextRestored = () => {
      setSceneReadiness(null);
      setRendererReady(true);
      setSceneGeneration((generation) => generation + 1);
    };
    canvasElement.addEventListener('webglcontextlost', onContextLost);
    canvasElement.addEventListener('webglcontextrestored', onContextRestored);
    return () => {
      canvasElement.removeEventListener('webglcontextlost', onContextLost);
      canvasElement.removeEventListener('webglcontextrestored', onContextRestored);
    };
  }, [canvasElement]);

  const closeRecap = useCallback(() => {
    setManualRecapOpen(false);
    if (endingId) setDismissedEndingId(endingId);
  }, [endingId]);

  useEffect(() => {
    if (!activeEncounter) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      const current = runtime.getState();
      const encounter = current.gameplay.encounter;
      if (encounter?.outcome === null) {
        runtime.dispatch({
          type: 'BATTLE_ACTION',
          playthroughId: current.gameplay.playthroughId,
          expectedRevision: current.gameplay.revision,
          encounterInstanceId: encounter.instanceId,
          intent: { type: 'withdraw' },
        });
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [activeEncounter, runtime]);

  const startFresh = useCallback(
    (mode: 'persistent' | 'session-only') => {
      setStorageMode(mode);
      setSaveFeedback(mode === 'session-only' ? faUi.sessionOnly : '');
      setManualRecapOpen(false);
      setDismissedEndingId(null);
      lastSavedFingerprint.current = null;
      runtime.dispatch({ type: 'NEW_GAME' });
      setBattleNotice('');
    },
    [runtime, setStorageMode],
  );

  const continueGame = useCallback(() => {
    if (saveInspection.status !== 'ready') return;
    setStorageMode('persistent');
    setSaveFeedback('');
    lastSavedFingerprint.current = saveInspection.migratedFrom
      ? null
      : gardenSnapshotFingerprint(
          saveInspection.snapshot,
          runtime.compiledNarrative,
          runtime.compiledGameplay,
        );
    runtime.dispatch({ type: 'RESTORE_GAME', ...saveInspection.snapshot });
  }, [runtime, saveInspection, setStorageMode]);

  const clearAndStartFresh = useCallback(() => {
    let mode: 'persistent' | 'session-only' = 'persistent';
    try {
      removeGardenSave(window.localStorage);
    } catch {
      mode = 'session-only';
    }
    setSaveInspection({ status: 'empty' });
    setResetOpen(false);
    startFresh(mode);
  }, [startFresh]);

  const saveNow = useCallback(() => {
    if (storageMode !== 'persistent') return;
    const current = runtime.getState();
    if (current.phase !== 'playing') return;
    if (current.walk || !rendererReady || !isGardenSceneReadyForState(current, sceneReadiness)) {
      setSaveFeedback(faUi.saveSceneUnavailable);
      return;
    }
    try {
      const fingerprint = gardenSnapshotFingerprint(
        current,
        runtime.compiledNarrative,
        runtime.compiledGameplay,
      );
      writeGardenSave(
        window.localStorage,
        {
          mapId: current.mapId,
          anchorId: current.anchorId,
          narrative: current.narrative,
          gameplay: current.gameplay,
        },
        runtime.compiledNarrative,
        runtime.compiledGameplay,
      );
      lastSavedFingerprint.current = fingerprint;
      setStorageMode('persistent');
      setSaveFeedback(faUi.saveComplete);
    } catch {
      setStorageMode('session-only');
      setSaveFeedback(faUi.saveFailed);
    }
  }, [rendererReady, runtime, sceneReadiness, setStorageMode, storageMode]);

  const onBattleIntent = useCallback(
    (intent: GameplayPlayerIntent) => {
      const current = runtime.getState();
      const encounter = current.gameplay.encounter;
      if (current.phase !== 'playing' || !encounter || encounter.outcome !== null) return;
      runtime.dispatch({
        type: 'BATTLE_ACTION',
        playthroughId: current.gameplay.playthroughId,
        expectedRevision: current.gameplay.revision,
        encounterInstanceId: encounter.instanceId,
        intent: intent as Extract<
          GameplayPlayerIntent,
          { type: 'move' | 'use-ability' | 'wait' | 'withdraw' }
        >,
      });
      setBattleNotice(runtime.getState() === current ? faUi.invalidBattleAction : '');
    },
    [runtime],
  );

  const onTargetPress = useCallback(
    (targetId: GardenTargetId) => {
      const current = runtime.getState();
      if (current.phase !== 'playing') return;
      const target = getGardenTarget(targetId);
      if (!target || target.mapId !== current.mapId) return;
      if (target.anchorId === current.anchorId && !current.walk) {
        if (targetId === 'recap-bench' && current.narrative.endingId) {
          setManualRecapOpen(true);
          return;
        }
        runtime.dispatch({ type: 'INTERACT', targetId });
        return;
      }
      runtime.dispatch({ type: 'MOVE_TO', targetId });
    },
    [runtime],
  );

  const mapLabel = faUi[state.mapId];
  const statusText = state.walk
    ? faUi.arriving
    : state.lastInteractionTarget
      ? `${faUi.reached}: ${faUi.targets[state.lastInteractionTarget]}`
      : faUi.choosePlace;

  return (
    <main className="garden-shell">
      <header className="garden-header">
        <span className="garden-mark" aria-hidden="true">
          ✿
        </span>
        <div className="garden-heading">
          <h1>{faUi.title}</h1>
          <p>{faUi.subtitle}</p>
          <p className="offline-status" role="status" data-testid="garden-offline-status">
            {offlineStatus === 'ready'
              ? faUi.offlineReady
              : offlineStatus === 'failed'
                ? faUi.offlineFailed
                : faUi.offlineChecking}
          </p>
        </div>
        {state.phase === 'playing' ? (
          <button
            className="quiet-button"
            data-testid="garden-save-now"
            type="button"
            disabled={storageMode === 'session-only'}
            onClick={saveNow}
          >
            {storageMode === 'persistent' ? faUi.save : faUi.saveFailed}
          </button>
        ) : null}
        {state.phase === 'playing' ? (
          <button
            className="quiet-button"
            data-testid="garden-new-game"
            type="button"
            onClick={() => setResetOpen(true)}
          >
            {faUi.newGame}
          </button>
        ) : null}
        {endingId ? (
          <button
            className="quiet-button"
            data-testid="garden-view-recap"
            type="button"
            onClick={() => setManualRecapOpen(true)}
          >
            {faUi.viewRecap}
          </button>
        ) : null}
      </header>

      {state.phase === 'title' ? (
        <section className="title-card" aria-label={faUi.title}>
          <div className="title-art" aria-hidden="true">
            🌱
          </div>
          {saveInspection.status === 'ready' ? (
            <>
              <button
                className="primary-button"
                data-testid="garden-continue"
                type="button"
                onClick={continueGame}
              >
                {faUi.continueGame}
              </button>
              <button
                className="quiet-button"
                data-testid="garden-start"
                type="button"
                onClick={() => setResetOpen(true)}
              >
                {faUi.start}
              </button>
            </>
          ) : null}
          {saveInspection.status === 'empty' ? (
            <button
              className="primary-button"
              data-testid="garden-start"
              type="button"
              onClick={() => startFresh('persistent')}
            >
              {faUi.start}
            </button>
          ) : null}
          {saveInspection.status !== 'ready' && saveInspection.status !== 'empty' ? (
            <>
              <h2>{faUi.saveRecoveryTitle}</h2>
              <p role="status">
                {saveInspection.status === 'unsupported'
                  ? faUi.saveUnsupported
                  : saveInspection.status === 'incompatible'
                    ? faUi.saveIncompatible
                    : saveInspection.status === 'unavailable'
                      ? faUi.saveUnavailable
                      : faUi.saveRecoveryCopy}
              </p>
              <button
                className="primary-button"
                data-testid="garden-start-temporary"
                type="button"
                onClick={() => startFresh('session-only')}
              >
                {faUi.startTemporary}
              </button>
              {saveInspection.status !== 'unavailable' ? (
                <button
                  className="quiet-button"
                  data-testid="garden-clear-save"
                  type="button"
                  onClick={clearAndStartFresh}
                >
                  {faUi.clearAndStart}
                </button>
              ) : null}
            </>
          ) : null}
          {saveFeedback ? <p role="status">{saveFeedback}</p> : null}
          <ResetConfirmation
            open={resetOpen}
            onCancel={() => setResetOpen(false)}
            onConfirm={clearAndStartFresh}
          />
        </section>
      ) : (
        <section className="game-shell" aria-label={mapLabel} data-active-scene={state.mapId}>
          <div className="scene-frame" data-testid={`scene-${state.mapId}`}>
            <GardenMeshyPilotProvider>
              <Canvas
                data-testid="garden-canvas-wrapper"
                frameloop="demand"
                camera={{ position: [0, 12, 14], fov: 42 }}
                onCreated={({ gl }) => {
                  gl.domElement.dataset.testid = 'garden-canvas';
                  gl.domElement.dataset.cameraKind = 'loading';
                  setCanvasElement(gl.domElement);
                  setRendererReady(true);
                }}
              >
                <GardenScene
                  key={`${state.mapId}:${sceneGeneration}`}
                  runtime={runtime}
                  state={state}
                  sceneGeneration={sceneGeneration}
                  onTargetPress={onTargetPress}
                  onSceneReady={onSceneReady}
                />
              </Canvas>
            </GardenMeshyPilotProvider>
            {!rendererReady ? (
              <div className="loading-message" role="status">
                {faUi.loading}
              </div>
            ) : null}
          </div>

          <div className="play-controls">
            <div className="map-status">
              <p className="location-label" data-testid="active-map" aria-live="polite">
                {mapLabel}
              </p>
              <p className="movement-status" role="status" data-testid="movement-status">
                {statusText}
              </p>
              <p className="quest-status" data-testid="quest-status" aria-live="polite">
                {questId && questStatus
                  ? `${questId === 'gardener-quest' ? faUi.gardenerQuest : faUi.lanternQuest} · ${faUi.questStatus[questStatus]} · ${questObjective}`
                  : questObjective}
              </p>
            </div>
            <p className="save-status" role="status" data-testid="garden-save-status">
              {saveFeedback || (storageMode === 'session-only' ? faUi.sessionOnly : '')}
            </p>
            <nav className="target-navigation" aria-label={faUi.targetsHeading}>
              {gardenTargets
                .filter((target) => target.mapId === state.mapId)
                .map((target) => {
                  const label = faUi.targets[target.id];
                  const nearby = target.anchorId === state.anchorId && !state.walk;
                  return (
                    <button
                      className="target-button"
                      key={target.id}
                      data-testid={`target-${target.id}`}
                      data-nearby={nearby}
                      type="button"
                      aria-label={`${label}، ${nearby ? faUi.interact : faUi.approach}`}
                      aria-pressed={nearby}
                      onClick={() => onTargetPress(target.id)}
                    >
                      <span className="target-button-mark" aria-hidden="true">
                        {target.kind === 'gardener' || target.kind === 'traveler'
                          ? '●'
                          : target.kind === 'gate'
                            ? '⌂'
                            : '◆'}
                      </span>
                      <span>{label}</span>
                    </button>
                  );
                })}
            </nav>
            <details className="inventory-panel" data-testid="inventory-panel">
              <summary>{faUi.inventoryHeading}</summary>
              <p data-testid="hero-progress">
                {faUi.heroLevel}: {progress.level} · {faUi.stepsAttribute}:{' '}
                {progress.attributes.steps} · {faUi.resonanceAttribute}:{' '}
                {progress.attributes.resonance}
              </p>
              <p data-testid="inventory-slots">
                {faUi.inventorySlots}: {inventorySlots}/
                {runtime.compiledGameplay.definition.inventoryCapacity}
              </p>
              <ul className="inventory-list">
                <li data-testid="inventory-special-seed">
                  {faUi.specialSeed}: {state.gameplay.inventory['special-seed'] ?? 0}
                </li>
                <li data-testid="inventory-garden-reward">
                  {faUi.gardenReward}: {state.gameplay.inventory['garden-reward'] ?? 0}
                </li>
                <li data-testid="inventory-lantern-charm">
                  {faUi.lanternCharm}: {state.gameplay.inventory['lantern-charm'] ?? 0}
                </li>
              </ul>
              <p data-testid="unlocked-abilities">
                {faUi.unlockedAbilities}:{' '}
                {progress.abilities.map((abilityId) => abilityLabel(abilityId)).join('، ')}
              </p>
              {(state.gameplay.inventory['lantern-charm'] ?? 0) > 0 ? (
                <button
                  className="quiet-button"
                  data-testid="toggle-lantern-charm"
                  type="button"
                  onClick={() => runtime.dispatch({ type: 'TOGGLE_CHARM' })}
                >
                  {state.gameplay.equipment['garden-hero']?.charm === 'lantern-charm'
                    ? faUi.unequipCharm
                    : faUi.equipCharm}
                </button>
              ) : null}
            </details>
            {state.gameplay.encounter?.outcome && !endingId ? (
              <section className="battle-result" data-testid="battle-outcome" role="status">
                <h2>{faUi.battleResult}</h2>
                <p>{faUi.battleRetry}</p>
                <p>{faUi.targets.guardian} را دوباره ببین تا بازی را از نو آغاز کنی.</p>
              </section>
            ) : null}
          </div>
          {activeEncounter ? (
            <BattlePanel
              runtime={runtime}
              state={state}
              notice={battleNotice}
              onIntent={onBattleIntent}
            />
          ) : null}
          {dialogue ? (
            <GardenModal
              testId="dialogue-layer"
              labelledBy="garden-dialogue-heading"
              onDismiss={() => runtime.dispatch({ type: 'DIALOGUE_EXIT' })}
            >
              <section className="dialogue-panel" data-testid="dialogue-panel">
                <p className="dialogue-speaker">
                  {faUi.speakers[dialogue.speakerId as keyof typeof faUi.speakers] ??
                    faUi.dialogueHeading}
                </p>
                <h2 id="garden-dialogue-heading">{dialogue.text}</h2>
                <div className="dialogue-choices" aria-label={faUi.dialogueHeading}>
                  {dialogue.choices.map((choice, index) => (
                    <button
                      key={choice.id}
                      className="dialogue-choice"
                      data-testid={`dialogue-choice-${choice.id}`}
                      type="button"
                      disabled={!choice.available}
                      autoFocus={index === 0 && choice.available}
                      onClick={() =>
                        runtime.dispatch({ type: 'DIALOGUE_CHOICE', choiceId: choice.id })
                      }
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
                <button
                  className="quiet-button dialogue-exit"
                  data-testid="dialogue-exit"
                  type="button"
                  onClick={() => runtime.dispatch({ type: 'DIALOGUE_EXIT' })}
                >
                  {faUi.closeDialogue}
                </button>
              </section>
            </GardenModal>
          ) : null}
          {endingId && recapVisible ? (
            <GardenModal
              testId="ending-layer"
              labelledBy="garden-ending-heading"
              onDismiss={closeRecap}
            >
              <section className="dialogue-panel ending-panel" data-testid="ending-panel">
                <p className="dialogue-speaker">{faUi.recapHeading}</p>
                <h2 id="garden-ending-heading">
                  {endingId === 'ending-garden' ? faUi.gardenerEnding : faUi.lanternEnding}
                </h2>
                <p>{questObjective}</p>
                <button
                  className="primary-button"
                  data-testid="ending-close"
                  type="button"
                  autoFocus
                  onClick={closeRecap}
                >
                  {faUi.closeRecap}
                </button>
              </section>
            </GardenModal>
          ) : null}
          <ResetConfirmation
            open={resetOpen}
            onCancel={() => setResetOpen(false)}
            onConfirm={clearAndStartFresh}
          />
        </section>
      )}
    </main>
  );
}

type BattleIntent = Extract<
  GameplayPlayerIntent,
  { type: 'move' | 'use-ability' | 'wait' | 'withdraw' }
>;

function ResetConfirmation({
  open,
  onCancel,
  onConfirm,
}: {
  readonly open: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <GardenModal testId="reset-layer" labelledBy="garden-reset-heading" onDismiss={onCancel}>
      <section className="dialogue-panel" data-testid="reset-panel">
        <h2 id="garden-reset-heading">{faUi.resetPrompt}</h2>
        <div className="dialogue-choices">
          <button
            className="primary-button"
            data-testid="garden-confirm-reset"
            type="button"
            autoFocus
            onClick={onConfirm}
          >
            {faUi.confirmReset}
          </button>
          <button
            className="quiet-button"
            data-testid="garden-cancel-reset"
            type="button"
            onClick={onCancel}
          >
            {faUi.cancel}
          </button>
        </div>
      </section>
    </GardenModal>
  );
}

function GardenModal({
  children,
  testId,
  labelledBy,
  onDismiss,
}: {
  readonly children: ReactNode;
  readonly testId: string;
  readonly labelledBy: string;
  readonly onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const activeElement = document.activeElement;
    const opener = activeElement instanceof HTMLElement ? activeElement : null;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>('[autofocus]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (opener?.isConnected) {
        window.requestAnimationFrame(() => opener.focus({ preventScroll: true }));
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="garden-modal"
      data-testid={testId}
      aria-labelledby={labelledBy}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onDismissRef.current();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter(
          (element) => element.tabIndex >= 0 && element.getAttribute('aria-hidden') !== 'true',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === dialog)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || document.activeElement === dialog)
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div
        className="garden-modal-backdrop"
        aria-hidden="true"
        onClick={() => onDismissRef.current()}
      />
      {children}
    </dialog>
  );
}

function BattlePanel({
  runtime,
  state,
  notice,
  onIntent,
}: {
  readonly runtime: GardenRuntime;
  readonly state: GardenState;
  readonly notice: string;
  readonly onIntent: (intent: BattleIntent) => void;
}) {
  const encounter = state.gameplay.encounter;
  if (!encounter || encounter.outcome !== null) return null;
  const definition = runtime.compiledGameplay.definition.encounters.find(
    (candidate) => candidate.id === encounter.definitionId,
  );
  const board = definition
    ? runtime.compiledGameplay.definition.boards.find(
        (candidate) => candidate.id === definition.boardId,
      )
    : undefined;
  const hero = encounter.combatants.find((participant) => participant.id === 'hero-seat');
  const guardian = encounter.combatants.find((participant) => participant.id === 'guardian-seat');
  if (!board || !hero || !guardian) return null;
  const isPlayerTurn = encounter.activeParticipantId === hero.id;
  const heroHealth = hero.resources.hearts ?? 0;
  const guardianHealth = guardian.resources.hearts ?? 0;
  const effectiveHeroAttributes = getEffectiveCharacterAttributes(
    runtime.compiledGameplay,
    state.gameplay,
    'garden-hero',
    hero.id,
  );
  const heroStatuses = hero.statuses.map((status) => statusLabel(status.statusEffectId)).join('، ');
  const unlockedAbilities = getGardenProgress(runtime, state).abilities;
  const cells = Array.from({ length: board.width * board.height }, (_, index) => ({
    x: index % board.width,
    y: Math.floor(index / board.width),
  }));

  return (
    <div className="battle-layer" data-testid="battle-layer">
      <section className="battle-panel" aria-labelledby="garden-battle-heading">
        <h2 id="garden-battle-heading">{faUi.battleHeading}</h2>
        <p>{faUi.battleInstructions}</p>
        <p data-testid="battle-turn" aria-live="polite">
          {isPlayerTurn ? faUi.battleHero : faUi.battleGuardian} · {faUi.heroHealth}: {heroHealth}
          /10 · {faUi.guardianHealth}: {guardianHealth}/8 · {faUi.stepsAttribute}:{' '}
          {effectiveHeroAttributes.steps}
        </p>
        <p className="battle-statuses" data-testid="battle-statuses">
          {heroStatuses ? `${faUi.battleHero}: ${heroStatuses}` : faUi.battleHero}
        </p>
        <div
          className="battle-board"
          data-testid="battle-board"
          role="group"
          aria-label={faUi.battleBoard}
        >
          {cells.map((cell) => {
            const participant = encounter.combatants.find(
              (candidate) =>
                candidate.position.x === cell.x &&
                candidate.position.y === cell.y &&
                (candidate.resources.hearts ?? 0) > 0,
            );
            const blocked = board.blockedCells.some(
              (candidate) => candidate.x === cell.x && candidate.y === cell.y,
            );
            return (
              <button
                key={`${cell.x}-${cell.y}`}
                className={`battle-cell${participant?.team === 'player' ? ' is-hero' : ''}${participant?.team === 'enemy' ? ' is-guardian' : ''}${blocked ? ' is-blocked' : ''}`}
                data-testid={`battle-cell-${cell.x}-${cell.y}`}
                data-position={`${cell.x},${cell.y}`}
                data-occupant={participant?.id ?? ''}
                type="button"
                disabled={blocked || Boolean(participant) || !isPlayerTurn}
                aria-label={`${cell.x + 1}، ${cell.y + 1}، ${
                  participant?.id === hero.id
                    ? faUi.battleHero
                    : participant?.id === guardian.id
                      ? faUi.battleGuardian
                      : blocked
                        ? faUi.invalidBattleAction
                        : faUi.battleBoard
                }`}
                onClick={() =>
                  onIntent({
                    type: 'move',
                    participantId: hero.id,
                    destination: cell as GameplayCell,
                  })
                }
              >
                {participant?.team === 'player'
                  ? '●'
                  : participant?.team === 'enemy'
                    ? '✦'
                    : blocked
                      ? '◆'
                      : ''}
              </button>
            );
          })}
        </div>
        <div className="battle-abilities" aria-label={faUi.unlockedAbilities}>
          <button
            className="primary-button"
            data-testid="battle-ability-light-ray"
            type="button"
            disabled={!isPlayerTurn}
            onClick={() =>
              onIntent({
                type: 'use-ability',
                participantId: hero.id,
                abilityId: 'light-ray',
                targetParticipantId: guardian.id,
              })
            }
          >
            {faUi.lightRay}
          </button>
          <button
            className="quiet-button"
            data-testid="battle-ability-gentle-ward"
            type="button"
            disabled={!isPlayerTurn}
            onClick={() =>
              onIntent({
                type: 'use-ability',
                participantId: hero.id,
                abilityId: 'gentle-ward',
                targetParticipantId: hero.id,
              })
            }
          >
            {faUi.gentleWard}
          </button>
          {unlockedAbilities.includes('star-bloom') ? (
            <button
              className="quiet-button"
              data-testid="battle-ability-star-bloom"
              type="button"
              disabled={!isPlayerTurn}
              onClick={() =>
                onIntent({
                  type: 'use-ability',
                  participantId: hero.id,
                  abilityId: 'star-bloom',
                  targetParticipantId: guardian.id,
                })
              }
            >
              {faUi.starBloom}
            </button>
          ) : null}
          <button
            className="quiet-button"
            data-testid="battle-wait"
            type="button"
            disabled={!isPlayerTurn}
            onClick={() => onIntent({ type: 'wait', participantId: hero.id })}
          >
            {faUi.waitTurn}
          </button>
          <button
            className="quiet-button"
            data-testid="battle-withdraw"
            type="button"
            onClick={() => onIntent({ type: 'withdraw' })}
          >
            {faUi.withdraw}
          </button>
        </div>
        <p className="battle-notice" role="status" data-testid="battle-notice">
          {notice || (heroStatuses ? `${faUi.steadyGlow} · ${heroStatuses}` : '')}
        </p>
      </section>
    </div>
  );
}

function abilityLabel(abilityId: string): string {
  const labels: Readonly<Record<string, string>> = {
    'light-ray': faUi.lightRay,
    'gentle-ward': faUi.gentleWard,
    'star-bloom': faUi.starBloom,
  };
  return labels[abilityId] ?? abilityId;
}

function statusLabel(statusId: string): string {
  const labels: Readonly<Record<string, string>> = {
    'steady-glow': faUi.steadyGlow,
    'pollen-dusted': faUi.pollenDusted,
  };
  return labels[statusId] ?? statusId;
}
