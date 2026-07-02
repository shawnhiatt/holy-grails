import { useState, useEffect, useRef, useMemo, useCallback, type CSSProperties } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Disc3, Search, ArrowLeft, Check } from "lucide-react";
import { SlideOutPanel } from "./slide-out-panel";
import { useApp } from "./app-context";
import type { FeedAlbum } from "./discogs-api";

/* DiscogsSearchSheet — "Look It Up"
   Standalone Discogs database search. Master-first results with a drill-in
   pressing picker; digit-heavy queries (catalog # / barcode) go straight to
   release search. Tapping a pressing opens the existing ReleaseDetailPanel
   via setSelectedFeedAlbum. */

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
const searchCache = new Map<string, SearchPage>();

// Catalog # / barcode heuristic — digit-heavy queries identify an exact
// pressing, so skip the master hop entirely
function isPressingQuery(q: string): boolean {
  const compact = q.replace(/[\s\-–.]/g, "");
  if (compact.length < 5) return false;
  const digits = compact.replace(/\D/g, "").length;
  return digits / compact.length >= 0.6;
}

export function DiscogsSearchSheet({ onClose }: { onClose: () => void }) {
  const {
    sessionToken, isDarkMode, albums, wants,
    setSelectedFeedAlbum, setShowAlbumDetail,
  } = useApp();
  const searchAction = useAction(api.discogs.proxySearchDatabase);
  const versionsAction = useAction(api.discogs.proxyFetchMasterVersions);

  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<"master" | "release">("master");
  const [results, setResults] = useState<SearchResult[]>([]);
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

  const surfaceBg = isDarkMode ? "#091E34" : "#FFFFFF";

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

  // Debounced search (500 ms, min 3 chars, stale-guarded)
  const requestIdRef = useRef(0);
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3 || !sessionToken) {
      setResults([]);
      setHasSearched(false);
      setSearchError(false);
      setIsSearching(false);
      return;
    }
    const type = isPressingQuery(trimmed) ? "release" : searchType;
    const cacheKey = `${type}|${trimmed.toLowerCase()}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
      setResults(cached.results);
      setPage(cached.page);
      setTotalPages(cached.totalPages);
      setHasSearched(true);
      setSearchError(false);
      setIsSearching(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsSearching(true);
    setSearchError(false);
    const timer = setTimeout(() => {
      searchAction({ sessionToken, query: trimmed, searchType: type, page: 1 })
        .then((data) => {
          if (requestId !== requestIdRef.current) return;
          const pageData = data as SearchPage;
          searchCache.set(cacheKey, pageData);
          setResults(pageData.results);
          setPage(pageData.page);
          setTotalPages(pageData.totalPages);
          setHasSearched(true);
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return;
          setSearchError(true);
          setHasSearched(true);
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setIsSearching(false);
        });
    }, 500);
    return () => clearTimeout(timer);
  }, [query, searchType, sessionToken, searchAction]);

  const loadMore = useCallback(() => {
    const trimmed = query.trim();
    if (!sessionToken || isLoadingMore || page >= totalPages) return;
    const type = isPressingQuery(trimmed) ? "release" : searchType;
    setIsLoadingMore(true);
    searchAction({ sessionToken, query: trimmed, searchType: type, page: page + 1 })
      .then((data) => {
        const pageData = data as SearchPage;
        setResults((prev) => [...prev, ...pageData.results]);
        setPage(pageData.page);
        setTotalPages(pageData.totalPages);
      })
      .catch(() => {})
      .finally(() => setIsLoadingMore(false));
  }, [query, searchType, sessionToken, page, totalPages, isLoadingMore, searchAction]);

  // Pressing picker fetch
  const fetchVersions = useCallback((
    master: SearchResult,
    opts: { page: number; country: string | null; year: string | null; append: boolean }
  ) => {
    if (!sessionToken) return;
    setIsLoadingVersions(true);
    versionsAction({
      sessionToken,
      masterId: master.masterId,
      page: opts.page,
      country: opts.country ?? undefined,
      year: opts.year ?? undefined,
    })
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

  return (
    <SlideOutPanel
      onClose={onClose}
      title="Look It Up"
      backdropZIndex={80}
      sheetZIndex={85}
    >
      {!pickerMaster ? (
        <>
          {/* Sticky search input */}
          <div
            className="sticky top-0 z-10 px-4 pb-3"
            style={{ backgroundColor: surfaceBg }}
          >
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--c-text-faint)" }}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Artist, title, catalog #"
                className="w-full rounded-[10px] pl-9 pr-4 py-2.5 outline-none"
                style={{
                  fontSize: "16px",
                  backgroundColor: "var(--c-input-bg)",
                  color: "var(--c-text)",
                  border: "1px solid var(--c-border)",
                }}
              />
            </div>
          </div>

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
            <div className="text-center py-10 px-4">
              <p style={{ fontSize: "14px", color: "var(--c-text-muted)" }}>No matches.</p>
              {searchType === "master" && (
                <button
                  onClick={() => setSearchType("release")}
                  className="mt-3 tappable cursor-pointer"
                  style={{ fontSize: "13px", fontWeight: 600, color: "var(--c-link)", touchAction: "manipulation" }}
                >
                  Search pressings instead
                </button>
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

          {!isSearching && !searchError && results.length > 0 && page < totalPages && (
            <div className="flex justify-center py-3 pb-6">
              <button
                onClick={loadMore}
                className="tappable cursor-pointer px-5 py-2 rounded-[10px]"
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--c-text-secondary)",
                  backgroundColor: "var(--c-chip-bg)",
                  touchAction: "manipulation",
                }}
              >
                {isLoadingMore ? <Disc3 size={16} className="disc-spinner" /> : "Load more"}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Picker header — back + master identity */}
          <div
            className="sticky top-0 z-10 px-4 pb-2"
            style={{ backgroundColor: surfaceBg }}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPickerMaster(null)}
                className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center tappable cursor-pointer flex-shrink-0"
                style={{ color: "var(--c-text)", touchAction: "manipulation" }}
                aria-label="Back to results"
              >
                <ArrowLeft size={18} />
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
            {/* Filter chips */}
            {(countryOptions.length > 1 || yearOptions.length > 1) && (
              <div className="flex gap-1.5 overflow-x-auto pt-2 -mx-4 px-4 overlay-scroll" style={{ scrollbarWidth: "none" }}>
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
          </div>

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

          {versions.length > 0 && versionsPage < versionsTotalPages && (
            <div className="flex justify-center py-3 pb-6">
              <button
                onClick={() => pickerMaster && fetchVersions(pickerMaster, { page: versionsPage + 1, country: countryFilter, year: yearFilter, append: true })}
                className="tappable cursor-pointer px-5 py-2 rounded-[10px]"
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--c-text-secondary)",
                  backgroundColor: "var(--c-chip-bg)",
                  touchAction: "manipulation",
                }}
              >
                {isLoadingVersions ? <Disc3 size={16} className="disc-spinner" /> : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
      <div style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }} />
    </SlideOutPanel>
  );
}
