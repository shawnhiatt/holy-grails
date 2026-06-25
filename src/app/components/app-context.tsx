import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type Album,
  type WantItem,
  type Stack,
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

export type Screen = "crate" | "purge" | "stacks" | "wants" | "following" | "settings" | "reports" | "feed";
export type ViewMode = "crate" | "list" | "grid" | "artwork" | "grid3";
export type SortOption =
  | "artist-az"
  | "artist-za"
  | "title-az"
  | "year-new"
  | "year-old"
  | "added-new"
  | "added-old"
  | "label-az"
  | "last-played-oldest";

export interface FollowingFeedEntry {
  followed_username: string;
  lastSyncedAt: number;
  recent_albums: FeedAlbum[];
  recent_wants?: FeedAlbum[];
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
  stacks: Stack[];
  followedUsers: FollowedUser[];
  addFollowedUser: (user: FollowedUser) => void;
  refreshFollowedUser: (username: string) => Promise<void>;
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
  /** Sort actually applied to the grid — forced to artist A→Z while a search is active, otherwise mirrors sortOption */
  effectiveSortOption: SortOption;
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
  deleteStack: (stackId: string) => void;
  renameStack: (stackId: string, name: string) => void;
  reorderStackAlbums: (stackId: string, albumIds: string[]) => void;
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
  playCounts: Record<string, number>;
  allPlayTimestamps: number[];
  markPlayed: (albumId: string) => void;
  markPlayedAt: (albumId: string, date: Date) => void;
  removePlay: (playId: Id<"last_played">, albumId: string, playedAt: number) => void;
  neverPlayedFilter: boolean;
  setNeverPlayedFilter: (v: boolean) => void;
  playsRecordedFilter: boolean;
  setPlaysRecordedFilter: (v: boolean) => void;
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
  // Default collection sort
  defaultCollectionSort: SortOption;
  setDefaultCollectionSort: (s: SortOption) => void;
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
  isBackgroundSyncing: boolean;
  isSyncingFollowing: boolean;
  syncProgress: string;
  lastSynced: string;
  lastSyncedAt: number | null;
  refreshFromDiscogs: () => Promise<void>;
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
  // Stack Picker
  stackPickerAlbumId: string | null;
  openStackPicker: (albumId: string) => void;
  closeStackPicker: () => void;
  isInStack: (albumId: string, stackId: string) => boolean;
  toggleAlbumInStack: (albumId: string, stackId: string) => void;
  createStackDirect: (name: string, initialAlbumIds?: string[]) => string;
  isAlbumInAnyStack: (albumId: string) => boolean;
  mostRecentStackId: string | null;
  firstStackJustCreated: boolean;
  // Album instance editing
  updateAlbum: (albumId: string, fields: Partial<Album>) => void;
  removeFromCollection: (albumId: string) => Promise<void>;
  // Wantlist detail panel
  selectedWantItem: WantItem | null;
  setSelectedWantItem: (item: WantItem | null) => void;
  // Feed album detail panel (non-collection albums)
  selectedFeedAlbum: FeedAlbum | null;
  setSelectedFeedAlbum: (album: FeedAlbum | null) => void;
  // One-shot deep-link intent for Following screen activity tab ("See all" from Feed)
  followingActivityTabIntent: "collection" | "wantlist" | null;
  setFollowingActivityTabIntent: (t: "collection" | "wantlist" | null) => void;
  // Add to collection
  addToCollection: (releaseId: number) => Promise<void>;
  // Wantlist crossover (wantlist items now in collection after sync)
  collectionCrossoverQueue: WantItem[];
  dismissCrossover: (releaseId: number) => void;
  // OAuth / session management
  loginWithOAuth: (user: { username: string; avatarUrl: string; accessToken: string; tokenSecret: string; sessionToken: string; is_new: boolean }) => Promise<void>;
  signOut: () => void;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  isNewUser: boolean;
  // Share Activity opt-in
  shareActivity: boolean | undefined;
  showSharePrompt: boolean;
  setShareActivity: (v: boolean) => Promise<void>;
  // Following feed cache (startup-synced)
  followingFeed: FollowingFeedEntry[];
  followingAvatars: Map<string, string>;
  // Cycling stats derived from Convex cache (available before albums state populates)
  cachedSyncStats: string[];
  // Header callbacks — registered by screen components, called by MobileHeader
  onNewStack: (() => void) | null;
  setOnNewStack: (fn: (() => void) | null) => void;
  onAddFollowedUser: (() => void) | null;
  setOnAddFollowedUser: (fn: (() => void) | null) => void;
  followedUserProfile: { username: string; avatarUrl?: string } | null;
  setFollowedUserProfile: (profile: { username: string; avatarUrl?: string } | null) => void;
  onBackFromProfile: (() => void) | null;
  setOnBackFromProfile: (fn: (() => void) | null) => void;
  onUnfollowUser: (() => void) | null;
  setOnUnfollowUser: (fn: (() => void) | null) => void;
}

/** Build lastPlayed (most recent per release), playCounts, and allTimestamps from raw play records. */
function buildPlayMaps(records: Array<{ release_id: number; played_at: number }>) {
  const lastPlayedMap: Record<string, string> = {};
  const countMap: Record<string, number> = {};
  const allTimestamps: number[] = [];
  for (const lp of records) {
    const key = String(lp.release_id);
    countMap[key] = (countMap[key] || 0) + 1;
    allTimestamps.push(lp.played_at);
    const iso = new Date(lp.played_at).toISOString();
    if (!lastPlayedMap[key] || iso > lastPlayedMap[key]) {
      lastPlayedMap[key] = iso;
    }
  }
  return { lastPlayedMap, countMap, allTimestamps };
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
  const [sortOption, setSortOption] = useState<SortOption>("added-new");
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

  // Tracks whether the most recent OAuth login was for a brand new user
  // (vs returning user). Set by loginWithOAuth from the upsert response.
  const [isNewUser, setIsNewUser] = useState(false);


  // ── Theme state ──
  const [colorMode, setColorModeRaw] = useState<"light" | "dark" | "system">("dark");
  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return true; }
  });

  // ── Data state ──
  const [albums, setAlbums] = useState<Album[]>([]);
  const [wants, setWants] = useState<WantItem[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [followedUsers, setFollowedUsers] = useState<FollowedUser[]>([]);
  const [lastPlayed, setLastPlayed] = useState<Record<string, string>>({});
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({});
  const [allPlayTimestamps, setAllPlayTimestamps] = useState<number[]>([]);
  const [neverPlayedFilter, setNeverPlayedFilter] = useState(false);
  const [playsRecordedFilter, setPlaysRecordedFilter] = useState(false);
  const [hidePurgeIndicators, setHidePurgeIndicatorsRaw] = useState(false);
  const [hideGalleryMeta, setHideGalleryMetaRaw] = useState(false);
  const [shakeToRandom, setShakeToRandomRaw] = useState(false);
  const [defaultScreen, setDefaultScreenRaw] = useState<Screen>("feed");
  const [defaultCollectionSort, setDefaultCollectionSortRaw] = useState<SortOption>("added-new");
  const [folders, setFolders] = useState<{ id: number; name: string; count: number }[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  // Background sync runs without taking over the screen — the app stays
  // interactive on cached data and a subtle chip surfaces progress.
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [isSyncingFollowing, setIsSyncingFollowing] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [syncFailed, setSyncFailed] = useState(false);
  const [lastSynced, setLastSynced] = useState("");
  const [syncStats, setSyncStats] = useState<{ albums: number; folders: number; wants: number } | null>(null);
  const [purgeProgress, setPurgeProgress] = useState<{ running: boolean; current: number; total: number; failed: number[] } | null>(null);
  const [userAvatar, setUserAvatar] = useState("");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [connectDiscogsRequested, setConnectDiscogsRequested] = useState(false);
  const [stackPickerAlbumId, setStackPickerAlbumId] = useState<string | null>(null);
  const [firstStackJustCreated, setFirstStackJustCreated] = useState(false);
  const [selectedWantItem, setSelectedWantItem] = useState<WantItem | null>(null);
  const [selectedFeedAlbum, setSelectedFeedAlbum] = useState<FeedAlbum | null>(null);
  const [followingActivityTabIntent, setFollowingActivityTabIntent] = useState<"collection" | "wantlist" | null>(null);
  const [collectionCrossoverQueue, setCollectionCrossoverQueue] = useState<WantItem[]>([]);
  const [followingFeed, setFollowingFeed] = useState<FollowingFeedEntry[]>([]);
  // Header callbacks — registered by screen components
  const [onNewStack, setOnNewStack] = useState<(() => void) | null>(null);
  const [onAddFollowedUser, setOnAddFollowedUser] = useState<(() => void) | null>(null);
  const [followedUserProfile, setFollowedUserProfile] = useState<{ username: string; avatarUrl?: string } | null>(null);
  const [onBackFromProfile, setOnBackFromProfile] = useState<(() => void) | null>(null);
  const [onUnfollowUser, setOnUnfollowUser] = useState<(() => void) | null>(null);

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
  const convexStacks = useQuery(api.stacks.getByUsername, authedArgs);
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
  const createStackMut = useMutation(api.stacks.create);
  const updateStackMut = useMutation(api.stacks.update);
  const removeStackMut = useMutation(api.stacks.remove);
  const logPlayMut = useMutation(api.last_played.logPlay);
  const deletePlayMut = useMutation(api.last_played.deletePlay);
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
  const setShareActivityMut = useMutation(api.users.setShareActivity);
  const deleteAllUserDataMut = useMutation(api.users.deleteAllUserData);
  const updateInstanceMut = useMutation(api.collection.updateInstance);
  const updateCollectionValueMut = useMutation(api.users.updateCollectionValue);
  const replaceWantlistMut = useMutation(api.wantlist.replaceAll);
  const applyCollectionDiffMut = useMutation(api.collection.applyDiff);
  const applyWantlistDiffMut = useMutation(api.wantlist.applyDiff);
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
  const proxyFetchSyncSignals = useAction(api.discogs.proxyFetchSyncSignals);
  const proxyFetchUserCollectionPage = useAction(api.discogs.proxyFetchUserCollectionPage);
  const proxyFetchUserWantlistPage = useAction(api.discogs.proxyFetchUserWantlistPage);
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
  // Latest user records — read by the background sync probe to compare the
  // current Discogs counts against the counts stored at the last sync.
  const convexUserRef = useRef(convexUser);
  convexUserRef.current = convexUser;
  const convexLatestUserRef = useRef(convexLatestUser);
  convexLatestUserRef.current = convexLatestUser;

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
    stacks: false,
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

  // Cache-first boot. On cold load we hydrate the app from the Convex cache
  // immediately and unconditionally — the 24h timestamp no longer gates app
  // access. A lightweight background probe (maybeBackgroundSync) then checks
  // whether anything actually changed on Discogs and syncs only if so, so a
  // returning user never sits through a sync that has nothing to load.
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  useEffect(() => {
    if (initialSyncDoneRef.current) return;
    if (!discogsUsername) return;
    if (!sessionToken) return; // wait for session token
    if (convexCollection === undefined) return; // wait for the cache query to resolve

    initialSyncDoneRef.current = true;

    if (convexCollection.length > 0) {
      // ── Instant boot: hydrate from cache regardless of age ──
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
            const { lastPlayedMap, countMap, allTimestamps } = buildPlayMaps(lpData);
            setLastPlayed(lastPlayedMap);
            setPlayCounts(countMap);
            setAllPlayTimestamps(allTimestamps);
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
      }

      // Cache is on screen instantly — now probe Discogs in the background and
      // perform a real sync only if the collection or wantlist counts changed.
      maybeBackgroundSync(discogsUsername, sessionToken);
    } else {
      // No cached collection — genuine first sync (foreground loading screen).
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

  // Hydrate stacks from Convex (one-time)
  useEffect(() => {
    if (!hydratedRef.current.stacks && convexStacks !== undefined) {
      hydratedRef.current.stacks = true;
      if (convexStacks.length > 0) {
        setStacks(convexStacks.map(s => ({
          id: s.stack_id,
          name: s.name,
          albumIds: s.album_ids.map(String),
          createdAt: new Date(s.created_at).toISOString().split("T")[0],
          lastModified: new Date(s.last_modified).toISOString(),
        })));
      }
    }
  }, [convexStacks]);

  // Hydrate last played from Convex (one-time)
  useEffect(() => {
    if (!hydratedRef.current.lastPlayed && convexLastPlayed !== undefined) {
      hydratedRef.current.lastPlayed = true;
      if (convexLastPlayed.length > 0) {
        const { lastPlayedMap, countMap, allTimestamps } = buildPlayMaps(convexLastPlayed);
        setLastPlayed(lastPlayedMap);
        setPlayCounts(countMap);
        setAllPlayTimestamps(allTimestamps);
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
      if (convexPreferences.default_collection_sort) {
        const dcs = convexPreferences.default_collection_sort as SortOption;
        setDefaultCollectionSortRaw(dcs);
        setSortOption(dcs);
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
        recent_wants: (entry.recent_wants as FeedAlbum[] | undefined) ?? undefined,
      }))
    );
  }, [convexFollowingFeed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazily sync the following feed in the background the first time the user
  // opens the Feed or Following screen. Keeps followed users off the boot path
  // entirely — the feed shows cached data instantly and freshens underneath.
  // Per-user 24h TTL inside syncFollowingFeed skips users already fresh.
  const followingFeedLazyDoneRef = useRef(false);
  useEffect(() => {
    if (followingFeedLazyDoneRef.current) return;
    if (screen !== "feed" && screen !== "following") return;
    if (!sessionToken) return;
    if (convexFollowing === undefined) return; // wait for following list
    if (convexFollowingFeed === undefined) return; // wait for cache to hydrate the refs
    if (convexFollowing.length === 0) {
      followingFeedLazyDoneRef.current = true;
      return;
    }
    followingFeedLazyDoneRef.current = true;
    syncFollowingFeed(sessionToken);
    // syncFollowingFeed is a stable useCallback defined later in the component;
    // referencing it here (effect body) is safe, but it must NOT go in the dep
    // array — that's evaluated during render, before its const initializes (TDZ).
  }, [screen, sessionToken, convexFollowing, convexFollowingFeed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Screen navigation ──

  const setScreen = useCallback((s: Screen) => {
    setScreenRaw(s);
    setShowAlbumDetail(false);
    setShowFilterDrawer(false);
    setSelectedAlbumId(null);
    setSelectedWantItem(null);
    setSelectedFeedAlbum(null);
    setStackPickerAlbumId(null);
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

  const setDefaultCollectionSort = useCallback((s: SortOption) => {
    setDefaultCollectionSortRaw(s);
    setSortOption(s);
    if (sessionToken) {
      upsertPreferencesMut({ sessionToken, default_collection_sort: s });
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

  // While searching, results are always grouped/sorted by artist A→Z — the
  // chosen sortOption (and its Date Added grouping) resumes once search clears.
  const effectiveSortOption: SortOption = searchQuery.trim() ? "artist-az" : sortOption;

  const filteredAlbums = useMemo(() => {
    let result = [...albums];

    if (activeFolder !== "All") {
      result = result.filter((a) => a.folder === activeFolder);
    }

    if (neverPlayedFilter) {
      result = result.filter((a) => !lastPlayed[a.id]);
    }

    if (playsRecordedFilter) {
      result = result.filter((a) => !!lastPlayed[a.id]);
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

    switch (effectiveSortOption) {
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
      case "label-az":
        result.sort((a, b) => a.label.localeCompare(b.label));
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
  }, [albums, activeFolder, searchQuery, effectiveSortOption, neverPlayedFilter, playsRecordedFilter, lastPlayed]);

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
        ...(fields.customFields !== undefined && { customFields: fields.customFields }),
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
    setPlayCounts((prev) => ({
      ...prev,
      [albumId]: (prev[albumId] || 0) + 1,
    }));
    setAllPlayTimestamps((prev) => [...prev, now.getTime()]);
    if (sessionToken) {
      logPlayMut({
        sessionToken,
        release_id: Number(albumId),
        played_at: now.getTime(),
      });
    }
  }, [sessionToken, logPlayMut]);

  const markPlayedAt = useCallback((albumId: string, date: Date) => {
    setLastPlayed((prev) => ({
      ...prev,
      [albumId]: date.toISOString(),
    }));
    setPlayCounts((prev) => ({
      ...prev,
      [albumId]: (prev[albumId] || 0) + 1,
    }));
    setAllPlayTimestamps((prev) => [...prev, date.getTime()]);
    if (sessionToken) {
      logPlayMut({
        sessionToken,
        release_id: Number(albumId),
        played_at: date.getTime(),
      });
    }
  }, [sessionToken, logPlayMut]);

  const removePlay = useCallback((playId: Id<"last_played">, albumId: string, playedAt: number) => {
    setPlayCounts((prev) => {
      const nextCount = (prev[albumId] || 0) - 1;
      const next = { ...prev };
      if (nextCount <= 0) delete next[albumId];
      else next[albumId] = nextCount;
      return next;
    });
    setAllPlayTimestamps((prev) => {
      const idx = prev.indexOf(playedAt);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
    setLastPlayed((prev) => {
      const currentLast = prev[albumId];
      if (!currentLast) return prev;
      const deletedIso = new Date(playedAt).toISOString();
      if (currentLast !== deletedIso) return prev;
      // The deleted play was the most recent — drop entry; next sync/hydration will restore accurately.
      const next = { ...prev };
      delete next[albumId];
      return next;
    });
    if (sessionToken) {
      deletePlayMut({ sessionToken, play_id: playId });
    }
  }, [sessionToken, deletePlayMut]);

  // ── Stack operations ──

  const deleteStack = useCallback((stackId: string) => {
    setStacks((prev) => prev.filter((s) => s.id !== stackId));
    if (sessionToken) {
      removeStackMut({ sessionToken, stack_id: stackId });
    }
  }, [sessionToken, removeStackMut]);

  const renameStack = useCallback((stackId: string, name: string) => {
    setStacks((prev) =>
      prev.map((s) => (s.id === stackId ? { ...s, name } : s))
    );
    if (sessionToken) {
      updateStackMut({ sessionToken, stack_id: stackId, name }).catch(console.error);
    }
  }, [sessionToken, updateStackMut]);

  const reorderStackAlbums = useCallback((stackId: string, albumIds: string[]) => {
    setStacks((prev) => {
      const stackIndex = prev.findIndex((s) => s.id === stackId);
      if (stackIndex === -1) return prev;

      const stack = prev[stackIndex];
      const now = new Date().toISOString();
      return [
        ...prev.slice(0, stackIndex),
        { ...stack, albumIds, lastModified: now },
        ...prev.slice(stackIndex + 1),
      ];
    });
    if (sessionToken) {
      updateStackMut({
        sessionToken,
        stack_id: stackId,
        album_ids: albumIds.map(Number),
      }).catch(console.error);
    }
  }, [sessionToken, updateStackMut]);

  // ── Following ──

  const addFollowedUser = useCallback((user: FollowedUser) => {
    setFollowedUsers((prev) => [...prev, { ...user, hydrated: true }]);
    if (sessionToken) {
      addFollowingMut({
        sessionToken,
        following_username: user.username,
        avatar_url: user.avatar || undefined,
      });
      // Fetch the new user's recent albums + wants for the following feed cache
      Promise.all([
        proxyFetchUserCollectionPage({ sessionToken, username: user.username, page: 1, perPage: 50 }),
        proxyFetchUserWantlistPage({ sessionToken, username: user.username, page: 1, perPage: 50 }),
      ])
        .then(async ([recentAlbums, recentWants]) => {
          await upsertFollowingFeedMut({
            sessionToken,
            followed_username: user.username,
            recent_albums: recentAlbums,
            recent_wants: recentWants,
          });
          setFollowingFeed((prev) => {
            const filtered = prev.filter(e => e.followed_username !== user.username);
            return [...filtered, {
              followed_username: user.username,
              lastSyncedAt: Date.now(),
              recent_albums: recentAlbums,
              recent_wants: recentWants,
            }];
          });
        })
        .catch((e) => console.warn(`[FollowingFeed] Could not sync @${user.username}:`, e));
    }
  }, [sessionToken, addFollowingMut, proxyFetchUserCollectionPage, proxyFetchUserWantlistPage, upsertFollowingFeedMut]);

  // Manually re-fetch a single followed user's collection + wantlist. Used to
  // recover from a silent hydration failure (collection came back empty while
  // the user was still marked hydrated — see Following hydration loop).
  const refreshFollowedUser = useCallback(async (username: string) => {
    if (!sessionToken) throw new Error("Not authenticated");
    const result = await proxyFetchCollection({ sessionToken, username, skipPrivateFields: true });
    let userWants: WantItem[] = [];
    try {
      userWants = await proxyFetchWantlist({ sessionToken, username });
    } catch { /* wantlist may be unavailable — keep existing */ }
    setFollowedUsers((prev) => {
      const idx = prev.findIndex((f) => f.username.toLowerCase() === username.toLowerCase());
      if (idx < 0) return prev;
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        collection: result.albums,
        folders: result.folders,
        wants: userWants.length > 0 ? userWants : updated[idx].wants,
        hydrated: true,
        isPrivate: false,
      };
      return updated;
    });
  }, [sessionToken, proxyFetchCollection, proxyFetchWantlist]);

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
    opts: {
      background?: boolean;
      signals?: { num_collection: number; num_wantlist: number } | null;
      // When true, emit a toast summarizing what a background sync brought in.
      // Used by the auto background path (boot probe, sync-on-focus) — the
      // manual Sync Now and first-ever sync surface their own feedback.
      notify?: boolean;
    } = {}
  ): Promise<{ albums: number; folders: number; wants: number }> => {
    const { background = false, signals: probedSignals, notify = false } = opts;
    // Background syncs flip a separate flag so the loading-screen phase machine
    // (which watches isSyncing) never takes over the screen — the user keeps
    // browsing cached data while the cache freshens underneath them.
    const setSyncFlag = background ? setIsBackgroundSyncing : setIsSyncing;
    setSyncFlag(true);
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
        const { lastPlayedMap, countMap } = buildPlayMaps(lpData);
        setLastPlayed(lastPlayedMap);
        setPlayCounts(countMap);
        hydratedRef.current.lastPlayed = true;
      }

      // Write collection to Convex cache — incremental diff (insert/patch/delete)
      // so the cache never flashes empty mid-background-sync. The returned
      // counts drive the background-sync completion toast.
      setSyncProgress("Caching collection");
      let collDiff = { added: 0, removed: 0, updated: 0 };
      try {
        collDiff = await applyCollectionDiffMut({
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

      // Write wantlist to Convex cache — incremental diff (insert/patch/delete)
      let wantDiff = { added: 0, removed: 0, updated: 0 };
      try {
        wantDiff = await applyWantlistDiffMut({
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

      // Update lastSynced in Convex, persisting the raw Discogs counts so the
      // next cold load's probe can detect whether anything changed. Reuse the
      // counts from the probe that triggered this sync; otherwise fetch them.
      const syncSignals =
        probedSignals ??
        (await proxyFetchSyncSignals({ sessionToken: token, username }).catch(() => null));
      updateLastSyncedMut({
        sessionToken: token,
        collectionCount: syncSignals?.num_collection,
        wantlistCount: syncSignals?.num_wantlist,
      });

      // Following feed is no longer synced here — it syncs lazily in the
      // background when the user opens the Feed or Following screen (see
      // syncFollowingFeed), so it never blocks the collection sync.

      // Completion feedback for background syncs the user isn't watching.
      // Only adds/removes are worth a toast — in-place patches stay silent.
      if (notify) {
        let msg: string | null = null;
        if (collDiff.added > 0 && collDiff.removed === 0) {
          msg = `${collDiff.added} ${collDiff.added === 1 ? "record" : "records"} added.`;
        } else if (collDiff.removed > 0 && collDiff.added === 0) {
          msg = `${collDiff.removed} ${collDiff.removed === 1 ? "record" : "records"} removed.`;
        } else if (collDiff.added > 0 || collDiff.removed > 0) {
          msg = "Collection updated.";
        } else if (wantDiff.added > 0 || wantDiff.removed > 0) {
          msg = "Wantlist updated.";
        }
        if (msg) toast(msg);
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
      setSyncFlag(false);
    }
  }, [updateLastSyncedMut, applyCollectionDiffMut, applyWantlistDiffMut, updateCollectionValueMut, proxyFetchUserProfile, proxyFetchCollection, proxyFetchWantlist, proxyFetchCollectionValue, proxyFetchSyncSignals]);

  // ── Following feed sync (lazy + background) ──
  // Syncs the recent-activity feed for up to 25 followed users. Pulled out of
  // performSync so it never blocks the collection sync or the boot flow — it
  // runs in the background when the user opens the Feed or Following screen,
  // surfaced via isSyncingFollowing (the subtle chip), never the full screen.
  // Per-user 24h TTL skips users already fresh in the cache. forceRefresh
  // (manual Sync Now) bypasses the TTL.
  const followingFeedSyncInFlightRef = useRef(false);
  const syncFollowingFeed = useCallback(async (token: string, forceRefresh = false) => {
    if (followingFeedSyncInFlightRef.current) return;
    const followingList = followingRef.current;
    if (!followingList || followingList.length === 0) return;

    followingFeedSyncInFlightRef.current = true;
    setIsSyncingFollowing(true);
    try {
      const cachedFeed = followingFeedRef.current;
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

      const now = Date.now();
      const feedEntries: FollowingFeedEntry[] = [];

      // Pre-populate from cache for users we won't re-fetch
      if (cachedFeed) {
        for (const entry of cachedFeed) {
          feedEntries.push({
            followed_username: entry.followed_username,
            lastSyncedAt: entry.lastSyncedAt,
            recent_albums: entry.recent_albums as FeedAlbum[],
            recent_wants: (entry.recent_wants as FeedAlbum[] | undefined) ?? undefined,
          });
        }
      }

      for (let i = 0; i < sorted.length; i++) {
        const followedUser = sorted[i].following_username;

        if (!forceRefresh) {
          const lastSynced = cacheMap.get(followedUser);
          if (lastSynced && (now - lastSynced) < TWENTY_FOUR_HOURS) {
            // Bypass cache if stored data lacks master_id (pre-schema-change migration)
            // or is missing recent_wants (first-hydration for wantlist activity)
            const cachedEntry = cachedFeed?.find(e => e.followed_username === followedUser);
            const needsMasterIdMigration = cachedEntry?.recent_albums &&
              cachedEntry.recent_albums.length > 0 &&
              !cachedEntry.recent_albums.some((a: any) => a.master_id);
            const needsWantsMigration = cachedEntry?.recent_wants === undefined;
            if (!needsMasterIdMigration && !needsWantsMigration) {
              continue; // Cache is fresh and complete — skip
            }
          }
        }

        try {
          const [recentAlbums, recentWants] = await Promise.all([
            proxyFetchUserCollectionPage({ sessionToken: token, username: followedUser, page: 1, perPage: 50 }),
            proxyFetchUserWantlistPage({ sessionToken: token, username: followedUser, page: 1, perPage: 50 }),
          ]);
          await upsertFollowingFeedMut({
            sessionToken: token,
            followed_username: followedUser,
            recent_albums: recentAlbums,
            recent_wants: recentWants,
          });

          const existingIdx = feedEntries.findIndex(e => e.followed_username === followedUser);
          const entry: FollowingFeedEntry = {
            followed_username: followedUser,
            lastSyncedAt: Date.now(),
            recent_albums: recentAlbums,
            recent_wants: recentWants,
          };
          if (existingIdx >= 0) {
            feedEntries[existingIdx] = entry;
          } else {
            feedEntries.push(entry);
          }
          // Publish progress incrementally so the feed fills in as users resolve
          setFollowingFeed([...feedEntries]);
        } catch (e) {
          console.warn(`[FollowingFeed] Could not sync @${followedUser}:`, e);
        }

        // 1-second delay between Discogs fetches to respect rate limits
        if (i < sorted.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      setFollowingFeed(feedEntries);
    } catch (e) {
      console.warn("[FollowingFeed] Sync failed:", e);
    } finally {
      setIsSyncingFollowing(false);
      followingFeedSyncInFlightRef.current = false;
    }
  }, [TWENTY_FOUR_HOURS, proxyFetchUserCollectionPage, proxyFetchUserWantlistPage, upsertFollowingFeedMut]);

  // ── Background change-detection probe ──
  // One cheap request: compare the current Discogs collection/wantlist counts
  // against the counts stored at the last sync. If they match, skip the sync
  // entirely (the common "nothing changed" case). If they differ — or we've
  // never recorded counts — run a real sync in the background. Guards against
  // overlapping runs (boot probe vs sync-on-focus).
  const bgSyncInFlightRef = useRef(false);
  const maybeBackgroundSync = useCallback(async (
    username: string,
    token: string,
  ): Promise<"changed" | "unchanged" | "skipped"> => {
    if (bgSyncInFlightRef.current) return "skipped";
    bgSyncInFlightRef.current = true;
    try {
      const signals = await proxyFetchSyncSignals({ sessionToken: token, username });
      if (!signals) return "skipped"; // probe failed (offline / rate limit) — leave cache, retry

      const prevColl = convexUserRef.current?.last_collection_count
        ?? convexLatestUserRef.current?.last_collection_count ?? null;
      const prevWant = convexUserRef.current?.last_wantlist_count
        ?? convexLatestUserRef.current?.last_wantlist_count ?? null;

      const changed =
        prevColl == null || prevWant == null ||
        signals.num_collection !== prevColl ||
        signals.num_wantlist !== prevWant;

      if (!changed) return "unchanged"; // nothing changed — no sync needed

      await performSync(username, token, { background: true, signals, notify: true });
      return "changed";
    } catch (e) {
      console.warn("[Sync] Background change-check failed:", e);
      return "skipped";
    } finally {
      bgSyncInFlightRef.current = false;
    }
  }, [proxyFetchSyncSignals, performSync]);

  // Public manual refresh — the cheap probe path, used by the "last synced"
  // tap affordance. Gives explicit feedback even when nothing changed
  // (the silent auto paths don't). A real change is announced by performSync's
  // own completion toast, so we only add the "Up to date." case here.
  const refreshFromDiscogs = useCallback(async () => {
    if (!discogsUsername || !sessionToken) return;
    const result = await maybeBackgroundSync(discogsUsername, sessionToken);
    if (result === "unchanged") toast("Up to date.");
  }, [discogsUsername, sessionToken, maybeBackgroundSync]);

  // Sync-on-focus. When the PWA regains visibility (reopened after being
  // backgrounded), run the cheap change probe — not a full sync. Throttled so
  // rapid tab switches don't re-probe; the boot probe covers the first window.
  const FOCUS_PROBE_THROTTLE = 5 * 60 * 1000;
  const lastFocusProbeAtRef = useRef(Date.now());
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!initialSyncDoneRef.current) return; // boot handles the first probe
      if (!discogsUsername || !sessionToken) return;
      const now = Date.now();
      if (now - lastFocusProbeAtRef.current < FOCUS_PROBE_THROTTLE) return;
      lastFocusProbeAtRef.current = now;
      maybeBackgroundSync(discogsUsername, sessionToken);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [discogsUsername, sessionToken, maybeBackgroundSync]);

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

    // Manual Sync Now runs in the background (chip, not full screen) and is a
    // full sync — the escape hatch that catches in-place Discogs edits the
    // count probe can't see. Refresh the following feed too, forced.
    const stats = await performSync(username, sessionToken, { background: true });
    syncFollowingFeed(sessionToken, true);
    return stats;
  }, [discogsUsername, sessionToken, setDiscogsUsername, performSync, syncFollowingFeed, proxyFetchIdentity]);

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
    is_new: boolean;
  }) => {
    // Set session token and username
    setSessionToken(user.sessionToken);
    setDiscogsUsername(user.username);
    setUserAvatar(user.avatarUrl || "");
    setIsNewUser(user.is_new);

    // Mark initial sync as done (we're about to trigger it explicitly)
    initialSyncDoneRef.current = true;

    // Trigger initial Discogs sync via server-side proxy
    await performSync(user.username, user.sessionToken);
  }, [setDiscogsUsername, performSync, setSessionToken]);

  // ── Share Activity opt-in ──
  // shareActivity reads from whichever user record query has resolved.
  // showSharePrompt is derived — clears reactively once setShareActivity
  // patches the user record and Convex updates.
  const shareActivity = convexUser?.shareActivity ?? convexLatestUser?.shareActivity;
  const convexUserHasLoaded = !!discogsUsername && convexUser !== undefined;
  const showSharePrompt =
    !!discogsUsername &&
    !!sessionToken &&
    convexUserHasLoaded &&
    shareActivity === undefined;

  const setShareActivity = useCallback(async (value: boolean) => {
    if (!sessionToken) return;
    await setShareActivityMut({ sessionToken, shareActivity: value });
  }, [sessionToken, setShareActivityMut]);

  // ── Sign out ──

  const signOut = useCallback(() => {
    // Clear auth session from Convex (keep purge tags, stacks, etc.)
    if (sessionToken) {
      clearSessionMut({ sessionToken });
    }

    // Clear local auth state
    setSessionToken(null);
    setDiscogsUsername("");
    setIsNewUser(false);

    // Clear sessionStorage (transient OAuth bridge only)
    try {
      sessionStorage.removeItem("hg_oauth_token_secret");
    } catch { /* ignore */ }

    // Reset data state
    setAlbums([]);
    setWants([]);
    setStacks([]);
    setFollowedUsers([]);
    setFollowingFeed([]);
    setFolders([]);
    setSelectedAlbumId(null);
    setSelectedWantItem(null);
    setSelectedFeedAlbum(null);
    setCollectionCrossoverQueue([]);
    setSearchQuery("");
    setActiveFolder("All");
    setSortOption("added-new");
    setPurgeFilter("unrated");
    setWantFilter("all");
    setWantSearchQuery("");
    setLastSynced("");
    setSyncStats(null);
    setSyncProgress("");
    setLastPlayed({});
    setNeverPlayedFilter(false);
    setShowAlbumDetail(false);
    setShowFilterDrawer(false);
    setUserAvatar("");
    setUserProfile(null);
    setStackPickerAlbumId(null);
    setFirstStackJustCreated(false);
    setSyncFailed(false);
    setScreenRaw("feed"); // Navigate away from any authenticated-only screen
    setColorModeRaw("dark"); // Reset to dark so splash screen has no white flash

    // Prevent session restore from re-hydrating after explicit sign-out
    hasSignedOutRef.current = true;

    // Clear cached data
    clearCollectionValue();

    // Reset hydration flags
    hydratedRef.current = {
      purgeTags: false,
      stacks: false,
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
    setStacks([]);
    setFollowedUsers([]);
    setFollowingFeed([]);
    setFolders([]);
    setSelectedAlbumId(null);
    setSelectedWantItem(null);
    setSelectedFeedAlbum(null);
    setCollectionCrossoverQueue([]);
    setSearchQuery("");
    setActiveFolder("All");
    setSortOption("added-new");
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
    setShowAlbumDetail(false);
    setShowFilterDrawer(false);
    setUserAvatar("");
    setUserProfile(null);
    setStackPickerAlbumId(null);
    setFirstStackJustCreated(false);
    setSyncFailed(false);
    clearCollectionValue();
    try {
      sessionStorage.removeItem("hg_oauth_token_secret");
    } catch { /* ignore */ }

    // Prevent session restore from re-hydrating after data wipe
    hasSignedOutRef.current = true;

    hydratedRef.current = {
      purgeTags: false,
      stacks: false,
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

  // ── Stack Picker ──

  const openStackPicker = useCallback((albumId: string) => {
    // Auto-create "Saved for Later" stack if no stacks exist
    setStacks((prev) => {
      if (prev.length === 0) {
        const now = new Date().toISOString();
        const stackId = "s" + Date.now();
        const newStack: Stack = {
          id: stackId,
          name: "Saved for Later",
          albumIds: [albumId],
          createdAt: now.split("T")[0],
          lastModified: now,
        };
        setFirstStackJustCreated(true);
        // Persist to Convex
        if (sessionToken) {
          createStackMut({
            sessionToken,
            stack_id: stackId,
            name: "Saved for Later",
            album_ids: [Number(albumId)],
          });
        }
        return [newStack];
      }
      return prev;
    });
    setStackPickerAlbumId(albumId);
  }, [sessionToken, createStackMut]);

  const closeStackPicker = useCallback(() => {
    setStackPickerAlbumId(null);
    setFirstStackJustCreated(false);
  }, []);

  const isInStack = useCallback((albumId: string, stackId: string) => {
    const stack = stacks.find((s) => s.id === stackId);
    return stack ? stack.albumIds.includes(albumId) : false;
  }, [stacks]);

  const toggleAlbumInStack = useCallback((albumId: string, stackId: string) => {
    setStacks((prev) => {
      const stackIndex = prev.findIndex((s) => s.id === stackId);
      if (stackIndex === -1) return prev;

      const stack = prev[stackIndex];
      const now = new Date().toISOString();
      const albumIndex = stack.albumIds.indexOf(albumId);
      let newAlbumIds: string[];
      if (albumIndex === -1) {
        newAlbumIds = [...stack.albumIds, albumId];
      } else {
        newAlbumIds = stack.albumIds.filter((id) => id !== albumId);
      }

      // Persist to Convex
      if (sessionToken) {
        updateStackMut({
          sessionToken,
          stack_id: stackId,
          album_ids: newAlbumIds.map(Number),
        });
      }

      if (albumIndex === -1) {
        return [
          ...prev.slice(0, stackIndex),
          { ...stack, albumIds: newAlbumIds, lastModified: now },
          ...prev.slice(stackIndex + 1),
        ];
      } else {
        return [
          ...prev.slice(0, stackIndex),
          { ...stack, albumIds: newAlbumIds },
          ...prev.slice(stackIndex + 1),
        ];
      }
    });
  }, [sessionToken, updateStackMut]);

  const createStackDirect = useCallback((name: string, initialAlbumIds?: string[]) => {
    const now = new Date().toISOString();
    const stackId = "s" + Date.now();
    const newStack: Stack = {
      id: stackId,
      name,
      albumIds: initialAlbumIds || [],
      createdAt: now.split("T")[0],
      lastModified: now,
    };
    setStacks((prev) => [newStack, ...prev]);
    // Persist to Convex
    if (sessionToken) {
      createStackMut({
        sessionToken,
        stack_id: stackId,
        name,
        album_ids: (initialAlbumIds || []).map(Number),
      });
    }
    return stackId;
  }, [sessionToken, createStackMut]);

  const isAlbumInAnyStack = useCallback((albumId: string) => {
    return stacks.some((s) => s.albumIds.includes(albumId));
  }, [stacks]);

  const mostRecentStackId = useMemo(() => {
    if (stacks.length === 0) return null;
    return [...stacks].sort((a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    )[0].id;
  }, [stacks]);

  // ── Cached sync stats (derived from Convex queries, available before albums populates) ──

  const cachedSyncStats = useMemo<string[]>(() => {
    // Derived from Convex cache — available before albums state populates.
    // Stays non-empty as long as cache has data so the loading screen can
    // keep showing stats through all sync phases.
    if (!convexCollection || convexCollection.length === 0) return [];

    const cc = convexCollection;
    const stats: string[] = [];

    // 1. Total records
    stats.push(`You own ${cc.length} records`);

    // 2. Wantlist count
    const wantCount = convexWantlist?.length ?? 0;
    if (wantCount > 0) stats.push(`${wantCount} albums on your wantlist`);

    // 3 & 9. Decades
    const decades = new Set<string>();
    for (const r of cc) {
      if (r.year && r.year >= 1900) decades.add(`${Math.floor(r.year / 10) * 10}s`);
    }
    if (decades.size >= 2) stats.push(`Your collection spans ${decades.size} decades`);

    // 4. LP count
    const lpCount = cc.filter((r) => /\bLP\b/.test(r.format)).length;
    if (lpCount > 0) stats.push(`${lpCount} LPs in your collection`);

    // 5. Most collected artist
    const excludeArtists = new Set(["various", "various artists", "unknown artist", "unknown"]);
    const artistCounts: Record<string, number> = {};
    for (const r of cc) {
      const name = r.artist.replace(/\s*\(\d+\)$/, "");
      if (!excludeArtists.has(name.toLowerCase())) {
        artistCounts[name] = (artistCounts[name] || 0) + 1;
      }
    }
    const topArtist = Object.entries(artistCounts).sort((a, b) => b[1] - a[1])[0];
    if (topArtist && topArtist[1] >= 2) stats.push(`Your most collected artist is ${topArtist[0]}`);

    // 6. Most collected label
    const labelCounts: Record<string, number> = {};
    for (const r of cc) {
      if (r.label) labelCounts[r.label] = (labelCounts[r.label] || 0) + 1;
    }
    const topLabel = Object.entries(labelCounts).sort((a, b) => b[1] - a[1])[0];
    if (topLabel && topLabel[1] >= 2) stats.push(`Your most collected label is ${topLabel[0]}`);

    // 7 & 8. Played / unplayed
    if (convexLastPlayed && convexLastPlayed.length > 0) {
      const playedIds = new Set(convexLastPlayed.map((lp) => String(lp.release_id)));
      const playedCount = cc.filter((r) => playedIds.has(String(r.releaseId))).length;
      if (playedCount > 0) stats.push(`${playedCount} albums played so far`);
      const unplayedCount = cc.length - playedCount;
      if (unplayedCount > 0 && playedCount > 0) stats.push(`${unplayedCount} albums still unplayed`);
    }

    // 9. Oldest decade
    const sortedDecades = [...decades].sort();
    if (sortedDecades.length > 0) stats.push(`Your oldest decade is the ${sortedDecades[0]}`);

    // 10. Purge tag counts
    if (convexPurgeTags && convexPurgeTags.length > 0) {
      let keepCount = 0, cutCount = 0, maybeCount = 0;
      for (const t of convexPurgeTags) {
        if (t.tag === "keep") keepCount++;
        else if (t.tag === "cut") cutCount++;
        else if (t.tag === "maybe") maybeCount++;
      }
      const tagTotal = keepCount + cutCount + maybeCount;
      if (tagTotal > 0) {
        const parts: string[] = [];
        if (keepCount > 0) parts.push(`${keepCount} Keep`);
        if (cutCount > 0) parts.push(`${cutCount} Cut`);
        if (maybeCount > 0) parts.push(`${maybeCount} Maybe`);
        stats.push(`${tagTotal} albums tagged ${parts.join(" / ")}`);
      }
    }

    return stats;
  }, [convexCollection, convexWantlist, convexLastPlayed, convexPurgeTags]);

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
      stacks,
      followedUsers,
      addFollowedUser,
      refreshFollowedUser,
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
      effectiveSortOption,
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
      deleteStack,
      renameStack,
      reorderStackAlbums,
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
      playCounts,
      allPlayTimestamps,
      markPlayed,
      markPlayedAt,
      removePlay,
      neverPlayedFilter,
      setNeverPlayedFilter,
      playsRecordedFilter,
      setPlaysRecordedFilter,
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
      // Default collection sort
      defaultCollectionSort,
      setDefaultCollectionSort,
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
      isBackgroundSyncing,
      isSyncingFollowing,
      syncProgress,
      lastSynced,
      lastSyncedAt: convexUser?.last_synced_at ?? convexLatestUser?.last_synced_at ?? null,
      refreshFromDiscogs,
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
      // Stack Picker
      stackPickerAlbumId,
      openStackPicker,
      closeStackPicker,
      isInStack,
      toggleAlbumInStack,
      createStackDirect,
      isAlbumInAnyStack,
      mostRecentStackId,
      firstStackJustCreated,
      // Album instance editing
      updateAlbum,
      removeFromCollection,
      // Wantlist detail panel
      selectedWantItem,
      setSelectedWantItem,
      // Feed album detail panel
      selectedFeedAlbum,
      setSelectedFeedAlbum,
      // Following activity tab deep-link intent
      followingActivityTabIntent,
      setFollowingActivityTabIntent,
      addToCollection,
      // Wantlist crossover
      collectionCrossoverQueue,
      dismissCrossover,
      // OAuth / session management
      loginWithOAuth,
      signOut,
      isAuthenticated,
      isAuthLoading,
      isNewUser,
      // Share Activity opt-in
      shareActivity,
      showSharePrompt,
      setShareActivity,
      followingFeed,
      followingAvatars,
      cachedSyncStats,
      // Header callbacks
      onNewStack,
      setOnNewStack,
      onAddFollowedUser,
      setOnAddFollowedUser,
      followedUserProfile,
      setFollowedUserProfile,
      onBackFromProfile,
      setOnBackFromProfile,
      onUnfollowUser,
      setOnUnfollowUser,
    }),
    [
      screen, setScreen, viewMode, wantViewMode, albums, wants, stacks, followedUsers,
      addFollowedUser, refreshFollowedUser, removeFollowedUser,
      selectedAlbumId, selectedAlbum,
      searchQuery, activeFolder, sortOption, effectiveSortOption, filteredAlbums,
      setPurgeTag, deletePurgeTag, executePurgeCut, purgeProgress,
      toggleWantPriority, addToWantList, removeFromWantList,
      isInWants, isInCollection,
      deleteStack, renameStack, reorderStackAlbums,
      showFilterDrawer, showAlbumDetail,
      purgeFilter, wantFilter, wantSearchQuery,
      isDarkMode, toggleDarkMode, colorMode, setColorMode,
      lastPlayed, playCounts, allPlayTimestamps, markPlayed, markPlayedAt, removePlay,
      neverPlayedFilter,
      playsRecordedFilter,
      hidePurgeIndicators, setHidePurgeIndicators,
      hideGalleryMeta, setHideGalleryMeta,
      shakeToRandom, setShakeToRandom,
      defaultScreen, setDefaultScreen,
      defaultCollectionSort, setDefaultCollectionSort,
      folders, createFolder, renameFolder, deleteFolder, fetchFolders,
      sessionToken,
      discogsUsername, setDiscogsUsername,
      isSyncing, isBackgroundSyncing, isSyncingFollowing, syncProgress, lastSynced,
      convexUser, convexLatestUser, refreshFromDiscogs,
      syncFromDiscogs, syncStats,
      userAvatar, userProfile, updateProfileFn,
      clearPlayHistory, clearFollowedUsers, clearWantlistPriorities,
      wipeAllData,
      connectDiscogsRequested, requestConnectDiscogs, clearConnectDiscogsRequest,
      stackPickerAlbumId, openStackPicker, closeStackPicker,
      isInStack, toggleAlbumInStack, createStackDirect,
      isAlbumInAnyStack, mostRecentStackId, firstStackJustCreated,
      updateAlbum, removeFromCollection,
      selectedWantItem, selectedFeedAlbum, followingActivityTabIntent, addToCollection,
      collectionCrossoverQueue, dismissCrossover,
      loginWithOAuth, signOut, isAuthenticated, isAuthLoading, isNewUser,
      shareActivity, showSharePrompt, setShareActivity,
      followingFeed, followingAvatars, cachedSyncStats,
      onNewStack, onAddFollowedUser, followedUserProfile, onBackFromProfile, onUnfollowUser,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
