import type { ResearchEvent } from '../../domain/research/types.ts';
import { openDatabase, RESEARCH_STORE } from '../persistence/indexedDbRepository.ts';

/**
 * Local-first research event queue (PR R+). Same IndexedDB database as the
 * save store, its own `researchEvents` object store — offline by default,
 * exported by the parent as JSON, optionally uploaded when an endpoint is
 * configured via `VITE_RESEARCH_API_URL` at build time.
 *
 * Failure posture mirrors the save layer: when IndexedDB is unavailable the
 * queue degrades to session-only memory — research never blocks play.
 */

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb-request-failed'));
  });
}

const memoryBuffer: ResearchEvent[] = [];
let idbFailed = false;

function memoryOnly(): boolean {
  return typeof indexedDB === 'undefined' || idbFailed;
}

async function connect(): Promise<IDBDatabase | null> {
  if (memoryOnly()) return null;
  try {
    return await openDatabase();
  } catch {
    idbFailed = true;
    return null;
  }
}

/** Append one event. Resolves once durable (or buffered in memory). */
export async function enqueueResearchEvent(event: ResearchEvent): Promise<void> {
  const db = await connect();
  if (db === null) {
    memoryBuffer.push(event);
    return;
  }
  const tx = db.transaction(RESEARCH_STORE, 'readwrite');
  await request(tx.objectStore(RESEARCH_STORE).add(JSON.parse(JSON.stringify(event))));
}

/** All stored events, ordered by insertion (memory buffer merged on top). */
export async function readResearchEvents(): Promise<ResearchEvent[]> {
  const db = await connect();
  if (db === null) return [...memoryBuffer];
  const tx = db.transaction(RESEARCH_STORE, 'readonly');
  const rows = await request<ResearchEvent[]>(tx.objectStore(RESEARCH_STORE).getAll());
  return rows;
}

/** Number of events awaiting export/upload. */
export async function pendingResearchCount(): Promise<number> {
  return (await readResearchEvents()).length;
}

/** Wipe the queue (after a successful upload, or an explicit parent reset). */
export async function clearResearchEvents(): Promise<void> {
  memoryBuffer.length = 0;
  const db = await connect();
  if (db === null) return;
  const tx = db.transaction(RESEARCH_STORE, 'readwrite');
  await request(tx.objectStore(RESEARCH_STORE).clear());
}

const endpoint = (import.meta.env.VITE_RESEARCH_API_URL as string | undefined) ?? null;

/** Whether an upload endpoint was configured at build time. */
export function researchEndpointConfigured(): boolean {
  return endpoint !== null;
}

/**
 * Upload queued events to a PocketBase instance (anonymous-create rules).
 * `/api/batch` is rejected for anonymous requests, so records are posted one
 * at a time in queue order. On the first failure the not-yet-sent tail is
 * re-enqueued — an already-committed row may duplicate on the next flush
 * (deduplicate at analysis time on sessionId+timestamp), never lost.
 */
export async function flushResearchQueue(_sessionId: string): Promise<'skipped' | 'uploaded'> {
  if (endpoint === null || !navigator.onLine) return 'skipped';
  const events = await readResearchEvents();
  if (events.length === 0) return 'skipped';
  const url = `${endpoint.replace(/\/$/, '')}/api/collections/research_events/records`;
  let sent = 0;
  for (const e of events) {
    // The research endpoint is the sole intentional network call: it exists
    // only when configured at build time and fires only on the parent's flush.
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: e.sessionId,
        event: e.event,
        context: e.context,
        timestamp: e.timestamp,
      }),
    });
    if (!response.ok) {
      // Re-queue the unsent tail so nothing is lost on a partial flush.
      await clearResearchEvents();
      for (const rest of events.slice(sent)) await enqueueResearchEvent(rest);
      throw new Error(`research-upload-${response.status}`);
    }
    sent += 1;
  }
  await clearResearchEvents();
  return 'uploaded';
}

/**
 * A parent's typed feedback message — posted straight to the `parent_feedback`
 * collection (anonymous create, superuser read). Not queued: a message that
 * can't send now is shown as failed, never silently stored. The consent
 * contract does not cover it — the parent writes it themselves.
 */
export async function submitParentFeedback(
  message: string,
  context: Record<string, unknown>,
): Promise<void> {
  if (endpoint === null || !navigator.onLine) throw new Error('feedback-offline');
  const trimmed = message.trim();
  if (trimmed.length === 0) throw new Error('feedback-empty');
  // The research endpoint is the sole intentional network call, configured at
  // build time; the parent triggers this send explicitly.
  // eslint-disable-next-line no-restricted-globals
  const response = await fetch(
    `${endpoint.replace(/\/$/, '')}/api/collections/parent_feedback/records`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: trimmed.slice(0, 4000),
        context,
        timestamp: Date.now(),
      }),
    },
  );
  if (!response.ok) throw new Error(`feedback-${response.status}`);
}
