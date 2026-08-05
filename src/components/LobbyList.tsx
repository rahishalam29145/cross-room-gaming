import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Gamepad2, RefreshCw } from "lucide-react";
import { listOpenRooms, type LobbyRoom } from "@/lib/rooms";
import { CORE_LABELS, type CoreId } from "@/lib/retro";

export default function LobbyList() {
  const [rooms, setRooms] = useState<LobbyRoom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const list = await listOpenRooms();
      if (!alive) return;
      setRooms(list);
      setLoading(false);
    };
    void load();
    const id = setInterval(() => void load(), 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <section className="mt-10 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-mono text-sm tracking-[0.25em] text-primary">ABHI LIVE ROOMS</h2>
        {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />}
      </div>

      {rooms.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Abhi koi room live nahi hai — aap pehla room bana sakte hain.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {rooms.map((room) => (
            <li
              key={room.code}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
            >
              <span className="font-mono text-lg font-bold tracking-[0.25em] text-primary">
                {room.code}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{room.game_name}</span>
                <span className="block text-xs text-muted-foreground">
                  {CORE_LABELS[room.core as CoreId] ?? room.core}
                </span>
              </span>
              {room.p2_taken ? (
                <span className="font-mono text-xs text-muted-foreground">FULL</span>
              ) : (
                <Link
                  to="/join"
                  search={{ code: room.code }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-chart-2 px-4 py-2 text-xs font-semibold text-background"
                >
                  <Gamepad2 className="h-3.5 w-3.5" aria-hidden />
                  Join
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
