import type { AnchorId, LandmarkId, NpcId } from './identifiers.ts';
import type { Anchor, Edge } from './world.ts';

/**
 * The graph shape the navigation helpers read: an anchor table plus an edge
 * table. Applications may carry richer anchors (labels, presentation fields)
 * — the helpers are generic so an `Anchor`-extending source keeps its own
 * anchor type in results.
 */
export interface GraphSource<A extends Anchor = Anchor> {
  readonly anchors: readonly A[];
  readonly edges: readonly Edge[];
}

// Lookups are source-parameterized: the same helpers resolve a shipped world
// and a builder's document source identically. Results are memoized per table
// identity so gameplay passes a static source at zero extra cost.
const BY_ID = new WeakMap<readonly Anchor[], Map<AnchorId, Anchor>>();
const NEIGHBOURS = new WeakMap<readonly Edge[], Map<AnchorId, AnchorId[]>>();

function anchorsById<A extends Anchor>(anchors: readonly A[]): Map<AnchorId, A> {
  let byId = BY_ID.get(anchors);
  if (!byId) {
    byId = new Map(anchors.map((anchor) => [anchor.id, anchor]));
    BY_ID.set(anchors, byId);
  }
  return byId as Map<AnchorId, A>;
}

function neighboursById(source: GraphSource): Map<AnchorId, AnchorId[]> {
  let byId = NEIGHBOURS.get(source.edges);
  if (!byId) {
    byId = new Map(source.anchors.map((anchor) => [anchor.id, []]));
    for (const edge of source.edges) {
      byId.get(edge.from)?.push(edge.to);
      byId.get(edge.to)?.push(edge.from);
    }
    NEIGHBOURS.set(source.edges, byId);
  }
  return byId;
}

export function getAnchor<A extends Anchor>(source: GraphSource<A>, id: AnchorId): A {
  const anchor = anchorsById(source.anchors).get(id);
  if (!anchor) throw new Error(`Unknown anchor: ${id}`);
  return anchor;
}

export function getAnchorOrNull<A extends Anchor>(source: GraphSource<A>, id: string): A | null {
  return anchorsById(source.anchors).get(id as AnchorId) ?? null;
}

/** Walkable neighbours only; unwalkable anchors are decoration/interaction-only. */
export function neighboursOf(source: GraphSource, id: AnchorId): readonly AnchorId[] {
  return (neighboursById(source).get(id) ?? []).filter(
    (neighbour) => getAnchor(source, neighbour).walkable,
  );
}

export function distanceBetween(a: Anchor, b: Anchor): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function anchorForNpc<A extends Anchor>(source: GraphSource<A>, npcId: NpcId): A | null {
  return source.anchors.find((anchor) => anchor.npcId === npcId) ?? null;
}

export function anchorForLandmark<A extends Anchor>(
  source: GraphSource<A>,
  landmarkId: LandmarkId,
): A | null {
  return source.anchors.find((anchor) => anchor.landmarkId === landmarkId) ?? null;
}
