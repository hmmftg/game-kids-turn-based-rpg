# Framework API

`src/framework/` is the reusable half of the game: renderer-independent
primitives, the game runtime, persistence contracts and pure camera math.
Everything is exported through **one file** — `src/framework/index.ts` —
and ESLint (`no-restricted-imports`, `framework/(core|three|modules)/`)
blocks every deeper import, including type-only ones.

> The API is the smallest viable seam two consumers need — the game and
> `examples/hello-world`. It is intentionally conservative: exports the
> example doesn't exercise should be treated as unproven.

## Ownership model

| Layer                            | Owns                                                                                                      | Never does                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `createGameRuntime`              | one store, dispatch plumbing (`ReducerContext.now` per command), subscribe/getState, pause/resume/dispose | interpret state, persist, hydrate app state |
| `GameRuntimeAdapter<S, C>` (app) | `createInitialState()` (boot state), the reducer                                                          | persistence, side effects                   |
| Application coordinators (app)   | hydration order, profile/slot selection, save scheduling, failure policy                                  | bypass the reducer                          |
| `PersistenceAdapter<P>` (app)    | scoped `load`/`save`, `onFailure` → `StorageFallback`                                                     | decide save timing (coordinators do)        |

Hydration is ordinary commands: runtime boots with `createInitialState()`,
then the app's coordinator loads its index/saves and dispatches its own
boot/profile commands through the reducer. Nothing duplicates or skips
reducer semantics.

## `createGameRuntime<S, C>(adapter, config?)`

```ts
interface GameRuntimeAdapter<S, C> {
  createInitialState(): S;
  reducer: (state: S, command: C, context: ReducerContext): S;
}
interface ReducerContext {
  readonly now: number; // stamped by the runtime's clock on EVERY dispatch
}
interface GameRuntimeConfig {
  readonly clock?: () => number; // inject a fixed clock for replay/tests
}
interface GameRuntime<S, C> {
  getState(): S;
  dispatch(command: C): S;
  subscribe(listener: (state: S) => void): () => void;
  pause(): void; // suspends notification; state still advances
  resume(): void; // one flush with current state
  readonly paused: boolean;
  dispose(): void;
}
```

React binding pattern (see `src/app/GameProvider.tsx`):
`useSyncExternalStore(runtime.subscribe, runtime.getState)`; the runtime is
created once (e.g. `useState` initializer) and never disposed by a simulated
StrictMode unmount.

## `PersistenceAdapter<P>`

```ts
interface SaveScope {
  readonly slotKey: string;
}
type LoadResult<P> = { kind: 'loaded'; data: P } | { kind: 'empty' } | { kind: 'corrupt' }; // NO payload — a bad save can't masquerade as data
type PersistenceFailure = { kind: 'corrupt' } | { kind: 'unavailable' } | { kind: 'quota' };
type StorageFallback = { kind: 'memory'; authoritative: boolean } | { kind: 'none' };
interface PersistenceAdapter<P> {
  load(scope: SaveScope): Promise<LoadResult<P>>;
  save(data: P, scope: SaveScope): Promise<void>;
  onFailure(kind: PersistenceFailure): StorageFallback;
}
```

The runtime does **not** consume this — the application's coordinators do
(`ProfileCoordinator`/`SaveCoordinator` in `src/app/`). Scoped slots mirror
per-profile save keys; the `corrupt` branch carries no data by design.

## World primitives

`Anchor`, `Edge`, `Bounds`, `WorldArea`, `WorldMap`, `MapTransition`,
`NpcPlacement` (`core/world.ts`) + branded ids (`core/identifiers.ts`) +
`insideBounds`, `GraphSource` helpers (`getAnchor`, `neighboursOf`,
`anchorForNpc`, `anchorForLandmark`, `distanceBetween`) + `findPath` /
`nearestWalkableAnchor` / `pathToPoints`. Navigation is a declared anchor
graph — no physics engine. Application fields (`labelFa`, environment,
schedules) extend these; they are not part of the primitives.

## Quality + capabilities

`QualityTier`, `detectQualityTier`, `maxPixelRatioFor`, `detectWebgl`,
`currentOrientation`, `prefersReducedMotion`.

## Camera math (`three/`)

Pure math only: `ISO_OFFSET`, zoom clamps (`clampZoom`, `clampUserZoom`,
`MIN_ZOOM`/`MAX_ZOOM`/`DEFAULT_ZOOM`), `clampCameraTarget`,
`resolveCameraSource`, `shouldApplyPan`, focus-override types. No renderer
objects — the app's `CameraRig` consumes them.

## Optional module: battle

`framework/modules/battle/` — `createBattle`, `chooseBattleAction`,
`advanceBattlePhase`, `battleReducer`, `validateBattleDefinition` + types.
Reusable, not required by a consumer.

## `examples/hello-world` — the second consumer

`examples/hello-world/` builds with its own `vite.config.ts` into
`examples/hello-world/dist` (gitignored) — deliberately outside the game's
bundle so the "absent from budget and precache" checks in
`scripts/check-deploy.ts` are verifications, not assumptions.

```bash
npm run example:dev    # serve the example
npm run example:build  # build it (part of npm run verify)
```

It exercises, end to end: `createGameRuntime` with its own `HelloState`
(5-line reducer), fixed-clock dispatch, subscribe/pause/resume/dispose,
`PersistenceAdapter` memory round-trip, `GraphSource`/`getAnchor`/
`insideBounds` on a ~30-line declared world — **no React, no Three, no game
content**. `hello-world.test.ts` is the consumer-side contract suite; the
app-side split lives in `src/app/runtimeCoordinator.test.ts` (runtime
contract vs coordinator behavior).

## Lifecycle probes (dev/`__WORLD_PROBE` only)

- `__worldDisposeEvents` — counted `dispose` events on scene-owned
  geometries/materials/textures. A remount must grow it; idle frames must
  not. (`DisposalProbe` in `WorldCanvas`; `dispose={null}` shared resources
  never fire, by design.)
- `__worldCritterTimersAtUnmount` — pending critter timers after unmount;
  must be `0`.
- `gl.info.memory` on the _new_ renderer is reported alongside, but only
  real dispose events prove the old scene released resources. JS heap stays
  labeled JS heap; GPU duration remains unmeasured (no valid mechanism).

Coverage: `e2e/memory-soak.spec.ts` (baseline over 5 remount cycles + the
dispose-event/critter-timer assertions).
