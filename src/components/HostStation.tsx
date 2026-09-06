import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, Gamepad2, Radio, Upload, Users, Volume2, WifiOff } from "lucide-react";
import {
  ACCEPTED_EXTENSIONS,
  CORE_LABELS,
  ICE_SERVERS,
  detectCore,
  coreCandidates,

  makeRoomCode,
  type CoreId,
  type InputMessage,
  type SignalMessage,
} from "@/lib/retro";
import { createIceRelay, createSignalChannel } from "@/lib/signaling";
import { heartbeatRoom, publishRoom, removeRoom } from "@/lib/rooms";
import { coverForGame, prettyGameName } from "@/lib/covers";
import {
  getTappedAudioTrack,
  isCoreAvailable,
  resumeEmulatorAudio,
  sendInputToEmulator,
  startEmulator,
  waitForCanvas,
} from "@/lib/emulator";
import { getGameFn, listGamesFn } from "@/lib/games.functions";
import { fetchGameFile, isBiosFor } from "@/lib/gameLibrary";

import {
  deleteRom,
  formatSize,
  listRoms,
  loadRom,
  saveRom,
  type RomMeta,
} from "@/lib/romStore";

type Phase = "idle" | "booting" | "live";

export default function HostStation({ libraryGameId }: { libraryGameId?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [core, setCore] = useState<CoreId | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [roomCode] = useState(() => makeRoomCode());
  const [error, setError] = useState<string | null>(null);
  const [guestState, setGuestState] = useState<"waiting" | "connecting" | "connected" | "lost">(
    "waiting",
  );
  const [p2Enabled, setP2Enabled] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ label: string; value: number | null } | null>(null);
  const [savedRoms, setSavedRoms] = useState<RomMeta[]>([]);
  const [savedBios, setSavedBios] = useState<RomMeta[]>([]);
  const [biosId, setBiosId] = useState<string>("");

  useEffect(() => {
    void listRoms("rom").then(setSavedRoms);
    void listRoms("bios").then((list) => {
      setSavedBios(list);
      const first = list[0];
      if (first) setBiosId((cur) => cur || first.id);
    });
  }, []);



  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const signalRef = useRef<ReturnType<typeof createSignalChannel> | null>(null);
  const iceRef = useRef<ReturnType<typeof createIceRelay> | null>(null);
  const p2Ref = useRef(true);

  useEffect(() => {
    p2Ref.current = p2Enabled;
  }, [p2Enabled]);

  const pickFile = (f: File | null) => {
    if (!f) return;
    const detected = detectCore(f.name);
    setFile(f);
    setCore(detected);
    setError(
      detected
        ? null
        : "Is file ka console pehchana nahi gaya. Neeche se console manually chuniye.",
    );
  };

  // Library se aayi game (host?game=<id>) apne aap download hokar load ho jaati hai.
  const libraryLoadedRef = useRef(false);
  const [libraryBios, setLibraryBios] = useState<File | null>(null);
  useEffect(() => {
    if (!libraryGameId || libraryLoadedRef.current) return;
    libraryLoadedRef.current = true;
    void (async () => {
      try {
        const entry = await getGameFn({ data: { id: libraryGameId } });
        if (!entry) throw new Error("Ye game library me nahi mili.");
        const rom = await fetchGameFile(entry, (label, value) => setProgress({ label, value }));
        try {
          const biosList = await listGamesFn({ data: { kind: "bios" } });
          const match = biosList.find((b) => isBiosFor(entry.core, b));
          if (match) {
            setLibraryBios(
              await fetchGameFile(match, (label, value) =>
                setProgress({ label: `BIOS — ${label}`, value }),
              ),
            );
          }
        } catch {
          /* BIOS optional */
        }
        setFile(rom);
        setCore((entry.core as CoreId) ?? detectCore(rom.name));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Library game load nahi hui.");
      } finally {
        setProgress(null);
      }
    })();
  }, [libraryGameId]);




  const teardownPeer = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
  }, []);

  const buildPeer = useCallback(() => {
    teardownPeer();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    iceRef.current = createIceRelay(pc, (msg) => signalRef.current?.send(msg));

    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        const sender = pc.addTrack(track, stream);
        if (track.kind !== "video") continue;
        // Favour frame rate over resolution so gameplay stays at 60 FPS.
        try {
          const params = sender.getParameters();
          params.degradationPreference = "maintain-framerate";
          params.encodings = [{ maxBitrate: 6_000_000, maxFramerate: 60, networkPriority: "high" }];
          void sender.setParameters(params);
        } catch {
          /* older browsers ignore encoder hints */
        }
      }
    }


    const channel = pc.createDataChannel("controls", {
      ordered: false,
      maxRetransmits: 0,
    });
    channel.onmessage = (event) => {
      let msg: InputMessage;
      try {
        msg = JSON.parse(event.data as string) as InputMessage;
      } catch {
        return;
      }
      if (msg.t === "btn") {
        if (!p2Ref.current) return;
        sendInputToEmulator(1, msg.b, msg.v);
      } else if (msg.t === "axis") {
        if (!p2Ref.current) return;
        sendInputToEmulator(1, msg.a, msg.v);
      } else if (msg.t === "ping") {
        channel.send(JSON.stringify({ t: "pong", ts: msg.ts } satisfies InputMessage));
      }
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") setGuestState("connected");
      else if (s === "failed" || s === "disconnected" || s === "closed") setGuestState("lost");
    };

    return pc;
  }, [teardownPeer]);

  const handleSignal = useCallback(
    async (msg: SignalMessage) => {
      if (msg.type === "guest-hello") {
        const existing = pcRef.current;
        if (existing && (existing.connectionState === "connected" || existing.signalingState === "have-local-offer")) {
          // Already negotiating or live with this guest — ignore the retry.
          if (existing.connectionState === "connected") return;
        }
        setGuestState("connecting");
        const pc = buildPeer();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signalRef.current?.send({ type: "offer", sdp: offer.sdp ?? "" });
      } else if (msg.type === "answer") {
        const pc = pcRef.current;
        if (!pc || pc.signalingState === "stable") return;
        await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
        await iceRef.current?.flush();
      } else if (msg.type === "ice") {
        await iceRef.current?.addRemote(msg.candidate);
      } else if (msg.type === "guest-bye") {
        setGuestState("waiting");
        teardownPeer();
      }
    },
    [buildPeer, teardownPeer],
  );

  const goLive = async () => {
    if (!file || !core || !containerRef.current) return;
    setPhase("booting");
    setError(null);
    setProgress({ label: "ROM cache ho rahi hai…", value: 0 });
    try {
      // Big romsets are streamed into IndexedDB in slices, so a 200MB+ zip
      // never has to sit in one giant ArrayBuffer while the core boots.
      let rom = file;
      try {
        const meta = await saveRom(file, (f) =>
          setProgress({ label: "ROM cache ho rahi hai…", value: f }),
        );
        rom = await loadRom(meta, (f) =>
          setProgress({ label: "ROM emulator me ja rahi hai…", value: f }),
        );
        setSavedRoms(await listRoms("rom"));
      } catch {
        // Storage full / private mode — fall back to the in-memory File.
        rom = file;
      }

      // Optional BIOS (PS1 / Neo Geo) comes from the same IndexedDB cache.
      let bios: File | null = null;
      const biosMeta = savedBios.find((b) => b.id === biosId);
      if (biosMeta) {
        try {
          bios = await loadRom(biosMeta);
        } catch {
          bios = null;
        }
      }

      // Try the detected core first; if the romset isn't recognised by it,
      // fall through the remaining candidates automatically. Cores whose
      // bundles are missing on the CDN are skipped before boot so we never
      // hit EmulatorJS's "Error downloading core" dead end.
      const wanted = [core, ...coreCandidates(file.name).filter((c) => c !== core)];
      const candidates: CoreId[] = [];
      const skipped: string[] = [];
      for (const c of wanted) {
        if (await isCoreAvailable(c)) candidates.push(c);
        else skipped.push(CORE_LABELS[c]);
      }
      if (candidates.length === 0) {
        throw new Error(
          `Is file ke liye koi core available nahi hai (${skipped.join(", ") || "unknown"}). ` +
            "Kisi doosre console/romset ke saath try karein.",
        );
      }

      let canvas: HTMLCanvasElement | null = null;
      let usedCore: CoreId = candidates[0]!;
      const failures: string[] = [];
      for (const candidate of candidates) {
        setProgress({
          label: `Core boot ho raha hai — ${CORE_LABELS[candidate]}…`,
          value: null,
        });
        try {
          await startEmulator({ container: containerRef.current, core: candidate, rom, bios });

          canvas = await waitForCanvas(containerRef.current, 45000);
          usedCore = candidate;
          break;
        } catch (err) {
          failures.push(
            `${CORE_LABELS[candidate]}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      if (!canvas) {
        throw new Error(
          ["Koi bhi core is ROM ko boot nahi kar paya.", ...failures].join("\n"),
        );
      }
      setCore(usedCore);
      // Browsers suspend the emulator's AudioContext until a gesture — resume it.
      resumeEmulatorAudio();

      // 60 fps capture with a motion content hint keeps the encoder from
      // dropping frames on fast-moving arcade scenes.
      const stream = canvas.captureStream(60);
      for (const track of stream.getVideoTracks()) track.contentHint = "motion";
      // The core often creates its audio graph a moment after the first frame,
      // so poll briefly for the tapped track before giving up on remote sound.
      let audioTrack = getTappedAudioTrack();
      for (let i = 0; i < 20 && !audioTrack; i++) {
        await new Promise((r) => setTimeout(r, 250));
        resumeEmulatorAudio();
        audioTrack = getTappedAudioTrack();
      }
      if (audioTrack) {
        audioTrack.contentHint = "music";
        stream.addTrack(audioTrack);
      }
      streamRef.current = stream;


      signalRef.current = createSignalChannel(roomCode, "host", (msg) => {
        void handleSignal(msg);
      });
      void publishRoom({ code: roomCode, gameName: file.name, core: usedCore });

      setProgress(null);
      setPhase("live");
    } catch (e) {
      setPhase("idle");
      setProgress(null);
      setError(e instanceof Error ? e.message : "Emulator start nahi ho paya.");
    }
  };


  // Keep the room visible in the public lobby while we're live.
  useEffect(() => {
    if (phase !== "live") return;
    const id = setInterval(() => {
      void heartbeatRoom(roomCode, guestState === "connected");
    }, 20000);
    void heartbeatRoom(roomCode, guestState === "connected");
    return () => clearInterval(id);
  }, [phase, roomCode, guestState]);

  useEffect(() => {
    return () => {
      signalRef.current?.send({ type: "host-bye" });
      signalRef.current?.close();
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void removeRoom(roomCode);
    };
  }, [roomCode]);


  const shareLink =
    typeof window !== "undefined" ? `${window.location.origin}/join?code=${roomCode}` : "";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16">
      {phase !== "live" && (
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 className="font-mono text-sm tracking-[0.25em] text-primary">STEP 1 — LOAD ROM</h2>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files?.[0] ?? null);
            }}
            className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
              dragging ? "border-primary bg-primary/10" : "border-border bg-muted/30"
            }`}
          >
            <Upload className="h-7 w-7 text-primary" aria-hidden />
            <span className="text-sm text-foreground">
              {file ? file.name : "ROM file yahan drop karein ya click karein"}
            </span>
            <span className="text-xs text-muted-foreground">
              File aapke browser me hi rehti hai — kahin upload nahi hoti.
            </span>
            <input
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </label>


          {progress && (
            <div className="mt-4">
              <p className="font-mono text-xs text-muted-foreground">
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

          {savedRoms.length > 0 && (
            <div className="mt-5">
              <p className="font-mono text-xs tracking-[0.25em] text-muted-foreground">
                SAVED ROMS (browser me cached)
              </p>
              <ul className="mt-2 grid gap-2">
                {savedRoms.map((meta) => (
                  <li
                    key={meta.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-2.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{meta.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatSize(meta.size)}
                    </span>
                    <button
                      onClick={async () => {
                        setProgress({ label: "Cached ROM load ho rahi hai…", value: 0 });
                        try {
                          const rom = await loadRom(meta, (f) =>
                            setProgress({ label: "Cached ROM load ho rahi hai…", value: f }),
                          );
                          pickFile(rom);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "ROM load nahi hui.");
                        } finally {
                          setProgress(null);
                        }
                      }}
                      className="rounded-md border border-primary px-3 py-1.5 text-xs text-primary"
                    >
                      Use
                    </button>
                    <button
                      aria-label={`Delete ${meta.name}`}
                      onClick={async () => {
                        await deleteRom(meta);
                        setSavedRoms(await listRoms("rom"));
                      }}
                      className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {file && (
            <div className="mt-5 flex items-center gap-4 rounded-lg border border-border bg-muted/20 p-3">
              <img
                src={coverForGame(file.name)}
                alt={`${prettyGameName(file.name)} cover art`}
                className="h-20 w-20 rounded-md object-cover"
                loading="lazy"
              />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-foreground">
                  {prettyGameName(file.name)}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {file.name} · {formatSize(file.size)}
                </p>
              </div>
            </div>
          )}

          {file && (

            <div className="mt-4 flex flex-wrap items-center gap-3">

              <span className="font-mono text-xs text-muted-foreground">CONSOLE</span>
              <select
                value={core ?? ""}
                onChange={(e) => setCore(e.target.value as CoreId)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">Select console…</option>
                {Object.entries(CORE_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                onClick={goLive}
                disabled={!core || phase === "booting"}
                className="ml-auto inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                <Radio className="h-4 w-4" aria-hidden />
                {phase === "booting" ? "Booting…" : "Start room"}
              </button>
            </div>
          )}

          <div className="mt-5 rounded-lg border border-border bg-muted/20 p-4">
            <p className="font-mono text-xs tracking-[0.25em] text-muted-foreground">
              BIOS (PS1 / Neo Geo / CPS3)
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-foreground hover:border-primary hover:text-primary">
                <Upload className="h-3.5 w-3.5" aria-hidden />
                BIOS file upload karein
                <input
                  type="file"
                  accept=".bin,.zip,.rom,.img"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setProgress({ label: "BIOS save ho rahi hai…", value: 0 });
                    try {
                      const meta = await saveRom(
                        f,
                        (v) => setProgress({ label: "BIOS save ho rahi hai…", value: v }),
                        "bios",
                      );
                      setSavedBios(await listRoms("bios"));
                      setBiosId(meta.id);
                    } catch {
                      setError("BIOS save nahi ho payi — storage full ho sakti hai.");
                    } finally {
                      setProgress(null);
                    }
                  }}
                />
              </label>
              {savedBios.length > 0 && (
                <select
                  value={biosId}
                  onChange={(e) => setBiosId(e.target.value)}
                  className="rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground"
                >
                  <option value="">BIOS ke bina chalayein</option>
                  {savedBios.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} · {formatSize(b.size)}
                    </option>
                  ))}
                </select>
              )}
              {savedBios.length > 0 && biosId && (
                <button
                  onClick={async () => {
                    const meta = savedBios.find((b) => b.id === biosId);
                    if (!meta) return;
                    await deleteRom(meta);
                    const rest = await listRoms("bios");
                    setSavedBios(rest);
                    setBiosId(rest[0]?.id ?? "");
                  }}
                  className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground"
                >
                  Delete BIOS
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              PS1 games ke liye <span className="font-mono">scph1001.bin</span> jaisi BIOS chahiye.
              Ek baar upload karne ke baad refresh ke baad bhi yahin rahegi.
            </p>
          </div>

          {file && /\.(zip|7z)$/i.test(file.name) && (
            <p className="mt-3 text-xs text-muted-foreground">
              Arcade tip: ZIP ko unzip mat karein — MAME/FBNeo romset zip hi chahiye (jaise{" "}
              <span className="font-mono">dino.zip</span>,{" "}
              <span className="font-mono">tektagt.zip</span>). Agar game boot na ho to doosra arcade
              core try karein — purani romsets MAME 2003 par chalti hain, nayi FinalBurn Neo par.
            </p>
          )}



          {error && (
            <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <p className="font-mono text-xs tracking-[0.25em] text-destructive">BOOT ERROR</p>
              <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-destructive">
                {error}
              </pre>
              <p className="mt-2 text-xs text-muted-foreground">
                Tip: arcade romsets ke liye MAME 2003 Plus (v0.78) ya FinalBurn Neo set chahiye.
                Doosra console list se chun kar dobara "Start room" dabayein.
              </p>
            </div>
          )}
        </section>
      )}

      {phase === "live" && (
        <section className="mt-6 grid gap-4 rounded-xl border border-primary/40 bg-card p-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="font-mono text-xs tracking-[0.25em] text-muted-foreground">ROOM CODE</p>
            <p className="font-mono text-4xl font-bold tracking-[0.35em] text-primary">
              {roomCode}
            </p>
            <button
              onClick={() => void navigator.clipboard?.writeText(shareLink)}
              className="mt-2 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Copy invite link
            </button>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs ${
                guestState === "connected"
                  ? "border-chart-2 text-chart-2"
                  : guestState === "lost"
                    ? "border-destructive text-destructive"
                    : "border-border text-muted-foreground"
              }`}
            >
              {guestState === "connected" ? (
                <Users className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <WifiOff className="h-3.5 w-3.5" aria-hidden />
              )}
              {guestState === "connected"
                ? "PLAYER 2 CONNECTED"
                : guestState === "connecting"
                  ? "CONNECTING…"
                  : guestState === "lost"
                    ? "PLAYER 2 LOST"
                    : "WAITING FOR PLAYER 2"}
            </span>
            <button
              onClick={() => resumeEmulatorAudio()}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:border-primary"
            >
              <Volume2 className="h-3.5 w-3.5" aria-hidden /> Sound ON karein
            </button>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={p2Enabled}
                onChange={(e) => setP2Enabled(e.target.checked)}
                className="accent-[var(--color-primary)]"
              />
              Player 2 controls enabled
            </label>

          </div>
        </section>
      )}

      <div
        ref={containerRef}
        className={`mt-4 aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-primary/25 ${
          phase === "idle" ? "hidden" : ""
        }`}
      />

      {phase === "live" && (
        <p className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Gamepad2 className="h-4 w-4" aria-hidden /> Player 1: keyboard (arrows, Z/X/A/S,
            Enter/Shift)
          </span>
          <span className="inline-flex items-center gap-2">
            <Volume2 className="h-4 w-4" aria-hidden /> Tab open rakhein — game yahin chal rahi hai.
          </span>
        </p>
      )}
    </div>
  );
}
