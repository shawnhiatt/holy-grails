import { useState, useEffect, useRef, useMemo, useCallback, type CSSProperties } from "react";
import { useAction, useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { motion } from "motion/react";
import { Disc3, ArrowLeft, Check, X, ScanBarcode, History, SlidersHorizontal } from "./icons";
// Bundled locally so the decoder never fetches from a CDN (PWA/CSP-safe);
// the module itself is dynamic-imported only when the scanner opens
import zxingWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { useApp } from "./app-context";
import { getContentTokens } from "./theme";
import { EASE_OUT, DURATION_NORMAL } from "./motion-tokens";
import type { FeedAlbum } from "./discogs-api";

/* DiscogsSearchSheet — "Look It Up"
   Standalone Discogs database search as a FULL-SCREEN panel (Discogs-app
   style): fixed search bar at the top, results scroll beneath, back button
   to dismiss — the bottom-sheet version put the keyboard on top of the
   panel. Master-first results with a drill-in pressing picker; barcode-like
   queries route to release search. When a master search comes up empty the
   fallback chain automatically retries as a release search, then with a
   normalized query (diacritics/dots stripped: "M.J." → "MJ", "João" →
   "Joao"). Tapping a pressing opens the existing ReleaseDetailPanel via
   setSelectedFeedAlbum. */

interface SearchResult {
  id: number;
  type: "master" | "release";
  masterId: number;
  title: string;
  artist: string;
  year: number;
  thumb: string;
  cover: string;
  label: string;
  catno: string;
  country: string;
  format: string;
  have: number;
  want: number;
}

interface SearchPage {
  results: SearchResult[];
  page: number;
  totalPages: number;
  totalItems: number;
}

// A resolved search remembers which step of the fallback chain produced the
// results, so Load More re-queries the same type/query
interface ResolvedSearch extends SearchPage {
  effType: "master" | "release";
  effQuery: string;
}

interface Version {
  releaseId: number;
  title: string;
  format: string;
  label: string;
  catno: string;
  country: string;
  year: number;
  thumb: string;
  inCollection: boolean;
  inWantlist: boolean;
  haveCount: number;
}

interface Facet {
  id: string;
  title: string;
  values: { value: string; title: string; count: number }[];
}

interface VersionsPage {
  versions: Version[];
  facets: Facet[];
  mainReleaseId: number;
  page: number;
  totalPages: number;
  totalItems: number;
}

const hasYear = (year: number | null | undefined): year is number =>
  year != null && year !== 0;

// Session-scoped result cache (mirrors the releaseDataCache pattern)
const searchCache = new Map<string, ResolvedSearch>();

// Barcode heuristic — a barcode uniquely identifies one release, so master
// search is the wrong endpoint for it; route straight to release search.
// Tuned for precision: long + almost-all-digits catches scanned/typed
// barcodes while leaving short numeric album titles ("2112", "90125") and
// letter-prefixed catalog numbers ("SKL 5025") to normal master search.
function isPressingQuery(q: string): boolean {
  const compact = q.replace(/[\s\-–.]/g, "");
  if (compact.length < 8) return false;
  const digits = compact.replace(/\D/g, "").length;
  return digits / compact.length >= 0.75;
}

// Forgiving-match fallback: strip diacritics and periods so "M.J. Lenderman"
// and "João" queries still land when Discogs indexes "MJ Lenderman"/"Joao"
function normalizeQuery(q: string): string {
  return q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Facet values arrive URL-encoded from the versions endpoint
// ("USA+%26+Canada" → "USA & Canada") — decode for display AND for the
// filter param (the proxy re-encodes it)
function decodeFacetValue(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

// One silent retry — Discogs throws transient 500s/429s on search
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, 800));
    return await fn();
  }
}

export function DiscogsSearchSheet({ onClose }: { onClose: () => void }) {
  const {
    sessionToken, isDarkMode, albums, wants, screen,
    setSelectedFeedAlbum, setShowAlbumDetail,
  } = useApp();
  const searchAction = useAction(api.discogs.proxySearchDatabase);
  const versionsAction = useAction(api.discogs.proxyFetchMasterVersions);
  const warmAction = useAction(api.discogs.warm);

  // Spin up the "use node" runtime while the user is still typing, so the
  // first search doesn't pay the container cold start on top of the query
  useEffect(() => {
    warmAction({}).catch(() => {});
  }, [warmAction]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [effSearch, setEffSearch] = useState<{ type: "master" | "release"; query: string } | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  // Bumped by the failed-search "Try again" tap — re-runs the search effect
  // without requiring the user to edit the query
  const [retryNonce, setRetryNonce] = useState(0);

  // Pressing picker state
  const [pickerMaster, setPickerMaster] = useState<SearchResult | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [facets, setFacets] = useState<Facet[]>([]);
  const [versionsPage, setVersionsPage] = useState(1);
  const [versionsTotalPages, setVersionsTotalPages] = useState(1);
  const [versionsTotal, setVersionsTotal] = useState(0);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [countryFilter, setCountryFilter] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const panelBg = isDarkMode ? "#101318" : "#F9F9FA";
  const [showScanner, setShowScanner] = useState(false);
  const cameraSupported = !!navigator.mediaDevices?.getUserMedia;

  // Recent queries — persisted per-user on the preferences doc (no localStorage)
  const prefs = useQuery(api.preferences.getByUsername, sessionToken ? { sessionToken } : "skip");
  const upsertPrefs = useMutation(api.preferences.upsert);
  const recentSearches = useMemo(() => prefs?.recent_searches ?? [], [prefs]);
  const recordRecent = useCallback((term: string) => {
    const t = term.trim();
    if (!sessionToken || t.length < 3) return;
    const next = [t, ...recentSearches.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 8);
    upsertPrefs({ sessionToken, recent_searches: next }).catch(() => {});
  }, [sessionToken, recentSearches, upsertPrefs]);
  const clearRecents = useCallback(() => {
    if (!sessionToken) return;
    upsertPrefs({ sessionToken, recent_searches: [] }).catch(() => {});
  }, [sessionToken, upsertPrefs]);

  // The bottom nav (z-130) stays tappable over this panel (z-85) — treat a
  // screen change as dismissal so the panel doesn't linger over the new screen
  const initialScreenRef = useRef(screen);
  useEffect(() => {
    if (screen !== initialScreenRef.current) onClose();
  }, [screen, onClose]);

  // O(1) in-collection / in-wantlist lookups by master_id (master rows)
  const ownMasterIds = useMemo(() => {
    const s = new Set<number>();
    for (const a of albums) if (a.master_id) s.add(a.master_id);
    return s;
  }, [albums]);
  const wantMasterIds = useMemo(() => {
    const s = new Set<number>();
    for (const w of wants) if (w.master_id) s.add(w.master_id);
    return s;
  }, [wants]);

  // Debounced search (500 ms, min 3 chars) driving an automatic fallback
  // chain: master → release → normalized master → normalized release.
  // First step with results wins; requestId guards staleness across awaits.
  const requestIdRef = useRef(0);
  useEffect(() => {
    const trimmed = query.trim();
    const requestId = ++requestIdRef.current;
    if (trimmed.length < 3 || !sessionToken) {
      setResults([]);
      setEffSearch(null);
      setHasSearched(false);
      setSearchError(false);
      setIsSearching(false);
      return;
    }
    const cacheKey = trimmed.toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (cached) {
      setResults(cached.results);
      setEffSearch({ type: cached.effType, query: cached.effQuery });
      setPage(cached.page);
      setTotalPages(cached.totalPages);
      setHasSearched(true);
      setSearchError(false);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    setSearchError(false);
    const timer = setTimeout(async () => {
      const steps: { type: "master" | "release"; q: string }[] = [];
      if (isPressingQuery(trimmed)) {
        steps.push({ type: "release", q: trimmed });
      } else {
        steps.push({ type: "master", q: trimmed }, { type: "release", q: trimmed });
        const norm = normalizeQuery(trimmed);
        if (norm.length >= 3 && norm.toLowerCase() !== trimmed.toLowerCase()) {
          steps.push({ type: "master", q: norm }, { type: "release", q: norm });
        }
      }
      try {
        let resolved: ResolvedSearch | null = null;
        for (const step of steps) {
          const data = (await withRetry(() =>
            searchAction({ sessionToken, query: step.q, searchType: step.type, page: 1 })
          )) as SearchPage;
          if (requestId !== requestIdRef.current) return;
          if (data.results.length > 0 || step === steps[steps.length - 1]) {
            resolved = { ...data, effType: step.type, effQuery: step.q };
            if (data.results.length > 0) break;
          }
        }
        if (!resolved || requestId !== requestIdRef.current) return;
        searchCache.set(cacheKey, resolved);
        setResults(resolved.results);
        setEffSearch({ type: resolved.effType, query: resolved.effQuery });
        setPage(resolved.page);
        setTotalPages(resolved.totalPages);
        setHasSearched(true);
      } catch {
        if (requestId !== requestIdRef.current) return;
        setSearchError(true);
        setHasSearched(true);
      } finally {
        if (requestId === requestIdRef.current) setIsSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [query, sessionToken, searchAction, retryNonce]);

  const loadMore = useCallback(() => {
    if (!sessionToken || !effSearch || isLoadingMore || page >= totalPages) return;
    setIsLoadingMore(true);
    searchAction({ sessionToken, query: effSearch.query, searchType: effSearch.type, page: page + 1 })
      .then((data) => {
        const pageData = data as SearchPage;
        setResults((prev) => [...prev, ...pageData.results]);
        setPage(pageData.page);
        setTotalPages(pageData.totalPages);
      })
      .catch(() => {})
      .finally(() => setIsLoadingMore(false));
  }, [sessionToken, effSearch, page, totalPages, isLoadingMore, searchAction]);

  // Pressing picker fetch
  const fetchVersions = useCallback((
    master: SearchResult,
    opts: { page: number; country: string | null; year: string | null; append: boolean }
  ) => {
    if (!sessionToken) return;
    setIsLoadingVersions(true);
    withRetry(() =>
      versionsAction({
        sessionToken,
        masterId: master.masterId,
        page: opts.page,
        country: opts.country ?? undefined,
        year: opts.year ?? undefined,
      })
    )
      .then((data) => {
        const vp = data as VersionsPage;
        setVersions((prev) => (opts.append ? [...prev, ...vp.versions] : vp.versions));
        if (!opts.append && vp.facets.length) setFacets(vp.facets);
        setVersionsPage(vp.page);
        setVersionsTotalPages(vp.totalPages);
        setVersionsTotal(vp.totalItems);
      })
      .catch(() => {})
      .finally(() => setIsLoadingVersions(false));
  }, [sessionToken, versionsAction]);

  const openPicker = useCallback((master: SearchResult) => {
    inputRef.current?.blur();
    setPickerMaster(master);
    setVersions([]);
    setFacets([]);
    setCountryFilter(null);
    setYearFilter(null);
    setShowFilters(false);
    setVersionsPage(1);
    setVersionsTotalPages(1);
    setVersionsTotal(0);
    fetchVersions(master, { page: 1, country: null, year: null, append: false });
  }, [fetchVersions]);

  const applyFilter = useCallback((country: string | null, year: string | null) => {
    if (!pickerMaster) return;
    setCountryFilter(country);
    setYearFilter(year);
    setVersions([]);
    fetchVersions(pickerMaster, { page: 1, country, year, append: false });
  }, [pickerMaster, fetchVersions]);

  // Hand off to the existing ReleaseDetailPanel
  const openRelease = useCallback((fa: FeedAlbum) => {
    inputRef.current?.blur();
    setSelectedFeedAlbum(fa);
    setShowAlbumDetail(true);
  }, [setSelectedFeedAlbum, setShowAlbumDetail]);

  const openVersion = useCallback((ver: Version) => {
    if (!pickerMaster) return;
    openRelease({
      release_id: ver.releaseId,
      master_id: pickerMaster.masterId,
      title: ver.title || pickerMaster.title,
      artist: pickerMaster.artist,
      year: ver.year,
      thumb: ver.thumb,
      cover: ver.thumb || pickerMaster.cover,
      label: ver.label,
      dateAdded: "",
    });
  }, [pickerMaster, openRelease]);

  const openSearchResult = useCallback((r: SearchResult) => {
    recordRecent(query);
    if (r.type === "master") {
      openPicker(r);
    } else {
      openRelease({
        release_id: r.id,
        master_id: r.masterId || undefined,
        title: r.title,
        artist: r.artist,
        year: r.year,
        thumb: r.thumb,
        cover: r.cover,
        label: r.label,
        dateAdded: "",
      });
    }
  }, [openPicker, openRelease, recordRecent, query]);

  const handleScanDetect = useCallback((code: string) => {
    setShowScanner(false);
    setQuery(code);
  }, []);

  // Pinned "most collected" pressing — max community have-count across
  // loaded, unfiltered versions
  const pinnedVersion = useMemo(() => {
    if (countryFilter || yearFilter || versions.length < 2) return null;
    let best: Version | null = null;
    for (const ver of versions) {
      if (!best || ver.haveCount > best.haveCount) best = ver;
    }
    return best && best.haveCount > 0 ? best : null;
  }, [versions, countryFilter, yearFilter]);

  // Filter chip options — facets when the API provides them, else derived.
  // Facet titles/values are decoded so encoded strings never reach the UI.
  const countryOptions = useMemo(() => {
    const facet = facets.find((f) => f.id.toLowerCase().includes("country"));
    if (facet) {
      return facet.values.slice(0, 8).map((x) => ({
        value: decodeFacetValue(x.value),
        label: decodeFacetValue(x.title || x.value),
      }));
    }
    const counts = new Map<string, number>();
    for (const ver of versions) {
      if (ver.country) counts.set(ver.country, (counts.get(ver.country) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map((e) => ({ value: e[0], label: e[0] }));
  }, [facets, versions]);

  const yearOptions = useMemo(() => {
    const facet = facets.find((f) => f.id.toLowerCase().includes("year") || f.id.toLowerCase().includes("released"));
    if (facet) {
      return facet.values.slice(0, 8).map((x) => ({
        value: decodeFacetValue(x.value),
        label: decodeFacetValue(x.title || x.value),
      }));
    }
    const years = new Set<string>();
    for (const ver of versions) if (hasYear(ver.year)) years.add(String(ver.year));
    return [...years].sort().slice(0, 8).map((y) => ({ value: y, label: y }));
  }, [facets, versions]);

  const chipStyle = (active: boolean): CSSProperties => ({
    fontSize: "12px",
    fontWeight: 500,
    padding: "5px 12px",
    borderRadius: "999px",
    whiteSpace: "nowrap",
    cursor: "pointer",
    touchAction: "manipulation",
    backgroundColor: active
      ? (isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)")
      : "var(--c-chip-bg)",
    color: active ? (isDarkMode ? "#ACDEF2" : "#00527A") : "var(--c-text-secondary)",
    border: "1px solid transparent",
  });

  const rowTitleStyle: CSSProperties = {
    display: "block",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    WebkitTextOverflow: "ellipsis" as never,
    maxWidth: "100%",
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--c-text)",
  };
  const rowMetaStyle: CSSProperties = {
    display: "block",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    WebkitTextOverflow: "ellipsis" as never,
    maxWidth: "100%",
    fontSize: "12px",
    color: "var(--c-text-muted)",
  };

  const badge = (label: string) => (
    <span
      className="flex items-center gap-1 flex-shrink-0"
      style={{ fontSize: "11px", fontWeight: 600, color: "#3E9842" }}
    >
      <Check size={12} weight="bold" />
      {label}
    </span>
  );

  const versionRow = (ver: Version, pinned: boolean) => (
    <button
      key={`${pinned ? "pin-" : ""}${ver.releaseId}`}
      onClick={() => openVersion(ver)}
      className="w-full flex items-center gap-3 px-4 py-2.5 tappable cursor-pointer text-left"
      style={{ touchAction: "manipulation" }}
    >
      {ver.thumb ? (
        <img src={ver.thumb} alt="" className="w-12 h-12 rounded-[6px] object-cover flex-shrink-0" style={{ border: "1px solid var(--c-border)" }} />
      ) : (
        <div className="w-12 h-12 rounded-[6px] flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: "var(--c-chip-bg)" }}>
          <Disc3 size={20} style={{ color: "var(--c-text-faint)" }} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        {pinned && (
          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", color: "#3E9842", textTransform: "uppercase" }}>
            Most collected
          </span>
        )}
        <span style={rowTitleStyle}>{ver.format || ver.title}</span>
        <span style={rowMetaStyle}>
          {[ver.label && `${ver.label}${ver.catno ? ` – ${ver.catno}` : ""}`, ver.country, hasYear(ver.year) ? ver.year : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      {ver.inCollection ? badge("Have") : ver.inWantlist ? badge("Want") : null}
    </button>
  );

  const searchingIndicator = (label: string) => (
    <div className="flex flex-col items-center gap-3 py-10">
      <Disc3 size={28} className="disc-spinner" style={{ color: "var(--c-text-muted)" }} />
      <span className="inline-flex" style={{ fontSize: "14px", color: "var(--c-text-muted)" }}>
        {label}
        <span aria-hidden className="inline-flex">
          <span>.</span>
          <span className="sync-dot-2">.</span>
          <span className="sync-dot-3">.</span>
        </span>
      </span>
    </div>
  );

  const loadMoreButton = (onClick: () => void, loading: boolean) => (
    <div className="flex justify-center py-3">
      <button
        onClick={onClick}
        className="tappable cursor-pointer px-5 py-2 rounded-[10px]"
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--c-text-secondary)",
          backgroundColor: "var(--c-chip-bg)",
          touchAction: "manipulation",
        }}
      >
        {loading ? <Disc3 size={16} className="disc-spinner" /> : "Load more"}
      </button>
    </div>
  );

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%", pointerEvents: "none" as const }}
      transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
      onAnimationComplete={(definition) => {
        if ((definition as { y?: number | string }).y === 0) {
          inputRef.current?.focus({ preventScroll: true });
          window.scrollTo(0, 0);
        }
      }}
      className="fixed inset-0 z-[85] flex flex-col"
      style={{
        height: "100dvh",
        backgroundColor: panelBg,
        ...getContentTokens(isDarkMode),
      } as CSSProperties}
    >
      {/* ── Fixed header: back + search bar (Discogs-app style, no divider) ── */}
      <div
        className="flex-shrink-0 px-3 pb-2"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)",
          borderBottom: pickerMaster ? "1px solid var(--c-border)" : undefined,
        }}
      >
        <div className="w-full max-w-[640px] mx-auto">
          {!pickerMaster ? (
            <div className="flex items-center gap-1">
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full flex items-center justify-center tappable cursor-pointer flex-shrink-0"
                style={{ color: "var(--c-text)", touchAction: "manipulation" }}
                aria-label="Close"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search artists, titles, catalog #s"
                  enterKeyHint="search"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full rounded-full pl-4 pr-10 py-2.5 outline-none"
                  style={{
                    fontSize: "16px",
                    backgroundColor: "var(--c-input-bg)",
                    color: "var(--c-text)",
                    border: "1px solid var(--c-border)",
                  }}
                />
                {query && (
                  <button
                    onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center tappable cursor-pointer"
                    style={{ color: "var(--c-text-muted)", touchAction: "manipulation" }}
                    aria-label="Clear search"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
              {cameraSupported && (
                <button
                  onClick={() => { inputRef.current?.blur(); setShowScanner(true); }}
                  className="w-10 h-10 rounded-full flex items-center justify-center tappable cursor-pointer flex-shrink-0"
                  style={{ color: "var(--c-text)", touchAction: "manipulation" }}
                  aria-label="Scan barcode"
                >
                  <ScanBarcode size={20} />
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Nav row: back left, filter disclosure right */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setPickerMaster(null)}
                  className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center tappable cursor-pointer flex-shrink-0"
                  style={{ color: "var(--c-text)", touchAction: "manipulation" }}
                  aria-label="Back to results"
                >
                  <ArrowLeft size={20} />
                </button>
                {(countryOptions.length > 1 || yearOptions.length > 1) && (
                  <button
                    onClick={() => setShowFilters((v) => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full tappable cursor-pointer flex-shrink-0"
                    style={{
                      fontSize: "13px",
                      fontWeight: 500,
                      touchAction: "manipulation",
                      backgroundColor: (countryFilter || yearFilter || showFilters)
                        ? (isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)")
                        : "var(--c-chip-bg)",
                      color: (countryFilter || yearFilter || showFilters)
                        ? (isDarkMode ? "#ACDEF2" : "#00527A")
                        : "var(--c-text-secondary)",
                    }}
                    aria-label="Filter pressings"
                  >
                    <SlidersHorizontal size={14} />
                    Filter
                    {(countryFilter || yearFilter) &&
                      ` · ${(countryFilter ? 1 : 0) + (yearFilter ? 1 : 0)}`}
                  </button>
                )}
              </div>

              {/* Hero: large artwork + identity */}
              <div className="flex items-center gap-4 pt-2 pb-3 px-1">
                {(pickerMaster.cover || pickerMaster.thumb) && (
                  <img
                    src={pickerMaster.cover || pickerMaster.thumb}
                    alt=""
                    className="w-28 h-28 rounded-[10px] object-cover flex-shrink-0"
                    style={{ border: "1px solid var(--c-border-strong)" }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <span
                    className="line-clamp-2"
                    style={{
                      fontSize: "22px",
                      fontWeight: 700,
                      fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                      letterSpacing: "-0.4px",
                      lineHeight: 1.2,
                      color: "var(--c-text)",
                    }}
                  >
                    {pickerMaster.title}
                  </span>
                  {pickerMaster.artist && (
                    <span className="block mt-1" style={{ ...rowMetaStyle, fontSize: "15px", fontWeight: 500, color: "var(--c-text-secondary)" }}>
                      {pickerMaster.artist}
                    </span>
                  )}
                  {versionsTotal > 0 && (
                    <span className="block mt-0.5" style={{ ...rowMetaStyle, fontSize: "13px" }}>
                      {versionsTotal} pressing{versionsTotal === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </div>

              {showFilters && (countryOptions.length > 1 || yearOptions.length > 1) && (
                <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-3 px-3 overlay-scroll" style={{ scrollbarWidth: "none" }}>
                  {countryOptions.map((c) => (
                    <button key={`c-${c.value}`} onClick={() => applyFilter(countryFilter === c.value ? null : c.value, yearFilter)} style={chipStyle(countryFilter === c.value)} className="tappable">
                      {c.label}
                    </button>
                  ))}
                  {yearOptions.map((y) => (
                    <button key={`y-${y.value}`} onClick={() => applyFilter(countryFilter, yearFilter === y.value ? null : y.value)} style={chipStyle(yearFilter === y.value)} className="tappable">
                      {y.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Scrollable results / picker body ── */}
      <div
        className="flex-1 overflow-y-auto overlay-scroll"
        onTouchStart={() => inputRef.current?.blur()}
        style={{ paddingBottom: "calc(54px + env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        <div className="w-full max-w-[640px] mx-auto">
          {!pickerMaster ? (
            <>
              {isSearching && searchingIndicator("Searching")}

              {!isSearching && searchError && (
                <p className="text-center py-10 px-4" style={{ fontSize: "14px", color: "var(--c-text-muted)" }}>
                  Search failed.{" "}
                  <button
                    onClick={() => setRetryNonce((n) => n + 1)}
                    className="tappable cursor-pointer"
                    style={{
                      fontSize: "inherit",
                      fontWeight: 600,
                      color: "var(--c-link)",
                      touchAction: "manipulation",
                    }}
                  >
                    Try again.
                  </button>
                </p>
              )}

              {!isSearching && !searchError && hasSearched && results.length === 0 && (
                <p className="text-center py-10 px-4" style={{ fontSize: "14px", color: "var(--c-text-muted)" }}>
                  No matches.
                </p>
              )}

              {/* Empty state (no query yet): centered intro + recent queries */}
              {!isSearching && !searchError && !hasSearched && (
                <div className="pt-1">
                  <div
                    className="flex items-center justify-center text-center px-10"
                    style={{ minHeight: recentSearches.length > 0 ? "180px" : "45vh" }}
                  >
                    <p style={{ fontSize: "17px", lineHeight: 1.55, fontWeight: 500, color: "var(--c-text-secondary)" }}>
                      Search the Discogs database
                      {cameraSupported && (
                        <>
                          {" or "}
                          <button
                            onClick={() => { inputRef.current?.blur(); setShowScanner(true); }}
                            className="tappable cursor-pointer"
                            style={{
                              fontSize: "inherit",
                              fontWeight: 600,
                              color: "var(--c-link)",
                              touchAction: "manipulation",
                            }}
                          >
                            scan a barcode
                          </button>
                        </>
                      )}
                      .
                    </p>
                  </div>
                  {recentSearches.length > 0 && (
                    <>
                      <div className="flex items-center justify-between px-4 pt-3 pb-1">
                        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--c-text-muted)", textTransform: "uppercase" }}>
                          Recent
                        </span>
                        <button
                          onClick={clearRecents}
                          className="tappable cursor-pointer"
                          style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-faint)", touchAction: "manipulation" }}
                        >
                          Clear
                        </button>
                      </div>
                      {recentSearches.map((term) => (
                        <button
                          key={term}
                          onClick={() => setQuery(term)}
                          className="w-full flex items-center gap-3 px-4 py-3 tappable cursor-pointer text-left"
                          style={{ touchAction: "manipulation" }}
                        >
                          <History size={16} style={{ color: "var(--c-text-faint)" }} />
                          <span
                            style={{
                              fontSize: "14px",
                              color: "var(--c-text)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {term}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}

              {!isSearching && !searchError && results.map((r) => (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => openSearchResult(r)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 tappable cursor-pointer text-left"
                  style={{ touchAction: "manipulation" }}
                >
                  {r.thumb ? (
                    <img src={r.thumb} alt="" className="w-12 h-12 rounded-[6px] object-cover flex-shrink-0" style={{ border: "1px solid var(--c-border)" }} />
                  ) : (
                    <div className="w-12 h-12 rounded-[6px] flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: "var(--c-chip-bg)" }}>
                      <Disc3 size={20} style={{ color: "var(--c-text-faint)" }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span style={rowTitleStyle}>{r.title}</span>
                    <span style={rowMetaStyle}>
                      {[
                        r.artist,
                        r.type === "release" ? [r.catno, r.country, hasYear(r.year) ? r.year : null].filter(Boolean).join(" · ") : (hasYear(r.year) ? r.year : null),
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  {r.masterId && ownMasterIds.has(r.masterId)
                    ? badge("Have")
                    : r.masterId && wantMasterIds.has(r.masterId)
                      ? badge("Want")
                      : null}
                </button>
              ))}

              {!isSearching && !searchError && results.length > 0 && page < totalPages &&
                loadMoreButton(loadMore, isLoadingMore)}
            </>
          ) : (
            <>
              {isLoadingVersions && versions.length === 0 && searchingIndicator("Finding pressings")}

              {!isLoadingVersions && versions.length === 0 && (
                <p className="text-center py-10 px-4" style={{ fontSize: "14px", color: "var(--c-text-muted)" }}>
                  No pressings found.
                </p>
              )}

              {pinnedVersion && versionRow(pinnedVersion, true)}
              {versions.filter((ver) => ver !== pinnedVersion).map((ver) => versionRow(ver, false))}

              {versions.length > 0 && versionsPage < versionsTotalPages &&
                loadMoreButton(
                  () => pickerMaster && fetchVersions(pickerMaster, { page: versionsPage + 1, country: countryFilter, year: yearFilter, append: true }),
                  isLoadingVersions
                )}
            </>
          )}
        </div>
      </div>

      {showScanner && (
        <BarcodeScanner onDetect={handleScanDetect} onClose={() => setShowScanner(false)} />
      )}
    </motion.div>
  );
}

/* Camera barcode scanner overlay. iOS Safari has no native BarcodeDetector,
   so frames are decoded with zxing-wasm (lazy-loaded, wasm served from our
   own origin). Vinyl barcodes are 1D EAN/UPC only. A detected code lands in
   the search box, where the barcode heuristic routes it to release search. */
function BarcodeScanner({ onDetect, onClose }: {
  onDetect: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: number | undefined;
    (async () => {
      try {
        const { prepareZXingModule, readBarcodes } = await import("zxing-wasm/reader");
        prepareZXingModule({
          overrides: {
            locateFile: (path: string, prefix: string) =>
              path.endsWith(".wasm") ? zxingWasmUrl : prefix + path,
          },
        });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const tick = async () => {
          if (stopped || !ctx) return;
          if (video.readyState >= 2 && video.videoWidth > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            try {
              const codes = await readBarcodes(
                ctx.getImageData(0, 0, canvas.width, canvas.height),
                { formats: ["EAN-13", "UPC-A", "EAN-8", "UPC-E"], tryHarder: true }
              );
              const hit = codes.find((c) => c.isValid && c.text);
              if (hit && !stopped) {
                onDetect(hit.text);
                return;
              }
            } catch {
              // Frame decode failure — keep scanning
            }
          }
          timer = window.setTimeout(tick, 220);
        };
        tick();
      } catch {
        // No camera, permission denied, or wasm load failure
        if (!stopped) setCameraError(true);
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetect]);

  return (
    <div className="absolute inset-0 z-20" style={{ backgroundColor: "#000" }}>
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
      />
      {!cameraError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div
            style={{
              width: "78%",
              maxWidth: "360px",
              aspectRatio: "1.9",
              border: "2px solid rgba(255,255,255,0.9)",
              borderRadius: "14px",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
            }}
          />
          <p className="mt-4" style={{ fontSize: "14px", fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>
            Point at the barcode
          </p>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-8">
          <p className="text-center" style={{ fontSize: "14px", color: "rgba(255,255,255,0.8)" }}>
            Camera unavailable.
          </p>
        </div>
      )}
      <button
        onClick={onClose}
        className="absolute rounded-full flex items-center justify-center tappable cursor-pointer"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 12px)",
          right: "16px",
          width: "36px",
          height: "36px",
          backgroundColor: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(6px)",
          color: "#FFFFFF",
          touchAction: "manipulation",
        }}
        aria-label="Close scanner"
      >
        <X size={18} />
      </button>
    </div>
  );
}
