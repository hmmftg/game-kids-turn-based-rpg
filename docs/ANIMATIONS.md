# Semantic animation contract

The animation vocabulary for the child-facing game, settled in PR F. This document is the
reference for anyone adding motion to the world or the encounter UI.

## Why

Children repeatedly asked "What is this?" when shown abstract action/feedback animations.
The problem is **semantic comprehension**, not animation quality. The acceptance criterion:

> A 3–7-year-old can explain what happened without being told.

So the animation language is **real objects, real actors, and recognizable physical
consequences** — never arrows, pulsing rings, floating markers, or abstract "this is
important" effects.

## The rules

1. **Every primary gameplay animation shows a recognizable physical state transition** —
   verb → consequence. Feedback/decorative motion may exist only as secondary reinforcement
   and may never be the sole explanation of an interaction.

   | category                            | rule                                        |
   | ----------------------------------- | ------------------------------------------- |
   | gameplay consequence                | must be a physical/semantic transition      |
   | tap acknowledgement (`.st-pressed`) | ~160 ms press state allowed                 |
   | environmental life                  | allowed when non-instructional              |
   | celebration                         | allowed only after the consequence          |
   | wayfinding                          | must use a physical/contextual relationship |
   | abstract "this is important" effect | forbidden                                   |

2. **One dominant semantic episode at a time.** One physical consequence may contain a
   short sequential chain of physically related submotions
   (`ObjectLift → ObjectFlyTo → settled`), plus at most one contextual character reaction.
   At no instant should unrelated effects compete.

3. **Discoverability gate (per flow, binary).** A flow passes only when the child
   independently identifies the intended physical target without adult explanation and can
   start the intended interaction without repeated trial-and-error. A single exploratory
   tap may be recorded; repeated wrong targeting or "what is this?/where do I tap?" blocks
   the flow. Do not average across flows. At least one gate scene must contain multiple
   plausible physical things (the book scene keeps the ball and other objects) — otherwise
   success proves nothing about discoverability.

4. **Do not introduce an animation merely because an effect was removed.** An empty visual
   state is acceptable — `remove marker → nothing added` is the default, not
   `remove marker → smaller pulse`.

## Primitive vocabulary (deliberately small)

Physical verbs on objects:

- `ObjectLift`, `ObjectDrop`, `ObjectOpen`, `ObjectBounce`, `ObjectFlyTo(target)`,
  `ObjectSeparate`, `ObjectUncover`, `ObjectReceive`

`ObjectFlyTo` must visibly move the existing object **continuously** from source to
destination — no teleport/pop at either endpoint; the object stays recognizable throughout
and ends in the authoritative destination state.

`ObjectReceive` is defined by its authoritative state change (shell no longer held /
basket contains shell); the settle bounce is only its visual.

Characters:

- `CharacterReact(actor, context)` — the **only** child-facing semantic character
  operation. `CharacterTurn`/`CharacterLook`/`CharacterWave` are low-level composition
  helpers and must not be invoked independently for gameplay feedback unless a specific
  scene explicitly requires them.
- Closed `context` vocabulary — every entry maps to an observable body action:
  `receives-kite`, `receives-shell`, `receives-crystal`, `looks-at-book`, `questioning`,
  `greets-child` (turn + wave internally), `notices-child` (arrival cue — deliberately
  distinct from `greets-child`), `celebrates`. Abstract emotional/status labels
  (`"important"`, `"correct"`, `"attention"`) are forbidden.

Do not extract a new primitive for a single use — inline the physical transition and
generalize only on a second real use case.

## Canonical compositions

| flow           | episode                                                             |
| -------------- | ------------------------------------------------------------------- |
| pick object    | `ObjectLift → ObjectFlyTo(hand)`                                    |
| give kite      | `ObjectFlyTo(kite → Sara)` + `CharacterReact(Sara, receives-kite)`  |
| give shell     | `ObjectFlyTo(shell → basket)` + `ObjectReceive(basket)`             |
| answer book    | `ObjectOpen(book)` + `CharacterReact(teacher, looks-at-book)`       |
| wrong answer   | `CharacterReact(teacher, questioning)` **only** — the wrong object  |
|                | remains physically where it is; no success animation, no shake      |
| NPC talk       | `CharacterReact(npc, greets-child)` parallel with dialogue, ungated |
| arrival at NPC | `CharacterReact(npc, notices-child)` or nothing                     |
| crystal        | `ObjectSeparate`/`ObjectUncover → ObjectFlyTo(hand)` (inlined)      |

## Instrumentation

Dev/probe-only (`import.meta.env.DEV || window.__WORLD_PROBE`), in
`src/services/animationEvents.ts`:

- `window.__worldAnimationEvents` — `{type, subjectId, actorId?, context?, startedAt,
completedAt}` per semantic instance.
- `window.__worldAnimationStats` — `{active, started, completed}`, derived from event
  timestamps (not timers). Counts **only** new-layer semantic instances — never passive
  CSS transitions, audio, ambient critters, or camera follow.

Presentation liveliness — blinks, idle cues, settle/glance flourishes, held activity
poses — is bounded visual polish and is **never** recorded here; the stream answers
"what semantic thing happened?", not "what moved?". See `docs/LIVING-WORLD.md`.

Assertion: `active === 0` after each semantic episode completes, before the next
interaction. Post-consequence HUD decoration is outside this metric. There is zero
animation-driven rendering when idle — no permanent animation loop may exist solely to
keep a cue alive.

## `?kidtest=noactionicons`

Removes every non-physical action affordance: quest emoji, animated hands, residual
action icons, directional arrows, and held-item/action badges. Physical state indicators
(the actually-held object) remain. Composable with `?kidtest=nocopy`; in that end state
only physical objects + characters + relationships + motion + optional sound explain
anything.

## Audit decisions (applied)

REMOVED: `Hotspot` pulse, `QuestMarker`, `DestinationMarker`, `InteractionHint` finger,
`demo-bob`, `retry-wobble`, `AttentionPulse` (→ `CharacterReact(npc, notices-child)` or
nothing), world hotspot rings/discs.

KEPT: `.st-pressed` tap ack, `scene-arrive`, `ConsequenceScene`, `KeepsakeTree`,
celebration, cave entrance (reclassified as a physical crack-widens transition).
