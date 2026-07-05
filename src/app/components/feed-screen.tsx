import { memo, useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  Broom,
  Disc3,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  GalleryVerticalEnd,
  Grid2x2,
  Square,
  Zap,
  Play,
  RefreshCw,
  Shuffle,
} from "./icons";
import { WantlistAddIcon } from "./wantlist-add-icon";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { useApp } from "./app-context";
import type { FollowingFeedEntry } from "./app-context";
import type { Screen } from "./app-context";
import { getCachedCollectionValue, type Album } from "./discogs-api";
import { NoDiscogsCard } from "./no-discogs-card";
import { purgeIndicatorColor, purgeTagColor, purgeToast } from "./purge-colors";
import { PurgeVerdictButtons } from "./purge-verdict-buttons";
import { useSafeTap } from "../lib/use-safe-tap";
import { EASE_IN_OUT, EASE_OUT, DURATION_NORMAL } from "./motion-tokens";
import { formatRelativeDate } from "./last-played-utils";
import { DepthsAlbumCard } from "./depths-album-card";
import { SlideOutPanel } from "./slide-out-panel";
import { formatActivityDate, getInitial, formatSyncedAgo } from "../utils/format";
import { shuffle, pickRandom } from "../utils/shuffle";
import { deriveCollectionFacts, type CollectionFact } from "../utils/collection-facts";
import { FormatSpotlight } from "./format-spotlight";

const hasYear = (year: number | null | undefined): year is number =>
  year != null && year !== 0;

/* ─── Recent Album Card (memoized — used by Recently Added; module scope so
   the component identity is stable across FeedScreen renders) ─── */

interface RecentAlbumCardProps {
  album: Album;
  width?: string;
  isDarkMode: boolean;
  /** Resolved purge indicator color, or undefined when hidden/untagged */
  purgeColor?: string;
  playCount: number;
  onOpen: (id: string) => void;
}

const RecentAlbumCard = memo(function RecentAlbumCard({ album, width, isDarkMode, purgeColor, playCount, onOpen }: RecentAlbumCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      {...useSafeTap(() => onOpen(album.id))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(album.id);
        }
      }}
      className="rounded-[10px] overflow-hidden group focus:outline-none text-left tappable transition-all cursor-pointer"
      style={{
        width: width || undefined,
        flexShrink: width ? 0 : undefined,
        backgroundColor: "var(--c-surface)",
        border: `1px solid ${isDarkMode ? "var(--c-border-strong)" : "#D2D8DE"}`,
        boxShadow: "var(--c-card-shadow)",
        touchAction: "manipulation",
      }}
    >
      {/* Cover art */}
      <div className="relative aspect-square overflow-hidden">
        <img loading="lazy" decoding="async"
          src={album.cover}
          alt={`${album.artist} - ${album.title}`}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          draggable={false}
        />
        {purgeColor && (
          <div
            className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full shadow-sm"
            style={{ backgroundColor: purgeColor }}
          />
        )}
        {playCount >= 1 && (
          <div
            className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
            style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
          >
            <Play size={9} weight="fill" color="white" />
            <span style={{ fontSize: "10px", fontWeight: 600, color: "white", lineHeight: 1, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
              {playCount}
            </span>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="px-2 pt-[6px] pb-2" style={{ minWidth: 0, overflow: "hidden" }}>
        <p
          style={{
            fontSize: "13px",
            fontWeight: 600,
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            color: "var(--c-text)",
            lineHeight: "1.25",
            display: "block",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            WebkitTextOverflow: "ellipsis",
            maxWidth: "100%",
          } as React.CSSProperties}
        >
          {album.title}
        </p>
        <p
          className="mt-[1px]"
          style={{
            fontSize: "12px",
            fontWeight: 400,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            color: "var(--c-text-secondary)",
            lineHeight: "1.3",
            display: "block",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            WebkitTextOverflow: "ellipsis",
            maxWidth: "100%",
          } as React.CSSProperties}
        >
          {album.artist}
        </p>
        <div className="flex items-center gap-1.5 mt-[3px]" style={{ minWidth: 0, overflow: "hidden" }}>
          {hasYear(album.year) && (
          <span
            style={{
              fontSize: "11px",
              fontWeight: 400,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              color: "var(--c-text-muted)",
              flexShrink: 0,
            }}
          >
            {album.year}
          </span>
          )}
          <span
            className="rounded-full"
            style={{
              display: "inline-flex",
              overflow: "hidden",
              flexShrink: 1,
              minWidth: 0,
              padding: "1px 6px",
              fontSize: "10px",
              fontWeight: 500,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              backgroundColor: isDarkMode
                ? "rgba(172,222,242,0.2)"
                : "rgba(172,222,242,0.5)",
              color: isDarkMode ? "#ACDEF2" : "#00527A",
            }}
          >
            <span
              style={{
                display: "block",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                WebkitTextOverflow: "ellipsis",
                maxWidth: "100%",
                width: "100%",
              } as React.CSSProperties}
            >
              {album.folder}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
});

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/* ── Decades section flavor headers ── */

function getDecadeLabel(year: number): string | null {
  if (year <= 0) return null;
  const decadeStart = Math.floor(year / 10) * 10;
  return `${decadeStart}s`;
}


interface FeedActivity {
  id: string;
  followedId: string;
  followedUsername: string;
  followedAvatar: string;
  albumTitle: string;
  albumArtist: string;
  albumThumb: string;
  albumCover: string;
  albumReleaseId: number;
  albumMasterId?: number;
  albumYear: number;
  albumLabel: string;
  date: string;
  displayDate: string;
}

function buildFeedActivityFrom(
  feedEntries: FollowingFeedEntry[],
  source: "collection" | "wants",
  max: number,
  avatarMap?: Map<string, string>
): FeedActivity[] {
  const items: FeedActivity[] = [];
  const idPrefix = source === "wants" ? "feed-want" : "feed";
  for (const entry of feedEntries) {
    const albums = source === "wants" ? entry.recent_wants : entry.recent_albums;
    if (!albums || albums.length === 0) continue;
    const sorted = [...albums]
      .sort((a, b) => (b.dateAdded || "").localeCompare(a.dateAdded || ""))
      .slice(0, 4);
    sorted.forEach((album) => {
      items.push({
        id: `${idPrefix}-${entry.followed_username}-${album.release_id}`,
        followedId: `f-${entry.followed_username}`,
        followedUsername: entry.followed_username,
        followedAvatar: avatarMap?.get(entry.followed_username) || "",
        albumTitle: album.title,
        albumArtist: album.artist,
        albumThumb: album.thumb || "",
        albumCover: album.cover,
        albumReleaseId: album.release_id,
        albumMasterId: album.master_id,
        albumYear: album.year,
        albumLabel: album.label,
        date: album.dateAdded || "",
        displayDate: "",
      });
    });
  }
  items.sort((a, b) => b.date.localeCompare(a.date));
  for (const item of items) {
    item.displayDate = item.date ? formatActivityDate(item.date) : "";
  }
  return items.slice(0, max);
}

function buildFeedActivity(feedEntries: FollowingFeedEntry[], max: number, avatarMap?: Map<string, string>): FeedActivity[] {
  return buildFeedActivityFrom(feedEntries, "collection", max, avatarMap);
}

function buildFeedWantActivity(feedEntries: FollowingFeedEntry[], max: number, avatarMap?: Map<string, string>): FeedActivity[] {
  return buildFeedActivityFrom(feedEntries, "wants", max, avatarMap);
}

/* ─── Section Header ─── */

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 600,
  letterSpacing: "-0.3px",
  lineHeight: 1.2,
  color: "var(--c-text)",
  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
  margin: 0,
};

/* ─── Feed Screen ─── */

export function FeedScreen({ onHeroVisibility }: { onHeroVisibility?: (visible: boolean) => void }) {
  const {
    albums,
    wants,
    followingFeed,
    lastPlayed,
    setScreen,
    setSelectedAlbumId,
    setShowAlbumDetail,
    setPurgeFilter,
    setNeverPlayedFilter,
    isDarkMode,
    isAuthenticated,
    hidePurgeIndicators,
    addToWantList,
    removeFromWantList,
    discogsUsername,
    setPurgeTag,
    isSyncing,
    isBackgroundSyncing,
    userAvatar,
    lastSyncedAt,
    syncFromDiscogs,
    followingAvatars,
    setSelectedWantItem,
    toggleWantPriority,
    setSelectedFeedAlbum,
    isInCollection,
    playCounts,
    setFollowingActivityTabIntent,
  } = useApp();

  // Per-item in-flight tracking for wantlist API calls
  const [inFlightIds, setInFlightIds] = useState<Set<number>>(() => new Set());
  // Confirmation prompts for wantlist add/remove
  const [addWantConfirm, setAddWantConfirm] = useState<FeedActivity | null>(null);
  const [isAddingWant, setIsAddingWant] = useState(false);
  const [removeWantConfirm, setRemoveWantConfirm] = useState<FeedActivity | null>(null);
  const [isRemovingWant, setIsRemovingWant] = useState(false);

  // Purge evaluator — current album for inline rating
  const [purgeEvalAlbumId, setPurgeEvalAlbumId] = useState<string | null>(() => {
    // Pick initial album: unrated first, then maybes
    const unrated = albums.filter((a) => !a.purgeTag);
    if (unrated.length > 0) return pickRandom(unrated).id;
    const maybes = albums.filter((a) => a.purgeTag === "maybe");
    if (maybes.length > 0) return pickRandom(maybes).id;
    return null;
  });
  const [purgeEvalFading, setPurgeEvalFading] = useState(false);

  // Derived data
  const recentlyAdded = useMemo(() => {
    return [...albums]
      .sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime())
      .slice(0, 12);
  }, [albums]);

  // This Week in Your Collection — albums added during this calendar week in previous years
  // Decades — pick a random eligible decade on mount, stable for session
  const [decadesSpotlight] = useState(() => {
    if (albums.length === 0) return null;

    // Group albums by decade (skip year === 0)
    const byDecade = new Map<string, typeof albums>();
    for (const a of albums) {
      const label = getDecadeLabel(a.year);
      if (!label) continue;
      const arr = byDecade.get(label) ?? [];
      arr.push(a);
      byDecade.set(label, arr);
    }

    // Filter to decades with at least 5 albums
    const eligible = [...byDecade.entries()].filter(([, arr]) => arr.length >= 5);
    if (eligible.length === 0) return null;

    const [decade, decadeAlbums] = pickRandom(eligible);
    // Shuffle and take up to 10
    const shuffled = shuffle(decadeAlbums).slice(0, 10);
    const header = `The ${decade}`;

    return { decade, header, albums: shuffled };
  });

  // From the Depths — 10 random albums, reshuffled every mount
  const [depthsAlbums, setDepthsAlbums] = useState(() => {
    if (albums.length === 0) return [];
    return shuffle(albums).slice(0, 10);
  });
  // Bumped on every reshuffle so the cards remount and replay their entrance
  const [depthsShuffleKey, setDepthsShuffleKey] = useState(0);
  // Single mode shows one album per shuffle instead of the 4/9 grid
  const [depthsSingle, setDepthsSingle] = useState(false);
  const reshuffleDepths = useCallback(() => {
    if (albums.length === 0) return;
    setDepthsAlbums(shuffle(albums).slice(0, 10));
    setDepthsShuffleKey((k) => k + 1);
  }, [albums]);

  // On the Hunt — shuffled wantlist items, weighted toward priority
  const [huntAlbums] = useState(() => {
    if (wants.length === 0) return [];
    // Weight priority items: duplicate them so they appear more often in shuffle
    const weighted = wants.flatMap((w) => (w.priority ? [w, w] : [w]));
    const seen = new Set<number>();
    const shuffled = shuffle(weighted).filter((w) => {
      if (seen.has(w.release_id)) return false;
      seen.add(w.release_id);
      return true;
    });
    return shuffled.slice(0, 6);
  });

  const followingActivity = useMemo(() => buildFeedActivity(followingFeed, 10, followingAvatars), [followingFeed, followingAvatars]);
  const followingWantActivity = useMemo(() => buildFeedWantActivity(followingFeed, 10, followingAvatars), [followingFeed, followingAvatars]);
  const [followingActivityTab, setFollowingActivityTab] = useState<"collection" | "wantlist">("collection");
  const [activityExpanded, setActivityExpanded] = useState(false);
  const ACTIVITY_COLLAPSED = 5;

  const unratedCount = useMemo(
    () => albums.filter((a) => !a.purgeTag).length,
    [albums]
  );

  const neverPlayedCount = useMemo(
    () => albums.filter((a) => !lastPlayed[a.id]).length,
    [albums, lastPlayed]
  );

  const keepCount = useMemo(() => albums.filter((a) => a.purgeTag === "keep").length, [albums]);
  const cutCount = useMemo(() => albums.filter((a) => a.purgeTag === "cut").length, [albums]);
  const maybeCount = useMemo(() => albums.filter((a) => a.purgeTag === "maybe").length, [albums]);
  const ratedCount = keepCount + cutCount + maybeCount;
  const purgeProgress = albums.length > 0 ? Math.round((ratedCount / albums.length) * 100) : 0;

  // Collection value from Discogs API cache
  const collectionValue = useMemo(() => getCachedCollectionValue(), [albums]);
  const hasCollectionValue = collectionValue !== null;

  // Growth: records added in last 3 months
  const recentGrowthCount = useMemo(() => {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    return albums.filter((a) => new Date(a.dateAdded) >= threeMonthsAgo).length;
  }, [albums]);

  // Purge evaluator — pick next album to rate
  const getNextPurgeAlbum = useCallback((excludeId?: string) => {
    const unrated = albums.filter((a) => !a.purgeTag && a.id !== excludeId);
    if (unrated.length > 0) return pickRandom(unrated);
    const maybes = albums.filter((a) => a.purgeTag === "maybe" && a.id !== excludeId);
    if (maybes.length > 0) return pickRandom(maybes);
    return null; // all rated keep/cut
  }, [albums]);

  // Initialize purge eval album on mount
  const purgeEvalAlbum = useMemo(() => {
    if (purgeEvalAlbumId) {
      const found = albums.find((a) => a.id === purgeEvalAlbumId);
      if (found) return found;
    }
    return getNextPurgeAlbum();
  }, [purgeEvalAlbumId, albums, getNextPurgeAlbum]);

  const purgeComplete = !purgeEvalAlbum && albums.length > 0;

  const handlePurgeDecision = useCallback((tag: "keep" | "cut" | "maybe") => {
    if (!purgeEvalAlbum) return;
    setPurgeTag(purgeEvalAlbum.id, tag);
    purgeToast(tag, isDarkMode, purgeEvalAlbum.title);

    // Crossfade to next album
    setPurgeEvalFading(true);
    setTimeout(() => {
      const next = getNextPurgeAlbum(purgeEvalAlbum.id);
      setPurgeEvalAlbumId(next?.id ?? null);
      setPurgeEvalFading(false);
    }, 150);
  }, [purgeEvalAlbum, setPurgeTag, getNextPurgeAlbum, isDarkMode]);

  const hasData = albums.length > 0;
  const hasFollowing = followingFeed.length > 0;

  // Welcome greeting — stable per calendar day, changes by time-of-day bucket
  // Manual sync from the feed identity block (mirrors the Settings pattern).
  // Manual Sync Now runs as a *background* sync (isBackgroundSyncing), so the
  // SYNC control must watch both flags or it never shows its syncing state.
  const syncInFlight = isSyncing || isBackgroundSyncing;
  const handleSyncNow = useCallback(async () => {
    if (syncInFlight) return;
    try {
      const stats = await syncFromDiscogs();
      toast.success(`Synced \u2014 ${stats.albums} records \u00b7 ${stats.folders} folders \u00b7 ${stats.wants} wantlist items`);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Sync failed. Try again.";
      console.error("[Discogs Sync Error]", err);
      toast.error(msg);
    }
  }, [syncInFlight, syncFromDiscogs]);

  // Scroll-linked header transparency
  const scrollRef = useRef<HTMLDivElement>(null);
  const handleFeedScroll = useCallback(() => {
    if (!scrollRef.current || !onHeroVisibility) return;
    const scrollTop = scrollRef.current.scrollTop;
    // Header becomes opaque once scrolled past 100px (past the header area)
    onHeroVisibility(scrollTop < 100);
  }, [onHeroVisibility]);

  // Reset hero visibility when mounting feed screen
  useEffect(() => {
    onHeroVisibility?.(true);
    return () => onHeroVisibility?.(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tapping the active Feed nav item scrolls back to the top
  useEffect(() => {
    const onScrollTop = () => {
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("hg:feed-scroll-top", onScrollTop);
    return () => window.removeEventListener("hg:feed-scroll-top", onScrollTop);
  }, []);

  const cardBg = "var(--c-surface)";
  const cardBorder = isDarkMode ? "var(--c-border-strong)" : "#D2D8DE";

  // Sets for quick lookups in Following Activity heart logic (release_id + master_id)
  const ownReleaseIds = useMemo(() => new Set(albums.map((a) => a.release_id)), [albums]);
  const ownMasterIds = useMemo(() => {
    const s = new Set<number>();
    for (const a of albums) if (a.master_id) s.add(a.master_id);
    return s;
  }, [albums]);
  const wantReleaseIds = useMemo(() => new Set(wants.map((w) => w.release_id)), [wants]);
  const wantMasterIds = useMemo(() => {
    const s = new Set<number>();
    for (const w of wants) if (w.master_id) s.add(w.master_id);
    return s;
  }, [wants]);

  const handleHeartTap = useCallback(
    (item: FeedActivity) => {
      // Already in collection or already in flight — no action
      const inOwn = ownReleaseIds.has(item.albumReleaseId) || (item.albumMasterId && ownMasterIds.has(item.albumMasterId));
      if (inOwn) return;
      if (inFlightIds.has(item.albumReleaseId)) return;

      const inWant = wantReleaseIds.has(item.albumReleaseId) || (item.albumMasterId && wantMasterIds.has(item.albumMasterId));
      if (inWant) {
        // Show remove confirmation
        setRemoveWantConfirm(item);
        return;
      }

      // Show add confirmation prompt
      setAddWantConfirm(item);
    },
    [ownReleaseIds, ownMasterIds, wantReleaseIds, wantMasterIds, inFlightIds]
  );

  /* ── Shared card style ── */
  const cardStyle: React.CSSProperties = {
    backgroundColor: cardBg,
    border: `1px solid ${cardBorder}`,
    boxShadow: "var(--c-card-shadow)",
  };

  /* ─────────────── FROM THE DEPTHS — carousel / grid ─────────────── */
  const handleDepthsTap = useCallback((albumId: string) => {
    setSelectedAlbumId(albumId);
    setShowAlbumDetail(true);
  }, [setSelectedAlbumId, setShowAlbumDetail]);

  // Staggered entrance for shuffled cards — keyed on depthsShuffleKey so each
  // reshuffle remounts the cards and replays the sequence
  const reduceMotion = useReducedMotion();
  const depthsCardMotion = (i: number) => ({
    initial: reduceMotion ? false as const : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DURATION_NORMAL, ease: EASE_OUT, delay: reduceMotion ? 0 : i * 0.08 },
  });

  const DepthsSection = depthsAlbums.length > 0 ? (
    <div>
      {/* Section header */}
      <div className="px-[16px] lg:px-0 mb-[10px] flex items-center justify-between gap-2">
        <h2
          style={{
            background: "linear-gradient(to right, #F276EC, #EBFD00, #48FF91, #00CFFF)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            fontFamily: "'Rock Salt', cursive",
            fontSize: "30px",
            lineHeight: 1.4,
            fontWeight: 400,
            margin: 0,
            // Rock Salt glyphs overrun the text box; background-clip:text only
            // paints inside it, so extend the box (top + left) to cover them.
            // The negative left margin offsets the left padding to keep the
            // title visually aligned with the card grid below.
            paddingTop: "0.15em",
            paddingLeft: "0.25em",
            marginBottom: "2px",
            marginLeft: "-0.25em",
          }}
        >
          Shuffle
        </h2>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* One-vs-grid toggle (mirrors the Collection view mode pill) */}
          <div
            className="flex items-center gap-[2px] rounded-[10px] h-[34px] shrink-0 overflow-hidden"
            style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}
          >
            <button
              onClick={() => setDepthsSingle(true)}
              title="One at a time"
              aria-label="Shuffle one album"
              className="w-[34px] h-[34px] flex items-center justify-center transition-all"
              style={{
                backgroundColor: depthsSingle ? "var(--c-surface-hover)" : undefined,
                color: "var(--c-text-muted)",
                touchAction: "manipulation",
              }}
            >
              <Square size={18} />
            </button>
            <button
              onClick={() => setDepthsSingle(false)}
              title="Grid"
              aria-label="Shuffle a grid of albums"
              className="w-[34px] h-[34px] flex items-center justify-center transition-all"
              style={{
                backgroundColor: !depthsSingle ? "var(--c-surface-hover)" : undefined,
                color: "var(--c-text-muted)",
                touchAction: "manipulation",
              }}
            >
              <Grid2x2 size={18} />
            </button>
          </div>
          <button
            onClick={reshuffleDepths}
            className="w-9 h-9 rounded-full flex items-center justify-center tappable cursor-pointer flex-shrink-0"
            style={{ backgroundColor: "#EBFD00", color: "#0C284A", touchAction: "manipulation" }}
            aria-label="Shuffle again"
          >
            <Shuffle size={16} weight="bold" />
          </button>
        </div>
      </div>

      {/* Mobile: 2x2 grid, or one full-width card in single mode */}
      <div className="lg:hidden px-[16px]">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: depthsSingle ? "1fr" : "repeat(2, 1fr)",
            gap: "12px",
          }}
        >
          {depthsAlbums.slice(0, depthsSingle ? 1 : 4).map((album, i) => (
            <motion.div key={`depths-feed-${depthsShuffleKey}-${album.id}`} {...depthsCardMotion(i)}>
              <DepthsAlbumCard
                album={album}
                onTap={handleDepthsTap}
                compact={!depthsSingle}
                dominantColor
                playCount={playCounts[String(album.release_id)] ?? 0}
              />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Desktop: 3x3 grid, or one card in single mode */}
      <div className="hidden lg:block">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px",
          }}
        >
          {depthsAlbums.slice(0, depthsSingle ? 1 : 9).map((album, i) => (
            <motion.div key={`depths-desk-${depthsShuffleKey}-${album.id}`} {...depthsCardMotion(i)}>
              <DepthsAlbumCard
                album={album}
                onTap={handleDepthsTap}
                dominantColor
                playCount={playCounts[String(album.release_id)] ?? 0}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  ) : null;

  /* ─────────────── DECADES SECTION ─────────────── */
  const DecadesSection = decadesSpotlight ? (
    <div>
      {/* Section header */}
      <div className="px-[16px] lg:px-0 mb-[10px]">
        <h3
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "1.5px",
            color: "var(--c-accent-cyan)",
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            textTransform: "uppercase",
            margin: 0,
            marginBottom: "4px",
          }}
        >
          Decade Highlight
        </h3>
        <h2
          style={{
            fontSize: "28px",
            fontWeight: 400,
            lineHeight: 1.4,
            color: "white",
            fontFamily: "'Rock Salt', cursive",
            margin: 0,
            marginBottom: "4px",
          }}
        >
          {decadesSpotlight.header}
        </h2>
      </div>

      {/* Mobile: horizontal swipeable carousel */}
      <div className="lg:hidden">
        <style>{`.decades-feed-scroll::-webkit-scrollbar { display: none; }`}</style>
        <div
          className="decades-feed-scroll"
          style={{
            display: "flex",
            flexDirection: "row",
            overflowX: "auto",
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            gap: "12px",
            paddingLeft: "16px",
            scrollPaddingLeft: "16px",
            paddingBottom: "4px",
          }}
        >
          {decadesSpotlight.albums.map((album) => (
            <div
              key={`decades-${album.id}`}
              style={{
                flex: "0 0 82%",
                scrollSnapAlign: "start",
                minWidth: 0,
              }}
            >
              <DepthsAlbumCard
                album={album}
                onTap={handleDepthsTap}
                dominantColor
                playCount={playCounts[String(album.release_id)] ?? 0}
              />
            </div>
          ))}
          {/* Spacer div to enforce right padding in scroll container */}
          <div style={{ minWidth: "16px", flexShrink: 0 }} />
        </div>
      </div>

      {/* Desktop: static grid */}
      <div className="hidden lg:block">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(decadesSpotlight.albums.length, 4)}, 1fr)`,
            gap: "16px",
          }}
        >
          {decadesSpotlight.albums.slice(0, 4).map((album) => (
            <DepthsAlbumCard
              key={`decades-desk-${album.id}`}
              album={album}
              onTap={handleDepthsTap}
              dominantColor
              playCount={playCounts[String(album.release_id)] ?? 0}
            />
          ))}
        </div>
      </div>
    </div>
  ) : null;

  /* RecentAlbumCard moved to module scope (memoized) — see top of file */


  /* ─────────────── THIS WEEK IN YOUR COLLECTION ─────────────── */
  /* ─────────────── ON THE HUNT — wantlist section ─────────────── */
  const OnTheHuntSection = huntAlbums.length > 0 ? (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between px-[16px] lg:px-0 mb-[12px]">
        <div className="flex-1">
          <h3
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "1.5px",
              color: "var(--c-accent-pink)",
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              textTransform: "uppercase",
              margin: 0,
              marginBottom: "4px",
            }}
          >
            Wantlist Spotlight
          </h3>
          <h2
            style={{
              fontSize: "28px",
              fontWeight: 400,
              lineHeight: 1.1,
              color: "white",
              fontFamily: "'Rock Salt', cursive",
              margin: 0,
              marginBottom: "4px",
            }}
          >
            On the Hunt
          </h2>
        </div>
        <button
          onClick={() => setScreen("wants")}
          className="cursor-pointer"
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--c-link)",
            fontFamily: "'DM Sans', system-ui, sans-serif",
            background: "none",
            border: "none",
            padding: 0,
          }}
        >
          View Wantlist
        </button>
      </div>

      {/* Mobile: horizontal scroll */}
      <div className="lg:hidden">
        <style>{`.hunt-feed-scroll::-webkit-scrollbar { display: none; }`}</style>
        <div
          className="hunt-feed-scroll"
          style={{
            display: "flex",
            flexDirection: "row",
            overflowX: "auto",
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            gap: "12px",
            paddingLeft: "16px",
            scrollPaddingLeft: "16px",
            paddingBottom: "4px",
          }}
        >
          {huntAlbums.map((item) => (
            <div
              key={`hunt-${item.id}`}
              role="button"
              tabIndex={0}
              {...useSafeTap(() => { setSelectedWantItem(item); setShowAlbumDetail(true); })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedWantItem(item);
                  setShowAlbumDetail(true);
                }
              }}
              className="rounded-[10px] overflow-hidden group focus:outline-none text-left tappable transition-all cursor-pointer"
              style={{
                flex: "0 0 145px",
                scrollSnapAlign: "start",
                backgroundColor: "var(--c-surface)",
                border: `1px solid ${isDarkMode ? "var(--c-border-strong)" : "#D2D8DE"}`,
                boxShadow: "var(--c-card-shadow)",
                touchAction: "manipulation",
              }}
            >
              {/* Cover art */}
              <div className="relative aspect-square overflow-hidden">
                <img loading="lazy" decoding="async"
                  src={item.cover || item.thumb}
                  alt={`${item.artist} - ${item.title}`}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  draggable={false}
                />
                {/* Priority bolt */}
                {item.priority && (
                  <div
                    className="absolute top-1.5 right-1.5"
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      background: "rgba(0, 0, 0, 0.45)",
                      backdropFilter: "blur(4px)",
                      WebkitBackdropFilter: "blur(4px)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Zap size={12} weight="fill" color="#EEFC0F" />
                  </div>
                )}
              </div>

              {/* Metadata */}
              <div className="px-2 pt-[6px] pb-2" style={{ minWidth: 0, overflow: "hidden" }}>
                <p
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                    color: "var(--c-text)",
                    lineHeight: "1.25",
                    display: "block",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    WebkitTextOverflow: "ellipsis",
                    maxWidth: "100%",
                  } as React.CSSProperties}
                >
                  {item.title}
                </p>
                <p
                  className="mt-[1px]"
                  style={{
                    fontSize: "12px",
                    fontWeight: 400,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    color: "var(--c-text-secondary)",
                    lineHeight: "1.3",
                    display: "block",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    WebkitTextOverflow: "ellipsis",
                    maxWidth: "100%",
                  } as React.CSSProperties}
                >
                  {item.artist}
                </p>
              </div>
            </div>
          ))}
          {/* Spacer for right padding */}
          <div style={{ minWidth: "16px", flexShrink: 0 }} />
        </div>
      </div>

      {/* Desktop: static grid */}
      <div className="hidden lg:grid grid-cols-6 gap-3">
        {huntAlbums.map((item) => (
          <div
            key={`hunt-d-${item.id}`}
            role="button"
            tabIndex={0}
            {...useSafeTap(() => { setSelectedWantItem(item); setShowAlbumDetail(true); })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSelectedWantItem(item);
                setShowAlbumDetail(true);
              }
            }}
            className="rounded-[10px] overflow-hidden group focus:outline-none text-left tappable transition-all cursor-pointer"
            style={{
              backgroundColor: "var(--c-surface)",
              border: `1px solid ${isDarkMode ? "var(--c-border-strong)" : "#D2D8DE"}`,
              boxShadow: "var(--c-card-shadow)",
              touchAction: "manipulation",
            }}
          >
            {/* Cover art */}
            <div className="relative aspect-square overflow-hidden">
              <img loading="lazy" decoding="async"
                src={item.cover || item.thumb}
                alt={`${item.artist} - ${item.title}`}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                draggable={false}
              />
              {item.priority && (
                <div
                  className="absolute top-1.5 right-1.5"
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    background: "rgba(0, 0, 0, 0.45)",
                    backdropFilter: "blur(4px)",
                    WebkitBackdropFilter: "blur(4px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Zap size={12} weight="fill" color="#EEFC0F" />
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="px-2 pt-[6px] pb-2" style={{ minWidth: 0, overflow: "hidden" }}>
              <p
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                  color: "var(--c-text)",
                  lineHeight: "1.25",
                  display: "block",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  WebkitTextOverflow: "ellipsis",
                  maxWidth: "100%",
                } as React.CSSProperties}
              >
                {item.title}
              </p>
              <p
                className="mt-[1px]"
                style={{
                  fontSize: "12px",
                  fontWeight: 400,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  color: "var(--c-text-secondary)",
                  lineHeight: "1.3",
                  display: "block",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  WebkitTextOverflow: "ellipsis",
                  maxWidth: "100%",
                } as React.CSSProperties}
              >
                {item.artist}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  /* ─────────────── FOLLOWING ACTIVITY card content ─────────────── */
  const renderActivityRow = (item: FeedActivity, showHeart: boolean, verb: "added" | "wantlisted") => {
    const inCollection = ownReleaseIds.has(item.albumReleaseId) || !!(item.albumMasterId && ownMasterIds.has(item.albumMasterId));
    const inWantList = wantReleaseIds.has(item.albumReleaseId) || !!(item.albumMasterId && wantMasterIds.has(item.albumMasterId));
    return (
      <div
        key={item.id}
        className="flex items-center gap-[12px] px-[14px] py-[12px]"
        style={{
          borderColor: "var(--c-border)",
          borderTopWidth: "1px",
          borderTopStyle: "solid" as const,
        }}
      >
        {/* Album cover with avatar overlay */}
        <div
          className="relative flex-shrink-0 cursor-pointer"
          style={{ width: "60px", height: "60px", touchAction: "manipulation" }}
          {...useSafeTap(() => {
            if (isInCollection(item.albumReleaseId, item.albumMasterId)) {
              const rid = Number(item.albumReleaseId);
              const match = albums.find((a) => Number(a.release_id) === rid) ||
                (item.albumMasterId && item.albumMasterId > 0 ? albums.find((a) => a.master_id === item.albumMasterId) : undefined);
              if (match) { setSelectedAlbumId(match.id); setShowAlbumDetail(true); return; }
            }
            setSelectedFeedAlbum({
              release_id: item.albumReleaseId,
              master_id: item.albumMasterId,
              title: item.albumTitle,
              artist: item.albumArtist,
              year: item.albumYear,
              thumb: item.albumThumb || item.albumCover,
              cover: item.albumCover,
              label: item.albumLabel,
              dateAdded: item.date || "",
            });
            setShowAlbumDetail(true);
          })}
        >
          <img loading="lazy" decoding="async"
            src={item.albumThumb || item.albumCover}
            alt={item.albumTitle}
            className="w-full h-full rounded-[8px] object-cover"
          />
          {/* Avatar overlay — bottom-left corner */}
          <div
            className="absolute flex items-center justify-center overflow-hidden"
            style={{
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              bottom: "-6px",
              left: "-6px",
              border: `2px solid ${isDarkMode ? "rgba(19,43,68,0.65)" : "rgba(255,255,255,0.65)"}`,
              backgroundColor: isDarkMode ? "#1A3350" : "#ACDEF2",
            }}
          >
            {item.followedAvatar ? (
              <img loading="lazy" decoding="async"
                src={item.followedAvatar}
                alt={item.followedUsername}
                className="w-full h-full object-cover"
              />
            ) : (
              <span
                style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  color: isDarkMode ? "#ACDEF2" : "#0C284A",
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                  lineHeight: 1,
                }}
              >
                {getInitial(item.followedUsername)}
              </span>
            )}
          </div>
        </div>

        {/* Text block */}
        <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
          <p
            style={{
              fontSize: "13px",
              fontWeight: 400,
              color: "var(--c-text)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              lineHeight: 1.35,
              display: "block",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              WebkitTextOverflow: "ellipsis",
              maxWidth: "100%",
            } as React.CSSProperties}
          >
            <span style={{ fontWeight: 600 }}>{item.followedUsername}</span>
            {` ${verb} `}
            <span style={{ fontWeight: 400 }}>{item.albumTitle}</span>
          </p>
          <p
            style={{
              fontSize: "12px",
              fontWeight: 400,
              color: "var(--c-text-muted)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              lineHeight: 1.35,
              marginTop: "2px",
              display: "block",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              WebkitTextOverflow: "ellipsis",
              maxWidth: "100%",
            } as React.CSSProperties}
          >
            {item.albumArtist}
          </p>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 400,
              color: "var(--c-text-faint)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              lineHeight: 1.35,
              marginTop: "2px",
            }}
          >
            {item.displayDate}
          </p>
        </div>

        {/* Heart / collection icon indicator — collection tab only */}
        {showHeart && (
          inCollection ? (
            <span
              className="flex-shrink-0 flex items-center gap-1.5"
              style={{ color: "#EBFD00", padding: "4px" }}
            >
              <GalleryVerticalEnd size={18} />
              <span
                className="hidden lg:inline"
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}
              >
                In Collection
              </span>
            </span>
          ) : (
            <button
              onClick={() => handleHeartTap(item)}
              disabled={inFlightIds.has(item.albumReleaseId)}
              className="flex-shrink-0 cursor-pointer tappable"
              aria-label={inWantList ? "Remove from wantlist" : "Add to wantlist"}
              style={{ padding: "4px", background: "none", border: "none" }}
            >
              {inFlightIds.has(item.albumReleaseId) ? (
                <Disc3 size={18} className="disc-spinner" style={{ color: "var(--c-text-faint)" }} />
              ) : (
                <span className="flex items-center gap-1.5">
                  <motion.div
                    key={inWantList ? "filled" : "outline"}
                    initial={{ scale: 0.7 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: DURATION_NORMAL, ease: EASE_IN_OUT }}
                  >
                    <WantlistAddIcon
                      filled={inWantList}
                      size={18}
                      color={inWantList ? "#EBFD00" : "var(--c-text-faint)"}
                    />
                  </motion.div>
                  {inWantList && (
                    <span
                      className="hidden lg:inline"
                      style={{
                        fontSize: "11px",
                        fontWeight: 500,
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        color: "#EBFD00",
                      }}
                    >
                      In Wantlist
                    </span>
                  )}
                </span>
              )}
            </button>
          )
        )}
      </div>
    );
  };

  const activeList = followingActivityTab === "collection" ? followingActivity : followingWantActivity;
  const activeVerb: "added" | "wantlisted" = followingActivityTab === "collection" ? "added" : "wantlisted";

  const FollowingActivityCard = (
    <div className="rounded-[12px] overflow-hidden h-full" style={cardStyle}>
      {/* Section header inside card */}
      <div className="flex items-center justify-between px-[16px] pt-[16px] pb-[12px]">
        <h2 style={{
          fontSize: "32px",
          fontWeight: 400,
          lineHeight: 1.2,
          color: "var(--c-text)",
          fontFamily: "'Manufacturing Consent', system-ui, sans-serif",
          margin: 0,
        }}>Following Activity</h2>
        {hasFollowing && (
          <button
            onClick={() => {
              setFollowingActivityTabIntent(followingActivityTab);
              setScreen("following");
            }}
            className="cursor-pointer"
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--c-link)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              background: "none",
              border: "none",
              padding: 0,
            }}
          >
            See all
          </button>
        )}
      </div>

      {/* Tab switcher */}
      {hasFollowing && (
        <div className="flex items-center gap-[8px] px-[16px] pb-[12px]">
          {(["collection", "wantlist"] as const).map((tab) => {
            const active = followingActivityTab === tab;
            const label = tab === "collection" ? "Collection" : "Wantlist";
            return (
              <button
                key={tab}
                onClick={() => { setFollowingActivityTab(tab); setActivityExpanded(false); }}
                className="cursor-pointer tappable"
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  padding: "6px 12px",
                  borderRadius: "999px",
                  border: "none",
                  background: active
                    ? (isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)")
                    : "var(--c-chip-bg)",
                  color: active
                    ? (isDarkMode ? "#ACDEF2" : "#00527A")
                    : "var(--c-text-muted)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {hasFollowing && activeList.length > 0 ? (
        <>
          {(activityExpanded ? activeList : activeList.slice(0, ACTIVITY_COLLAPSED)).map((item) => renderActivityRow(item, followingActivityTab === "collection", activeVerb))}
          {activeList.length > ACTIVITY_COLLAPSED && (
            <button
              onClick={() => setActivityExpanded((v) => !v)}
              className="w-full flex items-center justify-center gap-1 px-[16px] py-[12px] cursor-pointer tappable"
              style={{
                borderColor: "var(--c-border)",
                borderTopWidth: "1px",
                borderTopStyle: "solid" as const,
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--c-link)",
                fontFamily: "'DM Sans', system-ui, sans-serif",
                background: "none",
                touchAction: "manipulation",
              }}
            >
              {activityExpanded ? "Show less" : "Show more"}
              <ChevronDown
                size={14}
                style={{ transform: activityExpanded ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}
              />
            </button>
          )}
        </>
      ) : isSyncing ? (
        <div
          className="flex items-center justify-center px-[16px] py-[24px]"
          style={{
            borderColor: "var(--c-border)",
            borderTopWidth: "1px",
            borderTopStyle: "solid" as const,
          }}
        >
          <Disc3 size={18} className="disc-spinner" style={{ color: "var(--c-text-faint)" }} />
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center px-[16px] py-[20px]"
          style={{
            borderColor: "var(--c-border)",
            borderTopWidth: "1px",
            borderTopStyle: "solid" as const,
          }}
        >
          <p
            style={{
              fontSize: "13px",
              fontWeight: 400,
              color: "var(--c-text-muted)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              textAlign: "center",
            }}
          >
            {hasFollowing
              ? followingActivityTab === "wantlist"
                ? "No wantlist activity yet from collectors you follow."
                : "No collection activity yet from collectors you follow."
              : "No activity yet from collectors you follow."}
          </p>
          {!hasFollowing && (
            <button
              onClick={() => setScreen("following")}
              className="cursor-pointer tappable mt-[6px]"
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--c-link)",
                background: "none",
                border: "none",
                padding: 0,
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >
              Follow a collector
            </button>
          )}
        </div>
      )}
    </div>
  );

  /* ─────────────── RECENTLY ADDED section ─────────────── */
  const RecentlyAddedSection = (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-[12px]">
        <h2
          style={{
            fontSize: "32px",
            fontWeight: 400,
            color: "white",
            fontFamily: "'Manufacturing Consent', system-ui, sans-serif",
            margin: 0,
          }}
        >
          Recently Added
        </h2>
        <button
          onClick={() => setScreen("crate")}
          className="cursor-pointer"
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--c-link)",
            fontFamily: "'DM Sans', system-ui, sans-serif",
            background: "none",
            border: "none",
            padding: 0,
          }}
        >
          View Collection
        </button>
      </div>

      {/* Desktop: 6-column static grid */}
      <div className="hidden lg:grid grid-cols-6 gap-3">
        {recentlyAdded.slice(0, 6).map((album) => (
          <RecentAlbumCard key={album.id} album={album} isDarkMode={isDarkMode} purgeColor={!hidePurgeIndicators && album.purgeTag ? purgeIndicatorColor(album.purgeTag, isDarkMode) : undefined} playCount={playCounts[String(album.release_id)] ?? 0} onOpen={handleDepthsTap} />
        ))}
      </div>

      {/* Mobile: horizontal scroll gallery */}
      <div
        className="lg:hidden overflow-x-auto recently-added-scroll"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
          margin: "0 -16px",
          padding: "0 16px",
        }}
      >
        <style>{`.recently-added-scroll::-webkit-scrollbar { display: none; }`}</style>
        <div
          className="flex gap-[12px]"
          style={{ paddingRight: "16px" }}
        >
          {recentlyAdded.map((album) => (
            <RecentAlbumCard key={album.id} album={album} width="145px" isDarkMode={isDarkMode} purgeColor={!hidePurgeIndicators && album.purgeTag ? purgeIndicatorColor(album.purgeTag, isDarkMode) : undefined} playCount={playCounts[String(album.release_id)] ?? 0} onOpen={handleDepthsTap} />
          ))}
        </div>
      </div>
    </div>
  );

  /* ─────────────── INSIGHTS card content ─────────────── */
  const InsightsCard = (
    <div className="rounded-[12px] overflow-hidden h-full" style={cardStyle}>
      {/* Section header inside card */}
      <div className="flex items-center justify-between px-[16px] pt-[16px] pb-[12px]">
        <h2
          style={{
            fontSize: "32px",
            fontWeight: 400,
            color: "white",
            fontFamily: "'Manufacturing Consent', serif",
            margin: 0,
          }}
        >
          Insights
        </h2>
        <button
          onClick={() => setScreen("reports")}
          className="cursor-pointer"
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--c-link)",
            fontFamily: "'DM Sans', system-ui, sans-serif",
            background: "none",
            border: "none",
            padding: 0,
          }}
        >
          See All
        </button>
      </div>

      {/* Value & Growth summary */}
      <div
        className="grid grid-cols-2 gap-[1px] mx-[16px] mb-[12px] rounded-[10px] overflow-hidden"
        style={{ backgroundColor: "var(--c-border)" }}
      >
        {/* Collection Value */}
        <button
          onClick={() => setScreen("reports")}
          className="flex flex-col items-center justify-center py-[14px] cursor-pointer transition-opacity hover:opacity-80"
          style={{
            backgroundColor: "var(--c-surface-alt)",
            border: "none",
          }}
        >
          <span
            style={{
              fontSize: "24px",
              fontWeight: 700,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              color: hasCollectionValue ? "#009A32" : "var(--c-text-muted)",
              letterSpacing: "-0.5px",
              lineHeight: 1.1,
            }}
          >
            {hasCollectionValue ? formatCurrency(collectionValue!.median) : "\u2014"}
          </span>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 500,
              color: "var(--c-text-muted)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              marginTop: "4px",
            }}
          >
            {hasCollectionValue ? "Est. collection value" : "Value unavailable"}
          </span>
        </button>

        {/* Growth */}
        <button
          onClick={() => setScreen("reports")}
          className="flex flex-col items-center justify-center py-[14px] cursor-pointer transition-opacity hover:opacity-80"
          style={{
            backgroundColor: "var(--c-surface-alt)",
            border: "none",
          }}
        >
          <span className="flex items-center gap-[4px]">
            <TrendingUp size={16} style={{ color: isDarkMode ? "#ACDEF2" : "#0078B4" }} />
            <span
              style={{
                fontSize: "24px",
                fontWeight: 700,
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                color: "var(--c-text)",
                letterSpacing: "-0.5px",
                lineHeight: 1.1,
              }}
            >
              {recentGrowthCount}
            </span>
          </span>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 500,
              color: "var(--c-text-muted)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              marginTop: "4px",
            }}
          >
            Added last 3 months
          </span>
        </button>
      </div>

      {/* Unrated + No play recorded — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        <InsightRow
          icon={<Broom size={16} style={{ color: "var(--c-text-muted)" }} />}
          label={`${unratedCount} record${unratedCount !== 1 ? "s" : ""} still unrated`}
          isDarkMode={isDarkMode}
          onTap={() => {
            setPurgeFilter("unrated");
            setScreen("purge");
          }}
          showDivider={false}
        />

        <InsightRow
          icon={<Disc3 size={16} style={{ color: "var(--c-text-muted)" }} />}
          label={`${neverPlayedCount} record${neverPlayedCount !== 1 ? "s" : ""} with no play recorded`}
          isDarkMode={isDarkMode}
          onTap={() => {
            setNeverPlayedFilter(true);
            setScreen("crate");
          }}
          showDivider={false}
        />
      </div>

    </div>
  );

  /* ─────────────── PURGE TRACKER card content ─────────────── */

  const PurgeTrackerCard = (
    <div
      className="w-full rounded-[12px] overflow-hidden text-left h-full"
      style={{
        ...cardStyle,
        padding: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Zone 1: Stats Bar ── */}
      <div className="px-[16px] pt-[16px]">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <h2
            style={{
              fontSize: "32px",
              fontWeight: 400,
              color: "white",
              fontFamily: "'Manufacturing Consent', serif",
              margin: 0,
            }}
          >
            Purge Tracker
          </h2>
          <button
            onClick={() => setScreen("purge")}
            className="cursor-pointer"
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--c-link)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              background: "none",
              border: "none",
              padding: 0,
            }}
          >
            Open Purge
          </button>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: "4px",
            borderRadius: "2px",
            backgroundColor: "var(--c-chip-bg)",
            margin: "10px 0 8px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: "2px",
              backgroundColor: "#EBFD00",
              width: `${purgeProgress}%`,
              transition: "width 300ms ease-out",
              minWidth: ratedCount > 0 ? "2px" : "0px",
            }}
          />
        </div>

        {/* Progress label */}
        <p
          style={{
            fontSize: "11px",
            fontWeight: 500,
            color: "var(--c-text-muted)",
            fontFamily: "'DM Sans', system-ui, sans-serif",
            marginBottom: "8px",
          }}
        >
          {ratedCount} of {albums.length} evaluated
        </p>

        {/* Stat chips row */}
        <div className="flex gap-[6px] flex-wrap pb-[12px]">
          {[
            { label: "Keep", count: keepCount, color: purgeTagColor("keep", isDarkMode), filter: "keep" as const },
            { label: "Maybe", count: maybeCount, color: purgeTagColor("maybe", isDarkMode), filter: "maybe" as const },
            { label: "Cut", count: cutCount, color: purgeTagColor("cut", isDarkMode), filter: "cut" as const },
            { label: "Unrated", count: unratedCount, color: purgeTagColor("unrated", isDarkMode), filter: "unrated" as const },
          ].map((chip) => (
            <button
              key={chip.label}
              onClick={() => {
                setPurgeFilter(chip.filter);
                setScreen("purge");
              }}
              className="rounded-full cursor-pointer transition-opacity hover:opacity-80"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 10px",
                fontSize: "11px",
                fontFamily: "'DM Sans', system-ui, sans-serif",
                backgroundColor: "var(--c-chip-bg)",
                border: "none",
                color: chip.color,
              }}
            >
              <span style={{ fontWeight: 700 }}>{chip.count}</span>
              <span style={{ fontWeight: 500 }}>{chip.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Zone 2: Album Evaluator ── */}
      <div
        style={{
          borderTop: "1px solid var(--c-border)",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {purgeComplete ? (
          /* Completion state */
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "32px 24px",
            }}
          >
            <p
              style={{
                fontSize: "16px",
                fontWeight: 500,
                color: "var(--c-text-secondary)",
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                textAlign: "center",
                lineHeight: 1.4,
              }}
            >
              Every record has a verdict. Rare discipline.
            </p>
          </div>
        ) : purgeEvalAlbum ? (
          <>
            {/* ── Mobile layout ── */}
            <div
              className="lg:hidden px-[16px] pt-[14px] pb-[16px]"
              style={{
                opacity: purgeEvalFading ? 0 : 1,
                transition: "opacity 150ms cubic-bezier(0.76, 0, 0.24, 1)",
              }}
            >
              {/* Artwork full width */}
              <img loading="lazy" decoding="async"
                src={purgeEvalAlbum.cover}
                alt={`${purgeEvalAlbum.title} by ${purgeEvalAlbum.artist}`}
                className="w-full aspect-square rounded-[8px] object-cover cursor-pointer"
                {...useSafeTap(() => { setSelectedAlbumId(purgeEvalAlbum.id); setShowAlbumDetail(true); })}
              />
              {/* Metadata */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingTop: "12px" }}>
                <p
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "var(--c-text)",
                    fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                    lineHeight: 1.3,
                    letterSpacing: "-0.2px",
                    display: "block",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    WebkitTextOverflow: "ellipsis",
                    maxWidth: "100%",
                  } as React.CSSProperties}
                >
                  {purgeEvalAlbum.title}
                </p>
                <p
                  style={{
                    fontSize: "13px",
                    fontWeight: 400,
                    color: "var(--c-text-secondary)",
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    lineHeight: 1.35,
                    display: "block",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    WebkitTextOverflow: "ellipsis",
                    maxWidth: "100%",
                  } as React.CSSProperties}
                >
                  {purgeEvalAlbum.artist}
                </p>
                <p
                  style={{
                    fontSize: "11px",
                    fontWeight: 400,
                    color: "var(--c-text-muted)",
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    lineHeight: 1.35,
                  }}
                >
                  {[hasYear(purgeEvalAlbum.year) ? String(purgeEvalAlbum.year) : "", purgeEvalAlbum.folder || ""].filter(Boolean).join(" \u00B7 ")}
                </p>
              </div>
              {/* Buttons */}
              <div style={{ marginTop: "12px" }}>
                <PurgeVerdictButtons activeTag={purgeEvalAlbum.purgeTag} onSelect={handlePurgeDecision} isDark={isDarkMode} />
              </div>
            </div>

            {/* ── Desktop layout ── */}
            <div
              className="hidden lg:flex"
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                opacity: purgeEvalFading ? 0 : 1,
                transition: "opacity 150ms cubic-bezier(0.76, 0, 0.24, 1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "16px",
                  padding: "16px 20px",
                  width: "100%",
                }}
              >
                {/* Album cover — 60% width */}
                <img loading="lazy" decoding="async"
                  src={purgeEvalAlbum.cover}
                  alt={`${purgeEvalAlbum.title} by ${purgeEvalAlbum.artist}`}
                  className="cursor-pointer"
                  style={{
                    width: "60%",
                    aspectRatio: "1 / 1",
                    borderRadius: "8px",
                    objectFit: "cover",
                    flexShrink: 0,
                  }}
                  {...useSafeTap(() => { setSelectedAlbumId(purgeEvalAlbum.id); setShowAlbumDetail(true); })}
                />
                {/* Metadata panel */}
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "4px 0 0 4px",
                    overflow: "hidden",
                  }}
                >
                  {/* Text block */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <p
                      className="line-clamp-2"
                      style={{
                        fontSize: "16px",
                        fontWeight: 600,
                        color: "var(--c-text)",
                        fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                        lineHeight: 1.3,
                        letterSpacing: "-0.2px",
                      }}
                    >
                      {purgeEvalAlbum.title}
                    </p>
                    <p
                      style={{
                        fontSize: "13px",
                        fontWeight: 400,
                        color: "var(--c-text-secondary)",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        lineHeight: 1.35,
                        display: "block",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        WebkitTextOverflow: "ellipsis",
                        maxWidth: "100%",
                      } as React.CSSProperties}
                    >
                      {purgeEvalAlbum.artist}
                    </p>
                    <p
                      style={{
                        fontSize: "11px",
                        fontWeight: 400,
                        color: "var(--c-text-muted)",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        lineHeight: 1.35,
                        marginTop: "2px",
                      }}
                    >
                      {[hasYear(purgeEvalAlbum.year) ? String(purgeEvalAlbum.year) : "", purgeEvalAlbum.folder || ""].filter(Boolean).join(" \u00B7 ")}
                    </p>
                  </div>
                  {/* Button row */}
                  <div style={{ width: "100%", marginTop: "12px" }}>
                    <PurgeVerdictButtons activeTag={purgeEvalAlbum.purgeTag} onSelect={handlePurgeDecision} isDark={isDarkMode} />
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );

  /* ─────────────── IDENTITY BLOCK (above the fold) ─────────────── */

  const syncedAgo = formatSyncedAgo(lastSyncedAt);

  // Collection facts — real data doing the personality work. Set once when
  // albums hydrate, stable afterwards. Rendered as a horizontal ticker, or a
  // single centered line under reduced-motion / sparse data.
  const [collectionFacts, setCollectionFacts] = useState<CollectionFact[]>([]);
  useEffect(() => {
    if (collectionFacts.length > 0 || albums.length === 0) return;
    setCollectionFacts(deriveCollectionFacts(albums));
  }, [albums, collectionFacts]);
  const collectionFact = useMemo(
    () => (collectionFacts.length > 0 ? pickRandom(collectionFacts) : null),
    [collectionFacts]
  );
  // Full-width band, no card container — rows separated by hairline
  // dividers. Cells are tappable shortcuts (Collection → crate,
  // Med. Value → reports, Wantlist → wants).
  const statCell = (value: string, label: string, onTap: () => void, opts?: { color?: string; divider?: boolean; padding?: string }) => (
    <button
      key={label}
      onClick={onTap}
      className="flex flex-col items-center justify-center tappable cursor-pointer"
      style={{
        touchAction: "manipulation",
        padding: opts?.padding ?? "12px 8px",
        minWidth: 0,
        borderLeft: opts?.divider ? "1px solid var(--c-border)" : undefined,
      }}
      aria-label={label}
    >
      <span
        style={{
          fontSize: "22px",
          fontWeight: 700,
          fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
          letterSpacing: "-0.3px",
          color: opts?.color || "var(--c-text)",
          lineHeight: 1.15,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--c-text-muted)",
          marginTop: "3px",
        }}
      >
        {label}
      </span>
    </button>
  );

  // Ticker fact — eyebrow label beside its value, matching the stat cell
  // label treatment so the strip reads as part of the same system
  const factSpan = (fact: CollectionFact, key: number | string) => (
    <span key={key} className="flex items-baseline" style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
      <span
        style={{
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--c-text-faint)",
          marginRight: "7px",
        }}
      >
        {fact.label}
      </span>
      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--c-text)" }}>
        {fact.value}
      </span>
      <span aria-hidden style={{ margin: "0 14px", color: "var(--c-text-faint)" }}>·</span>
    </span>
  );

  const identityBlock = (variant: "mobile" | "desktop") => {
    if (!discogsUsername) return null;
    const isMobile = variant === "mobile";
    const avatarSize = isMobile ? 44 : 48;

    const avatarEl = userAvatar ? (
      <img
        src={userAvatar}
        alt={discogsUsername}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: avatarSize, height: avatarSize, border: "2px solid var(--c-border)" }}
      />
    ) : (
      <div
        className="rounded-full flex items-center justify-center flex-shrink-0"
        style={{ width: avatarSize, height: avatarSize, backgroundColor: "var(--c-chip-bg)", border: "2px solid var(--c-border)" }}
      >
        <span style={{ fontSize: isMobile ? "18px" : "20px", fontWeight: 700, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text-secondary)" }}>
          {getInitial(discogsUsername)}
        </span>
      </div>
    );

    const usernameEl = (
      <p
        className="flex-1"
        style={{
          fontSize: isMobile ? "22px" : "26px",
          fontWeight: 700,
          fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
          color: "var(--c-text)",
          letterSpacing: "-0.4px",
          lineHeight: 1.2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          minWidth: 0,
        }}
      >
        {discogsUsername}
      </p>
    );

    const syncControl = (
      <div className="flex flex-col items-end flex-shrink-0" style={{ gap: "1px" }}>
        <button
          onClick={handleSyncNow}
          disabled={syncInFlight}
          className="tappable cursor-pointer flex items-center"
          style={{ gap: "5px", color: "var(--c-link)", touchAction: "manipulation" }}
          aria-label="Sync with Discogs"
        >
          {syncInFlight ? (
            <Disc3 size={14} className="disc-spinner" />
          ) : (
            <RefreshCw size={14} weight="bold" />
          )}
          <span style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.1em" }}>
            {syncInFlight ? "SYNCING" : "SYNC"}
          </span>
        </button>
        {/* No subtext while syncing — the spinner + SYNCING label is enough,
            and a progress line crowds long usernames. Per-page progress
            stays a Settings/loading-screen detail. */}
        {!syncInFlight && syncedAgo && (
          <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>
            Synced {syncedAgo}
          </span>
        )}
      </div>
    );

    const cellPad = isMobile ? "12px 8px" : "4px 22px";
    const statCells = (
      <>
        {statCell(albums.length.toLocaleString(), "In Collection", () => setScreen("crate"), { padding: cellPad })}
        {hasCollectionValue && statCell(formatCurrency(collectionValue!.median), "Med. Value", () => setScreen("reports"), { color: "#009A32", divider: true, padding: cellPad })}
        {statCell(wants.length.toLocaleString(), "In Wantlist", () => setScreen("wants"), { divider: true, padding: cellPad })}
      </>
    );

    // Subtle lift behind the ticker strip — one perceptual step off the
    // canvas in each theme (Oklab-derived, per the color rules)
    const tickerBg = isDarkMode
      ? "oklab(from #0C1A2E calc(l + 0.03) a b)"
      : "oklab(from #F9F9FA calc(l - 0.025) a b)";

    const tickerStrip =
      collectionFacts.length >= 2 && !reduceMotion ? (
        <div
          className="w-full overflow-hidden"
          style={{ borderTop: "1px solid var(--c-border)", backgroundColor: tickerBg, padding: "8px 0" }}
        >
          <div
            className="feed-ticker"
            style={{ display: "flex", width: "max-content", whiteSpace: "nowrap", animationDuration: `${collectionFacts.length * 6}s` }}
          >
            {[...collectionFacts, ...collectionFacts].map((fact, i) => factSpan(fact, i))}
          </div>
        </div>
      ) : collectionFact ? (
        <div
          className="w-full flex items-baseline justify-center overflow-hidden"
          style={{ borderTop: "1px solid var(--c-border)", backgroundColor: tickerBg, padding: "8px 16px", whiteSpace: "nowrap" }}
        >
          <span
            style={{
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--c-text-faint)",
              marginRight: "7px",
              flexShrink: 0,
            }}
          >
            {collectionFact.label}
          </span>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--c-text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
            }}
          >
            {collectionFact.value}
          </span>
        </div>
      ) : null;

    if (isMobile) {
      return (
        <div className="w-full flex flex-col" style={{ borderTop: "1px solid var(--c-border)", borderBottom: "1px solid var(--c-border)" }}>
          {/* Avatar + username | sync */}
          <div className="flex items-center" style={{ gap: "12px", padding: "10px 16px", minWidth: 0 }}>
            {avatarEl}
            {usernameEl}
            {syncControl}
          </div>

          {/* Stats — three equal columns with vertical dividers */}
          <div
            className="w-full grid"
            style={{
              gridTemplateColumns: `repeat(${hasCollectionValue ? 3 : 2}, minmax(0, 1fr))`,
              borderTop: "1px solid var(--c-border)",
            }}
          >
            {statCells}
          </div>

          {tickerStrip}
        </div>
      );
    }

    // Desktop — single header strip: identity left, stats center, sync
    // right, with the ticker running underneath
    return (
      <div className="w-full flex flex-col" style={{ borderTop: "1px solid var(--c-border)", borderBottom: "1px solid var(--c-border)" }}>
        <div className="flex items-center" style={{ gap: "16px", padding: "12px 4px", minWidth: 0 }}>
          {avatarEl}
          {usernameEl}
          <div
            className="flex items-stretch flex-shrink-0"
            style={{ margin: "0 8px", borderLeft: "1px solid var(--c-border)", borderRight: "1px solid var(--c-border)" }}
          >
            {statCells}
          </div>
          {syncControl}
        </div>
        {tickerStrip}
      </div>
    );
  };

  /* ═══════════════════════════════════════════════ RENDER ═══════════════════════════════════════════════ */

  return (
    <div className="flex flex-col h-full">
      {/* ─── NO DISCOGS CONNECTED STATE ─── */}
      {!hasData && !isAuthenticated ? (
        <NoDiscogsCard />
      ) : (
      /* Scrollable content */
      <div ref={scrollRef} className="flex-1 overflow-y-auto overlay-scroll" onScroll={handleFeedScroll}>
        <div className="flex flex-col" style={{ paddingBottom: "calc(24px + var(--nav-clearance, 0px))" }}>

          {/* ═══ DESKTOP LAYOUT ═══ */}
          <div className="hidden lg:block px-[24px] pt-[16px]">
            {hasData && (
              <div className="flex flex-col gap-[44px]">
                {/* 0. Identity block */}
                <div style={{ paddingTop: "8px" }}>{identityBlock("desktop")}</div>

                {/* 1. Shuffle */}
                {DepthsSection}

                {/* 2. Recently Added */}
                {RecentlyAddedSection}

                {/* 3. Following Activity */}
                {FollowingActivityCard}

                {/* 4. Purge Tracker + Insights */}
                <div className="grid grid-cols-2 gap-6">
                  <div>{PurgeTrackerCard}</div>
                  <div>{InsightsCard}</div>
                </div>

                {/* 5. Format Spotlight */}
                <FormatSpotlight onAlbumTap={handleDepthsTap} />

                {/* 6. On the Hunt */}
                {OnTheHuntSection}

                {/* 7. Decades */}
                {DecadesSection}
              </div>
            )}

            {/* Empty state (has token but no albums) */}
            {!hasData && isAuthenticated && <EmptyState setScreen={setScreen} isDarkMode={isDarkMode} />}
          </div>

          {/* ═══ MOBILE STACKED LAYOUT ═══ */}
          <div className="lg:hidden flex flex-col">
            {/* 0. Identity block — full-bleed band, flush under the header
                (its own top hairline reads as the header's bottom edge) */}
            {hasData && (
              <div style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 58px)", paddingBottom: "20px" }}>
                {identityBlock("mobile")}
              </div>
            )}

            {/* 1. Shuffle — leads the feed, fresh picks every load */}
            {hasData && DepthsSection}

            <div className="flex flex-col gap-[48px] pt-[48px]">
              {/* 2. Recently Added */}
              {hasData && (
                <div className="px-[16px]">{RecentlyAddedSection}</div>
              )}

              {/* 3. Following Activity */}
              {hasData && (
                <div className="px-[16px]">{FollowingActivityCard}</div>
              )}

              {/* 4. Purge Tracker */}
              {hasData && (
                <div className="px-[16px]">{PurgeTrackerCard}</div>
              )}

              {/* 5. Format Spotlight */}
              {hasData && <FormatSpotlight onAlbumTap={handleDepthsTap} />}

              {/* 6. On the Hunt */}
              {hasData && OnTheHuntSection}

              {/* 7. Decades */}
              {hasData && DecadesSection}

              {/* 8. Insights */}
              {hasData && (
                <div className="px-[16px]">{InsightsCard}</div>
              )}
            </div>

            {/* Empty state (has token but no albums) */}
            {!hasData && isAuthenticated && <EmptyState setScreen={setScreen} isDarkMode={isDarkMode} />}
          </div>
        </div>
      </div>
      )}

      {/* ── Remove from Wantlist confirmation ── */}
      <AnimatePresence>
        {removeWantConfirm && (
          <SlideOutPanel
            onClose={() => { setRemoveWantConfirm(null); setIsRemovingWant(false); }}
            backdropZIndex={110}
            sheetZIndex={120}
          >
            <div className="flex flex-col items-center px-6 pt-2 pb-4 gap-4">
              <img
                src={removeWantConfirm.albumThumb || removeWantConfirm.albumCover}
                alt={removeWantConfirm.albumTitle}
                className="w-[80px] h-[80px] rounded-[8px] object-cover"
              />
              <div className="text-center" style={{ minWidth: 0, maxWidth: "100%" }}>
                <p style={{
                  fontSize: "16px", fontWeight: 600, color: "var(--c-text)",
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                  lineHeight: 1.3,
                  display: "block", whiteSpace: "nowrap", overflow: "hidden",
                  textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%",
                } as React.CSSProperties}>
                  {removeWantConfirm.albumTitle}
                </p>
                <p className="mt-0.5" style={{
                  fontSize: "14px", fontWeight: 400, color: "var(--c-text-secondary)",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  display: "block", whiteSpace: "nowrap", overflow: "hidden",
                  textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%",
                } as React.CSSProperties}>
                  {removeWantConfirm.albumArtist}
                </p>
              </div>
              <p style={{
                fontSize: "15px", fontWeight: 500, color: "var(--c-text)",
                fontFamily: "'DM Sans', system-ui, sans-serif", textAlign: "center",
              }}>
                Remove from your Wantlist?
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => { setRemoveWantConfirm(null); setIsRemovingWant(false); }}
                  className="flex-1 py-2.5 rounded-[10px] transition-colors cursor-pointer"
                  style={{ fontSize: "14px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setIsRemovingWant(true);
                    try {
                      await removeFromWantList(removeWantConfirm.albumReleaseId);
                      toast.dismiss();
                      toast.info(`"${removeWantConfirm.albumTitle}" removed.`, { duration: 2500 });
                      setRemoveWantConfirm(null);
                    } catch (err: any) {
                      console.error("[Feed] Remove from wantlist failed:", err);
                      toast.error("Remove failed. Try again.");
                    } finally {
                      setIsRemovingWant(false);
                    }
                  }}
                  disabled={isRemovingWant}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[10px] cursor-pointer transition-colors"
                  style={{
                    fontSize: "14px", fontWeight: 600,
                    backgroundColor: "var(--c-destructive)", color: "#FFFFFF",
                    opacity: isRemovingWant ? 0.7 : 1,
                  }}
                >
                  {isRemovingWant ? (
                    <>
                      <Disc3 size={14} className="disc-spinner" />
                      Removing...
                    </>
                  ) : "Remove"}
                </button>
              </div>
            </div>
          </SlideOutPanel>
        )}
      </AnimatePresence>

      {/* ── Add to Wantlist confirmation ── */}
      <AnimatePresence>
        {addWantConfirm && (
          <SlideOutPanel
            onClose={() => { setAddWantConfirm(null); setIsAddingWant(false); }}
            backdropZIndex={110}
            sheetZIndex={120}
          >
            <div className="flex flex-col items-center px-6 pt-2 pb-4 gap-4">
              <img
                src={addWantConfirm.albumThumb || addWantConfirm.albumCover}
                alt={addWantConfirm.albumTitle}
                className="w-[80px] h-[80px] rounded-[8px] object-cover"
              />
              <div className="text-center" style={{ minWidth: 0, maxWidth: "100%" }}>
                <p style={{
                  fontSize: "16px", fontWeight: 600, color: "var(--c-text)",
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                  lineHeight: 1.3,
                  display: "block", whiteSpace: "nowrap", overflow: "hidden",
                  textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%",
                } as React.CSSProperties}>
                  {addWantConfirm.albumTitle}
                </p>
                <p className="mt-0.5" style={{
                  fontSize: "14px", fontWeight: 400, color: "var(--c-text-secondary)",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  display: "block", whiteSpace: "nowrap", overflow: "hidden",
                  textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%",
                } as React.CSSProperties}>
                  {addWantConfirm.albumArtist}
                </p>
              </div>
              <p style={{
                fontSize: "15px", fontWeight: 500, color: "var(--c-text)",
                fontFamily: "'DM Sans', system-ui, sans-serif", textAlign: "center",
              }}>
                Add to your Wantlist?
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => { setAddWantConfirm(null); setIsAddingWant(false); }}
                  className="flex-1 py-2.5 rounded-[10px] transition-colors cursor-pointer"
                  style={{ fontSize: "14px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setIsAddingWant(true);
                    try {
                      await addToWantList({
                        id: `w-feed-${addWantConfirm.albumReleaseId}-${Date.now()}`,
                        release_id: addWantConfirm.albumReleaseId,
                        title: addWantConfirm.albumTitle,
                        artist: addWantConfirm.albumArtist,
                        year: addWantConfirm.albumYear,
                        thumb: addWantConfirm.albumThumb,
                        cover: addWantConfirm.albumCover,
                        label: addWantConfirm.albumLabel,
                        priority: false,
                      });
                      toast.dismiss();
                      toast.info(`"${addWantConfirm.albumTitle}" added to Wantlist.`, { duration: 2500 });
                      setAddWantConfirm(null);
                    } catch (err: any) {
                      console.error("[Feed] Add to wantlist failed:", err);
                      toast.error("Failed to add. Try again.");
                    } finally {
                      setIsAddingWant(false);
                    }
                  }}
                  disabled={isAddingWant}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[10px] cursor-pointer transition-colors"
                  style={{
                    fontSize: "14px", fontWeight: 600,
                    backgroundColor: "#EBFD00", color: "#0C284A",
                    opacity: isAddingWant ? 0.7 : 1,
                  }}
                >
                  {isAddingWant ? (
                    <>
                      <Disc3 size={14} className="disc-spinner" />
                      Adding...
                    </>
                  ) : "Add to Wantlist"}
                </button>
              </div>
            </div>
          </SlideOutPanel>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Empty State ─── */

function EmptyState({ setScreen, isDarkMode }: { setScreen: (s: Screen) => void; isDarkMode: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16">
      <p
        style={{
          fontSize: "15px",
          fontWeight: 500,
          color: "var(--c-text-muted)",
          fontFamily: "'DM Sans', system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        Nothing here yet.
      </p>
      <p
        className="mt-1"
        style={{
          fontSize: "13px",
          fontWeight: 400,
          color: "var(--c-text-muted)",
          fontFamily: "'DM Sans', system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        Sync your Discogs collection to get started.
      </p>
      <button
        onClick={() => setScreen("settings")}
        className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full transition-colors cursor-pointer"
        style={{
          fontSize: "13px",
          fontWeight: 500,
          fontFamily: "'DM Sans', system-ui, sans-serif",
          backgroundColor: isDarkMode ? "rgba(172,222,242,0.15)" : "rgba(172,222,242,0.4)",
          color: isDarkMode ? "#ACDEF2" : "#00527A",
        }}
      >
        Sync your Discogs account →
      </button>
    </div>
  );
}

/* ─── Insight Row ─── */

function InsightRow({
  icon,
  label,
  isDarkMode,
  onTap,
  showDivider,
}: {
  icon: React.ReactNode;
  label: string;
  isDarkMode: boolean;
  onTap: () => void;
  showDivider: boolean;
}) {
  return (
    <div
      className="w-full"
      style={
        showDivider
          ? {
              borderColor: "var(--c-border)",
              borderBottomWidth: "1px",
              borderBottomStyle: "solid",
            }
          : undefined
      }
    >
      <button
        onClick={onTap}
        className="w-full flex items-center gap-[10px] px-[14px] py-[12px] text-left cursor-pointer transition-colors hover:opacity-90"
        style={{ background: "none", border: "none" }}
      >
        <div className="flex-shrink-0">{icon}</div>
        <p
          className="flex-1"
          style={{
            fontSize: "13px",
            fontWeight: 400,
            color: "var(--c-text)",
            fontFamily: "'DM Sans', system-ui, sans-serif",
            lineHeight: 1.35,
          }}
        >
          {label}
        </p>
        <ChevronRight size={16} style={{ color: "var(--c-link)" }} className="flex-shrink-0" />
      </button>
    </div>
  );
}
