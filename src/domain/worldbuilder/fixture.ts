import type { NpcDefinition } from '../world/types.ts';
import type { WorldBuilderDocument, WorldRuntimeData } from './document.ts';
import { fromRuntime } from './document.ts';

/**
 * Minimal valid world fixture shared by the worldbuilder tests:
 * map-town-ish world with two areas, plus a second map linked by a transition.
 *
 * ```text
 * map-a: a1 [s1—s2—s3] (s3 is a2's spawn)  transition t: s2 → s4
 * map-b: a3 [s4]
 * ```
 */
export const FIXTURE_NPCS: readonly NpcDefinition[] = [
  {
    id: 'npc-test',
    archetype: 'neighbour',
    anchorId: 'anchor-s1',
    homeAreaId: 'area-a1',
    dialogueIds: ['test-intro'],
  },
];

export const FIXTURE_RUNTIME: WorldRuntimeData = {
  maps: [
    {
      id: 'map-a',
      labelFa: 'الف',
      bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
      spawnAnchorId: 'anchor-s1',
      environment: {
        clearColor: '#000000',
        fog: null,
        skyDome: false,
        hemisphere: { sky: '#000000', ground: '#000000', intensity: 1 },
        directionals: [],
      },
    },
    {
      id: 'map-b',
      labelFa: 'ب',
      bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 },
      spawnAnchorId: 'anchor-s4',
      environment: {
        clearColor: '#111111',
        fog: null,
        skyDome: false,
        hemisphere: { sky: '#111111', ground: '#111111', intensity: 1 },
        directionals: [],
      },
    },
  ],
  areas: [
    {
      id: 'area-a1',
      labelFa: 'یک',
      bounds: { minX: 0, maxX: 5, minZ: 0, maxZ: 10 },
      spawnAnchorId: 'anchor-s1',
    },
    {
      id: 'area-a2',
      labelFa: 'دو',
      bounds: { minX: 5, maxX: 10, minZ: 0, maxZ: 10 },
      spawnAnchorId: 'anchor-s3',
    },
    {
      id: 'area-a3',
      labelFa: 'سه',
      bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 },
      spawnAnchorId: 'anchor-s4',
    },
  ],
  areaMapIds: { 'area-a1': 'map-a', 'area-a2': 'map-a', 'area-a3': 'map-b' },
  anchors: [
    {
      id: 'anchor-s1',
      x: 1,
      z: 1,
      walkable: true,
      areaId: 'area-a1',
      mapId: 'map-a',
      npcId: 'npc-test',
      landmarkId: null,
      labelFa: 'یک',
    },
    {
      id: 'anchor-s2',
      x: 3,
      z: 1,
      walkable: true,
      areaId: 'area-a1',
      mapId: 'map-a',
      npcId: null,
      landmarkId: null,
      transitionId: 'transition-t1',
      labelFa: 'دو',
    },
    {
      id: 'anchor-s3',
      x: 7,
      z: 1,
      walkable: true,
      areaId: 'area-a2',
      mapId: 'map-a',
      npcId: null,
      landmarkId: 'landmark-test',
      labelFa: 'سه',
    },
    {
      id: 'anchor-s4',
      x: 1,
      z: 1,
      walkable: true,
      areaId: 'area-a3',
      mapId: 'map-b',
      npcId: null,
      landmarkId: null,
      labelFa: 'چهار',
    },
  ],
  edges: [
    { from: 'anchor-s1', to: 'anchor-s2' },
    { from: 'anchor-s2', to: 'anchor-s3' },
  ],
  transitions: [
    {
      id: 'transition-t1',
      fromMap: 'map-a',
      fromAnchor: 'anchor-s2',
      toMap: 'map-b',
      toAnchor: 'anchor-s4',
    },
  ],
  npcDefinitions: FIXTURE_NPCS,
};

export function fixtureDocument(): WorldBuilderDocument {
  return fromRuntime(FIXTURE_RUNTIME);
}
