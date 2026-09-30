---
name: testing-kids-rpg
description: How to run and drive the Persian RTL kids turn-based RPG (mahalle-ye-mehrabani) for UX/e2e testing, including WebGL on headless boxes and CDP helpers.
---

# Testing mahalle-ye-mehrabani (kids turn-based RPG)

- Run: `npm run dev -- --port 5173` (vite). No backend/login needed; saves are IndexedDB.
- WebGL on this box: launch Chrome with `--remote-debugging-port=9222 --user-data-dir=<dir> --enable-unsafe-swiftshader --no-first-run`. Plain Chrome-for-Testing may report `webgl` (v1) context as null while `webgl2` works — always probe webgl2.
- The built-in `browser_console` tool attaches to the environment's own Chrome instance; if you launch your own, drive it via CDP with Playwright (in devDeps): `chromium.connectOverCDP('http://localhost:9222')` — see `/tmp/cdp-eval.cjs` pattern (evaluate JS, reload, emulate `prefers-reduced-motion` via `Emulation.setEmulatedMedia`).
- Window management: `wmctrl -r "محله‌ی مهربانی" -b add,maximized_vert,maximized_horz`; resize with `wmctrl -r <title> -e 0,x,y,w,h`. Portrait resize triggers the app's orientation blocker.
- Flow: profile select → avatar + badge → hub. Tap the yellow-ringed NPC; the avatar walks and dialogue opens on arrival. Encounter phases: intro→demonstrate→playerChoice→worldResponse→reinforce→complete; a wrong icon produces retry copy, not failure.
- Parent gate: press-and-hold button ~3s (use mouse_move then left_mouse_down + wait — left_mouse_down does not take coordinates).
- Historical pitfalls fixed in the UX acceptance pass: Canvas teardown (parent area, orientation blocker) no longer reports as genuine WebGL loss; persisted quest-completion checkpoints no longer replay the celebration on reload or profile switch-back.
- Emoji render as tofu boxes in this Chrome (no emoji font) — distinguish environment font issues from app bugs.

## Devin Secrets Needed

- None.

## State inspection

- Profile/headwear state lives in IndexedDB: db `mahalle-ye-mehrabani`, store `progress`, key `profiles` — readable via `browser_console` for verifying persisted cosmetic choices.

## Emulation

- `prefers-reduced-motion` can be emulated via `chromium.connectOverCDP('http://localhost:29229')` + `Emulation.setEmulatedMedia`. It does NOT survive a reload — apply it to the live document and keep that CDP session attached for the whole scenario.

## Deterministic canvas driving (dev server only)

- In dev builds the app exposes `window.__worldScene`, `window.__worldCamera`, `window.__worldRenderer` (see `WorldCanvas.tsx` `onCreated`). Named scene objects (`avatar`, `npc-*`, `hotspot-quest-*`, landmarks) can be traversed via CDP (`chromium.connectOverCDP`) to verify exactly which NPCs/landmarks are mounted and their world coords — much more reliable than inspecting isometric screenshots.
- To click a specific anchor/figure: project the anchor's `(x, 0, z)` world point through `__worldCamera` (`vector.project(camera)` → NDC → page pixels), then convert page px to the computer tool's 1024x768 space (`sx*1024/innerWidth`, `sy*768/innerHeight`). Clicking the projected ground point of a walkable anchor walks the avatar along the full pathfinding chain — you can jump straight to distant anchors (park/river/school) in one tap.
- World schedule check: each anchor arrival ticks the world clock; the fisher alternates `anchor-river` (even tick) ↔ `anchor-bakery` (odd tick). Verify by reading `npc-fisher`'s world position after each arrival — note his bakery spot coincides with `npc-baker`'s position, so the figures overlap visually.
- Maps/probe (prod preview too): set `window.__WORLD_PROBE = true` before load (`page.addInitScript`) to enable `__worldToScreen(wx, wz)` on `npm run preview`, plus `__worldMapId`, `__worldAt` (avatar's current anchor) and `__worldDiscoveries` — deterministic waits instead of guessing walk durations. See `e2e/cave.spec.ts` `tapWorld`/`probe` helpers.
- Cave flow: the hidden rock is at `anchor-cave-entrance` (-12.2, 3.4, park's far corner). First arrival discovers it (rock opens); second arrival transitions to `map-cave` at `anchor-cave-mouth`. In the cave, `anchor-cave-mouth` is the exit back to the entrance; the cave mouse at `anchor-cave-mouse` offers `quest-cave-crystal`. Portrait viewports can leave the rock outside the tappable canvas — drive landscape.
- Progress seeding: to skip replaying the quest chain, write a profile slot directly in IndexedDB — db `mahalle-ye-mehrabani`, store `progress`, `profiles` index + `profile:<id>` record; set `questsCompleted`, and for map/discovery state the fields `discoveries`, `mapId`, `mapAnchorId`. Valid `avatarId`s: `avatar-aban`, `avatar-arta`, `avatar-nika`, `avatar-diyar`.
- Follow camera: the camera ground target is `__worldCamera.position − (10,10,10)` — compare it to the avatar's world position to verify follow/clamp. At viewports ≥~1500px wide the whole town fits inside the camera footprint and the follow camera never engages — resize the window to a tablet footprint (~990×460) to make follow/clamp observable, and recompute the page→tool click mapping after resizing.
- Taps under the follow camera: far anchors can sit off-viewport; drive the walker hop-by-hop along the path (tap visible ground between the avatar and the target) like `e2e/camera.spec.ts` `tapWorld` — and dismiss `npc-dialogue` after each arrival since it blocks world taps.

## Pitfalls

- Batched blind clicks through pause → switch-player → new-player can desync (a world click can open a dialogue and eat an iteration). Screenshot between steps and verify state before proceeding.
