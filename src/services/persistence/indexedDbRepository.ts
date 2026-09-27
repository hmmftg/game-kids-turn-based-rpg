import { parseSave } from '../../domain/game/save.ts';
import type { PersistedState } from '../../domain/game/types.ts';
import { MemorySaveRepository } from './memoryRepository.ts';
import {
  LEGACY_SLOT_KEY,
  parseProfileIndex,
  PROFILES_INDEX_KEY,
  type LoadResult,
  type ProfileMeta,
  type SaveRepository,
} from './repository.ts';

const DB_NAME = 'mahalle-ye-mehrabani';
const DB_VERSION = 1;
const STORE = 'progress';

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
 * Local-only save storage. One small JSON document per player profile plus a
 * `profiles` index; never React or Three.js objects, raw event logs, or any
 * device/child identifier.
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

  private async read(key: string): Promise<unknown> {
    const db = await this.connect();
    const tx = db.transaction(STORE, 'readonly');
    return request<unknown>(tx.objectStore(STORE).get(key));
  }

  private async write(key: string, value: unknown): Promise<void> {
    const db = await this.connect();
    const tx = db.transaction(STORE, 'readwrite');
    await request(tx.objectStore(STORE).put(value, key));
  }

  async load(key: string = LEGACY_SLOT_KEY): Promise<LoadResult> {
    const raw = await this.read(key);
    if (raw === undefined || raw === null) return { status: 'empty' };
    const parsed = parseSave(raw, this.clock());
    if (!parsed.ok) return { status: 'corrupt', reason: parsed.reason, raw };
    return { status: parsed.migrated ? 'migrated' : 'loaded', state: parsed.state };
  }

  async save(state: PersistedState, key: string = LEGACY_SLOT_KEY): Promise<void> {
    await this.write(key, JSON.parse(JSON.stringify(state)));
  }

  async clear(key: string = LEGACY_SLOT_KEY): Promise<void> {
    const db = await this.connect();
    const tx = db.transaction(STORE, 'readwrite');
    await request(tx.objectStore(STORE).delete(key));
  }

  async listProfiles(): Promise<ProfileMeta[]> {
    return parseProfileIndex(await this.read(PROFILES_INDEX_KEY));
  }

  async writeProfiles(profiles: readonly ProfileMeta[]): Promise<void> {
    await this.write(PROFILES_INDEX_KEY, JSON.parse(JSON.stringify(profiles)));
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
