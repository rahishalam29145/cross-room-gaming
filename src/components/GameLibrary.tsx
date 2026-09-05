/**
 * Shared cloud library: every ROM anyone uploads shows up here for everyone,
 * with a one-tap Solo play and Create room (2 player) action.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Gamepad2, Loader2, Radio, RefreshCw, Search, Upload } from "lucide-react";
import { listGamesFn } from "@/lib/games.functions";
import type { LibraryGame } from "@/lib/games.shared";
import { coverObjectUrl, publishGame } from "@/lib/gameLibrary";
import { coverForGame, prettyGameName } from "@/lib/covers";
import { formatSize } from "@/lib/romStore";
import { ACCEPTED_EXTENSIONS, CORE_LABELS, type CoreId } from "@/lib/retro";

export default function GameLibrary({ compact = false }: { compact?: boolean }) {
  const [games, setGames] = useState<LibraryGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [system, setSystem] = useState("all");
  const [busy, setBusy] = useState<{ label: string; value: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGames(await listGamesFn({ data: { kind: "rom" } }));
    } catch {
      setError("Library load nahi hui — thodi der baad try karein.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const systems = Array.from(new Set(games.map((g) => g.systemLabel))).sort();
  const visible = games.filter(
    (g) =>
      (system === "all" || g.systemLabel === system) &&
      (query.trim() === "" || g.title.toLowerCase().includes(query.trim().toLowerCase())),
  );

  const upload = async (file: File | null, kind: "rom" | "bios") => {
    if (!file) return;
    setError(null);
    try {
      await publishGame({
        file,
        kind,
        onProgress: (label, value) => setBusy({ label, value }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload fail ho gaya.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-10 rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-sm tracking-[0.25em] text-primary">GAME LIBRARY</h2>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Jo bhi game yahan upload hoti hai wo hamesha ke liye save rehti hai — koi bhi, kahin se bhi
        khel sakta hai.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          <Upload className="h-4 w-4" aria-hidden />
          Game upload karein
          <input
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            className="hidden"
            onChange={(e) => void upload(e.target.files?.[0] ?? null, "rom")}
          />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-4 py-2 text-xs text-foreground hover:border-primary hover:text-primary">
          <Upload className="h-3.5 w-3.5" aria-hidden />
          BIOS upload (PS1 etc.)
          <input
            type="file"
            accept=".bin,.zip,.rom,.img"
            className="hidden"
            onChange={(e) => void upload(e.target.files?.[0] ?? null, "bios")}
          />
        </label>
        <div className="ml-auto flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Game dhoondein…"
            className="w-36 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        {systems.length > 1 && (
          <select
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground"
          >
            <option value="all">Sabhi systems</option>
            {systems.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>

      {busy && (
        <div className="mt-4">
          <p className="font-mono text-xs text-muted-foreground">
            {busy.label}
            {busy.value !== null ? ` ${Math.round(busy.value * 100)}%` : ""}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full bg-primary ${busy.value === null ? "w-1/3 animate-pulse" : ""}`}
              style={busy.value !== null ? { width: `${busy.value * 100}%` } : undefined}
            />
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {loading && games.length === 0 ? (
        <p className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Library load ho rahi hai…
        </p>
      ) : visible.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Abhi library khaali hai — pehli game aap upload kar dijiye.
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(compact ? visible.slice(0, 6) : visible).map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </ul>
      )}
    </section>
  );
}

function GameCard({ game }: { game: LibraryGame }) {
  const [cover, setCover] = useState<string>(() => coverForGame(game.fileName));

  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    void coverObjectUrl(game).then((u) => {
      if (!alive || !u) return;
      url = u;
      setCover(u);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [game]);

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-muted/20">
      <img
        src={cover}
        alt={`${prettyGameName(game.title)} cover art`}
        className="h-32 w-full object-cover"
        loading="lazy"
      />
      <div className="p-4">
        <p className="truncate text-sm font-semibold text-foreground">{game.title}</p>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {CORE_LABELS[game.core as CoreId]?.split("—")[0]?.trim() ?? game.systemLabel} ·{" "}
          {formatSize(game.sizeBytes)} · {game.playCount} plays
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to="/play/$gameId"
            params={{ gameId: game.id }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            <Gamepad2 className="h-3.5 w-3.5" aria-hidden /> Solo khelo
          </Link>
          <Link
            to="/host"
            search={{ game: game.id }}
            className="inline-flex items-center gap-1.5 rounded-md border border-chart-2 px-3 py-2 text-xs font-semibold text-chart-2"
          >
            <Radio className="h-3.5 w-3.5" aria-hidden /> Room banao
          </Link>
        </div>
      </div>
    </li>
  );
}
