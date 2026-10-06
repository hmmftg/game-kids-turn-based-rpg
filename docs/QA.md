# QA & testing playbook

## Suites

| Suite               | Command                                                                    | What it covers                                                                                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/component      | `npm test` (Vitest + jsdom)                                                | domain transitions, persistence, kidUx limits, contextual targets, critter controller                                                                                                                         |
| Full check          | `npm run verify`                                                           | format → lint → typecheck → tests → build (content validation + bundle budgets)                                                                                                                               |
| Renderer budgets    | `node --experimental-strip-types scripts/measure-world.ts --url <dev-url>` | calls/tri/obj/geo per tier ×3 samples, pass/fail ceilings                                                                                                                                                     |
| Visual/lifecycle QA | `node --experimental-strip-types scripts/qa-screenshots.ts <outdir>`       | deterministic screenshots, remount lifecycle regression, reduced-motion immobility                                                                                                                            |
| E2E                 | `npx playwright test`                                                      | golden paths, orientation, areas/dialogue branching, camera, cave maps, pacing, Mode-B no-copy, offline, multi-profile — never run two playwright invocations in parallel; `rm -rf test-results` between runs |

Always run `verify`, `measure-world`, `qa-screenshots`, and Playwright before a PR.

## Performance numbers

Budget **ceilings** are enforced in `scripts/measure-world.ts`. The current **observed sampled
maxima** (measured on this branch; `main` measures within ±1 call and −6 objects of these —
the ceilings below are stale and already exceeded on `main`):

| Tier   | Calls | Objects | Triangles |
| ------ | ----- | ------- | --------- |
| low    | 86    | 178     | 4,322     |
| medium | 227   | 404     | 7,484     |
| high   | 326   | 546     | 9,992     |

These are observed samples, **not** mathematical bounds — they may vary a little across runs. Do
not raise ceilings to fit a feature; simplify geometry first.

## Lifecycle regression

`qa-screenshots.ts` plays greeting + helping + tidying to completion through the scene targets,
then remounts the canvas three ways (portrait cycle, parent-area round-trip, quality-tier cycle)
and asserts the renderer's object count equals the post-completion baseline. Baseline must be
captured **after** quest completion — completed quests grow keepsake blossoms and unlock markers
(389 → 393 objects).

## Reduced motion

QA emulates `prefers-reduced-motion: reduce`, reloads, samples all critter transforms via the
dev-only `__worldCritterTransforms` hook (stripped from builds), waits past ambient idle windows,
and asserts positions/rotations unchanged. All new feedback motion must be CSS `animation` and
listed in the reduced-motion `animation: none` block in `hud.css`.

## Scene/interaction QA captures

Deterministic states in `qa-screenshots.ts`: `scene-pick` (leaf primary + faint escape),
`scene-place-held` (held basket + destinations), `scene-place-targets`,
`scene-consequence` (truthful outcome on the response card), plus the original portrait,
demonstrate, choice, and success captures.

## Pacing & interaction-ownership QA

`e2e/pacing.spec.ts` covers the encounter-compression contract: passive phases
auto-advance on dwell timers, a real object tap is the only mandatory action per step,
reload mid-passive-phase resumes cleanly, tab hide/restore restarts the phase timer, and
outside-tap leaves a dialogue or encounter without confirmation.
`e2e/npcTap.ts` is the shared harness — `enableWorldProbe` (init flag before first goto),
`waitForProbe`, `tapNpcFigure` (the figure itself, not nearby ground — arrival never opens
dialogue), `openQuestDialogue`, `tapWorldAnchor` (hop-aware far-anchor taps under the
follow camera), `waitForCameraSettle`, `dismissDialogue`. Mode B (`?kidtest=nocopy`)
runs with all rendered copy hidden — the pictographic question card must carry the
question; school steps record tap positions for same-position-pattern detection.
`?kidtest=` accepts a comma/space-separated flag list: `nocopy` hides rendered copy;
`noactionicons` strips every non-physical action affordance (quest emoji, hand
markers, action icons, directional arrows, held-item badges) while physical state
like the actually-held object stays. `?kidtest=nocopy,noactionicons` is the full
semantic-comprehension mode.

## Semantic animation storyboard

`e2e/animations.spec.ts` runs under `?kidtest=nocopy,noactionicons` and asserts the
physical-episode contract from `docs/ANIMATIONS.md` on the dev-only instrumentation
(`window.__worldAnimationEvents` / `__worldAnimationStats`, enabled via
`__WORLD_PROBE` before first goto): arrival earns `notices-child` and tapping the
figure earns `greets-child` in parallel with dialogue; kite pickup is
`object-lift → object-fly-to(hand)`; giving is `object-fly-to` plus the receiver's
`CharacterReact`; shell→basket ends in authoritative `object-receive`; the book
answer is `object-open` + `looks-at-book`; a wrong pick records **exactly**
`character-react/questioning` — no success events, no held or destination change.
Every scenario asserts `active === 0` after the episode, proving no permanent
animation loop exists to keep a cue alive. The noactionicons scenario keeps the
book scene's distractors (ball and friends) visible and tappable while asserting
zero rings, marks, badges, and copy.

## Scalable world QA

`e2e/liveliness.spec.ts` covers the presentation-liveliness contract
(`docs/LIVING-WORLD.md`): one arrival produces at most one `notices-child` per
NPC (`arrivalNonce` identity), dwell never repeats, a second arrival earns a
fresh cue, idle flourishes/poses never enter `__worldAnimationEvents`,
`active === 0` after settling, reduced motion drops flourish motion but keeps
meaning, and reload never replays arrival liveliness. For arrival assertions
prefer `tapWorldGround(page, x, z)` — a single exact ground tap. Anchor centers
are not always safe tap points: a locked quest hotspot's tap zone intentionally
swallows clicks (`stopPropagation` with `active === false`), so a tap meant to
walk somewhere must land on open ground whose nearest walkable anchor is the
intended destination.

`e2e/areas.spec.ts` covers the world-growth scenario: multiple areas/NPCs in the world data,
multi-beat dialogue + a branch choice through the quest trail, leave/return persistence, and
the full area-activity chain — every expanded-area quest (park kite, river shell, market
errand, school answer) played end to end through real taps on the physical targets, with
progress verified after a reload.
`world/registry.test.ts` covers the data invariants: unique ids, every anchor/NPC/decoration
inside a real area, resolvable dialogue/quest references, the fisher schedule determinism, and
the visible-area cap (≤8 NPC figures) that keeps inactive areas free.

## Secondary-map (cave) QA

`e2e/cave.spec.ts` drives the secret-entrance flow with real canvas taps (world-probe
`__worldToScreen` + `__worldMapId`/`__worldAt`/`__worldDiscoveries`, enabled via the
`__WORLD_PROBE` init flag): walk to the hidden rock → discovery persists → tap the doorway →
cave map mounts → exit lands on the exact outdoor entrance → re-enter skips discovery →
reload restores the cave map and spawn. The quest test plays the full town chain, then the
cave-crystal quest inside the cave. `world/maps.test.ts` + `domain/game/reducer.test.ts`
cover unique map ids, spawn/bounds validity, both-way transition refs, no cross-map edges,
map ownership of cave content, `DISCOVER`/`CHANGE_MAP` reducer semantics, and save
round-trips (old saves default to town). Canvas-tap tests are landscape-only — a portrait
viewport can leave the rock outside the tappable canvas, which `tapWorld` skips cleanly.

## Battle QA (PR I)

`e2e/battle.spec.ts` drives the micro battle end to end: tap the playful mouse's
figure → `battle-scene` mounts → intro auto-plays to `playerChoice` → ball taps
take one heart per round → terminal `victory` → `battle-continue` returns to a
plain hub with `__worldBattleState === null`. A second test asserts input
ownership (the pause button sits under the overlay), the harmless cushion, and
mid-battle leave. `src/domain/battle/battle.test.ts` covers the outcome matrix,
final-round precedence (hearts beat the round counter), terminal states, the
reducer's blocked-commands guard, and `LEAVE_BATTLE` semantics. Probe fields:
`__worldBattleState`, `__worldBattleEvents` (`phase@round` rows + `end`).

## PWA / offline lifecycle QA

`e2e/pwa.spec.ts` covers the install-to-airplane lifecycle against the production
`preview` build (the service worker registers only outside dev):

- **Cold start fully offline**: after `serviceWorker.ready` resolves (precache
  complete), a _new page_ navigates `/` with the network off — the SW
  `navigateFallback` must serve the app, the saved profile must be offered, and
  a quest must be playable. Note `page.addInitScript` is per-page: the cold page
  needs `enableWorldProbe` registered again before its `goto`.
- **Storage fallback**: an init script that makes `indexedDB.open` reject (the
  evicted/private-window path) must still boot — `GameProvider` retries boot on
  `MemorySaveRepository`, progress is session-only, and a reload returns to the
  fresh title rather than a saved profile.

Update lifecycle by construction (not e2e'd): `registerType: 'prompt'`, the
waiting worker surfaces `updateReady`, and the apply action lives only inside
the gated parent area — a child is never interrupted mid-encounter.
`e2e/slice.spec.ts` additionally replays a completed chapter across an offline
reload (the wait is `serviceWorker.ready`, not `controller` — `clientsClaim` is
off, so the registering page is never controlled).

## Kid-testing protocol (manual)

The automated suites prove technical correctness, not comprehension. When validating UX changes
with a child, run the protocol used since PR #17:

1. Avatar: "Which character do you want to play?" — don't explain the avatars.
2. First interaction: "What do you think you can do here?" — don't read text aloud.
3. Per action: "What would you do?" — no demonstration first; watch whether they identify the
   object and predict the result.
4. Text: note every point the child asks for a read or waits for instructions.
5. End: only "What was easy?" and "What was confusing?"

Measure **Recognition** (knows what to touch unaided), **Action understanding** (predicts the
result), and **Recovery** (figures out the next step after a wrong pick). A 3–5s hesitation
counts as a weak signal even if the child eventually succeeds.

For the animation contract the gate is **binary per flow** — record, per flow: first
target tapped, wrong taps before the first correct target, time to first intentional
tap, and "what is this?" count. A flow passes only when the child independently
identifies the physical target and starts the interaction; one exploratory tap is
tolerable, repeated wrong targeting or "where do I tap?" fails that flow. Do not
average across flows. At least one scene must present multiple plausible physical
things (the book scene keeps the ball and other objects) — a lone obvious object
proves nothing about discoverability.

Simulated pre-reader passes (an agent ignoring all text and judging visuals only) are a useful
cheap proxy, but they measure legibility, not cognition — they do not replace the real session.
