import { getAnchor } from '../world/navigation/graph.ts';
import { STATIC_WORLD_SOURCE } from '../world/worldSource.ts';
import { ANCHORS, EDGES } from '../world/navigation/graph.ts';
import { MAP_TRANSITIONS, WORLD_MAPS } from '../world/maps.ts';
import { NPC_DEFINITIONS, WORLD_AREAS } from '../world/registry.ts';
import type { WorldSource } from '../domain/world/source.ts';
import type { AreaId, MapId } from '../domain/world/types.ts';
import {
  fromRuntime,
  toRuntime,
  type WorldBuilderDocument,
  type WorldRuntimeData,
} from '../domain/worldbuilder/document.ts';
import { validateWorldDocument } from '../domain/worldbuilder/validation.ts';

/**
 * Runtime adapter — the ONLY builder module that imports the static world
 * registries. It builds the pure `WorldRuntimeData` bundle `fromRuntime()`
 * needs and compiles validated documents into a preview `WorldSource`.
 */

/** Runtime `WorldArea` has no `mapId`; derive it from each area's spawn anchor. */
function deriveAreaMapIds(): Readonly<Record<AreaId, MapId>> {
  const mapIds: Record<AreaId, MapId> = {} as Record<AreaId, MapId>;
  for (const area of WORLD_AREAS) {
    mapIds[area.id] = getAnchor(STATIC_WORLD_SOURCE, area.spawnAnchorId).mapId;
  }
  return mapIds;
}

export function loadWorldRuntimeData(): WorldRuntimeData {
  return {
    maps: WORLD_MAPS,
    areas: WORLD_AREAS,
    areaMapIds: deriveAreaMapIds(),
    anchors: ANCHORS,
    edges: EDGES,
    transitions: MAP_TRANSITIONS,
    npcDefinitions: NPC_DEFINITIONS,
  };
}

/** The current shipped world as a builder document. */
export function documentFromRuntime(): WorldBuilderDocument {
  return fromRuntime(loadWorldRuntimeData());
}

/**
 * Compile a document into a preview `WorldSource` — or return the validation
 * issues that make it unsafe to preview.
 */
export function documentToWorldSource(
  doc: WorldBuilderDocument,
):
  | { readonly ok: true; readonly source: WorldSource }
  | { readonly ok: false; readonly issues: ReturnType<typeof validateWorldDocument> } {
  const issues = validateWorldDocument(doc, NPC_DEFINITIONS);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, source: toRuntime(doc, NPC_DEFINITIONS) };
}
