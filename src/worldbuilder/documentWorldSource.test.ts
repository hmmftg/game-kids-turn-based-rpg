import { describe, expect, it } from 'vitest';
import type { AnchorId } from '../domain/game/types.ts';
import type { WorldBuilderDocument } from '../domain/worldbuilder/document.ts';
import { getAnchor, getAnchorOrNull, neighboursOf } from '../world/navigation/graph.ts';
import { findPath } from '../world/navigation/pathfinding.ts';
import { getMap, transitionForAnchor } from '../world/maps.ts';
import { resolveNpcAnchor, resolveNpcStand } from '../world/registry.ts';
import { STATIC_WORLD_SOURCE } from '../world/worldSource.ts';
import { documentFromRuntime, documentToWorldSource } from './runtimeAdapter.ts';

/**
 * The H-2 proof point: one edited `WorldBuilderDocument` compiles into a
 * `WorldSource` that drives the ordinary traversal/NPC/transition helpers —
 * while `STATIC_WORLD_SOURCE` keeps resolving the shipped world untouched.
 */
function editedDoc(): WorldBuilderDocument {
  const doc = documentFromRuntime();
  const elder = doc.npcPlacements.find((p) => p.npcId === 'npc-elder');
  if (!elder) throw new Error('missing npc-elder placement');
  return {
    ...doc,
    npcPlacements: doc.npcPlacements.map((p) =>
      p.npcId === 'npc-elder' ? { ...p, anchorId: 'anchor-path-east' } : p,
    ),
  };
}

describe('DocumentWorldSource drives existing world helpers', () => {
  it('moves an unscheduled NPC home via its placement — static source unchanged', () => {
    const doc = editedDoc();
    const result = documentToWorldSource(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const elder = result.source.npcDefinitions.find((npc) => npc.id === 'npc-elder');
    expect(elder).toBeDefined();
    if (!elder) return;
    // Edited document: the elder's home is the park anchor.
    expect(resolveNpcAnchor(result.source, elder, 0)).toBe('anchor-path-east');
    expect(getAnchor(result.source, 'anchor-path-east').npcId).toBe('npc-elder');
    expect(getAnchor(result.source, 'anchor-square').npcId).toBeNull();
    // Shipped world: still the square — no registry mutation leaked.
    expect(resolveNpcAnchor(STATIC_WORLD_SOURCE, elder, 0)).toBe('anchor-square');
    expect(getAnchor(STATIC_WORLD_SOURCE, 'anchor-square').npcId).toBe('npc-elder');
  });

  it('walks a brand-new anchor added to map-town via a new edge', () => {
    const doc = editedDoc();
    const extended: WorldBuilderDocument = {
      ...doc,
      anchors: [
        ...doc.anchors,
        {
          id: 'anchor-builder-test' as AnchorId,
          x: 1,
          z: 1,
          walkable: true,
          areaId: 'area-town' as never,
          mapId: 'map-town' as never,
          landmarkId: null,
          labelFa: 'تست',
        },
      ],
      edges: [...doc.edges, { from: 'anchor-builder-test', to: 'anchor-square' }],
    };
    const result = documentToWorldSource(extended);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The new anchor is reachable through the ordinary pathfinder.
    expect(findPath(result.source, 'anchor-square', 'anchor-builder-test')).toEqual([
      'anchor-square',
      'anchor-builder-test',
    ]);
    expect(neighboursOf(result.source, 'anchor-builder-test')).toEqual(['anchor-square']);
    // Static graph is untouched — the new anchor does not exist there.
    expect(getAnchorOrNull(STATIC_WORLD_SOURCE, 'anchor-builder-test' as AnchorId)).toBeNull();
  });

  it('resolves map + transition data through the document source', () => {
    const doc = documentFromRuntime();
    const result = documentToWorldSource(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getMap(result.source, 'map-cave').spawnAnchorId).toBe('anchor-cave-mouth');
    expect(transitionForAnchor(result.source, 'anchor-cave-entrance')?.toMap).toBe('map-cave');
  });

  it('applies placement offsets to an unscheduled NPC stand position', () => {
    const doc = editedDoc();
    const result = documentToWorldSource({
      ...doc,
      npcPlacements: doc.npcPlacements.map((p) =>
        p.npcId === 'npc-elder' ? { ...p, offsetX: 0.5, offsetZ: -0.2 } : p,
      ),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const elder = result.source.npcDefinitions.find((npc) => npc.id === 'npc-elder');
    if (!elder) throw new Error('missing npc-elder');
    const stand = resolveNpcStand(result.source, elder, 0);
    expect(stand.anchorId).toBe('anchor-path-east');
    expect(stand.offsetX).toBe(0.5);
    expect(stand.offsetZ).toBe(-0.2);
  });
});
