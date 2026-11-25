import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { PerspectiveCamera } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompiledTimeline, TimelineEvent, TimelinePlayer } from 'waypoint-rpg-three';

const r3f = vi.hoisted(() => ({
  frame: null as ((state: unknown, deltaSeconds: number) => void) | null,
  invalidateCount: 0,
  camera: null as PerspectiveCamera | null,
}));

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: unknown, deltaSeconds: number) => void) => {
    r3f.frame = callback;
  },
  useThree: () => ({
    camera: r3f.camera,
    invalidate: () => {
      r3f.invalidateCount += 1;
    },
  }),
}));

import { CinematicStage } from './CinematicStage.js';
import { bloodLeafTimelineRegistry } from './blood-leaf-cinematic.js';
import { compileTimeline, createTimelinePlayer } from 'waypoint-rpg-three';

const roots: ReturnType<typeof createRoot>[] = [];
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function mountStage(
  timeline: CompiledTimeline,
  playerRef: { current: TimelinePlayer | null },
  pendingEvents: { current: TimelineEvent[] },
  callbacks: {
    onEvent: (event: TimelineEvent) => void;
    onRelease: () => void;
  },
) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(
      createElement(CinematicStage, {
        timeline,
        playerRef,
        pendingEventsRef: pendingEvents,
        onEvent: callbacks.onEvent,
        onStatus: () => {},
        onEffect: () => {},
        onRelease: callbacks.onRelease,
        onLeaseActive: () => {},
      }),
    );
  });
  return () => {
    if (!r3f.frame) throw new Error('CinematicStage did not register its frame callback.');
    act(() => r3f.frame?.({}, 0.05));
  };
}

beforeEach(() => {
  r3f.camera = new PerspectiveCamera();
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  r3f.frame = null;
  r3f.camera = null;
  r3f.invalidateCount = 0;
});

describe('CinematicStage demand-render lifecycle', () => {
  it('releases skipped dialogue even when skip completes before the first frame', () => {
    const timeline = compileTimeline(
      {
        id: 'skip-before-first-frame',
        version: 1,
        durationSeconds: 2,
        cues: [
          { id: 'line', atSeconds: 0.2, kind: 'dialogue', dialogueId: 'lanternAwakens' },
          { id: 'wait', atSeconds: 1, kind: 'wait', waitId: 'continue', mode: 'continue' },
        ],
      },
      bloodLeafTimelineRegistry,
    );
    const player = createTimelinePlayer(timeline);
    const run = player.play();
    let caption = '';
    const renderFrame = mountStage(
      timeline,
      { current: player },
      { current: [...player.skip(run)] },
      {
        onEvent: (event) => {
          if (event.cue.kind === 'dialogue')
            caption = timeline.registry.dialogues[event.cue.dialogueId]!.text;
        },
        onRelease: () => {
          caption = '';
        },
      },
    );

    expect(player.snapshot().status).toBe('completed');
    renderFrame();
    expect(caption).toBe('');
  });

  it('does not request frames while a camera and effect are paused at a wait', () => {
    const timeline = compileTimeline(
      {
        id: 'tracks-paused-at-wait',
        version: 1,
        durationSeconds: 3,
        cues: [
          { id: 'camera', atSeconds: 0, kind: 'camera', cameraId: 'lantern', durationSeconds: 2 },
          {
            id: 'effect',
            atSeconds: 0,
            kind: 'effect',
            effectId: 'lanternGlow',
            durationSeconds: 2,
          },
          { id: 'wait', atSeconds: 1, kind: 'wait', waitId: 'continue', mode: 'continue' },
        ],
      },
      bloodLeafTimelineRegistry,
    );
    const player = createTimelinePlayer(timeline);
    const run = player.play();
    const pending = [...player.advance(run, 1)];
    r3f.camera = new PerspectiveCamera();
    const renderFrame = mountStage(
      timeline,
      { current: player },
      { current: pending },
      { onEvent: () => {}, onRelease: () => {} },
    );

    expect(player.snapshot().status).toBe('waiting');
    renderFrame();
    expect(r3f.invalidateCount).toBe(0);
  });
});
