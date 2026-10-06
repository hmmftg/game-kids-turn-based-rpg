import type {
  AgeBand,
  ObserverBookmark,
  ResearchContext,
  ResearchEvent,
  ResearchEventType,
  ResearchSession,
} from '../../domain/research/types.ts';
import { enqueueResearchEvent, pendingResearchCount, readResearchEvents } from './queue.ts';

/**
 * Research Session recorder (PR R+). Inert until a parent passes the consent
 * gate — `record()`/helpers are safe to call anywhere and no-op when disabled.
 *
 * Repeated-action detection is semantic, not coordinate-based: the same
 * resolved target tapped again within a short window counts as a repeat.
 */

const REPEAT_WINDOW_MS = 1500;
const REPEAT_TARGET_TOLERANCE = 0.6; // world units

interface ResearchConfig {
  readonly sessionId: string;
  readonly startedAt: number;
  readonly ageBand: AgeBand;
  readonly mode: 'normal' | 'nocopy';
  readonly reducedMotion: boolean;
}

let config: ResearchConfig | null = null;
let lastTap: { x: number; z: number; target: string; at: number } | null = null;

export function isResearchActive(): boolean {
  return config !== null;
}

export function researchSessionId(): string | null {
  return config?.sessionId ?? null;
}

export function researchSession(): ResearchSession | null {
  if (config === null) return null;
  return {
    sessionId: config.sessionId,
    startedAt: config.startedAt,
    ageBand: config.ageBand,
    mode: config.mode,
    reducedMotion: config.reducedMotion,
  };
}

/**
 * session_started environment — coarse classes only (R.1): build version,
 * touch-vs-desktop, locale, mute state. Never a name, exact age, location,
 * or anything identifying the device.
 */
function environmentContext(input: { muted?: boolean }): ResearchContext {
  return {
    buildVersion: typeof __BUILD_VERSION__ === 'string' ? __BUILD_VERSION__ : 'dev',
    deviceClass:
      typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
        ? 'touch'
        : 'desktop',
    locale: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
    muted: input.muted,
  };
}

export function startResearchSession(input: {
  ageBand: AgeBand;
  mode: 'normal' | 'nocopy';
  reducedMotion: boolean;
  muted?: boolean;
}): ResearchSession {
  config = {
    sessionId:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `session-${Date.now()}`,
    startedAt: Date.now(),
    ...input,
  };
  lastTap = null;
  const session = researchSession();
  record('session_started', environmentContext(input));
  record('started_game');
  return session!;
}

/**
 * Explicit session end (R.1): stamps duration into `session_ended`, then
 * stops recording. Queued events keep their sessionId — analysis groups
 * sessions by the started/ended boundary pair.
 */
export function endResearchSession(): void {
  if (config === null) return;
  record('session_ended', { durationMs: Date.now() - config.startedAt });
  config = null;
  lastTap = null;
}

/** A parent's observer bookmark — a hand-marked moment that matters. */
export function recordBookmark(bookmark: ObserverBookmark, context: ResearchContext = {}): void {
  record('observer_bookmark', { bookmark, ...context });
}

export function record(type: ResearchEventType, context: ResearchContext = {}): void {
  if (config === null) return;
  const event: ResearchEvent = {
    sessionId: config.sessionId,
    timestamp: Date.now(),
    event: type,
    context: {
      ageBand: config.ageBand,
      mode: config.mode,
      reducedMotion: config.reducedMotion,
      ...context,
    },
  };
  // Fire-and-forget: the queue's failure posture already degrades to memory.
  void enqueueResearchEvent(event);
}

/**
 * A world tap, classified. Returns the semantic target (anchor id or 'none')
 * the caller resolved — repeats on the same target/spot inside the window
 * emit `repeated_action`, dead taps emit `tapped_wrong_place`.
 */
export function recordWorldTap(x: number, z: number, resolved: string | null): void {
  if (config === null) return;
  const now = Date.now();
  const target = resolved ?? 'none';
  const previous = lastTap;
  lastTap = { x, z, target, at: now };
  if (
    previous !== null &&
    now - previous.at <= REPEAT_WINDOW_MS &&
    (previous.target === target ||
      Math.hypot(x - previous.x, z - previous.z) <= REPEAT_TARGET_TOLERANCE)
  ) {
    record('repeated_action', { target });
    return;
  }
  if (resolved === null) record('tapped_wrong_place', { target });
}

/** A passive beat auto-advanced — the child waited through it. */
export function recordPassiveBeat(context: ResearchContext): void {
  record('waited', context);
}

/** Test-only: reset the in-memory session (never wired to UI). */
export function __resetResearchForTest(): void {
  config = null;
  lastTap = null;
}

/** Count of queued events for the parent-area indicator. */
export function researchPendingCount(): Promise<number> {
  return pendingResearchCount();
}

/** Download the queued events as a JSON file (offline-session export). */
export async function exportResearchJson(): Promise<number> {
  const events = await readResearchEvents();
  const payload = {
    exportedAt: new Date().toISOString(),
    sessionId: config?.sessionId ?? 'no-active-session',
    events,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `research-${payload.sessionId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  return events.length;
}
