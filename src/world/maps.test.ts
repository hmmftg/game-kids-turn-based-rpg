import { describe, expect, it } from 'vitest';
import type { AnchorId } from '../domain/game/types.ts';
import { QUEST_DEFINITIONS } from '../domain/quests/definitions.ts';
import { ANCHORS, EDGES, getAnchor } from './navigation/graph.ts';
import { STATIC_WORLD_SOURCE } from './worldSource.ts';
import { getMap, MAP_TRANSITIONS, transitionForAnchor, WORLD_MAPS } from './maps.ts';
import { NPC_DEFINITIONS, WORLD_AREAS, insideBounds } from './registry.ts';

describe('world map registry', () => {
  it('map ids are unique and every map has a valid spawn anchor', () => {
    const ids = new Set(WORLD_MAPS.map((map) => map.id));
    expect(ids.size).toBe(WORLD_MAPS.length);
    for (const map of WORLD_MAPS) {
      const spawn = getAnchor(STATIC_WORLD_SOURCE, map.spawnAnchorId as AnchorId);
      expect(spawn.mapId, `${map.id} spawn`).toBe(map.id);
      expect(spawn.walkable, `${map.id} spawn`).toBe(true);
      expect(insideBounds(map.bounds, spawn.x, spawn.z), `${map.id} spawn`).toBe(true);
    }
  });

  it("every anchor lives on a known map inside that map's bounds", () => {
    for (const anchor of ANCHORS) {
      const map = WORLD_MAPS.find((m) => m.id === anchor.mapId);
      expect(map, `${anchor.id} on ${anchor.mapId}`).toBeDefined();
      expect(insideBounds(map!.bounds, anchor.x, anchor.z), anchor.id).toBe(true);
    }
  });

  it('no navigation edge crosses maps — transitions are the only way', () => {
    for (const edge of EDGES) {
      expect(
        getAnchor(STATIC_WORLD_SOURCE, edge.from).mapId ===
          getAnchor(STATIC_WORLD_SOURCE, edge.to).mapId,
        `${edge.from}→${edge.to}`,
      ).toBe(true);
    }
  });
});

describe('map transitions', () => {
  it('transition ids are unique and both endpoints are real walkable anchors', () => {
    expect(new Set(MAP_TRANSITIONS.map((t) => t.id)).size).toBe(MAP_TRANSITIONS.length);
    for (const transition of MAP_TRANSITIONS) {
      const from = getAnchor(STATIC_WORLD_SOURCE, transition.fromAnchor as AnchorId);
      const to = getAnchor(STATIC_WORLD_SOURCE, transition.toAnchor as AnchorId);
      expect(from.mapId, transition.id).toBe(transition.fromMap);
      expect(from.transitionId, transition.id).toBe(transition.id);
      expect(to.mapId, transition.id).toBe(transition.toMap);
      expect(to.walkable, transition.id).toBe(true);
      expect(insideBounds(getMap(STATIC_WORLD_SOURCE, transition.toMap).bounds, to.x, to.z)).toBe(
        true,
      );
    }
  });

  it('the cave entrance and exit link the same pair of anchors both ways', () => {
    const enter = MAP_TRANSITIONS.find((t) => t.id === 'transition-cave-entrance');
    const exit = MAP_TRANSITIONS.find((t) => t.id === 'transition-cave-exit');
    expect(enter).toBeDefined();
    expect(exit).toBeDefined();
    // Leaving the cave returns to the exact outdoor entrance, not the square.
    expect(exit!.toAnchor).toBe(enter!.fromAnchor);
    expect(enter!.toAnchor).toBe(exit!.fromAnchor);
    // The secret is discovered once; the exit is always plain travel.
    expect(enter!.discoveryId).toBe('discovery-cave-entrance');
    expect(exit!.discoveryId).toBeUndefined();
    expect(transitionForAnchor(STATIC_WORLD_SOURCE, 'anchor-cave-entrance')?.id).toBe(enter!.id);
    expect(transitionForAnchor(STATIC_WORLD_SOURCE, 'anchor-cave-mouth')?.id).toBe(exit!.id);
    expect(transitionForAnchor(STATIC_WORLD_SOURCE, 'anchor-square')).toBeNull();
  });
});

describe('map content ownership', () => {
  it('cave anchors, area, NPC and quest all live on map-cave', () => {
    const caveAnchors = ANCHORS.filter((a) => a.mapId === 'map-cave');
    expect(caveAnchors.length).toBeGreaterThanOrEqual(4);
    for (const anchor of caveAnchors) {
      expect(anchor.areaId, anchor.id).toBe('area-cave');
    }
    const caveArea = WORLD_AREAS.find((a) => a.id === 'area-cave');
    expect(caveArea).toBeDefined();
    const caveNpc = NPC_DEFINITIONS.find((n) => n.homeAreaId === 'area-cave');
    expect(caveNpc?.id).toBe('npc-cave-mouse');
    expect(getAnchor(STATIC_WORLD_SOURCE, caveNpc!.anchorId).mapId).toBe('map-cave');
  });

  it('a quest never mounts on the wrong map: quest.mapId matches its anchor', () => {
    for (const quest of QUEST_DEFINITIONS) {
      const anchor = getAnchor(STATIC_WORLD_SOURCE, quest.anchorId as AnchorId);
      expect(anchor.mapId, quest.id).toBe(quest.mapId ?? 'map-town');
    }
    const caveQuests = QUEST_DEFINITIONS.filter((q) => q.mapId === 'map-cave');
    expect(caveQuests.map((q) => q.id)).toEqual(['quest-cave-crystal']);
    // ...so on map-town the cave quest subtree never mounts, and vice versa.
    const townQuests = QUEST_DEFINITIONS.filter((q) => (q.mapId ?? 'map-town') === 'map-town');
    expect(townQuests.map((q) => q.id)).not.toContain('quest-cave-crystal');
  });
});
