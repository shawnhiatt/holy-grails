import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, animate, type MotionStyle } from "motion/react";
import { X, Plus, Check } from "./icons";
import { useApp } from "./app-context";
import { EASE_OUT, DURATION_FAST, DURATION_NORMAL } from "./motion-tokens";
import { getContentTokens } from "./theme";

/* Bottom sheet safe area standard:
   - Outer container bottom: 0, paddingBottom: env(safe-area-inset-bottom, 16px)
   - Inner scroll content paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 80px)
   - Ensures no gap on notched iOS devices in PWA mode */

/**
 * StackPickerSheet — shared component for adding/removing an album to/from stacks.
 * Mobile: bottom sheet that slides up, draggable to dismiss.
 * Desktop (lg+): anchored popover, 280px wide, dismisses on click outside or Escape.
 */
export function StackPickerSheet() {
  const {
    stackPickerAlbumId,
    closeStackPicker,
    albums,
    stacks,
    isInStack,
    toggleAlbumInStack,
    createStackDirect,
    isDarkMode,
    mostRecentStackId,
    firstStackJustCreated,
  } = useApp();

  const [isDesktop, setIsDesktop] = useState(false);
  const [showNewStack, setShowNewStack] = useState(false);
  const [newStackName, setNewStackName] = useState("");
  const newStackInputRef = useRef<HTMLInputElement>(null);
  const hasAutoCheckedRef = useRef<string | null>(null);

  // Track desktop breakpoint
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    setIsDesktop(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Default behavior: if album is in no stacks when picker opens,
  // auto-add it to the most recently active stack
  useEffect(() => {
    if (!stackPickerAlbumId) {
      hasAutoCheckedRef.current = null;
      return;
    }
    // Only auto-check once per picker open
    if (hasAutoCheckedRef.current === stackPickerAlbumId) return;
    hasAutoCheckedRef.current = stackPickerAlbumId;

    const inAnyStack = stacks.some((s) => s.albumIds.includes(stackPickerAlbumId));

    if (!inAnyStack && mostRecentStackId) {
      toggleAlbumInStack(stackPickerAlbumId, mostRecentStackId);
    }
  }, [stackPickerAlbumId]); // intentionally minimal deps — runs once per open

  // Reset new-stack input when picker closes
  useEffect(() => {
    if (!stackPickerAlbumId) {
      setShowNewStack(false);
      setNewStackName("");
    }
  }, [stackPickerAlbumId]);

  // Auto-focus new stack input
  useEffect(() => {
    if (showNewStack && newStackInputRef.current) {
      newStackInputRef.current.focus();
    }
  }, [showNewStack]);

  // Desktop: dismiss on Escape
  useEffect(() => {
    if (!stackPickerAlbumId || !isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeStackPicker();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [stackPickerAlbumId, isDesktop, closeStackPicker]);

  // Desktop: dismiss on click outside
  const popoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!stackPickerAlbumId || !isDesktop) return;
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        closeStackPicker();
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
  }, [stackPickerAlbumId, isDesktop, closeStackPicker]);

  const album = albums.find((a) => a.id === stackPickerAlbumId) || null;

  const handleCreateStack = useCallback(() => {
    const trimmed = newStackName.trim();
    if (!trimmed || !stackPickerAlbumId) return;
    createStackDirect(trimmed, [stackPickerAlbumId]);
    setNewStackName("");
    setShowNewStack(false);
  }, [newStackName, stackPickerAlbumId, createStackDirect]);

  if (!stackPickerAlbumId || !album) return null;

  // Sort stacks by lastModified descending (most recent first)
  const sortedStacks = [...stacks].sort(
    (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );

  const pickerContent = (
    <PickerContent
      album={album}
      albumId={stackPickerAlbumId}
      stacks={sortedStacks}
      isInStack={isInStack}
      toggleAlbumInStack={toggleAlbumInStack}
      closeStackPicker={closeStackPicker}
      isDarkMode={isDarkMode}
      showNewStack={showNewStack}
      setShowNewStack={setShowNewStack}
      newStackName={newStackName}
      setNewStackName={setNewStackName}
      newStackInputRef={newStackInputRef}
      handleCreateStack={handleCreateStack}
      firstStackJustCreated={firstStackJustCreated}
    />
  );

  if (isDesktop) {
    return (
      <AnimatePresence>
        {stackPickerAlbumId && (
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
                backgroundColor: isDarkMode ? "#091E34" : "#FFFFFF",
                boxShadow: "var(--c-card-shadow)",
                borderRadius: 12,
                border: `1px solid ${isDarkMode ? "#1A3350" : "#D2D8DE"}`,
                padding: 16,
                ...getContentTokens(isDarkMode),
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
  return <MobileSheet onClose={closeStackPicker} isDarkMode={isDarkMode}>{pickerContent}</MobileSheet>;
}

/* ═══════════════════════════════════════════
   Shared Picker Content
   ══════════════════════════════════════════ */
function PickerContent({
  album,
  albumId,
  stacks,
  isInStack,
  toggleAlbumInStack,
  closeStackPicker,
  isDarkMode,
  showNewStack,
  setShowNewStack,
  newStackName,
  setNewStackName,
  newStackInputRef,
  handleCreateStack,
  firstStackJustCreated,
}: {
  album: { title: string; artist: string };
  albumId: string;
  stacks: { id: string; name: string; albumIds: string[]; lastModified: string }[];
  isInStack: (albumId: string, stackId: string) => boolean;
  toggleAlbumInStack: (albumId: string, stackId: string) => void;
  closeStackPicker: () => void;
  isDarkMode: boolean;
  showNewStack: boolean;
  setShowNewStack: (v: boolean) => void;
  newStackName: string;
  setNewStackName: (v: string) => void;
  newStackInputRef: React.RefObject<HTMLInputElement | null>;
  handleCreateStack: () => void;
  firstStackJustCreated: boolean;
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
            <span style={{ fontWeight: 600, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{album.title}</span>
            <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{album.artist}</span>
          </p>
        </div>
        <button
          onClick={closeStackPicker}
          className="flex-shrink-0 tappable rounded-full flex items-center justify-center"
          aria-label="Close"
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
      {firstStackJustCreated && (
        null
      )}

      {/* Stack list */}
      <div className="mt-3 max-h-[320px] overflow-y-auto">
        {/* All stacks sorted by recency */}
        {stacks.map((stack) => {
          const inStack = isInStack(albumId, stack.id);
          return (
            <StackRow
              key={stack.id}
              label={stack.name}
              count={stack.albumIds.length}
              checked={inStack}
              onToggle={() => toggleAlbumInStack(albumId, stack.id)}
              isDarkMode={isDarkMode}
            />
          );
        })}

        {/* New Stack row */}
        {!showNewStack ? (
          <button
            onClick={() => setShowNewStack(true)}
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
              ref={newStackInputRef}
              type="text"
              value={newStackName}
              onChange={(e) => setNewStackName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateStack();
                if (e.key === "Escape") {
                  setShowNewStack(false);
                  setNewStackName("");
                }
              }}
              placeholder="Session name..."
              maxLength={100}
              className="flex-1 min-w-0 rounded-lg px-3 py-2 outline-none"
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
              onClick={handleCreateStack}
              disabled={!newStackName.trim()}
              className="flex-shrink-0 rounded-lg flex items-center justify-center tappable transition-colors"
              style={{
                width: 44,
                height: 44,
                minWidth: 44,
                backgroundColor: newStackName.trim() ? "#EBFD00" : "var(--c-chip-bg)",
                color: newStackName.trim() ? "#0C284A" : "var(--c-text-faint)",
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
   Stack Row
   ═══════════════════════════════════════════ */
function StackRow({
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
        {checked && <Check size={13} color="#0C284A" weight="bold" />}
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
        exit={{ opacity: 0, pointerEvents: "none" as const }}
        transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        className="fixed inset-0 bg-black/30 z-[80]"
        style={{ opacity: backdropOpacity }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%", pointerEvents: "none" as const }}
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
          maxHeight: "calc(100dvh - 58px)",
          backgroundColor: "var(--c-surface)",
          boxShadow: "var(--c-card-shadow)",
          ...getContentTokens(isDarkMode),
        } as MotionStyle}
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