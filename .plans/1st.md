---
agent: devin-local
session: paint-bathtub
created: 2026-09-23T13:24:33Z
---
# Persian Children’s Three.js RPG Vertical Slice

Build a privacy-first, offline-capable Persian RTL browser RPG for ages 3–7, using a lightweight React Three Fiber hub and three nonviolent, scholar-reviewed daily-manners quests.

## Summary

Create a greenfield, mobile-first vertical slice provisionally titled **«محله‌ی مهربانی»**. It will be a 20–30 minute, landscape-only browser experience in which a child chooses one of two equivalent cubic avatars, explores a small fixed-isometric neighborhood by tapping destinations, talks with 4–6 NPCs, and completes three linked turn-based quests about **سلام و ادب**, **کمک و مهربانی**, and **پاکیزگی و نظم**. A short cooperative finale reuses all three learned actions.

The game will use **React + TypeScript + Vite + React Three Fiber/Three.js**, run as an **offline PWA**, store progress only on-device, and hard-target current Chrome/Samsung Internet on Galaxy A05s and Galaxy A07 plus current Safari on iPhone 13. It will contain no accounts, ads, analytics, chat, user-entered names, or backend. Child-facing teaching will use large icons, animation, extremely short Persian RTL text, nonverbal sound effects, and original instrumental music; exact citations will live behind a parent gate.

The repository currently contains only `README.md` and an MIT `LICENSE`, so all application structure is new. The referenced source site currently returns HTTP 503 to direct requests, while indexed pages describe the 2–7-year **طیب‌گزینی** stage, cultivating wholesome senses/affections and speech, and sowing beautiful beliefs. Exact quotations, page references, and interpretations must therefore come from the permissioned source copies supplied to the project and pass named scholar/editor review; implementation must not invent hadith text or infer citations from search snippets.

## Product Definition

### Audience and play model

- Primary audience: Persian-speaking children ages 3–7.
- Independence goal: the full critical path is completable without reading or adult assistance.
- Text remains available for ages 5–7 and adults, but every required instruction has an unambiguous visual demonstration and icon.
- Because independent icon-only play by a three-year-old is a high-risk usability claim, completion by ages 3–4 is a release gate requiring observed child testing; if testing fails, revise interactions rather than silently changing the audience claim.
- Sessions should naturally break into 5–8 minute quests, with autosave and a clear resume action.

### Vertical-slice story flow

1. **Start and avatar choice**
   - Child taps a large play symbol to satisfy browser audio-unlock rules.
   - Select one of two modestly dressed, mechanically identical cubic avatars.
   - A two-step animated tutorial demonstrates “tap a glowing place” and “tap an action icon.” No text is required.
2. **Neighborhood hub**
   - One small Iranian-inspired storybook neighborhood containing home frontage, lane, small shop, garden/park, and community gathering area.
   - Four to six NPCs, three quest landmarks, a visible progress keepsake, and no large seamless world.
   - Fixed orthographic/isometric camera; no camera controls or virtual joystick.
3. **Quest 1 — سلام و ادب**
   - Observe an NPC arrival, tap the greeting destination, then choose the greeting icon.
   - Avatar and NPC alternate short animated turns; the NPC responds warmly.
   - Reinforcement uses a simple child-facing summary, not an unreviewed religious claim.
4. **Quest 2 — کمک و مهربانی**
   - Notice an NPC with a concrete, safe need, choose the help icon, and complete a short cooperative carry/place sequence.
   - No timer, punishment, moral score, or “bad child” language.
5. **Quest 3 — پاکیزگی و نظم**
   - Restore a shared space by selecting visible objects and placing them in clearly illustrated destinations.
   - Keep classification culturally neutral and mechanically simple; avoid unsafe imitation tasks.
6. **Cooperative finale**
   - A neighborhood preparation scene asks the child to replay greeting, helping, and tidying in a three-turn sequence.
   - Completion grants chapter stickers/keepsakes, not quantified piety or claims of divine reward.
7. **Return/resume**
   - Revisit completed activities freely, reset from the gated parent area, or close and resume from the latest stable checkpoint.

### Turn-based RPG definition

- “Turns” mean alternating, state-driven actions among player, NPC, and environment—not combat rounds.
- Encounter phases are `intro → demonstrate → playerChoice → worldResponse → reinforce → complete`.
- Choices use at most 2–3 large pictograms. Incorrect choices trigger a gentle animation and another demonstration, never damage, loss, shaming, or blocked progress.
- RPG progression consists of quest state, collected story stickers, unlocked interactions, and visible improvement of the shared neighborhood; there are no health bars, attack stats, loot economies, or monetization.

## Religious and Educational Content Governance

### Source-of-truth policy

- Treat the permissioned editions of `کتب منظومه رشد`, approved Shia hadith collections, and reviewer-supplied source notes as the only authoritative inputs.
- The website and search results are discovery aids only; they are not sufficient evidence for exact quotation, translation, attribution, or doctrine.
- Do not place copyrighted scans or unrelated source assets in the repository unless the documented permission explicitly allows repository distribution under the project’s MIT license. Game code can remain MIT while third-party/source content receives its own attribution and licensing metadata.
- Never generate or paraphrase a hadith and present it as authentic without a supplied source record and explicit reviewer approval.

### Content record required for every lesson

Each child-facing lesson and parent source card will carry structured metadata:

- Stable lesson/source ID and locale.
- Child-facing Persian summary.
- Meaning-bearing icon ID and required animation cue.
- Exact Arabic quotation when applicable, approved Persian translation, and whether either may be reproduced.
- Work title, author/compiler, edition, publisher, volume, page, chapter, hadith number, and source URL when applicable.
- Learning objective, intended age band, and notes explaining how the mechanic represents the source.
- Rights status and attribution requirements.
- Scholar reviewer, child-development/editor reviewer, review dates, review status, and revision notes.
- Status values `draft`, `religious-review`, `child-review`, and `approved`; production content validation fails if reachable content is not `approved`.

### Review workflow

1. Product writer drafts the scenario and concise child copy without adding religious claims.
2. Named Shia scholar verifies interpretation, hadith authenticity, translation, and respectful depiction.
3. Child-content editor verifies developmental suitability, emotional safety, clarity, and reading load.
4. A Persian proofreader checks RTL shaping, punctuation, Arabic diacritics, and wording.
5. Content is tested with children in each sub-band (3–4 and 5–7), revised, and re-approved if meaning changes.
6. Reviewer names/dates and exact citations become local source cards behind the parent gate.

## Technical Architecture

### Stack and dependency policy

- Vite, React, and strict TypeScript for the application shell.
- Three.js through `@react-three/fiber`; use `@react-three/drei` only for small, justified helpers rather than importing broad features indiscriminately.
- A small pure TypeScript reducer/state machine for route, quest, encounter, and pause transitions. React context exposes commands; transient 3D animation state stays outside persistent game state. Avoid a large game engine or physics library.
- `vite-plugin-pwa`/Workbox for manifest and cache versioning.
- IndexedDB behind a tiny repository adapter for versioned local saves; no remote sync.
- Vitest + Testing Library for domain/UI tests and Playwright for browser flows. Add automated accessibility checks if their package cost is development-only.
- Install exact, stable package versions that have been published for at least seven days; commit the npm lockfile. Use `npm.cmd` in this Windows environment because plain `npm` currently resolves through a broken WSL path.

### Runtime layers

1. **App shell** — bootstrap, error boundary, orientation check, loading/update UI, route state, and RTL global styles.
2. **Domain** — typed game state, commands, quest prerequisites, encounter reducer, save schema/migrations, and deterministic selectors.
3. **Content** — Persian strings, icon semantics, quest definitions, dialogue nodes, source records, review state, and compile/test-time validation.
4. **3D world** — orthographic camera, shared cubic geometry/materials, hub layout, avatar/NPC presentation, hotspot picking, movement controller, and interaction markers.
5. **2D HUD** — child dialogue cards, icon choices, quest trail, pause/settings, loading, resume, feedback, and parent area. Keep text/UI in DOM rather than canvas for RTL correctness and accessibility.
6. **Platform services** — audio unlock/mixer, IndexedDB persistence, PWA update/offline state, visibility pause, capability/performance policy, and optional diagnostics that never leave the device.

### State model

- Top-level modes: `boot`, `orientationBlocked`, `title`, `avatarSelect`, `hub`, `dialogue`, `encounter`, `paused`, `parentGate`, `parentArea`, and `fatalFallback`.
- Persist only stable domain data: schema version, avatar ID, completed quest steps, current safe checkpoint, collected stickers, music/SFX settings, quality tier, and last played timestamp.
- Never persist React component state, Three.js objects, raw event logs, typed child data, or device identifiers.
- Every quest transition is idempotent; autosave occurs only after a stable transition so reload cannot strand the child in an animation.
- Save reads validate and migrate older schemas. Invalid data is backed up in memory for the session, then the game offers a gated reset rather than crashing.

### Navigation and interaction

- Build the initial world from reusable box/cylinder primitives with shared geometries/materials and instancing for repeated props; this fulfills the requested simple cubic placeholder style without a binary model pipeline.
- Define a small waypoint graph and walkable interaction anchors in data. Tapping terrain or an NPC resolves to the nearest allowed anchor; a lightweight A* route moves the avatar. Do not add a physics engine or general navmesh for this bounded hub.
- Raycast only against a dedicated interaction layer, not every decorative mesh.
- Make hotspots visibly pulse and provide large DOM alternatives when exact 3D tapping would be difficult.
- Lock the camera and clamp destinations to safe paths. Disable interactions during short transitions while always preserving pause/mute.
- Keep a model-provider boundary so future GLB avatars/NPCs can replace cubic components without changing quest logic or content IDs.

### Rendering and performance policy

- WebGL renderer is the compatibility baseline; do not make WebGPU a requirement.
- Orthographic camera, one simple ambient/hemisphere light plus one directional light, no post-processing, no realtime reflections, and blob/baked shadows rather than multiple shadow-casting lights.
- Use `frameloop="demand"`; explicitly invalidate while movement/feedback animation is active and stop rendering static scenes.
- Cap/adapt pixel ratio rather than rendering the Galaxy A05s’s full 1080×2400 buffer at device pixel ratio. Start low-end Android near 0.75–1.0 and raise only when frame timing remains healthy.
- Reuse geometry/materials, instance repeated props, minimize transparency/overdraw, frustum-cull, and dispose replaced GPU resources.
- Initial hard budgets for the vertical slice:
  - Under **10 MB compressed transfer** before the hub is playable, including required fonts and initial audio.
  - Stable **30 FPS** at the chosen quality tier on Galaxy A05s and Galaxy A07 during traversal and encounters; no repeated multi-second stalls.
  - Aim for fewer than **100 draw calls**, fewer than **100k visible triangles**, no texture above 1024² in the cubic slice, and a small bounded active audio set.
  - No uncapped background render loop; pause animation/audio when hidden.
- Add a local-only diagnostics panel behind the parent gate showing FPS bands, renderer draw calls/triangles, active quality tier, build version, cache state, and save schema—never telemetry.

### RTL, accessibility, and preschool interaction

- Set `lang="fa"` and `dir="rtl"` at document root; isolate Arabic source quotations from Persian punctuation correctly.
- Use a locally bundled, license-compatible Persian font subset or a robust system fallback; never rely on a font CDN because the app must work offline.
- Required child actions use consistent icons plus animation, shape, and placement—not color alone. Each icon carries an accessible Persian label.
- Use at least 64×64 CSS-pixel primary child targets with generous separation; 44×44 is only the adult-control floor.
- Support touch, mouse, keyboard, and visible focus. Provide reduced-motion behavior, high-contrast legibility, music and SFX controls, replayable visual demonstrations, and no flashing content.
- Landscape is the supported gameplay layout. The manifest requests landscape, while a CSS orientation screen handles browser tabs and Safari cases where programmatic orientation lock is unavailable.
- Dialogue contains one short idea per card, large type, no timed dismissal, and at most three choices.

### Audio

- The first play tap creates/resumes the audio context; never assume autoplay.
- Separate music and SFX buses with persisted mute/volume settings. Music pauses when the page is hidden.
- Use an original, licensed instrumental loop reviewed for cultural/religious suitability, plus small nonverbal cues for success, retry, movement, and interaction. No spoken narration in this slice.
- Store attribution, composer/license, loop points, and reviewer approval in an audio manifest. Compress audio to fit the 10 MB initial-load budget and include browser-compatible fallbacks only where device testing proves necessary.
- Until commissioned music arrives, use an explicitly marked temporary local placeholder or silence; do not download unverified music or imply it is final.

### PWA, privacy, and security

- Cache the app shell and complete vertical-slice assets after the first successful visit so all gameplay works in airplane mode. Show cache/install progress rather than claiming offline readiness early.
- Use revisioned precaching, an offline fallback, and an update prompt applied only from title/pause so a service-worker update never interrupts play.
- Store assets in Cache Storage and progress in IndexedDB. Attempt persistent storage where supported, but document that browsers—especially non-installed Safari contexts—can evict local data; local-only saves cannot be guaranteed forever.
- Manifest uses standalone display, landscape orientation, theme/background colors, and local icons. Provide iOS home-screen guidance in the parent area.
- No API, authentication, cookies, ads, analytics, remote fonts, social links, camera, microphone, geolocation, notifications, or third-party scripts.
- Parent area contains citations, credits/licenses, local diagnostics, install/offline help, privacy statement, and reset. Enter via a child-resistant press-and-hold/icon-sequence gate; reset requires a second confirmation. External links, if retained, require the gate and an explicit leave-game confirmation.
- Deploy as immutable hashed assets plus non-immutable `index.html`/service-worker over HTTPS with a restrictive same-origin Content Security Policy.

## Implementation Steps

1. **Scaffold and quality gates**
   - Create a strict Vite React TypeScript project, npm scripts, lockfile, lint/format/typecheck/test/build configuration, Playwright configuration, and CI-ready headless commands.
   - Add bundle-size and content-validation scripts early so architecture cannot silently exceed constraints.
2. **Establish design tokens and app shell**
   - Add Persian RTL reset/theme, safe-area support, large touch tokens, landscape blocker, loading/error/title screens, reduced motion, and semantic focus behavior.
   - Implement route/state skeleton without 3D so every screen transition is testable.
3. **Implement domain state machine and persistence**
   - Define avatar, quest, dialogue, encounter, settings, review metadata, and save types.
   - Implement pure transitions, quest prerequisites, safe checkpoints, IndexedDB adapter, schema migration, autosave, resume, and gated reset.
4. **Create content and provenance pipeline**
   - Define typed quest/dialogue/source records and validators.
   - Add the three scenario outlines with draft child summaries and icon semantics; add placeholders for exact citations until permissioned editions and reviewer records are supplied.
   - Enforce that production-reachable content is approved and completely cited. Add parent source-card UI.
5. **Build the lightweight 3D hub**
   - Configure demand-driven canvas, orthographic camera, quality policy, lighting, visibility pause, resize/orientation handling, and a graceful WebGL-unavailable screen.
   - Assemble the neighborhood, two avatars, NPCs, landmarks, props, blob shadows, and progress keepsake from reusable cubic primitives.
6. **Add click-to-act navigation**
   - Implement interaction layers, waypoint graph/A*, destination markers, deterministic movement, NPC facing, idle/walk feedback, and cancellation rules.
   - Ensure DOM action alternatives exist for difficult hotspots and interactions cannot trigger through overlays.
7. **Build dialogue and nonviolent encounter UI**
   - Add RTL child cards, semantic icon choices, animated demonstrations, alternating turns, gentle retry, no-failure completion, and pause/mute controls.
   - Keep domain transitions independent of frame rate and 3D animation completion failures.
8. **Author the three quests and finale**
   - Wire greeting, helping, cleanliness, and combined-finale objectives into the hub.
   - Add unlock feedback, chapter stickers, hub-state changes, replay behavior, and 5–8-minute checkpoints.
   - Replace all draft religious wording/citations only with reviewer-approved records.
9. **Integrate audio**
   - Add user-gesture audio unlock, music/SFX buses, visibility pause, settings, audio manifest, compressed original loop, and nonverbal cues.
   - Verify the game remains fully usable while muted.
10. **Add PWA/offline lifecycle**
    - Configure manifest, icons, Workbox precache, offline fallback, cache-readiness status, safe update prompt, iOS installation guidance, and static-host caching headers documentation/config for the selected host.
11. **Implement parent area and local diagnostics**
    - Add gate, source cards, credits/licenses, privacy statement, install/offline status, local renderer metrics, content/build versions, and confirmed progress reset.
12. **Optimize against real-device budgets**
    - Record traces on A05s first, then A07 and iPhone 13. Tune pixel ratio, animation counts, draw calls, React rerenders, audio decoding, and cache strategy.
    - Split/defer parent-only panels if required to keep first playable transfer under 10 MB.
13. **Validate content and usability**
    - Run scholar/editor/proofreader approval workflow and preschool sessions with guardian consent and no identifying recordings/data in the app.
    - Observe whether children can start, navigate, understand each icon, recover from a wrong choice, and finish without reading; revise and retest.
14. **Release hardening**
    - Verify production source maps policy, CSP, no unexpected network requests, service-worker upgrade/recovery, save migration, asset licensing, attribution, offline reinstall flow, and clean static deployment.
    - Update README with exact setup, verification, architecture, content-review, asset-replacement, and deployment procedures.

## Planned File Structure

The exact names may be adjusted during scaffolding, but responsibilities should remain separated as follows:

- `package.json`, `package-lock.json` — pinned runtime/dev dependencies and scripts.
- `vite.config.ts`, `tsconfig*.json`, `eslint.config.js` — strict build and quality configuration.
- `index.html` — Persian/RTL metadata, viewport, theme, and app mount.
- `public/manifest.webmanifest`, `public/icons/` — install metadata and local PWA icons.
- `public/audio/` — approved compressed music/SFX only; no remote runtime fetches.
- `src/main.tsx`, `src/App.tsx` — bootstrap and top-level route/state composition.
- `src/styles/` — RTL base, design tokens, safe areas, orientation, and accessible motion/contrast rules.
- `src/domain/game/` — game types, reducer/commands, selectors, checkpoints, and progression.
- `src/domain/quests/` — quest/encounter state machine and prerequisite logic.
- `src/content/fa/` — concise Persian child copy and chapter definitions.
- `src/content/sources/` — provenance, rights, review metadata, and source-card records.
- `src/content/validation.ts` — runtime/build content integrity rules.
- `src/world/` — canvas, camera, hub layout, quality policy, lifecycle, and scene composition.
- `src/world/actors/` — swappable cubic avatar/NPC model providers and animation presentation.
- `src/world/navigation/` — waypoint graph, pathfinding, tap resolution, and movement controller.
- `src/world/interactions/` — hotspots, interaction layer, focus marker, and bridge to domain commands.
- `src/ui/child/` — title, avatar selection, dialogue, choices, quest trail, stickers, feedback, pause.
- `src/ui/parent/` — parent gate, citations, credits, privacy, diagnostics, install help, reset.
- `src/services/audio/` — unlock, buses, manifests, visibility lifecycle, and settings.
- `src/services/persistence/` — IndexedDB repository, validation, migration, reset, and test fake.
- `src/services/pwa/` — offline readiness and safe-update integration.
- `src/services/performance/` — frame sampling, quality tier selection, and local diagnostics.
- `src/assets/` — licensed UI/icon/font assets and their attribution metadata.
- `src/**/*.test.ts(x)` — colocated unit/component tests.
- `e2e/` — critical path, offline, persistence, RTL, orientation, parent gate, and update tests.
- `scripts/validate-content.*`, `scripts/check-budgets.*` — release gates for approval/citations and bundle/asset size.
- `README.md` — product scope, setup, scripts, content governance, testing matrix, and deployment.

## Acceptance Criteria

### Functional

- A first-time child can start with one tap, select either avatar, navigate the hub by tapping, finish all three quests and finale, and see completion without using a joystick, reading required text, or encountering a fail state.
- The two avatars have identical access, dialogue, and mechanics.
- All three quests are replayable; chapter progression unlocks in the intended order and survives reload at every stable checkpoint.
- Music/SFX can be independently controlled; muted play remains understandable.
- Portrait orientation presents a clear visual rotate instruction and does not start accidental interactions.
- Parent gate protects citations, credits, diagnostics, reset, and external navigation; reset needs confirmation.

### Content and safety

- Every reachable religious/educational claim has complete source metadata, permission status, and named scholar/editor approval.
- Arabic/Persian text matches the approved source exactly where presented as quotation; no generated or placeholder hadith reaches production.
- Child copy contains no shame, fear-based punishment, violence, sectarian hostility, or quantified claims about spiritual merit.
- Child sessions demonstrate that 3–4 and 5–7 groups understand the icons and required sequence without reading; failures trigger design iteration.

### Privacy/offline

- Browser network inspection shows no runtime third-party request, analytics event, account call, ad request, or remote font.
- After one complete successful cache, all quests, source cards, audio, save/resume, and settings work in airplane mode.
- Fresh, upgrade, corrupt-save, quota-failure, and reset paths fail safely without losing an existing valid save silently.
- Privacy copy accurately states local-only storage and the possibility of browser eviction.

### Performance and compatibility

- Initial compressed transfer before playable hub is below 10 MB.
- Galaxy A05s and Galaxy A07 sustain at least 30 FPS through representative traversal and the busiest encounter at their selected low-end tier; iPhone 13 meets or exceeds that target.
- No unbounded memory increase after 10 quest replays or repeated pause/resume cycles.
- Current Chrome/Samsung Internet on both Samsung devices and current Safari/browser plus installed PWA mode on iPhone 13 pass the critical path.
- WebGL loss/unavailability, tab backgrounding, resize, and service-worker update show recoverable UI rather than a blank canvas.

### Accessibility and UI quality

- Primary child controls are at least 64×64 CSS px, spaced, visibly focused, keyboard operable, and labeled in Persian.
- Meaning never depends only on color, sound, or text; reduced-motion and muted modes preserve completion.
- RTL layout, Persian shaping, mixed Arabic/Persian quotation, safe-area insets, and landscape presentation are visually checked on all target devices.
- Automated accessibility checks have no critical violations, followed by manual touch, focus, contrast, and screen-reader smoke tests.

## Verification

- [ ] Run lint, strict TypeScript typecheck, unit/component tests, production build, and content/budget validation through project scripts.
- [ ] Unit-test every game/quest transition, invalid transition, prerequisite, checkpoint, migration, and corrupt-save fallback.
- [ ] Component-test RTL dialogue, icon labels, no-timer behavior, gentle retry, gate/reset confirmation, orientation, and settings.
- [ ] Playwright-test first run, both avatars, each quest, finale, refresh/resume, full offline replay, update prompt, and WebGL fallback.
- [ ] Audit the production network log for same-origin-only requests and test a cold first load followed by airplane-mode reload.
- [ ] Measure compressed transfer, chunks, audio/font sizes, draw calls, visible triangles, frame pacing, long tasks, and memory trend.
- [ ] Perform real-device acceptance on Galaxy A05s, Galaxy A07, and iPhone 13; emulation alone is insufficient.
- [ ] Complete scholar, child-editor, Persian-proofreader, rights, attribution, and music-review checklists.
- [ ] Conduct supervised usability testing in both age bands and record only non-identifying observations outside the game.

## Explicitly Out of Scope for the Vertical Slice

- Large seamless open world, multiplayer, chat, accounts, cloud saves, leaderboards, ads, purchases, push notifications, camera/microphone/location, or analytics.
- Joystick/free-camera controls, physics-based combat, violence, health/damage, complex inventory, skill trees, or randomized loot.
- Arabic/English UI localization, voice narration, full avatar customization, native app-store packaging, curriculum-wide content, or a browser-based content-management system.
- Production-quality GLB characters and environments; the cubic provider boundary enables those later without rewriting game logic.

## Risks and Mitigations

- **Preschool comprehension without narration:** icons can be culturally ambiguous. Mitigate with one-purpose symbols, animated demonstration, consistent placement, nonverbal cues, no timers, and observed tests; do not claim independent 3-year-old support until proven.
- **Source suitability:** available descriptions suggest some منظومه رشد material addresses parents/educators rather than children directly. Adapt mechanics only through scholar and child-editor review, preserving the distinction between source principle and child-facing scenario.
- **Citation authenticity:** the source site’s current 503 response prevents reliable automated extraction. Require supplied permissioned editions and human-verified page/hadith records; never scrape or guess.
- **Religious reward gamification:** conventional RPG scores may distort the teaching. Reward story completion and neighborhood care, not holiness or divine favor.
- **Low-end GPU and high-resolution display:** A05s combines an Adreno 610 with 1080×2400 output. Use capped adaptive resolution, demand rendering, primitive/instanced art, simple lights, and real-device profiling from the first playable scene.
- **Offline update/cache failure:** service workers can serve stale mixed versions and Safari storage can be evicted. Revision all assets, update only at safe screens, validate save schemas, surface offline readiness, and accurately disclose local-storage limits.
- **Audio availability and licensing:** final original music is an external deliverable. Keep playback optional, enforce manifest/approval metadata, and ship silence rather than unlicensed content if it is late.
- **MIT/content license mismatch:** keep source and asset licensing explicit and separable from code; do not assume website/book/audio content inherits MIT.
- **Landscape lock limitations:** Safari tabs may ignore orientation lock. Rely on responsive CSS blocking/instruction rather than only the Screen Orientation API.

## Inputs Needed Before Production Content Can Ship

- Permissioned book editions or extracts, exact bibliographic details, and the documented adaptation/reproduction terms.
- Named scholar/editor and child-content reviewer identities for metadata and sign-off.
- Approved exact quotations/translations or an explicit decision that a source card contains citation-only summaries.
- Final original instrumental track, SFX rights, composer credits, and cultural/religious approval.
- Access to the three named physical devices—or a designated tester who can supply repeatable traces and acceptance results.
- Final public title, hosting target/domain, and any required legal/privacy wording. These do not block core implementation, but they block release hardening.
