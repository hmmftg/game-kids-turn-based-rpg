import { compileTimeline } from 'waypoint-rpg-three';
import type { TimelineDefinition, TimelineRegistry } from 'waypoint-rpg-three';
import { faUi } from '../content/fa/ui.js';

const gardenEndingRegistry: TimelineRegistry = {
  cameras: {
    blossom: { position: [-1.8, 10, 5], lookAt: [-2.2, 1.6, -1.8] },
    lantern: { position: [5.5, 10, 6], lookAt: [4, 1.8, 2] },
  },
  actors: ['hero', 'guardian'],
  dialogues: {
    'tree-ending': { text: faUi.gardenerEnding, locale: 'fa-IR' },
    'lantern-ending': { text: faUi.lanternEnding, locale: 'fa-IR' },
  },
  effects: {},
  audio: {},
};

const definitions: Readonly<Record<'ending-garden' | 'ending-lantern', TimelineDefinition>> = {
  'ending-garden': {
    id: 'garden-tree-ending',
    version: 1,
    durationSeconds: 2.4,
    cues: [
      {
        id: 'frame-grown-tree',
        atSeconds: 0,
        kind: 'camera',
        cameraId: 'blossom',
        durationSeconds: 0.7,
      },
      {
        id: 'celebrate-together',
        atSeconds: 0.25,
        kind: 'animation',
        actorId: 'hero',
        action: 'interact',
      },
      { id: 'tree-story-line', atSeconds: 0.75, kind: 'dialogue', dialogueId: 'tree-ending' },
    ],
  },
  'ending-lantern': {
    id: 'garden-lantern-ending',
    version: 1,
    durationSeconds: 2.4,
    cues: [
      {
        id: 'frame-lit-lantern',
        atSeconds: 0,
        kind: 'camera',
        cameraId: 'lantern',
        durationSeconds: 0.7,
      },
      {
        id: 'greet-guardian',
        atSeconds: 0.25,
        kind: 'animation',
        actorId: 'guardian',
        action: 'interact',
      },
      { id: 'lantern-story-line', atSeconds: 0.75, kind: 'dialogue', dialogueId: 'lantern-ending' },
    ],
  },
};

export type GardenEndingId = keyof typeof definitions;

export function createGardenEndingTimeline(endingId: GardenEndingId) {
  return compileTimeline(definitions[endingId], gardenEndingRegistry);
}

export { gardenEndingRegistry };
