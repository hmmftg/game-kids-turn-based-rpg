import type { Bounds } from './types.ts';

/** Whether a world-space point falls inside a bounds rectangle. */
export function insideBounds(bounds: Bounds, x: number, z: number): boolean {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}
