import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type React from "react";
import { X, ExternalLink, Check, Plus, Play, Bookmark, Pencil, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SlideOutPanel } from "./slide-out-panel";
import { toast } from "sonner";
import { useApp } from "./app-context";
import { MarketValueSection } from "./market-value";
import { purgeTagColor as getPurgeColor, purgeTagTint, purgeButtonBg, purgeButtonText, purgeToast, purgeClearToast } from "./purge-colors";
import { formatDateShort, isToday } from "./last-played-utils";
import { EASE_OUT, EASE_IN_OUT, DURATION_FAST, DURATION_NORMAL, DURATION_SLOW } from "./motion-tokens";
import { AccordionSection } from "./accordion-section";
import { CONDITION_GRADES, updateCollectionInstance, moveToFolder } from "./discogs-api";

/* ─── Condition grade → color spectrum ─── */
/* Maps vinyl grading scale to a pink→blue→green spectrum using the purge palette:
   P/F = pink (poor/fair), G/G+ = pink-blue, VG = blue, VG+ = blue-green, NM/M = green */
function conditionColor(grade: string, isDarkMode: boolean): string | undefined {
  // Extract abbreviation from parentheses BEFORE stripping (handles "NM or M-" etc.)
  const rawParen = grade.match(/\(([^)]+)\)/);
  let key: string;
  if (rawParen) {
    key = rawParen[1].trim().split(/\s/)[0].toUpperCase();
  } else {
    key = grade.trim().toUpperCase().replace(/[\s-]/g, "");
  }
  const spectrum: Record<string, { dark: string; light: string }> = {
    "M":    { dark: "#3E9842", light: "#2D7A31" },
    "MINT": { dark: "#3E9842", light: "#2D7A31" },
    "NM":   { dark: "#3E9842", light: "#2D7A31" },
    "NEARMINT": { dark: "#3E9842", light: "#2D7A31" },
    "VG+":  { dark: "#5FBFA0", light: "#1A7A5A" },
    "VG":   { dark: "#ACDEF2", light: "#00527A" },
    "VERYGOOD+": { dark: "#5FBFA0", light: "#1A7A5A" },
    "VERYGOOD":  { dark: "#ACDEF2", light: "#00527A" },
    "G+":   { dark: "#C9A0E0", light: "#7A3A9A" },
    "GOOD+": { dark: "#C9A0E0", light: "#7A3A9A" },
    "G":    { dark: "#E88CC4", light: "#9A207C" },
    "GOOD": { dark: "#E88CC4", light: "#9A207C" },
    "F":    { dark: "#FF98DA", light: "#9A207C" },
    "FAIR": { dark: "#FF98DA", light: "#9A207C" },
    "P":    { dark: "#FF98DA", light: "#9A207C" },
    "POOR": { dark: "#FF98DA", light: "#9A207C" },
  };
  const entry = spectrum[key];
  if (!entry) return undefined;
  return isDarkMode ? entry.dark : entry.light;
}

/* Bottom sheet safe area standard:
   - Outer container bottom: 0, paddingBottom: env(safe-area-inset-bottom, 16px)
   - Inner scroll content paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 120px)
   - Ensures no gap on notched iOS devices in PWA mode */

interface EditFields {
  mediaCondition: string;
  sleeveCondition: string;
  notes: string;
  folder: string;
}

export function AlbumDetailPanel({ hideHeader = false, hideImage = false }: { hideHeader?: boolean; hideImage?: boolean }) {
  const {
    selectedAlbum, setShowAlbumDetail, setSelectedAlbumId, setPurgeTag, discogsToken,
    lastPlayed, markPlayed, isDarkMode,
    // Session picker
    isAlbumInAnySession, mostRecentSessionId,
    // Inline session list
    sessions,
    isInSession, toggleAlbumInSession, createSessionDirect,
    // Edit
    albums, isSyncing, discogsAuth, discogsUsername, updateAlbum,
    folders,
  } = useApp();
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
  });
  const [isSaving, setIsSaving] = useState(false);

  // Reset all state when album changes
  useEffect(() => {
    setJustPlayed(false);
    setSessionListExpanded(false);
    setShowNewSession(false);
    setNewSessionName("");
    autoCheckedRef.current = null;
    setIsEditMode(false);
    setIsSaving(false);
  }, [selectedAlbum?.id]);

  // Enter edit mode — initialize form fields from current album
  const enterEditMode = useCallback(() => {
    if (!selectedAlbum) return;
    setEditFields({
      mediaCondition: selectedAlbum.mediaCondition || "",
      sleeveCondition: selectedAlbum.sleeveCondition || "",
      notes: selectedAlbum.notes || "",
      folder: selectedAlbum.folder || "",
    });
    setIsEditMode(true);
  }, [selectedAlbum]);

  // Cancel edit — revert to view mode
  const cancelEdit = useCallback(() => {
    setIsEditMode(false);
    setIsSaving(false);
  }, []);

  // Derive available folders (exclude "All") with their IDs for the move API
  const folderOptions = useMemo(() => {
    const seen = new Map<string, number>();
    for (const a of albums) {
      if (!seen.has(a.folder) && a.folder_id > 0) {
        seen.set(a.folder, a.folder_id);
      }
    }
    return Array.from(seen.entries())
      .map(([name, id]) => ({ name, id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [albums]);

  // Save handler
  const handleSave = useCallback(async () => {
    if (!selectedAlbum || !discogsAuth || !discogsUsername) return;
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

      const folderChanged = editFields.folder !== selectedAlbum.folder;
      const newFolderEntry = folderOptions.find(f => f.name === editFields.folder);

      if (conditionOrNotesChanged) {
        await updateCollectionInstance(
          discogsUsername,
          selectedAlbum.release_id,
          selectedAlbum.instance_id,
          fieldsChanged,
          discogsAuth
        );
      }

      let newInstanceId = selectedAlbum.instance_id;
      let newFolderId = selectedAlbum.folder_id;

      if (folderChanged && newFolderEntry) {
        const result = await moveToFolder(
          discogsUsername,
          selectedAlbum.folder_id,
          newFolderEntry.id,
          selectedAlbum.release_id,
          selectedAlbum.instance_id,
          discogsAuth
        );
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
    selectedAlbum, discogsAuth, discogsUsername,
    editFields, folderOptions, updateAlbum,
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
    toast.info(`Played "${selectedAlbum.title}"`, { duration: 1500 });
    setTimeout(() => setJustPlayed(false), 1200);
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

  return (
    <div className="flex flex-col h-full">
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderColor: "var(--c-border-strong)", borderBottomWidth: "1px", borderBottomStyle: "solid" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>
            {isEditMode ? "Edit Album" : "Album Details"}
          </h3>
          <div className="flex items-center gap-1">
            {editButton}
            {!isEditMode && (
              <button onClick={() => { setShowAlbumDetail(false); setSelectedAlbumId(null); }} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{ color: "var(--c-text-muted)" }}><X size={18} /></button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {!hideImage && (
        <div className="p-4">
          <div className="w-full aspect-square rounded-[12px] overflow-hidden" style={{ border: "1px solid var(--c-border-strong)" }}>
            <img src={selectedAlbum.cover} alt={selectedAlbum.title} className="w-full h-full object-cover" />
          </div>
        </div>
        )}

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
            {/* Mobile: edit button lives in the title row (hideHeader=true) */}
            {hideHeader && editButton}
          </div>
        </div>

        {/* ═══ Edit form / Detail rows ═══ */}
        {isEditMode ? (
          <div className="px-4 pb-4">
            <div className="rounded-[10px] p-3 flex flex-col gap-3" style={{ backgroundColor: "var(--c-surface-alt)", border: "1px solid var(--c-border-strong)" }}>
              {/* Static read-only rows */}
              <DetailRow label="Year" value={String(selectedAlbum.year)} />
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
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    outline: "none",
                    width: "100%",
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
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    outline: "none",
                    width: "100%",
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
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    outline: "none",
                    width: "100%",
                  }}
                >
                  <option value="">Not set</option>
                  {CONDITION_GRADES.map((grade) => (
                    <option key={grade} value={grade}>{grade}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
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
                    <Loader2 size={15} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ═══ Detail rows ═══ */}
            <div className="px-4 pb-4">
              <div className="rounded-[10px] p-3 flex flex-col gap-2.5" style={{ backgroundColor: "var(--c-surface-alt)", border: "1px solid var(--c-border-strong)" }}>
                <DetailRow label="Year" value={String(selectedAlbum.year)} />
                <DetailRow label="Label" value={selectedAlbum.label} />
                <DetailRow label="Catalog #" value={selectedAlbum.catalogNumber} />
                <DetailRow label="Format" value={selectedAlbum.format} />
                <DetailRow label="Folder" value={selectedAlbum.folder} />
                <DetailRow label="Media" value={selectedAlbum.mediaCondition} valueColor={conditionColor(selectedAlbum.mediaCondition, isDarkMode)} />
                <DetailRow label="Sleeve" value={selectedAlbum.sleeveCondition} valueColor={conditionColor(selectedAlbum.sleeveCondition, isDarkMode)} />
                {selectedAlbum.pricePaid && <DetailRow label="Paid" value={selectedAlbum.pricePaid} />}
                {/* Render any user-defined custom fields (e.g. "Acquired From", "Last Cleaned") */}
                {selectedAlbum.customFields?.map((cf, i) => (
                  <DetailRow key={`cf-${i}`} label={cf.name} value={cf.value} />
                ))}
              </div>
            </div>

            {selectedAlbum.notes && (
              <div className="px-4 pb-4">
                <p className="uppercase tracking-wider mb-1.5" style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>Notes</p>
                <p style={{ fontSize: "14px", fontWeight: 400, lineHeight: "1.6", color: "var(--c-text-secondary)" }}>{selectedAlbum.notes}</p>
              </div>
            )}
          </>
        )}

        {!isEditMode && (
          <>
            <div className="px-4 pb-4">
              <a href={selectedAlbum.discogsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[#0078B4] hover:underline" style={{ fontSize: "14px", fontWeight: 500 }}>
                View on Discogs<ExternalLink size={14} />
              </a>
            </div>

            {/* ═══ Mark as Played button ═══ */}
            <div className="px-4 pb-4">
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
              <p className="mt-2 text-center flex items-center justify-center gap-1.5" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
                {playedToday ? (
                  <>
                    <Check size={12} style={{ color: isDarkMode ? "#ACDEF2" : "#00527A" }} />
                    <span style={{ color: isDarkMode ? "#ACDEF2" : "#00527A", fontWeight: 500 }}>Played today</span>
                  </>
                ) : albumLastPlayed ? (
                  <>Last played {formatDateShort(albumLastPlayed)}</>
                ) : (
                  <>No plays logged</>
                )}
              </p>
            </div>

            <MarketValueSection album={selectedAlbum} token={discogsToken} />

            {/* ═══ Sessions bookmark ═══ */}
            <AccordionSection
              label={inAnySession ? "Saved" : "Save for Later"}
              icon={
                <Bookmark
                  size={16}
                  style={{ color: inAnySession ? (isDarkMode ? "#ACDEF2" : "#00527A") : "var(--c-text-secondary)" }}
                  {...(inAnySession ? { fill: "currentColor" } : {})}
                />
              }
              isExpanded={sessionListExpanded}
              onToggle={() => setSessionListExpanded((v) => !v)}
            >
              {/* All sessions sorted by recency */}
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

              {/* New Session row */}
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
            </AccordionSection>

            {/* ═══ Rate for Purge ═══ */}
            <div className="px-4 pb-6">
              <p
                className="mb-2"
                style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text-secondary)" }}
              >
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
                        if (t) purgeToast(t, isDarkMode);
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
  );
}

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="flex-shrink-0" style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-muted)" }}>{label}</span>
      <span className="text-right" style={{ fontSize: "13px", fontWeight: valueColor ? 500 : 400, color: valueColor || "var(--c-text)" }}>{value}</span>
    </div>
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

export function AlbumDetailSheet({ shakeEntrance = false }: { shakeEntrance?: boolean }) {
  const { setShowAlbumDetail } = useApp();
  return (
    <div className="lg:hidden">
      <SlideOutPanel
        onClose={() => setShowAlbumDetail(false)}
        backdropZIndex={110}
        sheetZIndex={120}
        shakeEntrance={shakeEntrance}
      >
        <AlbumDetailPanel hideHeader />
      </SlideOutPanel>
    </div>
  );
}
