import type { Anchor } from '../domain/world/types.ts';

/**
 * Single authored spatial truth for anchor-derived visuals.
 *
 * An anchor marks the interaction point; everything rendered *because of* it
 * must be positioned relative to it — never by an independent constant — so
 * authored moves and World Builder documents keep every derived element
 * aligned with the anchor the child taps.
 */

/**
 * Landmarks sit a fixed distance behind their anchor so the walkable point
 * in front stays clear of the building footprint.
 */
export const LANDMARK_OFFSET_Z = -1.2;

/** Render position of the landmark belonging to `anchor`. */
export function landmarkPosition(anchor: Anchor): { readonly x: number; readonly z: number } {
  return { x: anchor.x, z: anchor.z + LANDMARK_OFFSET_Z };
}

/**
 * An NPC figure stands just off its anchor — the person next to the walkable
 * point, never on it. Hub rendering and the visibility invariant both read
 * this so the figure can't drift outside the guaranteed-visible rect.
 */
export const NPC_STAND_OFFSET = { x: 0.9, z: -0.4 } as const;

/** The cave mouse's figure stands beside its anchor inside the cave. */
export const CAVE_MOUSE_OFFSET = { x: 0.8, z: 0 } as const;

/** The hidden cave rock stands behind its walkable approach anchor — against
 *  the hillside, so the child reads a doorway at the hill's edge and the
 *  anchor's own ground stays tappable in front of the mesh. */
export const CAVE_ROCK_OFFSET = { x: 0, z: -1.2 } as const;

/** Render position of the cave-entrance rock for `anchor-cave-entrance`. */
export function caveEntranceRockPosition(anchor: Anchor): {
  readonly x: number;
  readonly z: number;
} {
  return { x: anchor.x + CAVE_ROCK_OFFSET.x, z: anchor.z + CAVE_ROCK_OFFSET.z };
}
