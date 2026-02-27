import { useState, useMemo, useCallback } from "react";
import type React from "react";
import {
  UserPlus, ArrowLeft, Search, ChevronRight, Trash2, Lock,
  Disc3, Users, Grid2x2, List, ExternalLink, Grid3x3,
  Heart,
} from "lucide-react";
import { motion, AnimatePresence, type PanInfo } from "motion/react";
import { toast } from "sonner";
import { useApp, type ViewMode, type Screen } from "./app-context";
import { ViewModeToggle } from "./crate-browser";
import type { Album, Friend, WantItem } from "./discogs-api";
import { EASE_IN_OUT, DURATION_NORMAL } from "./motion-tokens";
import { useHideHeaderOnScroll } from "./use-hide-header";
import { DepthsAlbumCard } from "./depths-album-card";
import {
  fetchUserProfile,
  fetchCollection,
  fetchWantlist,
} from "./discogs-api";

type FriendFilter = "all" | "in-common" | "they-want-you-cut" | "you-want-they-have";
type FriendTab = "collection" | "wants";

const FRIEND_VIEW_MODES: { id: ViewMode; icon: typeof Disc3; label: string }[] = [
  { id: "grid", icon: Grid2x2, label: "Grid" },
  { id: "artwork", icon: Grid3x3, label: "Artwork Grid" },
  { id: "list", icon: List, label: "List" },
  { id: "crate", icon: Disc3, label: "Swiper" },
];

export function FriendsScreen() {
  const { friends, addFriend, removeFriend, albums, wants, isAuthenticated, discogsAuth, isDarkMode, addToWantList, removeFromWantList, setScreen: setAppScreen } = useApp();
  const { onScroll: onHeaderScroll } = useHideHeaderOnScroll();
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addUsername, setAddUsername] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addProgress, setAddProgress] = useState("");
  const [addError, setAddError] = useState("");

  const selectedFriend = useMemo(
    () => friends.find((f) => f.id === selectedFriendId) || null,
    [friends, selectedFriendId]
  );

  const handleConnect = useCallback(async () => {
    const username = addUsername.trim();
    if (!username) return;
    if (!isAuthenticated || !discogsAuth) {
      setAddError("Connect your Discogs account in Settings first.");
      return;
    }
    if (friends.some((f) => f.username.toLowerCase() === username.toLowerCase())) {
      setAddError("You're already following this collector.");
      return;
    }

    setAddLoading(true);
    setAddError("");
    setAddProgress("Looking up user...");

    try {
      // 1. Check user exists and get their canonical username + avatar
      const profile = await fetchUserProfile(username, discogsAuth);

      // 2. Fetch their collection
      setAddProgress("Fetching collection...");
      let friendAlbums: Album[] = [];
      let friendFolders: string[] = ["All"];
      try {
        const result = await fetchCollection(
          profile.username,
          discogsAuth,
          (loaded, total) => setAddProgress(`Fetching collection... ${loaded}/${total}`)
        );
        friendAlbums = result.albums;
        friendFolders = result.folders;
      } catch (e: any) {
        // Collection may be private — continue with empty
        console.warn("[Friends] Could not fetch collection:", e.message);
        if (e.message?.includes("403")) {
          // Private collection
          const newFriend: Friend = {
            id: "f-" + Date.now(),
            username: profile.username,
            avatar: profile.avatar,
            isPrivate: true,
            folders: ["All"],
            lastSynced: new Date().toISOString().split("T")[0],
            collection: [],
            wants: [],
          };
          addFriend(newFriend);
          setAddUsername("");
          setShowAddForm(false);
          setAddProgress("");
          toast.warning("@" + profile.username + "'s collection is private", { duration: 3000 });
          return;
        }
      }

      // 3. Fetch their want list
      setAddProgress("Fetching wantlist...");
      let friendWants: WantItem[] = [];
      try {
        friendWants = await fetchWantlist(
          profile.username,
          discogsAuth,
          (loaded, total) => setAddProgress(`Fetching wants... ${loaded}/${total}`)
        );
      } catch (e: any) {
        console.warn("[Friends] Could not fetch want list:", e.message);
      }

      // 4. Create the friend entry
      const newFriend: Friend = {
        id: "f-" + Date.now(),
        username: profile.username,
        avatar: profile.avatar,
        isPrivate: false,
        folders: friendFolders,
        lastSynced: new Date().toISOString().split("T")[0],
        collection: friendAlbums,
        wants: friendWants,
      };
      addFriend(newFriend);
      setAddUsername("");
      setShowAddForm(false);
      setAddProgress("");
      toast.success(`Connected with @${profile.username} — ${friendAlbums.length} albums, ${friendWants.length} wants`);
    } catch (err: any) {
      console.error("[Friends] Connect error:", err);
      setAddError(err?.message || "Failed to connect. Check the username and try again.");
      setAddProgress("");
    } finally {
      setAddLoading(false);
    }
  }, [addUsername, friends, addFriend, isAuthenticated, discogsAuth]);

  if (selectedFriend) {
    return (
      <FriendProfile
        friend={selectedFriend}
        onBack={() => setSelectedFriendId(null)}
        onRemove={() => {
          removeFriend(selectedFriend.id);
          setSelectedFriendId(null);
          toast.success("Unfollowed @" + selectedFriend.username);
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
            <h2 className="screen-title" style={{ fontSize: "36px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.5px", lineHeight: 1.25, color: "var(--c-text)" }}>Following</h2>
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

      {/* Add Friend Form */}
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
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 flex items-start gap-2" style={{ fontSize: "13px", fontWeight: 400, color: "#FF33B6" }}>
                  <Lock size={14} className="flex-shrink-0 mt-0.5" />
                  {addError}
                </motion.p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overlay-scroll" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + var(--nav-clearance, 80px))" }} onScroll={onHeaderScroll}>
        {friends.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8 py-20">
            <Users size={48} style={{ color: "var(--c-text-faint)" }} />
            <p className="mt-4 text-center" style={{ fontSize: "16px", fontWeight: 500, color: "var(--c-text-muted)" }}>You're not following anyone yet.</p>
            <p className="mt-1 text-center" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
              Enter a Discogs username to follow their collection.
            </p>
          </div>
        ) : (
          <PopulatedFriendsView
            friends={friends}
            onSelectFriend={setSelectedFriendId}
            isDarkMode={isDarkMode}
            albums={albums}
            wants={wants}
            addToWantList={addToWantList}
            removeFromWantList={removeFromWantList}
            setAppScreen={setAppScreen}
          />
        )}
      </div>
    </div>
  );
}

/* ====== Friend Row with swipe-to-delete ====== */

function FriendRow({
  friend,
  onTap,
  onRemove,
}: {
  friend: Friend;
  onTap: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="relative overflow-hidden" style={{ borderColor: "var(--c-border)", borderBottomWidth: "1px", borderBottomStyle: "solid" }}>
      <div className="absolute inset-y-0 right-0 flex items-center px-5 bg-[#FF33B6]">
        <Trash2 size={18} color="white" />
      </div>

      <motion.div
        drag="x"
        dragConstraints={{ left: -80, right: 0 }}
        dragElastic={0.1}
        onDragEnd={(event: any, info: PanInfo) => {
          if (info.offset.x < -60) {
            onRemove();
          }
        }}
        className="relative z-10"
        style={{ backgroundColor: "var(--c-surface)" }}
      >
        <button
          onClick={onTap}
          className="w-full flex items-center gap-3 px-[16px] lg:px-[24px] py-3 text-left transition-colors hover:opacity-90 cursor-pointer"
        >
          {friend.avatar ? (
            <img
              src={friend.avatar}
              alt={friend.username}
              className="w-11 h-11 rounded-full object-cover flex-shrink-0"
              style={{ border: "2px solid var(--c-border)" }}
            />
          ) : (
            <div
              className="w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center"
              style={{ backgroundColor: "var(--c-chip-bg)", border: "2px solid var(--c-border)" }}
            >
              <Users size={18} style={{ color: "var(--c-text-muted)" }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: "15px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>
              @{friend.username}
            </p>
            {friend.isPrivate ? (
              <p className="flex items-center gap-1 mt-0.5" style={{ fontSize: "13px", fontWeight: 400, color: "#FF33B6" }}>
                <Lock size={11} /> Private collection
              </p>
            ) : (
              <p className="mt-0.5" style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-muted)" }}>
                {friend.collection.length} albums &middot; {friend.wants.length} wants
              </p>
            )}
          </div>
          <ChevronRight size={18} style={{ color: "var(--c-text-faint)" }} />
        </button>
      </motion.div>
    </div>
  );
}

/* ====== Friend Profile View ====== */

function FriendProfile({
  friend,
  onBack,
  onRemove,
  userAlbums,
  userWants,
}: {
  friend: Friend;
  onBack: () => void;
  onRemove: () => void;
  userAlbums: Album[];
  userWants: WantItem[];
}) {
  const [tab, setTab] = useState<FriendTab>("collection");
  const [filter, setFilter] = useState<FriendFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { onScroll: onHeaderScroll } = useHideHeaderOnScroll();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [crateIndex, setCrateIndex] = useState(0);
  const { isDarkMode } = useApp();

  const userReleaseIds = useMemo(() => new Set(userAlbums.map((a) => a.release_id)), [userAlbums]);
  const userCutReleaseIds = useMemo(() => new Set(userAlbums.filter((a) => a.purgeTag === "cut").map((a) => a.release_id)), [userAlbums]);
  const userWantReleaseIds = useMemo(() => new Set(userWants.map((w) => w.release_id)), [userWants]);
  const friendReleaseIds = useMemo(() => new Set(friend.collection.map((a) => a.release_id)), [friend.collection]);

  const inCommonCount = useMemo(() => friend.collection.filter((a) => userReleaseIds.has(a.release_id)).length, [friend.collection, userReleaseIds]);
  const theyWantYouCutCount = useMemo(() => friend.wants.filter((w) => userCutReleaseIds.has(w.release_id)).length, [friend.wants, userCutReleaseIds]);
  const youWantTheyHaveCount = useMemo(() => userWants.filter((w) => friendReleaseIds.has(w.release_id)).length, [userWants, friendReleaseIds]);

  const displayItems = useMemo(() => {
    if (tab === "wants") {
      let items = [...friend.wants];
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        items = items.filter((w) => w.artist.toLowerCase().includes(q) || w.title.toLowerCase().includes(q));
      }
      return items;
    }
    let items: Album[] = [...friend.collection];
    switch (filter) {
      case "in-common":
        items = items.filter((a) => userReleaseIds.has(a.release_id));
        break;
      case "they-want-you-cut": {
        const friendWantIds = new Set(friend.wants.map((w) => w.release_id));
        items = userAlbums.filter((a) => a.purgeTag === "cut" && friendWantIds.has(a.release_id));
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
  }, [tab, filter, friend, searchQuery, userReleaseIds, userCutReleaseIds, userWantReleaseIds, userAlbums]);

  if (friend.isPrivate) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 px-[16px] lg:px-[24px] py-[12px] lg:pt-[16px] lg:pb-[17px]">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer" style={{ color: "var(--c-text)" }}>
              <ArrowLeft size={20} />
            </button>
            <h2 className="screen-title" style={{ fontSize: "36px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.5px", lineHeight: 1.25, color: "var(--c-text)" }}>
              @{friend.username}
            </h2>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <Lock size={48} style={{ color: "var(--c-text-faint)" }} />
          <p className="mt-4 text-center" style={{ fontSize: "16px", fontWeight: 500, color: "var(--c-text-muted)" }}>Private Collection</p>
          <p className="mt-2 text-center max-w-[320px]" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)", lineHeight: "1.5" }}>
            This collection is set to private on Discogs. Ask @{friend.username} to make it public in their Discogs privacy settings.
          </p>
        </div>
      </div>
    );
  }

  const FILTER_CHIPS: { id: FriendFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: friend.collection.length },
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
          {friend.avatar ? (
            <img src={friend.avatar} alt={friend.username} className="w-9 h-9 rounded-full object-cover flex-shrink-0" style={{ border: "2px solid var(--c-border)" }} />
          ) : (
            <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: "var(--c-chip-bg)", border: "2px solid var(--c-border)" }}>
              <Users size={14} style={{ color: "var(--c-text-muted)" }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-[22px] lg:text-[36px] leading-[1.2]" style={{ fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.5px", color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>
              @{friend.username}
            </h2>
          </div>
          <a href={"https://www.discogs.com/user/" + friend.username} target="_blank" rel="noopener noreferrer"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{ color: "var(--c-text-muted)" }}>
            <ExternalLink size={16} />
          </a>
          <button
            onClick={() => setShowRemoveConfirm(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[rgba(255,51,182,0.1)] cursor-pointer"
            style={{ color: "#FF33B6" }}
            title="Unfollow"
          >
            <Trash2 size={16} />
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
            Collection ({friend.collection.length})
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
            Wantlist ({friend.wants.length})
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
          <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} modes={FRIEND_VIEW_MODES} />
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
            <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} modes={FRIEND_VIEW_MODES} compact />
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
      <div className="flex-1 overflow-y-auto overlay-scroll" onScroll={onHeaderScroll}>
        {displayItems.length === 0 ? (
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
                style={{ backgroundColor: "rgba(255, 51, 182, 0.06)", border: "1px solid rgba(255, 51, 182, 0.15)" }}>
                <span style={{ fontSize: "13px", fontWeight: 500, color: "#FF33B6", lineHeight: 1.5 }}>
                  {theyWantYouCutCount} album{theyWantYouCutCount !== 1 ? "s" : ""} you tagged as Purge that @{friend.username} wants. Reach out!
                </span>
              </div>
            )}
            {filter === "you-want-they-have" && youWantTheyHaveCount > 0 && (
              <div className="mx-[16px] lg:mx-[24px] mt-3 p-3 rounded-[10px]"
                style={{ backgroundColor: "rgba(255, 51, 182, 0.06)", border: "1px solid rgba(255, 51, 182, 0.15)" }}>
                <span style={{ fontSize: "13px", fontWeight: 500, color: "#FF33B6", lineHeight: 1.5 }}>
                  {youWantTheyHaveCount} album{youWantTheyHaveCount !== 1 ? "s" : ""} from your wantlist in @{friend.username}&apos;s collection.
                </span>
              </div>
            )}

            {viewMode === "crate" ? (
              <FriendCrateView items={displayItems} crateIndex={crateIndex} setCrateIndex={setCrateIndex} />
            ) : viewMode === "list" ? (
              <FriendListView items={displayItems} filter={filter} userCutIds={userCutReleaseIds} userWantIds={userWantReleaseIds} userIds={userReleaseIds} />
            ) : (
              <FriendGridView items={displayItems} viewMode={viewMode} filter={filter} userCutIds={userCutReleaseIds} userWantIds={userWantReleaseIds} userIds={userReleaseIds} />
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
                Unfollow @{friend.username}?
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
                  className="flex-1 py-2.5 rounded-[10px] bg-[#FF33B6] text-white transition-colors hover:bg-[#E6009E] cursor-pointer"
                  style={{ fontSize: "14px", fontWeight: 600 }}
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

/* ====== Crate (single-card) view ====== */
function FriendCrateView({ items, crateIndex, setCrateIndex }: {
  items: (Album | WantItem)[];
  crateIndex: number;
  setCrateIndex: (i: number) => void;
}) {
  const safeIndex = Math.min(crateIndex, items.length - 1);
  const current = items[safeIndex];
  if (!current) return null;

  return (
    <div className="flex flex-col items-center px-[16px] lg:px-[24px] py-6 gap-4">
      <div className="relative w-full max-w-[400px]">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="rounded-[12px] overflow-hidden"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}
        >
          <img src={current.cover} alt={current.title} className="w-full aspect-square object-cover" />
        </motion.div>
      </div>
      <div className="text-center max-w-[400px]">
        <p style={{ fontSize: "18px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>
          {current.title}
        </p>
        <p className="mt-0.5" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
          {current.artist} &middot; {current.year}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={() => setCrateIndex(Math.max(0, safeIndex - 1))}
          disabled={safeIndex === 0}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-30 cursor-pointer"
          style={{ backgroundColor: "var(--c-chip-bg)", color: "var(--c-text)" }}
        >
          <ArrowLeft size={18} />
        </button>
        <span style={{ fontSize: "13px", fontWeight: 500, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-text-muted)" }}>
          {safeIndex + 1} / {items.length}
        </span>
        <button
          onClick={() => setCrateIndex(Math.min(items.length - 1, safeIndex + 1))}
          disabled={safeIndex >= items.length - 1}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-30 cursor-pointer"
          style={{ backgroundColor: "var(--c-chip-bg)", color: "var(--c-text)", transform: "rotate(180deg)" }}
        >
          <ArrowLeft size={18} />
        </button>
      </div>
    </div>
  );
}

/* ====== Grid view ====== */
function FriendGridView({ items, viewMode, filter, userCutIds, userWantIds, userIds }: {
  items: (Album | WantItem)[]; viewMode: string; filter: FriendFilter;
  userCutIds: Set<number>; userWantIds: Set<number>; userIds: Set<number>;
}) {
  const { isDarkMode } = useApp();
  const isArtwork = viewMode === "artwork";
  const gridClass = isArtwork
    ? "grid grid-cols-4 gap-2 lg:gap-[10px] px-[16px] lg:px-[24px] pt-3 pb-4"
    : "grid grid-cols-2 lg:grid-cols-4 gap-3 px-[16px] lg:px-[24px] pt-3 pb-4";

  return (
    <div className={gridClass}>
      {items.map((item) => {
        const badge = getBadge(item.release_id, filter, userCutIds, userWantIds, userIds);

        if (isArtwork) {
          return (
            <div
              key={item.id}
              className="relative overflow-hidden group rounded-[10px]"
              style={{ aspectRatio: "1 / 1" }}
            >
              <img src={item.cover} alt={item.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" draggable={false} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
                <p className="text-white" style={{ fontSize: "13px", fontWeight: 600, lineHeight: "1.2", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{item.title}</p>
                <p className="text-[rgba(255,255,255,0.75)]" style={{ fontSize: "11px", fontWeight: 400, lineHeight: "1.3", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{item.artist}</p>
              </div>
              {badge && (
                <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: badge.color, fontSize: "10px", fontWeight: 600, color: "#fff" }}>
                  {badge.label}
                </div>
              )}
            </div>
          );
        }

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
                <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: badge.color, fontSize: "10px", fontWeight: 600, color: "#fff" }}>
                  {badge.label}
                </div>
              )}
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
function FriendListView({ items, filter, userCutIds, userWantIds, userIds }: {
  items: (Album | WantItem)[]; filter: FriendFilter;
  userCutIds: Set<number>; userWantIds: Set<number>; userIds: Set<number>;
}) {
  return (
    <div className="flex flex-col">
      {items.map((item) => {
        const badge = getBadge(item.release_id, filter, userCutIds, userWantIds, userIds);
        return (
          <div key={item.id} className="flex items-center gap-3 px-[16px] lg:px-[24px] py-2.5"
            style={{ borderColor: "var(--c-border)", borderBottomWidth: "1px", borderBottomStyle: "solid", borderLeft: badge ? "3px solid " + badge.color : "3px solid transparent" }}>
            <img src={item.cover} alt={item.title} className="w-11 h-11 rounded-[6px] object-cover flex-shrink-0" />
            <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
              <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{item.title}</p>
              <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{item.artist} &middot; {item.year}</p>
            </div>
            {badge && (
              <span className="px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: badge.color + "20", fontSize: "11px", fontWeight: 600, color: badge.color }}>
                {badge.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function getBadge(releaseId: number, filter: FriendFilter, userCutIds: Set<number>, userWantIds: Set<number>, userIds: Set<number>): { label: string; color: string } | null {
  if (filter !== "all") return null;
  if (userCutIds.has(releaseId)) return null;
  if (userIds.has(releaseId)) return { label: "In Common", color: "#0078B4" };
  if (userWantIds.has(releaseId)) return { label: "You Want", color: "#3E9842" };
  return null;
}

/* ====== Activity helpers ====== */

interface ActivityItem {
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

function formatActivityDate(iso: string): string {
  const d = new Date(iso);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function formatCollectionSince(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getInitial(username: string): string {
  return username.charAt(0).toUpperCase();
}

function buildActivityFeed(friends: Friend[]): ActivityItem[] {
  const items: ActivityItem[] = [];
  const recentDates = [
    "2026-02-18", "2026-02-15", "2026-02-12", "2026-02-10",
    "2026-02-07", "2026-02-04", "2026-01-30", "2026-01-26",
    "2026-01-22", "2026-01-18", "2026-01-15", "2026-01-12",
    "2026-01-08", "2026-01-04", "2025-12-28",
  ];
  for (const friend of friends) {
    if (friend.isPrivate || friend.collection.length === 0) continue;
    const sorted = [...friend.collection]
      .sort((a, b) => (b.dateAdded || "").localeCompare(a.dateAdded || ""))
      .slice(0, 30);
    sorted.forEach((album) => {
      items.push({
        id: `act-${friend.id}-${album.id}`,
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
  return items;
}

/* ====== Populated Friends View ====== */

function PopulatedFriendsView({
  friends,
  onSelectFriend,
  isDarkMode,
  albums: userAlbumsForHeart,
  wants: userWantsForHeart,
  addToWantList,
  removeFromWantList,
  setAppScreen,
}: {
  friends: Friend[];
  onSelectFriend: (id: string) => void;
  isDarkMode: boolean;
  albums: Album[];
  wants: WantItem[];
  addToWantList: (item: WantItem) => void;
  removeFromWantList: (releaseId: string | number) => void;
  setAppScreen: (s: Screen) => void;
}) {
  const activityFeed = useMemo(() => buildActivityFeed(friends), [friends]);

  // Track items that were just added to wantlist (for heart animation)
  const [justAddedWantIds, setJustAddedWantIds] = useState<Set<string>>(() => new Set());
  // Confirmation dialog for removing an item from the wantlist
  const [removeWantConfirm, setRemoveWantConfirm] = useState<ActivityItem | null>(null);

  // Sets for quick lookups
  const ownReleaseIds = useMemo(() => new Set(userAlbumsForHeart.map((a) => a.release_id)), [userAlbumsForHeart]);
  const wantReleaseIds = useMemo(() => new Set(userWantsForHeart.map((w) => w.release_id)), [userWantsForHeart]);

  // From the Depths — one random album per followed user, refreshed each mount (per-visit)
  const [depthsPicks] = useState(() => {
    return friends
      .filter((f) => !f.isPrivate && f.collection.length > 0)
      .map((friend) => {
        const randomIndex = Math.floor(Math.random() * friend.collection.length);
        return { friend, album: friend.collection[randomIndex] };
      });
  });

  const handleHeartTap = useCallback((item: ActivityItem) => {
    // Already in collection — no action
    if (ownReleaseIds.has(item.albumReleaseId)) return;
    // Already in wantlist — confirm removal
    if (wantReleaseIds.has(item.albumReleaseId) || justAddedWantIds.has(item.id)) {
      setRemoveWantConfirm(item);
      return;
    }
    // Add to wantlist
    addToWantList({
      id: `w-friend-${item.albumReleaseId}-${Date.now()}`,
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
  }, [ownReleaseIds, wantReleaseIds, justAddedWantIds, addToWantList]);

  return (
    <div className="flex flex-col">
      {/* ── Horizontal avatar row ── */}
      <div className="flex-shrink-0 px-[16px] lg:px-[24px] pt-[10px] pb-[14px]">
        <div className="flex items-start gap-[16px] overflow-x-auto no-scrollbar pb-1">
          {friends.map((friend) => (
            <button
              key={friend.id}
              onClick={() => onSelectFriend(friend.id)}
              className="flex flex-col items-center gap-[5px] shrink-0 cursor-pointer group"
              style={{ width: "56px" }}
            >
              {friend.avatar ? (
                <img
                  src={friend.avatar}
                  alt={friend.username}
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
                    {getInitial(friend.username)}
                  </span>
                </div>
              )}
              <span
                className="w-full text-center"
                style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", fontFamily: "'DM Sans', system-ui, sans-serif", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}
              >
                {friend.username}
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
              {depthsPicks.map(({ friend, album }) => (
                <motion.div
                  key={`depths-${friend.id}-${album.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.45, ease: [0.25, 1, 0.5, 1] }}
                  className="flex-shrink-0"
                  style={{ width: "270px" }}
                >
                  <DepthsAlbumCard
                    album={album}
                    onTap={() => onSelectFriend(friend.id)}
                    artworkPadded
                    dateLine={album.dateAdded ? `In their collection since ${formatCollectionSince(album.dateAdded)}` : undefined}
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
                          {friend.avatar ? (
                            <img
                              src={friend.avatar}
                              alt={friend.username}
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
                              {getInitial(friend.username)}
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
                          From {friend.username}&rsquo;s crates
                        </p>
                      </div>
                    }
                    footer={
                      <div className="flex justify-end mt-[8px]">
                        <button
                          onClick={(e) => { e.stopPropagation(); onSelectFriend(friend.id); }}
                          className="cursor-pointer tappable"
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
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-16">
          <p style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
            No recent activity from collectors you follow.
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {activityFeed.map((item) => {
            const inCollection = ownReleaseIds.has(item.albumReleaseId);
            const inWantList = wantReleaseIds.has(item.albumReleaseId) || justAddedWantIds.has(item.id);
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

                {/* Heart / "In collection" chip — unified three-state logic */}
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
        </div>
      )}

      {/* Wantlist removal confirmation */}
      <AnimatePresence>
        {removeWantConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center px-6"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
            onClick={() => setRemoveWantConfirm(null)}
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
                Remove {removeWantConfirm.albumTitle} from your wantlist?
              </p>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setRemoveWantConfirm(null)}
                  className="flex-1 py-2.5 rounded-[10px] transition-colors cursor-pointer"
                  style={{ fontSize: "14px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    removeFromWantList(removeWantConfirm.albumReleaseId);
                    setJustAddedWantIds((prev) => {
                      const next = new Set(prev);
                      next.delete(removeWantConfirm.id);
                      return next;
                    });
                    toast.success("Removed from wantlist.");
                    setRemoveWantConfirm(null);
                  }}
                  className="flex-1 py-2.5 rounded-[10px] bg-[#FF33B6] text-white transition-colors hover:bg-[#E6009E] cursor-pointer"
                  style={{ fontSize: "14px", fontWeight: 600 }}
                >
                  Remove
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}