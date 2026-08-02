import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  stack?: string;
}

/**
 * Catches render-time crashes anywhere in the tree and shows the exact
 * error on-screen instead of a blank white page. Users can dismiss the
 * banner to attempt re-rendering.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || String(error),
      stack: import.meta.env.DEV ? error.stack : undefined,
    };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[ErrorBoundary] Render crash:", error, info);
  }

  handleDismiss = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12 text-foreground">
        <div className="w-full max-w-lg rounded-xl border border-red-500/30 bg-red-500/5 p-6 shadow-lg">
          <h2 className="mb-2 text-lg font-semibold text-red-500">
            Something went wrong
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            The application hit an unexpected error. You can try again or
            refresh the page.
          </p>
          <pre className="mb-4 max-h-40 overflow-auto rounded-lg bg-background p-3 text-xs text-red-500/90">
            {this.state.message}
          </pre>
          {this.state.stack && (
            <pre className="mb-4 max-h-40 overflow-auto rounded-lg bg-background p-3 text-[10px] leading-relaxed text-muted-foreground/70">
              {this.state.stack}
            </pre>
          )}
          <div className="flex gap-3">
            <button
              onClick={this.handleDismiss}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition hover:border-teal hover:text-teal"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition hover:border-teal hover:text-teal"
            >
              Refresh page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
