import { flushResearchQueue, researchEndpointConfigured } from './queue.ts';

/**
 * Automatic research-queue flush (W6). While a research session is active the
 * queue uploads on an interval, again when connectivity comes back, and once
 * more when the session ends — the parent's upload button stays as a manual
 * "upload now". The endpoint still only exists when configured at build time.
 *
 * Guards:
 * - `?autoflush=0` opts a page out (used by e2e specs that assert queued rows).
 * - `import.meta.env.MODE === 'test'` disables it in unit tests — jsdom has no
 *   real network path and tests must never POST.
 * - One flush in flight at a time; a failure just leaves the queue for later.
 */

const AUTO_FLUSH_INTERVAL_MS = 60_000;

function autoFlushDisabledByUrl(): boolean {
  if (typeof window === 'undefined') return true;
  return new URLSearchParams(window.location.search).get('autoflush') === '0';
}

export function autoFlushEnabled(): boolean {
  return (
    researchEndpointConfigured() && import.meta.env.MODE !== 'test' && !autoFlushDisabledByUrl()
  );
}

let activeSessionId: string | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let onlineListener: (() => void) | null = null;
let inFlight: Promise<unknown> | null = null;

async function tick(sessionId: string): Promise<void> {
  if (inFlight !== null) return;
  inFlight = flushResearchQueue(sessionId)
    // Offline or a server error: events stay queued, a later tick retries.
    .catch(() => 'skipped' as const)
    .finally(() => {
      inFlight = null;
    });
  await inFlight;
}

export function startAutoFlush(sessionId: string): void {
  stopAutoFlush();
  if (!autoFlushEnabled()) return;
  activeSessionId = sessionId;
  intervalId = setInterval(() => void tick(sessionId), AUTO_FLUSH_INTERVAL_MS);
  onlineListener = () => void tick(sessionId);
  window.addEventListener('online', onlineListener);
}

/**
 * Final flush for a closing session. Awaits any queue writes already issued
 * (e.g. the `session_ended` stamp itself) so the last event is included.
 */
export function flushAutoFlushOnce(pendingWrites: Promise<unknown>): void {
  const sessionId = activeSessionId;
  stopAutoFlush();
  if (sessionId === null || !autoFlushEnabled()) return;
  void pendingWrites.then(() => tick(sessionId));
}

export function stopAutoFlush(): void {
  if (intervalId !== null) clearInterval(intervalId);
  intervalId = null;
  if (onlineListener !== null && typeof window !== 'undefined') {
    window.removeEventListener('online', onlineListener);
  }
  onlineListener = null;
  activeSessionId = null;
}
