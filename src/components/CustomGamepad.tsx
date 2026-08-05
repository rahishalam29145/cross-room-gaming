import { useCallback, useEffect, useRef, useState } from "react";
import { Move, Plus, RotateCcw, Settings2, Trash2, X } from "lucide-react";
import { BTN, type ButtonName } from "@/lib/retro";

export interface PadButton {
  id: string;
  name: ButtonName;
  /** Position of the button centre, in % of the pad area. */
  x: number;
  y: number;
  /** Diameter in px. */
  size: number;
}

const STORAGE_KEY = "coopcast-pad-layout-v1";

const DEFAULT_LAYOUT: PadButton[] = [
  { id: "up", name: "UP", x: 14, y: 30, size: 56 },
  { id: "down", name: "DOWN", x: 14, y: 74, size: 56 },
  { id: "left", name: "LEFT", x: 5, y: 52, size: 56 },
  { id: "right", name: "RIGHT", x: 23, y: 52, size: 56 },
  { id: "y", name: "Y", x: 78, y: 30, size: 56 },
  { id: "x", name: "X", x: 68, y: 52, size: 56 },
  { id: "b", name: "B", x: 88, y: 52, size: 56 },
  { id: "a", name: "A", x: 78, y: 74, size: 56 },
  { id: "l", name: "L", x: 10, y: 8, size: 48 },
  { id: "r", name: "R", x: 90, y: 8, size: 48 },
  { id: "select", name: "SELECT", x: 42, y: 88, size: 52 },
  { id: "start", name: "START", x: 58, y: 88, size: 52 },
];

const ALL_BUTTONS = Object.keys(BTN) as ButtonName[];

const GLYPH: Partial<Record<ButtonName, string>> = {
  UP: "▲",
  DOWN: "▼",
  LEFT: "◀",
  RIGHT: "▶",
};

const TONE: Partial<Record<ButtonName, string>> = {
  A: "border-primary bg-primary/20 text-primary",
  B: "border-destructive bg-destructive/20 text-destructive",
  X: "border-chart-2 bg-chart-2/20 text-chart-2",
  Y: "border-chart-3 bg-chart-3/20 text-chart-3",
};

function loadLayout(): PadButton[] {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as PadButton[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_LAYOUT;
    return parsed.filter((b) => b && b.name in BTN);
  } catch {
    return DEFAULT_LAYOUT;
  }
}

interface Props {
  onButton: (index: number, pressed: boolean) => void;
  disabled?: boolean;
}

export function CustomGamepad({ onButton, disabled }: Props) {
  const [layout, setLayout] = useState<PadButton[]>(DEFAULT_LAYOUT);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<string | null>(null);

  useEffect(() => {
    setLayout(loadLayout());
  }, []);

  const persist = useCallback((next: PadButton[]) => {
    setLayout(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage full or blocked — layout still applies for this session */
    }
  }, []);

  const moveTo = useCallback(
    (id: string, clientX: number, clientY: number) => {
      const rect = areaRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.min(98, Math.max(2, ((clientX - rect.left) / rect.width) * 100));
      const y = Math.min(97, Math.max(3, ((clientY - rect.top) / rect.height) * 100));
      setLayout((prev) => prev.map((b) => (b.id === id ? { ...b, x, y } : b)));
    },
    [],
  );

  useEffect(() => {
    if (!editing) return;
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      e.preventDefault();
      moveTo(dragRef.current, e.clientX, e.clientY);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setLayout((prev) => {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prev));
        } catch {
          /* ignore */
        }
        return prev;
      });
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [editing, moveTo]);

  const selectedBtn = layout.find((b) => b.id === selected) ?? null;

  const addButton = (name: ButtonName) => {
    persist([
      ...layout,
      { id: `${name}-${Date.now()}`, name, x: 50, y: 50, size: 56 },
    ]);
  };

  const removeSelected = () => {
    if (!selectedBtn) return;
    persist(layout.filter((b) => b.id !== selectedBtn.id));
    setSelected(null);
  };

  const resizeSelected = (size: number) => {
    if (!selectedBtn) return;
    persist(layout.map((b) => (b.id === selectedBtn.id ? { ...b, size } : b)));
  };

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-[0.25em] text-muted-foreground">
          PLAYER 2 CONTROLS
        </span>
        <button
          onClick={() => {
            setEditing((v) => !v);
            setSelected(null);
          }}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs ${
            editing
              ? "border-primary bg-primary/15 text-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {editing ? <X className="h-3.5 w-3.5" aria-hidden /> : <Settings2 className="h-3.5 w-3.5" aria-hidden />}
          {editing ? "Done" : "Customize"}
        </button>
      </div>

      <div
        ref={areaRef}
        className={`relative h-[290px] w-full touch-none overflow-hidden rounded-xl border ${
          editing ? "border-primary/60 bg-primary/5" : "border-border bg-muted/20"
        } ${!editing && disabled ? "opacity-40" : ""}`}
      >
        {editing && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-widest text-primary/70">
              <Move className="h-3.5 w-3.5" aria-hidden /> DRAG TO MOVE · TAP TO SELECT
            </span>
          </div>
        )}

        {layout.map((btn) => {
          const isSelected = editing && selected === btn.id;
          return (
            <button
              key={btn.id}
              aria-label={btn.name}
              style={{
                left: `${btn.x}%`,
                top: `${btn.y}%`,
                width: btn.size,
                height: btn.size,
                transform: "translate(-50%, -50%)",
              }}
              className={`absolute grid select-none place-items-center rounded-full border-2 font-mono text-[11px] font-bold shadow-[0_4px_0_0_rgba(0,0,0,0.45)] transition-[filter,transform] duration-75 ${
                TONE[btn.name] ?? "border-border bg-secondary text-secondary-foreground"
              } ${isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""} ${
                editing ? "cursor-move" : "active:scale-95 active:brightness-150"
              }`}
              onPointerDown={(e) => {
                e.preventDefault();
                if (editing) {
                  setSelected(btn.id);
                  dragRef.current = btn.id;
                  return;
                }
                if (disabled) return;
                onButton(BTN[btn.name], true);
              }}
              onPointerUp={(e) => {
                if (editing || disabled) return;
                e.preventDefault();
                onButton(BTN[btn.name], false);
              }}
              onPointerCancel={() => {
                if (!editing && !disabled) onButton(BTN[btn.name], false);
              }}
              onPointerLeave={() => {
                if (!editing && !disabled) onButton(BTN[btn.name], false);
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {GLYPH[btn.name] ?? btn.name}
            </button>
          );
        })}
      </div>

      {editing && (
        <div className="mt-3 space-y-3 rounded-xl border border-border bg-card p-4">
          {selectedBtn ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs text-primary">{selectedBtn.name}</span>
              <label className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
                Size
                <input
                  type="range"
                  min={32}
                  max={120}
                  value={selectedBtn.size}
                  onChange={(e) => resizeSelected(Number(e.target.value))}
                  className="flex-1 accent-[var(--color-primary)]"
                />
                <span className="w-10 font-mono">{selectedBtn.size}px</span>
              </label>
              <button
                onClick={removeSelected}
                className="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-1.5 text-xs text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Kisi button par tap karke use resize ya remove karein, drag karke jagah badlein.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] tracking-widest text-muted-foreground">ADD</span>
            {ALL_BUTTONS.map((name) => (
              <button
                key={name}
                onClick={() => addButton(name)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 font-mono text-[11px] text-foreground hover:border-primary hover:text-primary"
              >
                <Plus className="h-3 w-3" aria-hidden />
                {name}
              </button>
            ))}
            <button
              onClick={() => {
                persist(DEFAULT_LAYOUT);
                setSelected(null);
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset layout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
