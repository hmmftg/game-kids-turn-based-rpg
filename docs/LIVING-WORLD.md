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
reaction therefore carries an explicit identity: `arrivalNonce`, a counter
incremented once per avatar arrival in `App.tsx` and stamped onto
`NpcAttention`/`__worldAttention` and the avatar's liveliness wrapper.

**Invariant:** a given avatar arrival may produce at most one `notices-child`
episode for a given visible NPC — regardless of re-renders, dwell time, or
repeated demand renders. A new arrival (a new nonce) may earn a new cue; the
same arrival may never re-fire.

## Where the layers meet

`IdleFlourish` wraps each NPC figure **inside** its `CharacterReact` group, so
the semantic layer and the presentation layer never fight over the same
transform. `AvatarLiveliness` wraps the avatar figure and plays its chained
settle → glance → blink once per `arrivalNonce`. Under reduced motion the
flourish motion is dropped; the held activity pose remains, so the schedule
meaning ("the keeper is working") stays perceivable — decoration removed,
meaning kept.

## Testing

- `src/world/liveliness.test.ts` — deterministic cue selection, pose mapping,
  bounded transform magnitudes.
- `e2e/liveliness.spec.ts` — one-arrival-one-cue, dwell never repeats, a second
  arrival earns a second cue, presentation never enters the semantic stream,
  `active === 0` after settling, reduced motion, and no replay on reload.
