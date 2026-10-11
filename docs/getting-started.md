# Getting started

## Running the game

```bash
npm install
npm run dev          # Vite dev server
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

`src/framework/` is the reusable layer — game-agnostic primitives plus the
`createGameRuntime` state-machine seam. Everything public comes through
`src/framework/index.ts` (one entry point, lint-enforced in both directions).
API reference: [framework-api.md](framework-api.md). Extraction rationale:
[framework-extraction.md](framework-extraction.md).

Minimal consumer — the shipped `examples/hello-world/` is the canonical
walkthrough and the API's validation consumer:

```ts
import { createGameRuntime } from '../../src/framework/index.ts';
import type { GameRuntimeAdapter } from '../../src/framework/index.ts';

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
```

## What stays in your app

World content (`WorldMap`/`WorldArea`/`GraphSource` declarations), persisted
schema + migrations, copy/content, UI, save/boot policy. The framework owns
lifecycle and subscriptions; it never decides what a command means or when a
save is allowed.

## Rules that apply to consumers too

- Framework imports only via `index.ts` — the lint boundary fires in both
  directions (`src/**` and `examples/**`).
- Game content must never be imported by framework code; app types _extend_
  the primitives (`labelFa`, `environment`, schedules stay app-side).
- `disposal={null}` on shared resources; scene-unique disposables are counted
  by `DisposalProbe` across remounts.
