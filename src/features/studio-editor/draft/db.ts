// Tiny IndexedDB wrapper for drafts (no library).
//   projects: one row per draft (small JSON: clips, overlays, audio settings…)
//   media:    the video files and voice-over recordings, keyed "<projectId>:<mediaId>"

const DB_NAME = "airstreamx-studio";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("media")) db.createObjectStore("media");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? req.error);
    tx.onabort = () => reject(tx.error ?? new Error("Storage transaction aborted"));
  }));
}

export const db = {
  put: <T>(store: "projects", value: T) => run(store, "readwrite", (s) => s.put(value)),
  get: <T>(store: "projects", key: string) => run<T | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>),
  all: <T>(store: "projects") => run<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>),
  del: (store: "projects", key: string) => run(store, "readwrite", (s) => s.delete(key)),
  putMedia: (key: string, value: Blob) => run("media", "readwrite", (s) => s.put(value, key)),
  getMedia: (key: string) => run<Blob | undefined>("media", "readonly", (s) => s.get(key) as IDBRequest<Blob | undefined>),
  delMedia: (key: string) => run("media", "readwrite", (s) => s.delete(key)),
  /** Delete every media row of a project. */
  delMediaOf: (projectId: string) =>
    run("media", "readwrite", (s) => s.delete(IDBKeyRange.bound(`${projectId}:`, `${projectId}:￿`))),
  mediaKeysOf: (projectId: string) =>
    run<IDBValidKey[]>("media", "readonly", (s) => s.getAllKeys(IDBKeyRange.bound(`${projectId}:`, `${projectId}:￿`))),
};

/** Ask the browser not to clear our drafts when space runs low. Best effort. */
export async function askPersistentStorage(): Promise<void> {
  try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
}

export function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === "QuotaExceededError" || err.code === 22);
}
