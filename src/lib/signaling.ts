import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { SignalMessage } from "./retro";

/**
 * Room signaling over Lovable Cloud realtime broadcast.
 * Only SDP handshake data travels here — game video/input go peer-to-peer.
 */
export function createSignalChannel(
  roomCode: string,
  role: "host" | "guest",
  onMessage: (msg: SignalMessage) => void,
): { channel: RealtimeChannel; send: (msg: SignalMessage) => void; close: () => void } {
  const channel = supabase.channel(`retro-room-${roomCode}`, {
    config: { broadcast: { self: false, ack: false } },
  });

  channel.on("broadcast", { event: "signal" }, (payload) => {
    const body = payload["payload"] as { from: string; msg: SignalMessage } | undefined;
    if (!body || body.from === role) return;
    onMessage(body.msg);
  });

  channel.subscribe();

  const send = (msg: SignalMessage) => {
    void channel.send({
      type: "broadcast",
      event: "signal",
      payload: { from: role, msg },
    });
  };

  const close = () => {
    void supabase.removeChannel(channel);
  };

  return { channel, send, close };
}

/** Waits until ICE gathering finishes so we can send one complete SDP. */
export function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", done);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", done);
    // Safety net: some networks never report "complete".
    setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", done);
      resolve();
    }, 4000);
  });
}

/**
 * Trickle-ICE plumbing: forwards local candidates as they appear and buffers
 * remote candidates that arrive before the remote description is applied.
 */
export function createIceRelay(
  pc: RTCPeerConnection,
  send: (msg: { type: "ice"; candidate: RTCIceCandidateInit }) => void,
) {
  const pending: RTCIceCandidateInit[] = [];

  pc.onicecandidate = (event) => {
    if (event.candidate) send({ type: "ice", candidate: event.candidate.toJSON() });
  };

  const flush = async () => {
    while (pending.length) {
      const candidate = pending.shift();
      if (candidate) await pc.addIceCandidate(candidate).catch(() => undefined);
    }
  };

  const addRemote = async (candidate: RTCIceCandidateInit) => {
    if (!pc.remoteDescription) {
      pending.push(candidate);
      return;
    }
    await pc.addIceCandidate(candidate).catch(() => undefined);
  };

  return { addRemote, flush };
}
