import type { AnchorId, NpcId } from '../game/types.ts';
import type {
  Anchor,
  AreaId,
  Edge,
  MapId,
  MapTransition,
  NpcDefinition,
  NpcPlacement,
  WorldArea,
  WorldMapDefinition,
} from '../world/types.ts';
import type { WorldSource } from '../world/source.ts';

/**
 * World Builder authoring document — a versioned, serializable bundle of the
 * world-structure tables the builder may edit. Pure domain code: this module
 * never imports `src/world/*`; the runtime adapter in `src/worldbuilder/` feeds
 * it a `WorldRuntimeData` bundle instead.
 *
 * Deliberate divergences from the runtime shapes:
 * - `WorldBuilderAnchor` has no `npcId` — residency is derived from
 *   `npcPlacements` (single source of truth for who stands where).
 * - `WorldBuilderArea` carries `mapId` explicitly — runtime `WorldArea` lacks
 *   it, and `area-cave` already shares coordinate space with `map-town`, so
 *   area→map membership is authored, never inferred.
 */

export const WORLD_BUILDER_DOCUMENT_VERSION = 1;

/** Anchor minus `npcId` — derived from `npcPlacements` in `toRuntime()`. */
export type WorldBuilderAnchor = Omit<Anchor, 'npcId'>;

export type WorldBuilderArea = WorldArea & { readonly mapId: MapId };

export interface WorldBuilderDocument {
  readonly version: number;
  readonly maps: readonly WorldMapDefinition[];
  readonly areas: readonly WorldBuilderArea[];
  readonly anchors: readonly WorldBuilderAnchor[];
  readonly edges: readonly Edge[];
  readonly transitions: readonly MapTransition[];
  readonly npcPlacements: readonly NpcPlacement[];
}

/**
 * Pure structural bundle the adapter builds from the static registries.
 * `areaMapIds` supplies each area's authored map (runtime `WorldArea` has
 * none); `NpcDefinition`s provide the home anchor behind each placement.
 */
export interface WorldRuntimeData {
  readonly maps: readonly WorldMapDefinition[];
  readonly areas: readonly WorldArea[];
  readonly areaMapIds: Readonly<Record<AreaId, MapId>>;
  readonly anchors: readonly Anchor[];
  readonly edges: readonly Edge[];
  readonly transitions: readonly MapTransition[];
  readonly npcDefinitions: readonly NpcDefinition[];
}

export function fromRuntime(runtime: WorldRuntimeData): WorldBuilderDocument {
  return {
    version: WORLD_BUILDER_DOCUMENT_VERSION,
    maps: runtime.maps,
    areas: runtime.areas.map((area) => ({
      ...area,
      mapId: runtime.areaMapIds[area.id] as MapId,
    })),
    anchors: runtime.anchors.map(({ npcId: _npcId, ...rest }) => rest),
    edges: runtime.edges,
    transitions: runtime.transitions,
    npcPlacements: runtime.npcDefinitions.map((npc) => ({
      npcId: npc.id,
      anchorId: npc.anchorId,
    })),
  };
}

/**
 * Compile a document back into a `WorldSource` for preview. `anchor.npcId` is
 * derived from `npcPlacements`; `npcDefinitions` is supplied by the caller
 * because behavior is content-owned, not authored in the document.
 */
export function toRuntime(
  doc: WorldBuilderDocument,
  npcDefinitions: readonly NpcDefinition[],
): WorldSource {
  const placementByAnchor = new Map<AnchorId, NpcId>();
  for (const placement of doc.npcPlacements) {
    placementByAnchor.set(placement.anchorId, placement.npcId);
  }
  return {
    maps: doc.maps,
    areas: doc.areas.map(({ mapId: _mapId, ...rest }) => rest),
    anchors: doc.anchors.map((anchor) => ({
      ...anchor,
      npcId: placementByAnchor.get(anchor.id) ?? null,
    })),
    edges: doc.edges,
    transitions: doc.transitions,
    npcDefinitions,
    npcPlacements: doc.npcPlacements,
  };
}

/**
 * Semantic normalization for round-trip comparison: sorts every table by a
 * stable key so `export → reload → normalize → deep-equal` cannot fail on
 * ordering or serialization noise.
 */
export function normalizeDocument(doc: WorldBuilderDocument): WorldBuilderDocument {
  const byId = <T extends { readonly id: string }>(rows: readonly T[]): T[] =>
    [...rows].sort((a, b) => a.id.localeCompare(b.id));
  return {
    version: doc.version,
    maps: byId(doc.maps),
    areas: byId(doc.areas),
    anchors: byId(doc.anchors),
    edges: [...doc.edges].sort((a, b) => `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`)),
    transitions: byId(doc.transitions),
    npcPlacements: [...doc.npcPlacements].sort((a, b) => a.npcId.localeCompare(b.npcId)),
  };
}

/** Parse exported JSON back into a document (shape check only — see validation). */
export function parseDocument(json: string): WorldBuilderDocument {
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('World document is not an object');
  }
  const doc = raw as WorldBuilderDocument;
  if (doc.version !== WORLD_BUILDER_DOCUMENT_VERSION) {
    throw new Error(
      `Unsupported world document version: ${String((raw as { version?: unknown }).version)}`,
    );
  }
  for (const key of [
    'maps',
    'areas',
    'anchors',
    'edges',
    'transitions',
    'npcPlacements',
  ] as const) {
    if (!Array.isArray(doc[key])) {
      throw new Error(`World document is missing table: ${key}`);
    }
  }
  return doc;
}
