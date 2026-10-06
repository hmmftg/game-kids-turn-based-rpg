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

/** Upload queued events when an endpoint is configured and we're online. */
export async function flushResearchQueue(sessionId: string): Promise<'skipped' | 'uploaded'> {
  if (endpoint === null || !navigator.onLine) return 'skipped';
  const events = await readResearchEvents();
  if (events.length === 0) return 'skipped';
  // The research endpoint is the sole intentional network call: it exists
  // only when configured at build time and fires only on the parent's flush.
  // eslint-disable-next-line no-restricted-globals
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/research/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, events }),
  });
  if (!response.ok) throw new Error(`research-upload-${response.status}`);
  await clearResearchEvents();
  return 'uploaded';
}
