import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, animate } from "motion/react";
import { X, Search, Check } from "lucide-react";
import { useApp } from "./app-context";
import type { Album } from "./mock-data";
import { EASE_OUT, DURATION_FAST, DURATION_NORMAL } from "./motion-tokens";

/* Bottom sheet safe area standard:
   - Outer container bottom: 0, paddingBottom: env(safe-area-inset-bottom, 16px)
   - Inner scroll content paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 24px)
   - Ensures no gap on notched iOS devices in PWA mode */

interface AddAlbumsDrawerProps {
  sessionId: string;
  onClose: () => void;
}

export function AddAlbumsDrawer({ sessionId, onClose }: AddAlbumsDrawerProps) {
  const { albums, sessions, toggleAlbumInSession, isDarkMode, folders } = useApp();
  const [isDesktop, setIsDesktop] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState("All");
  const searchRef = useRef<HTMLInputElement>(null);

  const session = sessions.find((s) => s.id === sessionId);
  const sessionName = session?.name ?? "";

  // Pending local selection state — changes only committed on confirm
  const initialAlbumIdsRef = useRef(new Set(session?.albumIds ?? []));
  const [checkedIds, setCheckedIds] = useState(() => new Set(session?.albumIds ?? []));

  const newlyAddedCount = useMemo(() => {
    let count = 0;
    for (const id of checkedIds) {
      if (!initialAlbumIdsRef.current.has(id)) count++;
    }
    return count;
  }, [checkedIds]);

  const toggleLocal = useCallback((albumId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(albumId)) next.delete(albumId);
      else next.add(albumId);
      return next;
    });
  }, []);

  const isCheckedLocal = useCallback((albumId: string) => {
    return checkedIds.has(albumId);
  }, [checkedIds]);

  const handleConfirm = useCallback(() => {
    // Add newly checked albums
    for (const id of checkedIds) {
      if (!initialAlbumIdsRef.current.has(id)) {
        toggleAlbumInSession(id, sessionId);
      }
    }
    // Remove albums that were unchecked
    for (const id of initialAlbumIdsRef.current) {
      if (!checkedIds.has(id)) {
        toggleAlbumInSession(id, sessionId);
      }
    }
    onClose();
  }, [checkedIds, toggleAlbumInSession, sessionId, onClose]);

  const handleDiscard = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    setIsDesktop(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Escape to discard on desktop
  useEffect(() => {
    if (!isDesktop) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleDiscard(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isDesktop, handleDiscard]);

  // Recently Added: 20 most recent by dateAdded
  const recentlyAdded = useMemo(() =>
    [...albums].sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()).slice(0, 20),
    [albums]
  );

  // Keeps: albums tagged keep
  const keeps = useMemo(() => albums.filter((a) => a.purgeTag === "keep"), [albums]);

  // Browse Everything: filtered + searched
  const browseAlbums = useMemo(() => {
    let result = [...albums];
    if (activeFolder !== "All") result = result.filter((a) => a.folder === activeFolder);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) => a.artist.toLowerCase().includes(q) || a.title.toLowerCase().includes(q) || a.label.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => a.artist.localeCompare(b.artist));
    return result;
  }, [albums, activeFolder, searchQuery]);

  const content = (
    <DrawerContent
      recentlyAdded={recentlyAdded}
      keeps={keeps}
      browseAlbums={browseAlbums}
      sessionName={sessionName}
      newlyAddedCount={newlyAddedCount}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      activeFolder={activeFolder}
      setActiveFolder={setActiveFolder}
      folders={folders}
      toggleAlbum={toggleLocal}
      isAdded={isCheckedLocal}
      isDarkMode={isDarkMode}
      onConfirm={handleConfirm}
      onDiscard={handleDiscard}
      searchRef={searchRef}
    />
  );

  if (isDesktop) {
    return (
      <AnimatePresence>
        <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={handleDiscard}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION_FAST }}
            className="absolute inset-0 bg-black/30"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 flex flex-col overflow-hidden"
            style={{
              width: 520,
              maxHeight: "min(720px, 85vh)",
              backgroundColor: isDarkMode ? "#132B44" : "#FFFFFF",
              boxShadow: isDarkMode ? "0 4px 20px rgba(0,0,0,0.25)" : "0 4px 20px rgba(12,40,74,0.08)",
              borderRadius: 16,
              border: `1px solid ${isDarkMode ? "#1A3350" : "#D2D8DE"}`,
              "--c-bg": isDarkMode ? "#0C1A2E" : "#F9F9FA",
              "--c-surface": isDarkMode ? "#132B44" : "#FFFFFF",
              "--c-surface-hover": isDarkMode ? "#1A3350" : "#EFF1F3",
              "--c-surface-alt": isDarkMode ? "#0F2238" : "#F9F9FA",
              "--c-text": isDarkMode ? "#E2E8F0" : "#0C284A",
              "--c-text-secondary": isDarkMode ? "#9EAFC2" : "#455B75",
              "--c-text-tertiary": isDarkMode ? "#8A9BB0" : "#617489",
              "--c-text-muted": isDarkMode ? "#7D92A8" : "#6B7B8E",
              "--c-text-faint": isDarkMode ? "#6A8099" : "#8494A5",
              "--c-border": isDarkMode ? "#1A3350" : "#D2D8DE",
              "--c-border-strong": isDarkMode ? "#2D4A66" : "#74889C",
              "--c-chip-bg": isDarkMode ? "#1A3350" : "#EFF1F3",
              "--c-input-bg": isDarkMode ? "#0F2238" : "#F9F9FA",
            } as React.CSSProperties}
          >
            {content}
          </motion.div>
        </div>
      </AnimatePresence>
    );
  }

  // Mobile: bottom sheet
  return <MobileDrawerSheet onClose={handleDiscard} isDarkMode={isDarkMode}>{content}</MobileDrawerSheet>;
}

/* ═══════════════════════════════════════════
   Drawer Content
   ═══════════════════════════════════════════ */
function DrawerContent({
  recentlyAdded, keeps, browseAlbums, sessionName, newlyAddedCount,
  searchQuery, setSearchQuery, activeFolder, setActiveFolder, folders,
  toggleAlbum, isAdded, isDarkMode, onConfirm, onDiscard, searchRef,
}: {
  recentlyAdded: Album[];
  keeps: Album[];
  browseAlbums: Album[];
  sessionName: string;
  newlyAddedCount: number;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  activeFolder: string;
  setActiveFolder: (v: string) => void;
  folders: string[];
  toggleAlbum: (albumId: string) => void;
  isAdded: (albumId: string) => boolean;
  isDarkMode: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const title =
    newlyAddedCount === 0
      ? `Add to ${sessionName}`
      : newlyAddedCount === 1
        ? `1 album added to ${sessionName}`
        : `${newlyAddedCount} albums added to ${sessionName}`;

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-2 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h3
            className="line-clamp-2"
            style={{
              fontSize: "20px",
              fontWeight: 600,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              color: "var(--c-text)",
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            {newlyAddedCount === 0
              ? <>Add to &ldquo;{sessionName}&rdquo;</>
              : newlyAddedCount === 1
                ? <>1 album added to &ldquo;{sessionName}&rdquo;</>
                : <>{newlyAddedCount} albums added to &ldquo;{sessionName}&rdquo;</>}
          </h3>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onDiscard}
            className="tappable rounded-full flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              color: "var(--c-text-muted)",
              backgroundColor: "var(--c-chip-bg)",
            }}
          >
            <X size={16} />
          </button>
          <button
            onClick={onConfirm}
            className="tappable rounded-full flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              backgroundColor: "#EBFD00",
              color: "#0C284A",
            }}
          >
            <Check size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto overscroll-none" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
        {/* ─── Recently Added ─── */}
        {recentlyAdded.length > 0 && (
          <div className="pt-3">
            <p className="px-5 mb-2" style={{ fontSize: "13px", fontWeight: 600, color: "var(--c-text-secondary)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
              Recently Added
            </p>
            <div className="flex gap-2.5 overflow-x-auto px-5 pb-3 no-scrollbar" style={{ alignItems: "flex-start" }}>
              {recentlyAdded.map((album) => (
                <ThumbnailCard key={album.id} album={album} isAdded={isAdded(album.id)} onToggle={() => toggleAlbum(album.id)} isDarkMode={isDarkMode} />
              ))}
            </div>
          </div>
        )}

        {/* ─── Keeps ─── */}
        {keeps.length > 0 && (
          <div className="pt-2">
            <p className="px-5 mb-2" style={{ fontSize: "13px", fontWeight: 600, color: "var(--c-text-secondary)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
              Keeps
            </p>
            <div className="flex gap-2.5 overflow-x-auto px-5 pb-3 no-scrollbar" style={{ alignItems: "flex-start" }}>
              {keeps.map((album) => (
                <ThumbnailCard key={album.id} album={album} isAdded={isAdded(album.id)} onToggle={() => toggleAlbum(album.id)} isDarkMode={isDarkMode} />
              ))}
            </div>
          </div>
        )}

        {/* ─── Browse Everything ─── */}
        <div className="pt-3">
          <p className="px-5 mb-2" style={{ fontSize: "13px", fontWeight: 600, color: "var(--c-text-secondary)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            Browse Everything
          </p>

          {/* Sticky search + folder filter zone */}
          <div
            className="px-5 pt-1 pb-1"
            style={{
              position: "sticky",
              top: 0,
              zIndex: 10,
              backgroundColor: isDarkMode ? "#132B44" : "#FFFFFF",
            }}
          >
            {/* Search */}
            <div className="relative mb-2.5">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--c-text-faint)" }}
              />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search artist, title, label..."
                className="w-full rounded-full pl-9 pr-4 py-2 outline-none"
                style={{
                  fontSize: "14px",
                  fontWeight: 400,
                  color: "var(--c-text)",
                  backgroundColor: "var(--c-input-bg)",
                  border: "1px solid var(--c-border)",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}
              />
            </div>

            {/* Folder filter chips */}
            {folders.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-2.5 no-scrollbar">
                {folders.map((folder) => {
                  const isActive = activeFolder === folder;
                  return (
                    <button
                      key={folder}
                      onClick={() => setActiveFolder(folder)}
                      className="flex-shrink-0 px-3 py-1 rounded-full tappable transition-colors"
                      style={{
                        fontSize: "12px",
                        fontWeight: 500,
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        backgroundColor: isActive
                          ? (isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)")
                          : "var(--c-chip-bg)",
                        color: isActive
                          ? (isDarkMode ? "#ACDEF2" : "#00527A")
                          : "var(--c-text-muted)",
                      }}
                    >
                      {folder}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Album list */}
          <div className="px-5">
            <div className="flex flex-col gap-1">
              {browseAlbums.map((album) => {
                const added = isAdded(album.id);
                return (
                  <button
                    key={album.id}
                    onClick={() => toggleAlbum(album.id)}
                    className="flex items-center gap-3 p-2 rounded-[10px] tappable transition-colors text-left"
                    style={{
                      backgroundColor: added ? (isDarkMode ? "rgba(172,222,242,0.08)" : "rgba(172,222,242,0.15)") : "transparent",
                    }}
                  >
                    <div className="w-11 h-11 rounded-[6px] overflow-hidden flex-shrink-0">
                      <img src={album.cover} alt={album.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
                      <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{album.title}</p>
                      <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-tertiary)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{album.artist}</p>
                    </div>
                    <div
                      className="flex-shrink-0 flex items-center justify-center rounded-full transition-colors"
                      style={{
                        width: 22,
                        height: 22,
                        backgroundColor: added ? "#EBFD00" : "transparent",
                        border: added ? "none" : "2px solid var(--c-border-strong)",
                      }}
                    >
                      {added && <Check size={13} color="#0C284A" strokeWidth={3} />}
                    </div>
                  </button>
                );
              })}
              {browseAlbums.length === 0 && (
                <p className="text-center py-8" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
                  No albums match your search.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
   Thumbnail Card (horizontal scroll row)
   ═══════════════════════════════════════════ */
function ThumbnailCard({ album, isAdded, onToggle, isDarkMode }: {
  album: Album; isAdded: boolean; onToggle: () => void; isDarkMode: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex-shrink-0 relative group tappable"
      style={{ width: 88 }}
    >
      <div className="w-[88px] h-[88px] rounded-[8px] overflow-hidden relative">
        <img src={album.cover} alt={album.title} className="w-full h-full object-cover" />
        {isAdded && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "#EBFD00" }}
            >
              <Check size={14} color="#0C284A" strokeWidth={3} />
            </div>
          </div>
        )}
      </div>
      <p
        className="mt-1"
        style={{
          fontSize: "11px",
          fontWeight: 500,
          color: "var(--c-text-secondary)",
          lineHeight: 1.3,
          display: "block",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          WebkitTextOverflow: "ellipsis",
          maxWidth: "100%",
        } as React.CSSProperties}
      >
        {album.title}
      </p>
      <p
        style={{
          fontSize: "10px",
          fontWeight: 400,
          color: "var(--c-text-faint)",
          lineHeight: 1.3,
          display: "block",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          WebkitTextOverflow: "ellipsis",
          maxWidth: "100%",
        } as React.CSSProperties}
      >
        {album.artist}
      </p>
    </button>
  );
}

/* ═══════════════════════════════════════════
   Mobile Bottom Sheet
   ═══════════════════════════════════════════ */
function MobileDrawerSheet({
  children, onClose, isDarkMode,
}: {
  children: React.ReactNode; onClose: () => void; isDarkMode: boolean;
}) {
  const sheetY = useMotionValue(0);

  return (
    <div className="lg:hidden">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        className="fixed inset-0 bg-black/30 z-[80]"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 70 || info.velocity.y > 300) {
            onClose();
          } else {
            animate(sheetY, 0, { duration: DURATION_FAST, ease: EASE_OUT });
          }
        }}
        className="fixed left-0 right-0 z-[85] rounded-t-[20px] overflow-hidden flex flex-col"
        style={{
          y: sheetY,
          bottom: 0,
          paddingBottom: "env(safe-area-inset-bottom, 16px)",
          maxHeight: "calc(100vh - 58px)",
          backgroundColor: isDarkMode ? "#132B44" : "#FFFFFF",
          boxShadow: isDarkMode ? "0 -8px 32px rgba(0,0,0,0.3)" : "0 -8px 32px rgba(12,40,74,0.1)",
          "--c-bg": isDarkMode ? "#0C1A2E" : "#F9F9FA",
          "--c-surface": isDarkMode ? "#132B44" : "#FFFFFF",
          "--c-surface-hover": isDarkMode ? "#1A3350" : "#EFF1F3",
          "--c-surface-alt": isDarkMode ? "#0F2238" : "#F9F9FA",
          "--c-text": isDarkMode ? "#E2E8F0" : "#0C284A",
          "--c-text-secondary": isDarkMode ? "#9EAFC2" : "#455B75",
          "--c-text-tertiary": isDarkMode ? "#8A9BB0" : "#617489",
          "--c-text-muted": isDarkMode ? "#7D92A8" : "#6B7B8E",
          "--c-text-faint": isDarkMode ? "#6A8099" : "#8494A5",
          "--c-border": isDarkMode ? "#1A3350" : "#D2D8DE",
          "--c-border-strong": isDarkMode ? "#2D4A66" : "#74889C",
          "--c-chip-bg": isDarkMode ? "#1A3350" : "#EFF1F3",
          "--c-input-bg": isDarkMode ? "#0F2238" : "#F9F9FA",
        } as React.CSSProperties}
      >
        {/* Grab handle */}
        <div className="flex justify-center py-3 flex-shrink-0 cursor-grab" style={{ touchAction: "none" }}>
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: isDarkMode ? "#2D4A66" : "#D2D8DE" }} />
        </div>
        {children}
      </motion.div>
    </div>
  );
}