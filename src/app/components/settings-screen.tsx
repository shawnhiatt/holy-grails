import { useState, useRef, useMemo, useCallback } from "react";
import { Disc3, Trash2, Info, AlertTriangle, CheckCircle2, ChevronRight, ChevronDown, SquareArrowOutUpRight, LogOut, BarChart3, FolderOpen, Check, Star, MapPin, Pencil } from "lucide-react";
import { PurgeCutDialog } from "./purge-tracker";
import { FoldersScreen } from "./folders-screen";
import { SlideOutPanel } from "./slide-out-panel";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useApp } from "./app-context";
import type { Screen } from "./app-context";
import { EASE_OUT, DURATION_NORMAL } from "./motion-tokens";

const DEFAULT_SCREEN_OPTIONS: { value: Screen; label: string }[] = [
  { value: "feed", label: "Feed" },
  { value: "crate", label: "Collection" },
  { value: "wants", label: "Wantlist" },
  { value: "sessions", label: "Sessions" },
  { value: "reports", label: "Insights" },
];

export function SettingsScreen() {
  const {
    discogsUsername,
    isSyncing,
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
    hideGalleryMeta,
    setHideGalleryMeta,
    signOut,
    isAuthenticated,
    userAvatar,
    userProfile,
    updateProfile,
    shakeToRandom,
    setShakeToRandom,
    defaultScreen,
    setDefaultScreen,
    executePurgeCut,
    purgeProgress,
    sessions,
    deleteSession,
    deletePurgeTag,
    wipeAllData,
    sessionToken,
    clearPlayHistory,
    clearFollowedUsers,
    clearWantlistPriorities,
  } = useApp();

  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [motionDenied, setMotionDenied] = useState(false);
  const [showFolders, setShowFolders] = useState(false);
  const motionDeniedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Purge Cut dialog (execution lives in context via executePurgeCut)
  const [showPurgeCutDialog, setShowPurgeCutDialog] = useState(false);
  const [showDefaultScreenPicker, setShowDefaultScreenPicker] = useState(false);

  // Profile edit state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfile, setEditProfile] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [showContributions, setShowContributions] = useState(false);

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
          className="px-6 py-2.5 rounded-full bg-[#EBFD00] text-[#0C284A] hover:bg-[#d9e800] transition-colors"
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

  const handleConfirmClear = async () => {
    if (!confirmAction) return;
    if (confirmAction === "Purge data") {
      for (const a of albums) {
        if (a.purgeTag) deletePurgeTag(a.release_id);
      }
      toast.success("Purge data cleared.");
    } else if (confirmAction === "Sessions") {
      for (const s of sessions) {
        deleteSession(s.id);
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-[16px] lg:px-[24px] pt-[2px] pb-[8px] lg:pt-[8px] lg:pb-[20px]">
        <h2 className="screen-title" style={{ fontSize: "28px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.5px", lineHeight: 1.25, color: "var(--c-text)" }}>Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto overlay-scroll px-[16px] lg:px-[24px] pt-[0px]" style={{ paddingBottom: "calc(24px + var(--nav-clearance, 0px))" }}>
        <section className="mt-4">
          <div className="rounded-[12px] p-4 flex flex-col gap-4" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}>
            <div className="flex items-center justify-between">
              <h3 style={{ fontSize: "20px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.3px", color: "var(--c-text)" }}>Discogs Profile</h3>
              {userProfile && (
                <button
                  onClick={isEditingProfile ? () => setIsEditingProfile(false) : startEditProfile}
                  className="flex items-center justify-center cursor-pointer transition-opacity hover:opacity-70"
                  style={{ padding: "4px" }}
                  aria-label={isEditingProfile ? "Cancel editing" : "Edit profile"}
                >
                  <Pencil size={16} style={{ color: isEditingProfile ? "var(--c-text-faint)" : "var(--c-text-secondary)" }} />
                </button>
              )}
            </div>

            {/* Avatar + username + member since */}
            <div className="flex items-center gap-3">
              {userAvatar ? (
                <img src={userAvatar} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
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
                    className="flex-1 py-2 rounded-[8px] bg-[#EBFD00] text-[#0C284A] hover:bg-[#d9e800] transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1.5"
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
                          fill={i < userProfile.buyerRatingStars ? "#FFC107" : "none"}
                          stroke={i < userProfile.buyerRatingStars ? "#FFC107" : "var(--c-text-faint)"}
                          strokeWidth={1.5}
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
                          fill={i < userProfile.sellerRatingStars ? "#FFC107" : "none"}
                          stroke={i < userProfile.sellerRatingStars ? "#FFC107" : "var(--c-text-faint)"}
                          strokeWidth={1.5}
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

            {/* Divider before sync section */}
            <div style={{ borderTop: "1px solid var(--c-border)" }} />

            {/* Collection stats row */}
            <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-secondary)", textAlign: "center" }}>
              {syncStats
                ? `${syncStats.albums} records \u00b7 ${syncStats.folders} folders \u00b7 ${syncStats.wants} wantlist items`
                : `${albums.length} records \u00b7 ${folders.filter((f) => f.name !== "All").length} folders \u00b7 ${wants.length} wantlist items`
              }
            </p>

            <button onClick={handleSync} disabled={isSyncing}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-[#EBFD00] text-[#0C284A] hover:bg-[#d9e800] transition-colors disabled:opacity-60 cursor-pointer"
              style={{ fontSize: "14px", fontWeight: 600, border: "1px solid rgba(12,40,74,0.25)" }}>
              <Disc3 size={16} className={isSyncing ? "disc-spinner" : ""} />
              {isSyncing ? (syncProgress || "Syncing...") : "Sync Now"}
            </button>
            {syncError && (
              <div className="rounded-[8px] p-3 flex items-start gap-2" style={{ backgroundColor: "var(--c-destructive-tint)", border: "1px solid rgba(255,51,182,0.2)" }}>
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: "var(--c-destructive)" }} />
                <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-destructive)", wordBreak: "break-word" }}>{syncError}</p>
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
              <SquareArrowOutUpRight size={20} style={{ color: isDarkMode ? "#ACDEF2" : "#0078B4" }} />
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
          <div className="rounded-[12px] p-4 flex flex-col gap-3" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}>
            <h3 style={{ fontSize: "20px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.3px", color: "var(--c-text)" }}>Appearance</h3>
            <div className="flex items-center justify-between gap-3">
              <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)" }}>Color mode</p>
              <div
                className="flex rounded-[8px] flex-shrink-0"
                style={{ border: "1px solid var(--c-border)", backgroundColor: isDarkMode ? "rgba(158,175,194,0.08)" : "rgba(12,40,74,0.04)" }}
              >
                {(["Light", "Dark", "System"] as const).map((label) => {
                  const value = label.toLowerCase() as "light" | "dark" | "system";
                  const isActive = colorMode === value;
                  return (
                    <button
                      key={value}
                      onClick={() => setColorMode(value)}
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
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)" }}>Hide purge indicators</p>
                <p className="mt-0.5" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>Remove Keep/Maybe/Purge dots from collection views</p>
              </div>
              <button
                onClick={() => setHidePurgeIndicators(!hidePurgeIndicators)}
                className="relative flex items-center rounded-full cursor-pointer transition-colors flex-shrink-0 ml-3"
                style={{
                  width: "44px",
                  height: "24px",
                  backgroundColor: hidePurgeIndicators ? "#ACDEF2" : (isDarkMode ? "rgba(158,175,194,0.2)" : "rgba(12,40,74,0.12)"),
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "2px",
                    left: hidePurgeIndicators ? "22px" : "2px",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    backgroundColor: hidePurgeIndicators ? "#00527A" : (isDarkMode ? "#9EAFC2" : "#74889C"),
                    transition: "left 200ms var(--ease-out), background-color 200ms var(--ease-out)",
                    boxShadow: "var(--c-shadow-sm)",
                  }}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)" }}>Hide swiper gallery metadata</p>
                <p className="mt-0.5" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>Remove metadata from the swiper gallery view</p>
              </div>
              <button
                onClick={() => setHideGalleryMeta(!hideGalleryMeta)}
                className="relative flex items-center rounded-full cursor-pointer transition-colors flex-shrink-0 ml-3"
                style={{
                  width: "44px",
                  height: "24px",
                  backgroundColor: hideGalleryMeta ? "#ACDEF2" : (isDarkMode ? "rgba(158,175,194,0.2)" : "rgba(12,40,74,0.12)"),
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "2px",
                    left: hideGalleryMeta ? "22px" : "2px",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    backgroundColor: hideGalleryMeta ? "#00527A" : (isDarkMode ? "#9EAFC2" : "#74889C"),
                    transition: "left 200ms var(--ease-out), background-color 200ms var(--ease-out)",
                    boxShadow: "var(--c-shadow-sm)",
                  }}
                />
              </button>
            </div>
             <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)" }}>Default screen</p>
                <p className="mt-0.5" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>The first screen shown when you open the app</p>
              </div>
              <button
                onClick={() => setShowDefaultScreenPicker(true)}
                className="flex items-center gap-1.5 flex-shrink-0 ml-3 cursor-pointer"
              >
                <span style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-muted)" }}>
                  {DEFAULT_SCREEN_OPTIONS.find((o) => o.value === defaultScreen)?.label ?? "Feed"}
                </span>
                <ChevronRight size={16} style={{ color: "var(--c-text-muted)" }} />
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div className="rounded-[12px] p-4 flex flex-col gap-3" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}>
            <h3 style={{ fontSize: "20px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.3px", color: "var(--c-text)" }}>Gestures</h3>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)" }}>Shake for random</p>
                <p className="mt-0.5" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>Shake your device to open a random album</p>
                {motionDenied && (
                  <p className="mt-1" style={{ fontSize: "12px", fontWeight: 400, color: isDarkMode ? "#FF98DA" : "#9A207C" }}>
                    Motion access denied. Enable in iOS Settings.
                  </p>
                )}
              </div>
              <button
                onClick={handleShakeToggle}
                className="relative flex items-center rounded-full cursor-pointer transition-colors flex-shrink-0 ml-3"
                style={{
                  width: "44px",
                  height: "24px",
                  backgroundColor: shakeToRandom ? "#ACDEF2" : (isDarkMode ? "rgba(158,175,194,0.2)" : "rgba(12,40,74,0.12)"),
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "2px",
                    left: shakeToRandom ? "22px" : "2px",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    backgroundColor: shakeToRandom ? "#00527A" : (isDarkMode ? "#9EAFC2" : "#74889C"),
                    transition: "left 200ms var(--ease-out), background-color 200ms var(--ease-out)",
                    boxShadow: "var(--c-shadow-sm)",
                  }}
                />
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div className="rounded-[12px] p-4 flex flex-col gap-2" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}>
            <h3 style={{ fontSize: "20px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.3px", color: "var(--c-text)" }}>Data</h3>
            <button onClick={() => setConfirmAction("Purge data")} className="w-full flex items-center gap-2 py-2.5 rounded-[8px] transition-colors text-left" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-secondary)" }}><Trash2 size={15} />Clear Purge Data</button>
            <button onClick={() => setConfirmAction("Sessions")} className="w-full flex items-center gap-2 py-2.5 rounded-[8px] transition-colors text-left" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-secondary)" }}><Trash2 size={15} />Clear Sessions</button>
            <button onClick={() => setConfirmAction("Play history")} className="w-full flex items-center gap-2 py-2.5 rounded-[8px] transition-colors text-left" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-secondary)" }}><Trash2 size={15} />Clear Play History</button>
            <button onClick={() => setConfirmAction("Followed users")} className="w-full flex items-center gap-2 py-2.5 rounded-[8px] transition-colors text-left" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-secondary)" }}><Trash2 size={15} />Clear Followed Users</button>
            <button onClick={() => setConfirmAction("Wantlist priorities")} className="w-full flex items-center gap-2 py-2.5 rounded-[8px] transition-colors text-left" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-secondary)" }}><Trash2 size={15} />Clear Wantlist Priorities</button>
            <div className="mt-1 pt-1" style={{ borderTop: "1px solid var(--c-border)" }}>
              <button onClick={() => setConfirmAction("All data")} className="w-full flex items-center gap-2 py-2.5 rounded-[8px] transition-colors text-left" style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-destructive)" }}><Trash2 size={15} />Delete All My Data</button>
            </div>
          </div>
        </section>

        <section className="mt-6 mb-4">
          <div className="flex items-center gap-2" style={{ color: "var(--c-text-muted)" }}>
            <Info size={14} />
            <span style={{ fontSize: "12px", fontWeight: 400 }}>Holy Grails v0.5.2. A Discogs companion app.</span>
          </div>
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
                  <AlertTriangle size={20} style={{ color: "var(--c-destructive)" }} />
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
              {DEFAULT_SCREEN_OPTIONS.map((option) => {
                const isSelected = defaultScreen === option.value;
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
                      borderBottom: option.value !== "reports" ? "1px solid var(--c-border)" : undefined,
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
    </div>
  );
}