import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import {
  type Album,
  type WantItem,
  type Session,
  type PurgeTag,
  type Friend,
  MOCK_ALBUMS,
  MOCK_WANTS,
  MOCK_SESSIONS,
  MOCK_FRIENDS,
  FOLDERS,
} from "./mock-data";
import {
  fetchIdentity,
  fetchCollection,
  fetchWantlist,
  fetchUserProfile,
  fetchCollectionValue,
  type CollectionValue,
  setDemoCollectionValue,
  clearCollectionValue,
  clearAllMarketData,
} from "./discogs-api";

// --- HMR-safe context singleton ---
// During HMR, this module can be re-evaluated, creating a new context object.
// Consumers compiled against the old module would still reference the old context,
// causing "useApp must be used within AppProvider". By storing the context on
// globalThis, we ensure the same React context object survives across HMR reloads.
const APP_CONTEXT_KEY = "__HOLY_GRAILS_APP_CONTEXT__" as const;

function getOrCreateContext(): React.Context<AppState | null> {
  const g = globalThis as any;
  if (!g[APP_CONTEXT_KEY]) {
    g[APP_CONTEXT_KEY] = createContext<AppState | null>(null);
  }
  return g[APP_CONTEXT_KEY];
}

export type Screen = "crate" | "purge" | "sessions" | "wants" | "friends" | "settings" | "reports" | "feed";
export type ViewMode = "crate" | "list" | "grid" | "artwork";
export type SortOption =
  | "artist-az"
  | "artist-za"
  | "title-az"
  | "year-new"
  | "year-old"
  | "added-new"
  | "added-old"
  | "last-played-oldest";

interface AppState {
  screen: Screen;
  setScreen: (s: Screen) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  albums: Album[];
  wants: WantItem[];
  sessions: Session[];
  friends: Friend[];
  addFriend: (friend: Friend) => void;
  removeFriend: (friendId: string) => void;
  selectedAlbumId: string | null;
  setSelectedAlbumId: (id: string | null) => void;
  selectedAlbum: Album | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeFolder: string;
  setActiveFolder: (f: string) => void;
  sortOption: SortOption;
  setSortOption: (s: SortOption) => void;
  filteredAlbums: Album[];
  setPurgeTag: (albumId: string, tag: PurgeTag) => void;
  toggleWantPriority: (wantId: string) => void;
  addToWantList: (item: WantItem) => void;
  isInWants: (releaseId: string | number) => boolean;
  isInCollection: (releaseId: string | number) => boolean;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, name: string) => void;
  reorderSessionAlbums: (sessionId: string, albumIds: string[]) => void;
  showFilterDrawer: boolean;
  setShowFilterDrawer: (v: boolean) => void;
  showAlbumDetail: boolean;
  setShowAlbumDetail: (v: boolean) => void;
  purgeFilter: PurgeTag | "unrated" | "all";
  setPurgeFilter: (f: PurgeTag | "unrated" | "all") => void;
  wantFilter: "all" | "priority";
  setWantFilter: (f: "all" | "priority") => void;
  wantSearchQuery: string;
  setWantSearchQuery: (q: string) => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  // Last Played tracking
  lastPlayed: Record<string, string>;
  markPlayed: (albumId: string) => void;
  neverPlayedFilter: boolean;
  setNeverPlayedFilter: (v: boolean) => void;
  rediscoverMode: boolean;
  setRediscoverMode: (v: boolean) => void;
  rediscoverAlbums: Album[];
  // Display preferences
  hidePurgeIndicators: boolean;
  setHidePurgeIndicators: (v: boolean) => void;
  hideGalleryMeta: boolean;
  setHideGalleryMeta: (v: boolean) => void;
  // Header hide-on-scroll
  headerHidden: boolean;
  setHeaderHidden: (v: boolean) => void;
  // Discogs sync
  folders: string[];
  discogsToken: string;
  setDiscogsToken: (t: string) => void;
  discogsUsername: string;
  setDiscogsUsername: (u: string) => void;
  isSyncing: boolean;
  syncProgress: string;
  lastSynced: string;
  syncFromDiscogs: () => Promise<{ albums: number; folders: number; wants: number }>;
  syncStats: { albums: number; folders: number; wants: number } | null;
  // User profile
  userAvatar: string;
  // Developer / QA resets
  resetToDemo: () => void;
  wipeAllData: () => void;
  devSyncUser: (username: string, token: string) => Promise<void>;
  // Connect Discogs flow trigger (from within the main app)
  connectDiscogsRequested: boolean;
  requestConnectDiscogs: () => void;
  clearConnectDiscogsRequest: () => void;
  // Session Picker
  sessionPickerAlbumId: string | null;
  openSessionPicker: (albumId: string) => void;
  closeSessionPicker: () => void;
  isInSession: (albumId: string, sessionId: string) => boolean;
  toggleAlbumInSession: (albumId: string, sessionId: string) => void;
  createSessionDirect: (name: string, initialAlbumIds?: string[]) => string;
  isAlbumInAnySession: (albumId: string) => boolean;
  mostRecentSessionId: string | null;
  firstSessionJustCreated: boolean;
}

const AppContext = getOrCreateContext();

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

function getInitialDarkMode(): boolean {
  try {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("hg-dark-mode");
      if (stored !== null) return stored === "true";
    }
  } catch {
    // ignore
  }
  return true; // default to dark mode
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [screen, setScreenRaw] = useState<Screen>("feed");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [albums, setAlbums] = useState<Album[]>([]);
  const [wants, setWants] = useState<WantItem[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState("All");
  const [sortOption, setSortOption] = useState<SortOption>("artist-az");
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [showAlbumDetail, setShowAlbumDetail] = useState(false);
  const [purgeFilter, setPurgeFilter] = useState<PurgeTag | "unrated" | "all">("unrated");
  const [wantFilter, setWantFilter] = useState<"all" | "priority">("all");
  const [wantSearchQuery, setWantSearchQuery] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(getInitialDarkMode);

  // Last Played tracking
  const [lastPlayed, setLastPlayed] = useState<Record<string, string>>({});
  const [neverPlayedFilter, setNeverPlayedFilter] = useState(false);
  const [rediscoverMode, setRediscoverMode] = useState(false);

  // Display preferences
  const [hidePurgeIndicators, setHidePurgeIndicators] = useState(false);
  const [hideGalleryMeta, setHideGalleryMeta] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);

  // Discogs sync state
  const [folders, setFolders] = useState<string[]>([]);
  const [discogsToken, setDiscogsToken] = useState("");
  const [discogsUsername, setDiscogsUsername] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [lastSynced, setLastSynced] = useState("");
  const [syncStats, setSyncStats] = useState<{ albums: number; folders: number; wants: number } | null>(null);

  // User profile
  const [userAvatar, setUserAvatar] = useState("");

  // Connect Discogs flow trigger
  const [connectDiscogsRequested, setConnectDiscogsRequested] = useState(false);

  // Session Picker
  const [sessionPickerAlbumId, setSessionPickerAlbumId] = useState<string | null>(null);
  const [firstSessionJustCreated, setFirstSessionJustCreated] = useState(false);

  // Wrap setScreen to close all overlays and reset transient state
  const setScreen = useCallback((s: Screen) => {
    setScreenRaw(s);
    // Close any open overlays so they don't persist across screens
    setShowAlbumDetail(false);
    setShowFilterDrawer(false);
    setSelectedAlbumId(null);
    setSessionPickerAlbumId(null);
    // Reset header visibility when navigating
    setHeaderHidden(false);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("hg-dark-mode", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const selectedAlbum = useMemo(
    () => albums.find((a) => a.id === selectedAlbumId) || null,
    [albums, selectedAlbumId]
  );

  const filteredAlbums = useMemo(() => {
    let result = [...albums];

    if (activeFolder !== "All") {
      result = result.filter((a) => a.folder === activeFolder);
    }

    if (neverPlayedFilter) {
      result = result.filter((a) => !lastPlayed[a.id]);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.artist.toLowerCase().includes(q) ||
          a.title.toLowerCase().includes(q) ||
          a.label.toLowerCase().includes(q)
      );
    }

    switch (sortOption) {
      case "artist-az":
        result.sort((a, b) => a.artist.localeCompare(b.artist));
        break;
      case "artist-za":
        result.sort((a, b) => b.artist.localeCompare(a.artist));
        break;
      case "title-az":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "year-new":
        result.sort((a, b) => b.year - a.year);
        break;
      case "year-old":
        result.sort((a, b) => a.year - b.year);
        break;
      case "added-new":
        result.sort(
          (a, b) =>
            new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
        );
        break;
      case "added-old":
        result.sort(
          (a, b) =>
            new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime()
        );
        break;
      case "last-played-oldest":
        result.sort((a, b) => {
          const aDate = lastPlayed[a.id] ? new Date(lastPlayed[a.id]).getTime() : 0;
          const bDate = lastPlayed[b.id] ? new Date(lastPlayed[b.id]).getTime() : 0;
          return aDate - bDate; // 0 (never played) sorts to top
        });
        break;
    }

    return result;
  }, [albums, activeFolder, searchQuery, sortOption, neverPlayedFilter, lastPlayed]);

  // Compute rediscover albums: never played, or not played in 6+ months, or added 3+ months ago but never played
  const computedRediscoverAlbums = useMemo(() => {
    const now = Date.now();
    const sixMonths = 180 * 86400000;
    const threeMonths = 90 * 86400000;

    return albums.filter((a) => {
      const lp = lastPlayed[a.id];
      if (!lp) return true; // never played
      const lpTime = new Date(lp).getTime();
      if (now - lpTime > sixMonths) return true; // not played in 6+ months
      const addedTime = new Date(a.dateAdded).getTime();
      if (!lp && now - addedTime > threeMonths) return true; // added 3+ months ago, never played
      return false;
    }).sort((a, b) => {
      // Prioritize: never played first, then oldest played
      const aLp = lastPlayed[a.id];
      const bLp = lastPlayed[b.id];
      if (!aLp && bLp) return -1;
      if (aLp && !bLp) return 1;
      if (!aLp && !bLp) {
        // Both never played — sort by oldest dateAdded
        return new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime();
      }
      // Both have been played — sort by oldest last played
      return new Date(aLp!).getTime() - new Date(bLp!).getTime();
    });
  }, [albums, lastPlayed]);

  const setPurgeTag = useCallback((albumId: string, tag: PurgeTag) => {
    setAlbums((prev) =>
      prev.map((a) => (a.id === albumId ? { ...a, purgeTag: tag } : a))
    );
  }, []);

  const toggleWantPriority = useCallback((wantId: string) => {
    setWants((prev) =>
      prev.map((w) => (w.id === wantId ? { ...w, priority: !w.priority } : w))
    );
  }, []);

  const addToWantList = useCallback((item: WantItem) => {
    setWants((prev) => {
      // Guard against duplicates by release_id
      const rid = Number(item.release_id);
      if (prev.some((w) => Number(w.release_id) === rid)) return prev;
      return [...prev, item];
    });
  }, []);

  const isInWants = useCallback((releaseId: string | number) => {
    const rid = Number(releaseId);
    return wants.some((w) => Number(w.release_id) === rid);
  }, [wants]);

  const isInCollection = useCallback((releaseId: string | number) => {
    const rid = Number(releaseId);
    return albums.some((a) => Number(a.release_id) === rid);
  }, [albums]);

  const deleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }, []);

  const renameSession = useCallback((sessionId: string, name: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, name } : s))
    );
  }, []);

  const reorderSessionAlbums = useCallback((sessionId: string, albumIds: string[]) => {
    setSessions((prev) => {
      const sessionIndex = prev.findIndex((s) => s.id === sessionId);
      if (sessionIndex === -1) return prev;

      const session = prev[sessionIndex];
      const now = new Date().toISOString();
      return [
        ...prev.slice(0, sessionIndex),
        { ...session, albumIds, lastModified: now },
        ...prev.slice(sessionIndex + 1),
      ];
    });
  }, []);

  const addFriend = useCallback((friend: Friend) => {
    setFriends((prev) => [...prev, friend]);
  }, []);

  const removeFriend = useCallback((friendId: string) => {
    setFriends((prev) => prev.filter((f) => f.id !== friendId));
  }, []);

  const syncFromDiscogs = useCallback(async (): Promise<{ albums: number; folders: number; wants: number }> => {
    setIsSyncing(true);
    setSyncProgress("Authenticating...");
    try {
      // 1. Get username from token
      const username = await fetchIdentity(discogsToken);
      setDiscogsUsername(username);

      // 1b. Fetch user profile (avatar)
      try {
        const profile = await fetchUserProfile(username, discogsToken);
        setUserAvatar(profile.avatar);
      } catch (e) {
        console.warn("[Discogs] Profile fetch failed:", e);
      }

      // 2. Fetch collection
      setSyncProgress("Fetching collection...");
      const { albums: newAlbums, folders: newFolders } = await fetchCollection(
        username,
        discogsToken,
        (loaded, total) => setSyncProgress(`Fetching collection... ${loaded}/${total}`)
      );

      // Preserve purge tags from existing albums
      setAlbums((prev) => {
        const tagMap = new Map<string, PurgeTag>();
        for (const a of prev) {
          if (a.purgeTag) tagMap.set(a.id, a.purgeTag);
        }
        return newAlbums.map((a) => ({
          ...a,
          purgeTag: tagMap.get(a.id) || null,
        }));
      });
      setFolders(newFolders);

      // 3. Fetch want list
      setSyncProgress("Fetching want list...");
      const newWants = await fetchWantlist(
        username,
        discogsToken,
        (loaded, total) => setSyncProgress(`Fetching wants... ${loaded}/${total}`)
      );

      // Preserve priority flags from existing wants
      setWants((prev) => {
        const prioMap = new Map<string, boolean>();
        for (const w of prev) {
          if (w.priority) prioMap.set(w.id, true);
        }
        return newWants.map((w) => ({
          ...w,
          priority: prioMap.get(w.id) || false,
        }));
      });

      // 4. Update sync metadata
      const now = new Date();
      const formatted = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        + " \u00b7 " + now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      setLastSynced(formatted);
      setSyncStats({
        albums: newAlbums.length,
        folders: newFolders.filter((f) => f !== "All").length,
        wants: newWants.length,
      });
      setSyncProgress("");

      // 5. Fetch collection value from Discogs API
      setSyncProgress("Fetching collection value...");
      try {
        await fetchCollectionValue(username, discogsToken);
      } catch (e) {
        console.warn("[Discogs] Collection value fetch failed:", e);
        // No fallback — Insights screen will show explicit unavailable state
      }

      // Save token + username to localStorage
      try {
        localStorage.setItem("hg-discogs-token", discogsToken);
        localStorage.setItem("hg-discogs-username", username);
        localStorage.setItem("hg-last-synced", formatted);
      } catch (_e) { /* ignore */ }

      // Return the counts so callers can use them immediately (before React re-renders)
      return {
        albums: newAlbums.length,
        folders: newFolders.filter((f) => f !== "All").length,
        wants: newWants.length,
      };
    } catch (err: any) {
      setSyncProgress("");
      throw err;
    } finally {
      setIsSyncing(false);
    }
  }, [discogsToken]);

  const resetToDemo = useCallback(() => {
    // Reset React state to demo defaults
    setAlbums(MOCK_ALBUMS.map(a => ({ ...a, purgeTag: null })));
    setWants(MOCK_WANTS.map(w => ({ ...w, priority: false })));
    setSessions([]);
    setFriends(MOCK_FRIENDS);
    setFolders(FOLDERS);
    setSelectedAlbumId(null);
    setSearchQuery("");
    setActiveFolder("All");
    setSortOption("artist-az");
    setPurgeFilter("unrated");
    setWantFilter("all");
    setWantSearchQuery("");
    setLastSynced("");
    setSyncStats(null);
    setSyncProgress("");
    setLastPlayed({});
    setNeverPlayedFilter(false);
    setRediscoverMode(false);
    setShowAlbumDetail(false);
    setShowFilterDrawer(false);
    setSessionPickerAlbumId(null);
    setFirstSessionJustCreated(false);
    // Set placeholder avatar for demo profile
    setUserAvatar("https://images.unsplash.com/photo-1758295040962-18a6812be713?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx2aW55bCUyMHJlY29yZCUyMGNvbGxlY3RvciUyMG1hbGUlMjBwb3J0cmFpdCUyMGNhc3VhbHxlbnwxfHx8fDE3NzE1Njc4MzZ8MA&ixlib=rb-4.1.0&q=80&w=1080");
    // Reset collection value to demo figures
    setDemoCollectionValue();
    // Clear per-album market cache
    clearAllMarketData();
    // Clear Discogs sync localStorage (keep token so it's easy to re-sync)
    try {
      localStorage.removeItem("hg-discogs-username");
      localStorage.removeItem("hg-last-synced");
    } catch { /* ignore */ }
  }, []);

  const wipeAllData = useCallback(() => {
    // Clear all React state to zero
    setAlbums([]);
    setWants([]);
    setSessions([]);
    setFriends([]);
    setFolders([]);
    setSelectedAlbumId(null);
    setSearchQuery("");
    setActiveFolder("All");
    setSortOption("artist-az");
    setPurgeFilter("unrated");
    setWantFilter("all");
    setWantSearchQuery("");
    setDiscogsToken("");
    setDiscogsUsername("");
    setLastSynced("");
    setSyncStats(null);
    setSyncProgress("");
    setLastPlayed({});
    setNeverPlayedFilter(false);
    setRediscoverMode(false);
    setShowAlbumDetail(false);
    setShowFilterDrawer(false);
    setUserAvatar("");
    setSessionPickerAlbumId(null);
    setFirstSessionJustCreated(false);
    // Clear collection value entirely (will show "unavailable" state)
    clearCollectionValue();
    // Clear per-album market cache
    clearAllMarketData();
    // Wipe all app localStorage keys
    try {
      localStorage.removeItem("hg-discogs-token");
      localStorage.removeItem("hg-discogs-username");
      localStorage.removeItem("hg-last-synced");
      localStorage.removeItem("hg-dark-mode");
    } catch { /* ignore */ }
  }, []);

  const requestConnectDiscogs = useCallback(() => {
    setConnectDiscogsRequested(true);
  }, []);

  const clearConnectDiscogsRequest = useCallback(() => {
    setConnectDiscogsRequested(false);
  }, []);

  const openSessionPicker = useCallback((albumId: string) => {
    // Auto-create "Saved for Later" session if no sessions exist
    setSessions((prev) => {
      if (prev.length === 0) {
        const now = new Date().toISOString();
        const newSession: Session = {
          id: "s" + Date.now(),
          name: "Saved for Later",
          albumIds: [albumId],
          createdAt: now.split("T")[0],
          lastModified: now,
        };
        setFirstSessionJustCreated(true);
        return [newSession];
      }
      return prev;
    });
    setSessionPickerAlbumId(albumId);
  }, []);

  const closeSessionPicker = useCallback(() => {
    setSessionPickerAlbumId(null);
    setFirstSessionJustCreated(false);
  }, []);

  const isInSession = useCallback((albumId: string, sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    return session ? session.albumIds.includes(albumId) : false;
  }, [sessions]);

  const toggleAlbumInSession = useCallback((albumId: string, sessionId: string) => {
    setSessions((prev) => {
      const sessionIndex = prev.findIndex((s) => s.id === sessionId);
      if (sessionIndex === -1) return prev;

      const session = prev[sessionIndex];
      const now = new Date().toISOString();
      const albumIndex = session.albumIds.indexOf(albumId);
      if (albumIndex === -1) {
        // Add the album to the session
        return [
          ...prev.slice(0, sessionIndex),
          { ...session, albumIds: [...session.albumIds, albumId], lastModified: now },
          ...prev.slice(sessionIndex + 1),
        ];
      } else {
        // Remove the album from the session — don't update lastModified so list order stays stable
        return [
          ...prev.slice(0, sessionIndex),
          { ...session, albumIds: session.albumIds.filter((id) => id !== albumId) },
          ...prev.slice(sessionIndex + 1),
        ];
      }
    });
  }, []);

  const createSessionDirect = useCallback((name: string, initialAlbumIds?: string[]) => {
    const now = new Date().toISOString();
    const newSession: Session = {
      id: "s" + Date.now(),
      name,
      albumIds: initialAlbumIds || [],
      createdAt: now.split("T")[0],
      lastModified: now,
    };
    setSessions((prev) => [newSession, ...prev]);
    return newSession.id;
  }, []);

  const isAlbumInAnySession = useCallback((albumId: string) => {
    return sessions.some((s) => s.albumIds.includes(albumId));
  }, [sessions]);

  // Derived: most recently active session (by lastModified)
  const mostRecentSessionId = useMemo(() => {
    if (sessions.length === 0) return null;
    return [...sessions].sort((a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    )[0].id;
  }, [sessions]);

  const devSyncUser = useCallback(async (username: string, token: string) => {
    // ── Wipe all existing data before loading new user ──
    setAlbums([]);
    setWants([]);
    setSessions([]);
    setFriends([]);
    setFolders([]);
    setSelectedAlbumId(null);
    setSearchQuery("");
    setActiveFolder("All");
    setSortOption("artist-az");
    setPurgeFilter("unrated");
    setWantFilter("all");
    setWantSearchQuery("");
    setLastSynced("");
    setSyncStats(null);
    setSyncProgress("");
    setLastPlayed({});
    setNeverPlayedFilter(false);
    setRediscoverMode(false);
    setShowAlbumDetail(false);
    setShowFilterDrawer(false);
    setUserAvatar("");
    setSessionPickerAlbumId(null);
    setFirstSessionJustCreated(false);
    // Don't set discogsToken yet — setting it would flip showSplash to false
    // and unmount the splash screen mid-sync. We set it at the very end.
    setDiscogsToken("");
    setDiscogsUsername("");
    clearCollectionValue();
    clearAllMarketData();
    try {
      localStorage.removeItem("hg-discogs-token");
      localStorage.removeItem("hg-discogs-username");
      localStorage.removeItem("hg-last-synced");
    } catch { /* ignore */ }

    // ── Now sync the new user ──
    setIsSyncing(true);
    setSyncProgress("Authenticating...");
    try {
      // 1. Get username from token
      const fetchedUsername = await fetchIdentity(token);
      setDiscogsUsername(fetchedUsername);

      // 1b. Fetch user profile (avatar)
      try {
        const profile = await fetchUserProfile(fetchedUsername, token);
        setUserAvatar(profile.avatar);
      } catch (e) {
        console.warn("[Discogs] Profile fetch failed:", e);
      }

      // 2. Fetch collection
      setSyncProgress("Fetching collection...");
      const { albums: newAlbums, folders: newFolders } = await fetchCollection(
        fetchedUsername,
        token,
        (loaded, total) => setSyncProgress(`Fetching collection... ${loaded}/${total}`)
      );

      // Fresh load — no purge tag preservation
      setAlbums(newAlbums.map((a) => ({ ...a, purgeTag: null })));
      setFolders(newFolders);

      // 3. Fetch want list
      setSyncProgress("Fetching want list...");
      const newWants = await fetchWantlist(
        fetchedUsername,
        token,
        (loaded, total) => setSyncProgress(`Fetching wants... ${loaded}/${total}`)
      );

      // Fresh load — no priority preservation
      setWants(newWants.map((w) => ({ ...w, priority: false })));

      // 4. Update sync metadata
      const now = new Date();
      const formatted = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        + " \u00b7 " + now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      setLastSynced(formatted);
      setSyncStats({
        albums: newAlbums.length,
        folders: newFolders.filter((f) => f !== "All").length,
        wants: newWants.length,
      });
      setSyncProgress("");

      // 5. Fetch collection value from Discogs API
      setSyncProgress("Fetching collection value...");
      try {
        await fetchCollectionValue(fetchedUsername, token);
      } catch (e) {
        console.warn("[Discogs] Collection value fetch failed:", e);
      }

      // Save token + username to localStorage
      try {
        localStorage.setItem("hg-discogs-token", token);
        localStorage.setItem("hg-discogs-username", fetchedUsername);
        localStorage.setItem("hg-last-synced", formatted);
      } catch (_e) { /* ignore */ }

      // Set token last — this flips showSplash to false in App.tsx
      setDiscogsToken(token);

      setSyncProgress("");
    } catch (err: any) {
      setSyncProgress("");
      throw err;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const value = useMemo<AppState>(
    () => ({
      screen,
      setScreen,
      viewMode,
      setViewMode,
      albums,
      wants,
      sessions,
      friends,
      addFriend,
      removeFriend,
      selectedAlbumId,
      setSelectedAlbumId,
      selectedAlbum,
      searchQuery,
      setSearchQuery,
      activeFolder,
      setActiveFolder,
      sortOption,
      setSortOption,
      filteredAlbums,
      setPurgeTag,
      toggleWantPriority,
      addToWantList,
      isInWants,
      isInCollection,
      deleteSession,
      renameSession,
      reorderSessionAlbums,
      showFilterDrawer,
      setShowFilterDrawer,
      showAlbumDetail,
      setShowAlbumDetail,
      purgeFilter,
      setPurgeFilter,
      wantFilter,
      setWantFilter,
      wantSearchQuery,
      setWantSearchQuery,
      isDarkMode,
      toggleDarkMode,
      // Last Played tracking
      lastPlayed,
      markPlayed: (albumId: string) => {
        setLastPlayed((prev) => ({
          ...prev,
          [albumId]: new Date().toISOString(),
        }));
      },
      neverPlayedFilter,
      setNeverPlayedFilter,
      rediscoverMode,
      setRediscoverMode,
      rediscoverAlbums: computedRediscoverAlbums,
      // Display preferences
      hidePurgeIndicators,
      setHidePurgeIndicators,
      hideGalleryMeta,
      setHideGalleryMeta,
      headerHidden,
      setHeaderHidden,
      // Discogs sync
      folders,
      discogsToken,
      setDiscogsToken,
      discogsUsername,
      setDiscogsUsername,
      isSyncing,
      syncProgress,
      lastSynced,
      syncFromDiscogs,
      syncStats,
      // User profile
      userAvatar,
      // Developer / QA resets
      resetToDemo,
      wipeAllData,
      devSyncUser,
      // Connect Discogs flow trigger (from within the main app)
      connectDiscogsRequested,
      requestConnectDiscogs,
      clearConnectDiscogsRequest,
      // Session Picker
      sessionPickerAlbumId,
      openSessionPicker,
      closeSessionPicker,
      isInSession,
      toggleAlbumInSession,
      createSessionDirect,
      isAlbumInAnySession,
      mostRecentSessionId,
      firstSessionJustCreated,
    }),
    [
      screen, setScreen, viewMode, albums, wants, sessions, friends,
      addFriend, removeFriend,
      selectedAlbumId, selectedAlbum,
      searchQuery, activeFolder, sortOption, filteredAlbums,
      setPurgeTag, toggleWantPriority, addToWantList,
      isInWants, isInCollection,
      deleteSession, renameSession, reorderSessionAlbums,
      showFilterDrawer, showAlbumDetail,
      purgeFilter, wantFilter, wantSearchQuery,
      isDarkMode, toggleDarkMode,
      // Last Played tracking
      lastPlayed,
      neverPlayedFilter,
      rediscoverMode,
      computedRediscoverAlbums,
      // Display preferences
      hidePurgeIndicators,
      hideGalleryMeta,
      headerHidden,
      setHeaderHidden,
      // Discogs sync
      folders,
      discogsToken,
      setDiscogsToken,
      discogsUsername,
      setDiscogsUsername,
      isSyncing,
      syncProgress,
      lastSynced,
      syncFromDiscogs,
      syncStats,
      // User profile
      userAvatar,
      // Developer / QA resets
      resetToDemo,
      wipeAllData,
      devSyncUser,
      // Connect Discogs flow trigger (from within the main app)
      connectDiscogsRequested,
      requestConnectDiscogs,
      clearConnectDiscogsRequest,
      // Session Picker
      sessionPickerAlbumId,
      openSessionPicker,
      closeSessionPicker,
      isInSession,
      toggleAlbumInSession,
      createSessionDirect,
      isAlbumInAnySession,
      mostRecentSessionId,
      firstSessionJustCreated,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}