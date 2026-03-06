import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, Pencil, Trash2, Plus, Lock, Disc3, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useApp } from "./app-context";
import { EASE_OUT, DURATION_NORMAL } from "./motion-tokens";

interface FoldersScreenProps {
  onBack: () => void;
}

export function FoldersScreen({ onBack }: FoldersScreenProps) {
  const { folders, createFolder, renameFolder, deleteFolder, fetchFolders, isDarkMode } = useApp();

  // ── Local state ──
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  // Fetch fresh folder data on mount
  useEffect(() => {
    setIsFetching(true);
    fetchFolders().finally(() => setIsFetching(false));
  }, [fetchFolders]);

  // Focus edit input when entering edit mode
  useEffect(() => {
    if (editingFolderId !== null) {
      setTimeout(() => editInputRef.current?.focus(), 50);
    }
  }, [editingFolderId]);

  // Focus new folder input when shown
  useEffect(() => {
    if (showNewFolder) {
      setTimeout(() => newInputRef.current?.focus(), 50);
    }
  }, [showNewFolder]);

  // ── Handlers ──

  const handleCreate = useCallback(async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed || isCreating) return;
    setIsCreating(true);
    try {
      await createFolder(trimmed);
      toast.success("Folder created.");
      setNewFolderName("");
      setShowNewFolder(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to create folder.");
    } finally {
      setIsCreating(false);
    }
  }, [newFolderName, isCreating, createFolder]);

  const handleStartEdit = useCallback((folderId: number, currentName: string) => {
    setEditingFolderId(folderId);
    setEditName(currentName);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (editingFolderId === null) return;
    const trimmed = editName.trim();
    const folder = folders.find((f) => f.id === editingFolderId);
    if (!trimmed || trimmed === folder?.name) {
      setEditingFolderId(null);
      return;
    }
    setRenamingId(editingFolderId);
    try {
      await renameFolder(editingFolderId, trimmed);
      toast.success("Folder renamed.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to rename folder.");
    } finally {
      setRenamingId(null);
      setEditingFolderId(null);
    }
  }, [editingFolderId, editName, folders, renameFolder]);

  const handleConfirmDelete = useCallback(async () => {
    if (confirmDeleteId === null) return;
    setDeletingId(confirmDeleteId);
    setConfirmDeleteId(null);
    try {
      await deleteFolder(confirmDeleteId);
      toast.success("Folder deleted.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete folder.");
    } finally {
      setDeletingId(null);
    }
  }, [confirmDeleteId, deleteFolder]);

  const confirmDeleteFolder = folders.find((f) => f.id === confirmDeleteId);

  // Sort: All first, Uncategorized second, then alphabetical
  const sortedFolders = [...folders].sort((a, b) => {
    if (a.id === 0) return -1;
    if (b.id === 0) return 1;
    if (a.id === 1) return -1;
    if (b.id === 1) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-[16px] lg:px-[24px] pt-[8px] pb-[4px] lg:pt-[16px] lg:pb-[8px]">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-full flex items-center justify-center tappable transition-colors flex-shrink-0"
            style={{ color: "var(--c-text-muted)", border: "1px solid var(--c-border-strong)" }}
          >
            <ChevronLeft size={18} />
          </button>
          <h2
            style={{
              fontSize: "28px",
              fontWeight: 600,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              letterSpacing: "-0.5px",
              lineHeight: 1.25,
              color: "var(--c-text)",
            }}
          >
            Folders
          </h2>
          <div className="flex-1" />
          <button
            onClick={() => setShowNewFolder(true)}
            className="w-10 h-10 rounded-full bg-[#EBFD00] flex items-center justify-center text-[#0C284A] hover:bg-[#d9e800] transition-colors tappable"
          >
            <Plus size={20} />
          </button>
        </div>
        <p className="pl-10 mt-0.5" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
          {folders.filter((f) => f.name !== "All").length} folder{folders.filter((f) => f.name !== "All").length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto overlay-scroll p-[16px]"
        style={{ paddingBottom: "calc(16px + var(--nav-clearance, 0px))" }}
      >
        {/* New folder input */}
        <AnimatePresence>
          {showNewFolder && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
              className="overflow-hidden mb-3"
            >
              <div
                className="rounded-[12px] p-4"
                style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}
              >
                <p className="mb-2" style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)" }}>
                  New Folder
                </p>
                <input
                  ref={newInputRef}
                  type="text"
                  placeholder="Folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  maxLength={100}
                  className="w-full rounded-[8px] px-3 py-2 outline-none transition-colors"
                  style={{
                    fontSize: "16px",
                    fontWeight: 400,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    backgroundColor: "var(--c-input-bg)",
                    color: "var(--c-text)",
                    border: "1px solid var(--c-border-strong)",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); }
                  }}
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}
                    className="flex-1 py-2 rounded-[8px] tappable transition-colors"
                    style={{ fontSize: "13px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text-secondary)" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!newFolderName.trim() || isCreating}
                    className="flex-1 py-2 rounded-[8px] bg-[#EBFD00] text-[#0C284A] hover:bg-[#d9e800] tappable transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                    style={{ fontSize: "13px", fontWeight: 600 }}
                  >
                    {isCreating && <Disc3 size={13} className="disc-spinner" />}
                    Create
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading state */}
        {isFetching && folders.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <Disc3 size={24} className="disc-spinner" style={{ color: "var(--c-text-muted)" }} />
          </div>
        )}

        {/* Folder list */}
        <div className="flex flex-col gap-2">
          {sortedFolders.map((folder) => {
            const isLocked = folder.id === 0 || folder.id === 1;
            const isEditing = editingFolderId === folder.id;
            const isRenaming = renamingId === folder.id;
            const isDeleting = deletingId === folder.id;
            const canDelete = !isLocked && folder.count === 0;

            return (
              <div
                key={folder.id}
                className="rounded-[12px] flex items-center gap-3 p-4"
                style={{
                  backgroundColor: "var(--c-surface)",
                  border: "1px solid var(--c-border-strong)",
                  opacity: isDeleting ? 0.5 : 1,
                }}
              >
                {/* Locked icon for system folders */}
                {isLocked && (
                  <Lock size={14} className="flex-shrink-0" style={{ color: "var(--c-text-faint)" }} />
                )}

                {/* Name or edit input */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={100}
                      onBlur={handleSaveEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit();
                        if (e.key === "Escape") setEditingFolderId(null);
                      }}
                      className="w-full bg-transparent outline-none"
                      style={{
                        fontSize: "15px",
                        fontWeight: 500,
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        color: "var(--c-text)",
                        borderBottom: "2px solid #EBFD00",
                        paddingBottom: "2px",
                      }}
                    />
                  ) : (
                    <div>
                      <p
                        style={{
                          fontSize: "15px",
                          fontWeight: 500,
                          color: isLocked ? "var(--c-text-tertiary)" : "var(--c-text)",
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                          display: "block",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: "100%",
                        }}
                      >
                        {folder.name}
                      </p>
                      <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)", marginTop: "1px" }}>
                        {folder.id === 0
                          ? `${folder.count} total`
                          : `${folder.count} album${folder.count !== 1 ? "s" : ""}`}
                      </p>
                    </div>
                  )}
                </div>

                {/* Rename spinner */}
                {isRenaming && (
                  <Disc3 size={14} className="disc-spinner flex-shrink-0" style={{ color: "var(--c-text-muted)" }} />
                )}

                {/* Actions for non-system folders */}
                {!isLocked && !isEditing && !isRenaming && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Rename button */}
                    <button
                      onClick={() => handleStartEdit(folder.id, folder.name)}
                      className="w-8 h-8 rounded-full flex items-center justify-center tappable transition-colors"
                      style={{ color: "var(--c-text-muted)" }}
                    >
                      <Pencil size={14} />
                    </button>

                    {/* Delete button */}
                    {canDelete ? (
                      <button
                        onClick={() => setConfirmDeleteId(folder.id)}
                        disabled={isDeleting}
                        className="w-8 h-8 rounded-full flex items-center justify-center tappable transition-colors"
                        style={{ color: "#FF33B6" }}
                      >
                        {isDeleting ? (
                          <Disc3 size={14} className="disc-spinner" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    ) : (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ color: "var(--c-text-faint)", opacity: 0.4 }}
                        title="Move albums first"
                      >
                        <Trash2 size={14} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {confirmDeleteId !== null && confirmDeleteFolder && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.175, ease: EASE_OUT }}
              className="absolute inset-0 bg-black/40"
              onClick={() => setConfirmDeleteId(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.225, ease: EASE_OUT }}
              className="relative z-10 mx-6 w-full max-w-[340px] rounded-[16px] p-6"
              style={{ backgroundColor: "var(--c-surface)", boxShadow: "var(--c-card-shadow)" }}
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                  style={{ backgroundColor: "rgba(255,51,182,0.12)" }}
                >
                  <AlertTriangle size={22} style={{ color: "#FF33B6" }} />
                </div>
                <p
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                    color: "var(--c-text)",
                    marginBottom: "6px",
                  }}
                >
                  Delete "{confirmDeleteFolder.name}"?
                </p>
                <p style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
                  This cannot be undone.
                </p>
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-2.5 rounded-[10px] tappable transition-colors"
                  style={{ fontSize: "14px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text-secondary)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="flex-1 py-2.5 rounded-[10px] tappable transition-colors"
                  style={{ fontSize: "14px", fontWeight: 600, backgroundColor: "rgba(255,51,182,0.15)", color: "#FF33B6" }}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
