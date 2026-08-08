import { useCallback, useEffect, useRef, useState } from "react";
import { Move, Plus, RotateCcw, Settings2, Trash2, X } from "lucide-react";
import { AXIS, BTN, PS_LABELS, type ButtonName } from "@/lib/retro";

export interface PadButton {
  id: string;
  /** "stick" renders an analog thumbstick instead of a round button. */
  kind?: "button" | "stick";
  name: ButtonName;
  /** Position of the button centre, in % of the pad area. */
  x: number;
  y: number;
  /** Diameter in px. */
  size: number;
}

const STORAGE_KEY = "coopcast-pad-layout-v3";

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

/** PlayStation / PSP layout: analog stick, △ □ ○ ✕ and L1/L2/R1/R2. */
const PS_LAYOUT: PadButton[] = [
  { id: "l2", name: "L2", x: 9, y: 8, size: 44 },
  { id: "l1", name: "L", x: 26, y: 8, size: 44 },
  { id: "r1", name: "R", x: 74, y: 8, size: 44 },
  { id: "r2", name: "R2", x: 91, y: 8, size: 44 },
  { id: "up", name: "UP", x: 14, y: 30, size: 48 },
  { id: "left", name: "LEFT", x: 5, y: 50, size: 48 },
  { id: "right", name: "RIGHT", x: 23, y: 50, size: 48 },
  { id: "down", name: "DOWN", x: 14, y: 70, size: 48 },
  { id: "tri", name: "X", x: 82, y: 30, size: 52 },
  { id: "sq", name: "Y", x: 71, y: 50, size: 52 },
  { id: "cir", name: "A", x: 93, y: 50, size: 52 },
  { id: "cross", name: "B", x: 82, y: 70, size: 52 },
  { id: "stick", kind: "stick", name: "UP", x: 42, y: 58, size: 108 },
  { id: "select", name: "SELECT", x: 38, y: 93, size: 44 },
  { id: "start", name: "START", x: 62, y: 93, size: 44 },
];

const ALL_BUTTONS = Object.keys(BTN) as ButtonName[];

const GLYPH: Partial<Record<ButtonName, string>> = {
  UP: "▲",
  DOWN: "▼",
  LEFT: "◀",
  RIGHT: "▶",
};

const TONE: Partial<Record<ButtonName, string>> = {
  A: "border-destructive/70 bg-destructive/25 text-destructive",
  B: "border-chart-2/70 bg-chart-2/25 text-chart-2",
  X: "border-chart-4/70 bg-chart-4/25 text-chart-4",
  Y: "border-chart-3/70 bg-chart-3/25 text-chart-3",
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
  /** Analog stick axis updates (EmulatorJS analog indices, value 0..1). */
  onAxis?: (index: number, value: number) => void;
  disabled?: boolean;
  /** Show PlayStation/arcade glyphs (△ □ ○ ✕, L1/L2/R1/R2). */
  psStyle?: boolean;
}

export function CustomGamepad({ onButton, onAxis, disabled, psStyle = true }: Props) {
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

  const addStick = () => {
    persist([...layout, { id: `stick-${Date.now()}`, kind: "stick", name: "UP", x: 42, y: 58, size: 108 }]);
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
        className={`relative h-[340px] w-full touch-none overflow-hidden rounded-2xl bg-[radial-gradient(120%_100%_at_50%_0%,color-mix(in_oklab,var(--color-primary)_10%,transparent),transparent)] ring-1 backdrop-blur-sm ${
          editing ? "ring-primary/60" : "ring-border/70"
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
          if (btn.kind === "stick") {
            return (
              <AnalogStick
                key={btn.id}
                btn={btn}
                selected={isSelected}
                editing={editing}
                disabled={disabled}
                onAxis={onAxis}
                onStartDrag={() => {
                  setSelected(btn.id);
                  dragRef.current = btn.id;
                }}
              />
            );
          }
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
              className={`absolute grid select-none place-items-center rounded-full border border-white/25 bg-gradient-to-b from-white/25 via-white/5 to-black/25 font-mono text-[13px] font-bold backdrop-blur-md shadow-[0_6px_16px_-6px_rgba(0,0,0,0.8),inset_0_2px_8px_rgba(255,255,255,0.3),inset_0_-3px_8px_rgba(0,0,0,0.45)] transition-[filter,transform] duration-75 ${
                TONE[btn.name] ?? "bg-secondary/60 text-secondary-foreground"
              } ${isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""} ${
                editing ? "cursor-move" : "active:translate-y-[2px] active:scale-95 active:brightness-150"
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
              <span className="font-mono text-xs text-primary">
                {selectedBtn.kind === "stick" ? "ANALOG" : label(selectedBtn.name)}
              </span>
              <label className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
                Size
                <input
                  type="range"
                  min={32}
                  max={160}
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
              Kisi button ya analog stick par tap karke use resize ya remove karein, drag karke jagah badlein.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] tracking-widest text-muted-foreground">ADD</span>
            <button
              onClick={addStick}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 font-mono text-[11px] text-foreground hover:border-primary hover:text-primary"
            >
              <Plus className="h-3 w-3" aria-hidden />
              ANALOG
            </button>
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
              PSP / PlayStation layout
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

interface StickProps {
  btn: PadButton;
  selected: boolean;
  editing: boolean;
  disabled?: boolean | undefined;
  onAxis?: ((index: number, value: number) => void) | undefined;
  onStartDrag: () => void;
}

/** Left analog thumbstick — reports RetroArch analog axes (0..1 per direction). */
function AnalogStick({ btn, selected, editing, disabled, onAxis, onStartDrag }: StickProps) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const last = useRef({ up: 0, down: 0, left: 0, right: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const emit = useCallback(
    (nx: number, ny: number) => {
      if (!onAxis) return;
      const dead = 0.12;
      const q = (v: number) => (Math.abs(v) < dead ? 0 : Math.round(Math.min(1, Math.abs(v)) * 20) / 20);
      const next = {
        left: nx < 0 ? q(nx) : 0,
        right: nx > 0 ? q(nx) : 0,
        up: ny < 0 ? q(ny) : 0,
        down: ny > 0 ? q(ny) : 0,
      };
      if (next.left !== last.current.left) onAxis(AXIS.LSTICK_LEFT, next.left);
      if (next.right !== last.current.right) onAxis(AXIS.LSTICK_RIGHT, next.right);
      if (next.up !== last.current.up) onAxis(AXIS.LSTICK_UP, next.up);
      if (next.down !== last.current.down) onAxis(AXIS.LSTICK_DOWN, next.down);
      last.current = next;
    },
    [onAxis],
  );

  const track = useCallback(
    (clientX: number, clientY: number) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const r = rect.width / 2;
      let dx = (clientX - (rect.left + r)) / r;
      let dy = (clientY - (rect.top + r)) / r;
      const mag = Math.hypot(dx, dy);
      if (mag > 1) {
        dx /= mag;
        dy /= mag;
      }
      setKnob({ x: dx, y: dy });
      emit(dx, dy);
    },
    [emit],
  );

  const release = useCallback(() => {
    active.current = false;
    setKnob({ x: 0, y: 0 });
    emit(0, 0);
  }, [emit]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!active.current) return;
      e.preventDefault();
      track(e.clientX, e.clientY);
    };
    const onUp = () => {
      if (active.current) release();
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [track, release]);

  useEffect(() => {
    if (disabled || editing) release();
  }, [disabled, editing, release]);

  const knobSize = Math.round(btn.size * 0.46);

  return (
    <div
      ref={ref}
      aria-label="Analog stick"
      style={{
        left: `${btn.x}%`,
        top: `${btn.y}%`,
        width: btn.size,
        height: btn.size,
        transform: "translate(-50%, -50%)",
      }}
      className={`absolute select-none rounded-full border-2 border-border bg-secondary/40 shadow-[inset_0_3px_10px_rgba(0,0,0,0.55)] ${
        selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
      } ${editing ? "cursor-move" : ""}`}
      onPointerDown={(e) => {
        e.preventDefault();
        if (editing) {
          onStartDrag();
          return;
        }
        if (disabled) return;
        active.current = true;
        track(e.clientX, e.clientY);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        style={{
          width: knobSize,
          height: knobSize,
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) translate(${knob.x * (btn.size / 2 - knobSize / 2)}px, ${
            knob.y * (btn.size / 2 - knobSize / 2)
          }px)`,
        }}
        className="pointer-events-none absolute rounded-full border-2 border-primary/60 bg-gradient-to-b from-white/25 to-transparent bg-secondary shadow-[0_4px_10px_rgba(0,0,0,0.6)]"
      />
    </div>
  );
}

export default CustomGamepad;
