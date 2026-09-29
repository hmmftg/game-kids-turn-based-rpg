# QA & testing playbook

## Suites

| Suite               | Command                                                                    | What it covers                                                                        |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Unit/component      | `npm test` (Vitest + jsdom)                                                | domain transitions, persistence, kidUx limits, contextual targets, critter controller |
| Full check          | `npm run verify`                                                           | format → lint → typecheck → tests → build (content validation + bundle budgets)       |
| Renderer budgets    | `node --experimental-strip-types scripts/measure-world.ts --url <dev-url>` | calls/tri/obj/geo per tier ×3 samples, pass/fail ceilings                             |
| Visual/lifecycle QA | `node --experimental-strip-types scripts/qa-screenshots.ts <outdir>`       | deterministic screenshots, remount lifecycle regression, reduced-motion immobility    |
| E2E                 | `npx playwright test`                                                      | 32 tests, golden paths, orientation, offline, multi-profile, WebGL fallback           |

Always run `verify`, `measure-world`, `qa-screenshots`, and Playwright before a PR.

## Performance numbers

Budget **ceilings** are enforced in `scripts/measure-world.ts`. The current **observed sampled
maxima** (PR #16 era, unchanged since — DOM-only interaction work doesn't touch the canvas):

| Tier   | Calls | Objects | Triangles |
| ------ | ----- | ------- | --------- |
| low    | 76    | 118     | 3,260     |
| medium | 203   | 275     | 6,566     |
| high   | 296   | 389     | 9,002     |

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

Simulated pre-reader passes (an agent ignoring all text and judging visuals only) are a useful
cheap proxy, but they measure legibility, not cognition — they do not replace the real session.
