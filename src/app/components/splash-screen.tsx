import { useState } from "react";
import { motion } from "motion/react";
import { Disc3, AlertTriangle } from "lucide-react";
import { WordmarkLogo } from "./navigation";
import { SplashVideo } from "./splash-video";

/* ── Dev-mode hardcoded credentials (QA only) ── */
const DEV_USERS = [
  { label: "catxdad19", token: "XbIUeMiKTrmmSXanDzypYVLYgwREFsXlByfvUHQl" },
  { label: "T.Hughes", token: "soQittZUrRjXqbytVxIezlBxdHDrLRPQNVQblvSN" },
] as const;

interface SplashScreenProps {
  isDarkMode: boolean;
  onSkipToFeed: () => void;
  onDevSync?: (username: string, token: string) => Promise<void>;
  isSyncing?: boolean;
  syncProgress?: string;
  onLoginWithDiscogs: () => Promise<void>;
}

export function SplashScreen({
  isDarkMode,
  onSkipToFeed,
  onDevSync,
  isSyncing = false,
  syncProgress = "",
  onLoginWithDiscogs,
}: SplashScreenProps) {
  const mutedColor = "#7D92A8";
  const logoFill = "#E2E8F0";

  /* Dev section colors — matched to Settings > Developer / QA */
  const devBg = "#0F2A3E";
  const devBorder = "#1E4A65";
  const devTitleColor = "#ACDEF2";
  const devBadgeBg = "#1A3F58";
  const devDescColor = "#7FB5D0";
  const devBtnBg = "#153448";

  /* Local state: which user triggered the sync, and any error */
  const [syncingUser, setSyncingUser] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  /* All dev buttons are disabled while any sync is in progress */
  const devDisabled = !!syncingUser;

  const handleDevSyncClick = async (user: typeof DEV_USERS[number]) => {
    if (!onDevSync || syncingUser) return;
    setSyncingUser(user.label);
    setSyncError(null);
    try {
      await onDevSync(user.label, user.token);
    } catch (err: any) {
      setSyncError(err?.message || "Sync failed. Check network or token.");
    } finally {
      setSyncingUser(null);
    }
  };

  const handleLoginClick = async () => {
    setLoginLoading(true);
    try {
      await onLoginWithDiscogs();
      // If successful, page redirects to Discogs — loading state doesn't matter
    } catch (err: any) {
      setLoginLoading(false);
      setSyncError(err?.message || "Failed to connect to Discogs.");
    }
  };

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{
        fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
        backgroundColor: "#0C1A2E",
        background: "radial-gradient(ellipse 120% 60% at 50% 0%, #132B44 0%, #0C1A2E 100%)",
        position: "relative",
      }}
    >
      {/* Fullscreen looping video background */}
      <SplashVideo />

      {/* Upper section — Logo group */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-8 pb-6"
        style={{ position: "relative", zIndex: 1 }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center"
        >
          {/* Wordmark logo — same as app header */}
          <WordmarkLogo
            className="w-[300px] lg:w-[480px] h-auto"
            fillColor={logoFill}
            isDarkMode={isDarkMode}
          />

          {/* Tagline */}
          <p
            className="mt-4"
            style={{
              fontSize: "14px",
              fontWeight: 400,
              color: mutedColor,
              textAlign: "center",
              lineHeight: 1.4,
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            Your Discogs companion app.
          </p>
        </motion.div>
      </div>

      {/* Lower section — Login button + Skip link + Dev section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center justify-start max-w-[400px] mx-auto w-full"
        style={{ paddingTop: 0, paddingRight: 24, paddingBottom: 48, paddingLeft: 24, position: "relative", zIndex: 1 }}
      >
        {/* Primary: Log in with Discogs */}
        <button
          onClick={handleLoginClick}
          disabled={loginLoading}
          className="w-full py-3 rounded-full flex items-center justify-center gap-2 transition-colors cursor-pointer flex-shrink-0"
          style={{
            backgroundColor: "#EBFD00",
            color: "#0C284A",
            fontSize: "14px",
            fontWeight: 600,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            lineHeight: 1.5,
            border: "1px solid rgba(12,40,74,0.25)",
            opacity: loginLoading ? 0.85 : 1,
          }}
        >
          {loginLoading ? (
            <Disc3 size={16} strokeWidth={2} className="disc-spinner" />
          ) : (
            <Disc3 size={16} strokeWidth={2} />
          )}
          {loginLoading ? "Connecting..." : "Log in with Discogs"}
        </button>

        {/* Skip for now */}
        <button
          onClick={onSkipToFeed}
          className="mt-4 cursor-pointer flex-shrink-0"
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontSize: "13px",
            fontWeight: 500,
            color: mutedColor,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            lineHeight: 1.5,
          }}
        >
          Skip for now
        </button>

        {/* Developer / QA section — matches Settings screen styling */}
        <div
          className="w-full mt-5 mb-4 rounded-[12px] p-3.5 flex flex-col gap-2.5 flex-shrink-0"
          style={{
            backgroundColor: devBg,
            border: `1px dashed ${devBorder}`,
            position: "relative",
          }}
        >
          <div className="flex items-center gap-2">
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 600,
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                letterSpacing: "-0.3px",
                color: devTitleColor,
                lineHeight: 1.2,
              }}
            >
              Developer / QA
            </h3>
            <span
              className="px-2 py-0.5 rounded-full"
              style={{
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.5px",
                textTransform: "uppercase" as const,
                backgroundColor: devBadgeBg,
                color: devTitleColor,
                lineHeight: 1.5,
              }}
            >
              Dev Only
            </span>
          </div>
          <p
            style={{
              fontSize: "12px",
              fontWeight: 400,
              color: devDescColor,
              lineHeight: 1.5,
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            Skip authentication and load data to explore the app.
          </p>

          {/* Placeholder data button — full width, unchanged */}
          <button
            onClick={onSkipToFeed}
            disabled={devDisabled}
            className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-[8px] transition-colors text-left cursor-pointer"
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: devDisabled ? "#5A7A95" : devTitleColor,
              backgroundColor: devBtnBg,
              border: `1px solid ${devBorder}`,
              lineHeight: 1.5,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              opacity: devDisabled ? 0.6 : 1,
            }}
          >
            <Disc3 size={15} />
            <div>
              <span>Load Placeholder Data</span>
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 400,
                  color: devDescColor,
                  marginTop: "2px",
                  lineHeight: 1.5,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}
              >
                Load placeholder albums, wants, and folders
              </p>
            </div>
          </button>

          {/* Side-by-side Discogs user buttons */}
          <div className="flex gap-2">
            {DEV_USERS.map((user) => {
              const isLoading = syncingUser === user.label;

              return (
                <button
                  key={user.label}
                  onClick={() => handleDevSyncClick(user)}
                  disabled={devDisabled && !isLoading}
                  className="flex-1 flex items-start gap-2 py-2.5 px-3 rounded-[8px] transition-colors text-left cursor-pointer"
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: (devDisabled && !isLoading) ? "#5A7A95" : devTitleColor,
                    backgroundColor: devBtnBg,
                    border: `1px solid ${devBorder}`,
                    lineHeight: 1.5,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    opacity: (devDisabled && !isLoading) ? 0.6 : 1,
                  }}
                >
                  {isLoading ? (
                    <Disc3 size={15} className="disc-spinner" style={{ flexShrink: 0, marginTop: "2px" }} />
                  ) : (
                    <Disc3 size={15} style={{ flexShrink: 0, marginTop: "2px" }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <span>{user.label}</span>
                    <p
                      style={{
                        fontSize: "11px",
                        fontWeight: 400,
                        color: devDescColor,
                        marginTop: "2px",
                        lineHeight: 1.5,
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                      }}
                    >
                      Sync {user.label}'s collection
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Sync progress counter + error */}
          {(syncingUser || (!syncingUser && syncError)) && (
            <div
              style={{
                position: "absolute",
                left: 14,
                right: 14,
                bottom: 0,
                transform: "translateY(calc(100% + 6px))",
              }}
            >
              {syncingUser && (
                <div className="flex items-center justify-center gap-1.5 py-1">
                  <Disc3 size={13} className="disc-spinner" style={{ color: devTitleColor, flexShrink: 0 }} />
                  <p
                    style={{
                      fontSize: "12px",
                      fontWeight: 400,
                      color: devTitleColor,
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      lineHeight: 1.5,
                    }}
                  >
                    {syncProgress || "Syncing..."}
                  </p>
                </div>
              )}

              {!syncingUser && syncError && (
                <div
                  className="rounded-[8px] p-3 flex items-start gap-2"
                  style={{
                    backgroundColor: "rgba(255,51,182,0.08)",
                    border: "1px solid rgba(255,51,182,0.2)",
                  }}
                >
                  <AlertTriangle size={14} style={{ color: "#FF33B6", flexShrink: 0, marginTop: "1px" }} />
                  <p
                    style={{
                      fontSize: "12px",
                      fontWeight: 400,
                      color: "#FF33B6",
                      wordBreak: "break-word",
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      lineHeight: 1.5,
                    }}
                  >
                    {syncError}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
