import { useCallback, useEffect, useRef, useState } from "react";
import { Move, Plus, RotateCcw, Settings2, Trash2, X } from "lucide-react";
import { BTN, PS_LABELS, type ButtonName } from "@/lib/retro";

export interface PadButton {
  id: string;
  name: ButtonName;
  /** Position of the button centre, in % of the pad area. */
  x: number;
  y: number;
  /** Diameter in px. */
  size: number;
}

const STORAGE_KEY = "coopcast-pad-layout-v2";

/** Classic 4-face-button console layout (NES/SNES/Genesis/GBA). */
const RETRO_LAYOUT: PadButton[] = [
  { id: "up", name: "UP", x: 14, y: 30, size: 54 },
  { id: "down", name: "DOWN", x: 14, y: 74, size: 54 },
  { id: "left", name: "LEFT", x: 5, y: 52, size: 54 },
  { id: "right", name: "RIGHT", x: 23, y: 52, size: 54 },
  { id: "y", name: "Y", x: 78, y: 30, size: 54 },
  { id: "x", name: "X", x: 68, y: 52, size: 54 },
  { id: "b", name: "B", x: 88, y: 52, size: 54 },
  { id: "a", name: "A", x: 78, y: 74, size: 54 },
  { id: "l", name: "L", x: 10, y: 8, size: 46 },
  { id: "r", name: "R", x: 90, y: 8, size: 46 },
  { id: "select", name: "SELECT", x: 42, y: 90, size: 48 },
  { id: "start", name: "START", x: 58, y: 90, size: 48 },
];

/** PlayStation / arcade layout: triangle, square, circle, cross + L1/L2/R1/R2. */
const PS_LAYOUT: PadButton[] = [
  { id: "up", name: "UP", x: 14, y: 34, size: 54 },
  { id: "down", name: "DOWN", x: 14, y: 76, size: 54 },
  { id: "left", name: "LEFT", x: 5, y: 55, size: 54 },
  { id: "right", name: "RIGHT", x: 23, y: 55, size: 54 },
  { id: "tri", name: "X", x: 78, y: 34, size: 54 },
  { id: "sq", name: "Y", x: 68, y: 55, size: 54 },
  { id: "cir", name: "A", x: 88, y: 55, size: 54 },
  { id: "cross", name: "B", x: 78, y: 76, size: 54 },
  { id: "l1", name: "L", x: 9, y: 8, size: 46 },
  { id: "l2", name: "L2", x: 26, y: 8, size: 46 },
  { id: "r1", name: "R", x: 91, y: 8, size: 46 },
  { id: "r2", name: "R2", x: 74, y: 8, size: 46 },
  { id: "select", name: "SELECT", x: 42, y: 92, size: 46 },
  { id: "start", name: "START", x: 58, y: 92, size: 46 },
];

const ALL_BUTTONS = Object.keys(BTN) as ButtonName[];

const GLYPH: Partial<Record<ButtonName, string>> = {
  UP: "▲",
  DOWN: "▼",
  LEFT: "◀",
  RIGHT: "▶",
};

const TONE: Partial<Record<ButtonName, string>> = {
  A: "border-destructive bg-destructive/20 text-destructive",
  B: "border-chart-2 bg-chart-2/20 text-chart-2",
  X: "border-chart-4 bg-chart-4/20 text-chart-4",
  Y: "border-chart-3 bg-chart-3/20 text-chart-3",
};

function loadLayout(fallback: PadButton[]): PadButton[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as PadButton[];
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
    return parsed.filter((b) => b && b.name in BTN);
  } catch {
    return fallback;
  }
}

interface Props {
  onButton: (index: number, pressed: boolean) => void;
  disabled?: boolean;
  /** Show PlayStation/arcade glyphs (△ □ ○ ✕, L1/L2/R1/R2). */
  psStyle?: boolean;
}

export function CustomGamepad({ onButton, disabled, psStyle = true }: Props) {
  const defaults = psStyle ? PS_LAYOUT : RETRO_LAYOUT;
  const [layout, setLayout] = useState<PadButton[]>(defaults);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<string | null>(null);

  useEffect(() => {
    setLayout(loadLayout(psStyle ? PS_LAYOUT : RETRO_LAYOUT));
  }, [psStyle]);

  const label = useCallback(
    (name: ButtonName) => GLYPH[name] ?? (psStyle ? (PS_LABELS[name] ?? name) : name),
    [psStyle],
  );

  const persist = useCallback((next: PadButton[]) => {
    setLayout(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage full or blocked — layout still applies for this session */
    }
  }, []);

  const moveTo = useCallback((id: string, clientX: number, clientY: number) => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(98, Math.max(2, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(97, Math.max(3, ((clientY - rect.top) / rect.height) * 100));
    setLayout((prev) => prev.map((b) => (b.id === id ? { ...b, x, y } : b)));
  }, []);

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
    persist([...layout, { id: `${name}-${Date.now()}`, name, x: 50, y: 50, size: 54 }]);
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
        className={`relative h-[300px] w-full touch-none overflow-hidden rounded-xl border ${
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
              className={`absolute grid select-none place-items-center rounded-full border-2 font-mono text-[12px] font-bold shadow-[0_4px_0_0_rgba(0,0,0,0.45)] transition-[filter,transform] duration-75 ${
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
              {label(btn.name)}
            </button>
          );
        })}
      </div>

      {editing && (
        <div className="mt-3 space-y-3 rounded-xl border border-border bg-card p-4">
          {selectedBtn ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs text-primary">{label(selectedBtn.name)}</span>
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
                {label(name)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => persist(PS_LAYOUT)}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              PlayStation / Arcade layout
            </button>
            <button
              onClick={() => persist(RETRO_LAYOUT)}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Retro (A/B/X/Y) layout
            </button>
            <button
              onClick={() => {
                persist(defaults);
                setSelected(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomGamepad;
