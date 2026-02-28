import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Check, Minus, HelpCircle, Loader2, Trash2 } from "lucide-react";
import { motion, useMotionValue, useTransform, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useApp } from "./app-context";
import type { Album, PurgeTag } from "./discogs-api";
import { getCachedMarketData, fetchMarketData, removeFromCollection } from "./discogs-api";
import { getPriceAtCondition } from "./market-value";
import { purgeTagColor, purgeTagBg, purgeTagBorder, purgeTagLabel, purgeTagTint, purgeIndicatorColor, purgeToast } from "./purge-colors";
import { EASE_OUT, DURATION_NORMAL } from "./motion-tokens";
import { NoDiscogsCard } from "./no-discogs-card";

export function PurgeTracker() {
  const {
    albums, purgeFilter, setPurgeFilter, setPurgeTag, deletePurgeTag,
    setSelectedAlbumId, setShowAlbumDetail,
    discogsToken, discogsUsername, discogsAuth,
    isDarkMode, isAuthenticated, isSyncing, syncFromDiscogs, setScreen,
  } = useApp();

  const scrollRef = useRef<HTMLDivElement>(null);

  // Purge Cut dialog + execution state
  const [showPurgeCutDialog, setShowPurgeCutDialog] = useState(false);
  const [purgeProgress, setPurgeProgress] = useState<{
    running: boolean;
    current: number;
    total: number;
    failed: number[];
  } | null>(null);

  // Scroll to top when filter changes
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [purgeFilter]);

  const keepCount = albums.filter((a) => a.purgeTag === "keep").length;
  const cutCount = albums.filter((a) => a.purgeTag === "cut").length;
  const maybeCount = albums.filter((a) => a.purgeTag === "maybe").length;
  const unratedCount = albums.filter((a) => a.purgeTag === null).length;
  const totalCount = albums.length;
  const ratedCount = totalCount - unratedCount;
  const progress = totalCount > 0 ? (ratedCount / totalCount) * 100 : 0;

  const filteredAlbums = albums.filter((a) => {
    if (purgeFilter === "all") return true;
    if (purgeFilter === "unrated") return a.purgeTag === null;
    return a.purgeTag === purgeFilter;
  });

  // Cut pile value calculation — uses cached market data only
  const cutAlbums = useMemo(() => albums.filter((a) => a.purgeTag === "cut"), [albums]);
  const [cutValueLoading, setCutValueLoading] = useState(false);
  const [cutValueTrigger, setCutValueTrigger] = useState(0);

  const cutPileValue = useMemo(() => {
    // Read trigger to re-compute when data loads
    void cutValueTrigger;
    let total = 0;
    let pricedCount = 0;
    let unavailableCount = 0;
    let currency = "USD";
    for (const album of cutAlbums) {
      const cached = getCachedMarketData(album.release_id);
      if (!cached) {
        // Unpriced — no fetch has occurred yet
        continue;
      }
      const price = getPriceAtCondition(album, cached);
      if (price) {
        total += price.value;
        pricedCount++;
        currency = price.currency;
      } else {
        // Unavailable — fetch occurred but no condition-matched price
        unavailableCount++;
      }
    }
    return { total, pricedCount, unavailableCount, currency, albumCount: cutAlbums.length };
  }, [cutAlbums, cutValueTrigger]);

  // Auto-fetch prices for Cut albums when Cut filter is active (batched, rate-limited)
  useEffect(() => {
    if (purgeFilter !== "cut" || !discogsToken || cutAlbums.length === 0) return;
    let cancelled = false;

    const fetchBatch = async () => {
      const unfetched = cutAlbums.filter((a) => !getCachedMarketData(a.release_id));
      if (unfetched.length === 0) return;

      setCutValueLoading(true);
      for (const album of unfetched) {
        if (cancelled) break;
        try {
          await fetchMarketData(album.release_id, discogsToken);
          setCutValueTrigger((t) => t + 1);
        } catch (e) {
          console.warn("[Purge] Failed to fetch market data for", album.release_id);
        }
        // Rate limit: ~500ms between calls to stay well within 60/min
        if (!cancelled) await new Promise((r) => setTimeout(r, 500));
      }
      setCutValueLoading(false);
    };

    fetchBatch();
    return () => { cancelled = true; };
  }, [purgeFilter, cutAlbums, discogsToken]);

  // Background fetch pricing when an album is tagged as Cut
  const backgroundFetchForCut = useCallback(async (albumId: string) => {
    const album = albums.find((a) => a.id === albumId);
    if (!album || !discogsToken) return;
    if (getCachedMarketData(album.release_id)) return; // already cached
    try {
      await fetchMarketData(album.release_id, discogsToken);
      setCutValueTrigger((t) => t + 1);
    } catch (e) {
      console.warn("[Purge] Background fetch failed for", album.release_id);
    }
  }, [albums, discogsToken]);

  const handlePurgeTag = useCallback((albumId: string, tag: PurgeTag) => {
    setPurgeTag(albumId, tag);
    if (tag) {
      purgeToast(tag, isDarkMode);
      // If tagged as Cut, trigger background pricing fetch
      if (tag === "cut") {
        backgroundFetchForCut(albumId);
      }
    }
  }, [setPurgeTag, isDarkMode, backgroundFetchForCut]);

  const executePurgeCut = useCallback(async () => {
    if (!discogsAuth || !discogsUsername || isSyncing) return;
    setShowPurgeCutDialog(false);

    const toDelete = cutAlbums.slice(); // snapshot
    setPurgeProgress({ running: true, current: 0, total: toDelete.length, failed: [] });

    const failedIds: number[] = [];

    for (let i = 0; i < toDelete.length; i++) {
      const album = toDelete[i];
      setPurgeProgress({ running: true, current: i + 1, total: toDelete.length, failed: failedIds });
      try {
        await removeFromCollection(
          discogsUsername,
          album.folder_id,
          album.release_id,
          album.instance_id,
          discogsAuth
        );
        // Success (or 404 — already gone) — remove the purge tag
        deletePurgeTag(album.release_id);
      } catch (err) {
        console.error("[PurgeCut] Failed to remove", album.release_id, err);
        failedIds.push(album.release_id);
      }
      // 1 second delay between requests to respect Discogs rate limit
      if (i < toDelete.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    const removed = toDelete.length - failedIds.length;
    setPurgeProgress(null);

    // Summary toast
    if (failedIds.length === 0) {
      toast.success(`${removed} album${removed === 1 ? "" : "s"} removed.`);
    } else {
      toast.error(`${removed} of ${toDelete.length} removed. ${failedIds.length} failed.`);
    }

    // Navigate to collection immediately; re-sync in background so the
    // collection view reflects the deletions without blocking navigation.
    setScreen("crate");
    syncFromDiscogs().catch((err) => console.error("[PurgeCut] Re-sync failed:", err));
  }, [discogsAuth, discogsUsername, isSyncing, cutAlbums, deletePurgeTag, syncFromDiscogs, setScreen]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-[16px] lg:px-[24px] pt-[8px] pb-[4px] lg:pt-[16px] lg:pb-[17px]">
        <h2 className="screen-title" style={{ fontSize: "36px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.5px", lineHeight: 1.25, color: "var(--c-text)" }}>The Purge</h2>
        <p className="mt-0.5" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>Evaluate your collection</p>
      </div>

      {albums.length === 0 && !isAuthenticated ? (
        <NoDiscogsCard
          heading="Nothing to evaluate."
          subtext="Connect your Discogs collection to start rating your records."
        />
      ) : (
      <>
      <div className="flex-shrink-0 px-[16px] lg:px-[24px] py-[10px]">
        <div className="flex items-center justify-between mb-1.5">
          <span style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-secondary)" }}>{ratedCount} of {totalCount} evaluated — {Math.round(progress)}%</span>
          <span style={{ fontSize: "14px", fontWeight: 600, color: purgeTagColor("cut", isDarkMode) }}>{unratedCount > 0 ? `${unratedCount} still waiting for a verdict.` : "Every record has been evaluated. Rare discipline."}</span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--c-chip-bg)" }}>
          <motion.div
            className="h-full rounded-full overflow-hidden"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
          >
            <div className="h-full rounded-full" style={{ background: "linear-gradient(to right, #FF98DA, #ACDEF2, #3E9842)", width: `${progress > 0 ? (100 / progress) * 100 : 100}%` }} />
          </motion.div>
        </div>
      </div>

      <div className="flex-shrink-0 px-[16px] lg:px-[24px] pt-[4px] pb-[8px]">
        <div className="flex gap-1.5">
          <StatChip label="Total" tag="all" count={totalCount} isActive={purgeFilter === "all"} onClick={() => setPurgeFilter("all")} isDark={isDarkMode} />
          <StatChip label="Keep" tag="keep" count={keepCount} isActive={purgeFilter === "keep"} onClick={() => setPurgeFilter("keep")} isDark={isDarkMode} />
          <StatChip label="Maybe" tag="maybe" count={maybeCount} isActive={purgeFilter === "maybe"} onClick={() => setPurgeFilter("maybe")} isDark={isDarkMode} />
          <StatChip label="Cut" tag="cut" count={cutCount} isActive={purgeFilter === "cut"} onClick={() => setPurgeFilter("cut")} isDark={isDarkMode} />
          <StatChip label="Unrated" tag="unrated" count={unratedCount} isActive={purgeFilter === "unrated"} onClick={() => setPurgeFilter("unrated")} isDark={isDarkMode} />
        </div>
      </div>

      {/* Progress indicator during purge execution */}
      {purgeProgress && (
        <div className="flex-shrink-0 px-[16px] lg:px-[24px] pb-[8px]">
          <div className="rounded-[10px] py-3 px-4 flex items-center gap-3" style={{ backgroundColor: purgeTagBg("cut", isDarkMode), border: `1px solid ${purgeTagBorder("cut", isDarkMode)}` }}>
            <Loader2 size={16} className="animate-spin flex-shrink-0" style={{ color: purgeTagColor("cut", isDarkMode) }} />
            <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)" }}>
              Removing {purgeProgress.current} of {purgeProgress.total}...
            </span>
          </div>
        </div>
      )}

      {/* Cut value summary */}
      {purgeFilter === "cut" && cutAlbums.length > 0 && (
        <div className="flex-shrink-0 px-[16px] lg:px-[24px] pb-[12px]">
          <div className="rounded-[10px] py-3 px-4 text-center" style={{ backgroundColor: purgeTagBg("cut", isDarkMode), border: `1px solid ${purgeTagBorder("cut", isDarkMode)}` }}>
            {cutPileValue.pricedCount === 0 ? (
              /* No albums priced yet — don't show $0.00 */
              <>
                <p className="mt-1" style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text-secondary)" }}>
                  {cutValueLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin" /> Loading pricing estimates...
                    </span>
                  ) : (
                    "Browse your Cut records to load pricing estimates."
                  )}
                </p>
              </>
            ) : (
              /* At least one album priced — show the total */
              <>
                <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                  Your Cut pile is worth approximately
                </p>
                <p className="mt-1" style={{ fontSize: "28px", fontWeight: 700, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>
                  {cutPileValue.currency === "USD" ? "$" : cutPileValue.currency === "EUR" ? "\u20AC" : cutPileValue.currency === "GBP" ? "\u00A3" : ""}
                  {cutPileValue.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                {cutPileValue.pricedCount < cutPileValue.albumCount ? (
                  <p className="mt-1" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
                    {cutPileValue.pricedCount} of {cutPileValue.albumCount} Cut records priced — browse unpriced records to complete the estimate.
                    {cutValueLoading && <Loader2 size={10} className="inline-block animate-spin ml-1" />}
                  </p>
                ) : (
                  <p className="mt-0.5" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
                    At your copies' condition grades.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto overlay-scroll px-[16px] lg:px-[24px] pt-[0px]" style={{ paddingBottom: (purgeFilter === "cut" && cutCount > 0 && !purgeProgress) ? "24px" : "calc(24px + var(--nav-clearance, 0px))" }}>
        {filteredAlbums.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p style={{ fontSize: "14px", color: "var(--c-text-muted)" }}>
              {purgeFilter === "unrated" ? "Nothing left to evaluate. Whether you followed through is between you and your shelves."
                : purgeFilter === "cut" ? "No cuts yet. The hard part is deciding."
                : purgeFilter === "keep" ? "Nothing marked as a keeper yet."
                : purgeFilter === "maybe" ? "No maybes. Decisive."
                : "No albums in this category"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filteredAlbums.map((album) => (
              <SwipeableAlbumRow
                key={album.id}
                album={album}
                onTag={handlePurgeTag}
                onTap={() => { setSelectedAlbumId(album.id); setShowAlbumDetail(true); }}
                showPrice={purgeFilter === "cut"}
                priceTrigger={cutValueTrigger}
                isDark={isDarkMode}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pinned Purge Cut footer — visible when Cut filter is active */}
      {purgeFilter === "cut" && cutCount > 0 && !purgeProgress && (
        <div
          className="flex-shrink-0 px-[16px] lg:px-[24px] pt-3"
          style={{
            borderTop: "1px solid var(--c-border)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + var(--nav-clearance, 0px) + 8px)",
          }}
        >
          <button
            onClick={() => setShowPurgeCutDialog(true)}
            disabled={isSyncing}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-[10px] transition-colors"
            style={{
              backgroundColor: isSyncing ? "var(--c-chip-bg)" : "#EBFD00",
              color: isSyncing ? "var(--c-text-muted)" : "#0C284A",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            <Trash2 size={15} />
            Purge Cut ({cutCount})
          </button>
        </div>
      )}
      </>
      )}

      {/* Purge Cut confirmation dialog */}
      <AnimatePresence>
        {showPurgeCutDialog && (
          <PurgeCutDialog
            cutAlbums={cutAlbums}
            isDark={isDarkMode}
            onCancel={() => setShowPurgeCutDialog(false)}
            onConfirm={executePurgeCut}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export function PurgeCutDialog({
  cutAlbums,
  isDark,
  onCancel,
  onConfirm,
}: {
  cutAlbums: Album[];
  isDark: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const n = cutAlbums.length;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        className="fixed inset-0 bg-black/40"
        style={{ zIndex: 88 }}
        onClick={onCancel}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        className="fixed left-0 right-0 bottom-0 rounded-t-[20px] flex flex-col"
        style={{
          zIndex: 89,
          maxHeight: "75vh",
          backgroundColor: isDark ? "#132B44" : "#FFFFFF",
          boxShadow: isDark ? "0 -8px 32px rgba(0,0,0,0.3)" : "0 -8px 32px rgba(12,40,74,0.1)",
          "--c-text": isDark ? "#E2E8F0" : "#0C284A",
          "--c-text-secondary": isDark ? "#9EAFC2" : "#455B75",
          "--c-text-muted": isDark ? "#7D92A8" : "#6B7B8E",
          "--c-border-strong": isDark ? "#2D4A66" : "#74889C",
          "--c-surface": isDark ? "#132B44" : "#FFFFFF",
          "--c-chip-bg": isDark ? "#1A3350" : "#EFF1F3",
        } as React.CSSProperties}
      >
        {/* Grab handle */}
        <div className="flex justify-center py-3 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: isDark ? "#2D4A66" : "#D2D8DE" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--c-border-strong)" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>
            Purge Cut
          </h3>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ border: "1px solid var(--c-border-strong)", color: "var(--c-text-muted)" }}
          >
            <Minus size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
          <p style={{ fontSize: "14px", color: "var(--c-text-secondary)", lineHeight: 1.5, marginBottom: "16px" }}>
            This will permanently remove {n} album{n === 1 ? "" : "s"} from your Discogs collection. This cannot be undone.
          </p>
          <div className="flex flex-col gap-1">
            {cutAlbums.map((album) => (
              <div key={album.release_id} className="flex items-center gap-2.5 py-1.5">
                <div className="w-8 h-8 rounded-[6px] overflow-hidden flex-shrink-0">
                  <img src={album.cover} alt={album.title} className="w-full h-full object-cover" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>
                    {album.title}
                  </p>
                  <p style={{ fontSize: "12px", color: "var(--c-text-muted)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>
                    {album.artist}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex flex-col gap-2 px-4 pt-3"
          style={{
            borderTop: "1px solid var(--c-border-strong)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 8px)",
          }}
        >
          <button
            onClick={onConfirm}
            className="w-full py-3 rounded-[10px] flex items-center justify-center gap-2 transition-colors"
            style={{
              backgroundColor: "#EBFD00",
              color: "#0C284A",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            <Trash2 size={15} />
            Remove {n} album{n === 1 ? "" : "s"}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-3 rounded-[10px] transition-colors"
            style={{
              backgroundColor: "var(--c-chip-bg)",
              color: "var(--c-text-secondary)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: "14px",
              fontWeight: 500,
            }}
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </>
  );
}

function StatChip({ label, tag, count, isActive, onClick, isDark }: {
  label: string; tag: string; count: number; isActive: boolean; onClick: () => void; isDark: boolean;
}) {
  const color = purgeTagColor(tag, isDark);
  const bg = purgeTagBg(tag, isDark);
  const labelClr = purgeTagLabel(tag, isDark);

  return (
    <button onClick={onClick}
      className="flex flex-col items-center flex-1 py-2 rounded-[10px] border transition-all"
      style={{
        borderColor: isActive ? purgeTagBorder(tag, isDark) : "transparent",
        backgroundColor: isActive ? bg : "transparent",
      }}>
      <span style={{ fontSize: "18px", fontWeight: 600, color: isActive ? color : "var(--c-text-muted)" }}>{count}</span>
      <span className="mt-0.5" style={{ fontSize: "11px", fontWeight: 500, color: isActive ? labelClr : "var(--c-text-muted)" }}>{label}</span>
    </button>
  );
}

function SwipeableAlbumRow({ album, onTag, onTap, showPrice, priceTrigger, isDark }: {
  album: Album; onTag: (id: string, tag: PurgeTag) => void; onTap: () => void; showPrice?: boolean; priceTrigger?: number; isDark: boolean;
}) {
  const x = useMotionValue(0);
  const swipingRef = useRef(false);

  // Inline price for Cut albums
  const inlinePrice = useMemo(() => {
    if (!showPrice) return null;
    void priceTrigger;
    const cached = getCachedMarketData(album.release_id);
    return getPriceAtCondition(album, cached);
  }, [showPrice, album, priceTrigger]);

  const keepClr = purgeTagColor("keep", isDark ?? false);
  const cutClr = purgeTagColor("cut", isDark ?? false);
  const maybeClr = purgeTagColor("maybe", isDark ?? false);

  const keepBg = useTransform(x, [0, 100], ["rgba(62,152,66,0)", "rgba(62,152,66,0.1)"]);
  const cutSwipeBg = useTransform(x, [-100, 0], [purgeTagTint("cut", isDark ?? false), "rgba(0,0,0,0)"]);
  const keepOpacity = useTransform(x, [0, 60, 100], [0, 0, 1]);
  const cutOpacity = useTransform(x, [-100, -60, 0], [1, 0, 0]);

  const handleDragEnd = useCallback((_: any, info: { offset: { x: number } }) => {
    if (info.offset.x > 80) onTag(album.id, "keep");
    else if (info.offset.x < -80) onTag(album.id, "cut");
    setTimeout(() => { swipingRef.current = false; }, 150);
  }, [album.id, onTag]);

  return (
    <div className="relative rounded-[10px] overflow-hidden">
      <motion.div className="absolute inset-0 flex items-center justify-start pl-4 rounded-[10px]" style={{ backgroundColor: keepBg }}>
        <motion.div className="flex items-center gap-1.5" style={{ opacity: keepOpacity }}>
          <Check size={20} style={{ color: keepClr }} />
          <span style={{ color: keepClr, fontSize: "12px", fontWeight: 500 }}>Keep</span>
        </motion.div>
      </motion.div>
      <motion.div className="absolute inset-0 flex items-center justify-end pr-4 rounded-[10px]" style={{ backgroundColor: cutSwipeBg }}>
        <motion.div className="flex items-center gap-1.5" style={{ opacity: cutOpacity }}>
          <span style={{ color: cutClr, fontSize: "12px", fontWeight: 500 }}>Cut</span>
          <Minus size={20} style={{ color: cutClr }} />
        </motion.div>
      </motion.div>

      <motion.div
        drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.5}
        onDragStart={() => { swipingRef.current = true; }} onDragEnd={handleDragEnd} style={{ x }}
        className="flex items-center gap-3 p-2.5 rounded-[10px] relative cursor-grab active:cursor-grabbing"
        onClick={() => { if (!swipingRef.current) onTap(); }}
        {...{ style: { x, backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" } }}
      >
        {album.purgeTag && (
          <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ backgroundColor: purgeIndicatorColor(album.purgeTag, isDark ?? false) }} />
        )}
        <div className="w-12 h-12 rounded-[8px] overflow-hidden flex-shrink-0 ml-1">
          <img src={album.cover} alt={album.title} className="w-full h-full object-cover" draggable={false} />
        </div>
        <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
          <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{album.title}</p>
          <p style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-tertiary)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{album.artist}</p>
        </div>
        {showPrice && inlinePrice && (
          <span
            className="flex-shrink-0 px-1.5 py-0.5 rounded-[6px] mr-0.5"
            style={{
              fontSize: "12px",
              fontWeight: 600,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              color: "var(--c-text-muted)",
              backgroundColor: "var(--c-chip-bg)",
            }}
          >
            {inlinePrice.currency === "USD" ? "$" : inlinePrice.currency === "EUR" ? "\u20AC" : inlinePrice.currency === "GBP" ? "\u00A3" : ""}
            {Math.round(inlinePrice.value)}
          </span>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onTag(album.id, album.purgeTag === "keep" ? null : "keep"); }}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ backgroundColor: album.purgeTag === "keep" ? purgeTagTint("keep", isDark ?? false) : "var(--c-chip-bg)", color: album.purgeTag === "keep" ? keepClr : "var(--c-text-faint)" }}>
            <Check size={14} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onTag(album.id, album.purgeTag === "maybe" ? null : "maybe"); }}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ backgroundColor: album.purgeTag === "maybe" ? purgeTagTint("maybe", isDark ?? false) : "var(--c-chip-bg)", color: album.purgeTag === "maybe" ? maybeClr : "var(--c-text-faint)" }}>
            <HelpCircle size={14} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onTag(album.id, album.purgeTag === "cut" ? null : "cut"); }}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ backgroundColor: album.purgeTag === "cut" ? purgeTagTint("cut", isDark ?? false) : "var(--c-chip-bg)", color: album.purgeTag === "cut" ? cutClr : "var(--c-text-faint)" }}>
            <Minus size={14} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}