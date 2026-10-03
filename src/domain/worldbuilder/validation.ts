import type { AnchorId, NpcId } from '../game/types.ts';
import type { NpcDefinition } from '../world/types.ts';
import { insideBounds } from '../world/geometry.ts';
import type { WorldBuilderDocument } from './document.ts';

export interface WorldValidationIssue {
  /** Stable machine-readable rule code. */
  readonly code: string;
  readonly message: string;
  /** IDs involved, for the builder inspector to highlight. */
  readonly refs: readonly string[];
}

/**
 * Structural validation for a `WorldBuilderDocument`. Pure function — the
 * builder runs it on every edit, the adapter runs it before producing a
 * `WorldSource`. `npcDefinitions` is supplied (content-owned): placements are
 * checked against it, never the other way around.
 */
export function validateWorldDocument(
  doc: WorldBuilderDocument,
  npcDefinitions: readonly NpcDefinition[],
): readonly WorldValidationIssue[] {
  const issues: WorldValidationIssue[] = [];
  const issue = (code: string, message: string, ...refs: string[]) =>
    issues.push({ code, message, refs });

  const mapById = new Map(doc.maps.map((m) => [m.id, m]));
  const areaById = new Map(doc.areas.map((a) => [a.id, a]));
  const anchorById = new Map(doc.anchors.map((a) => [a.id, a]));
  const transitionById = new Map(doc.transitions.map((t) => [t.id, t]));

  // ── duplicate / missing IDs ──────────────────────────────────────────────
  const checkIds = <T>(rows: readonly T[], getId: (row: T) => string, table: string) => {
    const seen = new Set<string>();
    for (const row of rows) {
      const id = getId(row);
      if (!id) issue('missing-id', `${table} entry has no id`);
      else if (seen.has(id)) issue('duplicate-id', `duplicate ${table} id: ${id}`, id);
      else seen.add(id);
    }
  };
  checkIds(doc.maps, (m) => m.id, 'map');
  checkIds(doc.areas, (a) => a.id, 'area');
  checkIds(doc.anchors, (a) => a.id, 'anchor');
  checkIds(doc.transitions, (t) => t.id, 'transition');
  checkIds(doc.npcPlacements, (p) => `${p.npcId}@${p.anchorId}`, 'placement');

  // ── anchors ───────────────────────────────────────────────────────────────
  for (const anchor of doc.anchors) {
    const map = mapById.get(anchor.mapId);
    if (!map) {
      issue(
        'anchor-missing-map',
        `anchor ${anchor.id} references missing map ${anchor.mapId}`,
        anchor.id,
        anchor.mapId,
      );
    } else if (!insideBounds(map.bounds, anchor.x, anchor.z)) {
      issue(
        'anchor-out-of-bounds',
        `anchor ${anchor.id} is outside bounds of ${map.id}`,
        anchor.id,
        map.id,
      );
    }
    const area = areaById.get(anchor.areaId);
    if (!area) {
      issue(
        'anchor-missing-area',
        `anchor ${anchor.id} references missing area ${anchor.areaId}`,
        anchor.id,
        anchor.areaId,
      );
    } else if (area.mapId !== anchor.mapId) {
      issue(
        'anchor-area-map-mismatch',
        `anchor ${anchor.id} is on ${anchor.mapId} but its area ${area.id} belongs to ${area.mapId}`,
        anchor.id,
        area.id,
      );
    }
    if (anchor.transitionId !== undefined) {
      const transition = transitionById.get(anchor.transitionId);
      if (!transition) {
        issue(
          'anchor-missing-transition',
          `anchor ${anchor.id} references missing transition ${anchor.transitionId}`,
          anchor.id,
          anchor.transitionId,
        );
      } else if (transition.fromAnchor !== anchor.id) {
        issue(
          'transition-mismatched-anchor',
          `anchor ${anchor.id} points at ${transition.id}, but that transition's fromAnchor is ${transition.fromAnchor}`,
          anchor.id,
          transition.id,
        );
      }
    }
  }

  // ── transitions (bidirectional consistency) ──────────────────────────────
  for (const transition of doc.transitions) {
    if (!mapById.has(transition.fromMap)) {
      issue(
        'transition-missing-from-map',
        `transition ${transition.id} references missing map ${transition.fromMap}`,
        transition.id,
        transition.fromMap,
      );
    }
    if (!mapById.has(transition.toMap)) {
      issue(
        'transition-missing-to-map',
        `transition ${transition.id} references missing map ${transition.toMap}`,
        transition.id,
        transition.toMap,
      );
    }
    const from = anchorById.get(transition.fromAnchor);
    if (!from) {
      issue(
        'transition-missing-from-anchor',
        `transition ${transition.id} references missing anchor ${transition.fromAnchor}`,
        transition.id,
        transition.fromAnchor,
      );
    } else if (from.mapId !== transition.fromMap) {
      issue(
        'transition-from-anchor-map',
        `transition ${transition.id} starts on ${transition.fromMap} but ${from.id} is on ${from.mapId}`,
        transition.id,
        from.id,
      );
    }
    const to = anchorById.get(transition.toAnchor);
    if (!to) {
      issue(
        'transition-missing-to-anchor',
        `transition ${transition.id} references missing anchor ${transition.toAnchor}`,
        transition.id,
        transition.toAnchor,
      );
    } else if (to.mapId !== transition.toMap) {
      issue(
        'transition-to-anchor-map',
        `transition ${transition.id} ends on ${transition.toMap} but ${to.id} is on ${to.mapId}`,
        transition.id,
        to.id,
      );
    }
  }

  // ── edges ─────────────────────────────────────────────────────────────────
  for (const edge of doc.edges) {
    const from = anchorById.get(edge.from);
    const to = anchorById.get(edge.to);
    if (!from)
      issue(
        'edge-missing-anchor',
        `edge references missing anchor ${edge.from}`,
        edge.from,
        edge.to,
      );
    if (!to)
      issue('edge-missing-anchor', `edge references missing anchor ${edge.to}`, edge.from, edge.to);
    if (from && to && from.mapId !== to.mapId) {
      issue(
        'edge-crosses-maps',
        `edge ${edge.from}→${edge.to} crosses ${from.mapId}→${to.mapId}`,
        edge.from,
        edge.to,
      );
    }
  }

  // ── spawn rules ──────────────────────────────────────────────────────────
  for (const map of doc.maps) {
    const spawn = anchorById.get(map.spawnAnchorId);
    if (!spawn) {
      issue(
        'map-missing-spawn',
        `map ${map.id} spawn anchor ${map.spawnAnchorId} does not exist`,
        map.id,
        map.spawnAnchorId,
      );
    } else {
      if (spawn.mapId !== map.id)
        issue(
          'map-spawn-wrong-map',
          `map ${map.id} spawn ${spawn.id} is on ${spawn.mapId}`,
          map.id,
          spawn.id,
        );
      if (!spawn.walkable)
        issue(
          'map-spawn-not-walkable',
          `map ${map.id} spawn ${spawn.id} is not walkable`,
          map.id,
          spawn.id,
        );
    }
  }
  for (const area of doc.areas) {
    const spawn = anchorById.get(area.spawnAnchorId);
    if (!spawn) {
      issue(
        'area-missing-spawn',
        `area ${area.id} spawn anchor ${area.spawnAnchorId} does not exist`,
        area.id,
        area.spawnAnchorId,
      );
    } else {
      if (spawn.areaId !== area.id)
        issue(
          'area-spawn-wrong-area',
          `area ${area.id} spawn ${spawn.id} belongs to ${spawn.areaId}`,
          area.id,
          spawn.id,
        );
      if (spawn.mapId !== area.mapId)
        issue(
          'area-spawn-wrong-map',
          `area ${area.id} spawn ${spawn.id} is on ${spawn.mapId}`,
          area.id,
          spawn.id,
        );
      if (!spawn.walkable)
        issue(
          'area-spawn-not-walkable',
          `area ${area.id} spawn ${spawn.id} is not walkable`,
          area.id,
          spawn.id,
        );
    }
    if (!mapById.has(area.mapId)) {
      issue(
        'area-missing-map',
        `area ${area.id} references missing map ${area.mapId}`,
        area.id,
        area.mapId,
      );
    }
  }

  // ── NPC placements: NPC_DEFINITIONS 1 ↔ 1 NpcPlacement, ≤1 per anchor ────
  const npcById = new Map<NpcId, NpcDefinition>(npcDefinitions.map((n) => [n.id, n]));
  const placementByNpc = new Map<NpcId, number>();
  const placementByAnchor = new Map<AnchorId, number>();
  for (const placement of doc.npcPlacements) {
    const npc = npcById.get(placement.npcId);
    if (!npc) {
      issue(
        'placement-missing-npc',
        `placement references missing NPC ${placement.npcId}`,
        placement.npcId,
        placement.anchorId,
      );
    }
    const anchor = anchorById.get(placement.anchorId);
    if (!anchor) {
      issue(
        'placement-missing-anchor',
        `placement of ${placement.npcId} references missing anchor ${placement.anchorId}`,
        placement.npcId,
        placement.anchorId,
      );
    } else if (npc && anchor.areaId !== npc.homeAreaId) {
      issue(
        'placement-home-area-mismatch',
        `${placement.npcId} is placed in ${anchor.areaId} but its home area is ${npc.homeAreaId}`,
        placement.npcId,
        placement.anchorId,
      );
    }
    placementByNpc.set(placement.npcId, (placementByNpc.get(placement.npcId) ?? 0) + 1);
    placementByAnchor.set(placement.anchorId, (placementByAnchor.get(placement.anchorId) ?? 0) + 1);
  }
  for (const [npcId, count] of placementByNpc) {
    if (count > 1)
      issue('placement-duplicate-npc', `NPC ${npcId} has ${count} home placements`, npcId);
  }
  for (const [anchorId, count] of placementByAnchor) {
    if (count > 1) {
      issue(
        'placement-anchor-shared',
        `anchor ${anchorId} has ${count} home placements (Anchor.npcId is single-valued)`,
        anchorId,
      );
    }
  }
  for (const npc of npcDefinitions) {
    if (!placementByNpc.has(npc.id)) {
      issue('placement-missing-for-npc', `NPC ${npc.id} has no home placement`, npc.id);
    }
  }

  // ── per-map connectivity over walkable anchors ───────────────────────────
  for (const map of doc.maps) {
    const spawn = anchorById.get(map.spawnAnchorId);
    if (!spawn || spawn.mapId !== map.id || !spawn.walkable) continue;
    const walkable = new Set(
      doc.anchors.filter((a) => a.mapId === map.id && a.walkable).map((a) => a.id),
    );
    const neighbours = new Map<AnchorId, AnchorId[]>();
    for (const edge of doc.edges) {
      const from = anchorById.get(edge.from);
      const to = anchorById.get(edge.to);
      if (!from || !to || from.mapId !== map.id || to.mapId !== map.id) continue;
      (neighbours.get(edge.from) ?? neighbours.set(edge.from, []).get(edge.from)!).push(edge.to);
      (neighbours.get(edge.to) ?? neighbours.set(edge.to, []).get(edge.to)!).push(edge.to);
    }
    const seen = new Set<AnchorId>([spawn.id]);
    const queue: AnchorId[] = [spawn.id];
    while (queue.length > 0) {
      for (const next of neighbours.get(queue.shift()!) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    for (const anchorId of walkable) {
      if (!seen.has(anchorId)) {
        issue(
          'anchor-unreachable',
          `walkable anchor ${anchorId} is unreachable from spawn ${spawn.id} on ${map.id}`,
          anchorId,
          map.id,
        );
      }
    }
  }

  // ── orphan areas (no anchors at all) ─────────────────────────────────────
  for (const area of doc.areas) {
    if (!doc.anchors.some((a) => a.areaId === area.id)) {
      issue('orphan-area', `area ${area.id} contains no anchors`, area.id);
    }
  }

  return issues;
}
