/**
 * Error reporting indirection. The app calls reportError(); the Sentry SDK
 * (lazy-loaded in monitoring.ts, only when VITE_SENTRY_DSN is set) registers
 * itself as the reporter. This keeps @sentry/react out of the main bundle
 * and lets call sites report unconditionally — with no DSN it's a no-op.
 */

type Reporter = (error: unknown, context?: Record<string, unknown>) => void;

let reporter: Reporter | null = null;

export function setErrorReporter(r: Reporter): void {
  reporter = r;
}

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  try {
    reporter?.(error, context);
  } catch {
    // Reporting must never throw into app code
  }
}
