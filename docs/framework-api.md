# Framework API

`packages/core/` is the reusable, renderer-independent ESM package:
identifiers, world DTOs, graph/pathfinding, the injected runtime, and generic
persistence contracts. Its only public entry is the `waypoint-rpg-core`
package root; package-side checks reject external dependencies and deep
imports. `packages/narrative/` is a separate optional, renderer-independent
package for validated narrative definitions and deterministic story
transitions. It does not depend on the core, React, Three.js, DOM, or storage;
future consumers can use the core without installing narrative.

The Kids RPG composes the core API with game-owned capabilities, quality
policy, camera math, and battle modules through `src/framework/index.ts`.
Application imports use this facade; `examples/hello-world` imports the core
root, while `examples/scene-demo` independently installs and consumes the core
and narrative roots.

> Phase 1 delivers a reusable core library, not a complete Three.js RPG
> engine. `examples/hello-world` verifies the workspace consumer path; the
> separately installed tarball fixtures verify package isolation, exports,
> declarations, runtime behavior, and browser bundling. Phase 3's
> `examples/scene-demo` is a narrative validation consumer, not a renderer
> package or complete general-purpose Three.js RPG engine. Registry
> publication is deferred.

## Compatibility boundaries

- **Core runtime:** Node.js `>=22.0.0`; CI executes the packed package on
  Node.js 22.0.0 with no browser globals.
- **Narrative runtime:** the package manifest declares Node.js `>=22.0.0`;
  its pure evaluator uses no Node-specific or browser APIs. Phase 3 package
  checks ran on Node.js 22.23.5. The declared 22.0.0 narrative minimum was not
  separately exercised; the existing minimum-version CI job covers core only.
  The locked compiler/build tools use the root project's newer Node.js and npm
  requirements below.
- **Root build and development tools:** Node.js `>=22.22.2 <23` and npm
  `>=10 <11`; application CI pins Node.js 22.22.2. The locked Vite,
  TypeScript, tests, and package scripts are exercised on this toolchain.
- **Creator CLI:** `waypoint-rpg-creator` declares Node.js `>=22.0.0` for its
  ESM CLI and manifest/catalog/import APIs. Its GLB parser dependencies are
  tool runtime dependencies, not game-framework dependencies. Creating and
  previewing a project uses the separate pinned React/Vite/TypeScript/Playwright
  development toolchain and therefore follows the root build-tool Node/npm
  floor. A generated game installs only its selected core/narrative/gameplay
  archives; it does not depend on or bundle the creator package.
- **Offline package installation:** the tarball has no runtime dependencies
  and installs from a local artifact with an empty npm cache. This does not
  claim that Vite or TypeScript can be newly installed offline.
- **Development-tool installation:** root and consumer toolchains install from
  their lockfiles with `npm ci`; an offline tools install requires a populated
  npm cache.
- **Browser execution:** Chromium is exercised in the package consumer and
  app Playwright checks. No compatibility claim is made for other browsers or
  physical hardware.

## Export status (audit — who validates what)

| Export group                                                                                                                                                   | Kids RPG app                  | hello-world | Independent tarball consumer                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------- | -------------------------------------------------------------------------- |
| Core identifiers, world DTOs, graph/pathfinding, runtime and persistence contracts                                                                             | ✓ via app facade              | ✓           | ✓ Node runtime, NodeNext/Bundler types, Vite bundle and Chromium execution |
| Optional narrative definitions, conditions, effects, dialogue, quests, and state transitions                                                                   | —                             | —           | ✓ narrative tarball plus the combined 3D consumer                          |
| Quality/capabilities                                                                                                                                           | ✓ (app-owned facade)          | —           | Not in the core package                                                    |
| Camera math (`three/`)                                                                                                                                         | ✓ (app-owned facade)          | —           | Not in the core package; validate with a 3D consumer in Phase 2            |
| Generic lightweight 1v1 encounter (`validateLightweightEncounter`/`compileLightweightEncounter`/`createLightweightEncounter`/`transitionLightweightEncounter`) | ✓ via `waypoint-rpg-gameplay` | —           | Optional module in the gameplay tarball                                    |
| `perfProbe`                                                                                                                                                    | loaded via dynamic import     | —           | Deliberately not re-exported — lazy chunk, precache-excluded               |

Each package root exports only its own generic API. The app facade also exports
game-owned optional surfaces; these do not become core-package dependencies.
The independent 3D consumer now validates the optional narrative package, but
its renderer and scene host remain example-owned.

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

## Optional package: `waypoint-rpg-gameplay`

`packages/gameplay/` is an optional zero-runtime-dependency TypeScript ESM
library for progression, inventory/equipment, abilities/status effects, and
deterministic tactical combat. It has one public root and does not depend on
core, narrative, React, Three.js, or browser APIs. Deep imports are rejected.

Root values include `validateGameplay`, `compileGameplay`, `createGameplayState`,
`encodeGameplayState` / `decodeGameplayState`, `transitionGameplay`, and
`applyGameplayGrant`. Enemy turns and victory reward application run inside
`transitionGameplay`; applications map terminal `consequenceId` values to their
own narrative or world effects. The Kids RPG does not consume this package;
`examples/scene-demo/` proves it with an app-owned transactional adapter.
Verify with `npm run framework:gameplay-consumer`.

## Optional package: `waypoint-rpg-narrative`

`packages/narrative/` is an optional zero-runtime-dependency TypeScript ESM
library. It has one public root and can be used without `waypoint-rpg-core`.
It has no React, Three.js, DOM, storage, application, or authored-game imports.
Its pure APIs are testable in Node or a browser environment.

The root exports these values:

| API                                                                 | Purpose                                                                                                          |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `validateNarrative`, `compileNarrative`, `NarrativeDefinitionError` | Validate IDs, references, versions, conditions, effects, quest dependencies, and immutable compiled definitions. |
| `evaluateCondition`                                                 | Evaluate typed JSON condition expressions deterministically.                                                     |
| `createNarrativeState`, `decodeNarrativeState`                      | Create one playthrough or validate a persisted state payload.                                                    |
| `transitionNarrative`                                               | Apply a revision-checked dialogue, choice, finish, exit, or declared trigger command atomically.                 |
| `getDialogueView`, `getQuestStatus`, `getFact`                      | Read-only selectors for presentation and game-owned adapters.                                                    |

Definition and state types, commands, results, diagnostics, JSON values,
localized text, quest statuses, conditions, and effects are exported from the
same root. `packages/narrative/README.md` contains a typed example and complete
condition/effect semantics.

Definitions distinguish three versions: `schemaVersion` selects the authored
data schema, `contentVersion` records copy/presentation edits, and
`compatibilityVersion` changes when story structure can no longer safely
interpret existing progress. Copy-only changes do not reject saved state. A
consumer owns its separate save-envelope version and must preserve bytes it
cannot decode; this package provides no browser storage or general migration
framework.

`NarrativeState` is durable data for one `playthroughId`. Commands carry that
ID and `expectedRevision`. Accepted commands advance the revision once;
rejected, stale, and semantically inapplicable commands preserve the state and
revision. Choice/trigger deduplication and final-ending immutability are scoped
to that playthrough. Dialogue exit suspends the current cursor and reopening
the same dialogue resumes it without replaying effects. The accepted effect
vocabulary is typed and closed; complete ordered effect lists run against a
private draft and reject atomically on failure. No content can execute
JavaScript.

Conditions include flags, primitive equality/inequality, safe-integer ordering,
persisted quest statuses, `all`, `any`, and `not`. Missing facts make flag and
equality checks false; `neq` is true only for an existing unequal fact, so it
does not equal `not(eq)`. Quest predicates cannot recurse through derived
`locked`/`available` statuses, though `getQuestStatus` exposes those queries.
Dialogue loops are valid; missing references remain validation errors.

Movement, arrival, combat, and spatial interactions remain application-owned.
A game may map a validated event to a known trigger ID and call
`transitionNarrative`; the definition supplies its condition and typed effects.
There is no event bus or arbitrary effect-dispatch API. The scene-demo uses
this boundary for its truth-conditioned workshop lantern.

```ts
const opened = transitionNarrative(compiled, state, {
  type: 'open-dialogue',
  dialogueId: 'guardian-dialogue',
  playthroughId: state.playthroughId,
  expectedRevision: state.revision,
});
if (opened.accepted) {
  state = opened.state;
} else {
  // Keep the prior durable state and report the typed rejection reason.
  console.warn(opened.reason.code);
}
```

The package tarball gate is `npm run framework:narrative-consumer`; it checks
an independent offline installation, native Node ESM, NodeNext/Bundler
declarations, public exports, and rejected deep imports. The combined 3D
consumer is `npm run framework:scene-consumer`.

## Optional developer tool: `waypoint-rpg-creator`

`tools/creator/` is an optional ESM developer package and CLI, not a runtime
framework dependency. Its public root and subpaths expose model import,
versioned asset-catalog/readiness operations, and game-project manifest,
validation, inspection, scaffold, and command APIs. Import supports local GLB
and glTF with confined local resources and produces a self-contained GLB;
FBX/OBJ/Blender inputs require the documented optional Blender conversion.
The local preview is a separate browser tool that reuses Phase 5 model loading
and resource ownership. Technical validation or preview never implies
game-specific release approval.

Generated projects use local framework tarballs and public package roots. The
narrative-only and tactical-only acceptance fixtures are generated outside
the workspace and independently install only their selected archives. Run
`npm run framework:generated-games` to pack each archive once, verify both
generated projects with NodeNext and Bundler declarations, tests, production
builds, offline installs, and Chromium acceptance, and refresh the rendered
screenshots in `docs/previews/creator/`. These fixtures verify the toolchain;
they do not count as portfolio releases.

## World primitives

`Anchor`, `Edge`, `Bounds`, `WorldArea`, `WorldMap`, `MapTransition`,
`NpcPlacement` (`packages/core/src/world.ts`) + branded ids
(`packages/core/src/identifiers.ts`) +
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

## Optional module: lightweight encounters

The 1v1 phase machine is exported by `waypoint-rpg-gameplay` through its
public package root. It consumes data-only action/intent outcome matrices and
owns deterministic phase transitions, weakness bonuses, intent overrides,
revision checks, and immutable state snapshots. Mahalle's action IDs, Persian
copy, physical policy, quest unlocks, child achievements, and discovery-at-exit
rule remain application-owned in `src/domain/battle/` and `src/content/fa/`.
This module is independent of the gameplay package's tactical grid model.

## `examples/hello-world` — the workspace consumer

`examples/hello-world/` builds with its own `vite.config.ts` into
`examples/hello-world/dist` (gitignored) — deliberately outside the game's
bundle so the "absent from budget and precache" checks in
`scripts/check-deploy.ts` are verifications, not assumptions.

```bash
npm run example:dev    # serve the example
npm run example:build  # build it (part of npm run verify)
```

It imports `waypoint-rpg-core` from the npm workspace link and exercises end to
end: `createGameRuntime` with its own `HelloState`
(5-line reducer), fixed-clock dispatch, subscribe/pause/resume/dispose,
`PersistenceAdapter` memory round-trip, `GraphSource`/`getAnchor`/
`insideBounds` on a ~30-line declared world — **no React, no Three, no game
content**. `hello-world.test.ts` is the consumer-side contract suite; the
app-side split lives in `src/app/runtimeCoordinator.test.ts` (runtime
contract vs coordinator behavior).

For library edits while developing the Kids RPG, use `npm run dev:linked`. It
starts TypeScript watch processes for both packages, waits for successful first
builds, then starts root Vite. For the independent scene-demo, use
`npm run framework:watch`; it uses the same package watchers and starts Vite
with `examples/scene-demo/vite.config.ts`. Both use Vite's default
linked-package resolution; no `optimizeDeps.exclude`, `preserveSymlinks`, or
custom resolver override is configured. `npm run framework:watch:check` proves
that edits to either package reach the consuming app under default resolution
and that a package compile error preserves its last good output until recovery.
`npm run verify` builds both packages once before the prepared application
stages.

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
