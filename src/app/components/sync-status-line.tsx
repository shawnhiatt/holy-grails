import { useEffect, useState } from "react";
import { Disc3 } from "./icons";
import { useApp } from "./app-context";
import { formatSyncedAgo } from "../utils/format";

/**
 * Compact "Last synced 3h ago" metadata line under the search/filter row on
 * Collection and Wantlist. Read-only — it reports when the collection was last
 * fetched, not a control. Shows a spinning Disc3 while a sync is in flight.
 * Renders nothing until a sync has happened (nothing to report yet).
 */
export function SyncStatusLine({ className = "" }: { className?: string }) {
  const { lastSyncedAt, isBackgroundSyncing, isSyncing, isAuthenticated } = useApp();
  const syncing = isBackgroundSyncing || isSyncing;

  // Tick once a minute so the relative time stays current without a sync.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  if (!isAuthenticated) return null;

  const ago = formatSyncedAgo(lastSyncedAt);

  // Nothing to report until the first fetch completes.
  if (!syncing && !ago) return null;

  return (
    <div
      className={`flex items-center gap-1.5 ${className}`}
      style={{
        fontSize: "12px",
        fontWeight: 500,
        fontFamily: "'DM Sans', system-ui, sans-serif",
        color: "var(--c-text-muted)",
        padding: "2px 0",
      }}
    >
      {syncing && (
        <Disc3 size={12} className="disc-spinner" style={{ color: "var(--c-text-muted)" }} />
      )}
      {syncing ? "Syncing" : `Last synced ${ago}`}
    </div>
  );
}
