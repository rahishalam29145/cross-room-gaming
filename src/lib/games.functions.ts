import { createServerFn } from "@tanstack/react-start";
import {
  ALLOWED_BIOS_EXT,
  ALLOWED_ROM_EXT,
  fileExt,
  gameIdSchema,
  listGamesSchema,
  registerGameSchema,
  safeGameError,
  type LibraryGame,
} from "./games.shared";

interface GameRow {
  id: string;
  title: string;
  file_name: string;
  storage_path: string;
  size_bytes: number;
  core: string;
  system_label: string;
  cover_path: string | null;
  kind: string;
  play_count: number;
  created_at: string;
}

function toGame(row: GameRow): LibraryGame {
  return {
    id: row.id,
    title: row.title,
    fileName: row.file_name,
    storagePath: row.storage_path,
    sizeBytes: Number(row.size_bytes),
    core: row.core,
    systemLabel: row.system_label,
    coverPath: row.cover_path,
    kind: row.kind === "bios" ? "bios" : "rom",
    playCount: row.play_count,
    createdAt: row.created_at,
  };
}

const SELECT_COLS =
  "id,title,file_name,storage_path,size_bytes,core,system_label,cover_path,kind,play_count,created_at";

/**
 * Public library reads/writes. The app has no accounts by design: anyone can
 * upload a ROM into the shared library, so every write is validated here and
 * performed with the service role (the `games` table itself is read-only to
 * the public).
 */
export const listGamesFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => listGamesSchema.parse(data ?? {}))
  .handler(async ({ data }): Promise<LibraryGame[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("games")
      .select(SELECT_COLS)
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.kind !== "all") query = query.eq("kind", data.kind);
    const { data: rows, error } = await query;
    if (error) throw safeGameError(error);
    return (rows as unknown as GameRow[]).map(toGame);
  });

export const getGameFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => gameIdSchema.parse(data))
  .handler(async ({ data }): Promise<LibraryGame | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("games")
      .select(SELECT_COLS)
      .eq("id", data.id)
      .eq("hidden", false)
      .maybeSingle();
    if (error) throw safeGameError(error);
    return row ? toGame(row as unknown as GameRow) : null;
  });

export const registerGameFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => registerGameSchema.parse(data))
  .handler(async ({ data }): Promise<LibraryGame> => {
    const ext = fileExt(data.fileName);
    const allowed: readonly string[] = data.kind === "bios" ? ALLOWED_BIOS_EXT : ALLOWED_ROM_EXT;
    if (!allowed.includes(ext)) throw new Error("Is file type ko library support nahi karti.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Duplicate? Return the existing entry instead of creating a second row.
    const { data: existing } = await supabaseAdmin
      .from("games")
      .select(SELECT_COLS)
      .eq("content_hash", data.contentHash)
      .maybeSingle();
    if (existing) return toGame(existing as unknown as GameRow);

    // The uploaded object must actually exist before it gets listed.
    const dir = data.storagePath.split("/").slice(0, -1).join("/");
    const base = data.storagePath.split("/").pop()!;
    const { data: found, error: listErr } = await supabaseAdmin.storage
      .from("game-roms")
      .list(dir, { search: base, limit: 1 });
    if (listErr) throw safeGameError(listErr);
    if (!found || found.length === 0) throw new Error("Upload complete nahi hua — dobara try karein.");

    const { data: row, error } = await supabaseAdmin
      .from("games")
      .insert({
        title: data.title,
        file_name: data.fileName,
        storage_path: data.storagePath,
        size_bytes: data.sizeBytes,
        core: data.core,
        system_label: data.systemLabel,
        cover_path: data.coverPath ?? null,
        kind: data.kind,
        content_hash: data.contentHash,
      })
      .select(SELECT_COLS)
      .single();
    if (error) throw safeGameError(error);
    return toGame(row as unknown as GameRow);
  });

export const bumpPlayCountFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => gameIdSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("games")
      .select("play_count")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return { ok: true as const };
    await supabaseAdmin
      .from("games")
      .update({ play_count: (row.play_count ?? 0) + 1 })
      .eq("id", data.id);
    return { ok: true as const };
  });

/** Community moderation: three reports hide a file from the public library. */
export const reportGameFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => gameIdSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("games")
      .select("report_count")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return { ok: true as const };
    const next = (row.report_count ?? 0) + 1;
    await supabaseAdmin
      .from("games")
      .update({ report_count: next, hidden: next >= 3 })
      .eq("id", data.id);
    return { ok: true as const, hidden: next >= 3 };
  });
