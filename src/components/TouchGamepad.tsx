import { BTN, type ButtonName } from "@/lib/retro";

interface GamepadProps {
  onButton: (index: number, pressed: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
}

function padProps(index: number, onButton: GamepadProps["onButton"], disabled?: boolean) {
  const press = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    onButton(index, true);
  };
  const release = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    onButton(index, false);
  };
  return {
    onPointerDown: press,
    onPointerUp: release,
    onPointerCancel: release,
    onPointerLeave: release,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

const faceStyle =
  "select-none touch-none active:scale-95 active:brightness-150 transition-[transform,filter] duration-75";

export function TouchGamepad({ onButton, disabled, compact }: GamepadProps) {
  const dpadBtn = (name: ButtonName, label: string, cls: string) => (
    <button
      key={name}
      aria-label={name}
      className={`${faceStyle} ${cls} grid place-items-center rounded-md border border-border bg-secondary text-secondary-foreground shadow-[0_3px_0_0_var(--color-border)]`}
      {...padProps(BTN[name], onButton, disabled)}
    >
      <span className="text-lg leading-none opacity-80">{label}</span>
    </button>
  );

  const round = (name: ButtonName, tone: string) => (
    <button
      key={name}
      aria-label={name}
      className={`${faceStyle} h-14 w-14 rounded-full border-2 font-mono text-sm font-bold shadow-[0_4px_0_0_rgba(0,0,0,0.5)] ${tone}`}
      {...padProps(BTN[name], onButton, disabled)}
    >
      {name}
    </button>
  );

  return (
    <div className={`w-full ${disabled ? "pointer-events-none opacity-40" : ""}`}>
      <div className="mb-3 flex justify-between gap-3">
        <button
          aria-label="L"
          className={`${faceStyle} h-10 flex-1 rounded-t-xl border border-border bg-muted font-mono text-xs tracking-widest text-muted-foreground`}
          {...padProps(BTN.L, onButton, disabled)}
        >
          L
        </button>
        <button
          aria-label="R"
          className={`${faceStyle} h-10 flex-1 rounded-t-xl border border-border bg-muted font-mono text-xs tracking-widest text-muted-foreground`}
          {...padProps(BTN.R, onButton, disabled)}
        >
          R
        </button>
      </div>

      <div className="flex items-center justify-between gap-4">
        {/* D-pad */}
        <div className={`grid ${compact ? "h-32 w-32" : "h-36 w-36"} grid-cols-3 grid-rows-3 gap-1`}>
          <div />
          {dpadBtn("UP", "▲", "")}
          <div />
          {dpadBtn("LEFT", "◀", "")}
          <div className="grid place-items-center rounded-md bg-muted/40" />
          {dpadBtn("RIGHT", "▶", "")}
          <div />
          {dpadBtn("DOWN", "▼", "")}
          <div />
        </div>

        {/* Face buttons */}
        <div className="grid h-36 w-36 grid-cols-3 grid-rows-3 place-items-center">
          <div />
          {round("X", "border-chart-2 bg-chart-2/15 text-chart-2")}
          <div />
          {round("Y", "border-chart-3 bg-chart-3/15 text-chart-3")}
          <div />
          {round("A", "border-primary bg-primary/15 text-primary")}
          <div />
          {round("B", "border-destructive bg-destructive/15 text-destructive")}
          <div />
        </div>
      </div>

      <div className="mt-4 flex justify-center gap-4">
        <button
          aria-label="SELECT"
          className={`${faceStyle} h-8 rounded-full border border-border bg-muted px-6 font-mono text-[10px] tracking-[0.2em] text-muted-foreground`}
          {...padProps(BTN.SELECT, onButton, disabled)}
        >
          SELECT
        </button>
        <button
          aria-label="START"
          className={`${faceStyle} h-8 rounded-full border border-border bg-muted px-6 font-mono text-[10px] tracking-[0.2em] text-muted-foreground`}
          {...padProps(BTN.START, onButton, disabled)}
        >
          START
        </button>
      </div>
    </div>
  );
}
