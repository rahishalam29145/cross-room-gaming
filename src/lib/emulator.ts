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
    canvas?: HTMLCanvasElement;
  };
}

function ejsWindow(): EJSWindow {
  return window as unknown as EJSWindow;
}

let audioTapStream: MediaStream | null = null;
let audioTapInstalled = false;

/**
 * Taps every WebAudio node that connects to a context destination so the
 * emulator's sound can be streamed to the remote player.
 */
export function installAudioTap(): void {
  if (audioTapInstalled || typeof window === "undefined") return;
  audioTapInstalled = true;

  const Ctx = window.AudioContext;
  if (!Ctx) return;

  const originalConnect = AudioNode.prototype.connect;
  const taps = new WeakMap<BaseAudioContext, MediaStreamAudioDestinationNode>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AudioNode.prototype.connect = function (this: AudioNode, ...args: any[]) {
    const target = args[0];
    try {
      const ctx = this.context;
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

function loadLoaderScript(): Promise<void> {
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${CDN}loader.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Emulator core loader could not be downloaded."));
    document.body.appendChild(script);
  });
  return loaderPromise;
}

export interface StartEmulatorOptions {
  container: HTMLDivElement;
  core: CoreId;
  romUrl: string;
  romName: string;
}

export async function startEmulator({
  container,
  core,
  romUrl,
  romName,
}: StartEmulatorOptions): Promise<void> {
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
  w["EJS_gameUrl"] = romUrl;
  w["EJS_gameName"] = romName;
  w["EJS_startOnLoaded"] = true;
  w["EJS_volume"] = 0.5;
  w["EJS_Buttons"] = { cacheManager: false, saveState: true, loadState: true };

  await loadLoaderScript();
}

/** Waits for the emulator canvas to exist and have real pixels. */
export function waitForCanvas(container: HTMLElement, timeoutMs = 60000): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const canvas = container.querySelector("canvas");
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        resolve(canvas);
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
