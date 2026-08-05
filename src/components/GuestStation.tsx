import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plug, Signal } from "lucide-react";
import { ICE_SERVERS, sanitizeCode, type InputMessage, type SignalMessage } from "@/lib/retro";
import { createIceRelay, createSignalChannel } from "@/lib/signaling";
import { TouchGamepad } from "@/components/TouchGamepad";

type Phase = "idle" | "connecting" | "connected" | "failed";

export default function GuestStation({ initialCode = "" }: { initialCode?: string }) {
  const [code, setCode] = useState(sanitizeCode(initialCode));
  const [phase, setPhase] = useState<Phase>("idle");
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const signalRef = useRef<ReturnType<typeof createSignalChannel> | null>(null);
  const iceRef = useRef<ReturnType<typeof createIceRelay> | null>(null);

  const cleanup = useCallback(() => {
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    signalRef.current?.close();
    signalRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const handleSignal = useCallback(async (msg: SignalMessage) => {
    const pc = pcRef.current;
    if (!pc) return;
    if (msg.type === "ice") {
      await iceRef.current?.addRemote(msg.candidate);
      return;
    }
    if (msg.type === "host-bye") {
      setPhase("failed");
      return;
    }
    if (msg.type !== "offer") return;
    await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
    await iceRef.current?.flush();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    signalRef.current?.send({ type: "answer", sdp: answer.sdp ?? "" });
  }, []);

  const connect = (joinCode: string = code) => {
    if (joinCode.length < 4) {
      setError("Poora room code daaliye.");
      return;
    }
    setCode(joinCode);
    setError(null);
    setPhase("connecting");
    cleanup();


    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    iceRef.current = createIceRelay(pc, (m) => signalRef.current?.send(m));

    pc.ontrack = (event) => {
      const video = videoRef.current;
      if (video && event.streams[0]) {
        video.srcObject = event.streams[0];
        void video.play().catch(() => undefined);
      }
    };

    pc.ondatachannel = (event) => {
      const dc = event.channel;
      dcRef.current = dc;
      dc.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as InputMessage;
          if (msg.t === "pong") setLatency(Math.round(performance.now() - msg.ts));
        } catch {
          /* ignore malformed frames */
        }
      };
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") setPhase("connected");
      else if (s === "failed" || s === "closed") {
        setPhase("failed");
        setError("Connection nahi ban paya. Dono players ka network check karein.");
      }
    };

    signalRef.current = createSignalChannel(code, "guest", (msg) => {
      void handleSignal(msg);
    });
    // Retry until the host's room is live and answers with an offer.
    let attempts = 0;
    const hello = setInterval(() => {
      attempts += 1;
      if (pcRef.current !== pc || pc.connectionState === "connected" || attempts > 20) {
        clearInterval(hello);
        return;
      }
      if (!pc.remoteDescription) signalRef.current?.send({ type: "guest-hello" });
    }, 3000);
    setTimeout(() => signalRef.current?.send({ type: "guest-hello" }), 800);
  };

  useEffect(() => {
    if (phase !== "connected") return;
    const id = setInterval(() => {
      const dc = dcRef.current;
      if (dc?.readyState === "open") {
        dc.send(JSON.stringify({ t: "ping", ts: performance.now() } satisfies InputMessage));
      }
    }, 3000);
    return () => clearInterval(id);
  }, [phase]);

  const sendButton = useCallback((index: number, pressed: boolean) => {
    const dc = dcRef.current;
    if (dc?.readyState !== "open") return;
    dc.send(JSON.stringify({ t: "btn", b: index, v: pressed ? 1 : 0 } satisfies InputMessage));
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16">
      {phase !== "connected" && (
        <section className="mt-6 rounded-xl border border-border bg-card p-6">
          <h2 className="font-mono text-sm tracking-[0.25em] text-chart-2">ENTER ROOM CODE</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <input
              value={code}
              onChange={(e) => setCode(sanitizeCode(e.target.value))}
              placeholder="ABC12"
              inputMode="text"
              autoCapitalize="characters"
              className="flex-1 rounded-md border border-border bg-background px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-foreground placeholder:text-muted-foreground"
            />
            <button
              onClick={connect}
              disabled={phase === "connecting"}
              className="inline-flex items-center gap-2 rounded-md bg-chart-2 px-6 py-3 text-sm font-semibold text-background disabled:opacity-40"
            >
              {phase === "connecting" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plug className="h-4 w-4" aria-hidden />
              )}
              {phase === "connecting" ? "Connecting…" : "Join game"}
            </button>
          </div>
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
          <p className="mt-4 text-xs text-muted-foreground">
            Player 1 ka room live hona chahiye. Aapko koi game file ki zaroorat nahi hai.
          </p>
        </section>
      )}

      <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
        <video
          ref={videoRef}
          playsInline
          autoPlay
          className="h-full w-full object-contain"
        />
        {phase !== "connected" && (
          <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            Player 1 ki screen yahan aayegi
          </div>
        )}
      </div>

      {phase === "connected" && (
        <p className="mt-3 flex items-center justify-center gap-2 font-mono text-xs text-chart-2">
          <Signal className="h-3.5 w-3.5" aria-hidden />
          LIVE {latency !== null ? `· ${latency} ms` : ""}
        </p>
      )}

      <div className="mt-6">
        <TouchGamepad onButton={sendButton} disabled={phase !== "connected"} />
      </div>
    </div>
  );
}
