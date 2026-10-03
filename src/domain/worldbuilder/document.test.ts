import { describe, expect, it } from 'vitest';
import { FIXTURE_NPCS, FIXTURE_RUNTIME, fixtureDocument } from './fixture.ts';
import {
  fromRuntime,
  normalizeDocument,
  parseDocument,
  toRuntime,
  WORLD_BUILDER_DOCUMENT_VERSION,
} from './document.ts';

describe('worldbuilder document', () => {
  it('fromRuntime produces a versioned document with derived placements', () => {
    const doc = fromRuntime(FIXTURE_RUNTIME);
    expect(doc.version).toBe(WORLD_BUILDER_DOCUMENT_VERSION);
    expect(doc.maps).toHaveLength(2);
    expect(doc.areas).toHaveLength(3);
    expect(doc.anchors).toHaveLength(4);
    // anchor.npcId is not stored — residency comes from placements.
    expect(doc.anchors.every((a) => !('npcId' in a))).toBe(true);
    expect(doc.npcPlacements).toEqual([{ npcId: 'npc-test', anchorId: 'anchor-s1' }]);
    // areas gain explicit mapId.
    expect(doc.areas.find((a) => a.id === 'area-a3')?.mapId).toBe('map-b');
  });

  it('toRuntime restores anchor.npcId and strips area.mapId', () => {
    const doc = fixtureDocument();
    const source = toRuntime(doc, FIXTURE_NPCS);
    expect(source.anchors.find((a) => a.id === 'anchor-s1')?.npcId).toBe('npc-test');
    expect(source.anchors.find((a) => a.id === 'anchor-s2')?.npcId).toBeNull();
    expect(source.areas.every((a) => !('mapId' in a))).toBe(true);
    expect(source.npcDefinitions).toBe(FIXTURE_NPCS);
    expect(source.npcPlacements).toBe(doc.npcPlacements);
  });

  it('round-trips: runtime → document → source reproduces runtime tables', () => {
    const doc = fromRuntime(FIXTURE_RUNTIME);
    const source = toRuntime(doc, FIXTURE_NPCS);
    expect(source.maps).toEqual(FIXTURE_RUNTIME.maps);
    expect(source.areas).toEqual(FIXTURE_RUNTIME.areas);
    expect(source.anchors).toEqual(FIXTURE_RUNTIME.anchors);
    expect(source.edges).toEqual(FIXTURE_RUNTIME.edges);
    expect(source.transitions).toEqual(FIXTURE_RUNTIME.transitions);
  });

  it('moving a placement changes only the derived npcId', () => {
    const doc = fixtureDocument();
    const moved = {
      ...doc,
      npcPlacements: [{ npcId: 'npc-test' as const, anchorId: 'anchor-s2' as const }],
    };
    const source = toRuntime(moved, FIXTURE_NPCS);
    expect(source.anchors.find((a) => a.id === 'anchor-s1')?.npcId).toBeNull();
    expect(source.anchors.find((a) => a.id === 'anchor-s2')?.npcId).toBe('npc-test');
  });

  it('export → parse → normalize → deep-equal (semantic identity)', () => {
    const doc = fixtureDocument();
    const exported = JSON.stringify(doc);
    const reloaded = parseDocument(exported);
    expect(normalizeDocument(reloaded)).toEqual(normalizeDocument(doc));
  });

  it('normalize tolerates reordered tables', () => {
    const doc = fixtureDocument();
    const reordered = {
      ...doc,
      anchors: [...doc.anchors].reverse(),
      npcPlacements: [...doc.npcPlacements].reverse(),
    };
    expect(normalizeDocument(reordered)).toEqual(normalizeDocument(doc));
  });

  it('parseDocument rejects wrong versions and malformed shapes', () => {
    expect(() => parseDocument('42')).toThrow();
    expect(() => parseDocument('{"version": 99, "maps": []}')).toThrow(/version/);
    expect(() =>
      parseDocument(JSON.stringify({ ...fixtureDocument(), anchors: undefined })),
    ).toThrow(/anchors/);
  });
});
