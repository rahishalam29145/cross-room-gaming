import { createServerFn } from "@tanstack/react-start";
import {
  heartbeatRoomSchema,
  publishRoomSchema,
  removeRoomSchema,
  safeRoomError,
} from "./rooms.shared";

/**
 * Public room-lobby writes. These endpoints are intentionally unauthenticated
 * (the app has no accounts); the per-room host token is the credential and is
 * verified inside the token-guarded database functions, which only the server
 * may execute.
 */
export const publishRoomFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => publishRoomSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("publish_room", {
      p_code: data.code,
      p_game_name: data.gameName,
      p_core: data.core,
      p_token: data.token,
      p_game_id: data.gameId ?? undefined,
    });
    if (error) throw safeRoomError(error);
    return { ok: true as const };
  });

export const heartbeatRoomFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => heartbeatRoomSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("heartbeat_room", {
      p_code: data.code,
      p_token: data.token,
      p_p2_taken: data.p2Taken,
    });
    if (error) throw safeRoomError(error);
    return { ok: true as const };
  });

export const removeRoomFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => removeRoomSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("remove_room", {
      p_code: data.code,
      p_token: data.token,
    });
    if (error) throw safeRoomError(error);
    return { ok: true as const };
  });
