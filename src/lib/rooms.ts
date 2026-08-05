import { supabase } from "@/integrations/supabase/client";
import type { CoreId } from "./retro";

export interface LobbyRoom {
  code: string;
  game_name: string;
  core: string;
  p2_taken: boolean;
  last_seen_at: string;
}

/** Rooms older than this without a heartbeat are treated as dead. */
export const ROOM_STALE_MS = 60_000;

export async function publishRoom(input: {
  code: string;
  gameName: string;
  core: CoreId;
}): Promise<void> {
  await supabase.from("rooms").upsert(
    {
      code: input.code,
      game_name: input.gameName,
      core: input.core,
      p2_taken: false,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "code" },
  );
}

export async function heartbeatRoom(code: string, p2Taken: boolean): Promise<void> {
  await supabase
    .from("rooms")
    .update({ last_seen_at: new Date().toISOString(), p2_taken: p2Taken })
    .eq("code", code);
}

export async function removeRoom(code: string): Promise<void> {
  await supabase.from("rooms").delete().eq("code", code);
}

export async function listOpenRooms(): Promise<LobbyRoom[]> {
  const since = new Date(Date.now() - ROOM_STALE_MS).toISOString();
  const { data } = await supabase
    .from("rooms")
    .select("code, game_name, core, p2_taken, last_seen_at")
    .gte("last_seen_at", since)
    .order("last_seen_at", { ascending: false })
    .limit(50);
  return (data ?? []) as LobbyRoom[];
}
