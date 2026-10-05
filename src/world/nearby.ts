import type { AnchorId, MapId } from '../domain/game/types.ts';
import type { NpcDefinition } from '../domain/world/types.ts';
import type { WorldSource } from '../domain/world/source.ts';
import { getAnchorOrNull } from './navigation/graph.ts';
import { NPC_STAND_OFFSET } from './placement.ts';
import { resolveNpcStand } from './registry.ts';

export interface NearbyNpc {
  readonly npc: NpcDefinition;
  /** The anchor their figure currently stands at (schedule-aware). */
  readonly anchorId: AnchorId;
  /** Ground-plane distance to the avatar, world units. */
  readonly distance: number;
}

/**
 * People and critters standing on the current map, nearest first.
 *
 * This is the DOM accessibility route for figure taps: a child who cannot
 * land a tap on a 3D person gets the same people as large buttons, and the
 * button dispatches the exact same `onNpcTap` path (walk + greet + dialogue
 * or battle) — one interaction meaning, two presentation routes.
 *
 * Positions resolve through the same stand rules the world renders
 * (`resolveNpcStand` + `NPC_STAND_OFFSET`), never a second placement truth.
 */
export function nearbyNpcs(
  source: WorldSource,
  mapId: MapId,
  position: { readonly x: number; readonly z: number },
  worldTime: number,
  limit = 6,
): readonly NearbyNpc[] {
  return source.npcDefinitions
    .flatMap((npc) => {
      const stand = resolveNpcStand(source, npc, worldTime);
      const anchor = getAnchorOrNull(source, stand.anchorId);
      if (!anchor || anchor.mapId !== mapId) return [];
      const x = anchor.x + NPC_STAND_OFFSET.x + stand.offsetX;
      const z = anchor.z + NPC_STAND_OFFSET.z + stand.offsetZ;
      return [
        {
          npc,
          anchorId: stand.anchorId,
          distance: Math.hypot(position.x - x, position.z - z),
        },
      ];
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}
