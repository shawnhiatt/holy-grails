import {
  Disc3,
  Music,
  Heart,
  UserRound,
  GalleryVerticalEnd,
  SquareArrowOutUpRight,
  Sun,
  Moon,
  Users,
  BarChart3,
  Newspaper,
  Plus,
  UserPlus,
  UserMinus,
  ArrowLeft,
} from "lucide-react";
import { useApp, type Screen } from "./app-context";
import { useHaptic } from "@/hooks/useHaptic";
import { WantlistCrossoverPrompt } from "./wantlist-crossover-prompt";
import logoDark from "../../imports/logo-holy-grails-dark.svg";
import logoLight from "../../imports/logo-holy-grails-light.svg";

/** Desktop top nav — left group */
const DESKTOP_LEFT_NAV: { id: Screen; label: string; icon: typeof Disc3 }[] = [
  { id: "feed", label: "Feed", icon: Newspaper },
  { id: "crate", label: "Collection", icon: GalleryVerticalEnd },
  { id: "wants", label: "Wantlist", icon: Heart },
  { id: "sessions", label: "Sessions", icon: Music },
];

/** Desktop top nav — right group */
const DESKTOP_RIGHT_NAV: { id: Screen; label: string; icon: typeof Disc3 }[] = [
  { id: "following", label: "Following", icon: Users },
  { id: "purge", label: "Purge", icon: SquareArrowOutUpRight },
  { id: "reports", label: "Insights", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: UserRound },
];

/** Mobile bottom bar */
const MOBILE_NAV_ITEMS: { id: Screen; label: string; icon: typeof Disc3 }[] = [
  { id: "crate", label: "Collection", icon: GalleryVerticalEnd },
  { id: "wants", label: "Wantlist", icon: Heart },
  { id: "feed", label: "Feed", icon: Newspaper },
  { id: "sessions", label: "Sessions", icon: Music },
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
    ? (isDark ? "rgba(235,253,0,0.08)" : "rgba(12,40,74,0.1)")
    : isHeader
      ? (isDark ? "rgba(226,232,240,0.12)" : "rgba(12,40,74,0.12)")
      : "#01294D";
  const thumbBg = isTopnav
    ? (isDark ? "rgba(235,253,0,0.2)" : "#0C284A")
    : isHeader
      ? (isDark ? "rgba(226,232,240,0.25)" : "#0C284A")
      : "rgba(172,222,242,0.15)";
  const iconActiveColor = "#EBFD00";
  const iconInactiveColor = isTopnav
    ? (isDark ? "rgba(235,253,0,0.2)" : "rgba(12,40,74,0.25)")
    : isHeader
      ? (isDark ? "rgba(226,232,240,0.25)" : "rgba(12,40,74,0.35)")
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
        ...(isTopnav ? { border: `1px solid ${isDark ? "rgba(235,253,0,0.15)" : "rgba(12,40,74,0.15)"}` } : {}),
        ...(isHeader ? { border: `1px solid ${isDark ? "rgba(226,232,240,0.2)" : "transparent"}` } : {}),
      }}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Sun
        size={12}
        strokeWidth={2}
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
        strokeWidth={2}
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
  sessions: "Sessions",
  reports: "Insights",
  following: "Following",
  settings: "Settings",
  purge: "Purge",
};

export function MobileHeader() {
  const {
    screen, setScreen, isDarkMode, userAvatar,
    onNewSession, onAddFollowedUser,
    followedUserProfile, onBackFromProfile, onUnfollowUser,
  } = useApp();
  const triggerHapticLight = useHaptic('light');

  const activeBg = "rgba(172,222,242,0.12)";
  const inactiveBg = isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)";

  const isProfileView = screen === "following" && followedUserProfile !== null;

  // Shared right-side nav buttons (Following + Settings)
  const navButtons = (
    <div className="flex items-center flex-shrink-0">
      <button
        onClick={() => { triggerHapticLight(); setScreen("following"); }}
        className="w-11 h-11 flex items-center justify-center tappable transition-colors cursor-pointer"
        title="Following"
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{
            color: "var(--c-text-muted)",
            backgroundColor: screen === "following" ? activeBg : inactiveBg,
            border: screen === "following" ? "2px solid #EBFD00" : "2px solid transparent",
          }}
        >
          <Users size={18} strokeWidth={1.3125} />
        </div>
      </button>
      <button
        onClick={() => { triggerHapticLight(); setScreen("settings"); }}
        className="w-11 h-11 flex items-center justify-center tappable transition-colors cursor-pointer"
        title="Settings"
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{
            color: screen === "settings" ? "#EBFD00" : "var(--c-text-muted)",
            overflow: userAvatar ? "hidden" : undefined,
            backgroundColor: screen === "settings" ? activeBg : inactiveBg,
            border: userAvatar ? (screen === "settings" ? "2px solid #EBFD00" : "2px solid transparent") : undefined,
          }}
        >
          {userAvatar ? (
            <img
              src={userAvatar}
              alt="Profile"
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <UserRound size={18} strokeWidth={screen === "settings" ? 1.83 : 1.3125} />
          )}
        </div>
      </button>
    </div>
  );

  // Variant E — Followed user profile sub-view
  if (isProfileView) {
    return (
      <div
        className="flex items-center lg:hidden px-[16px]"
        style={{ height: "58px", background: "transparent" }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={() => { triggerHapticLight(); onBackFromProfile?.(); }}
            className="w-9 h-9 rounded-full flex items-center justify-center tappable transition-colors cursor-pointer flex-shrink-0"
            style={{ color: "var(--c-text)" }}
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
          onClick={() => { triggerHapticLight(); onUnfollowUser?.(); }}
          className="w-8 h-8 rounded-full flex items-center justify-center tappable transition-colors cursor-pointer flex-shrink-0"
          style={{ color: "var(--c-text-muted)" }}
          title="Unfollow"
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
        <PillLogo className="h-[32px] w-auto" />
        {navButtons}
      </div>
    );
  }

  // Variants B/C/D — Title screens
  const title = SCREEN_TITLES[screen];

  // Screen-specific action button
  let actionButton: React.ReactNode = null;
  if (screen === "sessions") {
    actionButton = (
      <button
        onClick={() => { triggerHapticLight(); onNewSession?.(); }}
        className="w-8 h-8 rounded-full bg-[#EBFD00] flex items-center justify-center text-[#0C284A] hover:bg-[#d9e800] transition-colors tappable cursor-pointer flex-shrink-0"
      >
        <Plus size={18} />
      </button>
    );
  } else if (screen === "following") {
    actionButton = (
      <button
        onClick={() => { triggerHapticLight(); onAddFollowedUser?.(); }}
        className="w-8 h-8 rounded-full bg-[#EBFD00] flex items-center justify-center text-[#0C284A] hover:bg-[#d9e800] transition-colors tappable cursor-pointer flex-shrink-0"
      >
        <UserPlus size={16} />
      </button>
    );
  }

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
        {actionButton}
        {navButtons}
      </div>
    </div>
  );
}

export function BottomTabBar() {
  const { screen, setScreen } = useApp();
  const triggerHaptic = useHaptic('light');

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
        background: "linear-gradient(to bottom, rgb(33,69,100), rgb(1,41,77))",
        boxShadow: "0 4px 24px rgba(1,41,77,0.25), 0 1px 0 rgba(172,222,242,0.08) inset",
      }}
    >
      {MOBILE_NAV_ITEMS.map((item) => {
        const isActive = screen === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => { triggerHaptic(); setScreen(item.id); }}
            aria-current={isActive ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-[3px] px-[4px] h-[52px] tappable transition-all ${
              isActive ? "bg-[rgba(255, 255, 255, 0)]" : ""
            }`}
          >
            <Icon
              size={22}
              strokeWidth={isActive ? 1.83 : 1.26}
              color={isActive ? "#EBFD00" : "#D1D8DF"}
            />
            <span
              style={{
                fontSize: "11px",
                lineHeight: "11px",
                fontWeight: isActive ? 600 : 400,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                color: isActive ? "#EBFD00" : "#D1D8DF",
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
export function DesktopTopNav() {
  const { screen, setScreen, isDarkMode, toggleDarkMode, userAvatar } = useApp();

  const logoFill = isDarkMode ? "#E2E8F0" : "#0C284A";
  const activeColor = isDarkMode ? "#E2E8F0" : "#0C284A";
  const inactiveColor = isDarkMode ? "rgba(226,232,240,0.45)" : "rgba(12,40,74,0.4)";
  const activeBg = isDarkMode ? "rgba(226,232,240,0.1)" : "rgba(12,40,74,0.08)";
  const avatarBorderColor = isDarkMode ? "#E2E8F0" : "#0C284A";

  const renderNavItem = (item: { id: Screen; label: string; icon: typeof Disc3 }) => {
    const isActive = screen === item.id;
    const Icon = item.icon;
    const isSettings = item.id === "settings";
    return (
      <button
        key={item.id}
        onClick={() => setScreen(item.id)}
        aria-current={isActive ? "page" : undefined}
        className="flex items-center gap-[7px] px-[12px] py-[7px] rounded-[8px] tappable transition-all cursor-pointer"
        style={{
          backgroundColor: isActive ? activeBg : "transparent",
        }}
      >
        {isSettings && userAvatar ? (
          <img
            src={userAvatar}
            alt="Profile"
            className="rounded-full object-cover"
            style={{
              width: "20px",
              height: "20px",
              border: isActive ? `1.5px solid ${avatarBorderColor}` : "1.5px solid transparent",
            }}
          />
        ) : (
          <Icon
            size={17}
            strokeWidth={isActive ? 1.8 : 1.2}
            color={isActive ? "#EBFD00" : inactiveColor}
          />
        )}
        <span
          style={{
            fontSize: "13px",
            fontWeight: isActive ? 600 : 400,
            lineHeight: "13px",
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
    <header
      className="hidden lg:flex items-center flex-shrink-0 px-[24px]"
      style={{
        height: "58px",
        background: "transparent",
      }}
    >
      {/* Left nav group */}
      <nav className="flex-1 flex items-center gap-[2px]">
        {DESKTOP_LEFT_NAV.map(renderNavItem)}
      </nav>

      {/* Center: Logo */}
      <button onClick={() => setScreen("feed")} className="shrink-0 cursor-pointer mx-[16px]">
        <PillLogo className="h-[42px] w-auto" />
      </button>

      {/* Right nav group + theme toggle */}
      <nav className="flex-1 flex items-center justify-end gap-[2px]">
        {DESKTOP_RIGHT_NAV.map(renderNavItem)}
        <div className="ml-[8px]">
          <ThemeSwitch isDark={isDarkMode} onToggle={toggleDarkMode} variant="header" />
        </div>
      </nav>
    </header>
  );
}