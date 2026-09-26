import { parseSave } from '../../domain/game/save.ts';
import type { PersistedState } from '../../domain/game/types.ts';
import { MemorySaveRepository } from './memoryRepository.ts';
import type { LoadResult, SaveRepository } from './repository.ts';

const DB_NAME = 'mahalle-ye-mehrabani';
const DB_VERSION = 1;
const STORE = 'progress';
const KEY = 'save';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb-request-failed'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE);
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('indexeddb-open-failed'));
    open.onblocked = () => reject(new Error('indexeddb-blocked'));
  });
}

/**
 * Local-only save storage. Stores exactly one small JSON document; never React
 * or Three.js objects, raw event logs, or any device/child identifier.
 */
export class IndexedDbSaveRepository implements SaveRepository {
  private db: Promise<IDBDatabase> | null = null;

  constructor(private readonly clock: () => number = () => Date.now()) {}

  private connect(): Promise<IDBDatabase> {
    // A rejected open is never cached: a transient IndexedDB failure must not
    // disable saving for the rest of the session — the next call retries.
    this.db ??= openDatabase().catch((error: unknown) => {
      this.db = null;
      throw error;
    });
    return this.db;
  }

  async load(): Promise<LoadResult> {
    const db = await this.connect();
    const tx = db.transaction(STORE, 'readonly');
    const raw = await request<unknown>(tx.objectStore(STORE).get(KEY));
    if (raw === undefined || raw === null) return { status: 'empty' };
    const parsed = parseSave(raw, this.clock());
    if (!parsed.ok) return { status: 'corrupt', reason: parsed.reason, raw };
    return { status: parsed.migrated ? 'migrated' : 'loaded', state: parsed.state };
  }

  async save(state: PersistedState): Promise<void> {
    const db = await this.connect();
    const tx = db.transaction(STORE, 'readwrite');
    await request(tx.objectStore(STORE).put(JSON.parse(JSON.stringify(state)) as unknown, KEY));
  }

  async clear(): Promise<void> {
    const db = await this.connect();
    const tx = db.transaction(STORE, 'readwrite');
    await request(tx.objectStore(STORE).delete(KEY));
  }
}

/** Requests durable storage where supported; never fails the boot if refused. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function createSaveRepository(): SaveRepository {
  if (typeof indexedDB === 'undefined') return new MemorySaveRepository();
  return new IndexedDbSaveRepository();
}
