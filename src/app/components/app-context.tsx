import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import {
  fetchIdentity,
  fetchCollection,
  fetchWantlist,
  fetchUserProfile,
  fetchCollectionValue,
  fetchMarketStats,
  fetchPriceSuggestions,
  normalizeCondition,
  type DiscogsAuth,
  type Album,
  type WantItem,
  type Session,
  type PurgeTag,
  type Friend,
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
  removeFromWantList: (releaseId: string | number) => void;
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
  colorMode: "light" | "dark" | "system";
  setColorMode: (mode: "light" | "dark" | "system") => void;
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
  // Shake gesture
  shakeToRandom: boolean;
  setShakeToRandom: (v: boolean) => void;
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
  wipeAllData: () => void;
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
  // Market data manual refresh
  refreshMarketData: (options?: { forceRefresh?: boolean }) => Promise<void>;
  marketRefreshProgress: { current: number; total: number } | null;
  isRefreshingMarket: boolean;
  marketInsights: {
    mostForSale: { releaseId: number; title: string; artist: string; cover: string; numForSale: number };
    hardestToFind: { releaseId: number; title: string; artist: string; cover: string; numForSale: number };
    mostValuable: { releaseId: number; title: string; artist: string; cover: string; price: number };
    leastValuable: { releaseId: number; title: string; artist: string; cover: string; price: number };
    averageValue: number;
    folderValues: { folder: string; totalValue: number }[];
    albumsAnalyzed: number;
    updatedAt: number;
  } | null | undefined;
  // OAuth / session management
  loginWithOAuth: (user: { username: string; avatarUrl: string; accessToken: string; tokenSecret: string }) => Promise<void>;
  signOut: () => void;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  discogsAuth: DiscogsAuth | null;
}

const AppContext = getOrCreateContext();

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  // ── Screen & view state ──
  const [screen, setScreenRaw] = useState<Screen>("feed");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState("All");
  const [sortOption, setSortOption] = useState<SortOption>("artist-az");
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [showAlbumDetail, setShowAlbumDetail] = useState(false);
  const [purgeFilter, setPurgeFilter] = useState<PurgeTag | "unrated" | "all">("unrated");
  const [wantFilter, setWantFilter] = useState<"all" | "priority">("all");
  const [wantSearchQuery, setWantSearchQuery] = useState("");
  const [headerHidden, setHeaderHidden] = useState(false);

  // ── Auth state ──
  // Personal access token (dev QA flow) — in-memory only (no sessionStorage)
  const [discogsToken, setDiscogsTokenRaw] = useState("");
  const setDiscogsToken = useCallback((t: string) => {
    setDiscogsTokenRaw(t);
  }, []);

  // Discogs username — in-memory only; Convex is the source of truth
  const [discogsUsername, setDiscogsUsernameRaw] = useState("");
  const setDiscogsUsername = useCallback((u: string) => {
    setDiscogsUsernameRaw(u);
  }, []);

  // OAuth credentials (populated from Convex user record or OAuth callback)
  const [oauthCredentials, setOauthCredentials] = useState<{ accessToken: string; tokenSecret: string } | null>(null);

  // Derived auth for Discogs API calls
  const discogsAuth: DiscogsAuth | null = oauthCredentials || (discogsToken || null);
  const isAuthenticated = !!discogsUsername && !!discogsAuth;


  // ── Theme state ──
  const [colorMode, setColorModeRaw] = useState<"light" | "dark" | "system">("dark");
  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return true; }
  });

  // ── Data state ──
  const [albums, setAlbums] = useState<Album[]>([]);
  const [wants, setWants] = useState<WantItem[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [lastPlayed, setLastPlayed] = useState<Record<string, string>>({});
  const [neverPlayedFilter, setNeverPlayedFilter] = useState(false);
  const [rediscoverMode, setRediscoverMode] = useState(false);
  const [hidePurgeIndicators, setHidePurgeIndicatorsRaw] = useState(false);
  const [hideGalleryMeta, setHideGalleryMetaRaw] = useState(false);
  const [shakeToRandom, setShakeToRandomRaw] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshingMarket, setIsRefreshingMarket] = useState(false);
  const [marketRefreshProgress, setMarketRefreshProgress] = useState<{ current: number; total: number } | null>(null);
  const [syncProgress, setSyncProgress] = useState("");
  const [syncFailed, setSyncFailed] = useState(false);
  const [lastSynced, setLastSynced] = useState("");
  const [syncStats, setSyncStats] = useState<{ albums: number; folders: number; wants: number } | null>(null);
  const [userAvatar, setUserAvatar] = useState("");
  const [connectDiscogsRequested, setConnectDiscogsRequested] = useState(false);
  const [sessionPickerAlbumId, setSessionPickerAlbumId] = useState<string | null>(null);
  const [firstSessionJustCreated, setFirstSessionJustCreated] = useState(false);

  // ── Convex queries ──

  // Always-on query: used on cold load to restore a session after force close,
  // before discogsUsername is populated in memory.
  const convexLatestUser = useQuery(api.users.getLatestUser);

  const convexUser = useQuery(
    api.users.getByUsername,
    discogsUsername ? { discogs_username: discogsUsername } : "skip"
  );
  const convexPurgeTags = useQuery(
    api.purge_tags.getByUsername,
    discogsUsername ? { discogs_username: discogsUsername } : "skip"
  );
  const convexSessions = useQuery(
    api.sessions.getByUsername,
    discogsUsername ? { discogs_username: discogsUsername } : "skip"
  );
  const convexLastPlayed = useQuery(
    api.last_played.getByUsername,
    discogsUsername ? { discogs_username: discogsUsername } : "skip"
  );
  const convexWantPriorities = useQuery(
    api.want_priorities.getByUsername,
    discogsUsername ? { discogs_username: discogsUsername } : "skip"
  );
  const convexFollowing = useQuery(
    api.following.getByUsername,
    discogsUsername ? { discogs_username: discogsUsername } : "skip"
  );
  const convexPreferences = useQuery(
    api.preferences.getByUsername,
    discogsUsername ? { discogs_username: discogsUsername } : "skip"
  );
  const convexCollection = useQuery(
    api.collection.getByUsername,
    discogsUsername ? { discogsUsername } : "skip"
  );
  const convexMarketInsights = useQuery(
    api.market_insights.getByUsername,
    discogsUsername ? { discogsUsername } : "skip"
  );

  // isAuthLoading: true when a returning user's session is being restored
  // (Convex query in flight or initial sync running) but data hasn't arrived yet.
  // Prevents flashing the empty Feed before collection loads.
  //
  // isRestoringSession: true on cold load while we're checking Convex for an
  // existing user — before discogsUsername is known.
  const isRestoringSession = !discogsUsername && convexLatestUser === undefined;
  const isConvexUserGone = !discogsToken && convexUser === null;
  const isAuthLoading = (!!discogsUsername || isRestoringSession) && albums.length === 0 && !isConvexUserGone && !syncFailed;

  // ── Convex mutations ──
  const upsertPurgeTagMut = useMutation(api.purge_tags.upsert);
  const createSessionMut = useMutation(api.sessions.create);
  const updateSessionMut = useMutation(api.sessions.update);
  const removeSessionMut = useMutation(api.sessions.remove);
  const upsertLastPlayedMut = useMutation(api.last_played.upsert);
  const upsertWantPriorityMut = useMutation(api.want_priorities.upsert);
  const addFollowingMut = useMutation(api.following.add);
  const removeFollowingMut = useMutation(api.following.remove);
  const upsertPreferencesMut = useMutation(api.preferences.upsert);
  const updateLastSyncedMut = useMutation(api.users.updateLastSynced);
  const clearSessionMut = useMutation(api.users.clearSession);
  const replaceCollectionMut = useMutation(api.collection.replaceAll);
  const upsertMarketInsightsMut = useMutation(api.market_insights.upsert);

  // ── Refs for latest Convex data (used in sync functions) ──
  const purgeTagsRef = useRef(convexPurgeTags);
  purgeTagsRef.current = convexPurgeTags;
  const wantPrioritiesRef = useRef(convexWantPriorities);
  wantPrioritiesRef.current = convexWantPriorities;
  const lastPlayedRef = useRef(convexLastPlayed);
  lastPlayedRef.current = convexLastPlayed;

  // Track one-time hydration from Convex → local state
  const hydratedRef = useRef({
    purgeTags: false,
    sessions: false,
    lastPlayed: false,
    wantPriorities: false,
    preferences: false,
    following: false,
  });

  // Track whether initial auto-sync has run
  const initialSyncDoneRef = useRef(false);

  // Prevents session restore from re-hydrating after an explicit sign-out
  const hasSignedOutRef = useRef(false);

  // ── System color scheme listener ──
  useEffect(() => {
    try {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
      mql.addEventListener("change", handleChange);
      return () => mql.removeEventListener("change", handleChange);
    } catch { /* ignore */ }
  }, []);

  // ── Effects: Convex → local state hydration (one-time per session) ──

  // Session restore on force close: when discogsUsername is empty on mount and
  // Convex has an existing user record, hydrate the username so the rest of the
  // auth flow (credential load → auto-sync) proceeds as normal.
  useEffect(() => {
    if (hasSignedOutRef.current) return;
    if (!discogsUsername && convexLatestUser) {
      setDiscogsUsernameRaw(convexLatestUser.discogs_username);
    }
  }, [convexLatestUser, discogsUsername]);

  // Load OAuth credentials from Convex user record
  useEffect(() => {
    if (convexUser) {
      setOauthCredentials({
        accessToken: convexUser.access_token,
        tokenSecret: convexUser.token_secret,
      });
      if (convexUser.discogs_avatar_url) {
        setUserAvatar(convexUser.discogs_avatar_url);
      }
      if (convexUser.last_synced_at) {
        const d = new Date(convexUser.last_synced_at);
        const formatted = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          + " \u00b7 " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        setLastSynced(formatted);
      }
    } else if (convexUser === null && discogsUsername && !discogsToken) {
      // User record was deleted (signed out on another tab) or never existed for this OAuth user
      // Only clear if there's no personal token fallback
      setOauthCredentials(null);
    }
  }, [convexUser, discogsUsername, discogsToken]);

  // Auto-sync on initial load for returning users (OAuth or personal token).
  // If the collection was synced within the last 24 hours, load from
  // the Convex cache instead of hitting Discogs.
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  useEffect(() => {
    if (initialSyncDoneRef.current) return;
    if (!discogsUsername) return;

    // For OAuth users: wait for Convex user record to load
    if (!discogsToken && convexUser === undefined) return; // still loading
    if (!discogsToken && convexUser === null) return; // no user record

    // We have auth — decide whether to use cache or full sync
    const auth: DiscogsAuth = convexUser
      ? { accessToken: convexUser.access_token, tokenSecret: convexUser.token_secret }
      : discogsToken;

    if (!auth) return;

    const lastSync = convexUser?.last_synced_at ?? null;
    const isFresh = lastSync != null && Date.now() - lastSync < TWENTY_FOUR_HOURS;

    if (isFresh) {
      // Cache is fresh — wait for convexCollection to arrive, then hydrate
      if (convexCollection === undefined) return; // still loading

      initialSyncDoneRef.current = true;

      if (convexCollection.length > 0) {
        // Hydrate albums from Convex cache
        const cachedAlbums: Album[] = convexCollection.map((row) => ({
          id: String(row.releaseId),
          release_id: row.releaseId,
          instance_id: row.instanceId,
          title: row.title,
          artist: row.artist,
          year: row.year,
          cover: row.cover,
          folder: row.folder,
          label: row.label,
          catalogNumber: row.catalogNumber,
          format: row.format,
          mediaCondition: row.mediaCondition,
          sleeveCondition: row.sleeveCondition,
          pricePaid: row.pricePaid,
          notes: row.notes,
          customFields: row.customFields,
          dateAdded: row.dateAdded,
          discogsUrl: `https://www.discogs.com/release/${row.releaseId}`,
          purgeTag: null,
        }));

        // Derive folder list from cached albums
        const folderSet = new Set(cachedAlbums.map((a) => a.folder));
        const cachedFolders = ["All", ...Array.from(folderSet).filter((f) => f !== "All").sort()];

        // Merge purge tags
        const tags = purgeTagsRef.current;
        if (tags !== undefined) {
          const tagMap = new Map(tags.map((t) => [t.release_id, t.tag as PurgeTag]));
          setAlbums(cachedAlbums.map((a) => ({
            ...a,
            purgeTag: tagMap.get(a.release_id) || null,
          })));
          hydratedRef.current.purgeTags = true;
        } else {
          setAlbums(cachedAlbums);
        }
        setFolders(cachedFolders);

        // Still need wantlist from Discogs (not cached)
        fetchWantlist(discogsUsername, auth).then((newWants) => {
          const prios = wantPrioritiesRef.current;
          if (prios !== undefined) {
            const prioMap = new Map(prios.map((p) => [p.release_id, p.is_priority]));
            setWants(newWants.map((w) => ({
              ...w,
              priority: prioMap.get(w.release_id) || false,
            })));
            hydratedRef.current.wantPriorities = true;
          } else {
            setWants(newWants);
          }

          // Merge last played
          const lpData = lastPlayedRef.current;
          if (lpData !== undefined && lpData.length > 0) {
            const map: Record<string, string> = {};
            for (const lp of lpData) {
              map[String(lp.release_id)] = new Date(lp.played_at).toISOString();
            }
            setLastPlayed(map);
            hydratedRef.current.lastPlayed = true;
          }

          setSyncStats({
            albums: cachedAlbums.length,
            folders: cachedFolders.filter((f) => f !== "All").length,
            wants: newWants.length,
          });
        }).catch((err) => {
          console.warn("[Cache load] Wantlist fetch failed:", err);
          // Albums are still loaded from cache — app is usable
          setSyncStats({
            albums: cachedAlbums.length,
            folders: cachedFolders.filter((f) => f !== "All").length,
            wants: 0,
          });
        });

        // Fetch collection value in background
        fetchCollectionValue(discogsUsername, auth).catch((e) => {
          console.warn("[Cache load] Collection value fetch failed:", e);
        });

        // Fetch avatar in background
        fetchUserProfile(discogsUsername, auth).then((p) => setUserAvatar(p.avatar)).catch(() => {});
      } else {
        // Cache is empty despite being "fresh" — fall back to full sync
        initialSyncDoneRef.current = true;
        performSync(discogsUsername, auth).catch((err) => {
          console.error("[Auto-sync] Failed:", err);
          setSyncFailed(true);
          toast.error("Sync failed. Try again in Settings.");
        });
      }
    } else {
      // Cache is stale or missing — full sync from Discogs
      initialSyncDoneRef.current = true;
      performSync(discogsUsername, auth).catch((err) => {
        console.error("[Auto-sync] Failed:", err);
        setSyncFailed(true);
        toast.error("Sync failed. Try again in Settings.");
      });
    }
  }, [discogsUsername, discogsToken, convexUser, convexCollection]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hydrate purge tags from Convex into albums (one-time, after albums are populated)
  useEffect(() => {
    if (!hydratedRef.current.purgeTags && convexPurgeTags !== undefined && albums.length > 0) {
      hydratedRef.current.purgeTags = true;
      const tagMap = new Map(convexPurgeTags.map(t => [t.release_id, t.tag as PurgeTag]));
      setAlbums(prev => prev.map(a => ({
        ...a,
        purgeTag: tagMap.get(a.release_id) || null,
      })));
    }
  }, [convexPurgeTags, albums.length]);

  // Hydrate sessions from Convex (one-time)
  useEffect(() => {
    if (!hydratedRef.current.sessions && convexSessions !== undefined) {
      hydratedRef.current.sessions = true;
      if (convexSessions.length > 0) {
        setSessions(convexSessions.map(s => ({
          id: s.session_id,
          name: s.name,
          albumIds: s.album_ids.map(String),
          createdAt: new Date(s.created_at).toISOString().split("T")[0],
          lastModified: new Date(s.last_modified).toISOString(),
        })));
      }
    }
  }, [convexSessions]);

  // Hydrate last played from Convex (one-time)
  useEffect(() => {
    if (!hydratedRef.current.lastPlayed && convexLastPlayed !== undefined) {
      hydratedRef.current.lastPlayed = true;
      if (convexLastPlayed.length > 0) {
        const map: Record<string, string> = {};
        for (const lp of convexLastPlayed) {
          map[String(lp.release_id)] = new Date(lp.played_at).toISOString();
        }
        setLastPlayed(map);
      }
    }
  }, [convexLastPlayed]);

  // Hydrate want priorities from Convex into wants (one-time, after wants are populated)
  useEffect(() => {
    if (!hydratedRef.current.wantPriorities && convexWantPriorities !== undefined && wants.length > 0) {
      hydratedRef.current.wantPriorities = true;
      const prioMap = new Map(convexWantPriorities.map(p => [p.release_id, p.is_priority]));
      setWants(prev => prev.map(w => ({
        ...w,
        priority: prioMap.get(w.release_id) || false,
      })));
    }
  }, [convexWantPriorities, wants.length]);

  // Hydrate preferences from Convex (one-time)
  useEffect(() => {
    if (!hydratedRef.current.preferences && convexPreferences) {
      hydratedRef.current.preferences = true;
      if (convexPreferences.theme) setColorModeRaw(convexPreferences.theme);
      setHidePurgeIndicatorsRaw(convexPreferences.hide_purge_indicators);
      setHideGalleryMetaRaw(convexPreferences.hide_gallery_meta);
      setShakeToRandomRaw(convexPreferences.shake_to_random ?? false);
    }
  }, [convexPreferences]);

  // Hydrate following from Convex (one-time, after auth is available)
  useEffect(() => {
    if (hydratedRef.current.following) return;
    if (convexFollowing === undefined) return; // still loading
    if (!discogsAuth) return; // wait for credentials
    if (convexFollowing.length === 0) {
      hydratedRef.current.following = true;
      return;
    }
    hydratedRef.current.following = true;
    const authSnapshot = discogsAuth;
    for (const record of convexFollowing) {
      const username = record.following_username;
      (async () => {
        try {
          const profile = await fetchUserProfile(username, authSnapshot);
          let friendAlbums: Album[] = [];
          let friendFolders: string[] = ["All"];
          let friendWants: WantItem[] = [];
          let isPrivate = false;
          try {
            const result = await fetchCollection(username, authSnapshot);
            friendAlbums = result.albums;
            friendFolders = result.folders;
          } catch (e: any) {
            if (e?.message?.includes("403")) isPrivate = true;
          }
          try {
            friendWants = await fetchWantlist(username, authSnapshot);
          } catch { /* wantlist may be unavailable — skip */ }
          const friend: Friend = {
            id: `f-${username}`,
            username: profile.username,
            avatar: profile.avatar,
            isPrivate,
            folders: friendFolders,
            lastSynced: new Date().toISOString().split("T")[0],
            collection: friendAlbums,
            wants: friendWants,
          };
          setFriends(prev => {
            if (prev.some(f => f.username.toLowerCase() === friend.username.toLowerCase())) return prev;
            return [...prev, friend];
          });
        } catch (e) {
          console.warn(`[Friends] Could not restore @${username}:`, e);
        }
      })();
    }
  }, [convexFollowing, discogsAuth]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Screen navigation ──

  const setScreen = useCallback((s: Screen) => {
    setScreenRaw(s);
    setShowAlbumDetail(false);
    setShowFilterDrawer(false);
    setSelectedAlbumId(null);
    setSessionPickerAlbumId(null);
    setHeaderHidden(false);
  }, []);

  // ── Theme toggle ──

  // Derived isDarkMode from colorMode + system preference
  const isDarkMode = colorMode === "dark" || (colorMode === "system" && systemIsDark);

  const setColorMode = useCallback((mode: "light" | "dark" | "system") => {
    setColorModeRaw(mode);
    if (discogsUsername) {
      upsertPreferencesMut({ discogs_username: discogsUsername, theme: mode });
    }
  }, [discogsUsername, upsertPreferencesMut]);

  const toggleDarkMode = useCallback(() => {
    const next: "light" | "dark" = isDarkMode ? "light" : "dark";
    setColorModeRaw(next);
    if (discogsUsername) {
      upsertPreferencesMut({ discogs_username: discogsUsername, theme: next });
    }
  }, [isDarkMode, discogsUsername, upsertPreferencesMut]);

  // ── Display preferences with Convex persistence ──

  const setHidePurgeIndicators = useCallback((v: boolean) => {
    setHidePurgeIndicatorsRaw(v);
    if (discogsUsername) {
      upsertPreferencesMut({
        discogs_username: discogsUsername,
        hide_purge_indicators: v,
      });
    }
  }, [discogsUsername, upsertPreferencesMut]);

  const setHideGalleryMeta = useCallback((v: boolean) => {
    setHideGalleryMetaRaw(v);
    if (discogsUsername) {
      upsertPreferencesMut({
        discogs_username: discogsUsername,
        hide_gallery_meta: v,
      });
    }
  }, [discogsUsername, upsertPreferencesMut]);

  const setShakeToRandom = useCallback((v: boolean) => {
    setShakeToRandomRaw(v);
    if (discogsUsername) {
      upsertPreferencesMut({
        discogs_username: discogsUsername,
        shake_to_random: v,
      });
    }
  }, [discogsUsername, upsertPreferencesMut]);

  // ── Derived state ──

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
          return aDate - bDate;
        });
        break;
    }

    return result;
  }, [albums, activeFolder, searchQuery, sortOption, neverPlayedFilter, lastPlayed]);

  const computedRediscoverAlbums = useMemo(() => {
    const now = Date.now();
    const sixMonths = 180 * 86400000;
    const threeMonths = 90 * 86400000;

    return albums.filter((a) => {
      const lp = lastPlayed[a.id];
      if (!lp) return true;
      const lpTime = new Date(lp).getTime();
      if (now - lpTime > sixMonths) return true;
      const addedTime = new Date(a.dateAdded).getTime();
      if (!lp && now - addedTime > threeMonths) return true;
      return false;
    }).sort((a, b) => {
      const aLp = lastPlayed[a.id];
      const bLp = lastPlayed[b.id];
      if (!aLp && bLp) return -1;
      if (aLp && !bLp) return 1;
      if (!aLp && !bLp) {
        return new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime();
      }
      return new Date(aLp!).getTime() - new Date(bLp!).getTime();
    });
  }, [albums, lastPlayed]);

  // ── Data mutations (local state + Convex fire-and-forget) ──

  const setPurgeTag = useCallback((albumId: string, tag: PurgeTag) => {
    setAlbums((prev) =>
      prev.map((a) => (a.id === albumId ? { ...a, purgeTag: tag } : a))
    );
    if (discogsUsername && tag) {
      upsertPurgeTagMut({
        discogs_username: discogsUsername,
        release_id: Number(albumId),
        tag,
      });
    }
  }, [discogsUsername, upsertPurgeTagMut]);

  const toggleWantPriority = useCallback((wantId: string) => {
    setWants((prev) => {
      const want = prev.find((w) => w.id === wantId);
      if (want && discogsUsername) {
        upsertWantPriorityMut({
          discogs_username: discogsUsername,
          release_id: want.release_id,
          is_priority: !want.priority,
        });
      }
      return prev.map((w) => (w.id === wantId ? { ...w, priority: !w.priority } : w));
    });
  }, [discogsUsername, upsertWantPriorityMut]);

  const addToWantList = useCallback((item: WantItem) => {
    setWants((prev) => {
      const rid = Number(item.release_id);
      if (prev.some((w) => Number(w.release_id) === rid)) return prev;
      return [...prev, item];
    });
  }, []);

  const removeFromWantList = useCallback((releaseId: string | number) => {
    const rid = Number(releaseId);
    setWants((prev) => prev.filter((w) => Number(w.release_id) !== rid));
  }, []);

  const isInWants = useCallback((releaseId: string | number) => {
    const rid = Number(releaseId);
    return wants.some((w) => Number(w.release_id) === rid);
  }, [wants]);

  const isInCollection = useCallback((releaseId: string | number) => {
    const rid = Number(releaseId);
    return albums.some((a) => Number(a.release_id) === rid);
  }, [albums]);

  const markPlayed = useCallback((albumId: string) => {
    const now = new Date();
    setLastPlayed((prev) => ({
      ...prev,
      [albumId]: now.toISOString(),
    }));
    if (discogsUsername) {
      upsertLastPlayedMut({
        discogs_username: discogsUsername,
        release_id: Number(albumId),
        played_at: now.getTime(),
      });
    }
  }, [discogsUsername, upsertLastPlayedMut]);

  // ── Session operations ──

  const deleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (discogsUsername) {
      removeSessionMut({ discogs_username: discogsUsername, session_id: sessionId });
    }
  }, [discogsUsername, removeSessionMut]);

  const renameSession = useCallback((sessionId: string, name: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, name } : s))
    );
    if (discogsUsername) {
      updateSessionMut({ discogs_username: discogsUsername, session_id: sessionId, name }).catch(console.error);
    }
  }, [discogsUsername, updateSessionMut]);

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
    if (discogsUsername) {
      updateSessionMut({
        discogs_username: discogsUsername,
        session_id: sessionId,
        album_ids: albumIds.map(Number),
      }).catch(console.error);
    }
  }, [discogsUsername, updateSessionMut]);

  // ── Friends ──

  const addFriend = useCallback((friend: Friend) => {
    setFriends((prev) => [...prev, friend]);
    if (discogsUsername) {
      addFollowingMut({ discogs_username: discogsUsername, following_username: friend.username });
    }
  }, [discogsUsername, addFollowingMut]);

  const removeFriend = useCallback((friendId: string) => {
    setFriends((prev) => {
      const friend = prev.find(f => f.id === friendId);
      if (friend && discogsUsername) {
        removeFollowingMut({ discogs_username: discogsUsername, following_username: friend.username });
      }
      return prev.filter((f) => f.id !== friendId);
    });
  }, [discogsUsername, removeFollowingMut]);

  // ── Market data manual refresh ──

  /**
   * Fetches /marketplace/stats and /marketplace/price_suggestions for every
   * album. Uses adaptive delay (1s default, 10s backoff on 429). Computes
   * all Insights results in memory, then writes once to Convex.
   */
  const refreshMarketData = useCallback(async (options?: { forceRefresh?: boolean }): Promise<void> => {
    if (isSyncing) {
      toast.error("Sync in progress. Wait for sync to complete.");
      return;
    }
    const auth = discogsAuth;
    if (!auth || !discogsUsername) return;

    const albumList = albums;
    if (albumList.length === 0) return;

    // Skip entirely if data is <7 days old (unless force-refreshing)
    const SEVEN_DAYS = 7 * 24 * 3600000;
    if (!options?.forceRefresh && convexMarketInsights && Date.now() - convexMarketInsights.updatedAt < SEVEN_DAYS) {
      toast("Market data is up to date.");
      return;
    }

    setIsRefreshingMarket(true);
    setMarketRefreshProgress({ current: 0, total: albumList.length });

    interface AlbumResult {
      album: Album;
      numForSale: number;
      conditionPrice: number | null;
    }

    const results: AlbumResult[] = [];
    let delay = 1000; // adaptive delay — starts at 1s

    async function adaptiveSleep(): Promise<void> {
      await new Promise<void>((r) => setTimeout(r, delay));
    }

    async function fetchWithRetry<T>(
      fn: () => Promise<T>
    ): Promise<T> {
      try {
        const result = await fn();
        delay = 1000; // reset to 1s on success
        return result;
      } catch (e: any) {
        // Check for 429 (rate limit)
        if (e?.message?.includes("429")) {
          console.warn("[MarketRefresh] Rate limited — backing off 10s");
          delay = 10000;
          await new Promise<void>((r) => setTimeout(r, 10000));
          return await fn(); // retry once
        }
        throw e;
      }
    }

    try {
      for (let i = 0; i < albumList.length; i++) {
        const album = albumList[i];
        let numForSale = 0;
        let conditionPrice: number | null = null;

        // 1. Fetch marketplace stats
        try {
          const stats = await fetchWithRetry(() =>
            fetchMarketStats(album.release_id, auth)
          );
          numForSale = stats.numForSale;
        } catch (e) {
          console.warn(`[MarketRefresh] Stats failed for ${album.release_id}:`, e);
        }

        await adaptiveSleep();

        // 2. Fetch price suggestions
        try {
          const prices = await fetchWithRetry(() =>
            fetchPriceSuggestions(album.release_id, auth)
          );
          // Look up price at album's condition
          const normalized = normalizeCondition(album.mediaCondition);
          if (normalized) {
            const match = prices.find((p) => p.condition === normalized);
            if (match) conditionPrice = match.value;
          }
        } catch (e) {
          console.warn(`[MarketRefresh] Prices failed for ${album.release_id}:`, e);
        }

        results.push({ album, numForSale, conditionPrice });
        setMarketRefreshProgress({ current: i + 1, total: albumList.length });

        // Wait before next album (skip after last)
        if (i < albumList.length - 1) {
          await adaptiveSleep();
        }
      }

      if (results.length === 0) {
        toast.error("No market data available.");
        return;
      }

      // Compute mostForSale / hardestToFind
      let mostForSale = results[0];
      let hardestToFind: AlbumResult | null = null;

      for (const r of results) {
        if (r.numForSale > mostForSale.numForSale) mostForSale = r;
        if (r.numForSale > 0 && (hardestToFind === null || r.numForSale < hardestToFind.numForSale)) {
          hardestToFind = r;
        }
      }
      const finalHardestToFind = hardestToFind ?? mostForSale;

      // Compute mostValuable / leastValuable / averageValue
      const pricedResults = results.filter((r) => r.conditionPrice !== null && r.conditionPrice > 0);
      let mostValuable: AlbumResult | null = null;
      let leastValuable: AlbumResult | null = null;
      let totalValue = 0;

      for (const r of pricedResults) {
        totalValue += r.conditionPrice!;
        if (!mostValuable || r.conditionPrice! > mostValuable.conditionPrice!) mostValuable = r;
        if (!leastValuable || r.conditionPrice! < leastValuable.conditionPrice!) leastValuable = r;
      }

      const averageValue = pricedResults.length > 0 ? totalValue / pricedResults.length : 0;

      // Compute folderValues — sum condition prices grouped by folder
      const folderMap = new Map<string, number>();
      for (const r of pricedResults) {
        const current = folderMap.get(r.album.folder) || 0;
        folderMap.set(r.album.folder, current + r.conditionPrice!);
      }
      const folderValues = [...folderMap.entries()]
        .map(([folder, totalValue]) => ({ folder, totalValue }))
        .sort((a, b) => b.totalValue - a.totalValue);

      // Count albums where both fetches succeeded (have stats data)
      const albumsAnalyzed = results.length;

      // Use fallback values when no priced albums exist
      const fallbackAlbum = {
        releaseId: mostForSale.album.release_id,
        title: mostForSale.album.title,
        artist: mostForSale.album.artist,
        cover: mostForSale.album.cover,
        price: 0,
      };

      await upsertMarketInsightsMut({
        discogsUsername,
        mostForSale: {
          releaseId: mostForSale.album.release_id,
          title: mostForSale.album.title,
          artist: mostForSale.album.artist,
          cover: mostForSale.album.cover,
          numForSale: mostForSale.numForSale,
        },
        hardestToFind: {
          releaseId: finalHardestToFind.album.release_id,
          title: finalHardestToFind.album.title,
          artist: finalHardestToFind.album.artist,
          cover: finalHardestToFind.album.cover,
          numForSale: finalHardestToFind.numForSale,
        },
        mostValuable: mostValuable
          ? {
              releaseId: mostValuable.album.release_id,
              title: mostValuable.album.title,
              artist: mostValuable.album.artist,
              cover: mostValuable.album.cover,
              price: mostValuable.conditionPrice!,
            }
          : fallbackAlbum,
        leastValuable: leastValuable
          ? {
              releaseId: leastValuable.album.release_id,
              title: leastValuable.album.title,
              artist: leastValuable.album.artist,
              cover: leastValuable.album.cover,
              price: leastValuable.conditionPrice!,
            }
          : fallbackAlbum,
        averageValue,
        folderValues,
        albumsAnalyzed,
        updatedAt: Date.now(),
      });

      toast.success("Market data updated.");
    } catch (e) {
      console.error("[MarketRefresh] Failed:", e);
      toast.error("Market refresh failed.");
    } finally {
      setIsRefreshingMarket(false);
      setMarketRefreshProgress(null);
    }
  }, [isSyncing, discogsAuth, discogsUsername, albums, convexMarketInsights, upsertMarketInsightsMut]);

  // ── Sync from Discogs ──

  const performSync = useCallback(async (
    username: string,
    auth: DiscogsAuth
  ): Promise<{ albums: number; folders: number; wants: number }> => {
    setIsSyncing(true);
    setSyncProgress("Authenticating...");
    try {
      // Fetch user profile (avatar)
      try {
        const profile = await fetchUserProfile(username, auth);
        setUserAvatar(profile.avatar);
      } catch (e) {
        console.warn("[Discogs] Profile fetch failed:", e);
      }

      // Fetch collection and wantlist in parallel — no dependency between them
      setSyncProgress("Syncing...");
      const [{ albums: newAlbums, folders: newFolders }, newWants] = await Promise.all([
        fetchCollection(
          username,
          auth,
          (loaded, total) => setSyncProgress(`Fetching ${loaded} / ${total}`)
        ),
        fetchWantlist(username, auth),
      ]);

      // Merge purge tags from current Convex data
      const tags = purgeTagsRef.current;
      if (tags !== undefined) {
        const tagMap = new Map(tags.map(t => [t.release_id, t.tag as PurgeTag]));
        setAlbums(newAlbums.map(a => ({
          ...a,
          purgeTag: tagMap.get(a.release_id) || null,
        })));
        hydratedRef.current.purgeTags = true;
      } else {
        setAlbums(newAlbums);
      }
      setFolders(newFolders);

      // Merge want priorities from current Convex data
      const prios = wantPrioritiesRef.current;
      if (prios !== undefined) {
        const prioMap = new Map(prios.map(p => [p.release_id, p.is_priority]));
        setWants(newWants.map(w => ({
          ...w,
          priority: prioMap.get(w.release_id) || false,
        })));
        hydratedRef.current.wantPriorities = true;
      } else {
        setWants(newWants);
      }

      // Merge last played from current Convex data
      const lpData = lastPlayedRef.current;
      if (lpData !== undefined && lpData.length > 0) {
        const map: Record<string, string> = {};
        for (const lp of lpData) {
          map[String(lp.release_id)] = new Date(lp.played_at).toISOString();
        }
        setLastPlayed(map);
        hydratedRef.current.lastPlayed = true;
      }

      // Write collection to Convex cache
      setSyncProgress("Caching collection...");
      try {
        await replaceCollectionMut({
          discogsUsername: username,
          albums: newAlbums.map((a) => ({
            releaseId: a.release_id,
            instanceId: a.instance_id,
            artist: a.artist,
            title: a.title,
            year: a.year,
            cover: a.cover,
            folder: a.folder,
            label: a.label,
            catalogNumber: a.catalogNumber,
            format: a.format,
            mediaCondition: a.mediaCondition,
            sleeveCondition: a.sleeveCondition,
            pricePaid: a.pricePaid,
            notes: a.notes,
            customFields: a.customFields,
            dateAdded: a.dateAdded,
          })),
        });
      } catch (e) {
        console.warn("[Convex] Collection cache write failed:", e);
      }

      // Update sync metadata
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

      // Fetch collection value
      setSyncProgress("Fetching collection value...");
      try {
        await fetchCollectionValue(username, auth);
      } catch (e) {
        console.warn("[Discogs] Collection value fetch failed:", e);
      }

      // Update lastSynced in Convex
      if (discogsUsername) {
        updateLastSyncedMut({ discogs_username: username });
      }

      setSyncProgress("");

      return {
        albums: newAlbums.length,
        folders: newFolders.filter((f) => f !== "All").length,
        wants: newWants.length,
      };
    } catch (err: any) {
      setSyncProgress("");
      setSyncFailed(true);
      throw err;
    } finally {
      setIsSyncing(false);
    }
  }, [discogsUsername, updateLastSyncedMut, replaceCollectionMut]);

  const syncFromDiscogs = useCallback(async (): Promise<{ albums: number; folders: number; wants: number }> => {
    setSyncFailed(false);
    const auth = discogsAuth;
    if (!auth) throw new Error("No Discogs authentication available");

    // If we don't have a username yet, fetch identity first
    let username = discogsUsername;
    if (!username) {
      username = await fetchIdentity(auth);
      setDiscogsUsername(username);
    }

    return performSync(username, auth);
  }, [discogsAuth, discogsUsername, setDiscogsUsername, performSync]);

  // ── OAuth login ──

  const loginWithOAuth = useCallback(async (user: {
    username: string;
    avatarUrl: string;
    accessToken: string;
    tokenSecret: string;
  }) => {
    // Set OAuth credentials
    setOauthCredentials({ accessToken: user.accessToken, tokenSecret: user.tokenSecret });
    setDiscogsUsername(user.username);
    setUserAvatar(user.avatarUrl || "");
    setDiscogsToken(""); // Clear any personal token

    // Mark initial sync as done (we're about to trigger it explicitly)
    initialSyncDoneRef.current = true;

    // Trigger initial Discogs sync
    const auth: DiscogsAuth = { accessToken: user.accessToken, tokenSecret: user.tokenSecret };
    await performSync(user.username, auth);
  }, [setDiscogsUsername, setDiscogsToken, performSync]);

  // ── Sign out ──

  const signOut = useCallback(() => {
    // Clear auth session from Convex (keep purge tags, sessions, etc.)
    if (discogsUsername) {
      clearSessionMut({ discogs_username: discogsUsername });
    }

    // Clear local auth state
    setOauthCredentials(null);
    setDiscogsToken("");
    setDiscogsUsername("");

    // Clear sessionStorage (transient OAuth bridge only)
    try {
      sessionStorage.removeItem("hg_oauth_token_secret");
    } catch { /* ignore */ }

    // Reset data state
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
    setSyncFailed(false);

    // Navigate away from any authenticated-only screen
    setScreenRaw("feed");

    // Prevent session restore from re-hydrating after explicit sign-out
    hasSignedOutRef.current = true;

    // Clear cached data
    clearCollectionValue();
    clearAllMarketData();

    // Reset hydration flags
    hydratedRef.current = {
      purgeTags: false,
      sessions: false,
      lastPlayed: false,
      wantPriorities: false,
      preferences: false,
      following: false,
    };
    initialSyncDoneRef.current = false;
  }, [discogsUsername, clearSessionMut, setDiscogsToken, setDiscogsUsername]);

  // ── Developer / QA resets ──

  const wipeAllData = useCallback(() => {
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
    setOauthCredentials(null);
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
    setSyncFailed(false);
    clearCollectionValue();
    clearAllMarketData();
    try {
      sessionStorage.removeItem("hg_oauth_token_secret");
    } catch { /* ignore */ }
    hydratedRef.current = {
      purgeTags: false,
      sessions: false,
      lastPlayed: false,
      wantPriorities: false,
      preferences: false,
      following: false,
    };
    initialSyncDoneRef.current = false;
  }, [setDiscogsToken, setDiscogsUsername]);

  // ── Connect Discogs flow trigger ──

  const requestConnectDiscogs = useCallback(() => {
    setConnectDiscogsRequested(true);
  }, []);

  const clearConnectDiscogsRequest = useCallback(() => {
    setConnectDiscogsRequested(false);
  }, []);

  // ── Session Picker ──

  const openSessionPicker = useCallback((albumId: string) => {
    // Auto-create "Saved for Later" session if no sessions exist
    setSessions((prev) => {
      if (prev.length === 0) {
        const now = new Date().toISOString();
        const sessionId = "s" + Date.now();
        const newSession: Session = {
          id: sessionId,
          name: "Saved for Later",
          albumIds: [albumId],
          createdAt: now.split("T")[0],
          lastModified: now,
        };
        setFirstSessionJustCreated(true);
        // Persist to Convex
        if (discogsUsername) {
          createSessionMut({
            discogs_username: discogsUsername,
            session_id: sessionId,
            name: "Saved for Later",
            album_ids: [Number(albumId)],
          });
        }
        return [newSession];
      }
      return prev;
    });
    setSessionPickerAlbumId(albumId);
  }, [discogsUsername, createSessionMut]);

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
      let newAlbumIds: string[];
      if (albumIndex === -1) {
        newAlbumIds = [...session.albumIds, albumId];
      } else {
        newAlbumIds = session.albumIds.filter((id) => id !== albumId);
      }

      // Persist to Convex
      if (discogsUsername) {
        updateSessionMut({
          discogs_username: discogsUsername,
          session_id: sessionId,
          album_ids: newAlbumIds.map(Number),
        });
      }

      if (albumIndex === -1) {
        return [
          ...prev.slice(0, sessionIndex),
          { ...session, albumIds: newAlbumIds, lastModified: now },
          ...prev.slice(sessionIndex + 1),
        ];
      } else {
        return [
          ...prev.slice(0, sessionIndex),
          { ...session, albumIds: newAlbumIds },
          ...prev.slice(sessionIndex + 1),
        ];
      }
    });
  }, [discogsUsername, updateSessionMut]);

  const createSessionDirect = useCallback((name: string, initialAlbumIds?: string[]) => {
    const now = new Date().toISOString();
    const sessionId = "s" + Date.now();
    const newSession: Session = {
      id: sessionId,
      name,
      albumIds: initialAlbumIds || [],
      createdAt: now.split("T")[0],
      lastModified: now,
    };
    setSessions((prev) => [newSession, ...prev]);
    // Persist to Convex
    if (discogsUsername) {
      createSessionMut({
        discogs_username: discogsUsername,
        session_id: sessionId,
        name,
        album_ids: (initialAlbumIds || []).map(Number),
      });
    }
    return sessionId;
  }, [discogsUsername, createSessionMut]);

  const isAlbumInAnySession = useCallback((albumId: string) => {
    return sessions.some((s) => s.albumIds.includes(albumId));
  }, [sessions]);

  const mostRecentSessionId = useMemo(() => {
    if (sessions.length === 0) return null;
    return [...sessions].sort((a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    )[0].id;
  }, [sessions]);

  // ── Context value ──

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
      removeFromWantList,
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
      colorMode,
      setColorMode,
      // Last Played tracking
      lastPlayed,
      markPlayed,
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
      // Shake gesture
      shakeToRandom,
      setShakeToRandom,
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
      wipeAllData,
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
      // Market data manual refresh
      refreshMarketData,
      marketRefreshProgress,
      isRefreshingMarket,
      marketInsights: convexMarketInsights ?? null,
      // OAuth / session management
      loginWithOAuth,
      signOut,
      isAuthenticated,
      isAuthLoading,
      discogsAuth,
    }),
    [
      screen, setScreen, viewMode, albums, wants, sessions, friends,
      addFriend, removeFriend,
      selectedAlbumId, selectedAlbum,
      searchQuery, activeFolder, sortOption, filteredAlbums,
      setPurgeTag, toggleWantPriority, addToWantList, removeFromWantList,
      isInWants, isInCollection,
      deleteSession, renameSession, reorderSessionAlbums,
      showFilterDrawer, showAlbumDetail,
      purgeFilter, wantFilter, wantSearchQuery,
      isDarkMode, toggleDarkMode, colorMode, setColorMode,
      lastPlayed, markPlayed,
      neverPlayedFilter,
      rediscoverMode,
      computedRediscoverAlbums,
      hidePurgeIndicators, setHidePurgeIndicators,
      hideGalleryMeta, setHideGalleryMeta,
      shakeToRandom, setShakeToRandom,
      headerHidden, setHeaderHidden,
      folders,
      discogsToken, setDiscogsToken,
      discogsUsername, setDiscogsUsername,
      isSyncing, syncProgress, lastSynced,
      syncFromDiscogs, syncStats,
      userAvatar,
      wipeAllData,
      connectDiscogsRequested, requestConnectDiscogs, clearConnectDiscogsRequest,
      sessionPickerAlbumId, openSessionPicker, closeSessionPicker,
      isInSession, toggleAlbumInSession, createSessionDirect,
      isAlbumInAnySession, mostRecentSessionId, firstSessionJustCreated,
      loginWithOAuth, signOut, isAuthenticated, isAuthLoading, discogsAuth,
      refreshMarketData, marketRefreshProgress, isRefreshingMarket, convexMarketInsights,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
