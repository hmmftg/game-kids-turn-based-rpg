import { describe, expect, it } from 'vitest';
import type { WorldBuilderDocument } from './document.ts';
import { FIXTURE_NPCS, fixtureDocument } from './fixture.ts';
import { validateWorldDocument } from './validation.ts';

const codes = (doc: WorldBuilderDocument) =>
  validateWorldDocument(doc, FIXTURE_NPCS).map((i) => i.code);

const edit = (patch: Partial<WorldBuilderDocument>): WorldBuilderDocument => ({
  ...fixtureDocument(),
  ...patch,
});

describe('validateWorldDocument', () => {
  it('accepts the valid fixture', () => {
    expect(validateWorldDocument(fixtureDocument(), FIXTURE_NPCS)).toEqual([]);
  });

  it('flags duplicate and missing ids', () => {
    const doc = fixtureDocument();
    expect(codes(edit({ anchors: [...doc.anchors, doc.anchors[0]!] }))).toContain('duplicate-id');
    expect(codes(edit({ anchors: [{ ...doc.anchors[0]!, id: '' as never }] }))).toContain(
      'missing-id',
    );
  });

  it('flags anchors referencing missing areas/maps or out of bounds', () => {
    const doc = fixtureDocument();
    const badArea = doc.anchors.map((a) =>
      a.id === 'anchor-s1' ? { ...a, areaId: 'area-nope' as never } : a,
    );
    expect(codes(edit({ anchors: badArea }))).toContain('anchor-missing-area');
    const badMap = doc.anchors.map((a) =>
      a.id === 'anchor-s1' ? { ...a, mapId: 'map-nope' as never } : a,
    );
    expect(codes(edit({ anchors: badMap }))).toContain('anchor-missing-map');
    const outOfBounds = doc.anchors.map((a) => (a.id === 'anchor-s1' ? { ...a, x: 999 } : a));
    expect(codes(edit({ anchors: outOfBounds }))).toContain('anchor-out-of-bounds');
  });

  it('flags anchor/area map mismatch', () => {
    const doc = fixtureDocument();
    const anchors = doc.anchors.map((a) =>
      a.id === 'anchor-s4' ? { ...a, areaId: 'area-a1' as never } : a,
    );
    expect(codes(edit({ anchors }))).toContain('anchor-area-map-mismatch');
  });

  it('flags bidirectional transition inconsistency', () => {
    const doc = fixtureDocument();
    // anchor points at a transition whose fromAnchor is a different anchor.
    const transitions = doc.transitions.map((t) =>
      t.id === 'transition-t1' ? { ...t, fromAnchor: 'anchor-s4' as never } : t,
    );
    const found = codes(edit({ transitions }));
    expect(found).toContain('transition-mismatched-anchor');
    expect(found).toContain('transition-from-anchor-map'); // s4 lives on map-b, not map-a
    const anchors = doc.anchors.map((a) =>
      a.id === 'anchor-s2' ? { ...a, transitionId: 'transition-nope' as never } : a,
    );
    expect(codes(edit({ anchors }))).toContain('anchor-missing-transition');
    // toAnchor on the wrong map.
    const badTo = doc.transitions.map((t) =>
      t.id === 'transition-t1' ? { ...t, toAnchor: 'anchor-s1' as never } : t,
    );
    expect(codes(edit({ transitions: badTo }))).toContain('transition-to-anchor-map');
  });

  it('flags edges with missing anchors or crossing maps', () => {
    const doc = fixtureDocument();
    expect(
      codes(edit({ edges: [...doc.edges, { from: 'anchor-s1', to: 'anchor-ghost' as never }] })),
    ).toContain('edge-missing-anchor');
    expect(
      codes(edit({ edges: [...doc.edges, { from: 'anchor-s3', to: 'anchor-s4' }] })),
    ).toContain('edge-crosses-maps');
  });

  it('flags spawn violations', () => {
    const doc = fixtureDocument();
    const maps = doc.maps.map((m) =>
      m.id === 'map-a' ? { ...m, spawnAnchorId: 'anchor-ghost' as never } : m,
    );
    expect(codes(edit({ maps }))).toContain('map-missing-spawn');
    const wrongMap = doc.maps.map((m) =>
      m.id === 'map-a' ? { ...m, spawnAnchorId: 'anchor-s4' as never } : m,
    );
    expect(codes(edit({ maps: wrongMap }))).toContain('map-spawn-wrong-map');
    const badAreaSpawn = doc.areas.map((a) =>
      a.id === 'area-a1' ? { ...a, spawnAnchorId: 'anchor-s3' as never } : a,
    );
    expect(codes(edit({ areas: badAreaSpawn }))).toContain('area-spawn-wrong-area');
  });

  it('enforces the 1↔1 placement contract', () => {
    const doc = fixtureDocument();
    // Missing placement for npc-test.
    expect(codes(edit({ npcPlacements: [] }))).toContain('placement-missing-for-npc');
    // Two home placements on one anchor.
    expect(
      codes(
        edit({
          npcPlacements: [
            ...doc.npcPlacements,
            { npcId: 'npc-other' as never, anchorId: 'anchor-s1' },
          ],
        }),
      ),
    ).toContain('placement-anchor-shared');
    // Two placements for the same NPC.
    expect(
      codes(
        edit({
          npcPlacements: [...doc.npcPlacements, { npcId: 'npc-test', anchorId: 'anchor-s2' }],
        }),
      ),
    ).toContain('placement-duplicate-npc');
    // Placement referencing a missing NPC or anchor.
    expect(
      codes(
        edit({
          npcPlacements: [
            ...doc.npcPlacements,
            { npcId: 'npc-ghost' as never, anchorId: 'anchor-s2' },
          ],
        }),
      ),
    ).toContain('placement-missing-npc');
    expect(
      codes(
        edit({
          npcPlacements: [
            ...doc.npcPlacements,
            { npcId: 'npc-test', anchorId: 'anchor-ghost' as never },
          ],
        }),
      ),
    ).toContain('placement-missing-anchor');
    // Home area mismatch: place npc-test (home a1) on s3 (area-a2).
    expect(
      codes(edit({ npcPlacements: [{ npcId: 'npc-test', anchorId: 'anchor-s3' }] })),
    ).toContain('placement-home-area-mismatch');
  });

  it('flags unreachable walkable anchors per map', () => {
    const doc = fixtureDocument();
    const isolated = {
      id: 'anchor-lonely',
      x: 9,
      z: 9,
      walkable: true,
      areaId: 'area-a2',
      mapId: 'map-a',
      landmarkId: null,
      labelFa: 'تنها',
    } as const;
    expect(codes(edit({ anchors: [...doc.anchors, isolated] }))).toContain('anchor-unreachable');
  });

  it('flags orphan areas', () => {
    const doc = fixtureDocument();
    const orphan = {
      id: 'area-empty' as const,
      labelFa: 'خالی',
      bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 },
      spawnAnchorId: 'anchor-s1' as never,
      mapId: 'map-b' as never,
    };
    const found = codes(edit({ areas: [...doc.areas, orphan] }));
    expect(found).toContain('orphan-area');
    // spawn anchor exists but is on the wrong map too.
    expect(found).toContain('area-spawn-wrong-map');
  });
});
