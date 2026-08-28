/**
 * Browser-side helpers for the shared cloud game library.
 *
 * Files live in Supabase Storage (private buckets with public read policies)
 * and are mirrored into IndexedDB after the first download, so replaying a
 * game never re-downloads a 1 GB ISO. Browser-only module.
 */
import { registerGameFn } from "./games.functions";
import { fileExt, type LibraryGame } from "./games.shared";
import { CORE_LABELS, detectCore, type CoreId } from "./retro";
import { prettyGameName } from "./covers";
import { listRoms, loadRom, romId, saveRom, type RomKind } from "./romStore";

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] as string;
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] as string;

export const ROM_BUCKET = "game-roms";
export const COVER_BUCKET = "game-covers";

type Progress = (fraction: number) => void;

function storageUrl(bucket: string, path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
}

/** XHR upload so we can show a real progress bar for multi-hundred-MB files. */
function uploadWithProgress(
  bucket: string,
  path: string,
  file: Blob,
  onProgress?: Progress,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", storageUrl(bucket, path));
    xhr.setRequestHeader("apikey", SUPABASE_KEY);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload fail (${xhr.status}) — file bahut badi ho sakti hai.`));
    xhr.onerror = () => reject(new Error("Upload fail — internet check karein."));
    xhr.send(file);
  });
}

function downloadWithProgress(
  bucket: string,
  path: string,
  onProgress?: Progress,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", storageUrl(bucket, path));
    xhr.setRequestHeader("apikey", SUPABASE_KEY);
    xhr.responseType = "blob";
    xhr.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.response as Blob)
        : reject(new Error(`Download fail (${xhr.status}).`));
    xhr.onerror = () => reject(new Error("Download fail — internet check karein."));
    xhr.send();
  });
}

/**
 * Cheap content fingerprint: hashing a full 1 GB ISO in the browser would
 * freeze the tab, so we hash the first megabyte plus name/size — enough to
 * catch the same romset being uploaded twice.
 */
export async function quickHash(file: File): Promise<string> {
  const head = await file.slice(0, 1024 * 1024).arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", head);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 40)}-${file.size}`;
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
}

export function systemLabelFor(core: CoreId | null): string {
  if (!core) return "Retro";
  return CORE_LABELS[core]?.split("—")[0]?.trim() || "Retro";
}

/** Uploads a ROM/BIOS to the shared library and registers it for everyone. */
export async function publishGame(opts: {
  file: File;
  kind?: RomKind;
  title?: string;
  cover?: File | null;
  core?: CoreId | null;
  onProgress?: (label: string, fraction: number | null) => void;
}): Promise<LibraryGame> {
  const { file, kind = "rom", cover = null, onProgress } = opts;
  onProgress?.("File check ho rahi hai…", null);
  const hash = await quickHash(file);
  const core = opts.core ?? detectCore(file.name);
  const stamp = Date.now().toString(36);
  const path = `uploads/${stamp}-${safeName(file.name)}`;

  onProgress?.("Cloud par upload ho rahi hai…", 0);
  await uploadWithProgress(ROM_BUCKET, path, file, (f) =>
    onProgress?.("Cloud par upload ho rahi hai…", f),
  );

  let coverPath: string | null = null;
  if (cover) {
    coverPath = `uploads/${stamp}-${safeName(cover.name)}`;
    try {
      await uploadWithProgress(COVER_BUCKET, coverPath, cover);
    } catch {
      coverPath = null;
    }
  }

  onProgress?.("Library me add ho raha hai…", null);
  const game = await registerGameFn({
    data: {
      title: (opts.title?.trim() || prettyGameName(file.name)).slice(0, 120),
      fileName: file.name,
      storagePath: path,
      sizeBytes: file.size,
      core: core ?? "nes",
      systemLabel: kind === "bios" ? "BIOS" : systemLabelFor(core),
      coverPath,
      kind,
      contentHash: hash,
    },
  });

  // Keep a local copy so the uploader can play instantly.
  try {
    await saveRom(file, undefined, kind);
  } catch {
    /* storage full — cloud copy is enough */
  }
  onProgress?.("Ho gaya!", 1);
  return game;
}

function cacheId(game: LibraryGame): string {
  return `${game.fileName}:${game.sizeBytes}`;
}

export async function isCached(game: LibraryGame): Promise<boolean> {
  const list = await listRoms(game.kind);
  return list.some((m) => m.id === cacheId(game));
}

/** Returns the game as a File, using the IndexedDB cache when possible. */
export async function fetchGameFile(
  game: LibraryGame,
  onProgress?: (label: string, fraction: number | null) => void,
): Promise<File> {
  const list = await listRoms(game.kind);
  const cached = list.find((m) => m.id === cacheId(game));
  if (cached) {
    onProgress?.("Device cache se load ho rahi hai…", 0);
    try {
      return await loadRom(cached, (f) => onProgress?.("Device cache se load ho rahi hai…", f));
    } catch {
      /* corrupt cache — fall through to a fresh download */
    }
  }

  onProgress?.("Cloud se download ho rahi hai…", 0);
  const blob = await downloadWithProgress(ROM_BUCKET, game.storagePath, (f) =>
    onProgress?.("Cloud se download ho rahi hai…", f),
  );
  const file = new File([blob], game.fileName);
  try {
    onProgress?.("Device par save ho rahi hai…", 0);
    const meta = await saveRom(file, (f) => onProgress?.("Device par save ho rahi hai…", f), game.kind);
    return await loadRom(meta);
  } catch {
    return file;
  }
}

/** Cover art: user upload if present, else the built-in fallback art. */
export async function coverObjectUrl(game: LibraryGame): Promise<string | null> {
  if (!game.coverPath) return null;
  try {
    const blob = await downloadWithProgress(COVER_BUCKET, game.coverPath);
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function isBiosFor(core: string, game: LibraryGame): boolean {
  if (game.kind !== "bios") return false;
  const ext = fileExt(game.fileName);
  if (core === "psx") return /scph|ps.?bios|\.bin$/i.test(game.fileName) || ext === "bin";
  return true;
}

export { romId };
