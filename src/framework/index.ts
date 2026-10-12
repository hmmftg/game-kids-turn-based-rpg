/**
 * The framework's single public entry. Every application import of framework
 * code — including type-only imports — goes through this file; ESLint
 * (`no-restricted-imports`) enforces it. The API here is the smallest viable
 * seam the game needs and is NOT declared stable: `examples/hello-world`
 * validates, refines or removes exports before it is called public.
 *
 * Deliberate exception: `core/perfProbe.ts` is NOT re-exported. It must stay a
 * separately addressable lazy chunk — `?perfprobe=1` loads it via a direct
 * dynamic `import()` in `main.tsx` so profiling costs the normal bundle and
 * the PWA precache zero bytes.
 */

export type {
  AnchorId,
  AreaId,
  DiscoveryId,
  LandmarkId,
  MapId,
  NpcId,
  TransitionId,
} from './core/identifiers.ts';

export type {
  Anchor,
  Bounds,
  Edge,
  MapTransition,
  NpcPlacement,
  WorldArea,
  WorldMap,
} from './core/world.ts';

export { insideBounds } from './core/geometry.ts';

export {
  anchorForLandmark,
  anchorForNpc,
  distanceBetween,
  getAnchor,
  getAnchorOrNull,
  neighboursOf,
} from './core/graph.ts';
export type { GraphSource } from './core/graph.ts';

export { findPath, nearestWalkableAnchor, pathToPoints } from './core/pathfinding.ts';
export type { PathPoint } from './core/pathfinding.ts';

export type { QualityTier } from './core/quality.ts';
export {
  currentOrientation,
  detectQualityTier,
  detectWebgl,
  maxPixelRatioFor,
  prefersReducedMotion,
} from './core/capabilities.ts';

export type {
  GameRuntime,
  GameRuntimeAdapter,
  GameRuntimeConfig,
  ReducerContext,
  RuntimeListener,
} from './core/runtime.ts';
export { createGameRuntime } from './core/runtime.ts';

export type {
  LoadResult,
  PersistenceAdapter,
  PersistenceFailure,
  SaveScope,
  StorageFallback,
} from './core/persistence.ts';

export {
  CAMERA_PADDING,
  clampCameraTarget,
  clampUserZoom,
  clampZoom,
  DEFAULT_ZOOM,
  ISO_OFFSET,
  MAX_ZOOM,
  MIN_ZOOM,
  resolveCameraSource,
  shouldApplyPan,
  shouldCancelGestureOnOverrideTransition,
  USER_ZOOM_MAX,
  USER_ZOOM_MIN,
} from './three/camera.ts';
export type {
  CameraBounds,
  CameraFocusOverride,
  CameraFocusOverrideRequest,
  CameraTarget,
} from './three/camera.ts';

// Optional gameplay modules — reusable but not required by a consumer.
export {
  advanceBattlePhase,
  battleAchievements,
  chooseBattleAction,
  createBattle,
  damageFor,
  damagePotential,
  enemyIntentFor,
} from './modules/battle/battle.ts';
export { battleReducer } from './modules/battle/reducer.ts';
export { validateBattleDefinition } from './modules/battle/validation.ts';
export { BATTLE_ACTION_IDS, BATTLE_PHASES } from './modules/battle/types.ts';
export type {
  BattleAchievementId,
  BattleActionId,
  BattleDefinition,
  BattleIntent,
  BattleOutcome,
  BattlePhase,
  BattleRound,
  BattleState,
} from './modules/battle/types.ts';
