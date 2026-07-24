/**
 * Error reporting indirection. The app calls reportError(); the Sentry SDK
 * (lazy-loaded in monitoring.ts, only when VITE_SENTRY_DSN is set) registers
 * itself as the reporter. This keeps @sentry/react out of the main bundle
 * and lets call sites report unconditionally — with no DSN it's a no-op.
 *
 * Every error also lands in an in-memory ring buffer that the bug-report sheet
 * attaches to a submission. That's the half Sentry can't cover: a user filing
 * "the grid went blank" gets the actual stack trace shipped with their words,
 * and it works with no DSN configured at all (local dev, any DSN-less deploy).
 * In-memory on purpose — the buffer dies with the tab, so a crash-then-reload
 * loses it, and nothing here is ever persisted to storage.
 */

type Reporter = (error: unknown, context?: Record<string, unknown>) => void;

let reporter: Reporter | null = null;

const MAX_RECENT_ERRORS = 10;
const recentErrors: string[] = [];

export function setErrorReporter(r: Reporter): void {
  reporter = r;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    // First stack frame only — enough to locate it, short enough to read.
    const frame = error.stack?.split("\n")[1]?.trim();
    return `${error.name}: ${error.message}${frame ? ` (${frame})` : ""}`;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Record an error for the bug-report buffer WITHOUT sending it to the reporter.
 * Used for global window errors, which Sentry already instruments itself —
 * routing those through reportError would double-report them.
 */
export function recordClientError(error: unknown): void {
  try {
    const time = new Date().toISOString().slice(11, 19);
    recentErrors.push(`${time} ${formatError(error)}`);
    if (recentErrors.length > MAX_RECENT_ERRORS) recentErrors.shift();
  } catch {
    // Recording must never throw into app code
  }
}

/** Newest last. Empty when nothing has gone wrong this session. */
export function getRecentErrors(): string[] {
  return [...recentErrors];
}

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  recordClientError(error);
  try {
    reporter?.(error, context);
  } catch {
    // Reporting must never throw into app code
  }
}
