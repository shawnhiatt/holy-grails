import { useState, useMemo, useRef, useEffect } from "react";
import { Plus, Headphones, Calendar, Disc3, Trash2, ChevronLeft, ChevronRight, GripVertical, Pencil, AlertTriangle, Share } from "./icons";
import { motion, AnimatePresence, Reorder } from "motion/react";
import { toast } from "sonner";
import { useApp } from "./app-context";
import { EASE_OUT, DURATION_FAST, DURATION_NORMAL } from "./motion-tokens";
import { NoDiscogsCard } from "./no-discogs-card";
import { AddAlbumsDrawer } from "./add-albums-drawer";
import { SwipeToDelete } from "./swipe-to-delete";
import { StackBuilder } from "./stack-builder";
import { describeRule } from "../utils/stack-rule-labels";
import type { StackRule } from "../../../convex/stackRules";

/**
 * The badge on a session that fills itself. "AUTO" and not "SMART": this is
 * saved logic, not intelligence, and "smart" would both overclaim and collide
 * with VinylBox's Smart Folders.
 */
function AutoBadge() {
  return (
    <span
      className="flex-shrink-0 px-1.5 py-0.5 rounded-[4px] uppercase"
      style={{
        fontSize: "9px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        backgroundColor: "var(--c-chip-bg)",
        color: "var(--c-text-secondary)",
      }}
    >
      Auto
    </span>
  );
}

export function Stacks() {
  const {
    stacks, albums, deleteStack, renameStack, createStackDirect, isAuthenticated,
    setSelectedAlbumId, setShowAlbumDetail, toggleAlbumInStack, reorderStackAlbums,
    setOnNewStack, shareStack, unshareStack, stackMembership, freezeStack, excludeFromStack,
    setStackDetailOpen,
  } = useApp();

  const [showNewStack, setShowNewStack] = useState(false);
  // The "+" asks which kind of session first: hand-pick records, or set the
  // rules and let it fill itself. One list, one mental model — the choice is
  // about how it gets filled, not about what it is.
  const [showKindChoice, setShowKindChoice] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [newStackName, setNewStackName] = useState("");
  const [activeStackId, setActiveStackId] = useState<string | null>(null);
  const [showAddDrawer, setShowAddDrawer] = useState(false);

  const handleCreateStack = () => {
    const trimmed = newStackName.trim();
    if (!trimmed) return;
    const newId = createStackDirect(trimmed);
    setNewStackName("");
    setShowNewStack(false);
    setActiveStackId(newId);
  };

  // Sort stacks by lastModified (most recent first)
  const sortedStacks = useMemo(() =>
    [...stacks].sort((a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    ),
    [stacks]
  );

  const activeStack = activeStackId ? stacks.find((s) => s.id === activeStackId) : null;

  // If the active stack was deleted, go back to list
  useEffect(() => {
    if (activeStackId && !stacks.find((s) => s.id === activeStackId)) {
      setActiveStackId(null);
    }
  }, [activeStackId, stacks]);

  // Register header "+" callback
  useEffect(() => {
    setOnNewStack(() => () => setShowKindChoice(true));
    return () => setOnNewStack(null);
  }, [setOnNewStack]);

  // Tell MobileHeader a session is open so it can drop the "Sessions" title —
  // the session's own name is the heading on this sub-view.
  useEffect(() => {
    setStackDetailOpen(activeStackId !== null);
    return () => setStackDetailOpen(false);
  }, [activeStackId, setStackDetailOpen]);

  if (activeStack) {
    return (
      <>
        <StackDetail
          stack={activeStack}
          albums={albums}
          onBack={() => setActiveStackId(null)}
          onDelete={() => {
            deleteStack(activeStack.id);
            setActiveStackId(null);
            toast.warning(`"${activeStack.name}" deleted.`, { duration: 1500 });
          }}
          onRename={(name) => renameStack(activeStack.id, name)}
          onOpenDrawer={() => setShowAddDrawer(true)}
          onAlbumTap={(albumId) => { setSelectedAlbumId(albumId); setShowAlbumDetail(true); }}
          onRemoveAlbum={(albumId) => {
            // Removing from an auto session can't un-add it — the rule would
            // just match it again. It records an exclusion instead.
            if (stackMembership[activeStack.id]?.isAuto) {
              excludeFromStack(activeStack.id, Number(albumId));
            } else {
              toggleAlbumInStack(albumId, activeStack.id);
            }
          }}
          onReorderAlbums={reorderStackAlbums}
          memberIds={stackMembership[activeStack.id]?.albumIds ?? activeStack.albumIds}
          isAuto={stackMembership[activeStack.id]?.isAuto ?? false}
          rule={activeStack.rule}
          rotating={stackMembership[activeStack.id]?.rotating ?? false}
          poolSize={stackMembership[activeStack.id]?.poolSize ?? activeStack.albumIds.length}
          onFreeze={() => {
            freezeStack(activeStack.id);
            toast.success("Session frozen.", { duration: 1500 });
          }}
          isShared={!!activeStack.shareId}
          onShare={() => shareStack(activeStack.id)}
          onUnshare={() => unshareStack(activeStack.id)}
        />
        <AnimatePresence>
          {showAddDrawer && (
            <AddAlbumsDrawer stackId={activeStack.id} onClose={() => setShowAddDrawer(false)} />
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* FAB — new stack */}
      <button
        onClick={() => setShowKindChoice(true)}
        className="lg:hidden fixed z-[105] flex items-center justify-center tappable"
        aria-label="New session"
        style={{
          bottom: "calc(54px + env(safe-area-inset-bottom, 0px) + 12px)",
          right: "12px",
          width: "44px",
          height: "44px",
          borderRadius: "50%",
          backgroundColor: "#EBFD00",
          color: "#16181C",
          boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
        }}
      >
        <Plus size={24} />
      </button>

      {/* How should this session get filled? */}
      <AnimatePresence>
        {showKindChoice && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }} className="overflow-hidden px-[16px] pt-[16px] pb-[0px]">
            <div className="rounded-[12px] p-4 mb-3" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}>
              <p className="mb-3" style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)" }}>New Session</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => { setShowKindChoice(false); setShowNewStack(true); }}
                  className="w-full rounded-[10px] p-3 text-left tappable transition-colors"
                  style={{ backgroundColor: "var(--c-surface-alt)", border: "1px solid var(--c-border)", touchAction: "manipulation" }}
                >
                  <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)" }}>Add releases</p>
                  <p className="mt-0.5" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>Pick them yourself.</p>
                </button>
                <button
                  onClick={() => { setShowKindChoice(false); setShowBuilder(true); }}
                  className="w-full rounded-[10px] p-3 text-left tappable transition-colors"
                  style={{ backgroundColor: "var(--c-surface-alt)", border: "1px solid var(--c-border)", touchAction: "manipulation" }}
                >
                  <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)" }}>Set the rules</p>
                  <p className="mt-0.5" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>This session fills itself.</p>
                </button>
              </div>
              <button onClick={() => setShowKindChoice(false)} className="w-full mt-3 py-2 rounded-[8px] tappable transition-colors" style={{ fontSize: "13px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text-secondary)" }}>Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showBuilder && (
        <StackBuilder
          onClose={() => setShowBuilder(false)}
          onCreated={(id) => { setShowBuilder(false); setActiveStackId(id); }}
        />
      )}

      {/* New stack input */}
      <AnimatePresence>
        {showNewStack && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }} className="overflow-hidden px-[16px] pt-[16px] pb-[0px]">
            <div className="rounded-[12px] p-4 mb-3" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}>
              <p className="mb-2" style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)" }}>New Session</p>
              <input
                type="text" placeholder="Name this session..." value={newStackName} onChange={(e) => setNewStackName(e.target.value)}
                maxLength={100}
                className="w-full rounded-[8px] px-3 py-2 outline-none transition-colors"
                style={{ fontSize: "16px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", backgroundColor: "var(--c-input-bg)", color: "var(--c-text)", border: "1px solid var(--c-border-strong)" }}
                onKeyDown={(e) => e.key === "Enter" && handleCreateStack()} autoFocus
              />
              <div className="flex gap-2 mt-3">
                <button onClick={() => { setShowNewStack(false); setNewStackName(""); }} className="flex-1 py-2 rounded-[8px] tappable transition-colors" style={{ fontSize: "13px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text-secondary)" }}>Cancel</button>
                <button onClick={handleCreateStack} disabled={!newStackName.trim()} className="flex-1 py-2 rounded-[8px] bg-[#EBFD00] text-[#16181C] hover:bg-[#d9e800] tappable transition-colors disabled:opacity-40" style={{ fontSize: "13px", fontWeight: 600 }}>Create</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stack list or empty state */}
      {albums.length === 0 && !isAuthenticated ? (
        <NoDiscogsCard
          heading="No sessions yet."
          subtext="Connect your Discogs collection to start building sessions."
        />
      ) : (
        <div className="flex-1 flex flex-col overflow-y-auto overlay-scroll p-[16px]" style={{ paddingBottom: "var(--scroll-bottom-pad)" }}>
          {stacks.length === 0 && !showNewStack && !showKindChoice ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <Headphones size={48} style={{ color: "var(--c-text-faint)" }} className="mb-4" />
              <p style={{ fontSize: "16px", fontWeight: 500, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text-secondary)" }}>Create your first Session</p>
              <p className="mt-1 text-center" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>Save albums into Sessions for different listening occasions, moods, or themes.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {sortedStacks.map((stack) => {
                // Auto sessions have no stored ids — their contents come from
                // the membership map, which evaluates the rule against the
                // live collection.
                const membership = stackMembership[stack.id];
                const memberIds = membership?.albumIds ?? stack.albumIds;
                const stackAlbums = memberIds.map((id) => albums.find((a) => a.id === id)).filter(Boolean);
                return (
                  <SwipeToDelete
                    key={stack.id}
                    onDelete={() => {
                      deleteStack(stack.id);
                      toast.warning(`"${stack.name}" deleted.`, { duration: 1500 });
                    }}
                  >
                    <button
                      onClick={() => setActiveStackId(stack.id)}
                      className="w-full rounded-[12px] flex items-center gap-3 p-4 text-left transition-colors"
                      style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}
                    >
                      <div className="relative w-12 h-12 flex-shrink-0">
                        {stackAlbums.length > 0 ? (
                          stackAlbums.slice(0, 3).map((album, i) => (
                            <img loading="lazy" decoding="async" key={album!.id} src={album!.thumb || album!.cover} alt="" className="absolute w-10 h-10 rounded-[6px] object-cover"
                              style={{ top: i * 2, left: i * 2, zIndex: 3 - i, border: "2px solid var(--c-surface)" }} />
                          ))
                        ) : (
                          <div className="w-12 h-12 rounded-[10px] flex items-center justify-center" style={{ backgroundColor: "var(--c-chip-bg)" }}>
                            <Headphones size={20} style={{ color: "var(--c-text-muted)" }} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="line-clamp-2 text-left min-w-0" style={{ fontSize: "15px", fontWeight: 500, color: "var(--c-text)" }}>{stack.name}</p>
                          {membership?.isAuto && <AutoBadge />}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
                            <Disc3 size={11} />
                            {/* Rotation has to be visible where the session
                                lives, permanently. Without it, someone who saw
                                a release in here yesterday and can't find it
                                today concludes the app lost it. */}
                            {membership?.rotating
                              ? `In rotation · ${memberIds.length} of ${membership.poolSize}`
                              : `${memberIds.length} album${memberIds.length !== 1 ? "s" : ""}`}
                          </span>
                          <span style={{ color: "var(--c-border)" }}>&middot;</span>
                          <span className="flex items-center gap-1" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}><Calendar size={11} />{new Date(stack.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        </div>
                      </div>
                      <ChevronRight size={16} style={{ color: "var(--c-text-muted)" }} />
                    </button>
                  </SwipeToDelete>
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
   Stack Detail Screen
   ═══════════════════════════════════════════════════════════ */
function StackDetail({
  stack, albums, onBack, onDelete, onRename, onOpenDrawer, onAlbumTap, onRemoveAlbum, onReorderAlbums,
  memberIds, isAuto, rule, rotating, poolSize, onFreeze, isShared, onShare, onUnshare,
}: {
  stack: { id: string; name: string; albumIds: string[]; createdAt: string };
  albums: { id: string; title: string; artist: string; thumb?: string; cover: string }[];
  onBack: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onOpenDrawer: () => void;
  onAlbumTap: (albumId: string) => void;
  onRemoveAlbum: (albumId: string) => void;
  onReorderAlbums: (stackId: string, newOrder: string[]) => void;
  /** What the session currently contains. For an auto session this is derived
   *  from its rule, so it is passed in rather than read off `stack`. */
  memberIds: string[];
  isAuto: boolean;
  /** The session's rule, when it has one — rendered as criteria chips. */
  rule?: StackRule;
  /** True when a cap is set and rotation actually engaged this period. */
  rotating: boolean;
  /** How many records match before the cap — the "of M" in "25 of 148". */
  poolSize: number;
  onFreeze: () => void;
  isShared: boolean;
  onShare: () => Promise<string>;
  onUnshare: () => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(stack.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stackAlbums = memberIds.map((id) => albums.find((a) => a.id === id)).filter(Boolean);
  const ruleChips = useMemo(() => (rule ? describeRule(rule) : []), [rule]);

  const handleStartEdit = () => {
    setEditName(stack.name);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSaveEdit = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== stack.name) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  const handleConfirmDelete = () => {
    setShowDeleteConfirm(false);
    onDelete();
  };

  const handleShareLink = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const url = await onShare();
      if (navigator.share) {
        try {
          await navigator.share({ title: stack.name, url });
        } catch {
          // User dismissed the share sheet — no-op.
        }
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied.", { duration: 1500 });
      }
      setShowShare(false);
    } catch {
      toast.error("Couldn't share. Try again.", { duration: 1500 });
    } finally {
      setShareBusy(false);
    }
  };

  const handleCopyText = async () => {
    const text = [
      stack.name,
      ...stackAlbums.map((a, i) => `${i + 1}. ${a!.artist} – ${a!.title}`),
    ].join("\n");
    try {
      await navigator.clipboard?.writeText(text);
      toast.success("Copied.", { duration: 1500 });
      setShowShare(false);
    } catch {
      toast.error("Couldn't copy. Try again.", { duration: 1500 });
    }
  };

  const handleStopSharing = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      await onUnshare();
      toast("Sharing stopped.", { duration: 1500 });
      setShowShare(false);
    } catch {
      toast.error("Couldn't stop sharing. Try again.", { duration: 1500 });
    } finally {
      setShareBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-[16px] lg:px-[24px] pt-[8px] lg:pt-0 pb-[8px] lg:pb-[12px]">
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
                  {stack.name}
                </h2>
                <Pencil size={14} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--c-text-muted)" }} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowShare(true)}
            aria-label="Share session"
            className="w-8 h-8 rounded-full flex items-center justify-center tappable transition-colors flex-shrink-0"
            style={{
              color: isShared ? "var(--c-link)" : "var(--c-text-muted)",
              border: `1px solid ${isShared ? "var(--c-link)" : "var(--c-border-strong)"}`,
            }}
          >
            <Share size={16} weight={isShared ? "fill" : "regular"} />
          </button>
        </div>
        <p className="pl-10" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
          {isAuto && <span style={{ color: "var(--c-text-secondary)", fontWeight: 500 }}>Fills itself &middot; </span>}
          {rotating
            ? `In rotation · ${memberIds.length} of ${poolSize}`
            : `${memberIds.length} album${memberIds.length !== 1 ? "s" : ""}`} &middot; Created {new Date(stack.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </p>
      </div>

      {/* The rule, in full. The generated title only carries the first two or
          three criteria, so the chips are where nothing is hidden. */}
      {isAuto && ruleChips.length > 0 && (
        <div className="px-[16px] pb-3 flex flex-wrap gap-1.5">
          {ruleChips.map((chip, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded-full"
              style={{ fontSize: "11px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text-secondary)" }}
            >
              {chip}
            </span>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-y-auto overlay-scroll p-[16px]" style={{ paddingBottom: "var(--scroll-bottom-pad)" }}>
        {stackAlbums.length === 0 ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center">
            <Headphones size={48} style={{ color: "var(--c-text-faint)" }} className="mb-4" />
            <p style={{ fontSize: "16px", fontWeight: 500, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text-secondary)" }}>
              Nothing here yet.
            </p>
            <p className="mt-1 text-center" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
              {isAuto
                ? "Nothing in your collection matches these rules yet."
                : "Add albums to get started."}
            </p>
            {!isAuto && (
              <button
                onClick={onOpenDrawer}
                className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#EBFD00] text-[#16181C] hover:bg-[#d9e800] tappable transition-colors"
                style={{ fontSize: "14px", fontWeight: 600, fontFamily: "'DM Sans', system-ui, sans-serif" }}
              >
                <Plus size={16} />
                Add Albums
              </button>
            )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="mt-4 tappable transition-colors"
              style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text-muted)" }}
            >
              Delete Session
            </button>
          </div>
        ) : (
          /* Album list with numbered positions. An auto session renders the
             same rows without drag handles — its running order comes from the
             rule's sort, and hand-reordering a derived list would be a change
             the next evaluation silently discards. */
          <div className="flex flex-col">
            <Reorder.Group
              axis="y"
              values={memberIds}
              onReorder={(newOrder) => { if (!isAuto) onReorderAlbums(stack.id, newOrder); }}
              className="flex flex-col gap-1.5"
            >
              {stackAlbums.map((album, i) => (
                <Reorder.Item
                  key={album!.id}
                  value={album!.id}
                  drag={isAuto ? false : "y"}
                  className="flex items-center gap-2.5 py-1.5 rounded-[10px] group"
                  style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", padding: "8px 10px" }}
                >
                  <span className="w-5 text-center flex-shrink-0" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-faint)" }}>{i + 1}</span>
                  {!isAuto && (
                    <GripVertical size={14} style={{ color: "var(--c-text-faint)", cursor: "grab" }} className="flex-shrink-0" />
                  )}
                  <button
                    onClick={() => onAlbumTap(album!.id)}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left tappable"
                  >
                    <img loading="lazy" decoding="async" src={album!.thumb || album!.cover} alt={album!.title} className="w-9 h-9 rounded-[6px] object-cover flex-shrink-0" />
                    <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
                      <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{album!.title}</p>
                      <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{album!.artist}</p>
                    </div>
                  </button>
                  <button
                    onClick={() => onRemoveAlbum(album!.id)}
                    aria-label={isAuto ? `Exclude ${album!.title}` : `Remove ${album!.title}`}
                    className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ color: "var(--c-destructive-text)" }}
                  >
                    <Trash2 size={13} />
                  </button>
                </Reorder.Item>
              ))}
            </Reorder.Group>

            {/* Inline action buttons below album list */}
            <div className="mt-6 flex flex-col items-center gap-3">
              {isAuto ? (
                /* Freeze — keep this exact set and drop the rule. Earns its
                   place under rotation: "I love today's roll, keep it." */
                <button
                  onClick={onFreeze}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full tappable transition-colors"
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    backgroundColor: "var(--c-surface)",
                    border: "1px solid var(--c-border-strong)",
                    color: "var(--c-text)",
                  }}
                >
                  {rotating ? "Keep today's set" : "Keep this set"}
                </button>
              ) : (
                <button
                  onClick={onOpenDrawer}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full bg-[#EBFD00] text-[#16181C] hover:bg-[#d9e800] tappable transition-colors"
                  style={{ fontSize: "14px", fontWeight: 600, fontFamily: "'DM Sans', system-ui, sans-serif" }}
                >
                  <Plus size={16} />
                  Add Albums
                </button>
              )}
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
              exit={{ opacity: 0, pointerEvents: "none" as const }}
              transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
              className="absolute inset-0 bg-black/40"
              onClick={() => setShowDeleteConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
              className="relative z-10 mx-6 w-full max-w-[340px] rounded-[16px] p-6"
              style={{ backgroundColor: "var(--c-surface)", boxShadow: "var(--c-card-shadow)" }}
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: "var(--c-destructive-tint)" }}>
                  <AlertTriangle size={22} style={{ color: "var(--c-destructive-text)" }} />
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
                  style={{ fontSize: "14px", fontWeight: 600, backgroundColor: "var(--c-destructive-tint)", color: "var(--c-destructive-text)" }}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Share modal */}
      <AnimatePresence>
        {showShare && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, pointerEvents: "none" as const }}
              transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
              className="absolute inset-0 bg-black/40"
              onClick={() => setShowShare(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Share session"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
              className="relative z-10 mx-6 w-full max-w-[340px] rounded-[16px] p-6"
              style={{ backgroundColor: "var(--c-surface)", boxShadow: "var(--c-card-shadow)" }}
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: "var(--c-chip-bg)" }}>
                  <Share size={22} style={{ color: "var(--c-text-secondary)" }} />
                </div>
                <p style={{ fontSize: "16px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)", marginBottom: "6px" }}>
                  Share this session
                </p>
                <p style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
                  Anyone with the link can view it. No login needed.
                </p>
              </div>
              <div className="flex flex-col gap-2.5 mt-5">
                <button
                  onClick={handleShareLink}
                  disabled={shareBusy}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-[10px] bg-[#EBFD00] text-[#16181C] hover:bg-[#d9e800] tappable transition-colors disabled:opacity-50"
                  style={{ fontSize: "14px", fontWeight: 600, fontFamily: "'DM Sans', system-ui, sans-serif" }}
                >
                  {shareBusy ? <Disc3 size={16} className="disc-spinner" /> : <Share size={16} />}
                  {isShared ? "Share link" : "Create link"}
                </button>
                <button
                  onClick={handleCopyText}
                  className="w-full py-2.5 rounded-[10px] tappable transition-colors"
                  style={{ fontSize: "14px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text-secondary)" }}
                >
                  Copy as text
                </button>
                {isShared && (
                  <button
                    onClick={handleStopSharing}
                    disabled={shareBusy}
                    className="w-full py-2 tappable transition-colors disabled:opacity-50"
                    style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text-muted)" }}
                  >
                    Stop sharing
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowShare(false)}
                className="w-full mt-2 py-2 tappable transition-colors"
                style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text-faint)" }}
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}