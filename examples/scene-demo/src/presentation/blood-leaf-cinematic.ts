import { compileTimeline } from './timeline.js';

/** The sequence is offered only after the saved narrative fact lantern-lit is true. */
export const bloodLeafTimelineRegistry = {
  cameras: {
    lantern: { position: [2.9, 3.2, 5.1], lookAt: [1, 1.3, 1] },
    workshop: { position: [7, 7, 9], lookAt: [0, 0, 0] },
  },
  actors: ['guardian'],
  dialogues: {
    lanternAwakens: {
      locale: 'fa-IR',
      text: 'چراغ روشن است؛ نوری که با دانایی پیدا شد، راه باغ را نشان می‌دهد.',
    },
  },
  effects: { lanternGlow: { ownerId: 'lantern' } },
  audio: { gentleChime: { durationSeconds: 0.28, channel: 'ambience' } },
} as const;

export const bloodLeafLanternAwakening = compileTimeline(
  {
    id: 'blood-leaf-lantern-awakening',
    version: 1,
    durationSeconds: 4,
    cues: [
      {
        id: 'frame-lantern',
        atSeconds: 0,
        kind: 'camera',
        cameraId: 'lantern',
        durationSeconds: 1.2,
      },
      {
        id: 'guardian-acknowledges',
        atSeconds: 0.4,
        kind: 'animation',
        actorId: 'guardian',
        action: 'interact',
      },
      { id: 'lantern-line', atSeconds: 1.55, kind: 'dialogue', dialogueId: 'lanternAwakens' },
      { id: 'soft-chime', atSeconds: 1.85, kind: 'audio', audioId: 'gentleChime' },
      {
        id: 'accent-committed-lantern',
        atSeconds: 1.85,
        kind: 'effect',
        effectId: 'lanternGlow',
        durationSeconds: 1.1,
      },
      {
        id: 'restore-workshop-view',
        atSeconds: 3.1,
        kind: 'camera',
        cameraId: 'workshop',
        durationSeconds: 0.6,
      },
      {
        id: 'continue-story',
        atSeconds: 4,
        kind: 'wait',
        waitId: 'continue-after-lantern',
        mode: 'continue',
      },
    ],
  },
  bloodLeafTimelineRegistry,
);
