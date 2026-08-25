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

/**
 * Room writes go through server functions: the token-guarded database
 * functions are executable only by the server, never directly by browsers.
 * Failures are non-fatal for the host flow, so they are logged, not thrown.
 */
export async function publishRoom(input: {
  code: string;
  gameName: string;
  core: CoreId;
}): Promise<void> {
  try {
    await publishRoomFn({
      data: {
        code: input.code,
        gameName: input.gameName,
        core: input.core,
        token: hostToken(input.code),
      },
    });
  } catch (err) {
    console.warn("[rooms] publish failed:", err instanceof Error ? err.message : err);
  }
}

export async function heartbeatRoom(code: string, p2Taken: boolean): Promise<void> {
  try {
    await heartbeatRoomFn({ data: { code, token: hostToken(code), p2Taken } });
  } catch (err) {
    console.warn("[rooms] heartbeat failed:", err instanceof Error ? err.message : err);
  }
}

export async function removeRoom(code: string): Promise<void> {
  try {
    await removeRoomFn({ data: { code, token: hostToken(code) } });
  } catch (err) {
    console.warn("[rooms] remove failed:", err instanceof Error ? err.message : err);
  }
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
