import { useState } from "react";
import { Eye, EyeOff, Disc3, Trash2, ExternalLink, Info, AlertTriangle, CheckCircle2, ChevronRight, SquareArrowOutUpRight, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useApp } from "./app-context";
import { EASE_OUT, DURATION_NORMAL } from "./motion-tokens";

export function SettingsScreen() {
  const {
    discogsToken,
    setDiscogsToken,
    discogsUsername,
    setDiscogsUsername,
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
  } = useApp();

  const isOAuthUser = isAuthenticated && !discogsToken;

  const [showToken, setShowToken] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Logged-out state — show minimal sign-in prompt
  if (!isAuthenticated && !discogsToken) {
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
    if (!isOAuthUser && !discogsToken.trim()) {
      toast.error("Enter your Discogs personal access token first");
      return;
    }
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

  const handleConfirmClear = () => {
    if (!confirmAction) return;
    toast.success(`${confirmAction} cleared successfully`);
    setConfirmAction(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-[16px] lg:px-[24px] pt-[8px] pb-[4px] lg:pt-[16px] lg:pb-[17px]">
        <h2 className="screen-title" style={{ fontSize: "36px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.5px", lineHeight: 1.25, color: "var(--c-text)" }}>Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto overlay-scroll px-[16px] lg:px-[24px] pt-[0px]" style={{ paddingBottom: "calc(24px + var(--nav-clearance, 0px))" }}>
        <section className="mt-4">
          <div className="rounded-[12px] p-4 flex flex-col gap-4" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}>
            <h3 style={{ fontSize: "20px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.3px", color: "var(--c-text)" }}>Discogs</h3>

            {isOAuthUser ? (
              /* OAuth user — show connected state */
              <div className="flex items-center gap-3">
                {userAvatar ? (
                  <img src={userAvatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--c-chip-bg)" }} />
                )}
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--c-text)" }}>{discogsUsername}</p>
                  <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>Connected via Discogs</p>
                </div>
              </div>
            ) : (
              /* Personal token user — show token inputs */
              <>
                <div>
                  <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text-secondary)" }}>Discogs Username</label>
                  <input type="text" value={discogsUsername} onChange={(e) => { if (!discogsToken) setDiscogsUsername(e.target.value); }}
                    placeholder="Auto-detected from token"
                    readOnly={!!discogsToken}
                    className="w-full rounded-[8px] px-3 py-2.5 outline-none transition-colors"
                    style={{ fontSize: "16px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", backgroundColor: "var(--c-input-bg)", color: discogsToken ? "var(--c-text-muted)" : "var(--c-text)", border: "1px solid var(--c-border-strong)", cursor: discogsToken ? "default" : undefined, opacity: discogsToken ? 0.7 : 1 }} />
                </div>
                <div>
                  <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text-secondary)" }}>Personal Access Token</label>
                  <div className="relative">
                    <input type={showToken ? "text" : "password"} value={discogsToken} onChange={(e) => setDiscogsToken(e.target.value)}
                      placeholder="Paste your token here"
                      className="w-full rounded-[8px] px-3 py-2.5 pr-10 outline-none transition-colors"
                      style={{ fontSize: "16px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", backgroundColor: "var(--c-input-bg)", color: "var(--c-text)", border: "1px solid var(--c-border-strong)" }} />
                    <button onClick={() => setShowToken(!showToken)} className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer" style={{ color: "var(--c-text-muted)" }}>
                      {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <a href="https://www.discogs.com/settings/developers" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#0078B4] mt-1.5 hover:underline" style={{ fontSize: "12px", fontWeight: 400 }}>
                    Generate one at discogs.com/settings/developers. Takes about 30 seconds.<ExternalLink size={10} />
                  </a>
                </div>
              </>
            )}

            <button onClick={handleSync} disabled={isSyncing}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-[#EBFD00] text-[#0C284A] hover:bg-[#d9e800] transition-colors disabled:opacity-60 cursor-pointer"
              style={{ fontSize: "14px", fontWeight: 600, border: "1px solid rgba(12,40,74,0.25)" }}>
              <Disc3 size={16} className={isSyncing ? "disc-spinner" : ""} />
              {isSyncing ? (syncProgress || "Syncing...") : "Sync Now"}
            </button>
            {syncError && (
              <div className="rounded-[8px] p-3 flex items-start gap-2" style={{ backgroundColor: "rgba(255,51,182,0.08)", border: "1px solid rgba(255,51,182,0.2)" }}>
                <AlertTriangle size={14} className="text-[#FF33B6] flex-shrink-0 mt-0.5" />
                <p style={{ fontSize: "12px", fontWeight: 400, color: "#FF33B6", wordBreak: "break-word" }}>{syncError}</p>
              </div>
            )}
            {(lastSynced || syncStats) && (
              <div className="text-center">
                {lastSynced && (
                  <div className="flex items-center justify-center gap-1.5">
                    <CheckCircle2 size={13} className="text-[#22C55E]" />
                    <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>Last synced {lastSynced}</p>
                  </div>
                )}
                <p className="mt-0.5" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-secondary)" }}>
                  {syncStats
                    ? `${syncStats.albums} records \u00b7 ${syncStats.folders} folders \u00b7 ${syncStats.wants} wantlist items`
                    : `${albums.length} records \u00b7 ${folders.filter((f) => f !== "All").length} folders \u00b7 ${wants.length} wantlist items`
                  }
                </p>
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

        {/* Purge Tracker quick-access card — mobile only (not in mobile nav) */}
        <section className="mt-6 lg:hidden">
          <button
            onClick={() => setScreen("purge")}
            className="w-full rounded-[12px] p-4 flex items-center gap-3 text-left cursor-pointer transition-opacity hover:opacity-90"
            style={{
              backgroundColor: isDarkMode ? "rgba(172,222,242,0.06)" : "rgba(172,222,242,0.12)",
              border: `1px solid ${isDarkMode ? "rgba(172,222,242,0.12)" : "rgba(172,222,242,0.3)"}`,
            }}
          >
            <SquareArrowOutUpRight size={20} style={{ color: isDarkMode ? "#ACDEF2" : "#0078B4" }} className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--c-text)", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
                Purge Tracker
              </p>
              <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)", fontFamily: "'DM Sans', system-ui, sans-serif", marginTop: "2px" }}>
                Rate your collection — keep, cut, or maybe.
              </p>
            </div>
            <ChevronRight size={18} style={{ color: isDarkMode ? "#ACDEF2" : "#0078B4" }} className="flex-shrink-0" />
          </button>
        </section>

        <section className="mt-6">
          <div className="rounded-[12px] p-4 flex flex-col gap-3" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}>
            <h3 style={{ fontSize: "20px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.3px", color: "var(--c-text)" }}>Appearance</h3>
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
                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
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
                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  }}
                />
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div className="rounded-[12px] p-4 flex flex-col gap-2" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}>
            <h3 style={{ fontSize: "20px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.3px", color: "var(--c-text)" }}>Data</h3>
            <button onClick={() => setConfirmAction("Purge data")} className="w-full flex items-center gap-2 py-2.5 px-3 rounded-[8px] transition-colors text-left" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-secondary)" }}><Trash2 size={15} />Clear Purge Data</button>
            <button onClick={() => setConfirmAction("Sessions")} className="w-full flex items-center gap-2 py-2.5 px-3 rounded-[8px] transition-colors text-left" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-secondary)" }}><Trash2 size={15} />Clear Sessions</button>
            <div className="mt-1 pt-1" style={{ borderTop: "1px solid var(--c-border)" }}>
              <button onClick={() => setConfirmAction("All local data")} className="w-full flex items-center gap-2 py-2.5 px-3 rounded-[8px] text-[#FF33B6] hover:bg-[rgba(255,51,182,0.05)] transition-colors text-left" style={{ fontSize: "14px", fontWeight: 500 }}><Trash2 size={15} />Clear All Local Data</button>
            </div>
          </div>
        </section>

        <section className="mt-6 mb-4">
          <div className="flex items-center gap-2" style={{ color: "var(--c-text-muted)" }}>
            <Info size={14} />
            <span style={{ fontSize: "12px", fontWeight: 400 }}>Holy Grails v0.2.4. Your Discogs companion app.</span>
          </div>
        </section>
      </div>

      <AnimatePresence>
        {confirmAction && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }} className="fixed inset-0 bg-black/25 z-[80]" onClick={() => setConfirmAction(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[90] w-[320px] rounded-[16px] p-5"
              style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", boxShadow: "0 16px 48px rgba(12,40,74,0.15)" }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-[rgba(255,51,182,0.08)]">
                  <AlertTriangle size={20} className="text-[#FF33B6]" />
                </div>
                <div>
                  <p style={{ fontSize: "16px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>
                    {`Clear ${confirmAction}?`}
                  </p>
                  <p className="mt-0.5" style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-tertiary)" }}>
                    {confirmAction === "Purge data"
                      ? "This removes all Keep, Cut, and Maybe tags from your collection. This cannot be undone."
                      : confirmAction === "Sessions"
                      ? "This deletes all saved sessions. This cannot be undone."
                      : "This removes everything stored locally \u2014 purge tags, sessions, wantlist priorities, listening history, and cached pricing. Your Discogs collection is not affected."}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setConfirmAction(null)} className="flex-1 py-2.5 rounded-[10px] transition-colors cursor-pointer" style={{ fontSize: "14px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text-secondary)" }}>Cancel</button>
                <button onClick={handleConfirmClear} className="flex-1 py-2.5 rounded-[10px] text-white bg-[#FF33B6] hover:bg-[#E6009E] transition-colors cursor-pointer" style={{ fontSize: "14px", fontWeight: 600 }}>
                  Clear
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}