# AGENTS.md

## Purpose

This repository contains a child-oriented, turn-based RPG designed for young children.

AI coding agents working in this repository must prioritize:

1. **Child comprehension**
2. **Existing gameplay correctness**
3. **Accessibility and touch usability**
4. **RTL/Persian correctness**
5. **Performance and reliability**
6. **Maintainable architecture**
7. **Visual polish**

The product should feel like a:

> **guided interactive toy**

rather than a conventional, menu-heavy RPG.

The expected interaction model is:

```text
DISCOVER → APPROACH → WATCH → TRY → CELEBRATE → EXPLORE
```

---

# 1. Non-Negotiable Rules

## 1.1 Preserve gameplay/domain logic

AI agents must not modify gameplay semantics unless the task explicitly requires it.

Treat the following as protected:

- `src/domain/*`
- quest rules
- encounter rules
- progression rules
- reducer semantics
- save semantics
- persistence schema
- core game-state transitions

Do not alter gameplay merely to make UI implementation easier.

Prefer adapting the presentation layer to existing game state.

---

## 1.2 One source of truth

Do not create parallel representations of gameplay state.

Do not duplicate:

- quest state
- progression state
- encounter phase
- player progress
- sticker ownership
- save data

UI components must consume existing state.

UI-only ephemeral state is acceptable for things such as:

- animation visibility
- temporary hints
- transient celebration state
- pressed state
- local presentation transitions

Do not persist UI state unless explicitly required.

---

## 1.3 Do not modify persistence for cosmetic features

Do not change `PersistedState`, save schemas, migrations, or persistence formats merely to support:

- animations
- tutorials
- visual hints
- celebration state
- UI transitions

Prefer session/transient state.

Any persistence change requires explicit justification and corresponding migration/testing.

---

## 1.4 No unnecessary dependencies

Do not add a dependency when the existing stack can support the requirement.

Before adding a package:

1. inspect existing utilities/components
2. determine whether native APIs or existing dependencies suffice
3. verify the package is genuinely necessary

Avoid new dependencies, new state models, and new architectural layers for presentation work.

---

# 2. Verification Commands

Run these before opening or updating a PR:

```bash
npm run verify        # format:check + lint + typecheck + unit tests + build (incl. content validation + bundle budgets)
npx playwright test   # golden-path e2e (landscape-mobile project)
```

- `npm run verify` must be fully green — do not skip stages because a previous PR passed them.
- Playwright browsers must be installed once per machine: `npx playwright install chromium`.
- When e2e touches the celebration overlay, dismiss it via `celebration-continue` before tapping onward — the overlay intercepts pointer events by design.

---

# 3. Content & Copy Rules

- All child-facing copy lives in `src/content/fa/*` and is enforced by `validate:content` (forbidden terms, no quotation marks). Never bypass it.
- Do not shorten production copy to hide a layout defect — fix the layout instead.
- Keep messages short and icon-first; a pre-reader navigates by pictograms, not text.

---

# 4. RTL / Persian Rules

- Verify rendered visual order, not just `dir="rtl"` in the DOM: icon/text order, connector direction, arrows, choice ordering, number placement, punctuation, bidi for mixed Persian/Latin/emoji strings.
- The quest trail derives connector direction from DOM order — do not add `row-reverse` or reorder nodes; check flex/grid/absolute/transform placement under RTL.
- The HUD is DOM-based deliberately (RTL text does not belong inside the WebGL canvas). Keep it that way.

---

# 5. Rendering / Lifecycle Rules

- The R3F `<Canvas>` unmounts for parent area and pause. Unmounting fires `webglcontextlost` via `forceContextLoss()` — this is teardown, not a GPU failure. Genuine-loss handling is guarded by the `CanvasLiveness` flag in `WorldCanvas.tsx`; keep that distinction intact.
- The canvas is demand-rendered (`frameloop="demand"`). No persistent animation loops, `useFrame` timers that outlive their purpose, or duplicated scenes/listeners. Animation that eases toward state must invalidate only until settled.
- Emoji are a primary communication channel; test-rendered tofu boxes on headless Linux indicate a missing emoji font, not an app bug.

---

# 6. Presentation-Only Feedback Rules

- Celebration, hints, and growth animations are presentation layered on already-committed state. Dismissing them must never alter progression, and reload must never replay them.
- A persisted checkpoint replay must not re-trigger session feedback. The celebration fires only for a `questCompleted` checkpoint strictly newer than any seen this session (`seenCheckpointAtRef` watermark in `App.tsx`) — preserve that invariant: hydration on boot, profile select, and profile switch-back must never re-celebrate.
- Reduced motion removes decoration, not meaning: state changes must remain perceivable without animation.

---

# 7. Touch & Child-Safety UX Rules

- All interactive elements respect `--touch-min`; no hover-only interactions, no color-only state, no tiny controls.
- Rapid/repeated taps must not duplicate dialogs, transitions, or effects.
- Wrong answers are never punitive: gentle retry copy and re-demonstration, no red/error styling for children.
- Parent-only surfaces (quality tier, per-profile reset) stay behind the press-and-hold `ParentGate`.

---

# 8. Repository Hygiene

- `*.tsbuildinfo` is gitignored but historically tracked — do not commit changes to it (`git checkout origin/main -- <file>` if a build dirties the diff). Prefer `git rm --cached` cleanup over repeated churn.
- E2e selectors use `data-testid`; keep them stable and add them for new child-facing controls.
- Keep PRs scoped: acceptance-style work changes only what evidence shows is broken.

---

# 9. Contextual Interaction Rules (overhaul contract, PRs #27–#31)

The child's interaction language is **the physical thing**, never an action icon. Full contract:
`docs/INTERACTION-MODEL.md`. Agent-facing rules:

- **The child must always be able to leave.** Never force a child to read, talk, confirm, continue, or complete a chain merely because they entered an interaction. Outside-tap dismissal is universal and free (0 mandatory actions); a modal's backdrop swallows world input so it never double-fires.
- **No continue-to-continue.** A successful child action advances the game automatically to the next meaningful state — no intermediate "Next" gates. Passive encounter phases auto-play on dwell timers; only the object choice waits for the child.
- **Interaction ownership.** Arriving at an NPC or hotspot never opens dialogue; only a deliberate tap on the figure/object does. Quest chips navigate and focus only.
- **Truthful feedback.** Never animate an accepted outcome before `CHOOSE` resolves. Pre-commit feedback is the ~160 ms press pulse only; `ConsequenceScene` may appear **only** on a correct response — a wrong tap gets gentle retry, never a success animation.
- **One obvious target.** `prominence` derives from `iconId === correctIconId`, not from role. Exactly one `primary` object per step; wrong objects stay tappable but `secondary`, escape routes faintest. Enforced by test.
- **No action vocabulary on the child surface.** Do not reintroduce a glyph/icon row into `playerChoice` (or anywhere — `ActionGlyph` is deleted). Choices without a distinct physical target (`sceneElementFor → null`) are absent, not degraded to icons.
- **Model boundary.** Interaction context is computed by `contextForStep()` (pure). UI components must not re-derive correctness or invent interaction rules — and gameplay rules never move into UI components.
- **Double-tap guard** on `InteractiveTarget` must stay: the buffered commit window makes it required.

## 9.1 Interaction budget (hard validator)

`src/domain/quests/interactionSteps.ts` counts **mandatory child actions** on the interaction graph: passive beat 0, object choice 1, interaction entry 1, outside-tap exit 0, optional dialogue tap 0. `validate:content` fails the build (`interaction-budget`) when a step forces >2 actions or a dialogue forces >1 on its heaviest required-choice path; a dialogue with no required choice costs 0 to exit. Any new quest/dialogue content must stay inside the budget — adding a forced tap fails `npm run verify`.

---

# 10. Documentation Map

- `README.md` — setup, scripts, content governance.
- `AGENTS.md` — rules every agent must follow (this file).
- `docs/ARCHITECTURE.md` — module map, invariants, budgets.
- `docs/INTERACTION-MODEL.md` — contextual-target interaction contract.
- `docs/QA.md` — suites, perf baselines, lifecycle/reduced-motion QA, kid-test protocol.
- `.agents/skills/testing-kids-rpg/` — how to drive the app for UI-driven testing.
