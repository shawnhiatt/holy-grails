import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type React from "react";
import {
  UserPlus, ArrowLeft, Search, UserMinus, Lock,
  Disc3, Users, Grid2x2, List, ExternalLink, Grid3x3,
  Heart, X, GalleryVerticalEnd,
} from "lucide-react";
import { motion, AnimatePresence, useMotionValue, type PanInfo } from "motion/react";
import { toast } from "sonner";
import { useApp, type ViewMode, type Screen, type FollowingFeedEntry } from "./app-context";
import { ViewModeToggle } from "./crate-browser";
import type { Album, FollowedUser, FeedAlbum, WantItem } from "./discogs-api";
import { EASE_IN_OUT, EASE_OUT, EASE_IN, DURATION_NORMAL, DURATION_FAST, DURATION_SLOW } from "./motion-tokens";
import { AlbumArtwork, type ArtworkGridItem } from "./album-artwork-grid";
import { DepthsAlbumCard } from "./depths-album-card";
import { WantlistHeartButton } from "./wantlist-heart-button";
import { SlideOutPanel } from "./slide-out-panel";
import { formatActivityDate, formatCollectionSince, getInitial } from "../utils/format";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";

type FollowingFilter = "all" | "in-common" | "they-want-you-cut" | "you-want-they-have";
type FollowingTab = "collection" | "wants";

const FOLLOWING_VIEW_MODES: { id: ViewMode; icon: typeof Disc3; label: string }[] = [
  { id: "grid", icon: Grid2x2, label: "Grid" },
  { id: "artwork", icon: Grid3x3, label: "Artwork Grid" },
  { id: "list", icon: List, label: "List" },
  { id: "crate", icon: Disc3, label: "Swiper" },
];

export function FollowingScreen() {
  const { followedUsers, addFollowedUser, removeFollowedUser, albums, wants, isAuthenticated, sessionToken, isDarkMode, discogsUsername, addToWantList, removeFromWantList, setScreen: setAppScreen, followingFeed, followingAvatars, isSyncingFollowing } = useApp();
  const proxyFetchUserProfile = useAction(api.discogs.proxyFetchUserProfile);
  const proxyFetchCollection = useAction(api.discogs.proxyFetchCollection);
  const proxyFetchWantlist = useAction(api.discogs.proxyFetchWantlist);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addUsername, setAddUsername] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addProgress, setAddProgress] = useState("");
  const [addError, setAddError] = useState("");

  const selectedUser = useMemo(
    () => followedUsers.find((f) => f.id === selectedUserId) || null,
    [followedUsers, selectedUserId]
  );

  const handleConnect = useCallback(async () => {
    const username = addUsername.trim();
    if (!username) return;
    if (!isAuthenticated || !sessionToken) {
      setAddError("Connect your Discogs account in Settings first.");
      return;
    }
    if (followedUsers.some((f) => f.username.toLowerCase() === username.toLowerCase())) {
      setAddError("You're already following this collector.");
      return;
    }

    setAddLoading(true);
    setAddError("");
    setAddProgress("Looking up user...");

    try {
      // 1. Check user exists and get their canonical username + avatar
      const profile = await proxyFetchUserProfile({ sessionToken, username });

      // 2. Fetch their collection
      setAddProgress("Fetching collection...");
      let collectedAlbums: Album[] = [];
      let collectedFolders: string[] = ["All"];
      try {
        const result = await proxyFetchCollection({
          sessionToken,
          username: profile.username,
          skipPrivateFields: true,
        });
        collectedAlbums = result.albums;
        collectedFolders = result.folders;
      } catch (e: any) {
        // Collection may be private — continue with empty
        console.warn("[Following] Could not fetch collection:", e.message);
        if (e.message?.includes("403")) {
          // Private collection
          const newUser: FollowedUser = {
            id: "f-" + Date.now(),
            username: profile.username,
            avatar: profile.avatar,
            isPrivate: true,
            folders: ["All"],
            lastSynced: new Date().toISOString().split("T")[0],
            collection: [],
            wants: [],
          };
          addFollowedUser(newUser);
          setAddUsername("");
          setShowAddForm(false);
          setAddProgress("");
          toast.warning("@" + profile.username + "'s collection is private.", { duration: 3000 });
          return;
        }
      }

      // 3. Fetch their want list
      setAddProgress("Fetching wantlist...");
      let collectedWants: WantItem[] = [];
      try {
        collectedWants = await proxyFetchWantlist({
          sessionToken,
          username: profile.username,
        });
      } catch (e: any) {
        console.warn("[Following] Could not fetch want list:", e.message);
      }

      // 4. Create the followed user entry
      const newUser: FollowedUser = {
        id: "f-" + Date.now(),
        username: profile.username,
        avatar: profile.avatar,
        isPrivate: false,
        folders: collectedFolders,
        lastSynced: new Date().toISOString().split("T")[0],
        collection: collectedAlbums,
        wants: collectedWants,
      };
      addFollowedUser(newUser);
      setAddUsername("");
      setShowAddForm(false);
      setAddProgress("");
      toast.success(`Connected with @${profile.username}.`);
    } catch (err: any) {
      console.error("[Following] Connect error:", err);
      setAddError(err?.message || "Failed to connect. Check the username and try again.");
      setAddProgress("");
    } finally {
      setAddLoading(false);
    }
  }, [addUsername, followedUsers, addFollowedUser, isAuthenticated, sessionToken, proxyFetchUserProfile, proxyFetchCollection, proxyFetchWantlist]);

  if (selectedUser) {
    return (
      <FollowedUserProfile
        user={selectedUser}
        onBack={() => setSelectedUserId(null)}
        onRemove={() => {
          removeFollowedUser(selectedUser.id);
          setSelectedUserId(null);
          toast.success("Unfollowed @" + selectedUser.username + ".");
        }}
        userAlbums={albums}
        userWants={wants}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-[16px] lg:px-[24px] pt-[8px] pb-[4px] lg:pt-[16px] lg:pb-[17px]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="screen-title" style={{ fontSize: "28px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.5px", lineHeight: 1.25, color: "var(--c-text)" }}>Following</h2>
            <p className="mt-0.5" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
              Browse the collections you follow
            </p>
          </div>
          <button
            onClick={() => { setShowAddForm(true); setAddError(""); }}
            className="w-10 h-10 rounded-full bg-[#EBFD00] flex items-center justify-center text-[#0C284A] hover:bg-[#d9e800] transition-colors cursor-pointer"
          >
            <UserPlus size={20} />
          </button>
        </div>
      </div>

      {/* Add User Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden flex-shrink-0"
          >
            <div className="px-[16px] lg:px-[24px] py-3" style={{ backgroundColor: "var(--c-surface-alt)" }}>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-[10px] px-3" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", height: "40px" }}>
                  <span style={{ color: "var(--c-text-muted)", fontSize: "14px" }}>@</span>
                  <input
                    type="text"
                    placeholder="Discogs username"
                    value={addUsername}
                    onChange={(e) => { setAddUsername(e.target.value); setAddError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                    className="flex-1 bg-transparent outline-none border-none"
                    style={{ fontSize: "16px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-text)" }}
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleConnect}
                  disabled={addLoading || !addUsername.trim()}
                  className="px-4 h-[40px] rounded-[10px] bg-[#EBFD00] text-[#0C284A] hover:bg-[#d9e800] transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                  style={{ fontSize: "14px", fontWeight: 600 }}
                >
                  {addLoading ? <Disc3 size={16} className="disc-spinner" /> : null}
                  Connect
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setAddError(""); setAddUsername(""); }}
                  className="w-[40px] h-[40px] rounded-[10px] flex items-center justify-center transition-colors cursor-pointer"
                  style={{ color: "var(--c-text-muted)", fontSize: "24px" }}
                >
                  &#215;
                </button>
              </div>
              {addProgress && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 flex items-start gap-2" style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-muted)" }}>
                  <Disc3 size={14} className="disc-spinner flex-shrink-0 mt-0.5" />
                  {addProgress}
                </motion.p>
              )}
              {addError && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 flex items-start gap-2" style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-destructive)" }}>
                  <Lock size={14} className="flex-shrink-0 mt-0.5" />
                  {addError}
                </motion.p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overlay-scroll" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + var(--nav-clearance, 80px))" }}>
        {followedUsers.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8 py-20">
            <Users size={48} style={{ color: "var(--c-text-faint)" }} />
            <p className="mt-4 text-center" style={{ fontSize: "16px", fontWeight: 500, color: "var(--c-text-muted)" }}>You're not following anyone yet.</p>
            <p className="mt-1 text-center" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
              Enter a Discogs username to follow their collection.
            </p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
          >
            <PopulatedFollowingView
              followedUsers={followedUsers}
              onSelectUser={setSelectedUserId}
              isDarkMode={isDarkMode}
              albums={albums}
              wants={wants}
              addToWantList={addToWantList}
              removeFromWantList={removeFromWantList}
              setAppScreen={setAppScreen}
              followingFeed={followingFeed}
              followingAvatars={followingAvatars}
              isSyncingFollowing={isSyncingFollowing}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* ====== Followed User Profile View ====== */

function FollowedUserProfile({
  user,
  onBack,
  onRemove,
  userAlbums,
  userWants,
}: {
  user: FollowedUser;
  onBack: () => void;
  onRemove: () => void;
  userAlbums: Album[];
  userWants: WantItem[];
}) {
  const [tab, setTab] = useState<FollowingTab>("collection");
  const [filter, setFilter] = useState<FollowingFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const { isDarkMode } = useApp();

  const userReleaseIds = useMemo(() => new Set(userAlbums.map((a) => a.release_id)), [userAlbums]);
  const userCutReleaseIds = useMemo(() => new Set(userAlbums.filter((a) => a.purgeTag === "cut").map((a) => a.release_id)), [userAlbums]);
  const userWantReleaseIds = useMemo(() => new Set(userWants.map((w) => w.release_id)), [userWants]);
  const followedReleaseIds = useMemo(() => new Set(user.collection.map((a) => a.release_id)), [user.collection]);

  const inCommonCount = useMemo(() => user.collection.filter((a) => userReleaseIds.has(a.release_id)).length, [user.collection, userReleaseIds]);
  const theyWantYouCutCount = useMemo(() => user.wants.filter((w) => userCutReleaseIds.has(w.release_id)).length, [user.wants, userCutReleaseIds]);
  const youWantTheyHaveCount = useMemo(() => userWants.filter((w) => followedReleaseIds.has(w.release_id)).length, [userWants, followedReleaseIds]);

  const displayItems = useMemo(() => {
    if (tab === "wants") {
      let items = [...user.wants];
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        items = items.filter((w) => w.artist.toLowerCase().includes(q) || w.title.toLowerCase().includes(q));
      }
      return items;
    }
    let items: Album[] = [...user.collection];
    switch (filter) {
      case "in-common":
        items = items.filter((a) => userReleaseIds.has(a.release_id));
        break;
      case "they-want-you-cut": {
        const followedWantIds = new Set(user.wants.map((w) => w.release_id));
        items = userAlbums.filter((a) => a.purgeTag === "cut" && followedWantIds.has(a.release_id));
        break;
      }
      case "you-want-they-have":
        items = items.filter((a) => userWantReleaseIds.has(a.release_id));
        break;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((a) => a.artist.toLowerCase().includes(q) || a.title.toLowerCase().includes(q));
    }
    return items;
  }, [tab, filter, user, searchQuery, userReleaseIds, userCutReleaseIds, userWantReleaseIds, userAlbums]);

  if (user.isPrivate) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 px-[16px] lg:px-[24px] py-[12px] lg:pt-[16px] lg:pb-[17px]">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer" style={{ color: "var(--c-text)" }}>
              <ArrowLeft size={20} />
            </button>
            {user.avatar ? (
              <img src={user.avatar} alt={user.username} className="w-9 h-9 rounded-full object-cover flex-shrink-0" style={{ border: "2px solid var(--c-border)" }} />
            ) : (
              <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: "var(--c-chip-bg)", border: "2px solid var(--c-border)" }}>
                <Users size={14} style={{ color: "var(--c-text-muted)" }} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-[22px] lg:text-[36px] leading-[1.2]" style={{ fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.5px", color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>
                @{user.username}
              </h2>
            </div>
            <a href={"https://www.discogs.com/user/" + user.username} target="_blank" rel="noopener noreferrer"
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{ color: "var(--c-text-muted)" }}>
              <ExternalLink size={16} />
            </a>
            <button
              onClick={() => setShowRemoveConfirm(true)}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--c-destructive-tint)] cursor-pointer"
              style={{ color: "var(--c-destructive)" }}
              title="Unfollow"
            >
              <UserMinus size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <Lock size={48} style={{ color: "var(--c-text-faint)" }} />
          <p className="mt-4 text-center" style={{ fontSize: "16px", fontWeight: 500, color: "var(--c-text-muted)" }}>Private Collection</p>
          <p className="mt-2 text-center max-w-[320px]" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)", lineHeight: "1.5" }}>
            This collection is set to private on Discogs. Ask @{user.username} to make it public in their Discogs privacy settings.
          </p>
        </div>
        {/* Remove confirmation dialog */}
        <AnimatePresence>
          {showRemoveConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center px-6"
              style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
              onClick={() => setShowRemoveConfirm(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-[320px] rounded-[14px] p-5"
                style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}
              >
                <p style={{ fontSize: "16px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>
                  Unfollow @{user.username}?
                </p>
                <p className="mt-2" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)", lineHeight: 1.5 }}>
                  Their collection and wantlist data will be removed from your app.
                </p>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setShowRemoveConfirm(false)}
                    className="flex-1 py-2.5 rounded-[10px] transition-colors cursor-pointer"
                    style={{ fontSize: "14px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text)" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { setShowRemoveConfirm(false); onRemove(); }}
                    className="flex-1 py-2.5 rounded-[10px] text-white transition-colors cursor-pointer"
                    style={{ fontSize: "14px", fontWeight: 600, backgroundColor: "var(--c-destructive)" }}
                  >
                    Unfollow
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const FILTER_CHIPS: { id: FollowingFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: user.collection.length },
    { id: "in-common", label: "In Common", count: inCommonCount },
    { id: "they-want-you-cut", label: "They Want / You Cut", count: theyWantYouCutCount },
    { id: "you-want-they-have", label: "You Want / They Have", count: youWantTheyHaveCount },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-[16px] lg:px-[24px] py-[12px] lg:pt-[16px] lg:pb-[12px]">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer" style={{ color: "var(--c-text)" }}>
            <ArrowLeft size={20} />
          </button>
          {user.avatar ? (
            <img src={user.avatar} alt={user.username} className="w-9 h-9 rounded-full object-cover flex-shrink-0" style={{ border: "2px solid var(--c-border)" }} />
          ) : (
            <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: "var(--c-chip-bg)", border: "2px solid var(--c-border)" }}>
              <Users size={14} style={{ color: "var(--c-text-muted)" }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-[22px] lg:text-[36px] leading-[1.2]" style={{ fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.5px", color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>
              @{user.username}
            </h2>
          </div>
          <a href={"https://www.discogs.com/user/" + user.username} target="_blank" rel="noopener noreferrer"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{ color: "var(--c-text-muted)" }}>
            <ExternalLink size={16} />
          </a>
          <button
            onClick={() => setShowRemoveConfirm(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--c-destructive-tint)] cursor-pointer"
            style={{ color: "var(--c-destructive)" }}
            title="Unfollow"
          >
            <UserMinus size={16} />
          </button>
        </div>

        {/* Collection / Wantlist toggle */}
        <div className="flex mt-3 rounded-[10px] overflow-hidden" style={{ border: "1px solid var(--c-border-strong)" }}>
          <button
            onClick={() => { setTab("collection"); setFilter("all"); }}
            className="flex-1 py-2 text-center transition-colors cursor-pointer"
            style={{
              fontSize: "14px", fontWeight: tab === "collection" ? 600 : 400,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              backgroundColor: tab === "collection" ? "#ACDEF2" : "var(--c-surface)",
              color: tab === "collection" ? "#0C284A" : "var(--c-text-muted)",
            }}
          >
            Collection ({user.hydrated === false ? "…" : user.collection.length})
          </button>
          <button
            onClick={() => { setTab("wants"); setFilter("all"); }}
            className="flex-1 py-2 text-center transition-colors cursor-pointer"
            style={{
              fontSize: "14px", fontWeight: tab === "wants" ? 600 : 400,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              backgroundColor: tab === "wants" ? "#ACDEF2" : "var(--c-surface)",
              color: tab === "wants" ? "#0C284A" : "var(--c-text-muted)",
              borderLeft: "1px solid var(--c-border-strong)",
            }}
          >
            Wantlist ({user.hydrated === false ? "…" : user.wants.length})
          </button>
        </div>
      </div>

      {/* Search / Filter / View controls — on gray content background */}
      <div className="flex-shrink-0 px-[16px] lg:px-[24px] pt-[12px] pb-[8px]">
        {/* Desktop: single row — search + filters + view toggle */}
        <div className="hidden lg:flex items-center gap-[12px]">
          <div className="flex-1 flex items-center gap-[8px] rounded-full px-[14.5px] min-w-0" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", height: "39px" }}>
            <Search size={16} style={{ color: "var(--c-border-strong)" }} className="flex-shrink-0" />
            <input
              type="text" placeholder="Search..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent outline-none border-none min-w-0"
              style={{ fontSize: "16px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-text)" }}
            />
            {searchQuery && <button onClick={() => setSearchQuery("")} className="cursor-pointer" style={{ fontSize: "18px", lineHeight: 1, color: "var(--c-text-muted)" }}>&#215;</button>}
          </div>
          {tab === "collection" && (
            <div className="flex items-center gap-2 shrink-0">
              {FILTER_CHIPS.map((chip) => {
                const isActive = filter === chip.id;
                return (
                  <button
                    key={chip.id}
                    onClick={() => setFilter(chip.id)}
                    className="px-3 py-1.5 rounded-full transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 cursor-pointer"
                    style={isActive
                      ? { fontSize: "13px", fontWeight: 600, backgroundColor: isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)", color: isDarkMode ? "#ACDEF2" : "#00527A" }
                      : { fontSize: "13px", fontWeight: 500, backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", color: "var(--c-text-secondary)" }}
                  >
                    {chip.label}
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1"
                      style={{
                        fontSize: "11px", fontWeight: 600,
                        backgroundColor: isActive ? (isDarkMode ? "rgba(172,222,242,0.15)" : "rgba(0,82,122,0.12)") : "var(--c-border)",
                        color: isActive ? (isDarkMode ? "#ACDEF2" : "#00527A") : "var(--c-text-muted)",
                      }}
                    >
                      {chip.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} modes={FOLLOWING_VIEW_MODES} />
        </div>

        {/* Mobile: search + view toggle row, then filter chips row */}
        <div className="lg:hidden">
          <div className="flex items-center gap-[10px]">
            <div className="flex-1 flex items-center gap-[8px] rounded-full px-[14.5px] min-w-0" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", height: "34px" }}>
              <Search size={16} style={{ color: "var(--c-border-strong)" }} className="flex-shrink-0" />
              <input
                type="text" placeholder="Search..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none border-none min-w-0"
                style={{ fontSize: "16px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-text)" }}
              />
              {searchQuery && <button onClick={() => setSearchQuery("")} className="cursor-pointer" style={{ fontSize: "18px", lineHeight: 1, color: "var(--c-text-muted)" }}>&#215;</button>}
            </div>
            <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} modes={FOLLOWING_VIEW_MODES} compact />
          </div>
          {tab === "collection" && (
            <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-1 no-scrollbar">
              {FILTER_CHIPS.map((chip) => {
                const isActive = filter === chip.id;
                return (
                  <button
                    key={chip.id}
                    onClick={() => setFilter(chip.id)}
                    className="px-3 py-1.5 rounded-full transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 cursor-pointer"
                    style={isActive
                      ? { fontSize: "12px", fontWeight: 600, backgroundColor: isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)", color: isDarkMode ? "#ACDEF2" : "#00527A" }
                      : { fontSize: "12px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text-secondary)" }}
                  >
                    {chip.label}
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1"
                      style={{
                        fontSize: "11px", fontWeight: 600,
                        backgroundColor: isActive ? (isDarkMode ? "rgba(172,222,242,0.15)" : "rgba(0,82,122,0.12)") : "var(--c-border)",
                        color: isActive ? (isDarkMode ? "#ACDEF2" : "#00527A") : "var(--c-text-muted)",
                      }}
                    >
                      {chip.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto overlay-scroll">
        {user.hydrated === false ? (
          <div className="flex flex-col items-center justify-center px-8 py-16">
            <Disc3 size={28} className="disc-spinner" style={{ color: "var(--c-text-faint)" }} />
            <p className="mt-3" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
              Syncing @{user.username}
            </p>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-8 py-16">
            <p style={{ fontSize: "15px", fontWeight: 500, color: "var(--c-text-muted)" }}>
              {filter === "they-want-you-cut" ? "No matches found" :
               filter === "you-want-they-have" ? "No overlaps with your wantlist" :
               filter === "in-common" ? "No albums in common" :
               "No results"}
            </p>
            <p className="mt-1 text-center" style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-faint)" }}>
              {filter !== "all" ? "Try a different filter." : "Try a different search."}
            </p>
          </div>
        ) : (
          <>
            {filter === "they-want-you-cut" && theyWantYouCutCount > 0 && (
              <div className="mx-[16px] lg:mx-[24px] mt-3 p-3 rounded-[10px]"
                style={{ backgroundColor: "var(--c-destructive-tint)", border: "1px solid rgba(255, 51, 182, 0.15)" }}>
                <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-destructive)", lineHeight: 1.5 }}>
                  {theyWantYouCutCount} album{theyWantYouCutCount !== 1 ? "s" : ""} you tagged as Purge that @{user.username} wants. Reach out!
                </span>
              </div>
            )}
            {filter === "you-want-they-have" && youWantTheyHaveCount > 0 && (
              <div className="mx-[16px] lg:mx-[24px] mt-3 p-3 rounded-[10px]"
                style={{ backgroundColor: "var(--c-destructive-tint)", border: "1px solid rgba(255, 51, 182, 0.15)" }}>
                <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-destructive)", lineHeight: 1.5 }}>
                  {youWantTheyHaveCount} album{youWantTheyHaveCount !== 1 ? "s" : ""} from your wantlist in @{user.username}&apos;s collection.
                </span>
              </div>
            )}

            {viewMode === "crate" ? (
              <FollowedUserCrateView items={displayItems} />
            ) : viewMode === "list" ? (
              <FollowedUserListView items={displayItems} filter={filter} userCutIds={userCutReleaseIds} userWantIds={userWantReleaseIds} userIds={userReleaseIds} />
            ) : (
              <FollowedUserGridView items={displayItems} viewMode={viewMode} filter={filter} userCutIds={userCutReleaseIds} userWantIds={userWantReleaseIds} userIds={userReleaseIds} />
            )}
          </>
        )}
      </div>

      {/* Remove confirmation dialog */}
      <AnimatePresence>
        {showRemoveConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center px-6"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
            onClick={() => setShowRemoveConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[320px] rounded-[14px] p-5"
              style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}
            >
              <p style={{ fontSize: "16px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>
                Unfollow @{user.username}?
              </p>
              <p className="mt-2" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)", lineHeight: 1.5 }}>
                Their collection and wantlist data will be removed from your app.
              </p>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setShowRemoveConfirm(false)}
                  className="flex-1 py-2.5 rounded-[10px] transition-colors cursor-pointer"
                  style={{ fontSize: "14px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowRemoveConfirm(false); onRemove(); }}
                  className="flex-1 py-2.5 rounded-[10px] text-white transition-colors cursor-pointer"
                  style={{ fontSize: "14px", fontWeight: 600, backgroundColor: "var(--c-destructive)" }}
                >
                  Unfollow
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ====== Crate (swiper) view ====== */
function FollowedUserCrateView({ items }: { items: (Album | WantItem)[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const dragY = useMotionValue(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchState = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const suppressNextClick = useRef(false);
  const [lightboxActive, setLightboxActive] = useState(false);

  // Reset index when items change
  useEffect(() => {
    setCurrentIndex(0);
  }, [items]);

  // Clamp index to valid range
  const safeIndex = Math.min(currentIndex, Math.max(0, items.length - 1));

  // Idle timer: auto-dismiss lightbox after 3s of inactivity
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => { setLightboxActive(false); }, 3000);
  }, []);

  useEffect(() => {
    if (!lightboxActive && idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    if (lightboxActive) resetIdleTimer();
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [lightboxActive, resetIdleTimer]);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, items.length - 1));
  }, [items.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const threshold = 60;
      let didSwipe = false;
      if (info.offset.y < -threshold) {
        goNext();
        didSwipe = true;
      } else if (info.offset.y > threshold) {
        goPrev();
        didSwipe = true;
      }
      if (didSwipe) {
        if (!lightboxActive) setLightboxActive(true);
        resetIdleTimer();
      }
    },
    [goNext, goPrev, lightboxActive, resetIdleTimer]
  );

  const handleCardTap = useCallback((item: Album | WantItem) => {
    window.open(`https://www.discogs.com/release/${item.release_id}`, "_blank", "noopener,noreferrer");
  }, []);

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-[24px]">
        <p style={{ fontSize: "16px", fontWeight: 400, color: "var(--c-text-muted)" }}>No albums to flip through</p>
      </div>
    );
  }

  const currentItem = items[safeIndex];

  // Stack: show current + up to 2 behind
  const stackIndices: number[] = [];
  for (let i = 0; i < Math.min(3, items.length - safeIndex); i++) {
    stackIndices.push(safeIndex + i);
  }

  const baseOpacity = lightboxActive ? 0.08 : 0.15;

  return (
    <div className="flex-1 flex flex-col items-center overflow-hidden relative">
      {/* Lightbox overlay */}
      <AnimatePresence>
        {lightboxActive && (
          <motion.div
            className="fixed inset-x-0 top-0 bottom-[72px] lg:bottom-0 z-[100] cursor-pointer"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: DURATION_SLOW, ease: EASE_IN } }}
            transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
            onClick={(e) => { if (e.target === e.currentTarget) setLightboxActive(false); }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxActive(false); }}
              className="absolute right-5 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-white/25 transition-all z-10"
              style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
            >
              <X size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card stack area */}
      <div className="relative w-full flex-1 flex items-center justify-center px-[16px] lg:px-[24px]">
        <motion.div
          className="relative w-full max-w-[calc(100vw-32px)] lg:max-w-[620px]"
          style={{ aspectRatio: "1 / 1", zIndex: lightboxActive ? 101 : "auto" }}
          animate={{ scale: lightboxActive ? 1.05 : 1 }}
          transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        >
          <AnimatePresence mode="popLayout">
            {stackIndices.reverse().map((idx, stackPos) => {
              const reversePos = stackIndices.length - 1 - stackPos;
              const item = items[idx];
              const isCurrent = idx === safeIndex;
              const offsetY = reversePos * 8;
              const scale = 1 - reversePos * 0.04;

              return (
                <motion.div
                  key={item.id}
                  className="absolute inset-0 rounded-[14px] overflow-hidden cursor-pointer"
                  style={{
                    boxShadow: isCurrent
                      ? "0 8px 32px rgba(0,0,0,0.25)"
                      : "0 4px 16px rgba(0,0,0,0.15)",
                    zIndex: 10 - reversePos,
                    y: isCurrent ? dragY : offsetY,
                    scale: isCurrent ? 1 : scale,
                    pointerEvents: isCurrent ? "auto" : "none",
                    opacity: isCurrent ? 1 : Math.max(baseOpacity, 1 - reversePos * (1 - baseOpacity) / 1.5),
                  }}
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: isCurrent ? 1 : scale, opacity: 1, y: isCurrent ? 0 : offsetY }}
                  exit={{ scale: 0.92, opacity: 0, y: -100 }}
                  transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
                  {...(isCurrent
                    ? {
                        drag: "y",
                        dragConstraints: { top: 0, bottom: 0 },
                        dragElastic: 0.4,
                        onDragEnd: handleDragEnd,
                      }
                    : {})}
                  onTouchStart={(e) => { const t = e.touches[0]; touchState.current = { startX: t.clientX, startY: t.clientY, moved: false }; suppressNextClick.current = false; }}
                  onTouchMove={(e) => { if (!touchState.current) return; const t = e.touches[0]; if (Math.abs(t.clientX - touchState.current.startX) > 6 || Math.abs(t.clientY - touchState.current.startY) > 6) touchState.current.moved = true; }}
                  onTouchEnd={() => { if (isCurrent && touchState.current && !touchState.current.moved) { suppressNextClick.current = true; handleCardTap(item); } touchState.current = null; }}
                  onClick={() => { if (suppressNextClick.current) { suppressNextClick.current = false; return; } if (isCurrent) handleCardTap(item); }}
                >
                  {/* Cover art */}
                  <img
                    src={item.cover}
                    alt={`${item.artist} - ${item.title}`}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />

                  {/* Bottom gradient overlay */}
                  <div
                    className="absolute inset-x-0 bottom-0 pointer-events-none"
                    style={{
                      height: "55%",
                      background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%)",
                    }}
                  />

                  {/* Metadata overlay */}
                  <div className="absolute inset-x-0 bottom-0 p-4" style={{ minWidth: 0, overflow: "hidden" }}>
                    <p
                      style={{
                        fontSize: "18px",
                        fontWeight: 600,
                        fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                        color: "#FFFFFF",
                        lineHeight: 1.25,
                        textShadow: "0 1px 4px rgba(0,0,0,0.4)",
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
                      className="mt-0.5"
                      style={{
                        fontSize: "14px",
                        fontWeight: 400,
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        color: "rgba(255,255,255,0.85)",
                        textShadow: "0 1px 4px rgba(0,0,0,0.4)",
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
                    <div className="flex items-center gap-2 mt-1.5" style={{ minWidth: 0, overflow: "hidden" }}>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 400,
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                          color: "rgba(255,255,255,0.65)",
                          flexShrink: 0,
                        }}
                      >
                        {item.year}
                      </span>
                      {/* Discogs link */}
                      <a
                        href={`https://www.discogs.com/release/${item.release_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 transition-opacity hover:opacity-80 pointer-events-auto"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        style={{ flexShrink: 0 }}
                      >
                        <span style={{ fontSize: "11px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", color: "rgba(255,255,255,0.55)" }}>Discogs</span>
                        <ExternalLink size={9} style={{ color: "rgba(255,255,255,0.45)" }} />
                      </a>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Navigation controls */}
      <div className="flex items-center gap-4 pb-3 pt-2" style={{ paddingBottom: "calc(12px + var(--nav-clearance, 0px))", zIndex: lightboxActive ? 101 : "auto" }}>
        <button
          onClick={() => { goPrev(); if (lightboxActive) resetIdleTimer(); }}
          disabled={safeIndex === 0}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all tappable ${
            lightboxActive ? "bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 hover:text-white" : ""
          }`}
          style={!lightboxActive ? {
            backgroundColor: "var(--c-chip-bg)",
            color: "var(--c-text-secondary)",
            opacity: safeIndex === 0 ? 0.35 : 1,
            transform: "rotate(90deg)",
          } : {
            opacity: safeIndex === 0 ? 0.35 : 1,
            transform: "rotate(90deg)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <span
          style={{
            fontSize: "13px",
            fontWeight: 500,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            color: lightboxActive ? "rgba(255,255,255,0.7)" : "var(--c-text-muted)",
            minWidth: "60px",
            textAlign: "center",
            transition: "color 200ms ease-out",
          }}
        >
          {safeIndex + 1} / {items.length}
        </span>

        <button
          onClick={() => { goNext(); if (lightboxActive) resetIdleTimer(); }}
          disabled={safeIndex >= items.length - 1}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all tappable ${
            lightboxActive ? "bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 hover:text-white" : ""
          }`}
          style={!lightboxActive ? {
            backgroundColor: "var(--c-chip-bg)",
            color: "var(--c-text-secondary)",
            opacity: safeIndex >= items.length - 1 ? 0.35 : 1,
            transform: "rotate(90deg)",
          } : {
            opacity: safeIndex >= items.length - 1 ? 0.35 : 1,
            transform: "rotate(90deg)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ====== Grid view ====== */
function FollowedUserGridView({ items, viewMode, filter, userCutIds, userWantIds, userIds }: {
  items: (Album | WantItem)[]; viewMode: string; filter: FollowingFilter;
  userCutIds: Set<number>; userWantIds: Set<number>; userIds: Set<number>;
}) {
  const { isDarkMode } = useApp();
  const isArtwork = viewMode === "artwork";

  if (isArtwork) {
    return (
      <AlbumArtwork<ArtworkGridItem & { release_id: number }>
        items={items.map((item) => ({ id: item.id, title: item.title, artist: item.artist, thumb: ("thumb" in item ? item.thumb : undefined) || undefined, cover: item.cover, release_id: item.release_id }))}
        bare
        onItemClick={() => {}}
        renderAction={() => null}
        renderIndicator={(item) => {
          const badge = getBadge(item.release_id, filter, userCutIds, userWantIds, userIds);
          return (
            <>
              {badge && (
                <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: badge.color, fontSize: "10px", fontWeight: 600, color: "#fff", zIndex: 1 }}>
                  {badge.label}
                </div>
              )}
              <WantlistHeartButton
                releaseId={item.release_id}
                masterId={item.master_id}
                title={item.title}
                artist={item.artist}
                cover={item.cover}
                thumb={item.thumb}
                year={0}
                label=""
                size={16}
                variant="overlay"
              />
            </>
          );
        }}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-[16px] lg:px-[24px] pt-3 pb-4">
      {items.map((item) => {
        const badge = getBadge(item.release_id, filter, userCutIds, userWantIds, userIds);
        return (
          <div key={item.id} className="relative rounded-[10px] overflow-hidden group"
            style={{
              backgroundColor: "var(--c-surface)",
              border: `1px solid ${isDarkMode ? "var(--c-border-strong)" : "#D2D8DE"}`,
              boxShadow: "var(--c-card-shadow)",
            }}>
            <div className="relative aspect-square overflow-hidden">
              <img src={item.cover} alt={item.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" draggable={false} />
              {badge && (
                <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: badge.color, fontSize: "10px", fontWeight: 600, color: "#fff", zIndex: 1 }}>
                  {badge.label}
                </div>
              )}
              <WantlistHeartButton
                releaseId={item.release_id}
                masterId={item.master_id}
                title={item.title}
                artist={item.artist}
                cover={item.cover}
                thumb={"thumb" in item ? (item as any).thumb : undefined}
                year={item.year}
                label={"label" in item ? (item as any).label : ""}
                size={16}
                variant="overlay"
              />
            </div>
            <div className="px-2.5 pt-2 pb-2.5" style={{ minWidth: 0, overflow: "hidden" }}>
              <p style={{ fontSize: "13px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)", lineHeight: "1.25", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{item.title}</p>
              <p className="mt-[1px]" style={{ fontSize: "12px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-text-secondary)", lineHeight: "1.3", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{item.artist}</p>
              <span style={{ fontSize: "11px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-text-muted)" }}>{item.year}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ====== List view ====== */
function FollowedUserListView({ items, filter, userCutIds, userWantIds, userIds }: {
  items: (Album | WantItem)[]; filter: FollowingFilter;
  userCutIds: Set<number>; userWantIds: Set<number>; userIds: Set<number>;
}) {
  return (
    <div className="flex flex-col">
      {items.map((item) => {
        const badge = getBadge(item.release_id, filter, userCutIds, userWantIds, userIds);
        return (
          <div key={item.id} className="flex items-center gap-3 px-[16px] lg:px-[24px] py-2.5"
            style={{ borderColor: "var(--c-border)", borderBottomWidth: "1px", borderBottomStyle: "solid", borderLeft: badge ? "3px solid " + badge.color : "3px solid transparent" }}>
            <img src={item.thumb || item.cover} alt={item.title} className="w-11 h-11 rounded-[6px] object-cover flex-shrink-0" />
            <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
              <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{item.title}</p>
              <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{item.artist} &middot; {item.year}</p>
            </div>
            {badge && (
              <span className="px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: badge.color + "20", fontSize: "11px", fontWeight: 600, color: badge.color }}>
                {badge.label}
              </span>
            )}
            <WantlistHeartButton
              releaseId={item.release_id}
              masterId={item.master_id}
              title={item.title}
              artist={item.artist}
              cover={item.cover}
              thumb={"thumb" in item ? (item as any).thumb : undefined}
              year={item.year}
              label={"label" in item ? (item as any).label : ""}
              size={16}
              variant="inline"
            />
          </div>
        );
      })}
    </div>
  );
}

function getBadge(releaseId: number, filter: FollowingFilter, userCutIds: Set<number>, userWantIds: Set<number>, userIds: Set<number>): { label: string; color: string } | null {
  if (filter !== "all") return null;
  if (userCutIds.has(releaseId)) return null;
  if (userIds.has(releaseId)) return { label: "In Common", color: "#0078B4" };
  if (userWantIds.has(releaseId)) return { label: "You Want", color: "#3E9842" };
  return null;
}

/* ====== Activity helpers ====== */

interface ActivityItem {
  id: string;
  followedId: string;
  followedUsername: string;
  followedAvatar: string;
  albumTitle: string;
  albumArtist: string;
  albumCover: string;
  albumReleaseId: number;
  albumMasterId?: number;
  albumYear: number;
  albumLabel: string;
  date: string;
  displayDate: string;
}


function buildActivityFeedFromCache(
  feedEntries: FollowingFeedEntry[],
  avatarMap: Map<string, string>,
  userIdMap: Map<string, string>,
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const entry of feedEntries) {
    if (entry.recent_albums.length === 0) continue;
    const sorted = [...entry.recent_albums]
      .sort((a, b) => (b.dateAdded || "").localeCompare(a.dateAdded || ""))
      .slice(0, 30);
    const avatar = avatarMap.get(entry.followed_username) || "";
    const userId = userIdMap.get(entry.followed_username.toLowerCase()) || `f-${entry.followed_username}`;
    sorted.forEach((album) => {
      items.push({
        id: `act-${entry.followed_username}-${album.release_id}`,
        followedId: userId,
        followedUsername: entry.followed_username,
        followedAvatar: avatar,
        albumTitle: album.title,
        albumArtist: album.artist,
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
  const capped = items.slice(0, 300);
  for (const item of capped) {
    item.displayDate = item.date ? formatActivityDate(item.date, true) : "";
  }
  return capped;
}

/* ====== Populated Following View ====== */

function PopulatedFollowingView({
  followedUsers,
  onSelectUser,
  isDarkMode,
  albums: userAlbumsForHeart,
  wants: userWantsForHeart,
  addToWantList,
  removeFromWantList,
  setAppScreen,
  followingFeed,
  followingAvatars,
  isSyncingFollowing,
}: {
  followedUsers: FollowedUser[];
  onSelectUser: (id: string) => void;
  isDarkMode: boolean;
  albums: Album[];
  wants: WantItem[];
  addToWantList: (item: WantItem) => Promise<void>;
  removeFromWantList: (releaseId: string | number) => Promise<void>;
  setAppScreen: (s: Screen) => void;
  followingFeed: FollowingFeedEntry[];
  followingAvatars: Map<string, string>;
  isSyncingFollowing: boolean;
}) {
  // Build a username → followedUser.id lookup for activity items
  const userIdMap = useMemo(() => new Map(followedUsers.map(f => [f.username.toLowerCase(), f.id])), [followedUsers]);
  const activityFeed = useMemo(() => buildActivityFeedFromCache(followingFeed, followingAvatars, userIdMap), [followingFeed, followingAvatars, userIdMap]);
  const [visibleCount, setVisibleCount] = useState(30);
  const visibleActivity = useMemo(() => activityFeed.slice(0, visibleCount), [activityFeed, visibleCount]);
  const hasMore = activityFeed.length > visibleCount;

  // Confirmation dialogs for wantlist add/remove
  const [removeWantConfirm, setRemoveWantConfirm] = useState<ActivityItem | null>(null);
  const [addWantConfirm, setAddWantConfirm] = useState<ActivityItem | null>(null);
  // Per-item in-flight tracking for API calls
  const [inFlightIds, setInFlightIds] = useState<Set<number>>(() => new Set());
  const [isRemovingWant, setIsRemovingWant] = useState(false);
  const [isAddingWant, setIsAddingWant] = useState(false);

  // Sets for quick lookups (release_id + master_id)
  const ownReleaseIds = useMemo(() => new Set(userAlbumsForHeart.map((a) => a.release_id)), [userAlbumsForHeart]);
  const ownMasterIds = useMemo(() => {
    const s = new Set<number>();
    for (const a of userAlbumsForHeart) if (a.master_id) s.add(a.master_id);
    return s;
  }, [userAlbumsForHeart]);
  const wantReleaseIds = useMemo(() => new Set(userWantsForHeart.map((w) => w.release_id)), [userWantsForHeart]);
  const wantMasterIds = useMemo(() => {
    const s = new Set<number>();
    for (const w of userWantsForHeart) if (w.master_id) s.add(w.master_id);
    return s;
  }, [userWantsForHeart]);

  // From the Depths — uses followingFeed cache (available immediately from Convex)
  // rather than followedUsers[].collection which requires API hydration.
  const MAX_CARDS_PER_USER = 4;
  const depthsPicks = useMemo(() => {
    const results: { username: string; avatar: string; userId: string; album: Album; cardKey: string }[] = [];
    // Build a username → followedUser.id lookup
    const userIdMap = new Map(followedUsers.map(f => [f.username.toLowerCase(), f.id]));
    for (const entry of followingFeed) {
      if (entry.recent_albums.length === 0) continue;
      const shuffled = [...entry.recent_albums].sort(() => Math.random() - 0.5);
      const picks = shuffled.slice(0, MAX_CARDS_PER_USER);
      const avatar = followingAvatars.get(entry.followed_username) || "";
      const userId = userIdMap.get(entry.followed_username.toLowerCase()) || `f-${entry.followed_username}`;
      for (let idx = 0; idx < picks.length; idx++) {
        const fa = picks[idx];
        // Adapt FeedAlbum to Album shape for DepthsAlbumCard
        const album: Album = {
          id: String(fa.release_id),
          release_id: fa.release_id,
          master_id: fa.master_id || 0,
          title: fa.title,
          artist: fa.artist,
          year: fa.year,
          thumb: fa.thumb,
          cover: fa.cover,
          label: fa.label,
          dateAdded: fa.dateAdded,
          folder: "",
          mediaCondition: "",
          sleeveCondition: "",
          notes: "",
          pricePaid: "",
          instance_id: 0,
        };
        results.push({
          username: entry.followed_username,
          avatar,
          userId,
          album,
          cardKey: `${entry.followed_username}-${fa.release_id}-${idx}`,
        });
      }
    }
    return results;
  }, [followingFeed, followingAvatars, followedUsers]);

  const handleHeartTap = useCallback(async (item: ActivityItem) => {
    // Already in collection or already in flight — no action
    const inOwn = ownReleaseIds.has(item.albumReleaseId) || (item.albumMasterId && ownMasterIds.has(item.albumMasterId));
    if (inOwn) return;
    if (inFlightIds.has(item.albumReleaseId)) return;
    // Already in wantlist — confirm removal
    const inWant = wantReleaseIds.has(item.albumReleaseId) || (item.albumMasterId && wantMasterIds.has(item.albumMasterId));
    if (inWant) {
      setRemoveWantConfirm(item);
      return;
    }
    // Show add confirmation prompt
    setAddWantConfirm(item);
  }, [ownReleaseIds, ownMasterIds, wantReleaseIds, wantMasterIds, inFlightIds]);

  return (
    <div className="flex flex-col">
      {/* ── Horizontal avatar row ── */}
      <div className="flex-shrink-0 px-[16px] lg:px-[24px] pt-[10px] pb-[14px]">
        <div className="flex items-start gap-[16px] overflow-x-auto no-scrollbar pb-1">
          {followedUsers.map((followedUser) => (
            <button
              key={followedUser.id}
              onClick={() => onSelectUser(followedUser.id)}
              className="flex flex-col items-center gap-[5px] shrink-0 cursor-pointer group"
              style={{ width: "56px" }}
            >
              {followedUser.avatar ? (
                <img
                  src={followedUser.avatar}
                  alt={followedUser.username}
                  className="w-[48px] h-[48px] rounded-full object-cover transition-transform group-hover:scale-105"
                  style={{ border: `2.5px solid ${isDarkMode ? "rgba(172,222,242,0.25)" : "rgba(172,222,242,0.6)"}` }}
                />
              ) : (
                <div
                  className="w-[48px] h-[48px] rounded-full flex items-center justify-center transition-transform group-hover:scale-105"
                  style={{
                    backgroundColor: isDarkMode ? "#1A3350" : "#ACDEF2",
                    border: `2.5px solid ${isDarkMode ? "rgba(172,222,242,0.25)" : "rgba(172,222,242,0.6)"}`,
                  }}
                >
                  <span style={{ fontSize: "18px", fontWeight: 600, color: isDarkMode ? "#ACDEF2" : "#0C284A", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
                    {getInitial(followedUser.username)}
                  </span>
                </div>
              )}
              <span
                className="w-full text-center"
                style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", fontFamily: "'DM Sans', system-ui, sans-serif", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}
              >
                {followedUser.username}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── From the Depths ── */}
      {depthsPicks.length > 0 && (
        <div className="pb-[20px]">
          {/* Section header */}
          <div className="px-[16px] lg:px-[24px] mb-[12px]">
            <p
              style={{
                fontSize: "20px",
                fontWeight: 600,
                letterSpacing: "-0.3px",
                color: "var(--c-text)",
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              }}
            >
              From the Depths
            </p>
            <p
              style={{
                fontSize: "13px",
                fontWeight: 400,
                color: "var(--c-text-muted)",
                fontFamily: "'DM Sans', system-ui, sans-serif",
                marginTop: "2px",
                lineHeight: 1.4,
              }}
            >
              Peeking into their crates for something worth pulling.
            </p>
          </div>

          {/* Horizontal scroll gallery */}
          <div
            className="overflow-x-auto depths-scroll"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <style>{`.depths-scroll::-webkit-scrollbar { display: none; }`}</style>
            <div className="flex gap-[12px] px-[16px] lg:px-[24px]">
              {depthsPicks.map(({ username, avatar, userId, album, cardKey }) => (
                <motion.div
                  key={`depths-${cardKey}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.45, ease: [0.25, 1, 0.5, 1] }}
                  className="flex-shrink-0"
                  style={{ width: "270px" }}
                >
                  <DepthsAlbumCard
                    album={album}
                    onTap={() => onSelectUser(userId)}
                    artworkPadded
                    dateLine={album.dateAdded ? `In their collection since ${formatCollectionSince(album.dateAdded)}` : undefined}
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
                    eyebrow={
                      <div className="flex items-center gap-[8px] px-[12px] pt-[12px] pb-[8px]">
                        <div
                          className="flex items-center justify-center overflow-hidden flex-shrink-0"
                          style={{
                            width: "20px",
                            height: "20px",
                            borderRadius: "50%",
                            backgroundColor: isDarkMode ? "#1A3350" : "#ACDEF2",
                          }}
                        >
                          {avatar ? (
                            <img
                              src={avatar}
                              alt={username}
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
                              {getInitial(username)}
                            </span>
                          )}
                        </div>
                        <p
                          style={{
                            fontSize: "12px",
                            fontWeight: 500,
                            color: "var(--c-text-muted)",
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                            lineHeight: 1.3,
                            display: "block",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "100%",
                          } as React.CSSProperties}
                        >
                          From {username}&rsquo;s crates
                        </p>
                      </div>
                    }
                    footer={
                      <div className="flex justify-end mt-[8px]">
                        <button
                          onClick={(e) => { e.stopPropagation(); onSelectUser(userId); }}
                          className="cursor-pointer tappable"
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
                          View their collection
                        </button>
                      </div>
                    }
                  />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Section label ── */}
      <div className="px-[16px] lg:px-[24px] pb-[8px]">
        <p style={{ fontSize: "13px", fontWeight: 500, letterSpacing: "0.3px", color: "var(--c-text-muted)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          RECENT ACTIVITY
        </p>
      </div>

      {/* ── Activity feed ── */}
      {activityFeed.length === 0 ? (
        isSyncingFollowing ? (
          <div className="flex flex-col items-center justify-center px-8 py-16">
            <Disc3 size={24} className="disc-spinner" style={{ color: "var(--c-text-faint)" }} />
            <p className="mt-3" style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-muted)" }}>
              Syncing activity
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-8 py-16">
            <p style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
              No recent activity from collectors you follow.
            </p>
          </div>
        )
      ) : (
        <div className="flex flex-col">
          {visibleActivity.map((item) => {
            const inCollection = ownReleaseIds.has(item.albumReleaseId) || !!(item.albumMasterId && ownMasterIds.has(item.albumMasterId));
            const inWantList = wantReleaseIds.has(item.albumReleaseId) || !!(item.albumMasterId && wantMasterIds.has(item.albumMasterId));
            return (
              <div
                key={item.id}
                className="flex items-center gap-[12px] px-[16px] lg:px-[24px] py-[12px]"
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

                {/* Heart / collection icon indicator — unified three-state logic */}
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
          {hasMore && (
            <div className="px-[16px] lg:px-[24px] py-[16px]" style={{ borderTopWidth: "1px", borderTopStyle: "solid", borderColor: "var(--c-border)" }}>
              <button
                onClick={() => setVisibleCount((c) => c + 30)}
                className="w-full cursor-pointer"
                style={{
                  padding: "10px 0",
                  fontSize: "14px",
                  fontWeight: 500,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  color: "var(--c-text-secondary)",
                  backgroundColor: "var(--c-chip-bg)",
                  border: "none",
                  borderRadius: "10px",
                }}
              >
                Load more
              </button>
            </div>
          )}
          {isSyncingFollowing && (
            <div className="flex items-center justify-center gap-2 py-[12px]" style={{ borderTopWidth: "1px", borderTopStyle: "solid", borderColor: "var(--c-border)" }}>
              <Disc3 size={14} className="disc-spinner" style={{ color: "var(--c-text-faint)" }} />
              <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-faint)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                Loading more activity
              </p>
            </div>
          )}
        </div>
      )}

      {/* Wantlist removal confirmation */}
      <AnimatePresence>
        {removeWantConfirm && (
          <SlideOutPanel
            onClose={() => { setRemoveWantConfirm(null); setIsRemovingWant(false); }}
            backdropZIndex={110}
            sheetZIndex={120}
          >
            <div className="flex flex-col items-center px-6 pt-2 pb-4 gap-4">
              <img
                src={removeWantConfirm.albumCover}
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
                      console.error("[Following] Remove from wantlist failed:", err);
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
                src={addWantConfirm.albumCover}
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
                        id: `w-following-${addWantConfirm.albumReleaseId}-${Date.now()}`,
                        release_id: addWantConfirm.albumReleaseId,
                        title: addWantConfirm.albumTitle,
                        artist: addWantConfirm.albumArtist,
                        year: addWantConfirm.albumYear,
                        cover: addWantConfirm.albumCover,
                        label: addWantConfirm.albumLabel,
                        priority: false,
                      });
                      toast.dismiss();
                      toast.info(`"${addWantConfirm.albumTitle}" added to Wantlist.`, { duration: 2500 });
                      setAddWantConfirm(null);
                    } catch (err: any) {
                      console.error("[Following] Add to wantlist failed:", err);
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