import { useState, useRef, useMemo, useCallback } from "react";
import { Disc3, Info, AlertTriangle, CheckCircle2, ChevronRight, ChevronDown, Broom, LogOut, BarChart3, FolderOpen, Check, Star, MapPin, Pencil, UserPlus, RefreshCw, Bug, Lightbulb } from "./icons";
import { getInitial, formatSyncedAgo } from "../utils/format";
import { PurgeCutDialog } from "./purge-tracker";
import { FoldersScreen } from "./folders-screen";
import { BugReportSheet } from "./bug-report-sheet";
import { BugInboxScreen } from "./bug-inbox-screen";
import { SlideOutPanel } from "./slide-out-panel";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useApp } from "./app-context";
import type { Screen, SortOption, FormatScope, SessionRotation } from "./app-context";
import { CAP_TIERS, type CapValue } from "../../../convex/stackRules";
import { EASE_OUT, DURATION_NORMAL } from "./motion-tokens";
import { version as APP_VERSION } from "../../../package.json";
import { checkForUpdates } from "../lib/pwa-update";

const COLOR_MODE_OPTIONS: { value: "light" | "dark" | "system"; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const DEFAULT_SCREEN_OPTIONS: { value: Screen; label: string }[] = [
  { value: "feed", label: "Feed" },
  { value: "crate", label: "Collection" },
  { value: "wants", label: "Wantlist" },
  { value: "stacks", label: "Sessions" },
  { value: "reports", label: "Insights" },
];

const DEFAULT_COLLECTION_SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "added-new", label: "Recently Added" },
  { value: "artist-az", label: "Artist A–Z" },
  { value: "artist-za", label: "Artist Z–A" },
  { value: "title-az", label: "Title A–Z" },
  { value: "year-new", label: "Year (Newest First)" },
  { value: "year-old", label: "Year (Oldest First)" },
  { value: "label-az", label: "Label A–Z" },
];

const FORMAT_SCOPE_OPTIONS: { value: FormatScope; label: string }[] = [
  { value: "all", label: "All formats" },
  { value: "vinyl", label: "Vinyl only" },
];

/** Cap tiers, named in listening terms — see CAP_TIERS in stackRules.ts. */
const SESSION_CAP_OPTIONS: { value: CapValue; label: string; sub: string }[] =
  CAP_TIERS.map((t) => ({
    value: t.value,
    label: t.label,
    sub: t.limit ? `${t.limit} records` : "Everything that matches",
  }));

const SESSION_ROTATION_OPTIONS: { value: SessionRotation; label: string; sub: string }[] = [
  { value: "daily", label: "Daily", sub: "A new set each morning" },
  { value: "weekly", label: "Weekly", sub: "A new set each week" },
  { value: "off", label: "Off", sub: "Always the same records" },
];

export function SettingsScreen() {
  const {
    discogsUsername,
    sessionToken,
    isSyncing,
    isBackgroundSyncing,
    syncProgress,
    lastSynced,
    syncFromDiscogs,
    syncStats,
    albums,
    wants,
    folders,
    setScreen,
    isDarkMode,
    colorMode,
    setColorMode,
    hidePurgeIndicators,
    setHidePurgeIndicators,
    signOut,
    accounts,
    switchAccount,
    addAccount,
    isAuthenticated,
    userAvatar,
    userProfile,
    updateProfile,
    shakeToRandom,
    setShakeToRandom,
    defaultScreen,
    setDefaultScreen,
    defaultCollectionSort,
    setDefaultCollectionSort,
    formatScope,
    sessionCap,
    setSessionCap,
    sessionRotation,
    setSessionRotation,
    setFormatScope,
    executePurgeCut,
    stacks,
    deleteStack,
    deletePurgeTag,
    wipeAllData,
    clearPlayHistory,
    clearFollowedUsers,
    clearWantlistPriorities,
  } = useApp();

  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [motionDenied, setMotionDenied] = useState(false);
  const [showFolders, setShowFolders] = useState(false);

  // ── Feedback ──
  // The admin inbox is gated server-side (bugReports.listAll returns null for
  // non-admins); amIAdmin only decides whether the row is worth rendering.
  const [showBugReport, setShowBugReport] = useState(false);
  const [showBugInbox, setShowBugInbox] = useState(false);
  const authedArgs = sessionToken ? { sessionToken } : "skip";
  const myReports = useQuery(api.bugReports.listMine, authedArgs);
  const isAdmin = useQuery(api.bugReports.amIAdmin, authedArgs);
  const inboxNewCount = useQuery(api.bugReports.newCount, authedArgs) ?? 0;
  const motionDeniedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Purge Cut dialog (execution lives in context via executePurgeCut)
  const [showPurgeCutDialog, setShowPurgeCutDialog] = useState(false);
  const [showDefaultScreenPicker, setShowDefaultScreenPicker] = useState(false);
  const [showDefaultSortPicker, setShowDefaultSortPicker] = useState(false);
  const [showSessionCapPicker, setShowSessionCapPicker] = useState(false);
  const [showSessionRotationPicker, setShowSessionRotationPicker] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const handleCheckUpdates = useCallback(async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    const res = await checkForUpdates();
    setCheckingUpdate(false);
    // "updated" → the persistent "Update available." toast is shown by the
    // update flow's onNeedRefresh; only report the other outcomes here.
    if (res === "current") toast("Up to date.");
    else if (res === "error") toast.error("Couldn't check for updates.");
  }, [checkingUpdate]);

  // Profile edit state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfile, setEditProfile] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [showContributions, setShowContributions] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);

  const startEditProfile = useCallback(() => {
    setEditProfile(userProfile?.profile || "");
    setEditLocation(userProfile?.location || "");
    setIsEditingProfile(true);
  }, [userProfile]);

  const saveProfile = useCallback(async () => {
    setIsSavingProfile(true);
    try {
      await updateProfile({ profile: editProfile, location: editLocation });
      setIsEditingProfile(false);
      toast.success("Profile updated.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update profile.");
    } finally {
      setIsSavingProfile(false);
    }
  }, [editProfile, editLocation, updateProfile]);

  const cutAlbums = useMemo(() => albums.filter((a) => a.purgeTag === "cut"), [albums]);

  const handleShakeToggle = async () => {
    if (shakeToRandom) {
      setShakeToRandom(false);
      return;
    }
    // Cancel any in-flight denial timer so a re-tap doesn't get preempted
    // by the previous timeout clearing the message mid-permission-prompt.
    if (motionDeniedTimerRef.current !== null) {
      clearTimeout(motionDeniedTimerRef.current);
      motionDeniedTimerRef.current = null;
    }
    if (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof (DeviceMotionEvent as any).requestPermission === "function"
    ) {
      try {
        const permission = await (DeviceMotionEvent as any).requestPermission();
        if (permission !== "granted") {
          setMotionDenied(true);
          motionDeniedTimerRef.current = setTimeout(() => {
            setMotionDenied(false);
            motionDeniedTimerRef.current = null;
          }, 4000);
          return;
        }
      } catch {
        setMotionDenied(true);
        motionDeniedTimerRef.current = setTimeout(() => {
          setMotionDenied(false);
          motionDeniedTimerRef.current = null;
        }, 4000);
        return;
      }
    }
    setMotionDenied(false);
    setShakeToRandom(true);
  };

  // Logged-out state — show minimal sign-in prompt
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-[32px] gap-4">
        <p style={{ fontSize: "15px", fontWeight: 400, color: "var(--c-text-secondary)", textAlign: "center" }}>
          You're not signed in.
        </p>
        <button
          onClick={() => setScreen("feed")}
          className="px-6 py-2.5 rounded-full bg-[#EBFD00] text-[#16181C] hover:bg-[#d9e800] transition-colors"
          style={{ fontSize: "14px", fontWeight: 600 }}
        >
          Log in with Discogs
        </button>
      </div>
    );
  }

  const handleSync = async () => {
    setSyncError(null);
    try {
      const stats = await syncFromDiscogs();
      toast.success(`Synced \u2014 ${stats.albums} records \u00b7 ${stats.folders} folders \u00b7 ${stats.wants} wantlist items`);
    } catch (err: any) {
      const msg = err?.message || "Sync failed. Check your token and try again.";
      console.error("[Discogs Sync Error]", err);
      setSyncError(msg);
      toast.error(msg);
    }
  };

  const handleSignOut = () => {
    signOut();
    toast.success("Signed out.");
  };

  const handleSwitchAccount = (username: string) => {
    if (username === discogsUsername || switchingTo) return;
    setSwitchingTo(username); // brief pressed state before the reload
    switchAccount(username);
  };

  const handleAddAccount = async () => {
    try {
      await addAccount(); // page redirects to Discogs
    } catch {
      toast.error("Couldn't start sign-in.");
    }
  };

  const handleConfirmClear = async () => {
    if (!confirmAction) return;
    if (confirmAction === "Purge data") {
      for (const a of albums) {
        if (a.purgeTag) deletePurgeTag(a.release_id);
      }
      toast.success("Purge data cleared.");
    } else if (confirmAction === "Sessions") {
      for (const s of stacks) {
        deleteStack(s.id);
      }
      toast.success("Sessions cleared.");
    } else if (confirmAction === "Play history") {
      try {
        await clearPlayHistory();
        toast.success("Play history cleared.");
      } catch (err) {
        console.error("[Clear Play History] Failed:", err);
        toast.error("Failed to clear play history.");
        setConfirmAction(null);
        return;
      }
    } else if (confirmAction === "Followed users") {
      try {
        await clearFollowedUsers();
        toast.success("Followed users cleared.");
      } catch (err) {
        console.error("[Clear Following] Failed:", err);
        toast.error("Failed to clear followed users.");
        setConfirmAction(null);
        return;
      }
    } else if (confirmAction === "Wantlist priorities") {
      try {
        await clearWantlistPriorities();
        toast.success("Wantlist priorities cleared.");
      } catch (err) {
        console.error("[Clear Want Priorities] Failed:", err);
        toast.error("Failed to clear priorities.");
        setConfirmAction(null);
        return;
      }
    } else if (confirmAction === "All data") {
      try {
        await wipeAllData();
        toast.success("All data deleted.");
      } catch (err) {
        console.error("[Delete All Data] Failed:", err);
        toast.error("Failed to delete data.");
        setConfirmAction(null);
        return;
      }
    }
    setConfirmAction(null);
  };

  if (showFolders) {
    return <FoldersScreen onBack={() => setShowFolders(false)} />;
  }

  if (showBugInbox) {
    return <BugInboxScreen onBack={() => setShowBugInbox(false)} />;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto overlay-scroll px-[16px] lg:px-[24px] pt-[0px]" style={{ paddingBottom: "calc(24px + var(--nav-clearance, 0px))" }}>
        <section className="mt-4">
          <SettingsCard
            title="Discogs Profile"
            headerAction={
              userProfile ? (
                <button
                  onClick={isEditingProfile ? () => setIsEditingProfile(false) : startEditProfile}
                  className="flex items-center justify-center cursor-pointer transition-opacity hover:opacity-70 flex-shrink-0"
                  style={{ padding: "4px", marginRight: "-4px" }}
                  aria-label={isEditingProfile ? "Cancel editing" : "Edit profile"}
                >
                  <Pencil size={16} style={{ color: isEditingProfile ? "var(--c-text-faint)" : "var(--c-text-secondary)" }} />
                </button>
              ) : undefined
            }
          >
          {/* This card's body is a profile, not a list of settings, so it keeps
              its own denser stack rather than the hairline row anatomy. */}
          <div className="px-4 py-4 flex flex-col gap-4" style={ROW_BORDER}>

            {/* Avatar + username + member since */}
            <div className="flex items-center gap-3">
              {userAvatar ? (
                <img src={userAvatar} alt="Your avatar" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--c-chip-bg)" }} />
              )}
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--c-text)" }}>{discogsUsername}</p>
                <div className="flex items-center gap-1" style={{ marginTop: "2px" }}>
                  {userProfile?.location && !isEditingProfile && (
                    <>
                      <MapPin size={11} style={{ color: "var(--c-text-muted)" }} className="flex-shrink-0" />
                      <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>{userProfile.location}</span>
                      {userProfile?.registered && (
                        <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-faint)", margin: "0 2px" }}>&middot;</span>
                      )}
                    </>
                  )}
                  {userProfile?.registered ? (
                    <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
                      Member since {new Date(userProfile.registered).getFullYear()}
                    </span>
                  ) : (
                    <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>Connected via Discogs</span>
                  )}
                </div>
              </div>
            </div>

            {/* About / Profile text */}
            {userProfile?.profile && !isEditingProfile && (
              <p style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-secondary)", lineHeight: 1.5 }}>{userProfile.profile}</p>
            )}

            {/* Edit profile form */}
            {isEditingProfile && (
              <div className="flex flex-col gap-3">
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)", display: "block", marginBottom: "4px" }}>Location</label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="City, Country"
                    className="w-full rounded-[8px] px-3 py-2 outline-none"
                    style={{
                      fontSize: "16px",
                      fontWeight: 400,
                      color: "var(--c-text)",
                      backgroundColor: "var(--c-input-bg)",
                      border: "1px solid var(--c-border)",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)", display: "block", marginBottom: "4px" }}>About</label>
                  <textarea
                    value={editProfile}
                    onChange={(e) => setEditProfile(e.target.value)}
                    placeholder="Tell us about your collection..."
                    rows={3}
                    className="w-full rounded-[8px] px-3 py-2 outline-none resize-none"
                    style={{
                      fontSize: "16px",
                      fontWeight: 400,
                      color: "var(--c-text)",
                      backgroundColor: "var(--c-input-bg)",
                      border: "1px solid var(--c-border)",
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditingProfile(false)}
                    className="flex-1 py-2 rounded-[8px] transition-colors cursor-pointer"
                    style={{ fontSize: "13px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text-secondary)" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveProfile}
                    disabled={isSavingProfile}
                    className="flex-1 py-2 rounded-[8px] bg-[#EBFD00] text-[#16181C] hover:bg-[#d9e800] transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1.5"
                    style={{ fontSize: "13px", fontWeight: 600 }}
                  >
                    {isSavingProfile && <Disc3 size={13} className="disc-spinner" />}
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* Buyer / Seller ratings — always two columns */}
            {userProfile && (
              <div className="flex gap-4">
                <div className="flex flex-col gap-0.5 flex-1">
                  <p style={{ fontSize: "11px", fontWeight: 500, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Buyer</p>
                  {userProfile.buyerRatingStars > 0 ? (
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          size={14}
                          weight={i < userProfile.buyerRatingStars ? "fill" : "light"}
                          color={i < userProfile.buyerRatingStars ? "#FFC107" : "var(--c-text-faint)"}
                        />
                      ))}
                      <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)", marginLeft: "4px" }}>
                        {userProfile.buyerRating.toFixed(1)}
                      </span>
                    </div>
                  ) : (
                    <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-faint)" }}>No buyer rating</p>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 flex-1">
                  <p style={{ fontSize: "11px", fontWeight: 500, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Seller</p>
                  {userProfile.sellerRatingStars > 0 ? (
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          size={14}
                          weight={i < userProfile.sellerRatingStars ? "fill" : "light"}
                          color={i < userProfile.sellerRatingStars ? "#FFC107" : "var(--c-text-faint)"}
                        />
                      ))}
                      <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)", marginLeft: "4px" }}>
                        {userProfile.sellerRating.toFixed(1)}
                      </span>
                    </div>
                  ) : (
                    <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-faint)" }}>No seller rating</p>
                  )}
                </div>
              </div>
            )}

            {/* Contributions accordion */}
            {userProfile && (userProfile.releasesContributed > 0 || userProfile.releasesRated > 0 || userProfile.numLists > 0) && (
              <>
                <div style={{ borderTop: "1px solid var(--c-border)" }} />
                <button
                  onClick={() => setShowContributions(!showContributions)}
                  className="flex items-center justify-between cursor-pointer transition-opacity hover:opacity-70"
                >
                  <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)" }}>Contributions</span>
                  <ChevronDown
                    size={16}
                    style={{
                      color: "var(--c-text-muted)",
                      transform: showContributions ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 200ms ease-out",
                    }}
                  />
                </button>
                {showContributions && (
                  <div className="flex flex-col gap-2">
                    {userProfile.releasesContributed > 0 && (
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-secondary)" }}>Releases contributed</span>
                        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text)" }}>{userProfile.releasesContributed.toLocaleString()}</span>
                      </div>
                    )}
                    {userProfile.releasesRated > 0 && (
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-secondary)" }}>Releases rated</span>
                        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text)" }}>{userProfile.releasesRated.toLocaleString()}</span>
                      </div>
                    )}
                    {userProfile.numLists > 0 && (
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-secondary)" }}>Lists</span>
                        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text)" }}>{userProfile.numLists.toLocaleString()}</span>
                      </div>
                    )}
                    {userProfile.rank > 0 && (
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-secondary)" }}>Contributor rank</span>
                        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text)" }}>#{userProfile.rank.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Accounts accordion — switch between signed-in Discogs accounts, or add one */}
            {isAuthenticated && (
              <>
                <div style={{ borderTop: "1px solid var(--c-border)" }} />
                <button
                  onClick={() => setShowAccounts(!showAccounts)}
                  className="flex items-center justify-between cursor-pointer transition-opacity hover:opacity-70"
                >
                  <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)" }}>Accounts</span>
                  <ChevronDown
                    size={16}
                    style={{
                      color: "var(--c-text-muted)",
                      transform: showAccounts ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 200ms ease-out",
                    }}
                  />
                </button>
                {showAccounts && (
                  <div className="flex flex-col gap-1">
                {accounts.map((a) => {
                  const active = a.username === discogsUsername;
                  const switching = switchingTo === a.username;
                  return (
                    <button
                      key={a.username}
                      onClick={() => handleSwitchAccount(a.username)}
                      disabled={active || !!switchingTo}
                      aria-label={active ? `${a.username}, current account` : `Switch to ${a.username}`}
                      aria-pressed={active}
                      className="w-full flex items-center gap-2.5 py-2 px-2 rounded-[8px] tappable transition-colors"
                      style={{ cursor: active ? "default" : "pointer" }}
                    >
                      {a.avatarUrl ? (
                        <img src={a.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div
                          className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center"
                          style={{ backgroundColor: "var(--c-chip-bg)", fontSize: "12px", fontWeight: 600, color: "var(--c-text-secondary)" }}
                        >
                          {getInitial(a.username)}
                        </div>
                      )}
                      <span
                        className="flex-1 text-left"
                        style={{
                          fontSize: "14px",
                          fontWeight: 500,
                          color: "var(--c-text)",
                          display: "block",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          WebkitTextOverflow: "ellipsis",
                          maxWidth: "100%",
                        } as React.CSSProperties}
                      >
                        {a.username}
                      </span>
                      {switching ? (
                        <Disc3 size={16} className="disc-spinner flex-shrink-0" style={{ color: "var(--c-text-muted)" }} />
                      ) : active ? (
                        <Check size={16} className="flex-shrink-0" style={{ color: "var(--c-link)" }} />
                      ) : null}
                    </button>
                  );
                })}
                <button
                  onClick={handleAddAccount}
                  disabled={!!switchingTo}
                  aria-label="Add account"
                  className="w-full flex items-center gap-2.5 py-2 px-2 rounded-[8px] tappable transition-colors"
                  style={{ cursor: "pointer" }}
                >
                  <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center" style={{ border: "1px solid var(--c-border-strong)" }}>
                    <UserPlus size={15} style={{ color: "var(--c-text-secondary)" }} />
                  </div>
                  <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)" }}>Add account</span>
                </button>
                  </div>
                )}
              </>
            )}

            {/* Divider before sync section */}
            <div style={{ borderTop: "1px solid var(--c-border)" }} />

            {/* Collection stats row */}
            <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-secondary)", textAlign: "center" }}>
              {syncStats
                ? `${syncStats.albums} records \u00b7 ${syncStats.folders} folders \u00b7 ${syncStats.wants} wantlist items`
                : `${albums.length} records \u00b7 ${folders.filter((f) => f.name !== "All").length} folders \u00b7 ${wants.length} wantlist items`
              }
            </p>

            <button onClick={handleSync} disabled={isSyncing || isBackgroundSyncing}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-[#EBFD00] text-[#16181C] hover:bg-[#d9e800] transition-colors disabled:opacity-60 cursor-pointer"
              style={{ fontSize: "14px", fontWeight: 600, border: "1px solid rgba(22,24,28,0.25)" }}>
              <Disc3 size={16} className={(isSyncing || isBackgroundSyncing) ? "disc-spinner" : ""} />
              {(isSyncing || isBackgroundSyncing) ? (syncProgress || "Syncing...") : "Sync Now"}
            </button>
            {syncError && (
              <div className="rounded-[8px] p-3 flex items-start gap-2" style={{ backgroundColor: "var(--c-destructive-tint)", border: "1px solid rgba(255,51,182,0.2)" }}>
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: "var(--c-destructive-text)" }} />
                <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-destructive-text)", wordBreak: "break-word" }}>{syncError}</p>
              </div>
            )}
            {lastSynced && (
              <div className="flex items-center justify-center gap-1.5">
                <CheckCircle2 size={13} className="text-[#22C55E]" />
                <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>Last synced {lastSynced}</p>
              </div>
            )}

            {/* Sign out — visible when authenticated */}
            {isAuthenticated && (
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] transition-colors cursor-pointer"
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--c-text-secondary)",
                  backgroundColor: "var(--c-chip-bg)",
                  border: "1px solid var(--c-border)",
                }}
              >
                <LogOut size={15} />
                Sign out
              </button>
            )}
          </div>
          </SettingsCard>
        </section>

        {/* Tools section — 3-column icon grid */}
        <section className="mt-6">
          <h3 style={{ fontSize: "20px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.3px", color: "var(--c-text)", marginBottom: "12px" }}>Tools</h3>
          <div className="grid grid-cols-3 gap-3">
            {/* Purge Tracker tile */}
            <button
              onClick={() => setScreen("purge")}
              className="rounded-[12px] flex flex-col items-center justify-center gap-2 py-4 px-3 cursor-pointer transition-opacity hover:opacity-90"
              style={{
                backgroundColor: isDarkMode ? "rgba(172,222,242,0.06)" : "rgba(172,222,242,0.12)",
                border: `1px solid ${isDarkMode ? "rgba(172,222,242,0.12)" : "rgba(172,222,242,0.3)"}`,
              }}
            >
              <Broom size={20} style={{ color: isDarkMode ? "#ACDEF2" : "#0078B4" }} />
              <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--c-text)", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
                Purge
              </p>
            </button>

            {/* Insights tile */}
            <button
              onClick={() => setScreen("reports")}
              className="rounded-[12px] flex flex-col items-center justify-center gap-2 py-4 px-3 cursor-pointer transition-opacity hover:opacity-90"
              style={{
                backgroundColor: isDarkMode ? "rgba(172,222,242,0.06)" : "rgba(172,222,242,0.12)",
                border: `1px solid ${isDarkMode ? "rgba(172,222,242,0.12)" : "rgba(172,222,242,0.3)"}`,
              }}
            >
              <BarChart3 size={20} style={{ color: isDarkMode ? "#ACDEF2" : "#0078B4" }} />
              <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--c-text)", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
                Insights
              </p>
            </button>

            {/* Folders tile */}
            <button
              onClick={() => setShowFolders(true)}
              className="rounded-[12px] flex flex-col items-center justify-center gap-2 py-4 px-3 cursor-pointer transition-opacity hover:opacity-90"
              style={{
                backgroundColor: isDarkMode ? "rgba(172,222,242,0.06)" : "rgba(172,222,242,0.12)",
                border: `1px solid ${isDarkMode ? "rgba(172,222,242,0.12)" : "rgba(172,222,242,0.3)"}`,
              }}
            >
              <FolderOpen size={20} style={{ color: isDarkMode ? "#ACDEF2" : "#0078B4" }} />
              <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--c-text)", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
                Folders
              </p>
            </button>
          </div>
        </section>

        <section className="mt-6">
          <SettingsCard title="Appearance">
            <SettingRow title="Color mode">
              <Segmented
                ariaLabel="Color mode"
                options={COLOR_MODE_OPTIONS}
                value={colorMode}
                onChange={setColorMode}
                isDarkMode={isDarkMode}
              />
            </SettingRow>
            <SettingRow
              title="Hide purge indicators"
              description="Remove Keep/Maybe/Cut dots from collection views"
            >
              <Toggle
                label="Hide purge indicators"
                checked={hidePurgeIndicators}
                onChange={() => setHidePurgeIndicators(!hidePurgeIndicators)}
                isDarkMode={isDarkMode}
              />
            </SettingRow>
            <SettingRow
              title="Default screen"
              description="The first screen shown when you open the app"
              onClick={() => setShowDefaultScreenPicker(true)}
            >
              <RowValue>
                {DEFAULT_SCREEN_OPTIONS.find((o) => o.value === defaultScreen)?.label ?? "Feed"}
              </RowValue>
            </SettingRow>
            <SettingRow
              title="Default collection sort"
              description="The default sort order for your collection"
              onClick={() => setShowDefaultSortPicker(true)}
            >
              <RowValue>
                {DEFAULT_COLLECTION_SORT_OPTIONS.find((o) => o.value === defaultCollectionSort)?.label ?? "Recently Added"}
              </RowValue>
            </SettingRow>
            {/* Two options, so it's an inline choice rather than a drill-in
                sheet — a full-screen panel to pick between two things was more
                taps than the setting is worth. */}
            <SettingRow title="Formats" description="Which formats from Discogs show up here">
              <Segmented
                ariaLabel="Formats"
                options={FORMAT_SCOPE_OPTIONS}
                value={formatScope}
                onChange={(value) => {
                  setFormatScope(value);
                  toast.success(value === "vinyl" ? "Showing vinyl only." : "Showing all formats.");
                }}
                isDarkMode={isDarkMode}
              />
            </SettingRow>
          </SettingsCard>
        </section>

        {/* Sessions — the defaults a newly built session starts from. This
            section is a precondition for rotation defaulting on, not a
            follow-up: on-by-default is only honest if the setting is somewhere
            findable, next to Gestures and Formats where people already look. */}
        <section className="mt-6">
          <SettingsCard title="Sessions">
            <SettingRow
              title="Session length"
              description="How much a session that fills itself plays"
              onClick={() => setShowSessionCapPicker(true)}
            >
              <RowValue>
                {SESSION_CAP_OPTIONS.find((o) => o.value === sessionCap)?.label ?? "An evening"}
              </RowValue>
            </SettingRow>
            <SettingRow
              title="Rotation"
              description={
                sessionCap === "none"
                  ? "Only applies when a session has a length"
                  : "Swap in a different set when there's more than fits"
              }
              onClick={() => setShowSessionRotationPicker(true)}
              disabled={sessionCap === "none"}
            >
              <RowValue>
                {sessionCap === "none"
                  ? "Off"
                  : SESSION_ROTATION_OPTIONS.find((o) => o.value === sessionRotation)?.label ?? "Daily"}
              </RowValue>
            </SettingRow>
            <RowNote>
              These apply to new sessions. Ones you've already built keep their own rules.
            </RowNote>
          </SettingsCard>
        </section>

        <section className="mt-6">
          <SettingsCard title="Gestures">
            <SettingRow
              title="Shake for random"
              description={
                <>
                  Shake your device to open a random album
                  {motionDenied && (
                    <span
                      className="block mt-1"
                      style={{ color: isDarkMode ? "#FF98DA" : "#9A207C" }}
                    >
                      Motion access denied. Enable in iOS Settings.
                    </span>
                  )}
                </>
              }
            >
              <Toggle
                label="Shake for random"
                checked={shakeToRandom}
                onChange={handleShakeToggle}
                isDarkMode={isDarkMode}
              />
            </SettingRow>
          </SettingsCard>
        </section>

        <section className="mt-6">
          <SettingsCard title="Data">
            <ActionRow label="Clear Purge Data" onClick={() => setConfirmAction("Purge data")} />
            <ActionRow label="Clear Sessions" onClick={() => setConfirmAction("Sessions")} />
            <ActionRow label="Clear Play History" onClick={() => setConfirmAction("Play history")} />
            <ActionRow label="Clear Followed Users" onClick={() => setConfirmAction("Followed users")} />
            <ActionRow label="Clear Wantlist Priorities" onClick={() => setConfirmAction("Wantlist priorities")} />
            <ActionRow label="Delete All My Data" onClick={() => setConfirmAction("All data")} destructive />
          </SettingsCard>
        </section>

        <section className="mt-6">
          <SettingsCard title="Your data">
            <div
              className="px-4 py-3 flex flex-col gap-2.5"
              style={{ ...ROW_BORDER, fontSize: "14px", fontWeight: 400, color: "var(--c-text-secondary)", lineHeight: 1.6, textWrap: "pretty" }}
            >
              <p style={{ margin: 0 }}>
                Holy Grails connects to your Discogs account with OAuth — we store the access token and a cached copy of your collection and wantlist so the app loads fast. Purge tags, sessions, plays, and follows exist only in Holy Grails.
              </p>
              <p style={{ margin: 0 }}>
                We never change anything on Discogs unless you tap the button that does it. Listening activity is private unless you opt in to sharing.
              </p>
              <p style={{ margin: 0 }}>
                If the app crashes, a technical error report reaches the developer so it can get fixed. It never includes your collection.
              </p>
              <p style={{ margin: 0 }}>
                When you report a problem, we send your note along with your app version, device, and a few counts — you can see the full list before sending.
              </p>
              {/* Non-breaking spaces around the arrows keep the whole
                  discogs.com -> Settings -> Applications path on one line, so
                  an arrow can never orphan at the start of a line. It fits the
                  column down to a 320px viewport. */}
              <p style={{ margin: 0 }}>
                Want out? Delete All My Data above removes everything on our side, and you can revoke access anytime at discogs.com{" → "}Settings{" → "}Applications.
              </p>
            </div>
          </SettingsCard>
        </section>

        <section className="mt-6">
          <SettingsCard title="Feedback">
            <SettingRow
              title="Report a problem"
              description="Something broke, or an idea. Sends what version and device you're on."
              onClick={() => setShowBugReport(true)}
            >
              <RowChevron />
            </SettingRow>

            {isAdmin && (
              <SettingRow title="Reports inbox" onClick={() => setShowBugInbox(true)}>
                {inboxNewCount > 0 && (
                  <span
                    className="px-2 py-0.5 rounded-full"
                    style={{ fontSize: "11px", fontWeight: 600, backgroundColor: "var(--c-destructive-tint)", color: "var(--c-destructive-text)" }}
                  >
                    {inboxNewCount} new
                  </span>
                )}
                <RowChevron />
              </SettingRow>
            )}

            {myReports && myReports.length > 0 && (
              <div className="px-4 py-3 flex flex-col" style={ROW_BORDER}>
                <p className="pb-1.5" style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--c-text-faint)" }}>
                  Your reports
                </p>
                {myReports.slice(0, 5).map((report) => {
                  const isFixed = report.status === "fixed";
                  const isKnown = report.status === "known";
                  const chipLabel = isFixed
                    ? (report.kind === "idea" ? "Shipped" : "Fixed")
                    : isKnown ? "Known" : "New";
                  return (
                    <div key={report._id} className="py-2" style={{ borderTop: "1px solid var(--c-border)" }}>
                      <div className="flex items-start gap-2">
                        {report.kind === "bug"
                          ? <Bug size={14} style={{ color: "var(--c-text-faint)", flexShrink: 0, marginTop: "2px" }} />
                          : <Lightbulb size={14} style={{ color: "var(--c-text-faint)", flexShrink: 0, marginTop: "2px" }} />}
                        <p className="flex-1 min-w-0 line-clamp-2" style={{ fontSize: "13px", color: "var(--c-text-secondary)", lineHeight: 1.4 }}>
                          {report.message}
                        </p>
                        <span
                          className="px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            backgroundColor: isFixed
                              ? "rgba(62,152,66,0.16)"
                              : isKnown
                                ? (isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)")
                                : "var(--c-chip-bg)",
                            color: isFixed
                              ? "#3E9842"
                              : isKnown
                                ? (isDarkMode ? "#ACDEF2" : "#00527A")
                                : "var(--c-text-muted)",
                          }}
                        >
                          {chipLabel}
                        </span>
                      </div>
                      {report.resolution_note && (
                        <p className="mt-1 ml-6" style={{ fontSize: "12px", color: "var(--c-text-muted)", lineHeight: 1.4 }}>
                          {report.resolution_note}
                        </p>
                      )}
                      <p className="mt-1 ml-6" style={{ fontSize: "11px", color: "var(--c-text-faint)" }}>
                        {formatSyncedAgo(report.created_at) ?? ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </SettingsCard>
        </section>

        <section className="mt-6 mb-4">
          <div className="flex items-center gap-2" style={{ color: "var(--c-text-muted)" }}>
            <Info size={14} />
            <span style={{ fontSize: "12px", fontWeight: 400 }}>Holy Grails v{APP_VERSION}. A Discogs companion app.</span>
          </div>
          <button
            onClick={handleCheckUpdates}
            disabled={checkingUpdate}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full transition-colors tappable disabled:opacity-60"
            style={{ fontSize: "13px", fontWeight: 500, fontFamily: "'DM Sans', system-ui, sans-serif", backgroundColor: "var(--c-chip-bg)", color: "var(--c-text-secondary)" }}
          >
            {checkingUpdate ? <Disc3 size={14} className="disc-spinner" /> : <RefreshCw size={14} weight="bold" />}
            {checkingUpdate ? "Checking..." : "Check for updates"}
          </button>
        </section>
      </div>

      <AnimatePresence>
        {showPurgeCutDialog && (
          <PurgeCutDialog
            cutAlbums={cutAlbums}
            isDark={isDarkMode}
            onCancel={() => setShowPurgeCutDialog(false)}
            onConfirm={() => { setShowPurgeCutDialog(false); executePurgeCut(); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmAction && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: "none" as const }} transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }} className="fixed inset-0 bg-black/25 z-[80]" onClick={() => setConfirmAction(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[90] w-[320px] rounded-[16px] p-5"
              style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", boxShadow: "var(--c-shadow-modal)" }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--c-destructive-tint)" }}>
                  <AlertTriangle size={20} style={{ color: "var(--c-destructive-text)" }} />
                </div>
                <div>
                  <p style={{ fontSize: "16px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>
                    {confirmAction === "All data" ? "Delete all data?" : `Clear ${confirmAction}?`}
                  </p>
                  <p className="mt-0.5" style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-tertiary)" }}>
                    {confirmAction === "Purge data"
                      ? "This removes all Keep, Cut, and Maybe tags from your collection. This cannot be undone."
                      : confirmAction === "Sessions"
                      ? "This deletes all saved sessions. This cannot be undone."
                      : confirmAction === "Play history"
                      ? "This removes all last-played timestamps. This cannot be undone."
                      : confirmAction === "Followed users"
                      ? "This will also remove their cached collection data."
                      : confirmAction === "Wantlist priorities"
                      ? "This removes all custom priority rankings from your wantlist. This cannot be undone."
                      : "This permanently deletes all Holy Grails data \u2014 purge tags, sessions, following, listening history, preferences, and cached data. Your Discogs account is not affected. You will be signed out."}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setConfirmAction(null)} className="flex-1 py-2.5 rounded-[10px] transition-colors cursor-pointer" style={{ fontSize: "14px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text-secondary)" }}>Cancel</button>
                <button onClick={handleConfirmClear} className="flex-1 py-2.5 rounded-[10px] text-white transition-colors cursor-pointer" style={{ fontSize: "14px", fontWeight: 600, backgroundColor: "var(--c-destructive)" }}>
                  {confirmAction === "All data" ? "Delete" : "Clear"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDefaultScreenPicker && (
          <SlideOutPanel
            title="Default screen"
            onClose={() => setShowDefaultScreenPicker(false)}
            backdropZIndex={80}
            sheetZIndex={85}
          >
            <div className="px-4 py-2">
              {DEFAULT_SCREEN_OPTIONS.map((option, idx) => {
                const isSelected = defaultScreen === option.value;
                const isLast = idx === DEFAULT_SCREEN_OPTIONS.length - 1;
                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      setDefaultScreen(option.value);
                      setShowDefaultScreenPicker(false);
                      toast.success(`Default screen set to ${option.label}.`);
                    }}
                    className="w-full flex items-center justify-between py-3 cursor-pointer"
                    style={{
                      borderBottom: !isLast ? "1px solid var(--c-border)" : undefined,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "15px",
                        fontWeight: isSelected ? 600 : 400,
                        color: isSelected
                          ? (isDarkMode ? "#ACDEF2" : "#00527A")
                          : "var(--c-text)",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                      }}
                    >
                      {option.label}
                    </span>
                    {isSelected && (
                      <Check size={18} style={{ color: isDarkMode ? "#ACDEF2" : "#00527A" }} />
                    )}
                  </button>
                );
              })}
            </div>
          </SlideOutPanel>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDefaultSortPicker && (
          <SlideOutPanel
            title="Default collection sort"
            onClose={() => setShowDefaultSortPicker(false)}
            backdropZIndex={80}
            sheetZIndex={85}
          >
            <div className="px-4 py-2">
              {DEFAULT_COLLECTION_SORT_OPTIONS.map((option, idx) => {
                const isSelected = defaultCollectionSort === option.value;
                const isLast = idx === DEFAULT_COLLECTION_SORT_OPTIONS.length - 1;
                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      setDefaultCollectionSort(option.value);
                      setShowDefaultSortPicker(false);
                      toast.success(`Default sort set to ${option.label}.`);
                    }}
                    className="w-full flex items-center justify-between py-3 cursor-pointer"
                    style={{
                      borderBottom: !isLast ? "1px solid var(--c-border)" : undefined,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "15px",
                        fontWeight: isSelected ? 600 : 400,
                        color: isSelected
                          ? (isDarkMode ? "#ACDEF2" : "#00527A")
                          : "var(--c-text)",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                      }}
                    >
                      {option.label}
                    </span>
                    {isSelected && (
                      <Check size={18} style={{ color: isDarkMode ? "#ACDEF2" : "#00527A" }} />
                    )}
                  </button>
                );
              })}
            </div>
          </SlideOutPanel>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSessionCapPicker && (
          <SlideOutPanel
            title="Session length"
            onClose={() => setShowSessionCapPicker(false)}
            backdropZIndex={80}
            sheetZIndex={85}
          >
            <div className="px-4 py-2">
              {SESSION_CAP_OPTIONS.map((option, idx) => (
                <OptionRow
                  key={option.value}
                  label={option.label}
                  sub={option.sub}
                  selected={sessionCap === option.value}
                  isLast={idx === SESSION_CAP_OPTIONS.length - 1}
                  isDarkMode={isDarkMode}
                  onSelect={() => {
                    setSessionCap(option.value);
                    setShowSessionCapPicker(false);
                  }}
                />
              ))}
            </div>
          </SlideOutPanel>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSessionRotationPicker && (
          <SlideOutPanel
            title="Rotation"
            onClose={() => setShowSessionRotationPicker(false)}
            backdropZIndex={80}
            sheetZIndex={85}
          >
            <div className="px-4 py-2">
              <p className="pt-1 pb-3" style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-secondary)", lineHeight: 1.45 }}>
                When more records match than a session plays, rotation swaps in
                a different set each period. The same set holds all period, so
                nothing changes mid-listen.
              </p>
              {SESSION_ROTATION_OPTIONS.map((option, idx) => (
                <OptionRow
                  key={option.value}
                  label={option.label}
                  sub={option.sub}
                  selected={sessionRotation === option.value}
                  isLast={idx === SESSION_ROTATION_OPTIONS.length - 1}
                  isDarkMode={isDarkMode}
                  onSelect={() => {
                    setSessionRotation(option.value);
                    setShowSessionRotationPicker(false);
                  }}
                />
              ))}
            </div>
          </SlideOutPanel>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBugReport && <BugReportSheet onClose={() => setShowBugReport(false)} />}
      </AnimatePresence>
    </div>
  );
}
// ── Settings row anatomy ──────────────────────────────────────────────────
// One shape for every setting: the control sits on the TITLE's line, and the
// description gets its own full-width line beneath. Sharing the title's line
// with the control is what used to starve the description of width (it wrapped
// early even though the space under the control was empty) and what made the
// control's vertical position drift with each description's line count.
// Rows are separated by hairlines, each row drawing its own borderTop — the
// same convention as the album-detail sections.

const ROW_TITLE: React.CSSProperties = { fontSize: "14px", fontWeight: 500, color: "var(--c-text)" };
const ROW_DESC: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 400,
  color: "var(--c-text-muted)",
  lineHeight: 1.45,
  textWrap: "pretty",
};
const ROW_BORDER: React.CSSProperties = { borderTop: "1px solid var(--c-border)" };

/** Card shell — heading block, then hairline-separated rows. */
function SettingsCard({
  title,
  headerAction,
  children,
}: {
  title: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[12px] overflow-hidden"
      style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}
    >
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3">
        <h3
          style={{
            fontSize: "20px",
            fontWeight: 600,
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            letterSpacing: "-0.3px",
            color: "var(--c-text)",
          }}
        >
          {title}
        </h3>
        {headerAction}
      </div>
      {children}
    </div>
  );
}

/**
 * One setting. Pass `onClick` for a drill-in row — the whole row becomes the
 * target rather than just the value text beside the chevron.
 */
function SettingRow({
  title,
  description,
  onClick,
  disabled,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p style={ROW_TITLE}>{title}</p>
        {children && (
          <div
            className="flex items-center gap-1.5 flex-shrink-0"
            style={disabled ? { opacity: 0.4 } : undefined}
          >
            {children}
          </div>
        )}
      </div>
      {description && (
        <p className="mt-1" style={ROW_DESC}>
          {description}
        </p>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="w-full px-4 py-3 text-left tappable"
        style={{ ...ROW_BORDER, touchAction: "manipulation" }}
      >
        {body}
      </button>
    );
  }
  return (
    <div className="px-4 py-3" style={ROW_BORDER}>
      {body}
    </div>
  );
}

/** Drill-in affordance. The negative right margin cancels the chevron glyph's
 *  side bearing so its optical right edge lines up with the toggles and
 *  segmented controls above it. */
function RowChevron() {
  return <ChevronRight size={16} style={{ color: "var(--c-text-muted)", marginRight: "-2px" }} />;
}

/** Current value + chevron for a drill-in row. */
function RowValue({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-muted)" }}>{children}</span>
      <RowChevron />
    </>
  );
}

/** A card-level footnote — its own hairline block so it can't be misread as
 *  the description of the row above it. */
function RowNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-3" style={ROW_BORDER}>
      <p style={ROW_DESC}>{children}</p>
    </div>
  );
}

/** Action row (the Data card) — a label, no control, no leading icon. */
function ActionRow({
  label,
  onClick,
  destructive,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 text-left tappable"
      style={{
        ...ROW_BORDER,
        touchAction: "manipulation",
        fontSize: "14px",
        fontWeight: destructive ? 500 : 400,
        color: destructive ? "var(--c-destructive-text)" : "var(--c-text-secondary)",
      }}
    >
      {label}
    </button>
  );
}

/** Inline segmented control — for a short, mutually exclusive set of options
 *  where a drill-in sheet would be more taps than the choice is worth. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  isDarkMode,
  ariaLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  isDarkMode: boolean;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex rounded-[8px] flex-shrink-0"
      style={{
        border: "1px solid var(--c-border)",
        backgroundColor: isDarkMode ? "rgba(158,175,194,0.08)" : "rgba(22,24,28,0.04)",
      }}
    >
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            role="radio"
            aria-checked={isActive}
            className="cursor-pointer transition-colors"
            style={{
              fontSize: "13px",
              fontWeight: isActive ? 600 : 400,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              padding: "6px 12px",
              borderRadius: "7px",
              backgroundColor: isActive
                ? (isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)")
                : "transparent",
              color: isActive
                ? (isDarkMode ? "#ACDEF2" : "#00527A")
                : "var(--c-text-secondary)",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** On/off switch. `role="switch"` + `aria-checked` rather than `aria-pressed`
 *  — this is a setting's state, not a pressed button. */
function Toggle({
  checked,
  onChange,
  label,
  isDarkMode,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  isDarkMode: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="relative flex items-center rounded-full cursor-pointer transition-colors flex-shrink-0"
      style={{
        width: "44px",
        height: "24px",
        backgroundColor: checked ? "#ACDEF2" : (isDarkMode ? "rgba(158,175,194,0.2)" : "rgba(22,24,28,0.12)"),
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "2px",
          left: checked ? "22px" : "2px",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          backgroundColor: checked ? "#00527A" : (isDarkMode ? "#AAB0BA" : "#868B93"),
          transition: "left 200ms var(--ease-out), background-color 200ms var(--ease-out)",
          boxShadow: "var(--c-shadow-sm)",
        }}
      />
    </button>
  );
}

/** Option row for the Sessions pickers — label, one line of what it means. */
function OptionRow({
  label,
  sub,
  selected,
  isLast,
  isDarkMode,
  onSelect,
}: {
  label: string;
  sub: string;
  selected: boolean;
  isLast: boolean;
  isDarkMode: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className="w-full flex items-center justify-between py-3 cursor-pointer text-left"
      style={{ borderBottom: !isLast ? "1px solid var(--c-border)" : undefined }}
    >
      <div className="flex-1 min-w-0">
        <span
          style={{
            fontSize: "15px",
            fontWeight: selected ? 600 : 400,
            color: selected ? (isDarkMode ? "#ACDEF2" : "#00527A") : "var(--c-text)",
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
        >
          {label}
        </span>
        <p className="mt-0.5" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
          {sub}
        </p>
      </div>
      {selected && <Check size={18} style={{ color: isDarkMode ? "#ACDEF2" : "#00527A" }} />}
    </button>
  );
}
