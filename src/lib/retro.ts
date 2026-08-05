// Shared, browser-safe constants for the retro co-op app.
// No browser globals touched at module scope — safe to import from SSR routes.

export type CoreId =
  | "nes"
  | "snes"
  | "gba"
  | "gb"
  | "segaMD"
  | "n64"
  | "psx"
  | "segaMS"
  | "arcade"
  | "mame2003";

export const CORE_LABELS: Record<CoreId, string> = {
  arcade: "Arcade — FinalBurn Neo (Dino, Tekken Tag, CPS1/2/3, Neo Geo)",
  mame2003: "Arcade — MAME 2003 (purani MAME romsets)",
  psx: "PlayStation 1 (Tekken 3, etc.)",
  nes: "NES / Famicom",
  snes: "SNES",
  gba: "Game Boy Advance",
  gb: "Game Boy / Color",
  segaMD: "Sega Genesis / Mega Drive",
  segaMS: "Sega Master System",
  n64: "Nintendo 64",
};

const EXT_TO_CORE: Record<string, CoreId> = {
  zip: "arcade",
  "7z": "arcade",
  nes: "nes",
  fds: "nes",
  unf: "nes",
  smc: "snes",
  sfc: "snes",
  fig: "snes",
  swc: "snes",
  gba: "gba",
  gb: "gb",
  gbc: "gb",
  md: "segaMD",
  gen: "segaMD",
  smd: "segaMD",
  bin: "psx",
  sms: "segaMS",
  z64: "n64",
  n64: "n64",
  v64: "n64",
  cue: "psx",
  pbp: "psx",
  chd: "psx",
  iso: "psx",
  img: "psx",
  mdf: "psx",
};

export function detectCore(fileName: string): CoreId | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_CORE[ext] ?? null;
}

export const ACCEPTED_EXTENSIONS = Object.keys(EXT_TO_CORE)
  .map((e) => `.${e}`)
  .join(",");


/** RetroArch joypad button indices used by EmulatorJS `simulateInput`. */
export const BTN = {
  B: 0,
  Y: 1,
  SELECT: 2,
  START: 3,
  UP: 4,
  DOWN: 5,
  LEFT: 6,
  RIGHT: 7,
  A: 8,
  X: 9,
  L: 10,
  R: 11,
} as const;

export type ButtonName = keyof typeof BTN;

export function makeRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function sanitizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

export type SignalMessage =
  | { type: "guest-hello" }
  | { type: "offer"; sdp: string }
  | { type: "ice"; candidate: RTCIceCandidateInit }
  | { type: "answer"; sdp: string }
  | { type: "host-bye" }
  | { type: "guest-bye" };

export type InputMessage =
  | { t: "btn"; b: number; v: 0 | 1 }
  | { t: "ping"; ts: number }
  | { t: "pong"; ts: number };

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];
