import { z } from "zod";

/** Hard cap enforced both by the storage bucket and the register endpoint. */
export const MAX_GAME_BYTES = 1024 * 1024 * 1024; // 1 GB

export const ALLOWED_ROM_EXT = [
  "zip",
  "7z",
  "nes",
  "fds",
  "unf",
  "smc",
  "sfc",
  "fig",
  "swc",
  "gba",
  "gb",
  "gbc",
  "md",
  "gen",
  "smd",
  "sms",
  "n64",
  "z64",
  "v64",
  "iso",
  "cso",
  "cue",
  "bin",
  "img",
  "mdf",
  "pbp",
  "chd",
] as const;

export const ALLOWED_BIOS_EXT = ["bin", "zip", "rom", "img", "bios"] as const;

export function fileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export const registerGameSchema = z.object({
  title: z.string().trim().min(1).max(120),
  fileName: z.string().trim().min(1).max(200),
  storagePath: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .regex(/^uploads\/[A-Za-z0-9._\-/]+$/, "invalid storage path"),
  sizeBytes: z.number().int().positive().max(MAX_GAME_BYTES),
  core: z.string().trim().min(1).max(40),
  systemLabel: z.string().trim().min(1).max(60),
  coverPath: z
    .string()
    .trim()
    .max(300)
    .regex(/^uploads\/[A-Za-z0-9._\-/]+$/, "invalid cover path")
    .nullish(),
  kind: z.enum(["rom", "bios"]),
  contentHash: z.string().trim().min(8).max(128),
});

export type RegisterGameInput = z.infer<typeof registerGameSchema>;

export const listGamesSchema = z.object({
  kind: z.enum(["rom", "bios", "all"]).default("all"),
});

export const gameIdSchema = z.object({ id: z.string().uuid() });

export interface LibraryGame {
  id: string;
  title: string;
  fileName: string;
  storagePath: string;
  sizeBytes: number;
  core: string;
  systemLabel: string;
  coverPath: string | null;
  kind: "rom" | "bios";
  playCount: number;
  createdAt: string;
}

/** Maps database/storage errors to safe client-facing messages. */
export function safeGameError(error: { message?: string } | null): Error {
  console.error("[games] request failed:", error?.message);
  return new Error("Library request failed");
}
