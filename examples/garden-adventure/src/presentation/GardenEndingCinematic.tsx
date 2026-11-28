import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, Vector3 } from 'three';
import type { Camera, Quaternion } from 'three';
import { createTimelinePlayer } from 'waypoint-rpg-three';
import type { TimelineEvent, TimelinePlayer } from 'waypoint-rpg-three';
import { createGardenEndingTimeline, type GardenEndingId } from './ending-cinematic.js';

const MAX_PRESENTATION_FRAME_SECONDS = 0.05;

interface CameraPose {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  readonly zoom: number | null;
}

interface CameraTrack {
  readonly position: Vector3;
  readonly lookAt: Vector3;
  readonly targetPosition: Vector3;
  readonly targetLookAt: Vector3;
  readonly startSeconds: number;
  readonly durationSeconds: number;
}

export function GardenEndingCinematic({
  endingId,
  requestId,
  onEvent,
  onComplete,
}: {
  readonly endingId: GardenEndingId;
  readonly requestId: string;
  readonly onEvent: (event: TimelineEvent) => void;
  readonly onComplete: (requestId: string) => void;
}) {
  const { camera, invalidate } = useThree();
  const timeline = useMemo(() => createGardenEndingTimeline(endingId), [endingId]);
  const player = useRef<TimelinePlayer | null>(null);
  const callbacks = useRef({ onEvent, onComplete });
  const originalCamera = useRef<CameraPose | null>(null);
  const cameraTrack = useRef<CameraTrack | null>(null);
  const executionId = useRef(0);
  const completed = useRef(false);

  useEffect(() => {
    callbacks.current = { onEvent, onComplete };
  }, [onComplete, onEvent]);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ownedPlayer = createTimelinePlayer(timeline);
    player.current = ownedPlayer;
    const pose: CameraPose = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      zoom: camera instanceof OrthographicCamera ? camera.zoom : null,
    };
    originalCamera.current = pose;
    completed.current = false;
    executionId.current = ownedPlayer.play({ reducedMotion });
    reportCinematic(endingId, requestId, 'playing', camera.position.toArray());
    invalidate();

    return () => {
      const snapshot = ownedPlayer.snapshot();
      const finalStatus = snapshot.status === 'completed' ? 'completed' : 'cancelled';
      ownedPlayer.cancel(snapshot.executionId);
      ownedPlayer.dispose();
      if (player.current === ownedPlayer) player.current = null;
      cameraTrack.current = null;
      const original = originalCamera.current;
      if (original) restoreCamera(camera, original);
      originalCamera.current = null;
      reportCinematic(endingId, requestId, finalStatus, camera.position.toArray());
      invalidate();
    };
  }, [camera, endingId, invalidate, requestId, timeline]);

  useFrame((state, deltaSeconds) => {
    const activePlayer = player.current;
    if (!activePlayer) return;
    const activeCamera = state.camera;
    const activeExecution = executionId.current;
    const before = activePlayer.snapshot();
    if (before.status !== 'playing' || !activePlayer.isCurrentExecution(activeExecution)) return;

    const events = activePlayer.advance(
      activeExecution,
      Math.min(deltaSeconds, MAX_PRESENTATION_FRAME_SECONDS),
    );
    for (const event of events) {
      if (!activePlayer.isCurrentExecution(event.executionId)) continue;
      if (before.reducedMotion && event.cue.kind !== 'dialogue') continue;
      if (event.cue.kind === 'camera') {
        const preset = timeline.registry.cameras[event.cue.cameraId];
        if (!preset) continue;
        const direction = activeCamera.getWorldDirection(new Vector3());
        cameraTrack.current = {
          position: activeCamera.position.clone(),
          lookAt: activeCamera.position.clone().add(direction.multiplyScalar(5)),
          targetPosition: new Vector3(...preset.position),
          targetLookAt: new Vector3(...preset.lookAt),
          startSeconds: event.cue.atSeconds,
          durationSeconds: event.cue.durationSeconds,
        };
        if (activeCamera instanceof OrthographicCamera) activeCamera.zoom = 1.2;
      } else callbacks.current.onEvent(event);
    }

    const after = activePlayer.snapshot();
    const track = cameraTrack.current;
    if (!after.reducedMotion && after.status === 'playing' && track) {
      const progress =
        track.durationSeconds === 0
          ? 1
          : Math.max(
              0,
              Math.min(1, (after.timeSeconds - track.startSeconds) / track.durationSeconds),
            );
      activeCamera.position.lerpVectors(track.position, track.targetPosition, progress);
      activeCamera.lookAt(track.lookAt.clone().lerp(track.targetLookAt, progress));
      if (progress >= 1) cameraTrack.current = null;
      if (activeCamera instanceof OrthographicCamera) activeCamera.updateProjectionMatrix();
      activeCamera.updateMatrixWorld();
    }
    reportCinematic(endingId, requestId, 'playing', activeCamera.position.toArray());

    if (after.status === 'playing') {
      invalidate();
      return;
    }
    if (after.status === 'completed' && !completed.current) {
      completed.current = true;
      const original = originalCamera.current;
      if (original) restoreCamera(activeCamera, original);
      cameraTrack.current = null;
      reportCinematic(endingId, requestId, 'completed', activeCamera.position.toArray());
      callbacks.current.onComplete(requestId);
      invalidate();
    }
  });

  return null;
}

function reportCinematic(
  endingId: GardenEndingId,
  requestId: string,
  status: 'playing' | 'cancelled' | 'completed',
  position: readonly [number, number, number],
) {
  if (new URLSearchParams(window.location.search).get('cinematicprobe') !== '1') return;
  const previous = window.__gardenEndingCinematicProbe;
  const initialCameraPosition =
    previous?.requestId === requestId ? previous.initialCameraPosition : position;
  window.__gardenEndingCinematicProbe = {
    endingId,
    requestId,
    status,
    cameraPosition: position,
    initialCameraPosition,
  };
}

function restoreCamera(camera: Camera, pose: CameraPose) {
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
  if (camera instanceof OrthographicCamera && pose.zoom !== null) {
    camera.zoom = pose.zoom;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld();
}
