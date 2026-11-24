import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Quaternion, Vector3 } from 'three';
import type {
  CompiledTimeline,
  TimelineEvent,
  TimelinePlayer,
  TimelineStatus,
} from './timeline.js';
import { sceneProbe } from '../probe.js';

const MAX_PRESENTATION_FRAME_SECONDS = 0.05;

interface CinematicStageProps {
  readonly timeline: CompiledTimeline;
  readonly playerRef: MutableRefObject<TimelinePlayer | null>;
  readonly pendingEventsRef: MutableRefObject<TimelineEvent[]>;
  readonly onEvent: (event: TimelineEvent) => void;
  readonly onStatus: (status: TimelineStatus) => void;
  readonly onEffect: (effectId: string, active: boolean) => void;
  readonly onRelease: () => void;
  readonly onLeaseActive: (active: boolean) => void;
}

interface CameraPose {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
}

interface CameraTrack {
  readonly cameraId: string;
  readonly startTime: number;
  readonly durationSeconds: number;
  readonly fromPosition: Vector3;
  readonly fromLookAt: Vector3;
}

export function CinematicStage({
  timeline,
  playerRef,
  pendingEventsRef,
  onEvent,
  onStatus,
  onEffect,
  onRelease,
  onLeaseActive,
}: CinematicStageProps) {
  const { camera, invalidate } = useThree();
  const originalCamera = useRef<CameraPose | null>(null);
  const cameraTrack = useRef<CameraTrack | null>(null);
  const previousExecution = useRef(0);
  const previousStatus = useRef<TimelineStatus>('idle');
  const activeEffects = useRef(new Map<string, number>());
  const leaseOwned = useRef(false);
  const callbacks = useRef({ onEvent, onStatus, onEffect, onRelease, onLeaseActive });

  useEffect(() => {
    callbacks.current = { onEvent, onStatus, onEffect, onRelease, onLeaseActive };
  }, [onEvent, onStatus, onEffect, onRelease, onLeaseActive]);

  const releasePresentation = () => {
    if (!leaseOwned.current) return;
    leaseOwned.current = false;
    if (originalCamera.current) {
      camera.position.copy(originalCamera.current.position);
      camera.quaternion.copy(originalCamera.current.quaternion);
      cameraTrack.current = null;
      originalCamera.current = null;
      camera.updateMatrixWorld();
      invalidate();
    }
    for (const effectId of activeEffects.current.keys())
      callbacks.current.onEffect(effectId, false);
    activeEffects.current.clear();
    callbacks.current.onLeaseActive(false);
    callbacks.current.onRelease();
  };

  useEffect(
    () => () => {
      const player = playerRef.current;
      player?.cancel();
      releasePresentation();
      if (player) callbacks.current.onStatus(player.snapshot().status);
    },
    [playerRef],
  );

  useFrame((_, deltaSeconds) => {
    const player = playerRef.current;
    if (!player) return;
    const before = player.snapshot();
    // A stalled browser frame must not jump over short authored presentation cues.
    const presentationDelta = Math.min(deltaSeconds, MAX_PRESENTATION_FRAME_SECONDS);
    const isActive = before.status === 'playing' || before.status === 'waiting';

    if (isActive && before.executionId !== previousExecution.current) {
      releasePresentation();
      originalCamera.current = {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
      };
      leaseOwned.current = true;
      previousExecution.current = before.executionId;
      callbacks.current.onLeaseActive(true);
    }

    const events = [
      ...pendingEventsRef.current.splice(0),
      ...(before.status === 'playing' ? player.advance(presentationDelta) : []),
    ];
    for (const event of events) {
      if (!player.isCurrentExecution(event.executionId)) continue;
      if (before.reducedMotion && event.cue.kind !== 'dialogue' && event.cue.kind !== 'wait')
        continue;
      if (event.cue.kind === 'camera') {
        const pose = timeline.registry.cameras[event.cue.cameraId];
        if (!pose) continue;
        const direction = camera.getWorldDirection(new Vector3());
        cameraTrack.current = {
          cameraId: event.cue.cameraId,
          startTime: event.cue.atSeconds,
          durationSeconds: event.cue.durationSeconds,
          fromPosition: camera.position.clone(),
          fromLookAt: camera.position.clone().add(direction.multiplyScalar(5)),
        };
      } else if (event.cue.kind === 'effect') {
        const owner = timeline.registry.effects[event.cue.effectId];
        if (owner) {
          activeEffects.current.set(event.cue.effectId, event.cue.durationSeconds);
          callbacks.current.onEffect(event.cue.effectId, true);
        }
      } else {
        callbacks.current.onEvent(event);
      }
    }

    const after = player.snapshot();
    if (after.status === 'playing') {
      for (const [effectId, remaining] of activeEffects.current) {
        const next = remaining - presentationDelta;
        if (next <= 0) {
          activeEffects.current.delete(effectId);
          callbacks.current.onEffect(effectId, false);
        } else activeEffects.current.set(effectId, next);
      }
    }

    if (cameraTrack.current && after.status === 'playing') {
      const track = cameraTrack.current;
      const pose = timeline.registry.cameras[track.cameraId];
      if (pose) {
        const progress =
          track.durationSeconds === 0
            ? 1
            : Math.max(
                0,
                Math.min(1, (after.timeSeconds - track.startTime) / track.durationSeconds),
              );
        camera.position.lerpVectors(track.fromPosition, new Vector3(...pose.position), progress);
        camera.lookAt(track.fromLookAt.clone().lerp(new Vector3(...pose.lookAt), progress));
        if (progress >= 1) cameraTrack.current = null;
      }
    }

    if (after.status !== previousStatus.current) callbacks.current.onStatus(after.status);
    const ended =
      after.status === 'completed' || after.status === 'cancelled' || after.status === 'disposed';
    if (ended && previousStatus.current !== after.status) releasePresentation();
    previousStatus.current = after.status;
    const probe = sceneProbe();
    if (probe) probe.cameraPosition = camera.position.toArray();
    if (after.status === 'playing' || cameraTrack.current || activeEffects.current.size > 0)
      invalidate();
  });

  return null;
}
