import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas } from '@react-three/fiber';
import { getAnchor } from 'waypoint-rpg-core';
import { getDialogueView, getQuestStatus, getFact } from 'waypoint-rpg-narrative';
import { DialogueDialog } from './DialogueDialog.js';
import { bloodLeafGameplay } from './content/blood-leaf-gameplay.js';
import { bloodLeafCopy, bloodLeafNarrative } from './content/blood-leaf.js';
import { EncounterPanel } from './EncounterPanel.js';
import { getEncounterView } from './encounter-view.js';
import { SceneCamera } from './SceneCamera.js';
import { SceneFrameProbe } from './SceneFrameProbe.js';
import { browserDemoStorage } from './persistence.js';
import { createDemoRuntime, getDialogueOwnerMap } from './runtime.js';
import { SceneHost } from './scene-host.js';
import { sceneRegistry } from './scenes/registry.js';
import { subscribeDemoRuntime } from './scenes/scene-runtime.js';
import { Phase5AssetDemo } from './animation/Phase5AssetDemo.js';
import type { SemanticAction } from './animation/contracts.js';
import {
  bloodLeafLanternAwakening,
  bloodLeafTimelineRegistry,
} from './presentation/blood-leaf-cinematic.js';
import { CinematicStage } from './presentation/CinematicStage.js';
import { createTimelinePlayer } from './presentation/timeline.js';
import type { TimelineEvent, TimelinePlayer, TimelineStatus } from './presentation/timeline.js';
import { sceneProbe } from './probe.js';

declare global {
  interface Window {
    __sceneDemoCinematicTest?: { readonly playThenSkipBeforeFrame: () => void };
  }
}

export function App() {
  if (new URLSearchParams(window.location.search).get('phase5') === 'assets')
    return <Phase5AssetDemo />;
  return <NarrativeDemo />;
}

function NarrativeDemo() {
  const cinematicTestMode = new URLSearchParams(window.location.search).get('scene-test') === '1';
  const host = useMemo(() => new SceneHost(sceneRegistry), []);
  const runtime = useMemo(() => createDemoRuntime(host, { storage: browserDemoStorage }), [host]);
  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);
  const subscribeRuntime = useCallback(
    (listener: () => void) => subscribeDemoRuntime(runtime, listener),
    [runtime],
  );
  const appState = useSyncExternalStore(subscribeRuntime, runtime.getState, runtime.getState);
  const { durable, bootstrap, feedback } = appState;
  const [canvasVersion, setCanvasVersion] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const canvasLive = useRef(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const dialogueOpenerRef = useRef<HTMLButtonElement | null>(null);
  const cinematicOpenerRef = useRef<HTMLButtonElement | null>(null);
  const timelinePlayer = useMemo(() => createTimelinePlayer(bloodLeafLanternAwakening), []);
  const timelineRef = useRef<TimelinePlayer | null>(timelinePlayer);
  const pendingTimelineEventsRef = useRef<TimelineEvent[]>([]);
  const invalidateRef = useRef<() => void>(() => {});
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioNodesRef = useRef(new Set<OscillatorNode>());
  const mountedRef = useRef(false);
  const [cinematicStatus, setCinematicStatus] = useState<TimelineStatus>('idle');
  const [cinematicExecutionId, setCinematicExecutionId] = useState(0);
  const [cinematicCaption, setCinematicCaption] = useState('');
  const [cinematicLease, setCinematicLease] = useState(false);
  const [lanternAccent, setLanternAccent] = useState(false);
  const [guardianPresentation, setGuardianPresentation] = useState<{
    action: SemanticAction;
    revision: number;
  }>({
    action: 'idle',
    revision: 0,
  });
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const stopCinematicAudio = useCallback(() => {
    for (const node of audioNodesRef.current) {
      try {
        node.stop();
      } catch {
        // The audio node may have ended before its presentation lease was released.
      }
    }
    audioNodesRef.current.clear();
    const probe = sceneProbe();
    if (probe) probe.activeAudioLeases = 0;
  }, []);

  const onCinematicEvent = useCallback(
    (event: TimelineEvent) => {
      if (!timelinePlayer.isCurrentExecution(event.executionId)) return;
      if (event.cue.kind === 'dialogue') {
        const dialogueId = event.cue.dialogueId as keyof typeof bloodLeafTimelineRegistry.dialogues;
        const record = bloodLeafTimelineRegistry.dialogues[dialogueId];
        if (record) setCinematicCaption(record.text);
      } else if (event.cue.kind === 'animation' && event.cue.actorId === 'guardian') {
        const action = event.cue.action;
        setGuardianPresentation((current) => ({
          action,
          revision: current.revision + 1,
        }));
      } else if (event.cue.kind === 'audio' && audioContextRef.current) {
        const context = audioContextRef.current;
        const audioId = event.cue.audioId as keyof typeof bloodLeafTimelineRegistry.audio;
        const record = bloodLeafTimelineRegistry.audio[audioId];
        if (!record || context.state === 'closed') return;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(660, context.currentTime);
        gain.gain.setValueAtTime(0.025, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + record.durationSeconds);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => {
          audioNodesRef.current.delete(oscillator);
          const probe = sceneProbe();
          if (probe) probe.activeAudioLeases = audioNodesRef.current.size;
        };
        audioNodesRef.current.add(oscillator);
        const probe = sceneProbe();
        if (probe) probe.activeAudioLeases = audioNodesRef.current.size;
        oscillator.start();
        oscillator.stop(context.currentTime + record.durationSeconds);
      }
    },
    [timelinePlayer],
  );

  const onCinematicRelease = useCallback(() => {
    stopCinematicAudio();
    if (!mountedRef.current) return;
    setCinematicCaption('');
    setLanternAccent(false);
    setGuardianPresentation((current) => ({ action: 'idle', revision: current.revision + 1 }));
  }, [stopCinematicAudio]);

  useEffect(() => {
    if (cinematicLease || (cinematicStatus !== 'completed' && cinematicStatus !== 'cancelled'))
      return;
    const opener = cinematicOpenerRef.current;
    if (opener?.isConnected && !opener.disabled) opener.focus();
    else mainRef.current?.focus();
  }, [cinematicLease, cinematicStatus]);

  useEffect(() => {
    mountedRef.current = true;
    void runtime.start();
    return () => {
      mountedRef.current = false;
      canvasLive.current = false;
      timelinePlayer.dispose();
      stopCinematicAudio();
      if (audioContextRef.current) void audioContextRef.current.close();
      host.dispose();
      runtime.dispose();
    };
  }, [host, runtime, stopCinematicAudio, timelinePlayer]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  const onContextLost = useCallback(
    (event: Event) => {
      event.preventDefault();
      if (!canvasLive.current) return;
      canvasLive.current = false;
      timelinePlayer.cancel(timelinePlayer.snapshot().executionId);
      stopCinematicAudio();
      setCinematicStatus(timelinePlayer.snapshot().status);
      setCinematicLease(false);
      setLanternAccent(false);
      setCinematicCaption('');
      setGuardianPresentation((current) => ({ action: 'idle', revision: current.revision + 1 }));
      setContextLost(true);
    },
    [stopCinematicAudio, timelinePlayer],
  );

  const onCreated = useCallback(
    ({ gl, invalidate }: { gl: { domElement: HTMLCanvasElement }; invalidate: () => void }) => {
      canvasLive.current = true;
      invalidateRef.current = invalidate;
      gl.domElement.dataset.testid = 'scene-canvas';
      gl.domElement.addEventListener('webglcontextlost', onContextLost, { once: true });
    },
    [onContextLost],
  );

  const active = snapshot.active;
  const ActiveScene = active?.resource.Component;
  const activeAnchorId = snapshot.currentAnchorId ?? active?.entryAnchorId;
  const target =
    active && activeAnchorId ? getAnchor(active.definition.graph, activeAnchorId) : null;
  const toWorkshop = active?.definition.map.id !== 'map-workshop';
  const transitionId = toWorkshop ? 'transition-to-workshop' : 'transition-to-courtyard';
  const transitionLabel = toWorkshop ? 'Travel to workshop' : 'Return to courtyard';
  const narrative = durable.narrative;
  const onNarrativeCommand = useCallback(
    (action: Parameters<typeof runtime.dispatch>[0]) => {
      runtime.dispatch(action);
    },
    [runtime],
  );
  const onGameplayCommand = useCallback(
    (action: Parameters<typeof runtime.dispatch>[0]) => {
      runtime.dispatch(action);
    },
    [runtime],
  );
  const dialogue = getDialogueView(bloodLeafNarrative, narrative, 'fa-IR');
  const questStatus = getQuestStatus(bloodLeafNarrative, narrative, 'leaf-inquiry');
  const factTruth = getFact(narrative, 'seeking-truth') === true;
  const factVengeance = getFact(narrative, 'seeking-vengeance') === true;
  const lanternLit = getFact(narrative, 'lantern-lit') === true;
  const clueResolved = getFact(narrative, 'clue-resolved') === true;
  const trialComplete = getFact(narrative, 'guardian-trial-complete') === true;
  const currentMapId = active?.definition.map.id ?? null;
  const routeUnlocked = factTruth || factVengeance;
  const encounterView = getEncounterView(bloodLeafGameplay, durable.gameplay);
  const encounterInProgress = encounterView.active && encounterView.outcome === null;
  const canStartTrial =
    durable.ready &&
    currentMapId === 'map-courtyard' &&
    factVengeance &&
    !trialComplete &&
    !dialogue &&
    !encounterInProgress;
  const suspendedDialogueId = narrative.suspendedDialogue?.dialogueId ?? null;
  const suspendedOwnerMap = suspendedDialogueId ? getDialogueOwnerMap(suspendedDialogueId) : null;
  const dialogueToOpen = narrative.activeDialogue
    ? null
    : suspendedDialogueId
      ? suspendedOwnerMap === currentMapId
        ? suspendedDialogueId
        : null
      : currentMapId === 'map-courtyard'
        ? factTruth
          ? clueResolved
            ? 'truth-resolution-dialogue'
            : null
          : factVengeance
            ? null
            : 'guardian-dialogue'
        : currentMapId === 'map-workshop' && factTruth && !clueResolved
          ? 'workshop-clue-dialogue'
          : null;
  const suspendedGuidance =
    suspendedOwnerMap !== null && suspendedOwnerMap !== currentMapId
      ? suspendedOwnerMap === 'map-courtyard'
        ? bloodLeafCopy.suspendedGuidance.courtyard
        : bloodLeafCopy.suspendedGuidance.workshop
      : null;
  const ending = narrative.endingId
    ? bloodLeafCopy.endings[narrative.endingId as keyof typeof bloodLeafCopy.endings]
    : '';
  const dialogueOpen = Boolean(dialogue);
  const cinematicCanRun = currentMapId === 'map-workshop' && lanternLit && !dialogueOpen;

  useEffect(() => {
    const status = timelinePlayer.snapshot().status;
    const isActive = status === 'playing' || status === 'waiting';
    if ((!cinematicCanRun || snapshot.pendingMapId !== null) && isActive) {
      timelinePlayer.cancel(timelinePlayer.snapshot().executionId);
      invalidateRef.current();
    }
  }, [cinematicCanRun, snapshot.pendingMapId, timelinePlayer]);

  const onCinematicStatus = useCallback((status: TimelineStatus) => {
    setCinematicStatus(status);
  }, []);
  const onCinematicEffect = useCallback(
    (effectId: string, active: boolean) => {
      if (effectId === 'lanternGlow') setLanternAccent(active && lanternLit);
    },
    [lanternLit],
  );
  const onCinematicLease = useCallback((active: boolean) => {
    setCinematicLease(active);
  }, []);
  const playLanternSequence = useCallback(() => {
    if (!cinematicCanRun) return null;
    cinematicOpenerRef.current = document.activeElement as HTMLButtonElement;
    if (!audioContextRef.current && window.AudioContext)
      audioContextRef.current = new window.AudioContext();
    if (audioContextRef.current?.state === 'suspended')
      void audioContextRef.current.resume().catch(() => {});
    pendingTimelineEventsRef.current = [];
    setCinematicCaption('');
    const executionId = timelinePlayer.play({ reducedMotion });
    setCinematicExecutionId(executionId);
    setCinematicStatus(timelinePlayer.snapshot().status);
    if (timelinePlayer.isCurrentExecution(executionId)) invalidateRef.current();
    return executionId;
  }, [cinematicCanRun, reducedMotion, timelinePlayer]);
  const skipLanternSequence = useCallback(
    (executionId = cinematicExecutionId) => {
      pendingTimelineEventsRef.current.push(...timelinePlayer.skip(executionId));
      setCinematicStatus(timelinePlayer.snapshot().status);
      invalidateRef.current();
    },
    [cinematicExecutionId, timelinePlayer],
  );
  const cancelLanternSequence = useCallback(() => {
    timelinePlayer.cancel(cinematicExecutionId);
    setCinematicStatus(timelinePlayer.snapshot().status);
    invalidateRef.current();
  }, [cinematicExecutionId, timelinePlayer]);
  const continueLanternSequence = useCallback(() => {
    const waitingFor = timelinePlayer.snapshot().waitingFor;
    if (waitingFor) timelinePlayer.resolveWait(cinematicExecutionId, waitingFor);
    setCinematicStatus(timelinePlayer.snapshot().status);
    invalidateRef.current();
  }, [cinematicExecutionId, timelinePlayer]);

  useEffect(() => {
    if (!cinematicTestMode) return;
    const testHook = {
      playThenSkipBeforeFrame: () => {
        const executionId = playLanternSequence();
        if (executionId !== null) skipLanternSequence(executionId);
      },
    };
    window.__sceneDemoCinematicTest = testHook;
    return () => {
      if (window.__sceneDemoCinematicTest === testHook) delete window.__sceneDemoCinematicTest;
    };
  }, [cinematicTestMode, playLanternSequence, skipLanternSequence]);

  return (
    <>
      <main className="demo-shell" ref={mainRef} tabIndex={-1}>
        <header className="demo-header">
          <div>
            <p className="eyebrow">Independent consumer</p>
            <h1>Three.js narrative integration</h1>
            <p>Two registered scenes use the core and optional narrative packages.</p>
          </div>
          <div className="status-grid" aria-live="polite">
            <span>Map</span>
            <output data-testid="active-map">{active?.definition.map.id ?? 'loading'}</output>
            <span>Camera</span>
            <output data-testid="camera-kind">{active?.definition.camera.kind ?? 'loading'}</output>
            <span>Arrival</span>
            <output data-testid="entry-anchor">{active?.entryAnchorId ?? 'loading'}</output>
            <span>Session</span>
            <output data-testid="session-readiness">
              {durable.ready ? 'ready' : bootstrap.status}
            </output>
            <span>Save</span>
            <output data-testid="save-mode">{bootstrap.storageMode}</output>
            <span>{bloodLeafCopy.inquiryQuest}</span>
            <output data-testid="quest-status" data-status={questStatus}>
              {bloodLeafCopy.questStatus[questStatus]}
            </output>
            <span>Ending</span>
            <output data-testid="story-ending">{ending}</output>
          </div>
        </header>

        <section className="controls" aria-label="Demo controls">
          {dialogueToOpen && currentMapId === 'map-courtyard' && (
            <button
              ref={dialogueOpenerRef}
              data-testid="dialogue-open"
              type="button"
              disabled={
                !durable.ready || Boolean(dialogue) || narrative.endingId !== null || cinematicLease
              }
              onClick={() => {
                dialogueOpenerRef.current = document.activeElement as HTMLButtonElement;
                runtime.dispatch({ type: 'OPEN_DIALOGUE', dialogueId: dialogueToOpen });
              }}
            >
              {suspendedDialogueId
                ? bloodLeafCopy.resumeDialogue
                : dialogueToOpen === 'truth-resolution-dialogue'
                  ? bloodLeafCopy.truthResolution
                  : bloodLeafCopy.startDialogue}
            </button>
          )}
          {canStartTrial && (
            <button
              data-testid="start-guardian-trial"
              type="button"
              disabled={!durable.ready || narrative.endingId !== null || cinematicLease}
              onClick={() => runtime.dispatch({ type: 'START_ENCOUNTER' })}
            >
              {bloodLeafCopy.startTrial}
            </button>
          )}
          {dialogueToOpen === 'workshop-clue-dialogue' && (
            <button
              ref={dialogueOpenerRef}
              data-testid="clue-interaction"
              type="button"
              disabled={
                !durable.ready || Boolean(dialogue) || narrative.endingId !== null || cinematicLease
              }
              onClick={() => {
                dialogueOpenerRef.current = document.activeElement as HTMLButtonElement;
                runtime.dispatch({
                  type: 'OPEN_DIALOGUE',
                  dialogueId: 'workshop-clue-dialogue',
                });
              }}
            >
              {suspendedDialogueId ? bloodLeafCopy.resumeDialogue : bloodLeafCopy.clueDialogue}
            </button>
          )}
          <button
            data-testid="scene-transition"
            type="button"
            disabled={
              !durable.ready ||
              cinematicLease ||
              snapshot.pendingMapId !== null ||
              Boolean(dialogue) ||
              encounterInProgress ||
              (toWorkshop && !routeUnlocked)
            }
            onClick={() => void runtime.transitionTo(transitionId)}
          >
            {snapshot.pendingMapId ? `Loading ${snapshot.pendingMapId}…` : transitionLabel}
          </button>
          {active?.definition.map.id === 'map-workshop' && factTruth && (
            <output data-testid="clue-status" data-resolved={String(clueResolved)}>
              {clueResolved ? bloodLeafCopy.clueResolved : bloodLeafCopy.clueWaiting}
              {lanternLit ? ` · ${bloodLeafCopy.lanternLit}` : ''}
            </output>
          )}
          <button
            data-testid="story-reset"
            type="button"
            disabled={!durable.ready || Boolean(dialogue) || cinematicLease}
            onClick={() => {
              if (window.confirm(bloodLeafCopy.confirmReset)) void runtime.resetPlaythrough(true);
            }}
          >
            {bloodLeafCopy.resetStory}
          </button>
          <output
            className="command-feedback"
            data-testid="command-feedback"
            data-command-token={feedback?.token ?? ''}
            data-command-accepted={feedback ? String(feedback.accepted) : ''}
            role="status"
            aria-live="polite"
          >
            {feedback && !feedback.accepted ? `${feedback.action}: ${feedback.reason}` : ''}
          </output>
          <output className="error" data-testid="scene-error" role="status">
            {snapshot.error ?? ''}
          </output>
        </section>

        {suspendedGuidance && (
          <p
            className="suspended-dialogue-guidance"
            data-testid="suspended-dialogue-guidance"
            role="status"
          >
            {suspendedGuidance}
          </p>
        )}

        {bootstrap.status === 'recovery-required' && (
          <section className="save-recovery" role="alert" data-testid="save-recovery">
            <p>{bootstrap.reason}</p>
            <p>{bloodLeafCopy.recoveryExplanation}</p>
            {bootstrap.reason?.startsWith('restore-scene-') && (
              <button
                data-testid="retry-saved-scene"
                type="button"
                onClick={() => void runtime.retrySavedScene()}
              >
                {bloodLeafCopy.retrySavedScene}
              </button>
            )}
            <button
              data-testid="recover-session"
              type="button"
              onClick={() => void runtime.recoverFreshSession()}
            >
              {bloodLeafCopy.recoverStory}
            </button>
          </section>
        )}
        {bootstrap.storageMode === 'session-only' && bootstrap.status === 'ready' && (
          <p className="save-warning" role="status" data-testid="save-warning">
            {bloodLeafCopy.sessionOnly}
          </p>
        )}

        {encounterView.active && (
          <EncounterPanel
            view={encounterView}
            onAction={onGameplayCommand}
            disabled={!durable.ready || cinematicLease}
          />
        )}

        <section className="scene-stage" aria-label="3D game scene">
          {active && ActiveScene && target ? (
            <Canvas
              key={canvasVersion}
              frameloop="demand"
              camera={{ position: [0, 8, 9], fov: 48 }}
              onCreated={onCreated}
            >
              <SceneFrameProbe key={`${active.definition.map.id}:${active.entryAnchorId}`} />
              <CinematicStage
                timeline={bloodLeafLanternAwakening}
                playerRef={timelineRef}
                pendingEventsRef={pendingTimelineEventsRef}
                onEvent={onCinematicEvent}
                onStatus={onCinematicStatus}
                onEffect={onCinematicEffect}
                onRelease={onCinematicRelease}
                onLeaseActive={onCinematicLease}
              />
              <SceneCamera configuration={active.definition.camera} target={target} />
              <ActiveScene
                entryAnchorId={active.entryAnchorId}
                runtime={runtime}
                presentation={{
                  lanternAccent,
                  guardianAction: guardianPresentation.action,
                  guardianActionRevision: guardianPresentation.revision,
                }}
              />
            </Canvas>
          ) : (
            <p className="loading" data-testid="scene-loading">
              {snapshot.error ? 'Scene failed to load.' : 'Loading first scene…'}
            </p>
          )}
        </section>

        {cinematicCanRun && (
          <fieldset
            className="cinematic-controls"
            dir="rtl"
            lang="fa"
            aria-label="نمایش اختیاری بیداری فانوس"
            aria-busy={cinematicLease}
            data-testid="lantern-cinematic-controls"
          >
            <legend>نمایش بیداری فانوس</legend>
            {reducedMotion && (
              <output data-testid="cinematic-reduced-motion">پویانمایی کاهش‌یافته</output>
            )}
            <button
              ref={cinematicOpenerRef}
              data-testid="cinematic-play"
              type="button"
              disabled={cinematicLease}
              onClick={playLanternSequence}
            >
              {cinematicStatus === 'completed' || cinematicStatus === 'cancelled'
                ? 'نمایش دوباره'
                : 'تماشای نمایش'}
            </button>
            {(cinematicStatus === 'playing' || cinematicStatus === 'waiting') && (
              <>
                <button
                  data-testid="cinematic-skip"
                  type="button"
                  onClick={() => skipLanternSequence()}
                >
                  رد کردن
                </button>
                <button
                  data-testid="cinematic-cancel"
                  type="button"
                  onClick={cancelLanternSequence}
                >
                  بستن
                </button>
              </>
            )}
            {cinematicStatus === 'waiting' && (
              <button
                data-testid="cinematic-continue"
                type="button"
                onClick={continueLanternSequence}
              >
                ادامه
              </button>
            )}
            <output data-testid="cinematic-status" data-status={cinematicStatus} aria-live="polite">
              {cinematicStatus === 'waiting'
                ? 'نمایش منتظر ادامه است'
                : cinematicStatus === 'playing'
                  ? 'نمایش در حال اجراست'
                  : 'نمایش آماده است'}
            </output>
          </fieldset>
        )}
        {cinematicCaption && (
          <section
            className="cinematic-caption"
            data-testid="cinematic-caption"
            role="status"
            aria-live="polite"
            dir="rtl"
            lang="fa"
            aria-label="گفتار نگهبان"
          >
            <p>{cinematicCaption}</p>
          </section>
        )}

        {contextLost && (
          <div className="recovery" role="alert">
            <span>Graphics stopped. Rebuild the view to continue.</span>
            <button
              data-testid="restore-context"
              type="button"
              onClick={() => {
                canvasLive.current = false;
                setContextLost(false);
                setCanvasVersion((version) => version + 1);
              }}
            >
              Rebuild 3D view
            </button>
          </div>
        )}
      </main>

      <DialogueDialog
        view={dialogue}
        speakerName={bloodLeafCopy.guardian}
        choicesLabel={bloodLeafCopy.choicesLabel}
        continueLabel={bloodLeafCopy.continue}
        finishLabel={bloodLeafCopy.finish}
        closeLabel={bloodLeafCopy.close}
        leaveLabel={bloodLeafCopy.leave}
        onCommand={onNarrativeCommand}
        openerRef={dialogueOpenerRef}
        fallbackFocusRef={mainRef}
      />
    </>
  );
}
