// Pathfinding moved to the framework core (generic A* over the waypoint
// graph). Kept as a re-export so existing `world/navigation/pathfinding.ts`
// imports keep working.
export { findPath, nearestWalkableAnchor, pathToPoints } from '../../framework/index.ts';
export type { PathPoint } from '../../framework/index.ts';
