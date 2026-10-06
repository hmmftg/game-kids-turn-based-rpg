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
only when `VITE_RESEARCH_API_URL` was set at build time. The endpoint is a
PocketBase base URL (e.g. `https://xpvemwbxjn.lexoyacloud.ir`): the flush
posts each queued event as a `research_events` record (`POST
<base>/api/collections/research_events/records`; `/api/batch` rejects
anonymous requests), clearing the local queue only when every record lands —
the unsent tail is re-queued on failure.

PocketBase collection setup (once, superuser dashboard or API): a **base**
collection `research_events` with fields `session_id` (text, required),
`event` (text, required), `context` (json), `timestamp` (number, required);
API rules `create` blank (anonymous write — research rows are the only
anonymous surface), `list`/`view`/`update`/`delete` superuser-only. The
`created`/`updated` autodate fields arrive free. Upload failures keep the
queue for the next flush or an export.

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

## Parent feedback

The same PocketBase endpoint hosts a `parent_feedback` collection (anonymous
create, superuser read; provisioned alongside `research_events`). The parent
area shows a «ارسال بازخورد» textarea whenever the endpoint is configured —
the message posts immediately (`submitParentFeedback`), never queued, and
shows sent/failed status. Consent note: this is parent-authored free text,
not recorded gameplay data — no consent gate applies.
