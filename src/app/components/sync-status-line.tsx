import { useEffect, useState } from "react";
import { Disc3 } from "lucide-react";
import { useApp } from "./app-context";
import { formatSyncedAgo } from "../utils/format";

/**
 * Compact "Last synced 3h ago" line that doubles as a manual refresh trigger.
 * Tapping runs the cheap change probe (refreshFromDiscogs) — a real sync only
 * happens if Discogs actually changed. Shows a spinning Disc3 while syncing.
 * Placed under the search/filter row on Collection and Wantlist.
 */
export function SyncStatusLine({ className = "" }: { className?: string }) {
  const { lastSyncedAt, refreshFromDiscogs, isBackgroundSyncing, isSyncing, isAuthenticated } = useApp();
  const syncing = isBackgroundSyncing || isSyncing;

  // Tick once a minute so the relative time stays current without a sync.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  if (!isAuthenticated) return null;

  const ago = formatSyncedAgo(lastSyncedAt);
  const label = syncing ? "Syncing" : ago ? `Last synced ${ago}` : "Sync now";

  return (
    <button
      onClick={() => { if (!syncing) refreshFromDiscogs(); }}
      disabled={syncing}
      className={`flex items-center gap-1.5 tappable ${className}`}
      style={{
        fontSize: "12px",
        fontWeight: 500,
        fontFamily: "'DM Sans', system-ui, sans-serif",
        color: "var(--c-text-muted)",
        background: "none",
        border: "none",
        padding: "2px 0",
        cursor: syncing ? "default" : "pointer",
        touchAction: "manipulation",
      }}
    >
      <Disc3
        size={12}
        className={syncing ? "disc-spinner" : ""}
        style={{ color: "var(--c-text-muted)" }}
      />
      {label}
    </button>
  );
}
