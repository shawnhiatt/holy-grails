import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";

/**
 * The "your session ended while the app was open" case (bug hunt L9).
 *
 * Every authenticated subscription throws "Unauthorized" once the server stops
 * honoring the session token: "Wipe all data" or sign-out on another device,
 * or the 90-day expiry landing mid-session. `useQuery` throws during render, so
 * the root ErrorBoundary catches it before app-context's restore effect (which
 * only handles an invalid token at boot) ever gets a turn, and the tab printed
 * a raw stack trace.
 *
 * Prod redacts the server's message to "Server Error", so the text alone can't
 * say "Unauthorized". What survives is the `[CONVEX Q(fn)]` prefix Convex puts
 * on every failed query. That only narrows it to "a query failed"; whether the
 * session is actually gone is then asked of the server directly.
 */
export function isConvexQueryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message.includes("[CONVEX Q(");
}

/**
 * True only when the server positively says this token no longer maps to a
 * user (`getLatestUser` returns null). A network failure or any other error
 * answers false: signing someone out because the check itself failed would be
 * worse than showing the trace.
 */
export async function isSessionGone(sessionToken: string): Promise<boolean> {
  const url = import.meta.env.VITE_CONVEX_URL;
  if (!url) return false;
  try {
    const client = new ConvexHttpClient(url);
    const user = await client.query(api.users.getLatestUser, { sessionToken });
    return user === null;
  } catch {
    return false;
  }
}
