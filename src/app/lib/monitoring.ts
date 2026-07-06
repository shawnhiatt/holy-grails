import * as Sentry from "@sentry/react";
import { version } from "../../../package.json";
import { setErrorReporter } from "./report-error";

/**
 * Sentry error monitoring — crashes and unhandled rejections only, no
 * tracing, no session replay. Loaded lazily from main.tsx (dynamic import)
 * and ONLY when VITE_SENTRY_DSN is set, so dev builds and DSN-less deploys
 * never ship or run the SDK. Sentry's default integrations hook
 * window.onerror / onunhandledrejection; the React ErrorBoundary in App.tsx
 * feeds render crashes through reportError().
 */
export function initMonitoring(dsn: string): void {
  Sentry.init({
    dsn,
    release: `holy-grails@${version}`,
    environment: import.meta.env.MODE,
    // Errors only — keep the free tier for what matters. No tracesSampleRate,
    // no replay integrations. Do not add them without discussion.
    sendDefaultPii: false,
  });

  setErrorReporter((error, context) => {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  });
}
