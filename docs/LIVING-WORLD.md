# Living World — Presentation Liveliness Contract

The world should feel alive the way a toy feels alive: touch something and it
reacts; stand still and the people in it do small, bounded, human things. This
document is the boundary that keeps that polish from growing into a second
animation system.

## The one distinction that matters

|                  | semantic animation                                      | presentation liveliness                                    |
| ---------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| what it is       | child-facing physical consequence or reaction           | bounded visual polish                                      |
| examples         | `ObjectFlyTo`, `CharacterReact(notices-child)`          | blink, idle settle, look-toward, idle cues, activity poses |
| instrumentation  | records to `__worldAnimationEvents`                     | **never** records                                          |
| vocabulary owner | `docs/ANIMATIONS.md` (closed `CharacterReact` contexts) | `src/world/liveliness.ts`                                  |

`__worldAnimationEvents` answers exactly one question: **"what semantic thing
happened?"** It is not animation telemetry. A resting pose, a working lean, a
blink, or a glance is presentation state — it must never appear in that stream,
and `__worldAnimationStats.active` must never count it. The `active === 0`
assertion proves semantic episodes settle; it is not a claim that every visual
motion has stopped.

## Vocabulary

`src/world/liveliness.ts` holds the presentation vocabulary — pure functions,
no three.js, no state:

- `NpcIdleCue = 'looks-around' | 'blink'` — deterministic per
  `(npcIndex, worldTime)` via the same seeded LCG the ambient critters use.
  Some ticks produce no cue; idleness is allowed to be still.
- `NpcActivityPose = 'working' | 'resting' | 'talking' | 'waiting'` — derived
  from the NPC's existing schedule activity (`resolveNpcActivity`), mapped by
  `activityPoseFor`; `activityPoseTransform` returns small bounded transform
  deltas (lean, breathe offset) applied to the figure group.

These are **not** `CharacterReact` contexts. Adding them to
`SemanticAnimationEvent.context` would turn the semantic stream into generic
animation telemetry. A cue graduates to a semantic context only when a concrete
child-facing scene gives it gameplay meaning.

## Triggers — event-driven, never looped

Every flourish is started by a discrete event, runs a bounded time
(≤ ~1 second), then returns the renderer to rest. `frameloop="demand"` is
preserved: components invalidate only while their flourish is active.

Allowed triggers:

- **arrival** — the avatar finishing a walk (`arrivalNonce` changes)
- **entering an idle state** — the world-time tick resolving a new NPC spot
- **world-time tick** — the coarse schedule clock (`worldTime`) advancing
- **successful semantic episode completion** — reserved for future flourishes

Not allowed: `useFrame` loops searching for something to do, per-frame
nearest-NPC queries, permanent ambient animations on figures, timers that
outlive their flourish. "Look toward a nearby NPC" resolves its target **once**
when the avatar settles, then plays the glance as a bounded out-and-back.

## Arrival identity — `arrivalNonce`

Arrival-related behavior can be produced by several paths (walker arrival,
world-time tick, NPC schedule resolution, React re-renders, reload). The
reaction therefore carries an explicit identity: `arrivalNonce`, stamped onto
`NpcAttention`/`__worldAttention` and the avatar's liveliness wrapper.

`arrivalNonce` is **monotonic and session-local**:

- It increments exactly once per **completed** avatar arrival — the walker's
  `finishWalk`, whether the destination is a new anchor or the same anchor
  after leaving and returning.
- It never increments from React renders, camera changes, or NPC schedule
  ticks — those change what is rendered, not what arrived.
- It lives in session state only; nothing persists it, so a reload restarts
  at zero and can never replay a flourish.

The testable invariant:

```text
same arrival + same visible NPC = at most 1 notices-child
new arrival                     = eligible for 1 new notices-child
reload                          = no replay
```

A new arrival (a new nonce) may earn a new cue; the same arrival may never
re-fire — regardless of re-renders, dwell time, or repeated demand renders.

## One transform owner per group

A figure's transform has exactly **one owner per group node**, composed by
nesting — never several components independently mutating the same node:

```text
walk / React props        →  figure placement (position, rotationY props)
CharacterReact            →  its own group (semantic reaction transform)
IdleFlourish              →  its own nested group INSIDE CharacterReact
AvatarLiveliness          →  its own wrapper group around the avatar figure
local refs (eyes, arm)    →  detail meshes only, owned by the enclosing component
```

`useWalker` never touches the avatar's scene group — it drives props on
`models.Figure`, and React applies them. `AvatarLiveliness` may animate only
its own wrapper's rotation/scale, `IdleFlourish` only its own group's
lean/offset (plus the eye meshes it discovers below itself). Anything that
needs to move a figure for a new reason composes a new nested group, not a
second writer on an existing one — multiple writers on one node is the
classic way this layer regresses.

## Where the layers meet

`IdleFlourish` wraps each NPC figure **inside** its `CharacterReact` group, so
the semantic layer and the presentation layer never fight over the same
transform. `AvatarLiveliness` wraps the avatar figure and plays its chained
settle → glance → blink once per `arrivalNonce`. Under reduced motion the
flourish motion is dropped; the held activity pose remains, so the schedule
meaning ("the keeper is working") stays perceivable — decoration removed,
meaning kept.

## Reactive props — tap → one bounded reaction

PR 2 adds the spec's touchable world: `ReactiveProp` (`src/world/reactionBits.tsx`)
wraps a physical thing in an invisible generous tap surface — the visible
affordance is the object itself, never a ring or pulse — and ONE nested
flourish group the reaction owns. The tap does NOT `stopPropagation`: the
reaction is layered on the world's ordinary tap semantics, so the touch
still walks toward the thing exactly as a ground tap would (discover →
approach) — a prop tap is never a dead touch and never steals a walk
waypoint, which keeps arrival/world-time parity identical to a plain tap.

The vocabulary is closed (`src/world/reactions.ts`):

| reaction     | subject            | what the child sees                                             |
| ------------ | ------------------ | --------------------------------------------------------------- |
| `bend`       | flowers            | bows forward and eases back upright                             |
| `sway`       | plants             | wiggles side to side, settles                                   |
| `bloop`      | the fountain       | basin squash + a water ring + the fish dart away from the touch |
| `door-swing` | house/square doors | swings open a crack on its hinge and closes                     |

The fountain reaction is a micro-story, not an effect: `onReact` hands the
tap point to `useCritters`' `dartFish`, and every fish darts toward the far
basin edge in one bounded burst before its normal pause/swim schedule
resumes. The reactive tap surface sits ON the landmark's derived position
(`landmarkPosition`), and `FOUNTAIN_BASIN` derives from the same function —
the drawn basin and the fish's swim disc are the same circle by
construction, so the fish can never visually leave the water.

Same contract as the rest of the layer: one flourish per tap, deterministic
pure-function curves (`reactionTransform` returns the rest pose at t=0 and
t=1), `invalidate` only while playing, and reduced motion drops the motion
while the object's rest state — also its meaning — stays. Reactions record
to the `__worldReactions` probe log (subject + reaction, capped at 20, with a
separate `nextReactionSeq` counter so `seq` stays strictly monotonic past
the cap), the presentation counterpart of `__worldAttention`; they never
enter `__worldAnimationEvents`. The `__worldReactionStats` probe
(`started`/`active`/`completed`) makes the settle contract observable like
the semantic layer's stats: a flourish increments `started`+`active` when
its clock starts, `active` returns to 0 when it reaches rest (aborted
retaps decrement `active` without `completed`).

Transform ownership is unchanged: `ReactiveProp`'s flourish animates only its
own nested group. A door's hinge exists because the prop's group sits at the
slab's edge — the pivot comes from composition, not from a second writer.
One refinement: one transform owner per physical subject, but multiple
independently-owned physical consequences are allowed — `ReactionRipple`
mutates only its own mesh's scale/opacity and is a distinct consequence of
the same tap, not a second writer on the fountain. New effects must compose
that way, never pile extra writers onto one subject.

## Micro-discoveries — the world keeps little secrets

PR 3 extends the vocabulary to things that are _found_, not just touched:

| reaction  | subject     | what the child sees                                                         |
| --------- | ----------- | --------------------------------------------------------------------------- |
| `notice`  | nearest cat | stops and looks at the arriving child (child is already beside it)          |
| `follow`  | nearest cat | faces the child and hops one bounded step closer, then its patrol resumes   |
| `flutter` | a bird      | leaves its perch for a deterministic alternate perch, then resumes hopping  |
| `reveal`  | a leaf pile | the two leaf halves part once and a ladybug stays uncovered for the session |

The acceptance bar for every one of these: **interesting with no text,
reward, quest update, or marker.** The discovery is the physical change
itself — a cat that noticed you, a bird somewhere new, a ladybug that was
hiding — recorded only in the `__worldReactions` probe and session state.

- **Cat notice** reuses the `arrivalNonce` contract exactly: one completed
  arrival within the notice radius produces at most one cat response,
  regardless of re-renders or dwell — and when several cats are in range
  only the NEAREST responds (one arrival, one cat, counted globally).
  `noticeCats` is a controller method on `useCritters` (like `dartFish`),
  so it honors the same freeze flag; a follow never claims a patrol spot —
  the cat lands off-route and its ordinary location-driven patrol resumes.
- **Bird startle** is triggered by a generous invisible tap sphere inside
  each bird's registered node (`startle?: () => void` on `CritterView`),
  kept under the same no-`stopPropagation` rule — tapping a bird also
  walks the child, like any world tap. The destination is picked by the
  shared seeded LCG (`pickSpot`), so the alternate perch is deterministic
  per session and never the perch it left — the exclusion holds both the
  claimed destination (`spotId`) and the last settled perch (`restSpotId`),
  which differ while the bird is mid-hop.
- **Hidden finds** live in `HIDDEN_FINDS` (`decorations.ts`) — two authored
  spots verified clear of decorations and beside a walkable anchor. The
  cover (`FindCover`) is the only transform owner of its own leaf halves;
  the ladybug is always mounted under them. The revealed set is **session
  memory owned by `App`** (`revealedFinds`, passed down through
  `WorldCanvas`) — it lives above the per-map scene mount, so a cave
  round-trip keeps the find uncovered while a reload hides it again.
  Nothing is persisted. Under reduced motion the cover renders already
  parted: the uncovered thing is the meaning, the parting is the
  decoration.

## Memory tiers — do not merge them

- **Ambient** — cats, birds, fish: derived from the world, always live.
- **Reactive** — bends, bloops, door swings: event → bounded animation →
  settle.
- **Session memory** — `App`-lifetime state only (`revealedFinds`, attention
  nonces). It may remember player interaction for the current application
  lifetime, but it must never become an alternative persistence layer: any
  behaviour intended to survive a reload must derive from existing
  persisted facts or a deliberate save-schema change — never a new
  `localStorage` write, world-state bag, or event log.
- **Persistent memory** — resolved, never stored. Completing a quest is a
  saved fact the world already has; `resolveNpcPresentation(npcId,
questStatuses)` (`liveliness.ts`) maps it onto presentation deltas for
  one NPC (the baker greets the child like a friend — `greets-child` +
  `happy` pose instead of a stranger's notice), and `FACT_DECORATIONS`
  (`decorations.ts`) renders earned objects beside the landmark they belong
  to (a bread crate by the bakery). The whole "world remembers" surface is
  that one table — no persisted fields, no flags, no tracking. Probe:
  `__worldFactDecorations`.

## Testing

- `src/world/liveliness.test.ts` — deterministic cue selection, pose mapping,
  bounded transform magnitudes.
- `e2e/liveliness.spec.ts` — one-arrival-one-cue, dwell never repeats, a second
  arrival earns a second cue, presentation never enters the semantic stream,
  `active === 0` after settling, reduced motion, and no replay on reload.
- `src/world/reactions.test.ts` — every reaction rests at both ends of its
  curve, stays inside small physical arcs, and is deterministic;
  `useCritters.test.ts` — the fountain dart retargets every fish inside the
  basin along the away-from-tap direction and is a no-op while frozen, plus
  the cat follow/notice contract (bounded step, look-only when the child is
  beside it, none out of range) and the deterministic bird startle;
  `decorations.test.ts` — every `HIDDEN_FINDS` spot is decoration-clear and
  beside a walkable anchor.
- `e2e/reactive.spec.ts` — a prop tap reacts while keeping the world's
  ordinary tap semantics (the child still walks/selects), reactions never
  enter `__worldAnimationEvents`, `__worldReactionStats` returns to
  `active === 0` after settling, repeated taps answer again, and reduced
  motion still registers the reaction.
- `e2e/discovery.spec.ts` — one cat response per arrival (counted globally
  with two cats in range), a tapped bird leaves for another perch, a leaf
  pile parts exactly once and stays revealed (a second tap is just an
  ordinary walk), the revealed find survives a cave round-trip but not a
  reload, and reduced motion still uncovers the find.
- `e2e/memory.spec.ts` — a completed errand resolves into a warm baker
  (greets-child, not notices-child) and the persistent bread crate; without
  the errand the world is the ordinary one.
