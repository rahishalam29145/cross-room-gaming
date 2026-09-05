/**
 * Single-player mode: downloads a library game (or serves it from the local
 * IndexedDB cache), boots it with the same core-fallback logic the host uses,
 * and drives it with the on-screen pad.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Radio, Volume2 } from "lucide-react";
import { CustomGamepad } from "@/components/CustomGamepad";
import { bumpPlayCountFn, getGameFn, listGamesFn } from "@/lib/games.functions";
import type { LibraryGame } from "@/lib/games.shared";
import { fetchGameFile, isBiosFor } from "@/lib/gameLibrary";
import {
  isCoreAvailable,
  resumeEmulatorAudio,
  sendInputToEmulator,
  startEmulator,
  waitForCanvas,
} from "@/lib/emulator";
import { CORE_LABELS, coreCandidates, type CoreId } from "@/lib/retro";

export default function SoloStation({ gameId }: { gameId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const [game, setGame] = useState<LibraryGame | null>(null);
  const [progress, setProgress] = useState<{ label: string; value: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const boot = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setError(null);
    try {
      setProgress({ label: "Game info aa rahi hai…", value: null });
      const entry = await getGameFn({ data: { id: gameId } });
      if (!entry) throw new Error("Ye game library me nahi mili.");
      setGame(entry);

      const rom = await fetchGameFile(entry, (label, value) => setProgress({ label, value }));

      // Shared BIOS: PS1/Neo Geo sets need one, so pull it from the library too.
      let bios: File | null = null;
      try {
        const biosList = await listGamesFn({ data: { kind: "bios" } });
        const match = biosList.find((b) => isBiosFor(entry.core, b));
        if (match) {
          bios = await fetchGameFile(match, (label, value) =>
            setProgress({ label: `BIOS — ${label}`, value }),
          );
        }
      } catch {
        /* BIOS is optional */
      }

      const wanted: CoreId[] = [
        entry.core as CoreId,
        ...coreCandidates(entry.fileName).filter((c) => c !== entry.core),
      ];
      const candidates: CoreId[] = [];
      for (const c of wanted) if (await isCoreAvailable(c)) candidates.push(c);
      if (candidates.length === 0) throw new Error("Is game ke liye koi emulator core available nahi hai.");

      const failures: string[] = [];
      let ok = false;
      for (const candidate of candidates) {
        setProgress({ label: `Core boot ho raha hai — ${CORE_LABELS[candidate]}…`, value: null });
        try {
          await startEmulator({ container: containerRef.current!, core: candidate, rom, bios });
          await waitForCanvas(containerRef.current!, 45000);
          ok = true;
          break;
        } catch (err) {
          failures.push(`${CORE_LABELS[candidate]}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (!ok) throw new Error(["Game boot nahi ho payi.", ...failures].join("\n"));

      resumeEmulatorAudio();
      setRunning(true);
      setProgress(null);
      void bumpPlayCountFn({ data: { id: gameId } }).catch(() => undefined);
    } catch (e) {
      startedRef.current = false;
      setProgress(null);
      setError(e instanceof Error ? e.message : "Game start nahi ho payi.");
    }
  }, [gameId]);

  useEffect(() => {
    void boot();
  }, [boot]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16">
      <section className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-5">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs tracking-[0.25em] text-primary">SOLO PLAY</p>
          <p className="mt-1 truncate text-lg font-bold text-foreground">
            {game?.title ?? "Game load ho rahi hai…"}
          </p>
        </div>
        <button
          onClick={() => resumeEmulatorAudio()}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-foreground hover:border-primary"
        >
          <Volume2 className="h-3.5 w-3.5" aria-hidden /> Sound ON
        </button>
        <Link
          to="/host"
          search={{ game: gameId }}
          className="inline-flex items-center gap-2 rounded-md bg-chart-2 px-4 py-2 text-xs font-semibold text-background"
        >
          <Radio className="h-3.5 w-3.5" aria-hidden /> Invite Player 2
        </Link>
      </section>

      {progress && (
        <div className="mt-4">
          <p className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {progress.label}
            {progress.value !== null ? ` ${Math.round(progress.value * 100)}%` : ""}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full bg-primary ${progress.value === null ? "w-1/3 animate-pulse" : ""}`}
              style={progress.value !== null ? { width: `${progress.value * 100}%` } : undefined}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-destructive">
            {error}
          </pre>
          <button
            onClick={() => void boot()}
            className="mt-3 rounded-md border border-destructive px-3 py-1.5 text-xs text-destructive"
          >
            Dobara try karein
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        className="mt-4 aspect-video w-full overflow-hidden rounded-2xl bg-black ring-1 ring-primary/25"
      />

      <div className="mt-6">
        <CustomGamepad
          onButton={(index, pressed) => sendInputToEmulator(0, index, pressed ? 1 : 0)}
          onAxis={(index, value) => sendInputToEmulator(0, index, value)}
          disabled={!running}
        />
      </div>
    </div>
  );
}
