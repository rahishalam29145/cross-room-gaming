# Remote Co-op Retro Console (ROM upload + 2-player remote play)

Ek webapp jisme Player 1 apni retro ROM file upload kare, ek room banaye, aur Player 2 (kai KM door, jiske paas game file nahi hai) usi game ko apne browser me dekhe aur khele.

## Kaise kaam karega

```text
Player 1 (Host)                          Player 2 (Guest)
─────────────────                        ─────────────────
ROM upload (browser me hi rehti hai)
   │
Emulator browser me chalta hai
   │
canvas + audio  ──── WebRTC video stream ────►  Live game screen
   ▲
   └──── button presses (WebRTC data) ◄──────  On-screen gamepad

        Room code + connection handshake
              via Lovable Cloud
```

- ROM file server par upload nahi hoti — sirf Host ke browser me load hoti hai. Isse legal risk aur bandwidth dono kam.
- Guest ko game ki copy chahiye hi nahi; woh live video dekhta hai.
- Guest ke button dabate hi input Host ke emulator me Player 2 controller port par jaata hai.
- Latency ~50-150ms typical (same country). Turn-based / co-op games ke liye badhiya, frame-perfect fighting games ke liye thoda laggy ho sakta hai.

## Screens

1. **Home** — "Create Room" ya "Join Room" (room code se).
2. **Host screen** — ROM file drag-drop (NES/SNES/GBA/GB/Genesis), console auto-detect, room code + share link, emulator canvas, Player 1 keyboard/on-screen controls, guest connected indicator, "Player 2 controls enable/disable" toggle.
3. **Guest screen** — room code enter, connect, live game video full-width, niche on-screen D-pad + A/B/X/Y/Start/Select (mobile-friendly, portrait me landscape hint), connection quality indicator.

## Technical approach

- **Emulator:** EmulatorJS (browser WASM cores) Host side, ROM `File` object se load, koi server upload nahi.
- **Streaming:** Host `canvas.captureStream()` + emulator audio track → WebRTC `RTCPeerConnection` → Guest `<video>`.
- **Input:** WebRTC `RTCDataChannel` (unordered, low latency) se `{button, down/up}` events Guest → Host; Host inhe emulator ke Player 2 input port par apply karta hai.
- **Signaling:** Lovable Cloud enable karke `rooms` table (room code, offer/answer/ICE candidates) + Realtime subscription. Rooms auto-expire.
- **NAT traversal:** public STUN servers. Strict/CGNAT networks ke liye TURN chahiye hoga — pehle STUN-only ship karenge; agar aapke network par connect na ho to baad me TURN credentials add kar denge.
- Emulator + WebRTC sab client-side, isliye `ClientOnly` / dynamic import ke peeche rahega (SSR safe).

## Design

Dark arcade-console look: deep charcoal background, CRT-style scanline accent, neon amber/cyan highlights, chunky monospace headings — retro hardware feel, generic SaaS gradient nahi.

## Honest limitations

- Legal: sirf woh ROMs use karein jinke aap malik hain. App koi ROM host nahi karega.
- Host ka browser tab open aur PC on rehna zaroori hai — game wahin chalti hai.
- Host ka upload bandwidth stream quality decide karega (~2-4 Mbps recommended).
- Symmetric NAT par TURN server ke bina connection fail ho sakta hai.

## Build order

1. Lovable Cloud enable + `rooms` signaling table.
2. Home / create / join routes.
3. Host: ROM upload + emulator running with Player 1 controls.
4. WebRTC connection (video out, data channel in).
5. Guest: video player + touch gamepad.
6. Polish: connection states, reconnect, latency indicator, mobile layout.
