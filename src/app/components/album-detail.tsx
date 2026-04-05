import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type React from "react";
import { X, Check, Plus, Play, Pencil, Zap, Disc3, Heart, Star, GalleryVerticalEnd, ChevronLeft, ChevronRight, History, Gavel } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SlideOutPanel } from "./slide-out-panel";
import { toast } from "sonner";
import { useApp } from "./app-context";

import { purgeTagColor as getPurgeColor, purgeTagTint, purgeButtonBg, purgeButtonText, purgeToast, purgeClearToast } from "./purge-colors";
import { formatDateShort, isToday } from "./last-played-utils";
import { EASE_OUT, EASE_IN_OUT, DURATION_FAST, DURATION_NORMAL, DURATION_SLOW } from "./motion-tokens";
import { CONDITION_GRADES, type WantItem, type FeedAlbum } from "./discogs-api";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { conditionGradeColor as conditionColor } from "../../lib/condition-colors";

const hasYear = (year: number | null | undefined): year is number =>
  year != null && year !== 0;

/* Bottom sheet safe area standard:
   - Outer container bottom: 0, paddingBottom: env(safe-area-inset-bottom, 16px)
   - Inner scroll content paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 120px)
   - Ensures no gap on notched iOS devices in PWA mode */

interface EditFields {
  mediaCondition: string;
  sleeveCondition: string;
  notes: string;
  folder: string;
  customFields: { name: string; value: string; fieldId?: number; type?: string; options?: string[] }[];
}

/* ─── Enriched release data types + cache ─── */

interface ReleaseData {
  country: string;
  notes: string;
  tracklist: { position: string; title: string; duration: string }[];
  credits: { role: string; name: string }[];
  community: {
    rating: number | null;
    ratingCount: number;
    have: number;
    want: number;
  } | null;
  identifiers: { type: string; value: string }[];
  genres: string[];
  styles: string[];
  images?: Array<{
    uri: string;
    uri150: string;
    type: "primary" | "secondary";
    width: number;
    height: number;
  }>;
}

// In-memory cache keyed by release_id — persists across panel open/close within the same app session
const releaseDataCache = new Map<number, ReleaseData>();

export function AlbumDetailPanel({ hideHeader = false, hideImage = false }: { hideHeader?: boolean; hideImage?: boolean }) {
  const {
    selectedAlbum, setShowAlbumDetail, setSelectedAlbumId, setPurgeTag, sessionToken,
    lastPlayed, markPlayed, markPlayedAt, isDarkMode,
    // Session picker
    isAlbumInAnySession, mostRecentSessionId,
    // Inline session list
    sessions,
    isInSession, toggleAlbumInSession, createSessionDirect,
    // Edit
    albums, isSyncing, discogsUsername, updateAlbum, removeFromCollection,
    folders,
    // Wantlist detail
    selectedWantItem, setSelectedWantItem,
    // Feed album detail
    selectedFeedAlbum, setSelectedFeedAlbum,
    // Wantlist add
    isInWants, isInCollection, addToWantList, addToCollection,
  } = useApp();
  const proxyUpdateInstance = useAction(api.discogs.proxyUpdateCollectionInstance);
  const proxyMoveToFolder = useAction(api.discogs.proxyMoveToFolder);
  const proxyFetchRelease = useAction(api.discogs.proxyFetchRelease);
  const [justPlayed, setJustPlayed] = useState(false);

  // Inline session list state
  const [sessionListExpanded, setSessionListExpanded] = useState(false);
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const newSessionInputRef = useRef<HTMLInputElement>(null);
  const autoCheckedRef = useRef<string | null>(null);

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editFields, setEditFields] = useState<EditFields>({
    mediaCondition: "",
    sleeveCondition: "",
    notes: "",
    folder: "",
    customFields: [],
  });
  const [isSaving, setIsSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isAddingToWantlist, setIsAddingToWantlist] = useState(false);

  // Enriched release data state
  const [releaseData, setReleaseData] = useState<ReleaseData | null>(null);
  const [isLoadingRelease, setIsLoadingRelease] = useState(false);

  // Enriched content tab state
  const [activeTab, setActiveTab] = useState<'tracklist' | 'credits' | 'pressing' | 'identifiers'>('tracklist');

  // Tab bar sticky sentinel
  const tabSentinelRef = useRef<HTMLDivElement>(null);
  const [tabBarStuck, setTabBarStuck] = useState(false);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Reset all state when album changes
  useEffect(() => {
    setJustPlayed(false);
    setSessionListExpanded(false);
    setShowNewSession(false);
    setNewSessionName("");
    autoCheckedRef.current = null;
    setIsEditMode(false);
    setIsSaving(false);
    setConfirmRemove(false);
    setIsRemoving(false);
    setActiveTab('tracklist');
    setLightboxOpen(false);
    setLightboxIndex(0);
    setTabBarStuck(false);
  }, [selectedAlbum?.id]);

  // IntersectionObserver for tab bar sticky padding
  useEffect(() => {
    const sentinel = tabSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setTabBarStuck(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [selectedAlbum?.id]);

  // Fetch enriched release data when album changes
  useEffect(() => {
    if (!selectedAlbum || !sessionToken) {
      setReleaseData(null);
      setIsLoadingRelease(false);
      return;
    }

    const releaseId = selectedAlbum.release_id;

    // Check cache first
    const cached = releaseDataCache.get(releaseId);
    if (cached) {
      setReleaseData(cached);
      setIsLoadingRelease(false);
      return;
    }

    let stale = false;
    setIsLoadingRelease(true);
    setReleaseData(null);

    proxyFetchRelease({ sessionToken, releaseId })
      .then((data) => {
        if (stale) return;
        const rd = data as ReleaseData;
        releaseDataCache.set(releaseId, rd);
        setReleaseData(rd);
      })
      .catch((err) => {
        if (stale) return;
        console.warn("[AlbumDetail] Release fetch failed:", err);
        // Silently suppress — panel works fine without enriched data
      })
      .finally(() => {
        if (!stale) setIsLoadingRelease(false);
      });

    return () => { stale = true; };
  }, [selectedAlbum?.release_id, sessionToken]);

  // Auto-correct activeTab when releaseData loads if current tab has no data
  useEffect(() => {
    if (!releaseData) return;
    const tabHasData: Record<string, boolean> = {
      tracklist: releaseData.tracklist.length > 0,
      credits: releaseData.credits.length > 0,
      pressing: releaseData.notes.length > 0,
      identifiers: releaseData.identifiers.length > 0,
    };
    if (!tabHasData[activeTab]) {
      const firstWithData = (['tracklist', 'credits', 'pressing', 'identifiers'] as const).find(t => tabHasData[t]);
      if (firstWithData) setActiveTab(firstWithData);
    }
  }, [releaseData]);

  // Enter edit mode — initialize form fields from current album
  const enterEditMode = useCallback(() => {
    if (!selectedAlbum) return;
    setEditFields({
      mediaCondition: selectedAlbum.mediaCondition || "",
      sleeveCondition: selectedAlbum.sleeveCondition || "",
      notes: selectedAlbum.notes || "",
      folder: selectedAlbum.folder || "",
      customFields: (selectedAlbum.customFields || []).map(cf => ({ ...cf })),
    });
    setIsEditMode(true);
  }, [selectedAlbum]);

  // Cancel edit — revert to view mode
  const cancelEdit = useCallback(() => {
    setIsEditMode(false);
    setIsSaving(false);
    setConfirmRemove(false);
  }, []);

  // Available folders for the move-to-folder dropdown (exclude "All" virtual folder)
  const folderOptions = useMemo(() =>
    folders
      .filter((f) => f.id > 0)
      .map((f) => ({ name: f.name, id: f.id }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [folders]
  );

  // Save handler
  const handleSave = useCallback(async () => {
    if (!selectedAlbum || !sessionToken || !discogsUsername) return;
    setIsSaving(true);

    try {
      const fieldsChanged: { mediaCondition?: string; sleeveCondition?: string; notes?: string } = {};
      let conditionOrNotesChanged = false;

      if (editFields.mediaCondition !== selectedAlbum.mediaCondition) {
        fieldsChanged.mediaCondition = editFields.mediaCondition;
        conditionOrNotesChanged = true;
      }
      if (editFields.sleeveCondition !== selectedAlbum.sleeveCondition) {
        fieldsChanged.sleeveCondition = editFields.sleeveCondition;
        conditionOrNotesChanged = true;
      }
      if (editFields.notes !== selectedAlbum.notes) {
        fieldsChanged.notes = editFields.notes;
        conditionOrNotesChanged = true;
      }

      // Detect custom field changes
      const origCustomFields = selectedAlbum.customFields || [];
      const changedCustomFields: { fieldId: number; value: string }[] = [];
      for (let i = 0; i < editFields.customFields.length; i++) {
        const edited = editFields.customFields[i];
        const orig = origCustomFields[i];
        if (orig && edited.value !== orig.value && edited.fieldId) {
          changedCustomFields.push({ fieldId: edited.fieldId, value: edited.value });
        }
      }
      const customFieldsChanged = changedCustomFields.length > 0;

      const folderChanged = editFields.folder !== selectedAlbum.folder;
      const newFolderEntry = folderOptions.find(f => f.name === editFields.folder);

      if (conditionOrNotesChanged || customFieldsChanged) {
        await proxyUpdateInstance({
          sessionToken,
          username: discogsUsername,
          folderId: selectedAlbum.folder_id,
          releaseId: selectedAlbum.release_id,
          instanceId: selectedAlbum.instance_id,
          fields: fieldsChanged,
          ...(customFieldsChanged && { customFields: changedCustomFields }),
        });
      }

      let newInstanceId = selectedAlbum.instance_id;
      let newFolderId = selectedAlbum.folder_id;

      if (folderChanged && newFolderEntry) {
        const result = await proxyMoveToFolder({
          sessionToken,
          username: discogsUsername,
          oldFolderId: selectedAlbum.folder_id,
          newFolderId: newFolderEntry.id,
          releaseId: selectedAlbum.release_id,
          instanceId: selectedAlbum.instance_id,
        });
        newInstanceId = result.newInstanceId;
        newFolderId = newFolderEntry.id;
      }

      // Update local state + Convex cache
      const albumUpdates: Parameters<typeof updateAlbum>[1] = {
        ...fieldsChanged,
        ...(folderChanged && newFolderEntry && {
          folder: editFields.folder,
          folder_id: newFolderId,
          instance_id: newInstanceId,
        }),
        ...(customFieldsChanged && { customFields: editFields.customFields }),
      };
      updateAlbum(selectedAlbum.id, albumUpdates);

      setIsEditMode(false);
      toast.success("Saved.");
    } catch (err: any) {
      console.error("[AlbumDetail] Save failed:", err);
      toast.error("Save failed. Try again.");
    } finally {
      setIsSaving(false);
    }
  }, [
    selectedAlbum, sessionToken, discogsUsername,
    editFields, folderOptions, updateAlbum, proxyUpdateInstance, proxyMoveToFolder,
  ]);

  // Auto-check most recent session when expanding if album is in no sessions
  useEffect(() => {
    if (!sessionListExpanded || !selectedAlbum) return;
    if (autoCheckedRef.current === selectedAlbum.id) return;
    autoCheckedRef.current = selectedAlbum.id;

    const inAnySession = sessions.some((s) => s.albumIds.includes(selectedAlbum.id));
    if (!inAnySession && mostRecentSessionId) {
      toggleAlbumInSession(selectedAlbum.id, mostRecentSessionId);
    }
  }, [sessionListExpanded, selectedAlbum?.id]); // minimal deps — runs once per expand

  // Auto-focus new session input
  useEffect(() => {
    if (showNewSession && newSessionInputRef.current) {
      newSessionInputRef.current.focus();
    }
  }, [showNewSession]);

  const handleCreateSession = useCallback(() => {
    const trimmed = newSessionName.trim();
    if (!trimmed || !selectedAlbum) return;
    createSessionDirect(trimmed, [selectedAlbum.id]);
    setNewSessionName("");
    setShowNewSession(false);
  }, [newSessionName, selectedAlbum, createSessionDirect]);

  const alreadyOnWantlist = selectedAlbum ? isInWants(selectedAlbum.release_id) : false;

  const handleAddToWantlist = useCallback(async () => {
    if (!selectedAlbum || alreadyOnWantlist || isAddingToWantlist) return;
    setIsAddingToWantlist(true);
    try {
      await addToWantList({
        id: `w-${selectedAlbum.release_id}`,
        release_id: selectedAlbum.release_id,
        title: selectedAlbum.title,
        artist: selectedAlbum.artist,
        year: selectedAlbum.year,
        cover: selectedAlbum.cover,
        label: selectedAlbum.label,
        priority: false,
      });
      toast.info(`"${selectedAlbum.title}" added to Wantlist.`);
    } catch (err: any) {
      console.error("[AlbumDetail] Add to wantlist failed:", err);
      toast.error("Failed to add. Try again.");
    } finally {
      setIsAddingToWantlist(false);
    }
  }, [selectedAlbum, alreadyOnWantlist, isAddingToWantlist, addToWantList]);

  // Group credits by role — must be above early returns to maintain hook order
  const groupedCredits = useMemo(() => {
    if (!releaseData?.credits.length) return [];
    const map = new Map<string, string[]>();
    for (const c of releaseData.credits) {
      const existing = map.get(c.role);
      if (existing) {
        if (!existing.includes(c.name)) existing.push(c.name);
      } else {
        map.set(c.role, [c.name]);
      }
    }
    return Array.from(map.entries()).map(([role, names]) => ({ role, names }));
  }, [releaseData?.credits]);

  if (!selectedAlbum && selectedWantItem) {
    return (
      <WantItemDetailPanel
        item={selectedWantItem}
        hideHeader={hideHeader}
        hideImage={hideImage}
        onClose={() => { setShowAlbumDetail(false); setSelectedAlbumId(null); setSelectedWantItem(null); setSelectedFeedAlbum(null); }}
      />
    );
  }

  if (!selectedAlbum && !selectedWantItem && selectedFeedAlbum) {
    return (
      <ReleaseDetailPanel
        album={selectedFeedAlbum}
        hideHeader={hideHeader}
        hideImage={hideImage}
        onClose={() => { setShowAlbumDetail(false); setSelectedAlbumId(null); setSelectedWantItem(null); setSelectedFeedAlbum(null); }}
      />
    );
  }

  if (!selectedAlbum) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "var(--c-chip-bg)" }}>
          <span style={{ fontSize: "24px", color: "var(--c-text-faint)" }}>&#9835;</span>
        </div>
        <p className="text-center" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>Select an album to view details</p>
      </div>
    );
  }

  const purgeTagColor: Record<string, string> = {
    keep: getPurgeColor("keep", isDarkMode),
    cut: getPurgeColor("cut", isDarkMode),
    maybe: getPurgeColor("maybe", isDarkMode),
  };

  const albumLastPlayed = lastPlayed[selectedAlbum.id];
  const playedToday = albumLastPlayed ? isToday(albumLastPlayed) : false;

  const handlePlayedToday = () => {
    markPlayed(selectedAlbum.id);
    setJustPlayed(true);
    toast.info(`"${selectedAlbum.title}" played.`, { duration: 1500 });
    setTimeout(() => setJustPlayed(false), 1200);
  };

  const todayStr = new Date().toISOString().split("T")[0];

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val || val === todayStr) return;
    const [y, m, d] = val.split("-").map(Number);
    markPlayedAt(selectedAlbum.id, new Date(y, m - 1, d, 12, 0, 0));
    toast.info(`"${selectedAlbum.title}" played.`, { duration: 1500 });
    e.target.value = todayStr;
  };

  const inAnySession = isAlbumInAnySession(selectedAlbum.id);

  // Edit button — shown in header (desktop) or title row (mobile)
  const editButton = !isSyncing && !isEditMode && (
    <button
      onClick={enterEditMode}
      className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
      style={{ color: "var(--c-text-muted)" }}
      aria-label="Edit album fields"
    >
      <Pencil size={16} />
    </button>
  );

  // Enriched data helpers
  const hasTracklist = releaseData && releaseData.tracklist.length > 0;
  const hasCredits = releaseData && releaseData.credits.length > 0;
  const hasPressingNotes = releaseData && releaseData.notes.length > 0;
  const hasCommunity = releaseData && releaseData.community &&
    (releaseData.community.ratingCount > 0 || releaseData.community.have > 0 || releaseData.community.want > 0);
  const releaseImages = releaseData?.images || [];
  const hasImages = releaseImages.length > 1;

  // Tracklist: determine if all durations are missing
  const allDurationsMissing = !!hasTracklist && releaseData!.tracklist.every(t => !t.duration);

  return (
    <>
    <div className="flex flex-col h-full">
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderColor: "var(--c-border-strong)", borderBottomWidth: "1px", borderBottomStyle: "solid" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>
            {isEditMode ? "Edit Album" : "Album Details"}
          </h3>
          <div className="flex items-center gap-1">
            {editButton}
            {!isEditMode && (
              <button onClick={() => { setShowAlbumDetail(false); setSelectedAlbumId(null); setSelectedWantItem(null); setSelectedFeedAlbum(null); }} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{ color: "var(--c-text-muted)" }}><X size={18} /></button>
            )}
          </div>
        </div>
      )}

      <div className={`flex-1${hideHeader ? '' : ' overflow-y-auto'}`}>
        {/* ═══ Hero ═══ */}
        {!hideImage && hideHeader ? (
          /* ── Mobile: hero image with gradient scrim ── */
          <>
            <div className="px-4 pt-3">
              <div className="relative w-full aspect-square rounded-[12px] overflow-hidden" style={{ border: "1px solid var(--c-border-strong)" }}>
                <img src={selectedAlbum.cover} alt={selectedAlbum.title} className="w-full h-full object-cover" />
                {/* Gradient scrim */}
                <div
                  className="absolute inset-x-0 bottom-0 flex flex-col justify-end pb-4 px-4 gap-[3px]"
                  style={{
                    height: "55%",
                    background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.0) 100%)",
                  }}
                >
                  <h2
                    style={{
                      fontSize: "22px",
                      fontWeight: 700,
                      lineHeight: "1.3",
                      fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                      color: "#ffffff",
                      display: "block",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      WebkitTextOverflow: "ellipsis",
                      maxWidth: "100%",
                    }}
                  >{selectedAlbum.title}</h2>
                  <p
                    style={{
                      fontSize: "15px",
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.80)",
                      display: "block",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      WebkitTextOverflow: "ellipsis",
                      maxWidth: "100%",
                    }}
                  >{[selectedAlbum.artist, selectedAlbum.year ? String(selectedAlbum.year) : ""].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
            </div>
            {/* ═══ Image thumbnail strip (mobile) ═══ */}
            {isLoadingRelease && !releaseData && (
              <div className="px-4 mt-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex-shrink-0 rounded-[8px] animate-pulse" style={{ width: 64, height: 64, backgroundColor: "var(--c-border)" }} />
                ))}
              </div>
            )}
            {hasImages && (
              <div className="px-4 mt-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {releaseImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
                    className="flex-shrink-0 rounded-[8px] overflow-hidden tappable"
                    style={{ width: 64, height: 64, border: "1px solid var(--c-border)", flexShrink: 0 }}
                  >
                    <img src={img.uri150} alt={`Image ${idx + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : !hideImage ? (
          /* ── Desktop: padded cover ── */
          <>
            <div className="p-4">
              <div className="w-full aspect-square rounded-[12px] overflow-hidden" style={{ border: "1px solid var(--c-border-strong)" }}>
                <img src={selectedAlbum.cover} alt={selectedAlbum.title} className="w-full h-full object-cover" />
              </div>
            </div>
            {/* ═══ Image thumbnail strip (desktop) ═══ */}
            {isLoadingRelease && !releaseData && (
              <div className="px-4 mt-3 pb-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex-shrink-0 rounded-[8px] animate-pulse" style={{ width: 64, height: 64, backgroundColor: "var(--c-border)" }} />
                ))}
              </div>
            )}
            {hasImages && (
              <div className="px-4 mt-3 pb-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {releaseImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
                    className="flex-shrink-0 rounded-[8px] overflow-hidden tappable"
                    style={{ width: 64, height: 64, border: "1px solid var(--c-border)", flexShrink: 0 }}
                  >
                    <img src={img.uri150} alt={`Image ${idx + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            )}
            {/* ── Desktop: title / artist / purge tag block ── */}
            <div className="px-4 pb-4">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <h2 style={{ fontSize: "20px", fontWeight: 600, lineHeight: "1.3", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>{selectedAlbum.title}</h2>
                  <p className="mt-0.5" style={{ fontSize: "16px", fontWeight: 400, color: "var(--c-text-tertiary)" }}>{selectedAlbum.artist}</p>
                </div>
                {selectedAlbum.purgeTag && !isEditMode && (
                  <span className="flex-shrink-0 px-2.5 py-1 rounded-full capitalize mt-1" style={{
                    fontSize: "11px", fontWeight: 500,
                    backgroundColor: `${purgeTagColor[selectedAlbum.purgeTag]}15`,
                    color: purgeTagColor[selectedAlbum.purgeTag],
                  }}>{selectedAlbum.purgeTag}</span>
                )}
              </div>
            </div>
          </>
        ) : null}

        {!hideHeader && hideImage ? (
          /* ── Desktop with hidden image: title / artist / purge tag block (no blur) ── */
          <div className="px-4 pb-4">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <h2 style={{ fontSize: "20px", fontWeight: 600, lineHeight: "1.3", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>{selectedAlbum.title}</h2>
                <p className="mt-0.5" style={{ fontSize: "16px", fontWeight: 400, color: "var(--c-text-tertiary)" }}>{selectedAlbum.artist}</p>
              </div>
              {selectedAlbum.purgeTag && !isEditMode && (
                <span className="flex-shrink-0 px-2.5 py-1 rounded-full capitalize mt-1" style={{
                  fontSize: "11px", fontWeight: 500,
                  backgroundColor: `${purgeTagColor[selectedAlbum.purgeTag]}15`,
                  color: purgeTagColor[selectedAlbum.purgeTag],
                }}>{selectedAlbum.purgeTag}</span>
              )}
            </div>
          </div>
        ) : null}

        {/* ═══ Edit form / Your Copy section ═══ */}
        {isEditMode ? (
          <div className="px-4 pb-4">
            <div className="rounded-[10px] p-3 flex flex-col gap-3" style={{ backgroundColor: "var(--c-surface-alt)", border: "1px solid var(--c-border-strong)" }}>
              {/* Static read-only rows */}
              {hasYear(selectedAlbum.year) && <DetailRow label="Year" value={String(selectedAlbum.year)} />}
              <DetailRow label="Label" value={selectedAlbum.label} />
              <DetailRow label="Catalog #" value={selectedAlbum.catalogNumber} />
              <DetailRow label="Format" value={selectedAlbum.format} />

              {/* Divider before editable fields */}
              <div style={{ height: "1px", backgroundColor: "var(--c-border)" }} />

              {/* Folder */}
              <div className="flex flex-col gap-1">
                <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>Folder</label>
                <select
                  value={editFields.folder}
                  onChange={(e) => setEditFields((prev) => ({ ...prev, folder: e.target.value }))}
                  style={{
                    fontSize: "16px",
                    fontWeight: 400,
                    color: "var(--c-text)",
                    backgroundColor: "var(--c-input-bg)",
                    border: "1px solid var(--c-border)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    paddingRight: "36px",
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    outline: "none",
                    width: "100%",
                    appearance: "none",
                    WebkitAppearance: "none",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='${isDarkMode ? "%23AAAAAA" : "%23333333"}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 12px center",
                    backgroundSize: "16px 16px",
                  }}
                >
                  {folderOptions.map((f) => (
                    <option key={f.id} value={f.name}>{f.name}</option>
                  ))}
                </select>
              </div>

              {/* Media Condition */}
              <div className="flex flex-col gap-1">
                <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>Media Condition</label>
                <select
                  value={editFields.mediaCondition}
                  onChange={(e) => setEditFields((prev) => ({ ...prev, mediaCondition: e.target.value }))}
                  style={{
                    fontSize: "16px",
                    fontWeight: 400,
                    color: "var(--c-text)",
                    backgroundColor: "var(--c-input-bg)",
                    border: "1px solid var(--c-border)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    paddingRight: "36px",
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    outline: "none",
                    width: "100%",
                    appearance: "none",
                    WebkitAppearance: "none",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='${isDarkMode ? "%23AAAAAA" : "%23333333"}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 12px center",
                    backgroundSize: "16px 16px",
                  }}
                >
                  <option value="">Not set</option>
                  {CONDITION_GRADES.map((grade) => (
                    <option key={grade} value={grade}>{grade}</option>
                  ))}
                </select>
              </div>

              {/* Sleeve Condition */}
              <div className="flex flex-col gap-1">
                <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>Sleeve Condition</label>
                <select
                  value={editFields.sleeveCondition}
                  onChange={(e) => setEditFields((prev) => ({ ...prev, sleeveCondition: e.target.value }))}
                  style={{
                    fontSize: "16px",
                    fontWeight: 400,
                    color: "var(--c-text)",
                    backgroundColor: "var(--c-input-bg)",
                    border: "1px solid var(--c-border)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    paddingRight: "36px",
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    outline: "none",
                    width: "100%",
                    appearance: "none",
                    WebkitAppearance: "none",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='${isDarkMode ? "%23AAAAAA" : "%23333333"}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 12px center",
                    backgroundSize: "16px 16px",
                  }}
                >
                  <option value="">Not set</option>
                  {CONDITION_GRADES.map((grade) => (
                    <option key={grade} value={grade}>{grade}</option>
                  ))}
                </select>
              </div>

              {/* Notes (user personal notes) */}
              <div className="flex flex-col gap-1">
                <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>Notes</label>
                <textarea
                  value={editFields.notes}
                  onChange={(e) => setEditFields((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  placeholder="Add notes..."
                  style={{
                    fontSize: "16px",
                    fontWeight: 400,
                    color: "var(--c-text)",
                    backgroundColor: "var(--c-input-bg)",
                    border: "1px solid var(--c-border)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    outline: "none",
                    width: "100%",
                    resize: "none",
                    lineHeight: "1.5",
                  }}
                />
              </div>

              {/* Custom fields */}
              {editFields.customFields.map((cf, i) => (
                <div key={`cf-edit-${i}`} className="flex flex-col gap-1">
                  <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>{cf.name}</label>
                  {cf.type === "dropdown" && cf.options ? (
                    <select
                      value={cf.value}
                      onChange={(e) => setEditFields((prev) => {
                        const updated = [...prev.customFields];
                        updated[i] = { ...updated[i], value: e.target.value };
                        return { ...prev, customFields: updated };
                      })}
                      style={{
                        fontSize: "16px",
                        fontWeight: 400,
                        color: "var(--c-text)",
                        backgroundColor: "var(--c-input-bg)",
                        border: "1px solid var(--c-border)",
                        borderRadius: "8px",
                        padding: "8px 12px",
                        paddingRight: "36px",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        outline: "none",
                        width: "100%",
                        appearance: "none",
                        WebkitAppearance: "none",
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='${isDarkMode ? "%23AAAAAA" : "%23333333"}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 12px center",
                        backgroundSize: "16px 16px",
                      }}
                    >
                      <option value="">Not set</option>
                      {cf.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <textarea
                      value={cf.value}
                      onChange={(e) => setEditFields((prev) => {
                        const updated = [...prev.customFields];
                        updated[i] = { ...updated[i], value: e.target.value };
                        return { ...prev, customFields: updated };
                      })}
                      rows={2}
                      style={{
                        fontSize: "16px",
                        fontWeight: 400,
                        color: "var(--c-text)",
                        backgroundColor: "var(--c-input-bg)",
                        border: "1px solid var(--c-border)",
                        borderRadius: "8px",
                        padding: "8px 12px",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        outline: "none",
                        width: "100%",
                        resize: "none",
                        lineHeight: "1.5",
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={cancelEdit}
                disabled={isSaving}
                className="flex-1 py-2.5 rounded-[10px] transition-colors"
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  color: "var(--c-text-secondary)",
                  backgroundColor: "var(--c-chip-bg)",
                  border: "1px solid var(--c-border)",
                  opacity: isSaving ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[10px] transition-colors bg-[#EBFD00] hover:bg-[#d9e800]"
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  color: "#0C284A",
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                {isSaving ? (
                  <>
                    <Disc3 size={15} className="disc-spinner" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* ═══ Mark as Played button ═══ */}
            {!isEditMode && (
              <div className="px-4 pt-4 pb-4">
                <button
                  onClick={handlePlayedToday}
                  className="w-full flex items-center justify-center gap-2.5 py-3 rounded-[10px] tappable transition-all relative overflow-hidden"
                  style={{
                    backgroundColor: (playedToday || justPlayed)
                      ? (isDarkMode ? "rgba(172,222,242,0.12)" : "rgba(172,222,242,0.35)")
                      : (isDarkMode ? "rgba(172,222,242,0.08)" : "rgba(172,222,242,0.2)"),
                    border: `1px solid ${(playedToday || justPlayed) ? (isDarkMode ? "rgba(172,222,242,0.3)" : "#74889C") : (isDarkMode ? "rgba(172,222,242,0.15)" : "rgba(172,222,242,0.5)")}`,
                    color: isDarkMode ? "#ACDEF2" : "#00527A",
                  }}
                >
                  <AnimatePresence mode="wait">
                    {justPlayed ? (
                      <motion.div
                        key="check"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: [1.12, 1], opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ duration: DURATION_SLOW, ease: EASE_IN_OUT }}
                        className="flex items-center gap-2"
                      >
                        <Check size={18} />
                        <span style={{ fontSize: "14px", fontWeight: 600 }}>Played!</span>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="play"
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
                        className="flex items-center gap-2"
                      >
                        <Play size={16} />
                        <span style={{ fontSize: "14px", fontWeight: 600 }}>Mark as Played</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
                <p className="mt-2 text-center" style={{ fontSize: "12px", fontWeight: (justPlayed || playedToday) ? 500 : 400, color: (justPlayed || playedToday) ? (isDarkMode ? "#ACDEF2" : "#00527A") : "var(--c-text-muted)" }}>
                  {justPlayed ? "Played today" : playedToday ? "Played today" : (
                    <span style={{ position: "relative", display: "inline-block", cursor: "pointer", touchAction: "manipulation" }}>
                      {albumLastPlayed ? `Last played ${formatDateShort(albumLastPlayed)}` : "No plays logged. Tap to log a past play."}
                      <input
                        type="date"
                        defaultValue={todayStr}
                        max={todayStr}
                        onChange={handleDateChange}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", fontSize: "16px" }}
                        tabIndex={-1}
                      />
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* ═══ Your Copy ═══ */}
            <div className="px-4 pb-4">
              <div className="rounded-[10px] p-3 flex flex-col gap-2.5" style={{ backgroundColor: "var(--c-surface-alt)", border: "1px solid var(--c-border-strong)" }}>
                {hideHeader && (
                  <div className="flex items-center justify-between mb-2.5">
                    <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--c-text)" }}>Your Copy</span>
                    <div className="flex items-center gap-2">
                      {selectedAlbum.purgeTag && !isEditMode && (
                        <span className="px-2.5 py-1 rounded-full capitalize" style={{
                          fontSize: "11px", fontWeight: 500,
                          backgroundColor: `${purgeTagColor[selectedAlbum.purgeTag]}15`,
                          color: purgeTagColor[selectedAlbum.purgeTag],
                        }}>{selectedAlbum.purgeTag}</span>
                      )}
                      {editButton}
                    </div>
                  </div>
                )}
                <DetailRow label="Format" value={selectedAlbum.format} />
                <DetailRow label="Label" value={selectedAlbum.label} />
                <DetailRow label="Catalog #" value={selectedAlbum.catalogNumber} />
                {hasYear(selectedAlbum.year) && <DetailRow label="Year" value={String(selectedAlbum.year)} />}
                {releaseData?.country ? (
                  <DetailRow label="Country" value={releaseData.country} />
                ) : isLoadingRelease ? (
                  <div className="flex items-start gap-3">
                    <span className="w-24 flex-shrink-0 text-right uppercase tracking-wider" style={{ fontSize: "11px", fontWeight: 500, color: "var(--c-text-muted)", paddingTop: "1px" }}>Country</span>
                    <div className="rounded-[4px] animate-pulse" style={{ width: "56px", height: "12px", backgroundColor: "var(--c-border)", marginTop: "2px" }} />
                  </div>
                ) : null}
                {/* Genres / Styles pills */}
                {(releaseData?.genres?.length || releaseData?.styles?.length) ? (
                  <div className="flex items-start gap-3">
                    <span className="w-24 flex-shrink-0 text-right uppercase tracking-wider" style={{ fontSize: "11px", fontWeight: 500, color: "var(--c-text-muted)", paddingTop: "3px" }}>Genres</span>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {[...(releaseData!.genres || []), ...(releaseData!.styles || [])].map((g, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full" style={{ fontSize: "11px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text-secondary)" }}>
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : isLoadingRelease ? (
                  <div className="flex items-start gap-3">
                    <span className="w-24 flex-shrink-0 text-right uppercase tracking-wider" style={{ fontSize: "11px", fontWeight: 500, color: "var(--c-text-muted)", paddingTop: "3px" }}>Genres</span>
                    <div className="flex gap-1.5">
                      <div className="rounded-full animate-pulse" style={{ width: "52px", height: "20px", backgroundColor: "var(--c-border)" }} />
                      <div className="rounded-full animate-pulse" style={{ width: "40px", height: "20px", backgroundColor: "var(--c-border)" }} />
                      <div className="rounded-full animate-pulse" style={{ width: "60px", height: "20px", backgroundColor: "var(--c-border)" }} />
                    </div>
                  </div>
                ) : null}
                <DetailRow label="Folder" value={selectedAlbum.folder} />
                <DetailRow label="Media" value={selectedAlbum.mediaCondition} valueColor={conditionColor(selectedAlbum.mediaCondition, isDarkMode)} />
                <DetailRow label="Sleeve" value={selectedAlbum.sleeveCondition} valueColor={conditionColor(selectedAlbum.sleeveCondition, isDarkMode)} />
                {selectedAlbum.customFields?.filter(cf => cf.value).map((cf, i) => (
                  <DetailRow key={`cf-${i}`} label={cf.name} value={cf.value} />
                ))}
                {selectedAlbum.notes && <DetailRow label="Notes" value={selectedAlbum.notes} />}

                {/* ═══ Add to a Session (inside Your Copy) ═══ */}
                {!isEditMode && (
                  <>
                    <div style={{ borderTop: "1px solid var(--c-border)", marginTop: "8px", paddingTop: "12px" }}>
                      <p className="mb-2" style={{ fontSize: "13px", fontWeight: 600, color: "var(--c-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {inAnySession ? "Saved" : "Add to a Session"}
                      </p>
                      <div style={{ border: "1px solid var(--c-border-strong)", borderRadius: "10px", padding: "4px 8px", maxHeight: "240px", overflowY: "auto" }}>
                        {[...sessions]
                          .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
                          .map((session) => {
                            const inSession = isInSession(selectedAlbum.id, session.id);
                            return (
                              <InlineSessionRow
                                key={session.id}
                                label={session.name}
                                count={session.albumIds.length}
                                checked={inSession}
                                onToggle={() => toggleAlbumInSession(selectedAlbum.id, session.id)}
                                isDarkMode={isDarkMode}
                              />
                            );
                          })}
                        {!showNewSession ? (
                          <button
                            onClick={() => setShowNewSession(true)}
                            className="w-full flex items-center gap-2 py-2 px-1 tappable rounded-lg transition-colors"
                            style={{ color: "var(--c-text-secondary)" }}
                          >
                            <div className="flex items-center justify-center flex-shrink-0" style={{ width: 20, height: 20 }}>
                              <Plus size={14} />
                            </div>
                            <span style={{ fontSize: "13px", fontWeight: 500 }}>New Session</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 py-2 px-1">
                            <input
                              ref={newSessionInputRef}
                              type="text"
                              value={newSessionName}
                              onChange={(e) => setNewSessionName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleCreateSession();
                                if (e.key === "Escape") {
                                  setShowNewSession(false);
                                  setNewSessionName("");
                                }
                              }}
                              placeholder="Session name..."
                              maxLength={100}
                              className="flex-1 min-w-0 rounded-lg px-3 py-1.5 outline-none"
                              style={{
                                fontSize: "16px",
                                fontWeight: 400,
                                color: "var(--c-text)",
                                backgroundColor: "var(--c-input-bg)",
                                border: "1px solid var(--c-border)",
                                fontFamily: "'DM Sans', system-ui, sans-serif",
                              }}
                            />
                            <button
                              onClick={handleCreateSession}
                              disabled={!newSessionName.trim()}
                              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center tappable transition-colors"
                              style={{
                                backgroundColor: newSessionName.trim() ? "#EBFD00" : "var(--c-chip-bg)",
                                color: newSessionName.trim() ? "#0C284A" : "var(--c-text-faint)",
                              }}
                            >
                              <Check size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ═══ Rate for Purge (inside Your Copy) ═══ */}
                    <div style={{ borderTop: "1px solid var(--c-border)", marginTop: "8px", paddingTop: "12px" }}>
                      <p className="mb-2" style={{ fontSize: "13px", fontWeight: 600, color: "var(--c-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Rate for Purge
                      </p>
                      <div style={{ display: "flex", flexDirection: "row", gap: "8px" }}>
                        {(["keep", "maybe", "cut"] as const).map((tag) => {
                          const isActive = selectedAlbum.purgeTag === tag;
                          const label = tag.charAt(0).toUpperCase() + tag.slice(1);
                          return (
                            <button
                              key={tag}
                              className="tappable"
                              onClick={() => {
                                const t = selectedAlbum.purgeTag === tag ? null : tag;
                                setPurgeTag(selectedAlbum.id, t);
                                if (t) purgeToast(t, isDarkMode, selectedAlbum.title);
                                else purgeClearToast();
                              }}
                              style={{
                                flex: 1,
                                height: "36px",
                                borderRadius: "10px",
                                border: isActive ? `2px solid ${purgeButtonText(tag, isDarkMode)}` : "none",
                                fontSize: "13px",
                                fontWeight: 600,
                                fontFamily: "'DM Sans', system-ui, sans-serif",
                                backgroundColor: purgeButtonBg(tag, isDarkMode),
                                color: purgeButtonText(tag, isDarkMode),
                                cursor: "pointer",
                                opacity: isActive ? 1 : 0.55,
                                transition: "opacity 0.15s ease",
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* User personal notes — now displayed inside Your Copy card */}
          </div>
        )}

        {/* ═══ Remove from Collection (edit mode only) ═══ */}
        {isEditMode && selectedAlbum && (
          <div className="px-4 pb-4 mt-4" style={{ borderTop: "1px solid var(--c-border)", paddingTop: "16px" }}>
            <DestructiveButton
              label={confirmRemove ? "Confirm Remove" : "Remove from Collection"}
              confirming={confirmRemove}
              loading={isRemoving}
              onClick={async () => {
                if (!confirmRemove) {
                  setConfirmRemove(true);
                  return;
                }
                setIsRemoving(true);
                try {
                  await removeFromCollection(selectedAlbum.id);
                  toast.success(`"${selectedAlbum.title}" removed from your collection.`);
                  setShowAlbumDetail(false);
                  setSelectedAlbumId(null);
                  setSelectedWantItem(null);
                  setSelectedFeedAlbum(null);
                } catch (err) {
                  console.error("[AlbumDetail] Remove failed:", err);
                  toast.error("Couldn't remove. Try again.");
                  setConfirmRemove(false);
                  setIsRemoving(false);
                }
              }}
            />
          </div>
        )}

        {!isEditMode && (
          <div style={{ position: "relative", zIndex: 1, background: hideHeader ? (isDarkMode ? "#132B44" : "#FFFFFF") : undefined }}>
            {/* ═══ Community (enriched, 3-stat row) ═══ */}
            {isLoadingRelease ? (
              <div className="px-4 pb-6">
                <div className="flex items-start justify-around">
                  {[40, 56, 48].map((w, i) => (
                    <div key={i} className="flex flex-col items-center gap-1.5">
                      <div className="rounded-full animate-pulse" style={{ width: "20px", height: "20px", backgroundColor: "var(--c-border)" }} />
                      <div className="rounded-[4px] animate-pulse" style={{ width: `${w}px`, height: "18px", backgroundColor: "var(--c-border)" }} />
                      <div className="rounded-[4px] animate-pulse" style={{ width: "48px", height: "10px", backgroundColor: "var(--c-border)" }} />
                    </div>
                  ))}
                </div>
              </div>
            ) : hasCommunity ? (
              <CommunityRow community={releaseData!.community!} />
            ) : null}

            {/* ═══ Research Links ═══ */}
            <div className="px-4 pb-6 grid grid-cols-2 gap-2">
              <button
                onClick={() => window.open(`https://www.discogs.com/sell/history/${selectedAlbum.release_id}`, '_blank', 'noopener,noreferrer')}
                className="flex flex-col items-center gap-1.5 py-3 rounded-[10px] transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: "var(--c-surface-alt)",
                  border: "1px solid var(--c-border)",
                  color: "var(--c-text-secondary)",
                }}
              >
                <History size={20} />
                <span style={{ fontSize: "11px", fontWeight: 500, textAlign: "center", lineHeight: "1.3", color: "var(--c-text-muted)" }}>Sold History</span>
              </button>
              <a
                href={`https://www.popsike.com/php/quicksearch.php?searchtext=${encodeURIComponent(`${selectedAlbum.artist} ${selectedAlbum.title}`)}&x=0&y=0`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1.5 py-3 rounded-[10px] transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: "var(--c-surface-alt)",
                  border: "1px solid var(--c-border)",
                  color: "var(--c-text-secondary)",
                }}
              >
                <Gavel size={20} />
                <span style={{ fontSize: "11px", fontWeight: 500, textAlign: "center", lineHeight: "1.3", color: "var(--c-text-muted)" }}>Auction History</span>
              </a>
            </div>

            {/* ═══ Enriched Content Tabs ═══ */}
            {(() => {
              const hasIdentifiers = releaseData && releaseData.identifiers.length > 0;
              const anyTabHasData = hasTracklist || hasCredits || hasPressingNotes || hasIdentifiers;
              const isLoading = isLoadingRelease && !releaseData;

              // Hide entirely if loaded and no data
              if (!isLoading && !anyTabHasData) return null;

              const tabs = [
                { key: 'tracklist' as const, label: 'Tracklist', hasData: !!hasTracklist },
                { key: 'credits' as const, label: 'Credits', hasData: !!hasCredits },
                { key: 'pressing' as const, label: 'Pressing Notes', hasData: !!hasPressingNotes },
                { key: 'identifiers' as const, label: 'Identifiers', hasData: !!hasIdentifiers },
              ];

              const visibleTabs = isLoading ? tabs : tabs.filter(t => t.hasData);

              return (
                <>
                  {/* Sentinel for sticky tab bar detection */}
                  <div ref={tabSentinelRef} style={{ height: 0, width: "100%", pointerEvents: "none" }} />
                  {/* Tab bar */}
                  <div
                    className="overflow-x-auto no-scrollbar"
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 10,
                      backgroundColor: hideHeader ? (isDarkMode ? "#132B44" : "#FFFFFF") : "var(--c-surface)",
                      borderBottom: "1px solid var(--c-border)",
                      paddingTop: tabBarStuck && hideHeader ? "48px" : "0px",
                    }}
                  >
                    <div className="flex">
                      {visibleTabs.map((tab) => {
                        const isActive = !isLoading && activeTab === tab.key;
                        return (
                          <button
                            key={tab.key}
                            onClick={() => !isLoading && setActiveTab(tab.key)}
                            disabled={isLoading}
                            style={{
                              padding: "8px 16px",
                              fontSize: "13px",
                              fontWeight: 500,
                              color: isLoading ? "var(--c-text-muted)" : isActive ? "var(--c-text)" : "var(--c-text-muted)",
                              opacity: isLoading ? 0.4 : 1,
                              borderBottom: isActive ? "2px solid #EBFD00" : "2px solid transparent",
                              background: "none",
                              cursor: isLoading ? "default" : "pointer",
                              whiteSpace: "nowrap",
                              fontFamily: "'DM Sans', system-ui, sans-serif",
                              flexShrink: 0,
                            }}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tab content */}
                  <div className="pt-3">
                    {isLoading ? (
                      <div className="px-4 pb-6">
                        <EnrichedSkeleton label="" rows={4} />
                      </div>
                    ) : activeTab === 'tracklist' && hasTracklist ? (
                      <TracklistSection
                        tracklist={releaseData!.tracklist}
                        isExpanded={true}
                        onToggle={() => {}}
                        allDurationsMissing={allDurationsMissing}
                        hideToggle
                        hideTitle={hideHeader}
                      />
                    ) : activeTab === 'credits' && hasCredits ? (
                      <CreditsSection groupedCredits={groupedCredits} hideTitle={hideHeader} />
                    ) : activeTab === 'pressing' && hasPressingNotes ? (
                      <PressingNotesSection notes={releaseData!.notes} hideTitle={hideHeader} />
                    ) : activeTab === 'identifiers' && releaseData?.identifiers && releaseData.identifiers.length > 0 ? (
                      <div className="px-4 pb-6">
                        <div className="flex flex-col gap-1.5">
                          {releaseData.identifiers.map((id, i) => (
                            <DetailRow key={`id-${i}`} label={id.type} value={id.value} />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>

    {/* ═══ Fullscreen Image Lightbox ═══ */}
    {lightboxOpen && releaseImages.length > 0 && (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0"
          style={{ zIndex: 135, backgroundColor: "rgba(0,0,0,0.92)" }}
          onClick={() => setLightboxOpen(false)}
        />
        {/* Overlay */}
        <div
          className="fixed inset-0 flex flex-col items-center justify-center"
          style={{ zIndex: 140, pointerEvents: "none" }}
        >
          {/* Close button */}
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute right-4 flex items-center justify-center"
            style={{
              top: "calc(env(safe-area-inset-top, 0px) + 12px)",
              width: 40,
              height: 40,
              color: "white",
              pointerEvents: "auto",
            }}
          >
            <X size={24} />
          </button>

          {/* Image */}
          <div className="relative flex items-center justify-center w-full" style={{ pointerEvents: "auto", paddingLeft: 16, paddingRight: 16 }}>
            <motion.img
              key={lightboxIndex}
              src={releaseImages[lightboxIndex].uri}
              alt={`Image ${lightboxIndex + 1} of ${releaseImages.length}`}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.1}
              onDragEnd={(_, info) => {
                if (info.offset.x < -50 && lightboxIndex < releaseImages.length - 1) {
                  setLightboxIndex(i => i + 1);
                } else if (info.offset.x > 50 && lightboxIndex > 0) {
                  setLightboxIndex(i => i - 1);
                }
              }}
              style={{
                maxWidth: "100%",
                maxHeight: "85vh",
                objectFit: "contain",
                borderRadius: "8px",
                cursor: "grab",
                userSelect: "none",
              }}
            />
          </div>

          {/* Counter / Navigation row */}
          {releaseImages.length > 1 ? (
            <div
              className="flex items-center justify-center gap-5 mt-3"
              style={{ pointerEvents: "auto" }}
            >
              <button
                onClick={() => setLightboxIndex(i => i - 1)}
                disabled={lightboxIndex === 0}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "rgba(255,255,255,0.8)",
                  opacity: lightboxIndex === 0 ? 0.3 : 1,
                }}
              >
                <ChevronLeft size={20} />
              </button>
              <p
                style={{ fontSize: "13px", fontWeight: 400, color: "rgba(255,255,255,0.5)", minWidth: "48px", textAlign: "center" }}
              >
                {lightboxIndex + 1} / {releaseImages.length}
              </p>
              <button
                onClick={() => setLightboxIndex(i => i + 1)}
                disabled={lightboxIndex === releaseImages.length - 1}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "rgba(255,255,255,0.8)",
                  opacity: lightboxIndex === releaseImages.length - 1 ? 0.3 : 1,
                }}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          ) : (
            <p
              className="mt-3"
              style={{ fontSize: "13px", fontWeight: 400, color: "rgba(255,255,255,0.5)", pointerEvents: "none" }}
            >
              {lightboxIndex + 1} / {releaseImages.length}
            </p>
          )}
        </div>
      </>
    )}
    </>
  );
}

/* ─── Enriched data section components ─── */

function TracklistSection({
  tracklist,
  isExpanded,
  onToggle,
  allDurationsMissing,
  hideToggle = false,
  hideTitle = false,
}: {
  tracklist: { position: string; title: string; duration: string }[];
  isExpanded: boolean;
  onToggle: () => void;
  allDurationsMissing: boolean;
  hideToggle?: boolean;
  hideTitle?: boolean;
}) {
  const SHOW_COUNT = 5;
  const shouldFade = !hideToggle && tracklist.length > SHOW_COUNT;
  const visibleTracks = shouldFade && !isExpanded ? tracklist.slice(0, SHOW_COUNT) : tracklist;

  return (
    <div className="px-4 pb-6">
      {!hideTitle && (
        <p className="mb-2" style={{ fontSize: "16px", fontWeight: 600, color: "var(--c-text)" }}>
          Tracklist
        </p>
      )}
      <div className="relative">
        <div className="flex flex-col">
          {visibleTracks.map((track, i) => (
            <div
              key={i}
              className="flex items-baseline gap-2 py-1.5"
              style={{ borderTop: i > 0 ? "1px solid var(--c-border)" : undefined }}
            >
              <span
                className="flex-shrink-0"
                style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)", minWidth: "24px" }}
              >
                {track.position}
              </span>
              <span
                className="flex-1 min-w-0"
                style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text)" }}
              >
                {track.title}
              </span>
              {!allDurationsMissing && track.duration && (
                <span
                  className="flex-shrink-0"
                  style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)", fontFamily: "'DM Sans', system-ui, sans-serif" }}
                >
                  {track.duration}
                </span>
              )}
            </div>
          ))}
        </div>
        {shouldFade && !isExpanded && (
          <div
            className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent, var(--c-surface))" }}
          />
        )}
      </div>
      {shouldFade && (
        <button
          onClick={onToggle}
          className="mt-2 uppercase tracking-wider transition-opacity hover:opacity-70"
          style={{ fontSize: "11px", fontWeight: 600, color: "var(--c-text-muted)" }}
        >
          {isExpanded ? "SHOW LESS" : "SHOW MORE"}
        </button>
      )}
    </div>
  );
}

function CreditsSection({ groupedCredits, hideTitle = false }: { groupedCredits: { role: string; names: string[] }[]; hideTitle?: boolean }) {
  return (
    <div className="px-4 pb-6">
      {!hideTitle && <p className="mb-2" style={{ fontSize: "16px", fontWeight: 600, color: "var(--c-text)" }}>Credits</p>}
      <div className="flex flex-col gap-2.5">
        {groupedCredits.map(({ role, names }) => (
          <div key={role}>
            <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>
              {role}
            </p>
            <p style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-secondary)", lineHeight: "1.5" }}>
              {names.join(", ")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PressingNotesSection({ notes, hideTitle = false }: { notes: string; hideTitle?: boolean }) {
  return (
    <div className="px-4 pb-6">
      {!hideTitle && <p className="mb-2" style={{ fontSize: "16px", fontWeight: 600, color: "var(--c-text)" }}>Pressing Notes</p>}
      <p style={{
        fontSize: "12px",
        fontWeight: 400,
        lineHeight: "1.7",
        color: "var(--c-text-muted)",
        fontFamily: "'DM Sans', monospace",
        whiteSpace: "pre-wrap",
      }}>
        {notes}
      </p>
    </div>
  );
}

function formatStatNumber(n: number): string {
  if (n >= 1000) return `${parseFloat((n / 1000).toFixed(1))}K`;
  return String(n);
}

function CommunityRow({ community }: { community: { rating: number | null; ratingCount: number; have: number; want: number } }) {
  const avgRating = community.rating !== null && community.ratingCount > 0
    ? community.rating.toFixed(1)
    : "—";

  const stats = [
    { icon: <Star size={18} color="#FFC107" />, value: avgRating, label: "AVG. RATING" },
    { icon: <GalleryVerticalEnd size={18} color="#3E9842" />, value: formatStatNumber(community.have), label: "HAVE IT" },
    { icon: <Heart size={18} color="#EF5350" />, value: formatStatNumber(community.want), label: "WANT IT" },
  ];

  return (
    <div className="px-4 pt-2 pb-6">
      <div className="grid grid-cols-3">
        {stats.map(({ icon, value, label }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <div>{icon}</div>
            <span style={{ fontSize: "20px", fontWeight: 600, color: "var(--c-text)", lineHeight: "1.2", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>{value}</span>
            <span className="uppercase tracking-wider" style={{ fontSize: "10px", fontWeight: 500, color: "var(--c-text-muted)" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EnrichedSkeleton({ label, rows }: { label: string; rows: number }) {
  return (
    <div className="px-4 pb-4">
      <p className="mb-2" style={{ fontSize: "16px", fontWeight: 600, color: "var(--c-text)" }}>
        {label}
      </p>
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="rounded-[4px] animate-pulse" style={{ width: "24px", height: "12px", backgroundColor: "var(--c-border)" }} />
            <div className="rounded-[4px] animate-pulse flex-1" style={{ height: "12px", backgroundColor: "var(--c-border)", maxWidth: `${60 + (i % 3) * 20}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Shared detail row ─── */

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-24 flex-shrink-0 text-right uppercase tracking-wider" style={{ fontSize: "11px", fontWeight: 500, color: "var(--c-text-muted)", paddingTop: "1px" }}>{label}</span>
      <span className="flex-1 min-w-0" style={{ fontSize: "13px", fontWeight: valueColor ? 500 : 400, color: valueColor || "var(--c-text)" }}>{value}</span>
    </div>
  );
}

function DestructiveButton({
  label,
  confirming,
  loading,
  onClick,
  variant = "destructive",
}: {
  label: string;
  confirming: boolean;
  loading: boolean;
  onClick: () => void;
  variant?: "destructive" | "neutral";
}) {
  const isNeutral = variant === "neutral";
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 py-3 rounded-[10px] transition-colors tappable"
      style={{
        fontSize: "14px",
        fontWeight: 600,
        fontFamily: "'DM Sans', system-ui, sans-serif",
        border: isNeutral ? "1px solid var(--c-border-strong)" : "1px solid #FF2D78",
        backgroundColor: isNeutral ? "var(--c-surface)" : confirming ? "#FF2D78" : "transparent",
        color: isNeutral ? "var(--c-text)" : "#FFFFFF",
        minHeight: 45,
      }}
    >
      {loading ? (
        <Disc3 size={15} className="disc-spinner" style={isNeutral ? { color: "var(--c-text-muted)" } : undefined} />
      ) : (
        label
      )}
    </button>
  );
}

function InlineSessionRow({
  label,
  count,
  checked,
  onToggle,
  isDarkMode,
}: {
  label: string;
  count: number;
  checked: boolean;
  onToggle: () => void;
  isDarkMode: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 py-2 px-1 tappable rounded-lg transition-colors cursor-pointer"
    >
      {/* Label + count */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span
          className="line-clamp-2"
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--c-text)",
          }}
        >
          {label}
        </span>
        <span
          className="flex-shrink-0"
          style={{
            fontSize: "11px",
            fontWeight: 400,
            color: "var(--c-text-faint)",
          }}
        >
          {count} {count === 1 ? "album" : "albums"}
        </span>
      </div>

      {/* Checkbox */}
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-full transition-colors"
        style={{
          width: 20,
          height: 20,
          backgroundColor: checked ? "#EBFD00" : "transparent",
          border: checked ? "none" : "2px solid var(--c-border-strong)",
        }}
      >
        {checked && <Check size={12} color="#0C284A" strokeWidth={3} />}
      </div>
    </button>
  );
}

/* ─── Wantlist Item Detail Panel ─── */

function WantItemDetailPanel({
  item,
  hideHeader = false,
  hideImage = false,
  onClose,
}: {
  item: WantItem;
  hideHeader?: boolean;
  hideImage?: boolean;
  onClose: () => void;
}) {
  const { toggleWantPriority, removeFromWantList, addToCollection, isInCollection, albums, setSelectedAlbumId, setSelectedWantItem, sessionToken, isDarkMode } = useApp();
  const proxyFetchRelease = useAction(api.discogs.proxyFetchRelease);
  const [isRemoving, setIsRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [isAddingToCollection, setIsAddingToCollection] = useState(false);

  // Enriched release data state
  const [releaseData, setReleaseData] = useState<ReleaseData | null>(null);
  const [isLoadingRelease, setIsLoadingRelease] = useState(false);
  const [activeTab, setActiveTab] = useState<'tracklist' | 'credits' | 'pressing' | 'identifiers'>('tracklist');
  const tabSentinelRef = useRef<HTMLDivElement>(null);
  const [tabBarStuck, setTabBarStuck] = useState(false);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Reset state when item changes
  useEffect(() => {
    setConfirmRemove(false);
    setIsRemoving(false);
    setIsAddingToCollection(false);
    setActiveTab('tracklist');
    setTabBarStuck(false);
    setLightboxOpen(false);
    setLightboxIndex(0);
  }, [item.release_id]);

  // IntersectionObserver for tab bar sticky
  useEffect(() => {
    const sentinel = tabSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setTabBarStuck(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [item.release_id]);

  // Fetch enriched release data
  useEffect(() => {
    if (!sessionToken) {
      setReleaseData(null);
      setIsLoadingRelease(false);
      return;
    }

    const releaseId = item.release_id;
    const cached = releaseDataCache.get(releaseId);
    if (cached) {
      setReleaseData(cached);
      setIsLoadingRelease(false);
      return;
    }

    let stale = false;
    setIsLoadingRelease(true);
    setReleaseData(null);

    proxyFetchRelease({ sessionToken, releaseId })
      .then((data) => {
        if (stale) return;
        const rd = data as ReleaseData;
        releaseDataCache.set(releaseId, rd);
        setReleaseData(rd);
      })
      .catch((err) => {
        if (stale) return;
        console.warn("[WantDetail] Release fetch failed:", err);
      })
      .finally(() => {
        if (!stale) setIsLoadingRelease(false);
      });

    return () => { stale = true; };
  }, [item.release_id, sessionToken]);

  // Auto-correct activeTab when releaseData loads
  useEffect(() => {
    if (!releaseData) return;
    const tabHasData: Record<string, boolean> = {
      tracklist: releaseData.tracklist.length > 0,
      credits: releaseData.credits.length > 0,
      pressing: releaseData.notes.length > 0,
      identifiers: releaseData.identifiers.length > 0,
    };
    if (!tabHasData[activeTab]) {
      const firstWithData = (['tracklist', 'credits', 'pressing', 'identifiers'] as const).find(t => tabHasData[t]);
      if (firstWithData) setActiveTab(firstWithData);
    }
  }, [releaseData]);

  // Group credits by role
  const groupedCredits = useMemo(() => {
    if (!releaseData?.credits.length) return [];
    const map = new Map<string, string[]>();
    for (const c of releaseData.credits) {
      const existing = map.get(c.role);
      if (existing) {
        if (!existing.includes(c.name)) existing.push(c.name);
      } else {
        map.set(c.role, [c.name]);
      }
    }
    return Array.from(map.entries()).map(([role, names]) => ({ role, names }));
  }, [releaseData?.credits]);

  const handleRemove = useCallback(async () => {
    setIsRemoving(true);
    try {
      await removeFromWantList(item.release_id);
      toast.info(`"${item.title}" removed.`);
      onClose();
    } catch (err: any) {
      console.error("[WantDetail] Remove failed:", err);
      toast.error("Remove failed. Try again.");
    } finally {
      setIsRemoving(false);
      setConfirmRemove(false);
    }
  }, [item.release_id, removeFromWantList, onClose]);

  const alreadyInCollection = isInCollection(item.release_id, item.master_id);

  const handleAddToCollection = useCallback(async () => {
    if (isAddingToCollection || alreadyInCollection) return;
    setIsAddingToCollection(true);
    try {
      await addToCollection(item.release_id);
      toast.info(`"${item.title}" added to collection.`);
      onClose();
    } catch (err: any) {
      console.error("[WantDetail] Add to collection failed:", err);
      toast.error("Failed to add. Try again.");
      setIsAddingToCollection(false);
    }
  }, [item.release_id, item.title, isAddingToCollection, alreadyInCollection, addToCollection, onClose]);

  // Enriched data helpers
  const hasTracklist = releaseData && releaseData.tracklist.length > 0;
  const hasCredits = releaseData && releaseData.credits.length > 0;
  const hasPressingNotes = releaseData && releaseData.notes.length > 0;
  const hasCommunity = releaseData && releaseData.community &&
    (releaseData.community.ratingCount > 0 || releaseData.community.have > 0 || releaseData.community.want > 0);
  const allDurationsMissing = !!hasTracklist && releaseData!.tracklist.every(t => !t.duration);
  const releaseImages = releaseData?.images || [];
  const hasImages = releaseImages.length > 1;

  return (
    <>
    <div className="flex flex-col h-full">
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderColor: "var(--c-border-strong)", borderBottomWidth: "1px", borderBottomStyle: "solid" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>
            Wantlist
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{ color: "var(--c-text-muted)" }}><X size={18} /></button>
        </div>
      )}

      <div className={`flex-1${hideHeader ? '' : ' overflow-y-auto'}`}>
        {/* ═══ Hero ═══ */}
        {!hideImage && hideHeader ? (
          /* ── Mobile: hero image with gradient scrim ── */
          <>
            <div className="px-4 pt-3">
              <div className="relative w-full aspect-square rounded-[12px] overflow-hidden" style={{ border: "1px solid var(--c-border-strong)" }}>
                <img src={item.cover} alt={item.title} className="w-full h-full object-cover" />
                {/* Priority bolt overlay */}
                <button
                  onClick={() => toggleWantPriority(item.id)}
                  className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center tappable transition-transform hover:scale-110"
                  style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
                >
                  <Zap size={18} fill={item.priority ? "#EBFD00" : "none"} color={item.priority ? "#EBFD00" : "rgba(255,255,255,0.85)"} />
                </button>
                <div
                  className="absolute inset-x-0 bottom-0 flex flex-col justify-end pb-4 px-4 gap-[3px]"
                  style={{
                    height: "55%",
                    background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.0) 100%)",
                  }}
                >
                  <h2
                    style={{
                      fontSize: "22px",
                      fontWeight: 700,
                      lineHeight: "1.3",
                      fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                      color: "#ffffff",
                      display: "block",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      WebkitTextOverflow: "ellipsis",
                      maxWidth: "100%",
                    }}
                  >{item.title}</h2>
                  <p
                    style={{
                      fontSize: "15px",
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.80)",
                      display: "block",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      WebkitTextOverflow: "ellipsis",
                      maxWidth: "100%",
                    }}
                  >{[item.artist, item.year ? String(item.year) : ""].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
            </div>
            {/* ═══ Image thumbnail strip (mobile) ═══ */}
            {isLoadingRelease && !releaseData && (
              <div className="px-4 mt-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex-shrink-0 rounded-[8px] animate-pulse" style={{ width: 64, height: 64, backgroundColor: "var(--c-border)" }} />
                ))}
              </div>
            )}
            {hasImages && (
              <div className="px-4 mt-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {releaseImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
                    className="flex-shrink-0 rounded-[8px] overflow-hidden tappable"
                    style={{ width: 64, height: 64, border: "1px solid var(--c-border)", flexShrink: 0 }}
                  >
                    <img src={img.uri150} alt={`Image ${idx + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : !hideImage ? (
          /* ── Desktop: padded cover ── */
          <>
            <div className="p-4">
              <div className="relative w-full aspect-square rounded-[12px] overflow-hidden" style={{ border: "1px solid var(--c-border-strong)" }}>
                <img src={item.cover} alt={item.title} className="w-full h-full object-cover" />
                {/* Priority bolt overlay */}
                <button
                  onClick={() => toggleWantPriority(item.id)}
                  className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center tappable transition-transform hover:scale-110"
                  style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
                >
                  <Zap size={18} fill={item.priority ? "#EBFD00" : "none"} color={item.priority ? "#EBFD00" : "rgba(255,255,255,0.85)"} />
                </button>
              </div>
            </div>
            {/* ═══ Image thumbnail strip (desktop) ═══ */}
            {isLoadingRelease && !releaseData && (
              <div className="px-4 mt-3 pb-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex-shrink-0 rounded-[8px] animate-pulse" style={{ width: 64, height: 64, backgroundColor: "var(--c-border)" }} />
                ))}
              </div>
            )}
            {hasImages && (
              <div className="px-4 mt-3 pb-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {releaseImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
                    className="flex-shrink-0 rounded-[8px] overflow-hidden tappable"
                    style={{ width: 64, height: 64, border: "1px solid var(--c-border)", flexShrink: 0 }}
                  >
                    <img src={img.uri150} alt={`Image ${idx + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            )}
            {/* ── Desktop: title / artist block ── */}
            <div className="px-4 pb-4">
              <h2 style={{ fontSize: "20px", fontWeight: 600, lineHeight: "1.3", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>{item.title}</h2>
              <p className="mt-0.5" style={{ fontSize: "16px", fontWeight: 400, color: "var(--c-text-tertiary)" }}>{item.artist}</p>
            </div>
          </>
        ) : null}

        {!hideHeader && hideImage ? (
          /* ── Desktop with hidden image: title / artist + priority bolt block ── */
          <div className="px-4 pb-4">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <h2 style={{ fontSize: "20px", fontWeight: 600, lineHeight: "1.3", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>{item.title}</h2>
                <p className="mt-0.5" style={{ fontSize: "16px", fontWeight: 400, color: "var(--c-text-tertiary)" }}>{item.artist}</p>
              </div>
              <button
                onClick={() => toggleWantPriority(item.id)}
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 mt-1"
              >
                <Zap size={18} fill={item.priority ? "#EBFD00" : "none"} color={item.priority ? "#EBFD00" : "var(--c-text-tertiary)"} />
              </button>
            </div>
          </div>
        ) : null}

        {/* ═══ Action Buttons ═══ */}
        <div className="px-4 pb-4 mt-4 flex flex-col gap-2">
          {/* Collection button */}
          {alreadyInCollection ? (
            <button
              onClick={() => {
                const rid = Number(item.release_id);
                const match = albums.find((a) => Number(a.release_id) === rid) ||
                  (item.master_id && item.master_id > 0 ? albums.find((a) => a.master_id === item.master_id) : undefined);
                if (match) {
                  setSelectedWantItem(null);
                  setSelectedAlbumId(match.id);
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-[10px] tappable transition-colors"
              style={{
                fontSize: "14px",
                fontWeight: 600,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                backgroundColor: "rgba(62, 152, 66, 0.12)",
                color: "#3E9842",
                border: "1px solid rgba(62, 152, 66, 0.2)",
              }}
            >
              <GalleryVerticalEnd size={16} />
              View Your Copy
            </button>
          ) : (
            <button
              onClick={handleAddToCollection}
              disabled={isAddingToCollection}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-[10px] transition-colors tappable"
              style={{
                fontSize: "14px",
                fontWeight: 600,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                backgroundColor: "#EBFD00",
                color: "#0C284A",
                opacity: isAddingToCollection ? 0.7 : 1,
              }}
            >
              {isAddingToCollection ? (
                <>
                  <Disc3 size={15} className="disc-spinner" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Add to Collection
                </>
              )}
            </button>
          )}

          {/* Wantlist button */}
          <DestructiveButton
            label={confirmRemove ? "Confirm Remove" : "Remove from Wantlist"}
            confirming={confirmRemove}
            loading={isRemoving}
            onClick={() => {
              if (!confirmRemove) setConfirmRemove(true);
              else handleRemove();
            }}
          />
        </div>

        {/* Detail rows */}
        <div className="px-4 pb-4">
          <div className="rounded-[10px] p-3 flex flex-col gap-2.5" style={{ backgroundColor: "var(--c-surface-alt)", border: "1px solid var(--c-border-strong)" }}>
            {hasYear(item.year) && <DetailRow label="Year" value={String(item.year)} />}
            <DetailRow label="Label" value={item.label} />
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 1, background: hideHeader ? (isDarkMode ? "#132B44" : "#FFFFFF") : undefined }}>
          {/* ═══ Community (enriched, 3-stat row) ═══ */}
          {isLoadingRelease ? (
            <div className="px-4 pb-6">
              <div className="flex items-start justify-around">
                {[40, 56, 48].map((w, i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5">
                    <div className="rounded-full animate-pulse" style={{ width: "20px", height: "20px", backgroundColor: "var(--c-border)" }} />
                    <div className="rounded-[4px] animate-pulse" style={{ width: `${w}px`, height: "18px", backgroundColor: "var(--c-border)" }} />
                    <div className="rounded-[4px] animate-pulse" style={{ width: "48px", height: "10px", backgroundColor: "var(--c-border)" }} />
                  </div>
                ))}
              </div>
            </div>
          ) : hasCommunity ? (
            <CommunityRow community={releaseData!.community!} />
          ) : null}

          {/* ═══ Enriched Content Tabs ═══ */}
          {(() => {
            const hasIdentifiers = releaseData && releaseData.identifiers.length > 0;
            const anyTabHasData = hasTracklist || hasCredits || hasPressingNotes || hasIdentifiers;
            const isLoading = isLoadingRelease && !releaseData;

            if (!isLoading && !anyTabHasData) return null;

            const tabs = [
              { key: 'tracklist' as const, label: 'Tracklist', hasData: !!hasTracklist },
              { key: 'credits' as const, label: 'Credits', hasData: !!hasCredits },
              { key: 'pressing' as const, label: 'Pressing Notes', hasData: !!hasPressingNotes },
              { key: 'identifiers' as const, label: 'Identifiers', hasData: !!hasIdentifiers },
            ];

            const visibleTabs = isLoading ? tabs : tabs.filter(t => t.hasData);

            return (
              <>
                <div ref={tabSentinelRef} style={{ height: 0, width: "100%", pointerEvents: "none" }} />
                <div
                  className="overflow-x-auto no-scrollbar"
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    backgroundColor: hideHeader ? (isDarkMode ? "#132B44" : "#FFFFFF") : "var(--c-surface)",
                    borderBottom: "1px solid var(--c-border)",
                    paddingTop: tabBarStuck && hideHeader ? "48px" : "0px",
                  }}
                >
                  <div className="flex">
                    {visibleTabs.map((tab) => {
                      const isActive = !isLoading && activeTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => !isLoading && setActiveTab(tab.key)}
                          disabled={isLoading}
                          style={{
                            padding: "8px 16px",
                            fontSize: "13px",
                            fontWeight: 500,
                            color: isLoading ? "var(--c-text-muted)" : isActive ? "var(--c-text)" : "var(--c-text-muted)",
                            opacity: isLoading ? 0.4 : 1,
                            borderBottom: isActive ? "2px solid #EBFD00" : "2px solid transparent",
                            background: "none",
                            cursor: isLoading ? "default" : "pointer",
                            whiteSpace: "nowrap",
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                            flexShrink: 0,
                          }}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3">
                  {isLoading ? (
                    <div className="px-4 pb-6">
                      <EnrichedSkeleton label="" rows={4} />
                    </div>
                  ) : activeTab === 'tracklist' && hasTracklist ? (
                    <TracklistSection
                      tracklist={releaseData!.tracklist}
                      isExpanded={true}
                      onToggle={() => {}}
                      allDurationsMissing={allDurationsMissing}
                      hideToggle
                      hideTitle={hideHeader}
                    />
                  ) : activeTab === 'credits' && hasCredits ? (
                    <CreditsSection groupedCredits={groupedCredits} hideTitle={hideHeader} />
                  ) : activeTab === 'pressing' && hasPressingNotes ? (
                    <PressingNotesSection notes={releaseData!.notes} hideTitle={hideHeader} />
                  ) : activeTab === 'identifiers' && releaseData?.identifiers && releaseData.identifiers.length > 0 ? (
                    <div className="px-4 pb-6">
                      <div className="flex flex-col gap-1.5">
                        {releaseData.identifiers.map((id, i) => (
                          <DetailRow key={`id-${i}`} label={id.type} value={id.value} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            );
          })()}
        </div>

      </div>
    </div>

    {/* ═══ Fullscreen Image Lightbox ═══ */}
    {lightboxOpen && releaseImages.length > 0 && (
      <>
        <div
          className="fixed inset-0"
          style={{ zIndex: 135, backgroundColor: "rgba(0,0,0,0.92)" }}
          onClick={() => setLightboxOpen(false)}
        />
        <div
          className="fixed inset-0 flex flex-col items-center justify-center"
          style={{ zIndex: 140, pointerEvents: "none" }}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute right-4 flex items-center justify-center"
            style={{
              top: "calc(env(safe-area-inset-top, 0px) + 12px)",
              width: 40,
              height: 40,
              color: "white",
              pointerEvents: "auto",
            }}
          >
            <X size={24} />
          </button>
          <div className="relative flex items-center justify-center w-full" style={{ pointerEvents: "auto", paddingLeft: 16, paddingRight: 16 }}>
            <motion.img
              key={lightboxIndex}
              src={releaseImages[lightboxIndex].uri}
              alt={`Image ${lightboxIndex + 1} of ${releaseImages.length}`}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.1}
              onDragEnd={(_, info) => {
                if (info.offset.x < -50 && lightboxIndex < releaseImages.length - 1) {
                  setLightboxIndex(i => i + 1);
                } else if (info.offset.x > 50 && lightboxIndex > 0) {
                  setLightboxIndex(i => i - 1);
                }
              }}
              style={{
                maxWidth: "100%",
                maxHeight: "85vh",
                objectFit: "contain",
                borderRadius: "8px",
                cursor: "grab",
                userSelect: "none",
              }}
            />
          </div>
          {releaseImages.length > 1 ? (
            <div
              className="flex items-center justify-center gap-5 mt-3"
              style={{ pointerEvents: "auto" }}
            >
              <button
                onClick={() => setLightboxIndex(i => i - 1)}
                disabled={lightboxIndex === 0}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "rgba(255,255,255,0.8)",
                  opacity: lightboxIndex === 0 ? 0.3 : 1,
                }}
              >
                <ChevronLeft size={20} />
              </button>
              <p style={{ fontSize: "13px", fontWeight: 400, color: "rgba(255,255,255,0.5)", minWidth: "48px", textAlign: "center" }}>
                {lightboxIndex + 1} / {releaseImages.length}
              </p>
              <button
                onClick={() => setLightboxIndex(i => i + 1)}
                disabled={lightboxIndex === releaseImages.length - 1}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "rgba(255,255,255,0.8)",
                  opacity: lightboxIndex === releaseImages.length - 1 ? 0.3 : 1,
                }}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          ) : (
            <p
              className="mt-3"
              style={{ fontSize: "13px", fontWeight: 400, color: "rgba(255,255,255,0.5)", pointerEvents: "none" }}
            >
              {lightboxIndex + 1} / {releaseImages.length}
            </p>
          )}
        </div>
      </>
    )}
    </>
  );
}

/* ─── Release Detail Panel (non-collection albums: feed, following) ─── */

function ReleaseDetailPanel({
  album,
  hideHeader = false,
  hideImage = false,
  onClose,
}: {
  album: FeedAlbum;
  hideHeader?: boolean;
  hideImage?: boolean;
  onClose: () => void;
}) {
  const {
    sessionToken, isDarkMode, isInWants, isInCollection,
    addToWantList, removeFromWantList, addToCollection,
    albums, setSelectedAlbumId, setSelectedFeedAlbum,
  } = useApp();
  const proxyFetchRelease = useAction(api.discogs.proxyFetchRelease);

  // Enriched release data state
  const [releaseData, setReleaseData] = useState<ReleaseData | null>(null);
  const [isLoadingRelease, setIsLoadingRelease] = useState(false);

  // Enriched content tab state
  const [activeTab, setActiveTab] = useState<'tracklist' | 'credits' | 'pressing' | 'identifiers'>('tracklist');

  // Tab bar sticky sentinel
  const tabSentinelRef = useRef<HTMLDivElement>(null);
  const [tabBarStuck, setTabBarStuck] = useState(false);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Action states
  const [isAddingToCollection, setIsAddingToCollection] = useState(false);
  const [isAddingToWantlist, setIsAddingToWantlist] = useState(false);
  const [confirmRemoveWant, setConfirmRemoveWant] = useState(false);
  const [isRemovingWant, setIsRemovingWant] = useState(false);

  // Reset state when album changes
  useEffect(() => {
    setActiveTab('tracklist');
    setLightboxOpen(false);
    setLightboxIndex(0);
    setTabBarStuck(false);
    setIsAddingToCollection(false);
    setIsAddingToWantlist(false);
    setConfirmRemoveWant(false);
    setIsRemovingWant(false);
  }, [album.release_id]);

  // IntersectionObserver for tab bar sticky
  useEffect(() => {
    const sentinel = tabSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setTabBarStuck(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [album.release_id]);

  // Fetch enriched release data
  useEffect(() => {
    if (!sessionToken) {
      setReleaseData(null);
      setIsLoadingRelease(false);
      return;
    }

    const releaseId = album.release_id;
    const cached = releaseDataCache.get(releaseId);
    if (cached) {
      setReleaseData(cached);
      setIsLoadingRelease(false);
      return;
    }

    let stale = false;
    setIsLoadingRelease(true);
    setReleaseData(null);

    proxyFetchRelease({ sessionToken, releaseId })
      .then((data) => {
        if (stale) return;
        const rd = data as ReleaseData;
        releaseDataCache.set(releaseId, rd);
        setReleaseData(rd);
      })
      .catch((err) => {
        if (stale) return;
        console.warn("[ReleaseDetail] Release fetch failed:", err);
      })
      .finally(() => {
        if (!stale) setIsLoadingRelease(false);
      });

    return () => { stale = true; };
  }, [album.release_id, sessionToken]);

  // Auto-correct activeTab when releaseData loads
  useEffect(() => {
    if (!releaseData) return;
    const tabHasData: Record<string, boolean> = {
      tracklist: releaseData.tracklist.length > 0,
      credits: releaseData.credits.length > 0,
      pressing: releaseData.notes.length > 0,
      identifiers: releaseData.identifiers.length > 0,
    };
    if (!tabHasData[activeTab]) {
      const firstWithData = (['tracklist', 'credits', 'pressing', 'identifiers'] as const).find(t => tabHasData[t]);
      if (firstWithData) setActiveTab(firstWithData);
    }
  }, [releaseData]);

  // Group credits by role
  const groupedCredits = useMemo(() => {
    if (!releaseData?.credits.length) return [];
    const map = new Map<string, string[]>();
    for (const c of releaseData.credits) {
      const existing = map.get(c.role);
      if (existing) {
        if (!existing.includes(c.name)) existing.push(c.name);
      } else {
        map.set(c.role, [c.name]);
      }
    }
    return Array.from(map.entries()).map(([role, names]) => ({ role, names }));
  }, [releaseData?.credits]);

  const alreadyInCollection = isInCollection(album.release_id, album.master_id);
  const alreadyOnWantlist = isInWants(album.release_id, album.master_id);

  const handleAddToCollection = useCallback(async () => {
    if (isAddingToCollection || alreadyInCollection) return;
    setIsAddingToCollection(true);
    try {
      await addToCollection(album.release_id);
      toast.info(`"${album.title}" added to collection.`);
      onClose();
    } catch (err: any) {
      console.error("[ReleaseDetail] Add to collection failed:", err);
      toast.error("Failed to add. Try again.");
      setIsAddingToCollection(false);
    }
  }, [album.release_id, album.title, isAddingToCollection, alreadyInCollection, addToCollection, onClose]);

  const handleAddToWantlist = useCallback(async () => {
    if (isAddingToWantlist || alreadyOnWantlist) return;
    setIsAddingToWantlist(true);
    try {
      await addToWantList({
        id: `w-${album.release_id}`,
        release_id: album.release_id,
        master_id: album.master_id,
        title: album.title,
        artist: album.artist,
        year: album.year,
        thumb: album.thumb,
        cover: album.cover,
        label: album.label,
        priority: false,
      });
      toast.info(`"${album.title}" added to Wantlist.`);
    } catch (err: any) {
      console.error("[ReleaseDetail] Add to wantlist failed:", err);
      toast.error("Failed to add. Try again.");
    } finally {
      setIsAddingToWantlist(false);
    }
  }, [album, isAddingToWantlist, alreadyOnWantlist, addToWantList]);

  const handleRemoveFromWantlist = useCallback(async () => {
    setIsRemovingWant(true);
    try {
      await removeFromWantList(album.release_id);
      toast.info(`"${album.title}" removed from Wantlist.`);
      setConfirmRemoveWant(false);
    } catch (err: any) {
      console.error("[ReleaseDetail] Remove from wantlist failed:", err);
      toast.error("Remove failed. Try again.");
    } finally {
      setIsRemovingWant(false);
    }
  }, [album.release_id, album.title, removeFromWantList]);

  // Enriched data helpers
  const hasTracklist = releaseData && releaseData.tracklist.length > 0;
  const hasCredits = releaseData && releaseData.credits.length > 0;
  const hasPressingNotes = releaseData && releaseData.notes.length > 0;
  const hasCommunity = releaseData && releaseData.community &&
    (releaseData.community.ratingCount > 0 || releaseData.community.have > 0 || releaseData.community.want > 0);
  const releaseImages = releaseData?.images || [];
  const hasImages = releaseImages.length > 1;
  const allDurationsMissing = !!hasTracklist && releaseData!.tracklist.every(t => !t.duration);

  return (
    <>
    <div className="flex flex-col h-full">
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderColor: "var(--c-border-strong)", borderBottomWidth: "1px", borderBottomStyle: "solid" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>
            Release Details
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{ color: "var(--c-text-muted)" }}><X size={18} /></button>
        </div>
      )}

      <div className={`flex-1${hideHeader ? '' : ' overflow-y-auto'}`}>
        {/* ═══ Hero ═══ */}
        {!hideImage && hideHeader ? (
          /* ── Mobile: hero image with gradient scrim ── */
          <>
            <div className="px-4 pt-3">
              <div className="relative w-full aspect-square rounded-[12px] overflow-hidden" style={{ border: "1px solid var(--c-border-strong)" }}>
                <img src={album.cover} alt={album.title} className="w-full h-full object-cover" />
                <div
                  className="absolute inset-x-0 bottom-0 flex flex-col justify-end pb-4 px-4 gap-[3px]"
                  style={{
                    height: "55%",
                    background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.0) 100%)",
                  }}
                >
                  <h2
                    style={{
                      fontSize: "22px",
                      fontWeight: 700,
                      lineHeight: "1.3",
                      fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                      color: "#ffffff",
                      display: "block",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      WebkitTextOverflow: "ellipsis",
                      maxWidth: "100%",
                    }}
                  >{album.title}</h2>
                  <p
                    style={{
                      fontSize: "15px",
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.80)",
                      display: "block",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      WebkitTextOverflow: "ellipsis",
                      maxWidth: "100%",
                    }}
                  >{[album.artist, album.year ? String(album.year) : ""].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
            </div>
            {/* ═══ Image thumbnail strip (mobile) ═══ */}
            {isLoadingRelease && !releaseData && (
              <div className="px-4 mt-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex-shrink-0 rounded-[8px] animate-pulse" style={{ width: 64, height: 64, backgroundColor: "var(--c-border)" }} />
                ))}
              </div>
            )}
            {hasImages && (
              <div className="px-4 mt-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {releaseImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
                    className="flex-shrink-0 rounded-[8px] overflow-hidden tappable"
                    style={{ width: 64, height: 64, border: "1px solid var(--c-border)", flexShrink: 0 }}
                  >
                    <img src={img.uri150} alt={`Image ${idx + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : !hideImage ? (
          /* ── Desktop: padded cover ── */
          <>
            <div className="p-4">
              <div className="w-full aspect-square rounded-[12px] overflow-hidden" style={{ border: "1px solid var(--c-border-strong)" }}>
                <img src={album.cover} alt={album.title} className="w-full h-full object-cover" />
              </div>
            </div>
            {/* ═══ Image thumbnail strip (desktop) ═══ */}
            {isLoadingRelease && !releaseData && (
              <div className="px-4 mt-3 pb-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex-shrink-0 rounded-[8px] animate-pulse" style={{ width: 64, height: 64, backgroundColor: "var(--c-border)" }} />
                ))}
              </div>
            )}
            {hasImages && (
              <div className="px-4 mt-3 pb-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {releaseImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
                    className="flex-shrink-0 rounded-[8px] overflow-hidden tappable"
                    style={{ width: 64, height: 64, border: "1px solid var(--c-border)", flexShrink: 0 }}
                  >
                    <img src={img.uri150} alt={`Image ${idx + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            )}
            {/* ── Desktop: title / artist block ── */}
            <div className="px-4 pb-4">
              <h2 style={{ fontSize: "20px", fontWeight: 600, lineHeight: "1.3", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>{album.title}</h2>
              <p className="mt-0.5" style={{ fontSize: "16px", fontWeight: 400, color: "var(--c-text-tertiary)" }}>{album.artist}</p>
            </div>
          </>
        ) : null}

        {!hideHeader && hideImage ? (
          <div className="px-4 pb-4">
            <h2 style={{ fontSize: "20px", fontWeight: 600, lineHeight: "1.3", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>{album.title}</h2>
            <p className="mt-0.5" style={{ fontSize: "16px", fontWeight: 400, color: "var(--c-text-tertiary)" }}>{album.artist}</p>
          </div>
        ) : null}

        {/* ═══ Action Buttons ═══ */}
        <div className="px-4 pb-4 mt-4 flex flex-col gap-2">
          {/* Collection button */}
          {alreadyInCollection ? (
            <button
              onClick={() => {
                const rid = Number(album.release_id);
                const match = albums.find((a) => Number(a.release_id) === rid) ||
                  (album.master_id && album.master_id > 0 ? albums.find((a) => a.master_id === album.master_id) : undefined);
                if (match) {
                  setSelectedFeedAlbum(null);
                  setSelectedAlbumId(match.id);
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-[10px] tappable transition-colors"
              style={{
                fontSize: "14px",
                fontWeight: 600,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                backgroundColor: "rgba(62, 152, 66, 0.12)",
                color: "#3E9842",
                border: "1px solid rgba(62, 152, 66, 0.2)",
              }}
            >
              <GalleryVerticalEnd size={16} />
              View Your Copy
            </button>
          ) : (
            <button
              onClick={handleAddToCollection}
              disabled={isAddingToCollection}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-[10px] transition-colors tappable"
              style={{
                fontSize: "14px",
                fontWeight: 600,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                backgroundColor: "var(--c-surface)",
                border: "1px solid var(--c-border-strong)",
                color: "var(--c-text)",
                opacity: isAddingToCollection ? 0.7 : 1,
              }}
            >
              {isAddingToCollection ? (
                <>
                  <Disc3 size={15} className="disc-spinner" />
                  Adding...
                </>
              ) : (
                "Add to Collection"
              )}
            </button>
          )}

          {/* Wantlist button */}
          {alreadyOnWantlist ? (
            <DestructiveButton
              label={confirmRemoveWant ? "Confirm Remove" : "Remove from Wantlist"}
              confirming={confirmRemoveWant}
              loading={isRemovingWant}
              variant="neutral"
              onClick={() => {
                if (!confirmRemoveWant) setConfirmRemoveWant(true);
                else handleRemoveFromWantlist();
              }}
            />
          ) : (
            <button
              onClick={handleAddToWantlist}
              disabled={isAddingToWantlist}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-[10px] transition-colors tappable"
              style={{
                fontSize: "14px",
                fontWeight: 600,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                backgroundColor: "var(--c-surface)",
                border: "1px solid var(--c-border-strong)",
                color: "var(--c-text)",
                opacity: isAddingToWantlist ? 0.7 : 1,
              }}
            >
              {isAddingToWantlist ? (
                <>
                  <Disc3 size={15} className="disc-spinner" />
                  Adding...
                </>
              ) : (
                "Add to Wantlist"
              )}
            </button>
          )}
        </div>

        {/* ═══ Detail rows ═══ */}
        <div className="px-4 pb-4">
          <div className="rounded-[10px] p-3 flex flex-col gap-2.5" style={{ backgroundColor: "var(--c-surface-alt)", border: "1px solid var(--c-border-strong)" }}>
            {hasYear(album.year) && <DetailRow label="Year" value={String(album.year)} />}
            <DetailRow label="Label" value={album.label} />
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 1, background: hideHeader ? (isDarkMode ? "#132B44" : "#FFFFFF") : undefined }}>
          {/* ═══ Community (enriched, 3-stat row) ═══ */}
          {isLoadingRelease ? (
            <div className="px-4 pb-6">
              <div className="flex items-start justify-around">
                {[40, 56, 48].map((w, i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5">
                    <div className="rounded-full animate-pulse" style={{ width: "20px", height: "20px", backgroundColor: "var(--c-border)" }} />
                    <div className="rounded-[4px] animate-pulse" style={{ width: `${w}px`, height: "18px", backgroundColor: "var(--c-border)" }} />
                    <div className="rounded-[4px] animate-pulse" style={{ width: "48px", height: "10px", backgroundColor: "var(--c-border)" }} />
                  </div>
                ))}
              </div>
            </div>
          ) : hasCommunity ? (
            <CommunityRow community={releaseData!.community!} />
          ) : null}

          {/* ═══ Research Links ═══ */}
          <div className="px-4 pb-6 grid grid-cols-2 gap-2">
            <button
              onClick={() => window.open(`https://www.discogs.com/sell/history/${album.release_id}`, '_blank', 'noopener,noreferrer')}
              className="flex flex-col items-center gap-1.5 py-3 rounded-[10px] transition-opacity hover:opacity-80"
              style={{
                backgroundColor: "var(--c-surface-alt)",
                border: "1px solid var(--c-border)",
                color: "var(--c-text-secondary)",
              }}
            >
              <History size={20} />
              <span style={{ fontSize: "11px", fontWeight: 500, textAlign: "center", lineHeight: "1.3", color: "var(--c-text-muted)" }}>Sold History</span>
            </button>
            <a
              href={`https://www.popsike.com/php/quicksearch.php?searchtext=${encodeURIComponent(`${album.artist} ${album.title}`)}&x=0&y=0`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 py-3 rounded-[10px] transition-opacity hover:opacity-80"
              style={{
                backgroundColor: "var(--c-surface-alt)",
                border: "1px solid var(--c-border)",
                color: "var(--c-text-secondary)",
              }}
            >
              <Gavel size={20} />
              <span style={{ fontSize: "11px", fontWeight: 500, textAlign: "center", lineHeight: "1.3", color: "var(--c-text-muted)" }}>Auction History</span>
            </a>
          </div>

          {/* ═══ Enriched Content Tabs ═══ */}
          {(() => {
            const hasIdentifiers = releaseData && releaseData.identifiers.length > 0;
            const anyTabHasData = hasTracklist || hasCredits || hasPressingNotes || hasIdentifiers;
            const isLoading = isLoadingRelease && !releaseData;

            if (!isLoading && !anyTabHasData) return null;

            const tabs = [
              { key: 'tracklist' as const, label: 'Tracklist', hasData: !!hasTracklist },
              { key: 'credits' as const, label: 'Credits', hasData: !!hasCredits },
              { key: 'pressing' as const, label: 'Pressing Notes', hasData: !!hasPressingNotes },
              { key: 'identifiers' as const, label: 'Identifiers', hasData: !!hasIdentifiers },
            ];

            const visibleTabs = isLoading ? tabs : tabs.filter(t => t.hasData);

            return (
              <>
                <div ref={tabSentinelRef} style={{ height: 0, width: "100%", pointerEvents: "none" }} />
                <div
                  className="overflow-x-auto no-scrollbar"
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    backgroundColor: hideHeader ? (isDarkMode ? "#132B44" : "#FFFFFF") : "var(--c-surface)",
                    borderBottom: "1px solid var(--c-border)",
                    paddingTop: tabBarStuck && hideHeader ? "48px" : "0px",
                  }}
                >
                  <div className="flex">
                    {visibleTabs.map((tab) => {
                      const isActive = !isLoading && activeTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => !isLoading && setActiveTab(tab.key)}
                          disabled={isLoading}
                          style={{
                            padding: "8px 16px",
                            fontSize: "13px",
                            fontWeight: 500,
                            color: isLoading ? "var(--c-text-muted)" : isActive ? "var(--c-text)" : "var(--c-text-muted)",
                            opacity: isLoading ? 0.4 : 1,
                            borderBottom: isActive ? "2px solid #EBFD00" : "2px solid transparent",
                            background: "none",
                            cursor: isLoading ? "default" : "pointer",
                            whiteSpace: "nowrap",
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                            flexShrink: 0,
                          }}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3">
                  {isLoading ? (
                    <div className="px-4 pb-6">
                      <EnrichedSkeleton label="" rows={4} />
                    </div>
                  ) : activeTab === 'tracklist' && hasTracklist ? (
                    <TracklistSection
                      tracklist={releaseData!.tracklist}
                      isExpanded={true}
                      onToggle={() => {}}
                      allDurationsMissing={allDurationsMissing}
                      hideToggle
                      hideTitle={hideHeader}
                    />
                  ) : activeTab === 'credits' && hasCredits ? (
                    <CreditsSection groupedCredits={groupedCredits} hideTitle={hideHeader} />
                  ) : activeTab === 'pressing' && hasPressingNotes ? (
                    <PressingNotesSection notes={releaseData!.notes} hideTitle={hideHeader} />
                  ) : activeTab === 'identifiers' && releaseData?.identifiers && releaseData.identifiers.length > 0 ? (
                    <div className="px-4 pb-6">
                      <div className="flex flex-col gap-1.5">
                        {releaseData.identifiers.map((id, i) => (
                          <DetailRow key={`id-${i}`} label={id.type} value={id.value} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>

    {/* ═══ Fullscreen Image Lightbox ═══ */}
    {lightboxOpen && releaseImages.length > 0 && (
      <>
        <div
          className="fixed inset-0"
          style={{ zIndex: 135, backgroundColor: "rgba(0,0,0,0.92)" }}
          onClick={() => setLightboxOpen(false)}
        />
        <div
          className="fixed inset-0 flex flex-col items-center justify-center"
          style={{ zIndex: 140, pointerEvents: "none" }}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute right-4 flex items-center justify-center"
            style={{
              top: "calc(env(safe-area-inset-top, 0px) + 12px)",
              width: 40,
              height: 40,
              color: "white",
              pointerEvents: "auto",
            }}
          >
            <X size={24} />
          </button>

          <div className="relative flex items-center justify-center w-full" style={{ pointerEvents: "auto", paddingLeft: 16, paddingRight: 16 }}>
            <motion.img
              key={lightboxIndex}
              src={releaseImages[lightboxIndex].uri}
              alt={`Image ${lightboxIndex + 1} of ${releaseImages.length}`}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.1}
              onDragEnd={(_, info) => {
                if (info.offset.x < -50 && lightboxIndex < releaseImages.length - 1) {
                  setLightboxIndex(i => i + 1);
                } else if (info.offset.x > 50 && lightboxIndex > 0) {
                  setLightboxIndex(i => i - 1);
                }
              }}
              style={{
                maxWidth: "100%",
                maxHeight: "85vh",
                objectFit: "contain",
                borderRadius: "8px",
                cursor: "grab",
                userSelect: "none",
              }}
            />
          </div>

          {releaseImages.length > 1 ? (
            <div
              className="flex items-center justify-center gap-5 mt-3"
              style={{ pointerEvents: "auto" }}
            >
              <button
                onClick={() => setLightboxIndex(i => i - 1)}
                disabled={lightboxIndex === 0}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "rgba(255,255,255,0.8)",
                  opacity: lightboxIndex === 0 ? 0.3 : 1,
                }}
              >
                <ChevronLeft size={20} />
              </button>
              <p
                style={{ fontSize: "13px", fontWeight: 400, color: "rgba(255,255,255,0.5)", minWidth: "48px", textAlign: "center" }}
              >
                {lightboxIndex + 1} / {releaseImages.length}
              </p>
              <button
                onClick={() => setLightboxIndex(i => i + 1)}
                disabled={lightboxIndex === releaseImages.length - 1}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "rgba(255,255,255,0.8)",
                  opacity: lightboxIndex === releaseImages.length - 1 ? 0.3 : 1,
                }}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          ) : (
            <p
              className="mt-3"
              style={{ fontSize: "13px", fontWeight: 400, color: "rgba(255,255,255,0.5)", pointerEvents: "none" }}
            >
              {lightboxIndex + 1} / {releaseImages.length}
            </p>
          )}
        </div>
      </>
    )}
    </>
  );
}

export function AlbumDetailSheet({ shakeEntrance = false }: { shakeEntrance?: boolean }) {
  const { setShowAlbumDetail, setSelectedAlbumId, setSelectedWantItem, setSelectedFeedAlbum } = useApp();
  const handleClose = useCallback(() => {
    setShowAlbumDetail(false);
    setSelectedAlbumId(null);
    setSelectedWantItem(null);
    setSelectedFeedAlbum(null);
  }, [setShowAlbumDetail, setSelectedAlbumId, setSelectedWantItem, setSelectedFeedAlbum]);
  return (
    <div className="lg:hidden">
      <SlideOutPanel
        onClose={handleClose}
        backdropZIndex={110}
        sheetZIndex={120}
        shakeEntrance={shakeEntrance}
      >
        <AlbumDetailPanel hideHeader />
      </SlideOutPanel>
    </div>
  );
}
