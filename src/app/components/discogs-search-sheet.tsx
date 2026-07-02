import { useState, useEffect, useRef, useMemo, useCallback, type CSSProperties } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { motion } from "motion/react";
import { Disc3, Search, ArrowLeft, Check, X } from "lucide-react";
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
    sessionToken, isDarkMode, albums, wants,
    setSelectedFeedAlbum, setShowAlbumDetail,
  } = useApp();
  const searchAction = useAction(api.discogs.proxySearchDatabase);
  const versionsAction = useAction(api.discogs.proxyFetchMasterVersions);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [effSearch, setEffSearch] = useState<{ type: "master" | "release"; query: string } | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

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

  const inputRef = useRef<HTMLInputElement>(null);
  const panelBg = isDarkMode ? "#0C1A2E" : "#F9F9FA";

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
  }, [query, sessionToken, searchAction]);

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
  }, [openPicker, openRelease]);

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

  // Filter chip options — facets when the API provides them, else derived
  const countryOptions = useMemo(() => {
    const facet = facets.find((f) => f.id.toLowerCase().includes("country"));
    if (facet) return facet.values.slice(0, 8).map((x) => x.value);
    const counts = new Map<string, number>();
    for (const ver of versions) {
      if (ver.country) counts.set(ver.country, (counts.get(ver.country) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((e) => e[0]);
  }, [facets, versions]);

  const yearOptions = useMemo(() => {
    const facet = facets.find((f) => f.id.toLowerCase().includes("year") || f.id.toLowerCase().includes("released"));
    if (facet) return facet.values.slice(0, 8).map((x) => x.value);
    const years = new Set<string>();
    for (const ver of versions) if (hasYear(ver.year)) years.add(String(ver.year));
    return [...years].sort().slice(0, 8);
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
      <Check size={12} strokeWidth={2.5} />
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
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
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
                <Search
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--c-text-faint)" }}
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Artist, title, catalog #"
                  autoFocus
                  enterKeyHint="search"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full rounded-full pl-10 pr-10 py-2.5 outline-none"
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
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPickerMaster(null)}
                  className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center tappable cursor-pointer flex-shrink-0"
                  style={{ color: "var(--c-text)", touchAction: "manipulation" }}
                  aria-label="Back to results"
                >
                  <ArrowLeft size={20} />
                </button>
                {pickerMaster.thumb && (
                  <img src={pickerMaster.thumb} alt="" className="w-9 h-9 rounded-[6px] object-cover flex-shrink-0" style={{ border: "1px solid var(--c-border)" }} />
                )}
                <div className="flex-1 min-w-0">
                  <span style={{ ...rowTitleStyle, fontSize: "15px" }}>{pickerMaster.title}</span>
                  <span style={rowMetaStyle}>
                    {versionsTotal > 0 ? `${versionsTotal} pressing${versionsTotal === 1 ? "" : "s"}` : pickerMaster.artist}
                  </span>
                </div>
              </div>
              {(countryOptions.length > 1 || yearOptions.length > 1) && (
                <div className="flex gap-1.5 overflow-x-auto pt-2 -mx-3 px-3 overlay-scroll" style={{ scrollbarWidth: "none" }}>
                  {countryOptions.map((c) => (
                    <button key={`c-${c}`} onClick={() => applyFilter(countryFilter === c ? null : c, yearFilter)} style={chipStyle(countryFilter === c)} className="tappable">
                      {c}
                    </button>
                  ))}
                  {yearOptions.map((y) => (
                    <button key={`y-${y}`} onClick={() => applyFilter(countryFilter, yearFilter === y ? null : y)} style={chipStyle(yearFilter === y)} className="tappable">
                      {y}
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
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        <div className="w-full max-w-[640px] mx-auto">
          {!pickerMaster ? (
            <>
              {isSearching && (
                <div className="flex justify-center py-10">
                  <Disc3 size={28} className="disc-spinner" style={{ color: "var(--c-text-muted)" }} />
                </div>
              )}

              {!isSearching && searchError && (
                <p className="text-center py-10 px-4" style={{ fontSize: "14px", color: "var(--c-text-muted)" }}>
                  Search failed. Try again.
                </p>
              )}

              {!isSearching && !searchError && hasSearched && results.length === 0 && (
                <p className="text-center py-10 px-4" style={{ fontSize: "14px", color: "var(--c-text-muted)" }}>
                  No matches.
                </p>
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
              {isLoadingVersions && versions.length === 0 && (
                <div className="flex justify-center py-10">
                  <Disc3 size={28} className="disc-spinner" style={{ color: "var(--c-text-muted)" }} />
                </div>
              )}

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
    </motion.div>
  );
}
