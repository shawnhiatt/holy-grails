import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  Heart,
  Scissors,
  Disc3,
  Tag,
  ChevronRight,
  TrendingUp,
  Bookmark,
  GalleryVerticalEnd,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useApp } from "./app-context";
import type { FollowingFeedEntry } from "./app-context";
import type { Screen } from "./app-context";
import { getCachedCollectionValue } from "./discogs-api";
import { NoDiscogsCard } from "./no-discogs-card";
import { purgeIndicatorColor, purgeTagColor, purgeButtonBg, purgeButtonText, purgeToast } from "./purge-colors";
import { EASE_IN_OUT, DURATION_NORMAL } from "./motion-tokens";
import { formatRelativeDate } from "./last-played-utils";
import { DepthsAlbumCard } from "./depths-album-card";
import { WantlistHeartButton } from "./wantlist-heart-button";
import { SlideOutPanel } from "./slide-out-panel";
import { formatActivityDate, getInitial } from "../utils/format";
import { FormatSpotlight } from "./format-spotlight";
import { DominantColorCard } from "./dominant-color-card";

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/* ─── Helpers ─── */

function getTimeBucket(): "morning" | "afternoon" | "evening" | "lateNight" {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "lateNight";
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ── Welcome greeting — time-of-day bucketed, stable per calendar day ── */

const welcomeGreetings: Record<string, string[]> = {
  morning: [
    "Good morning, [username].",
    "Rise and shine, [username].",
    "Morning, [username]. Time to put something on.",
  ],
  afternoon: [
    "Good afternoon, [username].",
    "Afternoon, [username].",
    "Hope your day's going well, [username].",
  ],
  evening: [
    "Good evening, [username].",
    "Evening, [username].",
    "Wind down with something good, [username].",
  ],
  lateNight: [
    "Still up, [username]?",
    "Late night listening, [username]?",
    "Good night, [username]. One more record.",
  ],
};

function getWelcomeGreeting(bucket: string, username: string): string {
  const pool = welcomeGreetings[bucket] ?? welcomeGreetings.afternoon;
  const dayIndex = new Date().getDate() % pool.length;
  return pool[dayIndex].replace(/\[username\]/g, username);
}

/* ── Decades section flavor headers ── */

const decadeFlavor: Record<string, string> = {
  "1950s": "Your 1950s Records: Back When It All Started",
  "1960s": "Your 1960s Records: The Golden Era",
  "1970s": "Your 1970s Records: Peak Vinyl",
  "1980s": "Your 1980s Records: Big Sounds, Big Hair",
  "1990s": "Your 1990s Records: Peak '90s Energy",
  "2000s": "Your 2000s Records: The Comeback Era",
  "2010s": "Your 2010s Records: The Revival",
  "2020s": "Your 2020s Records: Fresh Pressed",
};

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

function buildFeedActivity(feedEntries: FollowingFeedEntry[], max: number, avatarMap?: Map<string, string>): FeedActivity[] {
  const items: FeedActivity[] = [];
  for (const entry of feedEntries) {
    if (entry.recent_albums.length === 0) continue;
    const sorted = [...entry.recent_albums]
      .sort((a, b) => (b.dateAdded || "").localeCompare(a.dateAdded || ""))
      .slice(0, 4);
    sorted.forEach((album) => {
      items.push({
        id: `feed-${entry.followed_username}-${album.release_id}`,
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
    openSessionPicker,
    isAlbumInAnySession,
    hidePurgeIndicators,
    addToWantList,
    removeFromWantList,
    discogsUsername,
    setPurgeTag,
    isSyncing,
    followingAvatars,
    setSelectedWantItem,
    toggleWantPriority,
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
    if (unrated.length > 0) return unrated[Math.floor(Math.random() * unrated.length)].id;
    const maybes = albums.filter((a) => a.purgeTag === "maybe");
    if (maybes.length > 0) return maybes[Math.floor(Math.random() * maybes.length)].id;
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

    const [decade, decadeAlbums] = eligible[Math.floor(Math.random() * eligible.length)];
    // Shuffle and take up to 10
    const shuffled = [...decadeAlbums].sort(() => Math.random() - 0.5).slice(0, 10);
    const header = decadeFlavor[decade] ?? `Your ${decade} Records`;

    return { decade, header, albums: shuffled };
  });

  // From the Depths — 10 random albums, reshuffled every mount
  const [depthsAlbums] = useState(() => {
    if (albums.length === 0) return [];
    const shuffled = [...albums].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(10, shuffled.length));
  });

  // On the Hunt — shuffled wantlist items, weighted toward priority
  const [huntAlbums] = useState(() => {
    if (wants.length === 0) return [];
    // Weight priority items: duplicate them so they appear more often in shuffle
    const weighted = wants.flatMap((w) => (w.priority ? [w, w] : [w]));
    const seen = new Set<number>();
    const shuffled = [...weighted].sort(() => Math.random() - 0.5).filter((w) => {
      if (seen.has(w.release_id)) return false;
      seen.add(w.release_id);
      return true;
    });
    return shuffled.slice(0, 6);
  });

  const followingActivity = useMemo(() => buildFeedActivity(followingFeed, 5, followingAvatars), [followingFeed, followingAvatars]);

  const unratedCount = useMemo(
    () => albums.filter((a) => !a.purgeTag).length,
    [albums]
  );

  const neverPlayedCount = useMemo(
    () => albums.filter((a) => !lastPlayed[a.id]).length,
    [albums, lastPlayed]
  );

  const cutPileValue = useMemo(() => {
    const cutAlbums = albums.filter((a) => a.purgeTag === "cut");
    // Sum pricePaid as a rough estimate for cut pile value
    let total = 0;
    for (const a of cutAlbums) {
      const match = a.pricePaid?.match(/[\d.]+/);
      if (match) total += parseFloat(match[0]);
    }
    return total;
  }, [albums]);

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

  // Recommended album — pick based on time-of-day weighting
  const recommendedAlbum = useMemo(() => {
    if (albums.length === 0) return null;
    const bucket = getTimeBucket();
    const depthsIds = new Set(depthsAlbums.map((a) => a.id));

    // Score albums by time-of-day relevance
    const moodFolders: Record<string, string[]> = {
      morning: ["Rock", "Pop", "Jazz", "Soul", "Funk"],
      afternoon: [], // any folder
      evening: ["Jazz", "Blues", "Electronic", "Hip Hop", "Hip-Hop/Rap", "Ambient", "R&B"],
      lateNight: [], // favor never-played
    };

    const candidates = albums.filter((a) => !depthsIds.has(a.id));
    if (candidates.length === 0) return null;

    // Build scored list
    const scored = candidates.map((a) => {
      let score = 1;
      const neverPlayed = !lastPlayed[a.id];
      const addedDate = new Date(a.dateAdded);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const isOld = addedDate < sixMonthsAgo;

      if (bucket === "lateNight" && neverPlayed) score += 5;
      if (bucket === "evening" && neverPlayed) score += 2;

      const folders = moodFolders[bucket];
      if (folders.length > 0 && a.folder) {
        const folderLower = a.folder.toLowerCase();
        if (folders.some((f) => folderLower.includes(f.toLowerCase()))) score += 3;
      }

      if (neverPlayed && isOld) score += 2;
      if (neverPlayed) score += 1;

      return { album: a, score };
    });

    // Pick from top-scored candidates with randomness
    scored.sort((a, b) => b.score - a.score);
    const topScore = scored[0].score;
    const topCandidates = scored.filter((s) => s.score >= topScore - 1);
    const picked = pickRandom(topCandidates);

    return picked.album;
  }, [albums, lastPlayed, depthsAlbums]);

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
  const welcomeGreeting = useMemo(() => {
    if (!discogsUsername) return "";
    const bucket = getTimeBucket();
    return getWelcomeGreeting(bucket, discogsUsername);
  }, [discogsUsername]);

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

  const DepthsSection = depthsAlbums.length > 0 ? (
    <div>
      {/* Section header */}
      <div className="px-[16px] lg:px-0 mb-[10px]">
        <h2 style={sectionTitleStyle}>From the Depths</h2>
        <p
          style={{
            fontSize: "13px",
            fontWeight: 400,
            color: "var(--c-text-secondary)",
            fontFamily: "'DM Sans', system-ui, sans-serif",
            marginTop: "2px",
            lineHeight: 1.4,
          }}
        >
          Remember these gems from your collection?
        </p>
      </div>

      {/* Mobile: 2x2 grid */}
      <div className="lg:hidden px-[16px]">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "12px",
          }}
        >
          {depthsAlbums.slice(0, 4).map((album) => (
            <DepthsAlbumCard
              key={`depths-feed-${album.id}`}
              album={album}
              onTap={handleDepthsTap}
              compact
              dominantColor
              overlay={
                <WantlistHeartButton
                  releaseId={album.release_id}
                  masterId={album.master_id}
                  title={album.title}
                  artist={album.artist}
                  cover={album.cover}
                  thumb={album.thumb}
                  year={album.year}
                  label={album.label}
                  variant="overlay"
                />
              }
            />
          ))}
        </div>
      </div>

      {/* Desktop: 3x3 grid */}
      <div className="hidden lg:block">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px",
          }}
        >
          {depthsAlbums.slice(0, 9).map((album) => (
            <DepthsAlbumCard
              key={`depths-desk-${album.id}`}
              album={album}
              onTap={handleDepthsTap}
              dominantColor
              overlay={
                <WantlistHeartButton
                  releaseId={album.release_id}
                  masterId={album.master_id}
                  title={album.title}
                  artist={album.artist}
                  cover={album.cover}
                  thumb={album.thumb}
                  year={album.year}
                  label={album.label}
                  variant="overlay"
                />
              }
            />
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
        <h2 style={sectionTitleStyle}>{decadesSpotlight.header}</h2>
        <p
          style={{
            fontSize: "13px",
            fontWeight: 400,
            color: "var(--c-text-secondary)",
            fontFamily: "'DM Sans', system-ui, sans-serif",
            marginTop: "2px",
            lineHeight: 1.4,
          }}
        >
          Highlighting a decade from your collection.
        </p>
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
                overlay={
                  <WantlistHeartButton
                    releaseId={album.release_id}
                    masterId={album.master_id}
                    title={album.title}
                    artist={album.artist}
                    cover={album.cover}
                    thumb={album.thumb}
                    year={album.year}
                    label={album.label}
                    variant="overlay"
                  />
                }
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
              overlay={
                <WantlistHeartButton
                  releaseId={album.release_id}
                  masterId={album.master_id}
                  title={album.title}
                  artist={album.artist}
                  cover={album.cover}
                  thumb={album.thumb}
                  year={album.year}
                  label={album.label}
                  variant="overlay"
                />
              }
            />
          ))}
        </div>
      </div>
    </div>
  ) : null;

  /* ─────────────── SHARED ALBUM CARD (used by Recently Added + This Week) ─────────────── */
  const RecentAlbumCard = ({ album, width }: { album: typeof albums[0]; width?: string }) => {
    const purgeColor = album.purgeTag ? purgeIndicatorColor(album.purgeTag, isDarkMode) : undefined;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          setSelectedAlbumId(album.id);
          setShowAlbumDetail(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedAlbumId(album.id);
            setShowAlbumDetail(true);
          }
        }}
        className="rounded-[10px] overflow-hidden group focus:outline-none text-left tappable transition-all cursor-pointer"
        style={{
          width: width || undefined,
          flexShrink: width ? 0 : undefined,
          backgroundColor: "var(--c-surface)",
          border: `1px solid ${isDarkMode ? "var(--c-border-strong)" : "#D2D8DE"}`,
          boxShadow: "var(--c-card-shadow)",
        }}
      >
        {/* Cover art */}
        <div className="relative aspect-square overflow-hidden">
          <img
            src={album.cover}
            alt={`${album.artist} - ${album.title}`}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            draggable={false}
          />
          {!hidePurgeIndicators && album.purgeTag && purgeColor && (
            <div
              className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full shadow-sm"
              style={{ backgroundColor: purgeColor }}
            />
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
  };

  /* ─────────────── THIS WEEK IN YOUR COLLECTION ─────────────── */
  /* ─────────────── ON THE HUNT — wantlist section ─────────────── */
  const OnTheHuntSection = huntAlbums.length > 0 ? (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between px-[16px] lg:px-0 mb-[12px]">
        <div>
          <h2 style={sectionTitleStyle}>On the Hunt</h2>
          <p
            style={{
              fontSize: "13px",
              fontWeight: 400,
              color: "var(--c-text-secondary)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              marginTop: "2px",
              lineHeight: 1.4,
            }}
          >
            Select albums from your Wantlist.
          </p>
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
              onClick={() => setSelectedWantItem(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedWantItem(item);
                }
              }}
              className="rounded-[10px] overflow-hidden group focus:outline-none text-left tappable transition-all cursor-pointer"
              style={{
                flex: "0 0 145px",
                scrollSnapAlign: "start",
                backgroundColor: "var(--c-surface)",
                border: `1px solid ${isDarkMode ? "var(--c-border-strong)" : "#D2D8DE"}`,
                boxShadow: "var(--c-card-shadow)",
              }}
            >
              {/* Cover art */}
              <div className="relative aspect-square overflow-hidden">
                <img
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
                    <Zap size={12} fill="#EEFC0F" color="#EEFC0F" />
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
            onClick={() => setSelectedWantItem(item)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSelectedWantItem(item);
              }
            }}
            className="rounded-[10px] overflow-hidden group focus:outline-none text-left tappable transition-all cursor-pointer"
            style={{
              backgroundColor: "var(--c-surface)",
              border: `1px solid ${isDarkMode ? "var(--c-border-strong)" : "#D2D8DE"}`,
              boxShadow: "var(--c-card-shadow)",
            }}
          >
            {/* Cover art */}
            <div className="relative aspect-square overflow-hidden">
              <img
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
                  <Zap size={12} fill="#EEFC0F" color="#EEFC0F" />
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
  const FollowingActivityCard = (
    <div className="rounded-[12px] overflow-hidden h-full" style={cardStyle}>
      {/* Section header inside card */}
      <div className="flex items-center justify-between px-[16px] pt-[16px] pb-[12px]">
        <h2 style={sectionTitleStyle}>Following Activity</h2>
        {hasFollowing && (
          <button
            onClick={() => setScreen("following")}
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

      {hasFollowing && followingActivity.length > 0 ? (
        <>
          {followingActivity.map((item) => {
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
                <div className="relative flex-shrink-0" style={{ width: "60px", height: "60px" }}>
                  <img
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
                      <img
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
                    {" added "}
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

                {/* Heart / collection icon indicator */}
                {inCollection ? (
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
                          <Heart
                            size={18}
                            fill={inWantList ? "#EBFD00" : "none"}
                            color={inWantList ? "#EBFD00" : "var(--c-text-faint)"}
                            strokeWidth={inWantList ? 0 : 1.5}
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
                )}
              </div>
            );
          })}
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
            No activity yet from collectors you follow.
          </p>
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
        </div>
      )}
    </div>
  );

  /* ─────────────── RECENTLY ADDED section ─────────────── */
  const RecentlyAddedSection = (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-[12px]">
        <h2 style={sectionTitleStyle}>Recently Added</h2>
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
          <RecentAlbumCard key={album.id} album={album} />
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
            <RecentAlbumCard key={album.id} album={album} width="145px" />
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
        <h2 style={sectionTitleStyle}>Insights</h2>
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
          icon={<Scissors size={16} style={{ color: "var(--c-text-muted)" }} />}
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

      {/* Cut pile value */}
      {cutPileValue > 0 && (
        <InsightRow
          icon={<Tag size={16} style={{ color: "var(--c-text-muted)" }} />}
          label={`Cut pile worth ~${formatCurrency(cutPileValue)}`}
          isDarkMode={isDarkMode}
          onTap={() => {
            setPurgeFilter("cut");
            setScreen("purge");
          }}
          showDivider={false}
        />
      )}
    </div>
  );

  /* ─────────────── PURGE TRACKER card content ─────────────── */

  const purgeButtonStyle = (variant: "keep" | "cut" | "maybe"): React.CSSProperties => {
    return {
      flex: 1,
      height: "36px",
      borderRadius: "10px",
      border: "none",
      fontSize: "13px",
      fontWeight: 600,
      fontFamily: "'DM Sans', system-ui, sans-serif",
      backgroundColor: purgeButtonBg(variant, isDarkMode),
      color: purgeButtonText(variant, isDarkMode),
      cursor: "pointer",
    };
  };

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
          <h2 style={sectionTitleStyle}>Purge Tracker</h2>
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
              <img
                src={purgeEvalAlbum.cover}
                alt={`${purgeEvalAlbum.title} by ${purgeEvalAlbum.artist}`}
                className="w-full aspect-square rounded-[8px] object-cover cursor-pointer"
                onClick={() => { setSelectedAlbumId(purgeEvalAlbum.id); setShowAlbumDetail(true); }}
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
                  {purgeEvalAlbum.year}{purgeEvalAlbum.folder ? ` \u00B7 ${purgeEvalAlbum.folder}` : ""}
                </p>
              </div>
              {/* Buttons */}
              <div style={{ display: "flex", flexDirection: "row", gap: "8px", marginTop: "12px" }}>
                <button onClick={() => handlePurgeDecision("keep")} className="tappable" style={purgeButtonStyle("keep")}>Keep</button>
                <button onClick={() => handlePurgeDecision("maybe")} className="tappable" style={purgeButtonStyle("maybe")}>Maybe</button>
                <button onClick={() => handlePurgeDecision("cut")} className="tappable" style={purgeButtonStyle("cut")}>Cut</button>
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
                <img
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
                  onClick={() => { setSelectedAlbumId(purgeEvalAlbum.id); setShowAlbumDetail(true); }}
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
                      {purgeEvalAlbum.year}{purgeEvalAlbum.folder ? ` \u00B7 ${purgeEvalAlbum.folder}` : ""}
                    </p>
                  </div>
                  {/* Button row */}
                  <div style={{ display: "flex", flexDirection: "row", gap: "8px", width: "100%", marginTop: "12px" }}>
                    <button onClick={() => handlePurgeDecision("keep")} className="tappable" style={purgeButtonStyle("keep")}>Keep</button>
                    <button onClick={() => handlePurgeDecision("maybe")} className="tappable" style={purgeButtonStyle("maybe")}>Maybe</button>
                    <button onClick={() => handlePurgeDecision("cut")} className="tappable" style={purgeButtonStyle("cut")}>Cut</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );

  /* ─────────────── RECOMMENDED CARD ─────────────── */

  /** Standard card for recommended album — uses dominant color extraction */
  const RecommendedCard = recommendedAlbum ? (() => {
    const album = recommendedAlbum;

    return (
      <DominantColorCard
        imageUrl={album.cover}
        className="cursor-pointer group"
        onClick={() => { setSelectedAlbumId(album.id); setShowAlbumDetail(true); }}
        style={{ display: "flex", flexDirection: "column" }}
      >
        {/* Cover art */}
        <div className="relative aspect-square overflow-hidden" style={{ borderRadius: "12px 12px 0 0" }}>
          <img
            src={album.cover}
            alt={`${album.artist} - ${album.title}`}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            draggable={false}
          />
          {/* Bookmark button — bottom right of artwork */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", bottom: "10px", right: "10px", zIndex: 2 }}
          >
            <button
              onClick={() => openSessionPicker(album.id)}
              className="tappable"
              aria-label="Add to session"
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "rgba(0, 0, 0, 0.4)",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
                border: "none",
              }}
            >
              <Bookmark
                size={16}
                color={isAlbumInAnySession(album.id) ? "#EBFD00" : "#FFFFFF"}
                {...(isAlbumInAnySession(album.id) ? { fill: "currentColor" } : {})}
              />
            </button>
          </div>
        </div>

        {/* Metadata — uses dominant color CSS vars */}
        <div className="px-3 pt-[10px] pb-3" style={{ minWidth: 0, overflow: "hidden" }}>
          <p
            style={{
              fontSize: "13px",
              fontWeight: 500,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              color: "var(--dc-text-secondary, var(--c-text-secondary))",
              lineHeight: 1.35,
              marginBottom: "6px",
            }}
          >
            How about you give this a spin?
          </p>
          <p
            style={{
              fontSize: "18px",
              fontWeight: 700,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              color: "var(--dc-text, var(--c-text))",
              lineHeight: 1.2,
              letterSpacing: "-0.3px",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              maxWidth: "100%",
            } as React.CSSProperties}
          >
            {album.title}
          </p>
          <p
            className="mt-[3px]"
            style={{
              fontSize: "14px",
              fontWeight: 400,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              color: "var(--dc-text-secondary, var(--c-text-secondary))",
              lineHeight: 1.3,
              display: "block",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              WebkitTextOverflow: "ellipsis",
              maxWidth: "100%",
            } as React.CSSProperties}
          >
            {album.artist}{album.year ? ` \u00B7 ${album.year}` : ""}
          </p>
        </div>
      </DominantColorCard>
    );
  })() : null;

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
              <div className="flex flex-col gap-[32px]">
                {/* 0. Welcome greeting */}
                {welcomeGreeting && (
                  <p
                    style={{
                      fontSize: "48px",
                      fontWeight: 700,
                      fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                      color: "var(--c-text)",
                      lineHeight: 1.15,
                      letterSpacing: "-0.5px",
                      paddingTop: "8px",
                    }}
                  >
                    {welcomeGreeting}
                  </p>
                )}

                {/* 1. Recommended */}
                {RecommendedCard}

                {/* 2. Recently Added */}
                {RecentlyAddedSection}

                {/* 3. Format Spotlight */}
                <FormatSpotlight onAlbumTap={handleDepthsTap} />

                {/* 5. Following Activity */}
                {FollowingActivityCard}

                {/* 6. On the Hunt */}
                {OnTheHuntSection}

                {/* 7. Decades */}
                {DecadesSection}

                {/* 8. From the Depths */}
                {DepthsSection}

                {/* 9. Purge Tracker + 10. Insights */}
                <div className="grid grid-cols-2 gap-6">
                  <div>{PurgeTrackerCard}</div>
                  <div>{InsightsCard}</div>
                </div>
              </div>
            )}

            {/* Empty state (has token but no albums) */}
            {!hasData && isAuthenticated && <EmptyState setScreen={setScreen} isDarkMode={isDarkMode} />}
          </div>

          {/* ═══ MOBILE STACKED LAYOUT ═══ */}
          <div className="lg:hidden flex flex-col">
            {/* 0. Welcome greeting — below header clearance */}
            {hasData && welcomeGreeting && (
              <div style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 74px)", paddingLeft: "16px", paddingRight: "16px", paddingBottom: "20px" }}>
                <p
                  style={{
                    fontSize: "36px",
                    fontWeight: 700,
                    fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                    color: "var(--c-text)",
                    lineHeight: 1.15,
                    letterSpacing: "-0.5px",
                  }}
                >
                  {welcomeGreeting}
                </p>
              </div>
            )}

            {/* 1. Recommended — standard card */}
            {hasData && (
              <div className="px-[16px]">{RecommendedCard}</div>
            )}

            <div className="flex flex-col gap-[36px] pt-[36px]">
              {/* 2. Recently Added */}
              {hasData && (
                <div className="px-[16px]">{RecentlyAddedSection}</div>
              )}

              {/* 3. Format Spotlight */}
              {hasData && <FormatSpotlight onAlbumTap={handleDepthsTap} />}

              {/* 5. Following Activity */}
              {hasData && (
                <div className="px-[16px]">{FollowingActivityCard}</div>
              )}

              {/* 6. On the Hunt */}
              {hasData && OnTheHuntSection}

              {/* 7. Decades */}
              {hasData && DecadesSection}

              {/* 8. From the Depths */}
              {hasData && DepthsSection}

              {/* 9. Purge Tracker */}
              {hasData && (
                <div className="px-[16px]">{PurgeTrackerCard}</div>
              )}

              {/* 10. Insights */}
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