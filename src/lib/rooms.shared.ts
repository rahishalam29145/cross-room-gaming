import { z } from "zod";

/** Room codes are 5 chars from the makeRoomCode alphabet; allow some slack. */
export const roomCodeSchema = z
  .string()
  .min(4)
  .max(12)
  .regex(/^[A-Z0-9]+$/i, "invalid room code");

/** Host tokens are 48 hex chars generated in the browser. */
export const hostTokenSchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[a-f0-9]+$/i, "invalid host token");

export const publishRoomSchema = z.object({
  code: roomCodeSchema,
  gameName: z.string().trim().min(1).max(120).default("Retro game"),
  core: z.string().trim().min(1).max(40).default("nes"),
  token: hostTokenSchema,
});

export const heartbeatRoomSchema = z.object({
  code: roomCodeSchema,
  token: hostTokenSchema,
  p2Taken: z.boolean(),
});

export const removeRoomSchema = z.object({
  code: roomCodeSchema,
  token: hostTokenSchema,
});

/** Maps database errors to safe client-facing messages (no internals leak). */
export function safeRoomError(error: { message?: string } | null): Error {
  if (error?.message?.includes("room code already in use")) {
    return new Error("room code already in use");
  }
  console.error("[rooms] request failed:", error?.message);
  return new Error("room request failed");
}
