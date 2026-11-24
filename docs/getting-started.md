# Getting started

## Running the game

Use Node.js `>=22.22.2 <23` and npm `>=10 <11` for the root workspace and its
build tools. The standalone `waypoint-rpg-core` and optional
`waypoint-rpg-narrative` / `waypoint-rpg-gameplay` manifests declare Node.js
`>=22.0.0` runtime floors; package checks ran on Node.js 22.23.x. These package
runtime floors do not apply to the app toolchain.

```bash
npm ci
npm run dev          # Vite dev server
npm run dev:linked   # watch both framework packages + root Vite
npm run framework:watch # watch both packages + the independent 3D consumer
npm run build        # production build (content validation + bundle budgets + deploy shape)
npm run preview      # serve the built dist/
npm run verify       # format + lint + typecheck + unit tests + build — the full gate
npx playwright test  # e2e (serial, ~2h; needs `npx playwright install chromium` once)
```

The game is a Persian RTL turn-based RPG for ages 3–7 (mahalle-ye-mehrabani).
Useful URL flags: `?research=0` skips the consent gate, `?perfprobe=1` installs
the performance probe, `?worldbuilder=1` opens the authoring tool,
`?kidtest=nocopy,noactionicons` strips copy/non-physical affordances for
comprehension testing. Docs map: `AGENTS.md` §10.

## Consuming the framework

`packages/core/` is the reusable, dependency-free ESM package containing the
game-agnostic primitives and `createGameRuntime` state-machine seam. Import its
public API from `waypoint-rpg-core`; deep imports are rejected. The Kids RPG
routes its imports through `src/framework/index.ts`, which adds game-owned
camera, quality, and optional battle APIs. API reference:
[framework-api.md](framework-api.md). Extraction rationale:
[framework-extraction.md](framework-extraction.md).

`packages/narrative/` is a separate optional ESM package. It provides
game-neutral typed definitions, deterministic conditions/effects, dialogue,
quest transitions, and validated narrative state. It has no dependency on the
core, React, Three.js, browser storage, or authored game content.

`packages/gameplay/` is a third optional ESM package for progression,
inventory, abilities, and deterministic tactical combat. It also has no
runtime dependencies and does not import core or narrative. The Kids RPG does
not consume narrative or gameplay; the independent `examples/scene-demo/`
validates core + narrative + gameplay together with برگ خون and a courtyard
guardian trial. APIs are documented in [framework-api.md](framework-api.md)
and the package READMEs. Verify the gameplay tarball with
`npm run framework:gameplay-consumer`.

Minimal consumer — the shipped `examples/hello-world/` is the canonical
walkthrough and the API's validation consumer:

```ts
import { createGameRuntime } from 'waypoint-rpg-core';
import type { GameRuntimeAdapter } from 'waypoint-rpg-core';

type State = { phase: 'idle' | 'celebrated'; taps: number; lastTapAt: number };
type Command = { type: 'tap-prop' } | { type: 'settle' };

const adapter: GameRuntimeAdapter<State, Command> = {
  createInitialState: () => ({ phase: 'idle', taps: 0, lastTapAt: 0 }),
  reducer: (state, command, context) => {
    if (command.type === 'tap-prop') {
      return { ...state, phase: 'celebrated', taps: state.taps + 1, lastTapAt: context.now };
    }
    return { ...state, phase: 'idle' };
  },
};

const runtime = createGameRuntime(adapter); // or createGameRuntime(adapter, { clock })
runtime.subscribe((state) => render(state));
runtime.dispatch({ type: 'tap-prop' });
```

Contract in three lines:

- `createInitialState()` seeds the store once — hydration is the _consumer's_
  job, dispatched through the reducer itself (the runtime never hydrates).
- `reducer(state, command, context)` is the only transition mechanism;
  `context.now` is the injected clock — timestamp through it, never `Date.now()`.
- The runtime is a state machine only. Persistence is a separate
  `PersistenceAdapter<P>` consumed by _your_ coordinators (load/save
  eligibility, scopes, failure policy all stay application-side).

Run the example:

```bash
npm run example:dev    # dev server for examples/hello-world
npm run example:build  # build to examples/hello-world/dist (excluded from the game bundle + precache)
npm run framework:narrative-consumer # independent narrative tarball gate
npm run framework:scene-consumer     # combined core+narrative 3D tarballs + Chromium
```

For the scene-demo linked development workflow, run `npm run framework:watch`.
It builds and watches both packages before starting Vite with default linked
package resolution. `npm run framework:watch:check` verifies source edits,
last-good output during a compile failure, and recovery.

## Create a portable game project

The optional `waypoint-rpg-creator` tools import local models, maintain a
provenance/readiness catalog, and generate a one-scene starter that installs
only its selected framework package roots. Follow
[Creating a sample game](CREATING-A-SAMPLE-GAME.md) for a complete local-tarball
walkthrough. The focused acceptance gate is `npm run framework:generated-games`;
it creates and tests narrative-only and tactical-only consumers outside the
workspace and stores real Chromium screenshots in `docs/previews/creator/`.

Package archives can install offline once available locally. Vite, React,
TypeScript, and Playwright are development tools with their own locked
toolchain; a first install may need a network/cache bootstrap. The creator
CLI itself is never bundled into a game's production output.

## What stays in your app

World content (`WorldMap`/`WorldArea`/`GraphSource` declarations), persisted
schema + migrations, copy/content, UI, save/boot policy. The framework owns
lifecycle and subscriptions; it never decides what a command means or when a
save is allowed.

## Rules that apply to consumers too

- The Kids RPG imports package APIs through its `src/framework/index.ts`
  facade; application lint rejects direct package and deep source imports.
- Independent consumers import only `waypoint-rpg-core`, the package root.
- Game content must never be imported by framework code; app types _extend_
  the primitives (`labelFa`, `environment`, schedules stay app-side).
- `disposal={null}` on shared resources; scene-unique disposables are counted
  by `DisposalProbe` across remounts.
