# Research Session Mode (PR R+)

A controlled research build for the PR R usability protocol — structured
gameplay observations, **not analytics**. Records only semantic game events;
no names, photos, audio, raw touch coordinates, IP addresses, or accounts.

## Enabling

`/?research=1` or `/?mode=research` — both equivalent. The flag alone records
**nothing**: `ResearchGate` renders in place of the game until a parent reads
the consent copy, picks the child's age band (`3-4` / `5-7`), and taps
`research-start`, or exits to the normal build (the flag is stripped and the
page reloads).

## Event vocabulary (`src/domain/research/types.ts`)

Closed set — extend only when a protocol question requires it:

| Event                | Emitted when                                                   |
| -------------------- | -------------------------------------------------------------- |
| `started_game`       | consent passed, session begins                                 |
| `selected_avatar`    | avatar chosen (target = avatar id)                             |
| `tapped_wrong_place` | ground tap resolved to no anchor (target = `none`)             |
| `found_npc`          | a dialogue opens (npcId)                                       |
| `started_quest`      | `START_QUEST` dispatched, or quest dialogue opened (no-WebGL)  |
| `completed_action`   | fresh `questCompleted` checkpoint                              |
| `waited`             | a passive beat auto-advanced (questId + phase)                 |
| `repeated_action`    | same target/spot tapped again within 1.5 s                     |
| `abandoned`          | encounter left mid-quest / battle left before a terminal phase |

Context stamps on every event: `ageBand`, `mode` (`normal`/`nocopy`),
`reducedMotion`, plus event-specific `questId`/`npcId`/`battleId`/`phase`/
`target`. **Coordinates are never stored** — only the semantic target.

## Storage

Same IndexedDB (`mahalle-ye-mehrabani`, `researchEvents` store, DB v2 —
`openDatabase` in `indexedDbRepository.ts` creates it idempotently).
IndexedDB failure degrades to a session-only memory buffer — research never
blocks play.

## Evidence export

Parent area → 🔬 section: pending count, **export JSON** (downloads
`research-<sessionId>.json` — the offline-session path), and **upload** shown
only when `VITE_RESEARCH_API_URL` was set at build time (`POST
<endpoint>/research/events`, queue cleared on success). Upload failures are
swallowed — the queue stays put for a later export/flush.

## What it deliberately does not record

Microphone, camera, screen capture, raw pointer coordinates, device
identifiers, IP, names, accounts. Repeated-action detection compares
**resolved semantic targets**, not coordinates.

## Verification

- `src/services/research/recorder.test.ts` — inert-before-consent, context
  stamping, dead-tap semantics, repeat window.
- `e2e/research.spec.ts` — gate blocks recording, exit strips the flag,
  started session emits `started_game` + `selected_avatar` into IndexedDB.

Feeds `docs/PR-S-DECISION-MEMO.md` evidence rows; observation sheets stay
manual (delight signals can't be inferred from events).
