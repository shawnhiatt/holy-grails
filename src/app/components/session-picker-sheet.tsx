import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, animate } from "motion/react";
import { X, Plus, Check } from "lucide-react";
import { useApp } from "./app-context";
import { EASE_OUT, DURATION_FAST, DURATION_NORMAL } from "./motion-tokens";

/* Bottom sheet safe area standard:
   - Outer container bottom: 0, paddingBottom: env(safe-area-inset-bottom, 16px)
   - Inner scroll content paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 80px)
   - Ensures no gap on notched iOS devices in PWA mode */

/**
 * SessionPickerSheet — shared component for adding/removing an album to/from sessions.
 * Mobile: bottom sheet that slides up, draggable to dismiss.
 * Desktop (lg+): anchored popover, 280px wide, dismisses on click outside or Escape.
 */
export function SessionPickerSheet() {
  const {
    sessionPickerAlbumId,
    closeSessionPicker,
    albums,
    sessions,
    isInSession,
    toggleAlbumInSession,
    createSessionDirect,
    isDarkMode,
    mostRecentSessionId,
    firstSessionJustCreated,
  } = useApp();

  const [isDesktop, setIsDesktop] = useState(false);
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const newSessionInputRef = useRef<HTMLInputElement>(null);
  const hasAutoCheckedRef = useRef<string | null>(null);

  // Track desktop breakpoint
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    setIsDesktop(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Default behavior: if album is in no sessions when picker opens,
  // auto-add it to the most recently active session
  useEffect(() => {
    if (!sessionPickerAlbumId) {
      hasAutoCheckedRef.current = null;
      return;
    }
    // Only auto-check once per picker open
    if (hasAutoCheckedRef.current === sessionPickerAlbumId) return;
    hasAutoCheckedRef.current = sessionPickerAlbumId;

    const inAnySession = sessions.some((s) => s.albumIds.includes(sessionPickerAlbumId));

    if (!inAnySession && mostRecentSessionId) {
      toggleAlbumInSession(sessionPickerAlbumId, mostRecentSessionId);
    }
  }, [sessionPickerAlbumId]); // intentionally minimal deps — runs once per open

  // Reset new-session input when picker closes
  useEffect(() => {
    if (!sessionPickerAlbumId) {
      setShowNewSession(false);
      setNewSessionName("");
    }
  }, [sessionPickerAlbumId]);

  // Auto-focus new session input
  useEffect(() => {
    if (showNewSession && newSessionInputRef.current) {
      newSessionInputRef.current.focus();
    }
  }, [showNewSession]);

  // Desktop: dismiss on Escape
  useEffect(() => {
    if (!sessionPickerAlbumId || !isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSessionPicker();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sessionPickerAlbumId, isDesktop, closeSessionPicker]);

  // Desktop: dismiss on click outside
  const popoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sessionPickerAlbumId || !isDesktop) return;
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        closeSessionPicker();
      }
    };
    // Delay listener to avoid catching the triggering click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", onClick);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", onClick);
    };
  }, [sessionPickerAlbumId, isDesktop, closeSessionPicker]);

  const album = albums.find((a) => a.id === sessionPickerAlbumId) || null;

  const handleCreateSession = useCallback(() => {
    const trimmed = newSessionName.trim();
    if (!trimmed || !sessionPickerAlbumId) return;
    createSessionDirect(trimmed, [sessionPickerAlbumId]);
    setNewSessionName("");
    setShowNewSession(false);
  }, [newSessionName, sessionPickerAlbumId, createSessionDirect]);

  if (!sessionPickerAlbumId || !album) return null;

  // Sort sessions by lastModified descending (most recent first)
  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );

  const pickerContent = (
    <PickerContent
      album={album}
      albumId={sessionPickerAlbumId}
      sessions={sortedSessions}
      isInSession={isInSession}
      toggleAlbumInSession={toggleAlbumInSession}
      closeSessionPicker={closeSessionPicker}
      isDarkMode={isDarkMode}
      showNewSession={showNewSession}
      setShowNewSession={setShowNewSession}
      newSessionName={newSessionName}
      setNewSessionName={setNewSessionName}
      newSessionInputRef={newSessionInputRef}
      handleCreateSession={handleCreateSession}
      firstSessionJustCreated={firstSessionJustCreated}
    />
  );

  if (isDesktop) {
    return (
      <AnimatePresence>
        {sessionPickerAlbumId && (
          /* Centering wrapper — pointer-events-none so clicks pass through to dismiss handler */
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <motion.div
              ref={popoverRef}
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
              style={{
                pointerEvents: "auto",
                width: 280,
                backgroundColor: isDarkMode ? "#132B44" : "#FFFFFF",
                boxShadow: isDarkMode
                  ? "0 4px 20px rgba(0,0,0,0.25)"
                  : "0 4px 20px rgba(12,40,74,0.08)",
                borderRadius: 12,
                border: `1px solid ${isDarkMode ? "#1A3350" : "#D2D8DE"}`,
                padding: 16,
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
              {pickerContent}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  // Mobile: bottom sheet
  return <MobileSheet onClose={closeSessionPicker} isDarkMode={isDarkMode}>{pickerContent}</MobileSheet>;
}

/* ═══════════════════════════════════════════
   Shared Picker Content
   ══════════════════════════════════════════ */
function PickerContent({
  album,
  albumId,
  sessions,
  isInSession,
  toggleAlbumInSession,
  closeSessionPicker,
  isDarkMode,
  showNewSession,
  setShowNewSession,
  newSessionName,
  setNewSessionName,
  newSessionInputRef,
  handleCreateSession,
  firstSessionJustCreated,
}: {
  album: { title: string; artist: string };
  albumId: string;
  sessions: { id: string; name: string; albumIds: string[]; lastModified: string }[];
  isInSession: (albumId: string, sessionId: string) => boolean;
  toggleAlbumInSession: (albumId: string, sessionId: string) => void;
  closeSessionPicker: () => void;
  isDarkMode: boolean;
  showNewSession: boolean;
  setShowNewSession: (v: boolean) => void;
  newSessionName: string;
  setNewSessionName: (v: string) => void;
  newSessionInputRef: React.RefObject<HTMLInputElement | null>;
  handleCreateSession: () => void;
  firstSessionJustCreated: boolean;
}) {
  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0 flex-1">
          <h3
            style={{
              fontSize: "18px",
              fontWeight: 600,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              color: "var(--c-text)",
              lineHeight: 1.3,
              margin: 0,
            }}
          >
            Add to Session
          </h3>
          <p
            className="mt-0.5"
            style={{
              fontSize: "13px",
              fontWeight: 400,
              color: "var(--c-text-muted)",
              margin: 0,
              lineHeight: 1.4,
              display: "block",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              WebkitTextOverflow: "ellipsis",
              maxWidth: "100%",
              marginTop: "2px",
            } as React.CSSProperties}
          >
            <span style={{ fontWeight: 600 }}>{album.title}</span> — {album.artist}
          </p>
        </div>
        <button
          onClick={closeSessionPicker}
          className="flex-shrink-0 tappable rounded-full flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            color: "var(--c-text-muted)",
            backgroundColor: "var(--c-chip-bg)",
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* First-time hint — removed */}
      {firstSessionJustCreated && (
        null
      )}

      {/* Session list */}
      <div className="mt-3" style={{ maxHeight: 320, overflowY: "auto" }}>
        {/* All sessions sorted by recency */}
        {sessions.map((session) => {
          const inSession = isInSession(albumId, session.id);
          return (
            <SessionRow
              key={session.id}
              label={session.name}
              count={session.albumIds.length}
              checked={inSession}
              onToggle={() => toggleAlbumInSession(albumId, session.id)}
              isDarkMode={isDarkMode}
            />
          );
        })}

        {/* New Session row */}
        {!showNewSession ? (
          <button
            onClick={() => setShowNewSession(true)}
            className="w-full flex items-center gap-2.5 py-2.5 px-1 tappable rounded-lg transition-colors"
            style={{ color: "var(--c-text-secondary)" }}
          >
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{ width: 22, height: 22 }}
            >
              <Plus size={15} />
            </div>
            <span style={{ fontSize: "14px", fontWeight: 500 }}>Add to New Session</span>
          </button>
        ) : (
          <div className="flex items-center gap-2.5 py-2 px-1" style={{ overflow: "visible" }}>
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
              className="flex-1 min-w-0 rounded-lg px-3 py-2 outline-none"
              style={{
                fontSize: "14px",
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
              className="flex-shrink-0 rounded-lg flex items-center justify-center tappable transition-colors"
              style={{
                width: 44,
                height: 44,
                minWidth: 44,
                backgroundColor: newSessionName.trim() ? "#EBFD00" : "var(--c-chip-bg)",
                color: newSessionName.trim() ? "#0C284A" : "var(--c-text-faint)",
              }}
            >
              <Check size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Session Row
   ═══════════════════════════════════════════ */
function SessionRow({
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
      className="w-full flex items-center gap-2.5 py-2.5 px-1 tappable rounded-lg transition-colors cursor-pointer"
    >
      {/* Label + count */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span
          className="line-clamp-2"
          style={{
            fontSize: "14px",
            fontWeight: 500,
            color: "var(--c-text)",
          }}
        >
          {label}
        </span>
        <span
          className="flex-shrink-0"
          style={{
            fontSize: "12px",
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
          width: 22,
          height: 22,
          backgroundColor: checked ? "#EBFD00" : "transparent",
          border: checked ? "none" : "2px solid var(--c-border-strong)",
        }}
      >
        {checked && <Check size={13} color="#0C284A" strokeWidth={3} />}
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════
   Mobile Bottom Sheet
   ═══════════════════════════════════════════ */
function MobileSheet({
  children,
  onClose,
  isDarkMode,
}: {
  children: React.ReactNode;
  onClose: () => void;
  isDarkMode: boolean;
}) {
  const sheetY = useMotionValue(0);
  const backdropOpacity = useMotionValue(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="lg:hidden">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        className="fixed inset-0 bg-black/30 z-[80]"
        style={{ opacity: backdropOpacity }}
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
          backgroundColor: "var(--c-surface)",
          boxShadow: "var(--c-card-shadow)",
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
          "--c-card-shadow": isDarkMode
            ? "0 4px 20px rgba(0,0,0,0.25)"
            : "0 4px 20px rgba(12,40,74,0.08)",
        } as React.CSSProperties}
      >
        {/* Grab handle */}
        <div
          className="flex justify-center py-3 flex-shrink-0 cursor-grab"
          style={{ touchAction: "none" }}
        >
          <div
            className="w-10 h-1 rounded-full"
            style={{
              backgroundColor: "var(--c-border)",
            }}
          />
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-none px-4"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}
        >
          {children}
        </div>
      </motion.div>
    </div>
  );
}