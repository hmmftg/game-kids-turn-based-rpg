# waypoint-rpg-narrative

An optional, game-neutral, zero-runtime-dependency TypeScript ESM package for
validating narrative definitions and evaluating deterministic dialogue, quest,
and trigger transitions. It contains no React, Three.js, DOM, storage, game
content, or dependency on `waypoint-rpg-core`. A game may use the core package
without installing narrative.

Only the package root is public. The package declares a native Node runtime
floor of Node.js `>=22.0.0`; Phase 3 package checks were run on Node.js 22.23.5,
not separately on the declared minimum. Building and testing from this
repository use the root toolchain floor, Node.js `>=22.22.2 <23` and npm
`>=10 <11`. The package has no runtime or peer dependencies. Publication to a
registry is deferred.

## Public API

Values exported from `waypoint-rpg-narrative`:

- `validateNarrative` and `compileNarrative` for safe authoring validation and
  immutable compiled definitions.
- `NarrativeDefinitionError` for definitions that fail compilation.
- `evaluateCondition` for pure typed condition evaluation.
- `createNarrativeState` and `decodeNarrativeState` for one playthrough's
  durable state and validated restoration.
- `transitionNarrative` for deterministic, atomic commands.
- `getDialogueView`, `getQuestStatus`, and `getFact` for read-only selectors.

The root also exports the definition, condition, effect, command, result,
diagnostic, state, dialogue-view, and quest types. No deep imports are supported.

## Definition and versioning

Definitions use `schemaVersion: 1`, stable story/dialogue/node/choice/quest/
trigger IDs, locale-neutral maps of localized strings, typed conditions and
effects, and explicit compatibility metadata:

```ts
const story = {
  schemaVersion: 1,
  id: 'lantern-story',
  contentVersion: 'copy-1',
  compatibilityVersion: 'structure-1',
  defaultLocale: 'en',
  facts: [
    { key: 'helped', type: 'boolean', default: false },
    { key: 'trust', type: 'integer', default: 0 },
  ],
  entryDialogueId: 'greeting',
  dialogues: [
    {
      id: 'greeting',
      entryNodeId: 'question',
      exitPolicy: 'allowed',
      nodes: [
        {
          id: 'question',
          speakerId: 'guide',
          text: { en: 'What will you do?' },
          choices: [
            {
              id: 'help',
              label: { en: 'Help' },
              targetNodeId: 'ending',
              effects: [{ op: 'set-flag', key: 'helped', value: true }],
            },
          ],
        },
        {
          id: 'ending',
          speakerId: 'guide',
          text: { en: 'The lantern is lit.' },
          terminal: true,
          endingId: 'ending-helped',
        },
      ],
    },
  ],
  quests: [{ id: 'helping' }],
} as const satisfies import('waypoint-rpg-narrative').NarrativeDefinition;
```

`schemaVersion` selects the data schema. Increment `contentVersion` for copy or
presentation edits; this alone does not invalidate progress. Change
`compatibilityVersion` when a structural change cannot safely interpret
existing playthrough state. A consumer owns its separate save-envelope version
and decides how to preserve or recover incompatible bytes. This package does
not implement a general save-migration framework.

`compileNarrative(story)` validates and copies authoring data before freezing
it. Later mutation through the original object cannot alter the compiled
definition or its internal indexes.

`facts` is optional for compatibility with existing definitions. When present,
it declares every fact key and its `boolean`, safe `integer`, or `string` type;
an optional default is materialized when a playthrough is created or decoded.
Hydration adds missing declared defaults without advancing the narrative
revision. `defaultLocale` is also optional. Localized text resolves by exact
requested locale, base language, declared default locale, then the legacy
deterministic fallback. A declared default locale must be present in every
localized text field.

## Conditions and effects

Conditions include boolean flags, primitive `eq`/`neq`, safe-integer ordering,
persisted quest statuses, `all`, `any`, and `not`. Missing facts are absent:
flag checks and equality are false; `neq` is true only when a fact exists and
differs, so it is not the same as `not(eq)`. Ordered comparisons require a
safe integer fact and a safe integer operand; no coercion occurs. Quest
predicates accept only persisted states (`active`, `completed`, `failed`,
`cancelled`); `getQuestStatus` also derives `available` and `locked` for
queries.

Effects are a closed data vocabulary: set/clear flags, set or clear fact
overrides, increment integer facts, and start/complete/fail/cancel quests.
`clear-flag` explicitly writes `false`; `clear-fact` removes an optional
override and restores its declared default when one exists. The complete
ordered effect list is applied to a private draft. A valid `start-quest` then
`complete-quest` sequence commits together; any invalid operation rejects the
whole command without changing state or revision. Failed and cancelled quests
restart only when the definition opts in. The engine does not name moral
values, rewards, movement, combat, or rendering.

A quest may opt in to completed-attempt replay with `repeatable: true`; the
default remains terminal after completion. Optional stable `stepIds` are
recorded in `NarrativeState.questHistory` when the quest completes. History
stores a completion count and the unique completed step IDs across attempts.
`createNarrativeState` accepts a trusted `NarrativeStateSeed` for restoring
facts, quest status, and quest history without replaying effects. The snapshot
decoder accepts older narrative snapshots without `questHistory`, preserving
completed status and deriving at least one completion for legacy completed
quests.

## Runtime example

```ts
import {
  compileNarrative,
  createNarrativeState,
  getDialogueView,
  transitionNarrative,
  type NarrativeDefinition,
} from 'waypoint-rpg-narrative';

const compiled = compileNarrative(story as NarrativeDefinition);
let state = createNarrativeState(compiled, 'playthrough-1');
const opened = transitionNarrative(compiled, state, {
  type: 'open-dialogue',
  dialogueId: 'greeting',
  playthroughId: state.playthroughId,
  expectedRevision: state.revision,
});
if (!opened.accepted) throw new Error(opened.reason.message);
state = opened.state;

const view = getDialogueView(compiled, state, 'en');
// Adapt the view to the game's DOM/native UI. No UI is included here.
```

Every command names the playthrough and expected revision. Accepted durable
changes increment the revision exactly once; rejected, stale, unavailable,
and semantically invalid commands keep the same state identity and revision.
Choice/trigger deduplication and terminal-ending immutability are scoped to
that playthrough. Explicitly repeatable choices and triggers may run again at
a later accepted revision. `exit-dialogue` suspends the committed cursor so
the same conversation can resume without reapplying a choice. An authored
`closesDialogue` node exposes `close-dialogue`: it clears active and suspended
cursors without assigning a story ending or reapplying effects. Only that
explicit endpoint can close this way; ordinary exit continues to suspend.

## Persistence and external events

`NarrativeState` is a JSON-compatible durable snapshot. `decodeNarrativeState`
validates the story, compatibility version, IDs, facts, quests, and dialogue
cursors; it never accesses storage. UI feedback, request/correlation tokens,
scene state, and storage policy are excluded.

An application may map a known external event to a declared trigger ID after
checking its own scene, arrival, combat, or interaction rules. Trigger
conditions and effects are then evaluated atomically through
`transitionNarrative`. There is no event bus or arbitrary callback/effect
dispatch in the package.

## Build and independent consumer gate

From the repository root:

```bash
npm run framework:build
npm --ignore-scripts --workspace=packages/narrative run test
npm run framework:narrative-consumer
```

The consumer gate packs and installs the tarball outside the monorepo, tests a
native Node ESM import, TypeScript declarations under NodeNext and Bundler
resolution, offline installation from the local archive, and negative deep
imports. Installing the locked development tools is a separate `npm ci`
operation and may need registry access; offline package installation does not
claim that a fresh toolchain can be installed offline.
