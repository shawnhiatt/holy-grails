import React, { useState, useEffect, useCallback, useMemo, Component } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Toaster, toast } from "sonner";
import { AppProvider, useApp } from "./components/app-context";
import { BottomTabBar, DesktopTopNav, MobileHeader } from "./components/navigation";
import { CrateBrowser } from "./components/crate-browser";
import { PurgeTracker } from "./components/purge-tracker";
import { Sessions } from "./components/sessions";
import { Wantlist } from "./components/wantlist";
import { SettingsScreen } from "./components/settings-screen";
import { FriendsScreen } from "./components/friends-screen";
import { AlbumDetailPanel, AlbumDetailSheet } from "./components/album-detail";
import { FilterDrawer } from "./components/filter-drawer";
import { getContentTokens } from "./components/theme";
import { useShake } from "./components/use-shake";
import { ReportsScreen } from "./components/reports-screen";
import { FeedScreen } from "./components/feed-screen";
import { SplashScreen } from "./components/splash-screen";
import { AuthCallback } from "./components/auth-callback";
import { SessionPickerSheet } from "./components/session-picker-sheet";
import { EASE_OUT, DURATION_NORMAL } from "./components/motion-tokens";
import { initiateDiscogsOAuth } from "./components/oauth-helpers";
/* HMR rebuild trigger — v4 */
/* unicorn-bg removed — WebGL scene deferred to deployment phase */
/* nav-clearance: scroll containers consume --nav-clearance for bottom padding */

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: "red", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
          <h1>App Error</h1>
          <p>{this.state.error?.message}</p>
          <p>{this.state.error?.stack}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const {
    screen, showAlbumDetail, selectedAlbum, showFilterDrawer,
    isDarkMode, albums, setSelectedAlbumId, setShowAlbumDetail,
    resetToDemo, setScreen, discogsToken,
    connectDiscogsRequested, clearConnectDiscogsRequest,
    headerHidden, sessionPickerAlbumId, devSyncUser,
    isSyncing, syncProgress, isAuthenticated, loginWithOAuth,
  } = useApp();
  const [isDesktop, setIsDesktop] = useState(false);
  const [splashDismissed, setSplashDismissed] = useState(false);

  // Detect if we're on the OAuth callback URL
  const [isAuthCallback, setIsAuthCallback] = useState(() => {
    return window.location.pathname === "/auth/callback" &&
      window.location.search.includes("oauth_token");
  });

  /* iOS PWA zoom fix — ensure viewport disables user scaling so inputs
     below 16px don't trigger Safari's auto-zoom. Runs once on mount. */
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (meta) {
      meta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
    } else {
      meta = document.createElement("meta");
      meta.name = "viewport";
      meta.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
      document.head.appendChild(meta);
    }

    /* iOS PWA home screen icon + fullscreen launch meta tags */
    const ensureMeta = (name: string, content: string) => {
      let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.name = name;
        el.content = content;
        document.head.appendChild(el);
      }
    };
    ensureMeta("apple-mobile-web-app-capable", "yes");
    ensureMeta("apple-mobile-web-app-status-bar-style", "black-translucent");

    if (!document.querySelector('link[rel="apple-touch-icon"]')) {
      const link = document.createElement("link");
      link.rel = "apple-touch-icon";
      link.href = "https://holygrails022.figma.site/_assets/v11/b246641de89ec1b1a54bd184e0bd92fa4a1d488a.png";
      document.head.appendChild(link);
    }
  }, []);

  // Show splash when no data loaded and user hasn't authenticated or dismissed
  const showSplash = !splashDismissed && albums.length === 0 && !discogsToken && !isAuthenticated;

  // Re-show splash if all data is wiped (e.g. "Wipe All Data" or sign out)
  useEffect(() => {
    if (albums.length === 0 && !discogsToken && !isAuthenticated) {
      setSplashDismissed(false);
    }
  }, [albums.length, discogsToken, isAuthenticated]);

  // React to in-app "Connect Discogs" requests (e.g. from Feed empty state)
  useEffect(() => {
    if (connectDiscogsRequested) {
      clearConnectDiscogsRequest();
      setSplashDismissed(false);
    }
  }, [connectDiscogsRequested, clearConnectDiscogsRequest]);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    setIsDesktop(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const handleShake = useCallback(() => {
    if (albums.length === 0) return;
    const randomAlbum = albums[Math.floor(Math.random() * albums.length)];
    setSelectedAlbumId(randomAlbum.id);
    setShowAlbumDetail(true);
    toast.info("Shake! Random pick: " + randomAlbum.title, { duration: 2000 });
  }, [albums, setSelectedAlbumId, setShowAlbumDetail]);

  useShake({
    onShake: handleShake,
    enabled: !isDesktop,
    threshold: 12,
    timeout: 1000,
  });

  const renderScreen = () => {
    switch (screen) {
      case "crate":
        return <CrateBrowser />;
      case "purge":
        return <PurgeTracker />;
      case "sessions":
        return <Sessions />;
      case "wants":
        return <Wantlist />;
      case "friends":
        return <FriendsScreen />;
      case "settings":
        return <SettingsScreen />;
      case "reports":
        return <ReportsScreen />;
      case "feed":
        return <FeedScreen />;
      default:
        return <CrateBrowser />;
    }
  };

  const mobilePaddingBottom = isDesktop ? "0px" : "calc(96px + env(safe-area-inset-bottom, 0px))";
  const contentTokens = useMemo(() => getContentTokens(isDarkMode), [isDarkMode]);

  /** Radial gradient background — light cyan glow from top center */
  const gradientBg = isDarkMode
    ? "radial-gradient(ellipse 120% 60% at 50% 0%, #132B44 0%, #0C1A2E 100%)"
    : "radial-gradient(200% 100% at 50% 0%, #FFF 21.36%, #ACDEF2 100%)";

  // Splash screen handlers
  const handleSkipToFeed = useCallback(() => {
    resetToDemo();
    setScreen("feed");
    setSplashDismissed(true);
  }, [resetToDemo, setScreen]);

  const handleDevSync = useCallback(async (username: string, token: string) => {
    await devSyncUser(username, token);
    setScreen("feed");
    setSplashDismissed(true);
  }, [devSyncUser, setScreen]);

  const handleLoginWithDiscogs = useCallback(async () => {
    await initiateDiscogsOAuth();
  }, []);

  const handleAuthSuccess = useCallback(async (user: {
    username: string;
    avatarUrl: string;
    accessToken: string;
    tokenSecret: string;
  }) => {
    // OAuth complete — wire into app-context, trigger initial sync
    setIsAuthCallback(false);
    setSplashDismissed(true);
    setScreen("feed");
    toast.success("Connected.", { duration: 2000 });
    try {
      await loginWithOAuth(user);
    } catch (err: any) {
      console.error("[OAuth] Post-login sync failed:", err);
      toast.error("Sync failed. Try again from Settings.");
    }
  }, [setScreen, loginWithOAuth]);

  const handleAuthError = useCallback((error: string) => {
    setIsAuthCallback(false);
    toast.error(error || "Login failed", { duration: 3000 });
  }, []);

  // Handle OAuth callback
  if (isAuthCallback) {
    return (
      <AuthCallback
        onSuccess={handleAuthSuccess}
        onError={handleAuthError}
      />
    );
  }

  if (showSplash) {
    return (
      <SplashScreen
        isDarkMode={true}
        onSkipToFeed={handleSkipToFeed}
        onDevSync={handleDevSync}
        isSyncing={isSyncing}
        syncProgress={syncProgress}
        onLoginWithDiscogs={handleLoginWithDiscogs}
      />
    );
  }

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{
        fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
        backgroundColor: isDarkMode ? "#0C1A2E" : "#ACDEF2",
        background: gradientBg,
        "--app-bg": isDarkMode ? "#0C1A2E" : "#ACDEF2",
      } as React.CSSProperties}
    >
      <DesktopTopNav />

      <div className="flex-1 flex overflow-hidden min-w-0">
        <div className="flex-1 flex lg:justify-center overflow-hidden min-w-0">
          <main
            className="flex-1 lg:flex-initial flex flex-col overflow-hidden min-w-0"
            style={{
              ...contentTokens,
              backgroundColor: "transparent",
              transition: "background-color 200ms ease",
              maxWidth: isDesktop ? "1280px" : undefined,
              width: "100%",
            } as React.CSSProperties}
          >
            {/* Mobile header — slides up on scroll for affected screens */}
            <div
              className="lg:hidden flex-shrink-0"
              style={{
                transform: headerHidden ? "translateY(-58px)" : "translateY(0)",
                marginBottom: headerHidden ? "-58px" : "0px",
                transition: headerHidden
                  ? "transform 200ms cubic-bezier(0.25, 1, 0.5, 1), margin-bottom 200ms cubic-bezier(0.25, 1, 0.5, 1)"
                  : "transform 150ms cubic-bezier(0.25, 1, 0.5, 1), margin-bottom 150ms cubic-bezier(0.25, 1, 0.5, 1)",
              }}
            >
              <MobileHeader />
            </div>
            <div
              className="flex-1 flex flex-col overflow-hidden"
              style={{ "--nav-clearance": mobilePaddingBottom } as React.CSSProperties}
            >
              {/* Breathing room when mobile header is hidden on scroll */}
              <div
                className="lg:hidden flex-shrink-0"
                style={{
                  height: headerHidden ? "12px" : "0px",
                  transition: headerHidden
                    ? "height 200ms cubic-bezier(0.25, 1, 0.5, 1)"
                    : "height 150ms cubic-bezier(0.25, 1, 0.5, 1)",
                }}
              />
              {renderScreen()}
            </div>
          </main>
        </div>

        <AnimatePresence>
          {isDesktop && showAlbumDetail && selectedAlbum && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 380, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
              className="hidden lg:flex flex-col flex-shrink-0 border-l overflow-hidden relative z-[110]"
              style={{
                ...contentTokens,
                minWidth: 0,
                backgroundColor: "var(--c-surface)",
                borderColor: "var(--c-border-strong)",
                transition: "background-color 200ms ease, border-color 200ms ease",
              } as React.CSSProperties}
            >
              <div className="w-[380px] h-full">
                <AlbumDetailPanel />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Scroll fade overlay — dissolves content above the floating bottom nav (mobile only) */}
      {!showAlbumDetail && !sessionPickerAlbumId && (
        <div
          className="fixed left-0 right-0 pointer-events-none lg:hidden"
          style={{
            bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
            height: "140px",
            zIndex: 100,
            background: "linear-gradient(to bottom, transparent, var(--app-bg))",
          }}
        />
      )}

      <BottomTabBar />

      <AnimatePresence>
        {showAlbumDetail && selectedAlbum && <AlbumDetailSheet />}
      </AnimatePresence>

      <AnimatePresence>
        {showFilterDrawer && <FilterDrawer />}
      </AnimatePresence>

      <SessionPickerSheet />

      <Toaster
        position="top-center"
        duration={2500}
        theme={isDarkMode ? "dark" : "light"}
        richColors
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  );
}
