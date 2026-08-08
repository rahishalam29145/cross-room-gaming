// Shared, browser-safe constants for the retro co-op app.
// No browser globals touched at module scope — safe to import from SSR routes.

/**
 * Only cores that actually exist on the EmulatorJS CDN are listed here.
 * EmulatorJS resolves these ids to real `-wasm.data` bundles; anything else
 * (mame2010 / mame2015 / mame2016 / "current mame") 404s with
 * "Error downloading core", which is exactly the bug users hit.
 */
export type CoreId =
  | "nes"
  | "snes"
  | "gba"
  | "gb"
  | "segaMD"
  | "n64"
  | "psx"
  | "psp"
  | "segaMS"
  | "arcade"
  | "mame"
  | "mame2003_plus"
  | "mame2003"
  | "fbalpha2012_cps1"
  | "fbalpha2012_cps2";

/** CoreId → actual core bundle names EmulatorJS will try to download. */
export const CORE_FILES: Record<CoreId, string[]> = {
  nes: ["fceumm"],
  snes: ["snes9x"],
  gba: ["mgba"],
  gb: ["gambatte"],
  segaMD: ["genesis_plus_gx"],
  segaMS: ["smsplus"],
  n64: ["mupen64plus_next"],
  psx: ["pcsx_rearmed"],
  psp: ["ppsspp"],
  arcade: ["fbneo"],
  mame: ["mame2003_plus"],
  mame2003_plus: ["mame2003_plus"],
  mame2003: ["mame2003"],
  fbalpha2012_cps1: ["fbalpha2012_cps1"],
  fbalpha2012_cps2: ["fbalpha2012_cps2"],
};

/** Cores that only ship a multi-threaded build (need cross-origin isolation). */
export const THREAD_ONLY_CORES: CoreId[] = ["psp"];

export const CORE_LABELS: Record<CoreId, string> = {
  mame2003_plus: "Arcade — MAME 2003 Plus (v0.78 / MAME4droid romsets)",
  mame: "Arcade — MAME (auto: 2003 Plus)",
  mame2003: "Arcade — MAME 2003 (v0.78)",
  arcade: "Arcade — FinalBurn Neo (CPS1/2/3, Neo Geo, Dino)",
  fbalpha2012_cps1: "Arcade — CPS1 (FB Alpha 2012)",
  fbalpha2012_cps2: "Arcade — CPS2 (FB Alpha 2012)",
  psx: "PlayStation 1 (Tekken 3, etc.)",
  psp: "PSP — PPSSPP (threads required)",
  nes: "NES / Famicom",
  snes: "SNES",
  gba: "Game Boy Advance",
  gb: "Game Boy / Color",
  segaMD: "Sega Genesis / Mega Drive",
  segaMS: "Sega Master System",
  n64: "Nintendo 64",
};

/** Arcade cores tried in order when a romset needs a fallback. */
export const ARCADE_CORES: CoreId[] = [
  "mame2003_plus",
  "arcade",
  "fbalpha2012_cps2",
  "fbalpha2012_cps1",
  "mame2003",
];


/**
 * Known romset names → the core that runs them best. Keys are matched against
 * the zip file name (without extension), lowercased.
 */
const ROMSET_CORES: Record<string, CoreId[]> = {
  // Namco System 11/12 — 0.78-era MAME/FBNeo is the only browser option.
  tektagt: ["mame2003_plus", "arcade", "mame2003"],
  tekkentt: ["mame2003_plus", "arcade"],
  tekken: ["mame2003_plus", "mame2003", "arcade"],
  tekken2: ["mame2003_plus", "mame2003", "arcade"],
  tekken3: ["mame2003_plus", "arcade"],
  soulclbr: ["mame2003_plus", "arcade"],
  // Capcom CPS
  dino: ["arcade", "fbalpha2012_cps1", "mame2003_plus"],
  captcomm: ["arcade", "fbalpha2012_cps1"],
  punisher: ["arcade", "fbalpha2012_cps1"],
  sf2: ["arcade", "fbalpha2012_cps1"],
  ssf2t: ["arcade", "fbalpha2012_cps2"],
  mvsc: ["arcade", "fbalpha2012_cps2"],
  xmvsf: ["arcade", "fbalpha2012_cps2"],
  avsp: ["arcade", "fbalpha2012_cps2"],
  sfa3: ["arcade", "fbalpha2012_cps2"],
  // Neo Geo
  kof98: ["arcade", "mame2003_plus"],
  kof2002: ["arcade", "mame2003_plus"],
  mslug: ["arcade", "mame2003_plus"],
  mslug3: ["arcade", "mame2003_plus"],
  garou: ["arcade", "mame2003_plus"],
};

const EXT_TO_CORES: Record<string, CoreId[]> = {
  zip: ["mame2003_plus"],
  "7z": ["mame2003_plus"],
  nes: ["nes"],
  fds: ["nes"],
  unf: ["nes"],
  smc: ["snes"],
  sfc: ["snes"],
  fig: ["snes"],
  swc: ["snes"],
  gba: ["gba"],
  gb: ["gb"],
  gbc: ["gb"],
  md: ["segaMD"],
  gen: ["segaMD"],
  smd: ["segaMD"],
  bin: ["psx"],
  sms: ["segaMS"],
  z64: ["n64"],
  n64: ["n64"],
  v64: ["n64"],
  cue: ["psx"],
  pbp: ["psx", "psp"],
  chd: ["psx"],
  // PSP and PS1 both ship .iso — try PS1 first, then PSP.
  iso: ["psx", "psp"],
  cso: ["psp"],
  img: ["psx"],
  mdf: ["psx"],
};


function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").toLowerCase().trim();
}

/** PSP titles are usually named with the game title, so also honour a hint. */
function looksLikePsp(fileName: string): boolean {
  return /psp|ulus|uljm|ules|ucus|ucjs|npjh/i.test(fileName);
}

/**
 * Ordered list of cores to try for a file. Arcade zips are matched against a
 * romset table first, then fall back to the full arcade core rotation.
 */
export function coreCandidates(fileName: string): CoreId[] {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "zip" || ext === "7z") {
    const name = baseName(fileName);
    const known = ROMSET_CORES[name];
    const ordered = known ? [...known] : [];
    for (const c of ARCADE_CORES) if (!ordered.includes(c)) ordered.push(c);
    return ordered;
  }
  const list = EXT_TO_CORES[ext];
  if (!list) return [];
  if (looksLikePsp(fileName) && list.includes("psp")) {
    return ["psp", ...list.filter((c) => c !== "psp")];
  }
  return [...list];
}


export function detectCore(fileName: string): CoreId | null {
  return coreCandidates(fileName)[0] ?? null;
}


export const ACCEPTED_EXTENSIONS = Object.keys(EXT_TO_CORES)
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
  L2: 12,
  R2: 13,
  L3: 14,
  R3: 15,
} as const;

export type ButtonName = keyof typeof BTN;

/**
 * EmulatorJS analog stick input indices (RetroArch analog bindings).
 * Each direction takes an analog value between 0 and 1.
 */
export const AXIS = {
  LSTICK_UP: 16,
  LSTICK_DOWN: 17,
  LSTICK_LEFT: 18,
  LSTICK_RIGHT: 19,
  RSTICK_UP: 20,
  RSTICK_DOWN: 21,
  RSTICK_LEFT: 22,
  RSTICK_RIGHT: 23,
} as const;


/**
 * PlayStation / arcade face-button naming for the same RetroArch indices.
 * Cross = B, Circle = A, Square = Y, Triangle = X, L/R = L1/R1.
 */
export const PS_LABELS: Partial<Record<ButtonName, string>> = {
  B: "✕",
  A: "○",
  Y: "□",
  X: "△",
  L: "L1",
  R: "R1",
  L2: "L2",
  R2: "R2",
  L3: "L3",
  R3: "R3",
};


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
  | { t: "axis"; a: number; v: number }
  | { t: "ping"; ts: number }
  | { t: "pong"; ts: number };


export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];
