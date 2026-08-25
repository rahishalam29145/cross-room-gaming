import { supabase } from "@/integrations/supabase/client";
import { heartbeatRoomFn, publishRoomFn, removeRoomFn } from "./rooms.functions";
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

/**
 * Secret host key proving room ownership. Kept only in this browser and sent
 * to the token-guarded RPCs; it is never readable from the public lobby.
 */
function hostToken(code: string): string {
  const key = `room-host-token:${code}`;
  let token = "";
  try {
    token = localStorage.getItem(key) ?? "";
  } catch {
    /* storage unavailable */
  }
  if (!token) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    try {
      localStorage.setItem(key, token);
    } catch {
      /* storage unavailable */
    }
  }
  return token;
}

export async function publishRoom(input: {
  code: string;
  gameName: string;
  core: CoreId;
}): Promise<void> {
  await supabase.rpc("publish_room", {
    p_code: input.code,
    p_game_name: input.gameName,
    p_core: input.core,
    p_token: hostToken(input.code),
  });
}

export async function heartbeatRoom(code: string, p2Taken: boolean): Promise<void> {
  await supabase.rpc("heartbeat_room", {
    p_code: code,
    p_token: hostToken(code),
    p_p2_taken: p2Taken,
  });
}

export async function removeRoom(code: string): Promise<void> {
  await supabase.rpc("remove_room", { p_code: code, p_token: hostToken(code) });
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
