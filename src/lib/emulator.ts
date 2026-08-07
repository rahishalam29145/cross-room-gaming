/**
 * EmulatorJS bootstrap helpers. Browser-only — never import from SSR paths
 * outside a ClientOnly/lazy boundary.
 */
import type { CoreId } from "./retro";

const CDN = "https://cdn.emulatorjs.org/stable/data/";

interface EJSWindow {
  [key: string]: unknown;
  AudioContext?: typeof AudioContext;
  EJS_emulator?: {
    gameManager?: {
      simulateInput?: (player: number, index: number, value: number) => void;
    };
    setVolume?: (v: number) => void;
    muted?: boolean;
    canvas?: HTMLCanvasElement;
  };

}

function ejsWindow(): EJSWindow {
  return window as unknown as EJSWindow;
}

let audioTapStream: MediaStream | null = null;
let audioTapInstalled = false;

/** Every AudioContext the emulator creates, so we can resume them on a gesture. */
const audioContexts = new Set<BaseAudioContext>();

/**
 * Browsers start AudioContexts suspended until the user interacts with the
 * page, which is why the emulator boots silently. Resuming every known context
 * (and doing it again on the first tap/click/key) restores sound.
 */
export function resumeEmulatorAudio(): void {
  for (const ctx of audioContexts) {
    if (ctx.state !== "running") {
      void (ctx as AudioContext).resume?.().catch(() => undefined);
    }
  }
  const emu = ejsWindow().EJS_emulator;
  try {
    emu?.setVolume?.(1);
  } catch {
    /* volume API differs across EmulatorJS builds */
  }
}

function installGestureResume(): void {
  const handler = () => resumeEmulatorAudio();
  for (const evt of ["pointerdown", "touchstart", "keydown", "click"] as const) {
    window.addEventListener(evt, handler, { passive: true });
  }
}

/**
 * Taps every WebAudio node that connects to a context destination so the
 * emulator's sound can be streamed to the remote player.
 */
export function installAudioTap(): void {
  if (audioTapInstalled || typeof window === "undefined") return;
  audioTapInstalled = true;

  const Ctx = window.AudioContext;
  if (!Ctx) return;

  // Track every context the emulator creates so it can be un-suspended later.
  const w = ejsWindow();
  const patch = (Original: typeof AudioContext) =>
    new Proxy(Original, {
      construct(target, args: ConstructorParameters<typeof AudioContext>) {
        const ctx = new target(...args);
        audioContexts.add(ctx);
        void ctx.resume?.().catch(() => undefined);
        return ctx;
      },
    });
  window.AudioContext = patch(Ctx) as typeof AudioContext;
  const webkit = w["webkitAudioContext"] as typeof AudioContext | undefined;
  if (webkit) w["webkitAudioContext"] = patch(webkit);
  installGestureResume();

  const originalConnect = AudioNode.prototype.connect;
  const taps = new WeakMap<BaseAudioContext, MediaStreamAudioDestinationNode>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AudioNode.prototype.connect = function (this: AudioNode, ...args: any[]) {
    const target = args[0];
    try {
      const ctx = this.context;
      audioContexts.add(ctx);
      if (target && target === ctx.destination && "createMediaStreamDestination" in ctx) {
        let tap = taps.get(ctx);
        if (!tap) {
          tap = (ctx as AudioContext).createMediaStreamDestination();
          taps.set(ctx, tap);
          audioTapStream = tap.stream;
        }
        (originalConnect as unknown as (n: AudioNode) => void).call(this, tap);
      }
    } catch {
      /* tapping is best-effort; never break playback */
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return originalConnect.apply(this, args as any);
  } as typeof AudioNode.prototype.connect;
}

export function getTappedAudioTrack(): MediaStreamTrack | null {
  return audioTapStream?.getAudioTracks()[0] ?? null;
}


let loaderPromise: Promise<void> | null = null;

/**
 * Loads (or reloads) the EmulatorJS bootstrap script. A fresh script element is
 * appended on every start so switching cores can re-boot cleanly.
 */
function loadLoaderScript(): Promise<void> {
  loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${CDN}loader.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Emulator core loader could not be downloaded."));
    document.body.appendChild(script);
  });
  return loaderPromise;
}


export interface StartEmulatorOptions {
  container: HTMLDivElement;
  core: CoreId;
  /**
   * The ROM as a File. Passing the File (instead of a blob: URL) is essential:
   * arcade cores derive the romset name from the file name, and a blob URL
   * makes EmulatorJS fall back to "game" → "Romset is unknown".
   */
  rom: File;
  /** Optional BIOS file (PS1 scph*.bin, Neo Geo neogeo.zip, etc.). */
  bios?: File | null;
}

export async function startEmulator({ container, core, rom, bios }: StartEmulatorOptions): Promise<void> {
  const w = ejsWindow();
  installAudioTap();

  const mount = document.createElement("div");
  mount.id = `ejs-${Date.now()}`;
  mount.style.width = "100%";
  mount.style.height = "100%";
  container.innerHTML = "";
  container.appendChild(mount);

  w["EJS_player"] = `#${mount.id}`;
  w["EJS_core"] = core;
  w["EJS_pathtodata"] = CDN;
  w["EJS_gameUrl"] = rom;
  w["EJS_gameName"] = rom.name.replace(/\.[^.]+$/, "");
  w["EJS_gameID"] = rom.name;
  w["EJS_biosUrl"] = bios ?? "";
  w["EJS_startOnLoaded"] = true;
  w["EJS_volume"] = 0.5;
  // Multi-threaded cores only work when the page is cross-origin isolated;
  // enabling them elsewhere hard-fails the core boot.
  w["EJS_threads"] = typeof window !== "undefined" && window.crossOriginIsolated === true;
  w["EJS_defaultOptions"] = { rewindEnabled: "disabled", "save-state-location": "browser" };
  w["EJS_Buttons"] = { cacheManager: false, saveState: true, loadState: true };

  await loadLoaderScript();
}


/**
 * Waits for the emulator canvas to exist and have real pixels. Fails fast when
 * EmulatorJS shows a romset/core error so the caller can try the next core.
 */
export function waitForCanvas(container: HTMLElement, timeoutMs = 300000): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const canvas = container.querySelector("canvas");
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        resolve(canvas);
        return;
      }
      const text = container.textContent ?? "";
      if (/romset is unknown|not a valid|error loading|failed to (start|load)/i.test(text)) {
        reject(new Error(text.trim().slice(0, 160) || "Core could not load this romset."));
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Emulator did not start in time."));
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  });
}


/** Pushes a remote player's button press into the running emulator. */
export function sendInputToEmulator(player: number, buttonIndex: number, value: number): void {
  const w = ejsWindow();
  const gm = w.EJS_emulator?.gameManager;
  if (gm && typeof gm.simulateInput === "function") {
    gm.simulateInput(player, buttonIndex, value);
  }
}
