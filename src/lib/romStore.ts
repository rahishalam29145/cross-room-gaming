/**
 * Chunked ROM storage in IndexedDB.
 *
 * Large arcade romsets (Tekken Tag, CPS3, PS1 images — 100-300MB) blow up when
 * read as a single ArrayBuffer on mobile. We stream the file in slices, store
 * each slice as its own record, and rebuild a Blob only when the emulator
 * needs it. Browser-only module.
 */

const DB_NAME = "coopcast-roms";
const DB_VERSION = 1;
const CHUNKS = "chunks";
const META = "meta";
const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB slices keep peak memory low

export interface RomMeta {
  id: string;
  name: string;
  size: number;
  chunks: number;
  savedAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS);
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
  });
}

function tx<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, run: (t: IDBTransaction) => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const out = run(t);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error ?? new Error("IndexedDB write failed"));
    t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function romId(file: File): string {
  return `${file.name}:${file.size}`;
}

/** Streams a File into IndexedDB slice by slice, reporting 0-1 progress. */
export async function saveRom(file: File, onProgress?: (fraction: number) => void): Promise<RomMeta> {
  const db = await open();
  const id = romId(file);
  const chunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

  await tx(db, [CHUNKS, META], "readwrite", (t) => {
    t.objectStore(META).delete(id);
  });

  for (let i = 0; i < chunks; i++) {
    const slice = file.slice(i * CHUNK_SIZE, Math.min(file.size, (i + 1) * CHUNK_SIZE));
    const buffer = await slice.arrayBuffer();
    await tx(db, [CHUNKS], "readwrite", (t) => {
      t.objectStore(CHUNKS).put(buffer, `${id}#${i}`);
    });
    onProgress?.((i + 1) / chunks);
  }

  const meta: RomMeta = { id, name: file.name, size: file.size, chunks, savedAt: Date.now() };
  await tx(db, [META], "readwrite", (t) => {
    t.objectStore(META).put(meta);
  });
  db.close();
  return meta;
}

function getAll(db: IDBDatabase, store: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction([store], "readonly").objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as unknown[]);
    req.onerror = () => reject(req.error);
  });
}

export async function listRoms(): Promise<RomMeta[]> {
  try {
    const db = await open();
    const rows = (await getAll(db, META)) as RomMeta[];
    db.close();
    return rows.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

function getChunk(db: IDBDatabase, key: string): Promise<ArrayBuffer | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction([CHUNKS], "readonly").objectStore(CHUNKS).get(key);
    req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Rebuilds a stored ROM as a File, keeping the original name (romset detection needs it). */
export async function loadRom(meta: RomMeta, onProgress?: (fraction: number) => void): Promise<File> {
  const db = await open();
  const parts: BlobPart[] = [];
  for (let i = 0; i < meta.chunks; i++) {
    const chunk = await getChunk(db, `${meta.id}#${i}`);
    if (!chunk) {
      db.close();
      throw new Error("Saved ROM adhoori hai — file dobara select karein.");
    }
    parts.push(chunk);
    onProgress?.((i + 1) / meta.chunks);
  }
  db.close();
  return new File(parts, meta.name);
}

export async function deleteRom(meta: RomMeta): Promise<void> {
  const db = await open();
  await tx(db, [CHUNKS, META], "readwrite", (t) => {
    const store = t.objectStore(CHUNKS);
    for (let i = 0; i < meta.chunks; i++) store.delete(`${meta.id}#${i}`);
    t.objectStore(META).delete(meta.id);
  });
  db.close();
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
