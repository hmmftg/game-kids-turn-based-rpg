import { describe, expect, it } from 'vitest';
import { ANCHORS } from '../world/navigation/graph.ts';
import {
  documentFromRuntime,
  documentToWorldSource,
  loadWorldRuntimeData,
} from './runtimeAdapter.ts';
import { normalizeDocument } from '../domain/worldbuilder/document.ts';
import { validateWorldDocument } from '../domain/worldbuilder/validation.ts';
import { NPC_DEFINITIONS } from '../world/registry.ts';

describe('worldbuilder runtimeAdapter', () => {
  it('derives area mapIds from spawn anchors (area-cave → map-cave)', () => {
    const data = loadWorldRuntimeData();
    expect(data.areaMapIds['area-cave']).toBe('map-cave');
    expect(data.areaMapIds['area-town']).toBe('map-town');
  });

  it('the shipped world converts to a valid document', () => {
    const doc = documentFromRuntime();
    expect(validateWorldDocument(doc, NPC_DEFINITIONS)).toEqual([]);
  });

  it('documentToWorldSource reproduces the shipped anchor table incl. npcId', () => {
    const doc = documentFromRuntime();
    const result = documentToWorldSource(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source.anchors).toEqual(ANCHORS);
    expect(result.source.npcDefinitions).toBe(NPC_DEFINITIONS);
    // every NPC has exactly one home placement
    expect(result.source.npcPlacements).toHaveLength(NPC_DEFINITIONS.length);
  });

  it('round-trips a serialized document to semantic identity', () => {
    const doc = documentFromRuntime();
    const reloaded = JSON.parse(JSON.stringify(doc)) as typeof doc;
    expect(normalizeDocument(reloaded)).toEqual(normalizeDocument(doc));
  });

  it('rejects invalid documents instead of producing a source', () => {
    const doc = documentFromRuntime();
    const broken = { ...doc, anchors: doc.anchors.slice(1) }; // drops spawn + others
    const result = documentToWorldSource(broken);
    expect(result.ok).toBe(false);
  });
});
