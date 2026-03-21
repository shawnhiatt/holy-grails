import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import {
  type Album,
  type WantItem,
  type Session,
  type PurgeTag,
  type FollowedUser,
  type FeedAlbum,
  clearCollectionValue,
  setCollectionValueCache,
  type CollectionValue,
  type UserProfile,
  isVinylFormat,
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

export type Screen = "crate" | "purge" | "sessions" | "wants" | "following" | "settings" | "reports" | "feed";
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

export interface FollowingFeedEntry {
  followed_username: string;
  lastSyncedAt: number;
  recent_albums: FeedAlbum[];
}

interface AppState {
  screen: Screen;
  setScreen: (s: Screen) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  wantViewMode: ViewMode;
  setWantViewMode: (v: ViewMode) => void;
  albums: Album[];
  wants: WantItem[];
  sessions: Session[];
  followedUsers: FollowedUser[];
  addFollowedUser: (user: FollowedUser) => void;
  removeFollowedUser: (userId: string) => void;
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
  deletePurgeTag: (releaseId: number) => void;
  executePurgeCut: () => Promise<void>;
  purgeProgress: { running: boolean; current: number; total: number; failed: number[] } | null;
  toggleWantPriority: (wantId: string) => void;
  addToWantList: (item: WantItem) => Promise<void>;
  removeFromWantList: (releaseId: string | number) => Promise<void>;
  isInWants: (releaseId: string | number, masterId?: number) => boolean;
  isInCollection: (releaseId: string | number, masterId?: number) => boolean;
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
  // Default screen
  defaultScreen: Screen;
  setDefaultScreen: (s: Screen) => void;
  // Discogs sync
  folders: { id: number; name: string; count: number }[];
  createFolder: (name: string) => Promise<void>;
  renameFolder: (folderId: number, name: string) => Promise<void>;
  deleteFolder: (folderId: number) => Promise<void>;
  fetchFolders: () => Promise<void>;
  sessionToken: string | null;
  discogsUsername: string;
  setDiscogsUsername: (u: string) => void;
  isSyncing: boolean;
  isSyncingFollowing: boolean;
  syncProgress: string;
  lastSynced: string;
  syncFromDiscogs: () => Promise<{ albums: number; folders: number; wants: number }>;
  syncStats: { albums: number; folders: number; wants: number } | null;
  // User profile
  userAvatar: string;
  userProfile: UserProfile | null;
  updateProfile: (fields: { profile?: string; location?: string }) => Promise<void>;
  // Developer / QA resets
  clearPlayHistory: () => Promise<void>;
  clearFollowedUsers: () => Promise<void>;
  clearWantlistPriorities: () => Promise<void>;
  wipeAllData: () => Promise<void>;
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
  // Album instance editing
  updateAlbum: (albumId: string, fields: Partial<Album>) => void;
  removeFromCollection: (albumId: string) => Promise<void>;
  // Wantlist detail panel
  selectedWantItem: WantItem | null;
  setSelectedWantItem: (item: WantItem | null) => void;
  // Feed album detail panel (non-collection albums)
  selectedFeedAlbum: FeedAlbum | null;
  setSelectedFeedAlbum: (album: FeedAlbum | null) => void;
  // Add to collection
  addToCollection: (releaseId: number) => Promise<void>;
  // Wantlist crossover (wantlist items now in collection after sync)
  collectionCrossoverQueue: WantItem[];
  dismissCrossover: (releaseId: number) => void;
  // OAuth / session management
  loginWithOAuth: (user: { username: string; avatarUrl: string; accessToken: string; tokenSecret: string; sessionToken: string }) => Promise<void>;
  signOut: () => void;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  // Following feed cache (startup-synced)
  followingFeed: FollowingFeedEntry[];
  followingAvatars: Map<string, string>;
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
  const [viewMode, setViewModeRaw] = useState<ViewMode>("grid");
  const [wantViewMode, setWantViewModeRaw] = useState<ViewMode>("grid");
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState("All");
  const [sortOption, setSortOption] = useState<SortOption>("artist-az");
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [showAlbumDetail, setShowAlbumDetail] = useState(false);
  const [purgeFilter, setPurgeFilter] = useState<PurgeTag | "unrated" | "all">("unrated");
  const [wantFilter, setWantFilter] = useState<"all" | "priority">("all");
  const [wantSearchQuery, setWantSearchQuery] = useState("");

  // ── Auth state ──

  // Discogs username — in-memory only; Convex is the source of truth
  const [discogsUsername, setDiscogsUsernameRaw] = useState("");
  const setDiscogsUsername = useCallback((u: string) => {
    setDiscogsUsernameRaw(u);
  }, []);

  // Session token for authenticated Convex queries/mutations + server-side API proxy.
  // On mount, attempt to restore from localStorage (set during OAuth login).
  const [sessionToken, setSessionTokenRaw] = useState<string | null>(() => {
    try {
      return localStorage.getItem("hg_session_token");
    } catch {
      return null;
    }
  });
  const setSessionToken = useCallback((token: string | null) => {
    setSessionTokenRaw(token);
    try {
      if (token) {
        localStorage.setItem("hg_session_token", token);
      } else {
        localStorage.removeItem("hg_session_token");
      }
    } catch { /* ignore — localStorage may be unavailable in some contexts */ }
  }, []);

  const isAuthenticated = !!discogsUsername && !!sessionToken;


  // ── Theme state ──
  const [colorMode, setColorModeRaw] = useState<"light" | "dark" | "system">("dark");
  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return true; }
  });

  // ── Data state ──
  const [albums, setAlbums] = useState<Album[]>([]);
  const [wants, setWants] = useState<WantItem[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [followedUsers, setFollowedUsers] = useState<FollowedUser[]>([]);
  const [lastPlayed, setLastPlayed] = useState<Record<string, string>>({});
  const [neverPlayedFilter, setNeverPlayedFilter] = useState(false);
  const [rediscoverMode, setRediscoverMode] = useState(false);
  const [hidePurgeIndicators, setHidePurgeIndicatorsRaw] = useState(false);
  const [hideGalleryMeta, setHideGalleryMetaRaw] = useState(false);
  const [shakeToRandom, setShakeToRandomRaw] = useState(false);
  const [defaultScreen, setDefaultScreenRaw] = useState<Screen>("feed");
  const [folders, setFolders] = useState<{ id: number; name: string; count: number }[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingFollowing, setIsSyncingFollowing] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [syncFailed, setSyncFailed] = useState(false);
  const [lastSynced, setLastSynced] = useState("");
  const [syncStats, setSyncStats] = useState<{ albums: number; folders: number; wants: number } | null>(null);
  const [purgeProgress, setPurgeProgress] = useState<{ running: boolean; current: number; total: number; failed: number[] } | null>(null);
  const [userAvatar, setUserAvatar] = useState("");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [connectDiscogsRequested, setConnectDiscogsRequested] = useState(false);
  const [sessionPickerAlbumId, setSessionPickerAlbumId] = useState<string | null>(null);
  const [firstSessionJustCreated, setFirstSessionJustCreated] = useState(false);
  const [selectedWantItem, setSelectedWantItem] = useState<WantItem | null>(null);
  const [selectedFeedAlbum, setSelectedFeedAlbum] = useState<FeedAlbum | null>(null);
  const [collectionCrossoverQueue, setCollectionCrossoverQueue] = useState<WantItem[]>([]);
  const [followingFeed, setFollowingFeed] = useState<FollowingFeedEntry[]>([]);

  // ── Convex queries ──

  // Session restore query: looks up user by the session token stored in
  // localStorage. Skipped when no stored token exists (fresh visitor → login screen).
  const convexLatestUser = useQuery(
    api.users.getLatestUser,
    sessionToken ? { sessionToken } : "skip"
  );

  // All authenticated queries gate on discogsUsername AND sessionToken.
  // During session restore, discogsUsername is only set after getLatestUser
  // confirms the token is valid. This prevents these queries from firing
  // with a stale token and throwing "Unauthorized" before cleanup can run.
  const authedArgs = discogsUsername && sessionToken ? { sessionToken } : "skip" as const;

  const convexUser = useQuery(api.users.getMe, authedArgs);
  const convexPurgeTags = useQuery(api.purge_tags.getByUsername, authedArgs);
  const convexSessions = useQuery(api.sessions.getByUsername, authedArgs);
  const convexLastPlayed = useQuery(api.last_played.getByUsername, authedArgs);
  const convexWantPriorities = useQuery(api.want_priorities.getByUsername, authedArgs);
  const convexFollowing = useQuery(api.following.getByUsername, authedArgs);
  const convexPreferences = useQuery(api.preferences.getByUsername, authedArgs);
  const convexCollection = useQuery(api.collection.getByUsername, authedArgs);
  const convexWantlist = useQuery(api.wantlist.getByUsername, authedArgs);
  const convexFollowingFeed = useQuery(api.following_feed.getByFollower, authedArgs);

  // isAuthLoading: true when a returning user's session is being restored
  // (Convex query in flight or initial sync running) but data hasn't arrived yet.
  // Prevents flashing the empty Feed before collection loads.
  //
  // isRestoringSession: true on cold load while we're checking Convex for an
  // existing user — before discogsUsername is known.
  const isRestoringSession = !discogsUsername && !!sessionToken && convexLatestUser === undefined;
  const isConvexUserGone = !sessionToken;
  const isAuthLoading = (!!discogsUsername || isRestoringSession) && albums.length === 0 && !isConvexUserGone && !syncFailed;

  // ── Convex mutations ──
  const upsertPurgeTagMut = useMutation(api.purge_tags.upsert);
  const removePurgeTagMut = useMutation(api.purge_tags.remove);
  const createSessionMut = useMutation(api.sessions.create);
  const updateSessionMut = useMutation(api.sessions.update);
  const removeSessionMut = useMutation(api.sessions.remove);
  const upsertLastPlayedMut = useMutation(api.last_played.upsert);
  const clearLastPlayedMut = useMutation(api.last_played.clearAll);
  const upsertWantPriorityMut = useMutation(api.want_priorities.upsert);
  const clearWantPrioritiesMut = useMutation(api.want_priorities.clearAll);
  const addFollowingMut = useMutation(api.following.add);
  const removeFollowingMut = useMutation(api.following.remove);
  const updateAvatarMut = useMutation(api.following.updateAvatar);
  const clearFollowingMut = useMutation(api.following.clearAll);
  const upsertPreferencesMut = useMutation(api.preferences.upsert);
  const updateLastSyncedMut = useMutation(api.users.updateLastSynced);
  const clearSessionMut = useMutation(api.users.clearSession);
  const deleteAllUserDataMut = useMutation(api.users.deleteAllUserData);
  const replaceCollectionMut = useMutation(api.collection.replaceAll);
  const updateInstanceMut = useMutation(api.collection.updateInstance);
  const updateCollectionValueMut = useMutation(api.users.updateCollectionValue);
  const replaceWantlistMut = useMutation(api.wantlist.replaceAll);
  const addWantlistItemMut = useMutation(api.wantlist.addItem);
  const removeWantlistItemMut = useMutation(api.wantlist.removeItem);
  const upsertFollowingFeedMut = useMutation(api.following_feed.upsert);
  const deleteFollowingFeedMut = useMutation(api.following_feed.deleteEntry);

  // ── Convex actions (server-side Discogs API proxy) ──
  const proxyFetchIdentity = useAction(api.discogs.proxyFetchIdentity);
  const proxyFetchUserProfile = useAction(api.discogs.proxyFetchUserProfile);
  const proxyFetchCollection = useAction(api.discogs.proxyFetchCollection);
  const proxyFetchWantlist = useAction(api.discogs.proxyFetchWantlist);
  const proxyFetchCollectionValue = useAction(api.discogs.proxyFetchCollectionValue);
  const proxyFetchUserCollectionPage = useAction(api.discogs.proxyFetchUserCollectionPage);
  const proxyRemoveFromCollection = useAction(api.discogs.proxyRemoveFromCollection);
  const proxyAddToWantlist = useAction(api.discogs.proxyAddToWantlist);
  const proxyRemoveFromWantlist = useAction(api.discogs.proxyRemoveFromWantlist);
  const proxyFetchFolders = useAction(api.discogs.proxyFetchFolders);
  const proxyCreateFolder = useAction(api.discogs.proxyCreateFolder);
  const proxyRenameFolder = useAction(api.discogs.proxyRenameFolder);
  const proxyDeleteFolder = useAction(api.discogs.proxyDeleteFolder);
  const proxyUpdateProfile = useAction(api.discogs.proxyUpdateProfile);
  const proxyAddToCollection = useAction(api.discogs.proxyAddToCollection);
  const addCollectionItemMut = useMutation(api.collection.addItem);
  const removeCollectionItemMut = useMutation(api.collection.removeItem);

  // ── Refs for latest Convex data (used in sync functions) ──
  const purgeTagsRef = useRef(convexPurgeTags);
  purgeTagsRef.current = convexPurgeTags;
  const wantPrioritiesRef = useRef(convexWantPriorities);
  wantPrioritiesRef.current = convexWantPriorities;
  const lastPlayedRef = useRef(convexLastPlayed);
  lastPlayedRef.current = convexLastPlayed;
  const followingRef = useRef(convexFollowing);
  followingRef.current = convexFollowing;
  const wantlistRef = useRef(convexWantlist);
  wantlistRef.current = convexWantlist;
  const followingFeedRef = useRef(convexFollowingFeed);
  followingFeedRef.current = convexFollowingFeed;

  // Avatar lookup for followed users (username → avatar_url)
  const followingAvatars = useMemo(() => {
    const map = new Map<string, string>();
    if (convexFollowing) {
      for (const entry of convexFollowing) {
        const avatar = (entry as any).avatar_url as string | undefined;
        if (avatar) map.set(entry.following_username, avatar);
      }
    }
    return map;
  }, [convexFollowing]);

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

  // Session restore: if a stored sessionToken matched a user record in Convex,
  // hydrate discogsUsername so the rest of the auth flow proceeds. If the query
  // returned null (invalid/expired token), clear the stale token → login screen.
  useEffect(() => {
    if (hasSignedOutRef.current) return;
    if (!discogsUsername && sessionToken && convexLatestUser === null) {
      // Stored token is invalid — clear it so the user sees the login screen
      setSessionToken(null);
    }
    if (!discogsUsername && convexLatestUser) {
      setDiscogsUsernameRaw(convexLatestUser.discogs_username);
    }
  }, [convexLatestUser, discogsUsername, sessionToken, setSessionToken]);

  // Load user info (avatar, last synced) from Convex user record
  useEffect(() => {
    if (convexUser) {
      if (convexUser.discogs_avatar_url) {
        setUserAvatar(convexUser.discogs_avatar_url);
      }
      if (convexUser.last_synced_at) {
        const d = new Date(convexUser.last_synced_at);
        const formatted = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          + " \u00b7 " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        setLastSynced(formatted);
      }
    }
  }, [convexUser]);

  // Auto-sync on initial load for returning users (OAuth or personal token).
  // If the collection was synced within the last 24 hours, load from
  // the Convex cache instead of hitting Discogs.
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  useEffect(() => {
    if (initialSyncDoneRef.current) return;
    if (!discogsUsername) return;
    if (!sessionToken) return; // wait for session token

    const lastSync = convexUser?.last_synced_at ?? convexLatestUser?.last_synced_at ?? null;
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
          master_id: (row as any).masterId || undefined,
          instance_id: row.instanceId,
          folder_id: row.folderId ?? 1,
          title: row.title,
          artist: row.artist,
          year: row.year,
          thumb: row.thumb ?? "",
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
        })).filter((a) => isVinylFormat(a.format));

        // Derive folder list from cached albums (name-only fallback until proxyFetchFolders runs)
        const folderMap = new Map<string, { id: number; count: number }>();
        for (const a of cachedAlbums) {
          const entry = folderMap.get(a.folder);
          if (entry) {
            entry.count++;
          } else {
            folderMap.set(a.folder, { id: a.folder_id, count: 1 });
          }
        }
        const cachedFolders: { id: number; name: string; count: number }[] = [
          { id: 0, name: "All", count: cachedAlbums.length },
          ...Array.from(folderMap.entries())
            .filter(([name]) => name !== "All")
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, info]) => ({ id: info.id, name, count: info.count })),
        ];

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

        // Load wantlist from Convex cache, fall back to Discogs if empty
        const cachedWants = wantlistRef.current;
        const hydrateWants = (newWants: WantItem[]) => {
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
            folders: cachedFolders.filter((f) => f.name !== "All").length,
            wants: newWants.length,
          });
        };

        if (cachedWants !== undefined && cachedWants.length > 0) {
          // Hydrate wantlist from Convex cache
          const wantsFromCache: WantItem[] = cachedWants.map((row) => ({
            id: String(row.release_id),
            release_id: row.release_id,
            master_id: (row as any).master_id || undefined,
            title: row.title,
            artist: row.artist,
            year: row.year,
            thumb: row.thumb ?? "",
            cover: row.cover,
            label: row.label,
            priority: row.priority,
          }));
          hydrateWants(wantsFromCache);
        } else {
          // Convex wantlist empty — fall back to Discogs fetch via server proxy
          proxyFetchWantlist({ sessionToken, username: discogsUsername }).then((newWants) => {
            hydrateWants(newWants);
            // Populate Convex cache for next load
            replaceWantlistMut({
              sessionToken,
              items: newWants.map((w) => ({
                release_id: w.release_id,
                master_id: w.master_id || undefined,
                title: w.title,
                artist: w.artist,
                year: w.year,
                cover: w.cover,
                thumb: w.thumb || undefined,
                label: w.label,
                priority: w.priority,
              })),
            }).catch((e) => console.warn("[Convex] Wantlist cache write failed:", e));
          }).catch((err) => {
            console.warn("[Cache load] Wantlist fetch failed:", err);
            setSyncStats({
              albums: cachedAlbums.length,
              folders: cachedFolders.filter((f) => f.name !== "All").length,
              wants: 0,
            });
          });
        }

        // Restore collection value from Convex cache, or fetch from Discogs
        const cachedValue = convexUser?.collection_value ?? convexLatestUser?.collection_value;
        const valueSyncedAt = convexUser?.collection_value_synced_at ?? convexLatestUser?.collection_value_synced_at;
        if (cachedValue && valueSyncedAt && (Date.now() - valueSyncedAt) < TWENTY_FOUR_HOURS) {
          try {
            const parsed: CollectionValue = JSON.parse(cachedValue);
            setCollectionValueCache(parsed);
          } catch { /* invalid JSON — fall through to Discogs fetch */ }
        } else {
          proxyFetchCollectionValue({ sessionToken, username: discogsUsername }).then((val) => {
            setCollectionValueCache(val);
            updateCollectionValueMut({
              sessionToken,
              collection_value: JSON.stringify(val),
            }).catch((e) => console.warn("[Convex] Collection value cache write failed:", e));
          }).catch((e) => {
            console.warn("[Cache load] Collection value fetch failed:", e);
          });
        }

        // Fetch avatar in background — skip if already set from Convex
        // Fetch profile in background — always fetch for enriched data, avatar fallback if not cached
        proxyFetchUserProfile({ sessionToken, username: discogsUsername }).then((p) => {
          if (!convexUser?.discogs_avatar_url && !convexLatestUser?.discogs_avatar_url) {
            setUserAvatar(p.avatar);
          }
          setUserProfile(p);
        }).catch(() => {});
      } else {
        // Cache is empty despite being "fresh" — fall back to full sync
        initialSyncDoneRef.current = true;
        performSync(discogsUsername, sessionToken).catch((err) => {
          console.error("[Auto-sync] Failed:", err);
          setSyncFailed(true);
          toast.error("Sync failed. Try again in Settings.");
        });
      }
    } else {
      // Cache is stale or missing — full sync from Discogs
      initialSyncDoneRef.current = true;
      performSync(discogsUsername, sessionToken).catch((err) => {
        console.error("[Auto-sync] Failed:", err);
        setSyncFailed(true);
        toast.error("Sync failed. Try again in Settings.");
      });
    }
  }, [discogsUsername, convexCollection, sessionToken]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (convexPreferences.view_mode) setViewModeRaw(convexPreferences.view_mode as ViewMode);
      if (convexPreferences.want_view_mode) setWantViewModeRaw(convexPreferences.want_view_mode as ViewMode);
      if (convexPreferences.default_screen) {
        const ds = convexPreferences.default_screen as Screen;
        setDefaultScreenRaw(ds);
        setScreenRaw(ds);
      }
    }
  }, [convexPreferences]);

  // Pre-populate followedUsers with partial entries from Convex as soon as
  // convexFollowing loads — renders username + avatar instantly on the
  // Following screen before API hydration begins.
  useEffect(() => {
    if (convexFollowing === undefined || convexFollowing.length === 0) return;
    setFollowedUsers(prev => {
      // Only add entries that aren't already present
      const existingUsernames = new Set(prev.map(f => f.username.toLowerCase()));
      const newPartials: FollowedUser[] = [];
      for (const entry of convexFollowing) {
        if (!existingUsernames.has(entry.following_username.toLowerCase())) {
          newPartials.push({
            id: `f-${entry.following_username}`,
            username: entry.following_username,
            avatar: (entry as any).avatar_url || "",
            isPrivate: false,
            folders: ["All"],
            lastSynced: "",
            collection: [],
            wants: [],
            hydrated: false,
          });
        }
      }
      return newPartials.length > 0 ? [...prev, ...newPartials] : prev;
    });
  }, [convexFollowing]);

  // Hydrate following from Convex — deferred until the user navigates to
  // the Following screen so we don't burn rate-limit budget on app load.
  useEffect(() => {
    if (screen !== "following") return;
    if (hydratedRef.current.following) return;
    if (convexFollowing === undefined) return; // still loading
    if (!sessionToken) return; // wait for session token
    if (convexFollowing.length === 0) {
      hydratedRef.current.following = true;
      return;
    }
    hydratedRef.current.following = true;
    const tokenSnapshot = sessionToken;
    (async () => {
      for (let i = 0; i < convexFollowing.length; i++) {
        const username = convexFollowing[i].following_username;
        try {
          const profile = await proxyFetchUserProfile({ sessionToken: tokenSnapshot, username });
          let userAlbums: Album[] = [];
          let userFolders: string[] = ["All"];
          let userWants: WantItem[] = [];
          let isPrivate = false;
          try {
            const result = await proxyFetchCollection({ sessionToken: tokenSnapshot, username, skipPrivateFields: true });
            userAlbums = result.albums;
            userFolders = result.folders;
          } catch (e: any) {
            if (e?.message?.includes("403")) isPrivate = true;
          }
          try {
            userWants = await proxyFetchWantlist({ sessionToken: tokenSnapshot, username });
          } catch { /* wantlist may be unavailable — skip */ }
          const followedUser: FollowedUser = {
            id: `f-${username}`,
            username: profile.username,
            avatar: profile.avatar,
            isPrivate,
            folders: userFolders,
            lastSynced: new Date().toISOString().split("T")[0],
            collection: userAlbums,
            wants: userWants,
            hydrated: true,
          };
          setFollowedUsers(prev => {
            // Replace partial entry or add new
            const idx = prev.findIndex(f => f.username.toLowerCase() === followedUser.username.toLowerCase());
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = followedUser;
              return updated;
            }
            return [...prev, followedUser];
          });
          // Persist avatar to Convex following table for feed usage
          if (profile.avatar) {
            updateAvatarMut({
              sessionToken: tokenSnapshot,
              following_username: username,
              avatar_url: profile.avatar,
            }).catch(() => {});
          }
        } catch (e) {
          console.warn(`[Following] Could not restore @${username}:`, e);
        }

        // 1-second delay between Discogs fetches to respect rate limits
        if (i < convexFollowing.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    })();
  }, [screen, convexFollowing, sessionToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hydrate following feed cache from Convex on cold load
  useEffect(() => {
    if (convexFollowingFeed === undefined) return;
    if (followingFeed.length > 0) return; // already populated (e.g. from performSync)
    if (convexFollowingFeed.length === 0) return;
    setFollowingFeed(
      convexFollowingFeed.map((entry) => ({
        followed_username: entry.followed_username,
        lastSyncedAt: entry.lastSyncedAt,
        recent_albums: entry.recent_albums as FeedAlbum[],
      }))
    );
  }, [convexFollowingFeed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Screen navigation ──

  const setScreen = useCallback((s: Screen) => {
    setScreenRaw(s);
    setShowAlbumDetail(false);
    setShowFilterDrawer(false);
    setSelectedAlbumId(null);
    setSelectedWantItem(null);
    setSessionPickerAlbumId(null);
  }, []);

  // ── Theme toggle ──

  // Derived isDarkMode from colorMode + system preference
  const isDarkMode = colorMode === "dark" || (colorMode === "system" && systemIsDark);

  const setColorMode = useCallback((mode: "light" | "dark" | "system") => {
    setColorModeRaw(mode);
    if (sessionToken) {
      upsertPreferencesMut({ sessionToken, theme: mode });
    }
  }, [sessionToken, upsertPreferencesMut]);

  const toggleDarkMode = useCallback(() => {
    const next: "light" | "dark" = isDarkMode ? "light" : "dark";
    setColorModeRaw(next);
    if (sessionToken) {
      upsertPreferencesMut({ sessionToken, theme: next });
    }
  }, [isDarkMode, sessionToken, upsertPreferencesMut]);

  // ── Display preferences with Convex persistence ──

  const setHidePurgeIndicators = useCallback((v: boolean) => {
    setHidePurgeIndicatorsRaw(v);
    if (sessionToken) {
      upsertPreferencesMut({ sessionToken, hide_purge_indicators: v });
    }
  }, [sessionToken, upsertPreferencesMut]);

  const setHideGalleryMeta = useCallback((v: boolean) => {
    setHideGalleryMetaRaw(v);
    if (sessionToken) {
      upsertPreferencesMut({ sessionToken, hide_gallery_meta: v });
    }
  }, [sessionToken, upsertPreferencesMut]);

  const setShakeToRandom = useCallback((v: boolean) => {
    setShakeToRandomRaw(v);
    if (sessionToken) {
      upsertPreferencesMut({ sessionToken, shake_to_random: v });
    }
  }, [sessionToken, upsertPreferencesMut]);

  const setDefaultScreen = useCallback((s: Screen) => {
    setDefaultScreenRaw(s);
    if (sessionToken) {
      upsertPreferencesMut({ sessionToken, default_screen: s });
    }
  }, [sessionToken, upsertPreferencesMut]);

  const setViewMode = useCallback((v: ViewMode) => {
    setViewModeRaw(v);
    if (sessionToken) {
      upsertPreferencesMut({ sessionToken, view_mode: v });
    }
  }, [sessionToken, upsertPreferencesMut]);

  const setWantViewMode = useCallback((v: ViewMode) => {
    setWantViewModeRaw(v);
    if (sessionToken) {
      upsertPreferencesMut({ sessionToken, want_view_mode: v });
    }
  }, [sessionToken, upsertPreferencesMut]);

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
    if (sessionToken) {
      if (tag) {
        upsertPurgeTagMut({
          sessionToken,
          release_id: Number(albumId),
          tag,
        });
      } else {
        removePurgeTagMut({
          sessionToken,
          release_id: Number(albumId),
        });
      }
    }
  }, [sessionToken, upsertPurgeTagMut, removePurgeTagMut]);

  const deletePurgeTag = useCallback((releaseId: number) => {
    setAlbums((prev) =>
      prev.map((a) => (a.release_id === releaseId ? { ...a, purgeTag: null } : a))
    );
    if (sessionToken) {
      removePurgeTagMut({ sessionToken, release_id: releaseId });
    }
  }, [sessionToken, removePurgeTagMut]);

  const updateAlbum = useCallback((albumId: string, fields: Partial<Album>) => {
    setAlbums((prev) =>
      prev.map((a) => (a.id === albumId ? { ...a, ...fields } : a))
    );
    if (sessionToken) {
      updateInstanceMut({
        sessionToken,
        releaseId: Number(albumId),
        ...(fields.mediaCondition !== undefined && { mediaCondition: fields.mediaCondition }),
        ...(fields.sleeveCondition !== undefined && { sleeveCondition: fields.sleeveCondition }),
        ...(fields.notes !== undefined && { notes: fields.notes }),
        ...(fields.folder !== undefined && { folder: fields.folder }),
        ...(fields.folder_id !== undefined && { folderId: fields.folder_id }),
        ...(fields.instance_id !== undefined && { instanceId: fields.instance_id }),
      }).catch(console.error);
    }
  }, [sessionToken, updateInstanceMut]);

  // ── Folder management ──

  const fetchFolders = useCallback(async () => {
    if (!sessionToken || !discogsUsername) return;
    const result = await proxyFetchFolders({ sessionToken, username: discogsUsername });
    setFolders(result);
  }, [sessionToken, discogsUsername, proxyFetchFolders]);

  const createFolder = useCallback(async (name: string) => {
    if (!sessionToken || !discogsUsername) throw new Error("Not authenticated");
    const created = await proxyCreateFolder({ sessionToken, username: discogsUsername, name });
    setFolders((prev) => [...prev, created]);
  }, [sessionToken, discogsUsername, proxyCreateFolder]);

  const renameFolder = useCallback(async (folderId: number, name: string) => {
    if (!sessionToken || !discogsUsername) throw new Error("Not authenticated");
    const updated = await proxyRenameFolder({ sessionToken, username: discogsUsername, folderId, name });
    setFolders((prev) => prev.map((f) => f.id === folderId ? { ...f, name: updated.name } : f));
    // Update folder name on albums that reference this folder
    setAlbums((prev) => prev.map((a) => a.folder_id === folderId ? { ...a, folder: updated.name } : a));
  }, [sessionToken, discogsUsername, proxyRenameFolder]);

  const deleteFolder = useCallback(async (folderId: number) => {
    if (!sessionToken || !discogsUsername) throw new Error("Not authenticated");
    await proxyDeleteFolder({ sessionToken, username: discogsUsername, folderId });
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
  }, [sessionToken, discogsUsername, proxyDeleteFolder]);

  const updateProfileFn = useCallback(async (fields: { profile?: string; location?: string }) => {
    if (!sessionToken || !discogsUsername) throw new Error("Not authenticated");
    const result = await proxyUpdateProfile({ sessionToken, username: discogsUsername, ...fields });
    setUserProfile((prev) => prev ? { ...prev, profile: result.profile, location: result.location } : prev);
  }, [sessionToken, discogsUsername, proxyUpdateProfile]);

  const toggleWantPriority = useCallback((wantId: string) => {
    setWants((prev) => {
      const want = prev.find((w) => w.id === wantId);
      if (want && sessionToken) {
        upsertWantPriorityMut({
          sessionToken,
          release_id: want.release_id,
          is_priority: !want.priority,
        });
      }
      return prev.map((w) => (w.id === wantId ? { ...w, priority: !w.priority } : w));
    });
  }, [sessionToken, upsertWantPriorityMut]);

  const addToWantList = useCallback(async (item: WantItem): Promise<void> => {
    if (!sessionToken || !discogsUsername) {
      // Fallback: local-only add (unauthenticated edge case)
      setWants((prev) => {
        const rid = Number(item.release_id);
        if (prev.some((w) => Number(w.release_id) === rid)) return prev;
        return [...prev, item];
      });
      return;
    }
    // Pattern A: API first (via server proxy), state update on success
    const result = await proxyAddToWantlist({ sessionToken, username: discogsUsername, releaseId: item.release_id });
    setWants((prev) => {
      const rid = Number(result.release_id);
      if (prev.some((w) => Number(w.release_id) === rid)) return prev;
      return [...prev, result];
    });
    // Keep Convex wantlist cache in sync
    addWantlistItemMut({
      sessionToken,
      release_id: result.release_id,
      master_id: result.master_id || undefined,
      title: result.title,
      artist: result.artist,
      year: result.year,
      cover: result.cover,
      thumb: result.thumb || undefined,
      label: result.label,
      priority: result.priority,
    }).catch((e) => console.warn("[Convex] Wantlist add failed:", e));
  }, [sessionToken, discogsUsername, proxyAddToWantlist, addWantlistItemMut]);

  const addToCollection = useCallback(async (releaseId: number): Promise<void> => {
    if (!sessionToken || !discogsUsername) throw new Error("Not authenticated");
    const result = await proxyAddToCollection({ sessionToken, username: discogsUsername, releaseId, folderId: 1 });
    // Build Album object from the returned data
    const folderName = folders.find(f => f.id === 1)?.name || "Uncategorized";
    const newAlbum: Album = {
      id: `${result.release_id}-${result.instance_id}`,
      release_id: result.release_id,
      master_id: result.master_id,
      instance_id: result.instance_id,
      folder_id: result.folder_id,
      title: result.title ?? "",
      artist: result.artist ?? "",
      year: result.year ?? 0,
      thumb: result.thumb ?? "",
      cover: result.cover ?? "",
      folder: folderName,
      label: result.label ?? "",
      catalogNumber: result.catalogNumber ?? "",
      format: result.format ?? "",
      mediaCondition: "",
      sleeveCondition: "",
      pricePaid: "",
      notes: "",
      dateAdded: result.dateAdded ?? new Date().toISOString(),
      discogsUrl: result.discogsUrl ?? `https://www.discogs.com/release/${releaseId}`,
      purgeTag: null,
    };
    setAlbums((prev) => {
      if (prev.some(a => a.release_id === result.release_id)) return prev;
      return [...prev, newAlbum];
    });
    // Keep Convex collection cache in sync
    addCollectionItemMut({
      sessionToken,
      releaseId: newAlbum.release_id,
      masterId: newAlbum.master_id,
      instanceId: newAlbum.instance_id,
      folderId: newAlbum.folder_id,
      artist: newAlbum.artist,
      title: newAlbum.title,
      year: newAlbum.year,
      thumb: newAlbum.thumb || undefined,
      cover: newAlbum.cover,
      folder: newAlbum.folder,
      label: newAlbum.label,
      catalogNumber: newAlbum.catalogNumber,
      format: newAlbum.format,
      mediaCondition: newAlbum.mediaCondition,
      sleeveCondition: newAlbum.sleeveCondition,
      pricePaid: newAlbum.pricePaid,
      notes: newAlbum.notes,
      dateAdded: newAlbum.dateAdded,
    }).catch((e) => console.warn("[Convex] Collection add failed:", e));
  }, [sessionToken, discogsUsername, proxyAddToCollection, addCollectionItemMut, folders]);

  const removeFromCollection = useCallback(async (albumId: string): Promise<void> => {
    if (!sessionToken || !discogsUsername) throw new Error("Not authenticated");
    const album = albums.find(a => a.id === albumId);
    if (!album) throw new Error("Album not found");
    await proxyRemoveFromCollection({
      sessionToken,
      username: discogsUsername,
      folderId: album.folder_id,
      releaseId: album.release_id,
      instanceId: album.instance_id,
    });
    setAlbums(prev => prev.filter(a => a.id !== albumId));
    removeCollectionItemMut({ sessionToken, releaseId: album.release_id })
      .catch(e => console.warn("[Convex] Collection remove failed:", e));
  }, [sessionToken, discogsUsername, albums, proxyRemoveFromCollection, removeCollectionItemMut]);

  const removeFromWantList = useCallback(async (releaseId: string | number): Promise<void> => {
    const rid = Number(releaseId);
    if (!sessionToken || !discogsUsername) {
      // Fallback: local-only remove
      setWants((prev) => prev.filter((w) => Number(w.release_id) !== rid));
      return;
    }
    // Pattern A: API first (via server proxy), state update on success
    await proxyRemoveFromWantlist({ sessionToken, username: discogsUsername, releaseId: rid });
    setWants((prev) => prev.filter((w) => Number(w.release_id) !== rid));
    // Also clean up want priority in Convex if it exists
    upsertWantPriorityMut({
      sessionToken,
      release_id: rid,
      is_priority: false,
    }).catch(() => {});
    // Keep Convex wantlist cache in sync
    removeWantlistItemMut({
      sessionToken,
      release_id: rid,
    }).catch((e) => console.warn("[Convex] Wantlist remove failed:", e));
  }, [sessionToken, discogsUsername, proxyRemoveFromWantlist, upsertWantPriorityMut, removeWantlistItemMut]);

  const isInWants = useCallback((releaseId: string | number, masterId?: number) => {
    const rid = Number(releaseId);
    if (wants.some((w) => Number(w.release_id) === rid)) return true;
    if (masterId && masterId > 0) {
      return wants.some((w) => w.master_id && w.master_id === masterId);
    }
    return false;
  }, [wants]);

  const isInCollection = useCallback((releaseId: string | number, masterId?: number) => {
    const rid = Number(releaseId);
    if (albums.some((a) => Number(a.release_id) === rid)) return true;
    if (masterId && masterId > 0) {
      return albums.some((a) => a.master_id && a.master_id === masterId);
    }
    return false;
  }, [albums]);

  const dismissCrossover = useCallback((releaseId: number) => {
    setCollectionCrossoverQueue((prev) => prev.filter((w) => w.release_id !== releaseId));
  }, []);

  const markPlayed = useCallback((albumId: string) => {
    const now = new Date();
    setLastPlayed((prev) => ({
      ...prev,
      [albumId]: now.toISOString(),
    }));
    if (sessionToken) {
      upsertLastPlayedMut({
        sessionToken,
        release_id: Number(albumId),
        played_at: now.getTime(),
      });
    }
  }, [sessionToken, upsertLastPlayedMut]);

  // ── Session operations ──

  const deleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (sessionToken) {
      removeSessionMut({ sessionToken, session_id: sessionId });
    }
  }, [sessionToken, removeSessionMut]);

  const renameSession = useCallback((sessionId: string, name: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, name } : s))
    );
    if (sessionToken) {
      updateSessionMut({ sessionToken, session_id: sessionId, name }).catch(console.error);
    }
  }, [sessionToken, updateSessionMut]);

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
    if (sessionToken) {
      updateSessionMut({
        sessionToken,
        session_id: sessionId,
        album_ids: albumIds.map(Number),
      }).catch(console.error);
    }
  }, [sessionToken, updateSessionMut]);

  // ── Following ──

  const addFollowedUser = useCallback((user: FollowedUser) => {
    setFollowedUsers((prev) => [...prev, { ...user, hydrated: true }]);
    if (sessionToken) {
      addFollowingMut({
        sessionToken,
        following_username: user.username,
        avatar_url: user.avatar || undefined,
      });
      // Fetch the new user's recent albums for the following feed cache
      proxyFetchUserCollectionPage({ sessionToken, username: user.username, page: 1, perPage: 50 })
        .then(async (recentAlbums) => {
          await upsertFollowingFeedMut({
            sessionToken,
            followed_username: user.username,
            recent_albums: recentAlbums,
          });
          setFollowingFeed((prev) => {
            const filtered = prev.filter(e => e.followed_username !== user.username);
            return [...filtered, {
              followed_username: user.username,
              lastSyncedAt: Date.now(),
              recent_albums: recentAlbums,
            }];
          });
        })
        .catch((e) => console.warn(`[FollowingFeed] Could not sync @${user.username}:`, e));
    }
  }, [sessionToken, addFollowingMut, proxyFetchUserCollectionPage, upsertFollowingFeedMut]);

  const removeFollowedUser = useCallback((userId: string) => {
    setFollowedUsers((prev) => {
      const user = prev.find(f => f.id === userId);
      if (user && sessionToken) {
        removeFollowingMut({ sessionToken, following_username: user.username });
        deleteFollowingFeedMut({ sessionToken, followed_username: user.username });
        setFollowingFeed((feedPrev) => feedPrev.filter(e => e.followed_username !== user.username));
      }
      return prev.filter((f) => f.id !== userId);
    });
  }, [sessionToken, removeFollowingMut, deleteFollowingFeedMut]);

  // ── Sync from Discogs ──

  const performSync = useCallback(async (
    username: string,
    token: string,
    forceRefresh = false
  ): Promise<{ albums: number; folders: number; wants: number }> => {
    setIsSyncing(true);
    setSyncProgress("Syncing");
    try {
      // Fetch user profile (avatar + enriched data)
      try {
        const profile = await proxyFetchUserProfile({ sessionToken: token, username });
        setUserAvatar(profile.avatar);
        setUserProfile(profile);
      } catch (e) {
        console.warn("[Discogs] Profile fetch failed:", e);
      }

      // Fetch collection and wantlist in parallel — no dependency between them
      setSyncProgress("Syncing");
      const [{ albums: rawAlbums, folders: newFolders }, newWants] = await Promise.all([
        proxyFetchCollection({ sessionToken: token, username }),
        proxyFetchWantlist({ sessionToken: token, username }),
      ]);
      const newAlbums = rawAlbums.filter(a => isVinylFormat(a.format));

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

      // Detect wantlist items that are now in the collection
      const collectionRids = new Set(newAlbums.map(a => a.release_id));
      const crossovers = newWants.filter(w => collectionRids.has(w.release_id));
      if (crossovers.length > 0) {
        setCollectionCrossoverQueue(crossovers);
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
      setSyncProgress("Caching collection");
      try {
        await replaceCollectionMut({
          sessionToken: token,
          albums: newAlbums.map((a) => ({
            releaseId: a.release_id,
            masterId: a.master_id || undefined,
            instanceId: a.instance_id,
            folderId: a.folder_id,
            artist: a.artist,
            title: a.title,
            year: a.year,
            thumb: a.thumb,
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

      // Write wantlist to Convex cache
      try {
        await replaceWantlistMut({
          sessionToken: token,
          items: newWants.map((w) => ({
            release_id: w.release_id,
            master_id: w.master_id || undefined,
            title: w.title,
            artist: w.artist,
            year: w.year,
            cover: w.cover,
            thumb: w.thumb || undefined,
            label: w.label,
            priority: w.priority,
          })),
        });
      } catch (e) {
        console.warn("[Convex] Wantlist cache write failed:", e);
      }

      // Update sync metadata
      const now = new Date();
      const formatted = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        + " \u00b7 " + now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      setLastSynced(formatted);
      setSyncStats({
        albums: newAlbums.length,
        folders: newFolders.filter((f: { name: string }) => f.name !== "All").length,
        wants: newWants.length,
      });
      setSyncProgress("");

      // Fetch collection value and cache in Convex
      setSyncProgress("Fetching collection value");
      try {
        const val = await proxyFetchCollectionValue({ sessionToken: token, username });
        setCollectionValueCache(val);
        updateCollectionValueMut({
          sessionToken: token,
          collection_value: JSON.stringify(val),
        }).catch((e) => console.warn("[Convex] Collection value cache write failed:", e));
      } catch (e) {
        console.warn("[Discogs] Collection value fetch failed:", e);
      }

      // Update lastSynced in Convex
      updateLastSyncedMut({ sessionToken: token });

      // ── Following feed sync ──
      // Sync recent albums from followed users for the feed cache.
      // Up to 25 users, most recently followed first. Skips users
      // whose cache is less than 24 hours old.
      setIsSyncingFollowing(true);
      setSyncProgress("Syncing users you follow");
      try {
        const followingList = followingRef.current;
        const cachedFeed = followingFeedRef.current;
        if (followingList && followingList.length > 0) {
          // Sort by followed_at descending, cap at 25
          const sorted = [...followingList]
            .sort((a, b) => b.followed_at - a.followed_at)
            .slice(0, 25);

          // Build lookup of existing cache entries
          const cacheMap = new Map<string, number>();
          if (cachedFeed) {
            for (const entry of cachedFeed) {
              cacheMap.set(entry.followed_username, entry.lastSyncedAt);
            }
          }

          const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
          const now = Date.now();
          const feedEntries: FollowingFeedEntry[] = [];

          // Pre-populate from cache for users we won't re-fetch
          if (cachedFeed) {
            for (const entry of cachedFeed) {
              feedEntries.push({
                followed_username: entry.followed_username,
                lastSyncedAt: entry.lastSyncedAt,
                recent_albums: entry.recent_albums as FeedAlbum[],
              });
            }
          }

          for (let i = 0; i < sorted.length; i++) {
            const record = sorted[i];
            const followedUser = record.following_username;
            setSyncProgress(`Syncing users you follow (${i + 1} of ${sorted.length})`);

            if (!forceRefresh) {
              const lastSynced = cacheMap.get(followedUser);
              if (lastSynced && (now - lastSynced) < TWENTY_FOUR_HOURS) {
                // Bypass cache if stored data lacks master_id (pre-schema-change migration)
                const cachedEntry = cachedFeed?.find(e => e.followed_username === followedUser);
                const needsMigration = cachedEntry?.recent_albums &&
                  cachedEntry.recent_albums.length > 0 &&
                  !cachedEntry.recent_albums.some((a: any) => a.master_id);
                if (!needsMigration) {
                  continue; // Cache is fresh and complete — skip
                }
              }
            }

            try {
              const recentAlbums = await proxyFetchUserCollectionPage({ sessionToken: token, username: followedUser, page: 1, perPage: 50 });
              await upsertFollowingFeedMut({
                sessionToken: token,
                followed_username: followedUser,
                recent_albums: recentAlbums,
              });

              // Update or add to local feed state
              const existingIdx = feedEntries.findIndex(e => e.followed_username === followedUser);
              const entry: FollowingFeedEntry = {
                followed_username: followedUser,
                lastSyncedAt: Date.now(),
                recent_albums: recentAlbums,
              };
              if (existingIdx >= 0) {
                feedEntries[existingIdx] = entry;
              } else {
                feedEntries.push(entry);
              }
            } catch (e) {
              console.warn(`[FollowingFeed] Could not sync @${followedUser}:`, e);
            }

            // 1-second delay between Discogs fetches to respect rate limits
            if (i < sorted.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }

          setFollowingFeed(feedEntries);
        }
      } catch (e) {
        console.warn("[FollowingFeed] Sync failed:", e);
      } finally {
        setIsSyncingFollowing(false);
      }

      setSyncProgress("");

      return {
        albums: newAlbums.length,
        folders: newFolders.filter((f: { name: string }) => f.name !== "All").length,
        wants: newWants.length,
      };
    } catch (err: any) {
      setSyncProgress("");
      setSyncFailed(true);
      throw err;
    } finally {
      setIsSyncing(false);
    }
  }, [updateLastSyncedMut, replaceCollectionMut, replaceWantlistMut, updateCollectionValueMut, upsertFollowingFeedMut, proxyFetchUserProfile, proxyFetchCollection, proxyFetchWantlist, proxyFetchCollectionValue, proxyFetchUserCollectionPage]);

  const syncFromDiscogs = useCallback(async (): Promise<{ albums: number; folders: number; wants: number }> => {
    setSyncFailed(false);
    if (!sessionToken) throw new Error("No session token available");

    // If we don't have a username yet, fetch identity first
    let username = discogsUsername;
    if (!username) {
      const identity = await proxyFetchIdentity({ sessionToken });
      username = identity.username;
      setDiscogsUsername(username);
    }

    return performSync(username, sessionToken, true);
  }, [discogsUsername, sessionToken, setDiscogsUsername, performSync, proxyFetchIdentity]);

  // executePurgeCut must be defined after syncFromDiscogs — it references
  // syncFromDiscogs in its dependency array, and accessing a const before its
  // declaration is evaluated throws a temporal dead zone ReferenceError.
  const executePurgeCut = useCallback(async () => {
    if (!sessionToken || !discogsUsername || isSyncing) return;

    const toDelete = albums.filter((a) => a.purgeTag === "cut");
    if (toDelete.length === 0) return;

    setPurgeProgress({ running: true, current: 0, total: toDelete.length, failed: [] });

    const failedIds: number[] = [];

    for (let i = 0; i < toDelete.length; i++) {
      const album = toDelete[i];
      setPurgeProgress({ running: true, current: i + 1, total: toDelete.length, failed: failedIds });
      try {
        await proxyRemoveFromCollection({
          sessionToken,
          username: discogsUsername,
          folderId: album.folder_id,
          releaseId: album.release_id,
          instanceId: album.instance_id,
        });
        deletePurgeTag(album.release_id);
      } catch (err) {
        console.error("[PurgeCut] Failed to remove", album.release_id, err);
        failedIds.push(album.release_id);
      }
      if (i < toDelete.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    const removed = toDelete.length - failedIds.length;
    setPurgeProgress(null);

    if (failedIds.length === 0) {
      toast.success(`${removed} album${removed === 1 ? "" : "s"} removed.`);
    } else {
      toast.error(`${removed} of ${toDelete.length} removed. ${failedIds.length} failed.`);
    }

    setScreen("crate");
    syncFromDiscogs().catch((err) => console.error("[PurgeCut] Re-sync failed:", err));
  }, [sessionToken, discogsUsername, isSyncing, albums, deletePurgeTag, setScreen, syncFromDiscogs, proxyRemoveFromCollection]);

  // ── OAuth login ──

  const loginWithOAuth = useCallback(async (user: {
    username: string;
    avatarUrl: string;
    accessToken: string;
    tokenSecret: string;
    sessionToken: string;
  }) => {
    // Set session token and username
    setSessionToken(user.sessionToken);
    setDiscogsUsername(user.username);
    setUserAvatar(user.avatarUrl || "");

    // Mark initial sync as done (we're about to trigger it explicitly)
    initialSyncDoneRef.current = true;

    // Trigger initial Discogs sync via server-side proxy
    await performSync(user.username, user.sessionToken);
  }, [setDiscogsUsername, performSync]);

  // ── Sign out ──

  const signOut = useCallback(() => {
    // Clear auth session from Convex (keep purge tags, sessions, etc.)
    if (sessionToken) {
      clearSessionMut({ sessionToken });
    }

    // Clear local auth state
    setSessionToken(null);
    setDiscogsUsername("");

    // Clear sessionStorage (transient OAuth bridge only)
    try {
      sessionStorage.removeItem("hg_oauth_token_secret");
    } catch { /* ignore */ }

    // Reset data state
    setAlbums([]);
    setWants([]);
    setSessions([]);
    setFollowedUsers([]);
    setFollowingFeed([]);
    setFolders([]);
    setSelectedAlbumId(null);
    setSelectedWantItem(null);
    setCollectionCrossoverQueue([]);
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
    setUserProfile(null);
    setSessionPickerAlbumId(null);
    setFirstSessionJustCreated(false);
    setSyncFailed(false);
    setScreenRaw("feed"); // Navigate away from any authenticated-only screen

    // Prevent session restore from re-hydrating after explicit sign-out
    hasSignedOutRef.current = true;

    // Clear cached data
    clearCollectionValue();

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
  }, [sessionToken, clearSessionMut, setDiscogsUsername]);

  // ── Clear actions (Settings > Data) ──

  const clearPlayHistory = useCallback(async () => {
    if (sessionToken) await clearLastPlayedMut({ sessionToken });
    setLastPlayed({});
  }, [sessionToken, clearLastPlayedMut]);

  const clearFollowedUsers = useCallback(async () => {
    if (sessionToken) await clearFollowingMut({ sessionToken });
    setFollowedUsers([]);
    setFollowingFeed([]);
  }, [sessionToken, clearFollowingMut]);

  const clearWantlistPriorities = useCallback(async () => {
    if (sessionToken) await clearWantPrioritiesMut({ sessionToken });
    setWants((prev) => prev.map((w) => ({ ...w, priority: false })));
  }, [sessionToken, clearWantPrioritiesMut]);

  // ── Developer / QA resets ──

  const wipeAllData = useCallback(async () => {
    // Delete all user data from Convex first (while token is still valid)
    if (sessionToken) {
      await deleteAllUserDataMut({ sessionToken });
    }

    // Then reset all client state
    setAlbums([]);
    setWants([]);
    setSessions([]);
    setFollowedUsers([]);
    setFollowingFeed([]);
    setFolders([]);
    setSelectedAlbumId(null);
    setSelectedWantItem(null);
    setCollectionCrossoverQueue([]);
    setSearchQuery("");
    setActiveFolder("All");
    setSortOption("artist-az");
    setPurgeFilter("unrated");
    setWantFilter("all");
    setWantSearchQuery("");
    setDiscogsUsername("");
    setSessionToken(null);
    setLastSynced("");
    setSyncStats(null);
    setSyncProgress("");
    setLastPlayed({});
    setNeverPlayedFilter(false);
    setRediscoverMode(false);
    setShowAlbumDetail(false);
    setShowFilterDrawer(false);
    setUserAvatar("");
    setUserProfile(null);
    setSessionPickerAlbumId(null);
    setFirstSessionJustCreated(false);
    setSyncFailed(false);
    clearCollectionValue();
    try {
      sessionStorage.removeItem("hg_oauth_token_secret");
    } catch { /* ignore */ }

    // Prevent session restore from re-hydrating after data wipe
    hasSignedOutRef.current = true;

    hydratedRef.current = {
      purgeTags: false,
      sessions: false,
      lastPlayed: false,
      wantPriorities: false,
      preferences: false,
      following: false,
    };
    initialSyncDoneRef.current = false;
  }, [sessionToken, deleteAllUserDataMut, setDiscogsUsername]);

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
        if (sessionToken) {
          createSessionMut({
            sessionToken,
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
  }, [sessionToken, createSessionMut]);

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
      if (sessionToken) {
        updateSessionMut({
          sessionToken,
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
  }, [sessionToken, updateSessionMut]);

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
    if (sessionToken) {
      createSessionMut({
        sessionToken,
        session_id: sessionId,
        name,
        album_ids: (initialAlbumIds || []).map(Number),
      });
    }
    return sessionId;
  }, [sessionToken, createSessionMut]);

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
      wantViewMode,
      setWantViewMode,
      albums,
      wants,
      sessions,
      followedUsers,
      addFollowedUser,
      removeFollowedUser,
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
      deletePurgeTag,
      executePurgeCut,
      purgeProgress,
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
      // Default screen
      defaultScreen,
      setDefaultScreen,
      // Discogs sync
      folders,
      createFolder,
      renameFolder,
      deleteFolder,
      fetchFolders,
      sessionToken,
      discogsUsername,
      setDiscogsUsername,
      isSyncing,
      isSyncingFollowing,
      syncProgress,
      lastSynced,
      syncFromDiscogs,
      syncStats,
      // User profile
      userAvatar,
      userProfile,
      updateProfile: updateProfileFn,
      // Clear actions (Settings > Data)
      clearPlayHistory,
      clearFollowedUsers,
      clearWantlistPriorities,
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
      // Album instance editing
      updateAlbum,
      removeFromCollection,
      // Wantlist detail panel
      selectedWantItem,
      setSelectedWantItem,
      // Feed album detail panel
      selectedFeedAlbum,
      setSelectedFeedAlbum,
      addToCollection,
      // Wantlist crossover
      collectionCrossoverQueue,
      dismissCrossover,
      // OAuth / session management
      loginWithOAuth,
      signOut,
      isAuthenticated,
      isAuthLoading,
      followingFeed,
      followingAvatars,
    }),
    [
      screen, setScreen, viewMode, wantViewMode, albums, wants, sessions, followedUsers,
      addFollowedUser, removeFollowedUser,
      selectedAlbumId, selectedAlbum,
      searchQuery, activeFolder, sortOption, filteredAlbums,
      setPurgeTag, deletePurgeTag, executePurgeCut, purgeProgress,
      toggleWantPriority, addToWantList, removeFromWantList,
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
      defaultScreen, setDefaultScreen,
      folders, createFolder, renameFolder, deleteFolder, fetchFolders,
      sessionToken,
      discogsUsername, setDiscogsUsername,
      isSyncing, isSyncingFollowing, syncProgress, lastSynced,
      syncFromDiscogs, syncStats,
      userAvatar, userProfile, updateProfileFn,
      clearPlayHistory, clearFollowedUsers, clearWantlistPriorities,
      wipeAllData,
      connectDiscogsRequested, requestConnectDiscogs, clearConnectDiscogsRequest,
      sessionPickerAlbumId, openSessionPicker, closeSessionPicker,
      isInSession, toggleAlbumInSession, createSessionDirect,
      isAlbumInAnySession, mostRecentSessionId, firstSessionJustCreated,
      updateAlbum, removeFromCollection,
      selectedWantItem, selectedFeedAlbum, addToCollection,
      collectionCrossoverQueue, dismissCrossover,
      loginWithOAuth, signOut, isAuthenticated, isAuthLoading,
      followingFeed, followingAvatars,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
