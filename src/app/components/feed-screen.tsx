import { useMemo, useState, useCallback } from "react";
import {
  Heart,
  Scissors,
  Disc3,
  Tag,
  ChevronRight,
  TrendingUp,
  Bookmark,
} from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useApp } from "./app-context";
import type { Friend } from "./discogs-api";
import type { Screen } from "./app-context";
import { getCachedCollectionValue } from "./discogs-api";
import { NoDiscogsCard } from "./no-discogs-card";
import { purgeIndicatorColor, purgeTagColor, purgeButtonBg, purgeButtonText, purgeToast } from "./purge-colors";
import { EASE_IN_OUT, DURATION_NORMAL } from "./motion-tokens";
import { formatRelativeDate } from "./last-played-utils";
import { DepthsAlbumCard } from "./depths-album-card";

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

function formatAddedMonthYear(iso: string): string {
  const d = new Date(iso);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `Added ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/* ── Recommended card headings — time-of-day bucketed ── */

const recommendedHeadingsByBucket: Record<string, string[]> = {
  morning: [
    "Good morning. This one's been waiting.",
    "Morning. Pull this out before the day gets away from you.",
    "Early start. Good call. Play this.",
    "You didn't buy all these records to look at them. Start here.",
    "Morning pick. You've had this one since [added year].",
    "The day's yours. Begin with this.",
    "Side A. Right now.",
    "A good morning deserves a good record. Here's one.",
    "Rise and spin. This one first.",
    "You've owned this since [added year]. Morning seems right.",
  ],
  afternoon: [
    "This one's been sitting on the shelf too long.",
    "Afternoon. No excuse not to play this.",
    "Pull this one out. You know you've been meaning to.",
    "This record is overdue. Today's the day.",
    "You bought this for a reason. Remember what it was.",
    "Mid-session energy. This one delivers.",
    "Not just for display. Put it on.",
    "This one holds up. Trust the collection.",
    "The afternoon belongs to records like this.",
    "Give this one the listen it deserves.",
  ],
  evening: [
    "Tonight's the night for this one.",
    "This one was made for evenings. Full listen. No skipping.",
    "The needle hasn't touched this in a while. Fix that.",
    "Good evening. This one's ready when you are.",
    "Front to back. Tonight.",
    "You've had this since [added year]. It's waited long enough.",
    "This one's been patient. Your turn.",
    "The evening belongs to this record.",
    "Don't overthink it. Play this tonight.",
    "Side A is waiting. So is side B.",
  ],
  lateNight: [
    "Still up? Good. So is this record.",
    "Late night, this one. No question.",
    "Everyone else is asleep. Perfect time for this.",
    "The after-hours pick. You know you want to.",
    "Nobody else is awake. Play this one loud.",
    "Late night crate logic. This one wins.",
    "This record has been waiting for exactly this moment.",
    "It's late. This one fits.",
    "The best listening happens after midnight. Start here.",
    "You didn't stay up this late to not play anything.",
  ],
};

function getRecommendedHeading(bucket: string, addedYear?: string): string {
  const pool = recommendedHeadingsByBucket[bucket] ?? recommendedHeadingsByBucket.afternoon;
  const eligible = addedYear
    ? pool
    : pool.filter((h) => !h.includes("[added year]"));
  const pick = pickRandom(eligible.length > 0 ? eligible : pool);
  return addedYear ? pick.replace(/\[added year\]/g, addedYear) : pick;
}

function formatActivityDate(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatMonthYear(iso: string): string {
  const d = new Date(iso);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `Added to collection ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getInitial(username: string): string {
  return username.charAt(0).toUpperCase();
}

interface FeedActivity {
  id: string;
  friendId: string;
  friendUsername: string;
  friendAvatar: string;
  albumTitle: string;
  albumArtist: string;
  albumCover: string;
  albumReleaseId: number;
  albumYear: number;
  albumLabel: string;
  date: string;
  displayDate: string;
}

function buildFeedActivity(friends: Friend[], max: number): FeedActivity[] {
  const items: FeedActivity[] = [];
  const recentDates = [
    "2026-02-18", "2026-02-15", "2026-02-12", "2026-02-10",
    "2026-02-07", "2026-02-04", "2026-01-30", "2026-01-26",
    "2026-01-22", "2026-01-18", "2026-01-15", "2026-01-12",
  ];
  for (const friend of friends) {
    if (friend.isPrivate || friend.collection.length === 0) continue;
    const sorted = [...friend.collection]
      .sort((a, b) => (b.dateAdded || "").localeCompare(a.dateAdded || ""))
      .slice(0, 4);
    sorted.forEach((album) => {
      items.push({
        id: `feed-${friend.id}-${album.id}`,
        friendId: friend.id,
        friendUsername: friend.username,
        friendAvatar: friend.avatar,
        albumTitle: album.title,
        albumArtist: album.artist,
        albumCover: album.cover,
        albumReleaseId: album.release_id,
        albumYear: album.year,
        albumLabel: album.label,
        date: recentDates[items.length % recentDates.length] || "2026-01-01",
        displayDate: "",
      });
    });
  }
  items.sort((a, b) => b.date.localeCompare(a.date));
  for (const item of items) {
    item.displayDate = formatActivityDate(item.date);
  }
  return items.slice(0, max);
}

/* ─── Section Header ─── */

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  letterSpacing: "-0.3px",
  color: "var(--c-text)",
  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
};

/* ─── Feed Screen ─── */

export function FeedScreen() {
  const {
    albums,
    wants,
    friends,
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
    discogsUsername,
    setPurgeTag,
  } = useApp();

  // Track items that were just added to want list (for heart animation)
  const [justAddedWantIds, setJustAddedWantIds] = useState<Set<string>>(() => new Set());

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

  // From the Depths — 10 random albums, reshuffled every mount
  const [depthsAlbums] = useState(() => {
    if (albums.length === 0) return [];
    const shuffled = [...albums].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(10, shuffled.length));
  });

  const friendActivity = useMemo(() => buildFeedActivity(friends, 5), [friends]);

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
  const { recommendedAlbum, recommendedHeading } = useMemo(() => {
    if (albums.length === 0) return { recommendedAlbum: null, recommendedHeading: "" };
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
    if (candidates.length === 0) return { recommendedAlbum: null, recommendedHeading: "" };

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

    // Generate heading with [added year] substitution
    const addedYear = picked.album.dateAdded
      ? new Date(picked.album.dateAdded).getFullYear().toString()
      : undefined;
    const heading = getRecommendedHeading(bucket, addedYear);

    return { recommendedAlbum: picked.album, recommendedHeading: heading };
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
    purgeToast(tag, isDarkMode);

    // Crossfade to next album
    setPurgeEvalFading(true);
    setTimeout(() => {
      const next = getNextPurgeAlbum(purgeEvalAlbum.id);
      setPurgeEvalAlbumId(next?.id ?? null);
      setPurgeEvalFading(false);
    }, 150);
  }, [purgeEvalAlbum, setPurgeTag, getNextPurgeAlbum, isDarkMode]);

  const hasData = albums.length > 0;
  const hasFriends = friends.length > 0;

  const cardBg = "var(--c-surface)";
  const cardBorder = isDarkMode ? "var(--c-border-strong)" : "#D2D8DE";

  // Sets for quick lookups in Following Activity heart logic
  const ownReleaseIds = useMemo(() => new Set(albums.map((a) => a.release_id)), [albums]);
  const wantReleaseIds = useMemo(() => new Set(wants.map((w) => w.release_id)), [wants]);

  const handleHeartTap = useCallback(
    (item: FeedActivity) => {
      // Already in collection — no action
      if (ownReleaseIds.has(item.albumReleaseId)) return;
      // Already in want list — navigate to Wants
      if (wantReleaseIds.has(item.albumReleaseId)) {
        setScreen("wants");
        return;
      }
      // Add to want list
      addToWantList({
        id: `w-feed-${item.albumReleaseId}-${Date.now()}`,
        release_id: item.albumReleaseId,
        title: item.albumTitle,
        artist: item.albumArtist,
        year: item.albumYear,
        cover: item.albumCover,
        label: item.albumLabel,
        priority: false,
      });
      setJustAddedWantIds((prev) => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
      toast.dismiss();
      toast.info("Added to your wantlist.", { duration: 2500 });
    },
    [ownReleaseIds, wantReleaseIds, addToWantList, setScreen]
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
        <p style={sectionTitleStyle}>From the Depths</p>
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
          You may have forgotten you own these grails.
        </p>
      </div>

      {/* Mobile: horizontal swipeable carousel */}
      <div className="lg:hidden">
        <style>{`.depths-feed-scroll::-webkit-scrollbar { display: none; }`}</style>
        <div
          className="depths-feed-scroll"
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
          {depthsAlbums.map((album) => (
            <div
              key={`depths-feed-${album.id}`}
              style={{
                flex: "0 0 82%",
                scrollSnapAlign: "start",
                minWidth: 0,
              }}
            >
              <DepthsAlbumCard album={album} onTap={handleDepthsTap} />
            </div>
          ))}
          {/* Spacer div to enforce right padding in scroll container */}
          <div style={{ minWidth: "16px", flexShrink: 0 }} />
        </div>
      </div>

      {/* Desktop: static 3-column grid */}
      <div className="hidden lg:block">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "16px",
          }}
        >
          {depthsAlbums.slice(0, 4).map((album) => (
            <DepthsAlbumCard key={`depths-desk-${album.id}`} album={album} onTap={handleDepthsTap} />
          ))}
        </div>
      </div>
    </div>
  ) : null;

  /* ─────────────── FOLLOWING ACTIVITY card content ─────────────── */
  const FollowingActivityCard = (
    <div className="rounded-[12px] overflow-hidden h-full" style={cardStyle}>
      {/* Section header inside card */}
      <div className="flex items-center justify-between px-[16px] pt-[16px] pb-[12px]">
        <p style={sectionTitleStyle}>Following Activity</p>
        {hasFriends && (
          <button
            onClick={() => setScreen("friends")}
            className="cursor-pointer"
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: isDarkMode ? "#EBFD00" : "#0078B4",
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

      {hasFriends && friendActivity.length > 0 ? (
        <>
          {friendActivity.map((item) => {
            const inCollection = ownReleaseIds.has(item.albumReleaseId);
            const inWantList = wantReleaseIds.has(item.albumReleaseId) || justAddedWantIds.has(item.id);
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
                    src={item.albumCover}
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
                    {item.friendAvatar ? (
                      <img
                        src={item.friendAvatar}
                        alt={item.friendUsername}
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
                        {getInitial(item.friendUsername)}
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
                    <span style={{ fontWeight: 600 }}>{item.friendUsername}</span>
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

                {/* Heart / "In collection" chip */}
                {inCollection ? (
                  <span
                    className="flex-shrink-0 rounded-full"
                    style={{
                      fontSize: "10px",
                      fontWeight: 500,
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      backgroundColor: "var(--c-chip-bg)",
                      color: "var(--c-text-tertiary)",
                      padding: "2px 8px",
                    }}
                  >
                    In collection
                  </span>
                ) : (
                  <button
                    onClick={() => handleHeartTap(item)}
                    className="flex-shrink-0 cursor-pointer tappable"
                    style={{ padding: "4px", background: "none", border: "none" }}
                  >
                    <motion.div
                      key={inWantList ? "filled" : "outline"}
                      initial={justAddedWantIds.has(item.id) ? { scale: 1.25 } : { scale: 0.7 }}
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
                  </button>
                )}
              </div>
            );
          })}
        </>
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
            onClick={() => setScreen("friends")}
            className="cursor-pointer tappable mt-[6px]"
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: isDarkMode ? "#EBFD00" : "#0078B4",
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

  /* ─────────────── RECENTLY ADDED — shared album card ─────────────── */
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

  /* ─────────────── RECENTLY ADDED section ─────────────── */
  const RecentlyAddedSection = (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-[12px]">
        <p style={sectionTitleStyle}>Recently Added</p>
        <button
          onClick={() => setScreen("crate")}
          className="cursor-pointer"
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: isDarkMode ? "#EBFD00" : "#0078B4",
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
        <p style={sectionTitleStyle}>Insights</p>
        <button
          onClick={() => setScreen("reports")}
          className="cursor-pointer"
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: isDarkMode ? "#EBFD00" : "#0078B4",
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
          <p style={sectionTitleStyle}>Purge Tracker</p>
          <button
            onClick={() => setScreen("purge")}
            className="cursor-pointer"
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: isDarkMode ? "#EBFD00" : "#0078B4",
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
            { label: "Cut", count: cutCount, color: purgeTagColor("cut", isDarkMode), filter: "cut" as const },
            { label: "Maybe", count: maybeCount, color: purgeTagColor("maybe", isDarkMode), filter: "maybe" as const },
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
                <button onClick={() => handlePurgeDecision("cut")} className="tappable" style={purgeButtonStyle("cut")}>Cut</button>
                <button onClick={() => handlePurgeDecision("maybe")} className="tappable" style={purgeButtonStyle("maybe")}>Maybe</button>
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
                    <button onClick={() => handlePurgeDecision("cut")} className="tappable" style={purgeButtonStyle("cut")}>Cut</button>
                    <button onClick={() => handlePurgeDecision("maybe")} className="tappable" style={purgeButtonStyle("maybe")}>Maybe</button>
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
  const RecommendedCard = recommendedAlbum ? (() => {
    const album = recommendedAlbum;
    const contextLine = formatAddedMonthYear(album.dateAdded);

    const gradientOverlay = isDarkMode
      ? "linear-gradient(to right, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.5) 40%, rgba(0,0,0,0.0) 100%)"
      : "linear-gradient(to top, rgba(12,40,74,0.72) 0%, rgba(12,40,74,0.4) 50%, rgba(12,40,74,0.0) 100%)";

    const recTextShadow = isDarkMode
      ? "0 1px 8px rgba(0,0,0,0.6), 0 2px 20px rgba(0,0,0,0.4)"
      : "0 1px 6px rgba(12,40,74,0.5), 0 2px 12px rgba(12,40,74,0.3)";

    return (
      <div
        className="rounded-[12px] overflow-hidden cursor-pointer"
        style={{ position: "relative", width: "100%" }}
        onClick={() => { setSelectedAlbumId(album.id); setShowAlbumDetail(true); }}
      >
        {/* Background image */}
        <img
          src={album.cover}
          alt=""
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
          }}
        />
        {/* Gradient overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: gradientOverlay,
          }}
        />
        {/* Content */}
        <div
          className="recommended-card-content"
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            alignItems: "flex-start",
            padding: "20px",
            paddingRight: "72px",
            minHeight: "320px",
            gap: "4px",
          }}
        >
          {/* Heading */}
          <p
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#FFFFFF",
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              lineHeight: 1.3,
              textShadow: recTextShadow,
              maxWidth: "100%",
            }}
          >
            {recommendedHeading}
          </p>
          {/* Album title */}
          <p
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#FFFFFF",
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              lineHeight: 1.25,
              textShadow: recTextShadow,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              maxWidth: "100%",
            } as React.CSSProperties}
          >
            {album.title}
          </p>
          {/* Artist · Year */}
          <p
            style={{
              fontSize: "14px",
              fontWeight: 400,
              color: "rgba(255,255,255,0.8)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              lineHeight: 1.35,
              textShadow: recTextShadow,
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
          {/* Context line */}
          <p
            style={{
              fontSize: "12px",
              fontWeight: 400,
              color: "rgba(255,255,255,0.6)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              lineHeight: 1.35,
              textShadow: recTextShadow,
              display: "block",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              WebkitTextOverflow: "ellipsis",
              maxWidth: "100%",
            } as React.CSSProperties}
          >
            {contextLine}
          </p>
        </div>
        {/* Circular bookmark button */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            bottom: "20px",
            right: "20px",
            zIndex: 2,
          }}
        >
          <button
            onClick={() => openSessionPicker(album.id)}
            className="tappable"
            style={{
              width: "40px",
              height: "40px",
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
              transition: "transform 100ms cubic-bezier(0.25, 1, 0.5, 1)",
            }}
          >
            <Bookmark
              size={18}
              color={isAlbumInAnySession(album.id)
                ? (isDarkMode ? "#ACDEF2" : "#00527A")
                : "#FFFFFF"}
              {...(isAlbumInAnySession(album.id) ? { fill: "currentColor" } : {})}
            />
          </button>
        </div>
      </div>
    );
  })() : null;

  /* ═══════════════════════════════════════════════ RENDER ═══════════════════════════════════════════════ */

  return (
    <div className="flex flex-col h-full">
      <style>{`
        @media (min-width: 1024px) {
          .recommended-card-content {
            min-height: clamp(260px, 22vw, 380px) !important;
            padding: 24px 72px 24px 28px !important;
          }
        }
      `}</style>
      {/* ─── NO DISCOGS CONNECTED STATE ─── */}
      {!hasData && !isAuthenticated ? (
        <NoDiscogsCard />
      ) : (
      /* Scrollable content */
      <div className="flex-1 overflow-y-auto overlay-scroll">
        <div className="flex flex-col" style={{ paddingBottom: "calc(24px + var(--nav-clearance, 0px))" }}>

          {/* ═══ DESKTOP BENTO GRID ═══ */}
          <div className="hidden lg:block px-[24px] pt-[16px]">
            {hasData && (
              <div className="flex flex-col gap-[24px]">
                {/* Recommended Card — full width hero */}
                {RecommendedCard}

                {/* From the Depths — 3-column grid (section handles its own px) */}
                {DepthsSection}

                {/* Following Activity */}
                {FollowingActivityCard}

                {/* Recently Added (full width) */}
                {RecentlyAddedSection}

                {/* Row 3: Insights (1/2) + Purge Tracker (1/2) */}
                <div className="grid grid-cols-2 gap-6">
                  <div>{InsightsCard}</div>
                  <div>{PurgeTrackerCard}</div>
                </div>
              </div>
            )}

            {/* Empty state (has token but no albums) */}
            {!hasData && isAuthenticated && <EmptyState setScreen={setScreen} isDarkMode={isDarkMode} />}
          </div>

          {/* ═══ MOBILE STACKED LAYOUT ═══ */}
          <div className="lg:hidden flex flex-col gap-[28px] pt-[12px]">
            {/* 0. Recommended Card */}
            {hasData && RecommendedCard && (
              <div className="px-[16px]">{RecommendedCard}</div>
            )}

            {/* 1. From the Depths — carousel */}
            {hasData && DepthsSection}

            {/* 2. Following Activity */}
            {hasData && (
              <div className="px-[16px]">{FollowingActivityCard}</div>
            )}

            {/* 3. Recently Added */}
            {hasData && (
              <div className="px-[16px]">{RecentlyAddedSection}</div>
            )}

            {/* 4. Insights */}
            {hasData && (
              <div className="px-[16px]">{InsightsCard}</div>
            )}

            {/* 5. Purge Tracker */}
            {hasData && (
              <div className="px-[16px]">{PurgeTrackerCard}</div>
            )}

            {/* Empty state (has token but no albums) */}
            {!hasData && isAuthenticated && <EmptyState setScreen={setScreen} isDarkMode={isDarkMode} />}
          </div>
        </div>
      </div>
      )}
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
        <ChevronRight size={16} style={{ color: isDarkMode ? "#EBFD00" : "#0078B4" }} className="flex-shrink-0" />
      </button>
    </div>
  );
}