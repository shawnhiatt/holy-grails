import {
  Disc3,
  Music,
  Heart,
  UserRound,
  GalleryVerticalEnd,
  Broom,
  Sun,
  Moon,
  Users,
  BarChart3,
  Newspaper,
  UserMinus,
  ArrowLeft,
  Search,
} from "./icons";
import { useApp, type Screen } from "./app-context";
import { WantlistCrossoverPrompt } from "./wantlist-crossover-prompt";
import logoDark from "../../imports/logo-holy-grails-dark.svg";
import logoLight from "../../imports/logo-holy-grails-light.svg";

/**
 * Desktop sidebar — destinations, in two groups separated by a hairline.
 *
 * The first group is the mobile bottom tab bar, in the same order: the five
 * places you go to look at your collection. The second is the tools you reach
 * for — Purge is a mode, Following is other people, Settings is the account.
 * Keeping the first group identical to mobile means the two layouts teach each
 * other rather than competing.
 */
const DESKTOP_NAV_PRIMARY: { id: Screen; label: string; icon: typeof Disc3 }[] = [
  { id: "feed", label: "Feed", icon: Newspaper },
  { id: "crate", label: "Collection", icon: GalleryVerticalEnd },
  { id: "wants", label: "Wantlist", icon: Heart },
  { id: "stacks", label: "Sessions", icon: Music },
  { id: "reports", label: "Insights", icon: BarChart3 },
];

const DESKTOP_NAV_TOOLS: { id: Screen; label: string; icon: typeof Disc3 }[] = [
  { id: "purge", label: "Purge", icon: Broom },
  { id: "following", label: "Following", icon: Users },
];

/** Sidebar width — leaves ~1300px beside it on a 14" laptop, so the 1280px
 *  content column lands at full measure without the window being maximized. */
export const DESKTOP_SIDEBAR_WIDTH = 208;

/** Mobile bottom bar */
const MOBILE_NAV_ITEMS: { id: Screen; label: string; icon: typeof Disc3 }[] = [
  { id: "feed", label: "Feed", icon: Newspaper },
  { id: "crate", label: "Collection", icon: GalleryVerticalEnd },
  { id: "wants", label: "Wantlist", icon: Heart },
  { id: "stacks", label: "Sessions", icon: Music },
  { id: "reports", label: "Insights", icon: BarChart3 },
];


/** Compact Sun/Moon toggle switch */
function ThemeSwitch({
  isDark,
  onToggle,
  variant = "header",
}: {
  isDark: boolean;
  onToggle: () => void;
  variant?: "header" | "sidebar" | "topnav";
}) {
  const isHeader = variant === "header";
  const isTopnav = variant === "topnav";
  const trackBg = isTopnav
    ? (isDark ? "rgba(235,253,0,0.08)" : "rgba(22,24,28,0.1)")
    : isHeader
      ? (isDark ? "rgba(226,232,240,0.12)" : "rgba(22,24,28,0.12)")
      : "#16181C";
  const thumbBg = isTopnav
    ? (isDark ? "rgba(235,253,0,0.2)" : "#16181C")
    : isHeader
      ? (isDark ? "rgba(226,232,240,0.25)" : "#16181C")
      : "rgba(172,222,242,0.15)";
  const iconActiveColor = "#EBFD00";
  const iconInactiveColor = isTopnav
    ? (isDark ? "rgba(235,253,0,0.2)" : "rgba(22,24,28,0.25)")
    : isHeader
      ? (isDark ? "rgba(226,232,240,0.25)" : "rgba(22,24,28,0.35)")
      : "rgba(209,216,223,0.3)";

  return (
    <div className="flex items-center" style={{ minHeight: "44px" }}>
    <button
      onClick={onToggle}
      className="relative flex items-center rounded-full cursor-pointer transition-colors"
      style={{
        width: "52px",
        height: "28px",
        backgroundColor: trackBg,
        ...(variant === "sidebar" ? { border: "1px solid rgba(172,222,242,0.5)" } : {}),
        ...(isTopnav ? { border: `1px solid ${isDark ? "rgba(235,253,0,0.15)" : "rgba(22,24,28,0.15)"}` } : {}),
        ...(isHeader ? { border: `1px solid ${isDark ? "rgba(226,232,240,0.2)" : "transparent"}` } : {}),
      }}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Sun
        size={12}
        style={{
          position: "absolute",
          left: "8px",
          top: "50%",
          transform: "translateY(-50%)",
          color: isDark ? iconInactiveColor : iconActiveColor,
          transition: "color 200ms var(--ease-out)",
          zIndex: 1,
        }}
      />
      <Moon
        size={12}
        style={{
          position: "absolute",
          right: "8px",
          top: "50%",
          transform: "translateY(-50%)",
          color: isDark ? iconActiveColor : iconInactiveColor,
          transition: "color 200ms var(--ease-out)",
          zIndex: 1,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "50%",
          transform: "translateY(-50%)",
          left: isDark ? "27px" : "3px",
          width: "22px",
          height: "22px",
          borderRadius: "50%",
          backgroundColor: thumbBg,
          transition: "left 200ms var(--ease-out)",
          boxShadow: "var(--c-shadow-sm)",
        }}
      />
    </button>
    </div>
  );
}

/** Pill-shaped logo — theme-aware, switches between dark/light SVG variants */
export function PillLogo({ className, onClick, forceDark }: { className?: string; onClick?: () => void; forceDark?: boolean }) {
  const { isDarkMode } = useApp();
  const src = forceDark || isDarkMode ? logoDark : logoLight;
  return (
    <img
      src={src}
      alt="Holy Grails"
      className={className}
      onClick={onClick}
      style={{ cursor: "pointer" }}
      draggable={false}
    />
  );
}

const SCREEN_TITLES: Partial<Record<Screen, string>> = {
  crate: "Collection",
  wants: "Wantlist",
  stacks: "Sessions",
  reports: "Insights",
  following: "Following",
  settings: "Settings",
  purge: "Purge",
};

export function MobileHeader() {
  const {
    screen, setScreen, isDarkMode, userAvatar,
    followedUserProfile, onBackFromProfile, onUnfollowUser, stackDetailOpen,
    isBackgroundSyncing, isSyncingFollowing, setShowDiscogsSearch,
  } = useApp();

  const activeBg = "rgba(172,222,242,0.12)";
  const inactiveBg = isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)";
  // Yellow does not read on the light transparent header — light mode uses
  // navy for the active header buttons, matching the bottom bar convention
  const activeAccent = isDarkMode ? "#EBFD00" : "#16181C";

  const isProfileView = screen === "following" && followedUserProfile !== null;
  // Session detail sub-view: render no header at all. StackDetail already draws
  // a full header (back + session name + share) and — unlike this component,
  // which is lg:hidden — it does so at every breakpoint, so moving those into a
  // mobile-only variant would strand desktop with no back button. Suppressing
  // the row instead leaves the session name as the sole heading and reclaims
  // ~58px. Safe-area top padding lives on the wrapper in App.tsx, not here, so
  // returning null does not push content under the status bar.
  const isStackDetailView = screen === "stacks" && stackDetailOpen;
  // On the feed, the identity block's SYNC control already shows the
  // collection sync — the chip there would be redundant. It still shows on
  // the feed for following-feed syncs, which the SYNC control doesn't cover.
  const showSyncChip =
    (isBackgroundSyncing && screen !== "feed") || isSyncingFollowing;

  // Shared right-side nav buttons (Look It Up + Following + Settings).
  // The sync chip leads the group so it never splits the button cluster.
  const navButtons = (
    <div className="flex items-center flex-shrink-0">
      {showSyncChip && (
        <div
          className="flex items-center justify-center w-11 h-11"
          title="Syncing"
          aria-label="Syncing"
        >
          <Disc3 size={18} className="disc-spinner" style={{ color: "var(--c-text-muted)" }} />
        </div>
      )}
      <button
        onClick={() => { setShowDiscogsSearch(true); }}
        className="w-11 h-11 flex items-center justify-center tappable transition-colors cursor-pointer"
        title="Look It Up"
        aria-label="Look It Up"
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ color: "var(--c-text-muted)", backgroundColor: inactiveBg }}
        >
          <Search size={18} weight="light" />
        </div>
      </button>
      <button
        onClick={() => { setScreen("following"); }}
        className="w-11 h-11 flex items-center justify-center tappable transition-colors cursor-pointer"
        title="Following"
        aria-label="Following"
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{
            color: screen === "following" ? activeAccent : "var(--c-text-muted)",
            backgroundColor: screen === "following" ? activeBg : inactiveBg,
            border: screen === "following" ? `2px solid ${activeAccent}` : "2px solid transparent",
          }}
        >
          <Users size={18} weight={screen === "following" ? "fill" : "light"} />
        </div>
      </button>
      <button
        onClick={() => { setScreen("settings"); }}
        className="w-11 h-11 flex items-center justify-center tappable transition-colors cursor-pointer"
        title="Settings"
        aria-label="Settings"
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{
            color: screen === "settings" ? activeAccent : "var(--c-text-muted)",
            overflow: userAvatar ? "hidden" : undefined,
            backgroundColor: screen === "settings" ? activeBg : inactiveBg,
            border: userAvatar ? (screen === "settings" ? `2px solid ${activeAccent}` : "2px solid transparent") : undefined,
          }}
        >
          {userAvatar ? (
            <img
              src={userAvatar}
              alt="Profile"
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <UserRound size={18} weight={screen === "settings" ? "fill" : "light"} />
          )}
        </div>
      </button>
    </div>
  );

  // Variant F — Session detail sub-view (no header; StackDetail owns it)
  if (isStackDetailView) return null;

  // Variant E — Followed user profile sub-view
  if (isProfileView) {
    return (
      <div
        className="flex items-center lg:hidden px-[16px]"
        style={{ height: "58px", background: "transparent" }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={() => { onBackFromProfile?.(); }}
            className="w-9 h-9 rounded-full flex items-center justify-center tappable transition-colors cursor-pointer flex-shrink-0"
            style={{ color: "var(--c-text)" }}
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          {followedUserProfile.avatarUrl ? (
            <img
              src={followedUserProfile.avatarUrl}
              alt={followedUserProfile.username}
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
              style={{ border: "2px solid var(--c-border)" }}
            />
          ) : (
            <div
              className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center"
              style={{ backgroundColor: "var(--c-chip-bg)", border: "2px solid var(--c-border)" }}
            >
              <Users size={18} style={{ color: "var(--c-text-muted)" }} />
            </div>
          )}
          <h1
            className="flex-1 min-w-0"
            style={{
              fontSize: "22px",
              fontWeight: 600,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              letterSpacing: "-0.5px",
              color: "var(--c-text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            @{followedUserProfile.username}
          </h1>
        </div>
        <button
          onClick={() => { onUnfollowUser?.(); }}
          className="w-8 h-8 rounded-full flex items-center justify-center tappable transition-colors cursor-pointer flex-shrink-0"
          style={{ color: "var(--c-text-muted)" }}
          title="Unfollow"
          aria-label="Unfollow"
        >
          <UserMinus size={16} />
        </button>
      </div>
    );
  }

  // Variant A — Feed screen (wordmark left, nav buttons right)
  if (screen === "feed") {
    return (
      <div
        className="flex items-center justify-between lg:hidden px-[16px]"
        style={{ height: "58px", background: "transparent" }}
      >
        <PillLogo className="w-[140px] h-auto" />
        {navButtons}
      </div>
    );
  }

  // Variants B/C/D — Title screens
  const title = SCREEN_TITLES[screen];

  return (
    <div
      className="flex items-center lg:hidden px-[16px]"
      style={{ height: "58px", background: "transparent" }}
    >
      <h1
        className="flex-1 min-w-0"
        style={{
          fontSize: "32px",
          fontWeight: 700,
          fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
          letterSpacing: "-0.5px",
          lineHeight: 1.25,
          color: "var(--c-text)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {title}
      </h1>
      <div className="flex items-center gap-1 flex-shrink-0">
        {navButtons}
      </div>
    </div>
  );
}

export function BottomTabBar() {
  const { screen, setScreen, isDarkMode } = useApp();

  // Theme-aware bar surface. The dark gradient sits in the app's background
  // family — a step above --c-surface-alt falling to just above --c-bg — so the
  // bar reads as part of the canvas; light is a near-white surface bar.
  const barBackground = isDarkMode
    ? "linear-gradient(to bottom in oklab, #14171D, #0C0F13)"
    : "linear-gradient(to bottom in oklab, #FFFFFF, #F9F9FA)";
  const barBorderTop = isDarkMode
    ? "1px solid rgba(226,232,240,0.08)"
    : "1px solid #D7DADE";
  const barShadow = isDarkMode
    ? "0 -2px 16px rgba(0,0,0,0.35)"
    : "0 -2px 16px rgba(22,24,28,0.08)";
  // Light mode uses a near-neutral black active (matching the desktop top nav)
  // since yellow does not read on a light bar. Dark mode keeps the brand yellow.
  const activeColor = isDarkMode ? "#EBFD00" : "#16181C";
  const inactiveColor = isDarkMode ? "#D1D8DF" : "rgba(22,24,28,0.65)";

  return (
    <>
    <WantlistCrossoverPrompt />
    <nav
      className="fixed z-[130] flex items-center justify-between lg:hidden bottom-tab-bar"
      style={{
        bottom: 0,
        left: 0,
        right: 0,
        height: "calc(54px + env(safe-area-inset-bottom, 0px))",
        borderRadius: 0,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "8px",
        paddingRight: "8px",
        background: barBackground,
        borderTop: barBorderTop,
        boxShadow: barShadow,
      }}
    >
      {MOBILE_NAV_ITEMS.map((item) => {
        const isActive = screen === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => {
              if (isActive && (item.id === "crate" || item.id === "wants")) {
                window.dispatchEvent(new CustomEvent("hg:focus-filter"));
              }
              if (isActive && item.id === "feed") {
                window.dispatchEvent(new CustomEvent("hg:feed-scroll-top"));
              }
              setScreen(item.id);
            }}
            aria-current={isActive ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-[3px] px-[4px] h-[52px] tappable transition-all ${
              isActive ? "bg-[rgba(255, 255, 255, 0)]" : ""
            }`}
          >
            <Icon
              size={22}
              weight={isActive ? "fill" : "light"}
              color={isActive ? activeColor : inactiveColor}
            />
            <span
              style={{
                fontSize: "11px",
                lineHeight: "11px",
                fontWeight: isActive ? 600 : 400,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                color: isActive ? activeColor : inactiveColor,
              }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
    </>
  );
}

/** Desktop top navigation bar — replaces sidebar on lg+ viewports */
/* ═══════════════════════════ DESKTOP CHROME ═══════════════════════════ */

/**
 * Desktop screen title.
 *
 * Centralized rather than repeated per screen: it reads the same SCREEN_TITLES
 * map MobileHeader uses, so the two can't drift, and any screen added later gets
 * a title without touching this file. Rendered from App.tsx above renderScreen()
 * — outside each screen's own scroll container, so it stays put while content
 * scrolls, which is how Collection's header already behaved.
 *
 * `hidden lg:block`: on mobile the <h1> comes from MobileHeader instead.
 *
 * **This element owns the entire title-to-content gap.** Every screen zeroes its
 * own desktop top padding (`lg:pt-0`) so the 16px below is the only spacer and
 * the distance is identical on all of them; previously each screen kept its own
 * `lg:pt-*` stacked on top of this and the gap ranged 14-30px depending on which
 * screen you were looking at. If you change the padding here, it changes
 * everywhere — which is the point. Do not reintroduce a per-screen `lg:pt-*` on
 * whichever element sits directly beneath the title.
 *
 * Two sub-views are deliberate exceptions:
 * - **Session detail** renders nothing. StackDetail already draws its own header
 *   (back chevron + editable session name + share) at EVERY breakpoint, so a
 *   "Sessions" title above it would put the less informative line on top — the
 *   same reason MobileHeader returns null there.
 * - **A followed user's profile** shows their @username rather than "Following",
 *   because that is what you are looking at. That view had no heading at all on
 *   desktop before this; it still has no back button (the rail's Following item
 *   is the way back, and unlike mobile the rail is always on screen).
 */
export function DesktopScreenTitle() {
  const { screen, followedUserProfile, stackDetailOpen } = useApp();

  if (screen === "stacks" && stackDetailOpen) return null;

  const title =
    screen === "following" && followedUserProfile
      ? `@${followedUserProfile.username}`
      : SCREEN_TITLES[screen];

  // Feed is intentionally absent from SCREEN_TITLES — it leads with the logo in
  // the header and the identity block below it
  if (!title) return null;

  return (
    <div className="hidden lg:block flex-shrink-0 px-[24px] pt-[18px] pb-[16px]">
      <h1
        className="screen-title"
        style={{
          fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
          fontWeight: 700,
          lineHeight: 1.1,
          color: "var(--c-text)",
          margin: 0,
          // A long Discogs username must ellipsize, not overflow, at 48px
          display: "block",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
        }}
      >
        {title}
      </h1>
    </div>
  );
}

/**
 * Shared color derivation for the desktop sidebar and top strip.
 *
 * Both render OUTSIDE the content token cascade — getContentTokens() is spread
 * onto <main> and the side panel only ("Header & nav are unaffected by dark
 * mode", theme.ts), so var(--c-*) does not resolve here. These are the blessed
 * derived equivalents, same approach the top nav used before the sidebar.
 */
function useDesktopChromeColors() {
  const { isDarkMode } = useApp();
  return {
    isDarkMode,
    activeColor: isDarkMode ? "#E2E8F0" : "#16181C",
    inactiveColor: isDarkMode ? "rgba(226,232,240,0.45)" : "rgba(22,24,28,0.4)",
    activeBg: isDarkMode ? "rgba(226,232,240,0.1)" : "rgba(22,24,28,0.08)",
    // Matches the bottom tab bar's top border / --c-border light
    hairline: isDarkMode ? "rgba(226,232,240,0.08)" : "#D7DADE",
    fieldBg: isDarkMode ? "rgba(226,232,240,0.06)" : "rgba(22,24,28,0.035)",
    fieldBorder: isDarkMode ? "rgba(226,232,240,0.12)" : "rgba(22,24,28,0.12)",
    // Yellow does not read on a light surface — light mode uses the near-neutral
    // black, matching the mobile bottom bar convention
    accent: isDarkMode ? "#EBFD00" : "#16181C",
  };
}

/**
 * Desktop left rail — all nine destinations.
 *
 * Replaced a centered-wordmark top nav that split four items left against five
 * right: it balanced by item count rather than by hierarchy, left "Look It Up"
 * reading as a ninth place to go rather than a tool, and ran full-bleed while
 * the content column below was centered at 1280px, so nothing in the header
 * lined up with anything under it. The rail gives the destinations room, and
 * hands the top strip back to search + status.
 *
 * Transparent over the app gradient with a single right hairline — the same
 * no-fixed-bar treatment the top nav used. Hidden below lg; mobile keeps the
 * bottom tab bar untouched.
 */
export function DesktopSidebar() {
  const {
    screen, setScreen, discogsUsername, userAvatar, isDarkMode, toggleDarkMode,
    isBackgroundSyncing, isSyncingFollowing, setShowDiscogsSearch,
  } = useApp();
  const { activeColor, inactiveColor, activeBg, hairline, accent } =
    useDesktopChromeColors();

  // Mirrors MobileHeader: the feed identity block already shows the collection
  // sync, so the chip is redundant there. It still shows on the feed for
  // following-feed syncs, which that control doesn't cover.
  const showSyncChip =
    (isBackgroundSyncing && screen !== "feed") || isSyncingFollowing;

  const renderNavItem = (item: { id: Screen; label: string; icon: typeof Disc3 }) => {
    const isActive = screen === item.id;
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        onClick={() => {
          if (isActive && item.id === "feed") {
            window.dispatchEvent(new CustomEvent("hg:feed-scroll-top"));
          }
          setScreen(item.id);
        }}
        aria-current={isActive ? "page" : undefined}
        className="w-full flex items-center gap-[10px] px-[10px] py-[9px] rounded-[8px] tappable transition-all cursor-pointer text-left"
        style={{ backgroundColor: isActive ? activeBg : "transparent" }}
      >
        <Icon
          size={18}
          weight={isActive ? "fill" : "light"}
          color={isActive ? accent : inactiveColor}
        />
        <span
          style={{
            fontSize: "14px",
            fontWeight: isActive ? 600 : 400,
            lineHeight: "14px",
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            color: isActive ? activeColor : inactiveColor,
            transition: "color 150ms ease",
          }}
        >
          {item.label}
        </span>
      </button>
    );
  };

  return (
    <aside
      className="hidden lg:flex flex-col flex-shrink-0 overflow-y-auto overlay-scroll"
      style={{
        width: `${DESKTOP_SIDEBAR_WIDTH}px`,
        background: "transparent",
        borderRight: `1px solid ${hairline}`,
      }}
    >
      {/* Logo */}
      <button
        onClick={() => setScreen("feed")}
        className="shrink-0 cursor-pointer flex items-center"
        style={{ height: "58px", padding: "0 14px" }}
        aria-label="Holy Grails — go to Feed"
      >
        <PillLogo className="h-[34px] w-auto" />
      </button>

      <nav className="flex flex-col gap-[2px] px-[12px] pt-[6px]">
        {DESKTOP_NAV_PRIMARY.map(renderNavItem)}
      </nav>

      <div
        className="mx-[22px] my-[12px] shrink-0"
        style={{ height: 1, backgroundColor: hairline }}
      />

      <nav className="flex flex-col gap-[2px] px-[12px]">
        {DESKTOP_NAV_TOOLS.map(renderNavItem)}
      </nav>

      {showSyncChip && (
        <div
          className="flex items-center gap-[8px] px-[22px] pt-[14px]"
          title="Syncing"
          style={{ color: inactiveColor }}
        >
          <Disc3 size={15} className="disc-spinner" />
          <span
            style={{
              fontSize: "13px",
              fontWeight: 400,
              lineHeight: "13px",
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            }}
          >
            Syncing
          </span>
        </div>
      )}

      <div className="flex-1" style={{ minHeight: "24px" }} />

      {/*
        Search sits at the foot of the rail, above the account row, and is
        deliberately styled as a destination rather than as a field. It was a
        280px input-shaped button in a top strip; an element that looks like an
        input but cannot be typed into is a promise the control doesn't keep, and
        once it moved here the strip held nothing but an intermittent sync chip,
        so the strip went away and the rail absorbed both.

        No divider above it: the flex-1 spacer already separates it from the
        destinations, and the footer hairline below closes it off — a third
        hairline in a 208px rail is clutter, not structure.

        It takes no active state — it opens an overlay, so there is no screen for
        it to be "on". That is why it is not in DESKTOP_NAV_PRIMARY.
      */}
      <nav className="flex flex-col px-[12px] pb-[4px]">
        <button
          onClick={() => setShowDiscogsSearch(true)}
          className="w-full flex items-center gap-[10px] px-[10px] py-[9px] rounded-[8px] tappable transition-all cursor-pointer text-left"
          style={{ backgroundColor: "transparent" }}
          title="Look It Up"
          aria-label="Search the Discogs database"
        >
          <Search size={18} weight="light" color={inactiveColor} />
          <span
            style={{
              fontSize: "14px",
              fontWeight: 400,
              lineHeight: "14px",
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              color: inactiveColor,
            }}
          >
            Search
          </span>
        </button>
      </nav>

      {/*
        Account footer — avatar + username, and the way into Settings.
        Settings is deliberately NOT also a nav row above: an avatar-and-name
        row at the foot of a rail is the conventional account affordance, it
        matches MobileHeader (where the avatar is likewise the way in), and it
        uses vertical room the rail has going spare. The theme switch lives here
        too rather than in the top strip, where it and the avatar sat marooned
        a full content-width away from the only other control.
      */}
      <div style={{ borderTop: `1px solid ${hairline}`, padding: "10px 12px" }}>
        <div className="flex items-center gap-[8px]">
          <button
            onClick={() => setScreen("settings")}
            aria-current={screen === "settings" ? "page" : undefined}
            className="flex-1 min-w-0 flex items-center gap-[10px] px-[6px] py-[7px] rounded-[8px] tappable transition-all cursor-pointer text-left"
            style={{ backgroundColor: screen === "settings" ? activeBg : "transparent" }}
            title="Settings"
          >
            {userAvatar ? (
              <img
                src={userAvatar}
                alt=""
                className="rounded-full object-cover flex-shrink-0"
                style={{
                  width: "26px",
                  height: "26px",
                  border: screen === "settings" ? `1.5px solid ${activeColor}` : "1.5px solid transparent",
                }}
              />
            ) : (
              <UserRound
                size={20}
                className="flex-shrink-0"
                weight={screen === "settings" ? "fill" : "light"}
                color={screen === "settings" ? accent : inactiveColor}
              />
            )}
            <span
              style={{
                fontSize: "13px",
                fontWeight: screen === "settings" ? 600 : 500,
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                color: screen === "settings" ? activeColor : inactiveColor,
                // Long Discogs usernames must ellipsize rather than push the
                // theme switch out of the rail
                display: "block",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              {discogsUsername || "Settings"}
            </span>
          </button>
          <div className="flex-shrink-0">
            <ThemeSwitch isDark={isDarkMode} onToggle={toggleDarkMode} variant="header" />
          </div>
        </div>
      </div>
    </aside>
  );
}

