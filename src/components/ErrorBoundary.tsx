import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
  info: string | null;
}

/**
 * Catches render/runtime crashes inside the emulator surfaces so the app shows
 * readable debug info instead of a blank screen.
 */
export default class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[CoOpCast] crash:", error, info.componentStack);
    this.setState({ info: info.componentStack ?? null });
  }

  override render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto mt-6 w-full max-w-5xl px-4">
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-5">
          <p className="font-mono text-xs tracking-[0.25em] text-destructive">
            {this.props.label ?? "SOMETHING BROKE"}
          </p>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-destructive">
            {error.message}
          </pre>
          {info && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Technical details
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                {info}
              </pre>
            </details>
          )}
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => this.setState({ error: null, info: null })}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Dobara try karein
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
