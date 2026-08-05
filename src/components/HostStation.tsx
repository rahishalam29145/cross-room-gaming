import { useCallback, useEffect, useRef, useState } from "react";
import { Gamepad2, Radio, Upload, Users, Volume2, WifiOff } from "lucide-react";
import {
  ACCEPTED_EXTENSIONS,
  CORE_LABELS,
  ICE_SERVERS,
  detectCore,
  makeRoomCode,
  type CoreId,
  type InputMessage,
  type SignalMessage,
} from "@/lib/retro";
import { createIceRelay, createSignalChannel } from "@/lib/signaling";
import { heartbeatRoom, publishRoom, removeRoom } from "@/lib/rooms";
import {
  getTappedAudioTrack,
  sendInputToEmulator,
  startEmulator,
  waitForCanvas,
} from "@/lib/emulator";

type Phase = "idle" | "booting" | "live";

export default function HostStation() {
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
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
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
        setSavedRoms(await listRoms());
      } catch {
        // Storage full / private mode — fall back to the in-memory File.
        rom = file;
      }

      setProgress({ label: "Core boot ho raha hai…", value: null });
      await startEmulator({ container: containerRef.current, core, rom });
      const canvas = await waitForCanvas(containerRef.current);

      const stream = (canvas as HTMLCanvasElement).captureStream(60);
      const audioTrack = getTappedAudioTrack();
      if (audioTrack) stream.addTrack(audioTrack);
      streamRef.current = stream;

      signalRef.current = createSignalChannel(roomCode, "host", (msg) => {
        void handleSignal(msg);
      });
      void publishRoom({ code: roomCode, gameName: file.name, core });
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

          {file && (core === "arcade" || core === "mame2003") && (
            <p className="mt-3 text-xs text-muted-foreground">
              Arcade tip: ZIP ko unzip mat karein — MAME/FBNeo romset zip hi chahiye (jaise{" "}
              <span className="font-mono">dino.zip</span>,{" "}
              <span className="font-mono">tektagt.zip</span>). Agar game boot na ho to doosra arcade
              core try karein — purani romsets MAME 2003 par chalti hain, nayi FinalBurn Neo par.
              Neo Geo / CPS3 games ke liye BIOS zip bhi usi folder ka hona chahiye.
            </p>
          )}


          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
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
        className={`mt-4 aspect-video w-full overflow-hidden rounded-xl border border-border bg-black ${
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
