import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Plus, Headphones, Calendar, Disc3, Trash2, ChevronLeft, ChevronRight, GripVertical, Pencil, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence, Reorder } from "motion/react";
import { toast } from "sonner";
import { useApp } from "./app-context";
import { EASE_OUT, DURATION_NORMAL } from "./motion-tokens";
import { NoDiscogsCard } from "./no-discogs-card";
import { AddAlbumsDrawer } from "./add-albums-drawer";

export function Sessions() {
  const {
    sessions, albums, deleteSession, renameSession, createSessionDirect, discogsToken,
    setSelectedAlbumId, setShowAlbumDetail, toggleAlbumInSession, reorderSessionAlbums,
  } = useApp();

  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showAddDrawer, setShowAddDrawer] = useState(false);

  const handleCreateSession = () => {
    const trimmed = newSessionName.trim();
    if (!trimmed) return;
    const newId = createSessionDirect(trimmed);
    setNewSessionName("");
    setShowNewSession(false);
    setActiveSessionId(newId);
  };

  // Sort sessions by lastModified (most recent first)
  const sortedSessions = useMemo(() =>
    [...sessions].sort((a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    ),
    [sessions]
  );

  const activeSession = activeSessionId ? sessions.find((s) => s.id === activeSessionId) : null;

  // If the active session was deleted, go back to list
  useEffect(() => {
    if (activeSessionId && !sessions.find((s) => s.id === activeSessionId)) {
      setActiveSessionId(null);
    }
  }, [activeSessionId, sessions]);

  if (activeSession) {
    return (
      <>
        <SessionDetail
          session={activeSession}
          albums={albums}
          onBack={() => setActiveSessionId(null)}
          onDelete={() => {
            deleteSession(activeSession.id);
            setActiveSessionId(null);
            toast.warning(`"${activeSession.name}" deleted`, { duration: 1500 });
          }}
          onRename={(name) => renameSession(activeSession.id, name)}
          onOpenDrawer={() => setShowAddDrawer(true)}
          onAlbumTap={(albumId) => { setSelectedAlbumId(albumId); setShowAlbumDetail(true); }}
          onRemoveAlbum={(albumId) => toggleAlbumInSession(albumId, activeSession.id)}
          onReorderAlbums={reorderSessionAlbums}
        />
        <AnimatePresence>
          {showAddDrawer && (
            <AddAlbumsDrawer sessionId={activeSession.id} onClose={() => setShowAddDrawer(false)} />
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Title bar */}
      <div className="flex-shrink-0 px-[16px] lg:px-[24px] pt-[8px] pb-[4px] lg:pt-[16px] lg:pb-[17px]">
        <div className="flex items-center justify-between">
          <h2 className="screen-title" style={{ fontSize: "36px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.5px", lineHeight: 1.25, color: "var(--c-text)" }}>Sessions</h2>
          <button onClick={() => setShowNewSession(true)} className="w-10 h-10 rounded-full bg-[#EBFD00] flex items-center justify-center text-[#0C284A] hover:bg-[#d9e800] transition-colors tappable">
            <Plus size={20} />
          </button>
        </div>
      </div>

      {/* New session input */}
      <AnimatePresence>
        {showNewSession && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }} className="overflow-hidden px-[16px] pt-[16px] pb-[0px]">
            <div className="rounded-[12px] p-4 mb-3" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}>
              <p className="mb-2" style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)" }}>New Session</p>
              <input
                type="text" placeholder="Name this session..." value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)}
                maxLength={100}
                className="w-full rounded-[8px] px-3 py-2 outline-none transition-colors"
                style={{ fontSize: "16px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", backgroundColor: "var(--c-input-bg)", color: "var(--c-text)", border: "1px solid var(--c-border-strong)" }}
                onKeyDown={(e) => e.key === "Enter" && handleCreateSession()} autoFocus
              />
              <div className="flex gap-2 mt-3">
                <button onClick={() => { setShowNewSession(false); setNewSessionName(""); }} className="flex-1 py-2 rounded-[8px] tappable transition-colors" style={{ fontSize: "13px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text-secondary)" }}>Cancel</button>
                <button onClick={handleCreateSession} disabled={!newSessionName.trim()} className="flex-1 py-2 rounded-[8px] bg-[#EBFD00] text-[#0C284A] hover:bg-[#d9e800] tappable transition-colors disabled:opacity-40" style={{ fontSize: "13px", fontWeight: 600 }}>Create</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session list or empty state */}
      {albums.length === 0 && !discogsToken ? (
        <NoDiscogsCard
          heading="No sessions yet."
          subtext="Connect your Discogs collection to start building listening sessions."
        />
      ) : (
        <div className="flex-1 overflow-y-auto overlay-scroll p-[16px]" style={{ paddingBottom: "calc(16px + var(--nav-clearance, 0px))" }}>
          {sessions.length === 0 && !showNewSession ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Headphones size={48} style={{ color: "var(--c-text-faint)" }} className="mb-4" />
              <p style={{ fontSize: "16px", fontWeight: 500, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text-secondary)" }}>What's spinning tonight?</p>
              <p className="mt-1 text-center" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>Set the order before the needle drops.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {sortedSessions.map((session) => {
                const sessionAlbums = session.albumIds.map((id) => albums.find((a) => a.id === id)).filter(Boolean);
                return (
                  <button
                    key={session.id}
                    onClick={() => setActiveSessionId(session.id)}
                    className="w-full rounded-[12px] flex items-center gap-3 p-4 text-left transition-colors tappable"
                    style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}
                  >
                    <div className="relative w-12 h-12 flex-shrink-0">
                      {sessionAlbums.length > 0 ? (
                        sessionAlbums.slice(0, 3).map((album, i) => (
                          <img key={album!.id} src={album!.cover} alt="" className="absolute w-10 h-10 rounded-[6px] object-cover"
                            style={{ top: i * 2, left: i * 2, zIndex: 3 - i, border: "2px solid var(--c-surface)" }} />
                        ))
                      ) : (
                        <div className="w-12 h-12 rounded-[10px] flex items-center justify-center" style={{ backgroundColor: "var(--c-chip-bg)" }}>
                          <Headphones size={20} style={{ color: "var(--c-text-muted)" }} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="line-clamp-2 text-left" style={{ fontSize: "15px", fontWeight: 500, color: "var(--c-text)" }}>{session.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}><Disc3 size={11} />{session.albumIds.length} album{session.albumIds.length !== 1 ? "s" : ""}</span>
                        <span style={{ color: "var(--c-border)" }}>&middot;</span>
                        <span className="flex items-center gap-1" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}><Calendar size={11} />{new Date(session.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color: "var(--c-text-muted)" }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Session Detail Screen
   ═══════════════════════════════════════════════════════════ */
function SessionDetail({
  session, albums, onBack, onDelete, onRename, onOpenDrawer, onAlbumTap, onRemoveAlbum, onReorderAlbums,
}: {
  session: { id: string; name: string; albumIds: string[]; createdAt: string };
  albums: { id: string; title: string; artist: string; cover: string }[];
  onBack: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onOpenDrawer: () => void;
  onAlbumTap: (albumId: string) => void;
  onRemoveAlbum: (albumId: string) => void;
  onReorderAlbums: (sessionId: string, newOrder: string[]) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(session.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sessionAlbums = session.albumIds.map((id) => albums.find((a) => a.id === id)).filter(Boolean);

  const handleStartEdit = () => {
    setEditName(session.name);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSaveEdit = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== session.name) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  const handleConfirmDelete = () => {
    setShowDeleteConfirm(false);
    onDelete();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-[16px] lg:px-[24px] pt-[8px] pb-[4px] lg:pt-[16px] lg:pb-[8px]">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center tappable transition-colors flex-shrink-0" style={{ color: "var(--c-text-muted)", border: "1px solid var(--c-border-strong)" }}>
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={100}
                onBlur={handleSaveEdit}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") setIsEditing(false); }}
                className="w-full bg-transparent outline-none"
                style={{
                  fontSize: "28px",
                  fontWeight: 600,
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                  letterSpacing: "-0.5px",
                  lineHeight: 1.25,
                  color: "var(--c-text)",
                  borderBottom: "2px solid #EBFD00",
                  paddingBottom: "2px",
                }}
              />
            ) : (
              <button onClick={handleStartEdit} className="flex items-center gap-2 tappable group min-w-0 max-w-full">
                <h2
                  className="line-clamp-2 text-left"
                  style={{
                    fontSize: "28px",
                    fontWeight: 600,
                    fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                    letterSpacing: "-0.5px",
                    lineHeight: 1.25,
                    color: "var(--c-text)",
                  }}
                >
                  {session.name}
                </h2>
                <Pencil size={14} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--c-text-muted)" }} />
              </button>
            )}
          </div>
        </div>
        <p className="pl-10" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
          {session.albumIds.length} album{session.albumIds.length !== 1 ? "s" : ""} &middot; Created {new Date(session.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overlay-scroll p-[16px]" style={{ paddingBottom: "calc(16px + var(--nav-clearance, 0px))" }}>
        {sessionAlbums.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20">
            <Headphones size={48} style={{ color: "var(--c-text-faint)" }} className="mb-4" />
            <p style={{ fontSize: "16px", fontWeight: 500, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text-secondary)" }}>
              Nothing here yet.
            </p>
            <p className="mt-1 text-center" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
              Add albums to get started.
            </p>
            <button
              onClick={onOpenDrawer}
              className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#EBFD00] text-[#0C284A] hover:bg-[#d9e800] tappable transition-colors"
              style={{ fontSize: "14px", fontWeight: 600, fontFamily: "'DM Sans', system-ui, sans-serif" }}
            >
              <Plus size={16} />
              Add Albums
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="mt-4 tappable transition-colors"
              style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text-muted)" }}
            >
              Delete Session
            </button>
          </div>
        ) : (
          /* Album list with numbered positions */
          <div className="flex flex-col">
            <Reorder.Group
              axis="y"
              values={session.albumIds}
              onReorder={(newOrder) => onReorderAlbums(session.id, newOrder)}
              className="flex flex-col gap-1.5"
            >
              {sessionAlbums.map((album, i) => (
                <Reorder.Item
                  key={album!.id}
                  value={album!.id}
                  className="flex items-center gap-2.5 py-1.5 rounded-[10px] group"
                  style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", padding: "8px 10px" }}
                >
                  <span className="w-5 text-center flex-shrink-0" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-faint)" }}>{i + 1}</span>
                  <GripVertical size={14} style={{ color: "var(--c-text-faint)", cursor: "grab" }} className="flex-shrink-0" />
                  <button
                    onClick={() => onAlbumTap(album!.id)}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left tappable"
                  >
                    <img src={album!.cover} alt={album!.title} className="w-9 h-9 rounded-[6px] object-cover flex-shrink-0" />
                    <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
                      <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{album!.title}</p>
                      <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{album!.artist}</p>
                    </div>
                  </button>
                  <button
                    onClick={() => onRemoveAlbum(album!.id)}
                    className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ color: "#FF33B6" }}
                  >
                    <Trash2 size={13} />
                  </button>
                </Reorder.Item>
              ))}
            </Reorder.Group>

            {/* Inline action buttons below album list */}
            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                onClick={onOpenDrawer}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full bg-[#EBFD00] text-[#0C284A] hover:bg-[#d9e800] tappable transition-colors"
                style={{ fontSize: "14px", fontWeight: 600, fontFamily: "'DM Sans', system-ui, sans-serif" }}
              >
                <Plus size={16} />
                Add Albums
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="tappable transition-colors"
                style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text-muted)" }}
              >
                Delete Session
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.175, ease: EASE_OUT }}
              className="absolute inset-0 bg-black/40"
              onClick={() => setShowDeleteConfirm(false)}
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
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: "rgba(255,51,182,0.12)" }}>
                  <AlertTriangle size={22} style={{ color: "#FF33B6" }} />
                </div>
                <p style={{ fontSize: "16px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)", marginBottom: "6px" }}>
                  Delete this session?
                </p>
                <p style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
                  This cannot be undone.
                </p>
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
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