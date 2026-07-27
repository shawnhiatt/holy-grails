import { useCallback, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Bug, ChevronDown, ChevronLeft, Disc3, Lightbulb, Trash2 } from "./icons";
import { useApp } from "./app-context";
import { EASE_OUT, DURATION_FAST } from "./motion-tokens";
import { formatSyncedAgo } from "../utils/format";

/* Admin-only inbox for submitted bug reports and ideas.
   Reached from Settings, and only when convex/bugReports.amIAdmin says so —
   but the real gate is server-side: listAll returns null for everyone else,
   so a non-admin poking at this component sees an empty screen, not data. */

type Status = "new" | "known" | "fixed";

const STATUSES: Status[] = ["new", "known", "fixed"];

/** "Fixed" is the wrong word for an idea that shipped — same state, honest label. */
function statusLabel(status: Status, kind: "bug" | "idea"): string {
  if (status === "fixed") return kind === "idea" ? "Shipped" : "Fixed";
  if (status === "known") return "Known";
  return "New";
}

function statusColors(status: Status, isDarkMode: boolean): { bg: string; fg: string } {
  if (status === "fixed") return { bg: "rgba(62,152,66,0.16)", fg: "#3E9842" };
  if (status === "known")
    return {
      bg: isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)",
      fg: isDarkMode ? "#ACDEF2" : "#00527A",
    };
  return { bg: "var(--c-destructive-tint)", fg: "var(--c-destructive-text)" };
}

interface BugInboxScreenProps {
  onBack: () => void;
}

export function BugInboxScreen({ onBack }: BugInboxScreenProps) {
  const { sessionToken, isDarkMode } = useApp();
  const reports = useQuery(
    api.bugReports.listAll,
    sessionToken ? { sessionToken } : "skip"
  );
  const setStatus = useMutation(api.bugReports.setStatus);
  const removeReport = useMutation(api.bugReports.remove);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleStatus = useCallback(
    async (reportId: Id<"bug_reports">, status: Status) => {
      if (!sessionToken) return;
      setBusyId(reportId);
      try {
        await setStatus({ sessionToken, reportId, status });
      } catch {
        toast.error("Couldn't update that.");
      } finally {
        setBusyId(null);
      }
    },
    [sessionToken, setStatus]
  );

  const handleDelete = useCallback(
    async (reportId: Id<"bug_reports">) => {
      if (!sessionToken) return;
      setBusyId(reportId);
      try {
        await removeReport({ sessionToken, reportId });
        setConfirmDeleteId(null);
        toast("Report deleted.");
      } catch {
        toast.error("Couldn't delete that.");
      } finally {
        setBusyId(null);
      }
    },
    [sessionToken, removeReport]
  );

  const newCount = reports?.filter((r) => r.status === "new").length ?? 0;

  return (
    <div className="w-full" style={{ paddingBottom: "var(--scroll-bottom-pad)" }}>
      <div className="px-4 pt-4 flex items-center gap-2">
        <button
          onClick={onBack}
          aria-label="Back to settings"
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ color: "var(--c-text)" }}
        >
          <ChevronLeft size={22} />
        </button>
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 700,
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            letterSpacing: "-0.4px",
            color: "var(--c-text)",
          }}
        >
          Reports
        </h2>
      </div>

      <div className="px-4 mt-1">
        <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text-muted)" }}>
          {reports === undefined
            ? "Loading..."
            : !reports || reports.length === 0
              ? "Nothing reported yet."
              : `${reports.length} total · ${newCount} new`}
        </p>
      </div>

      <div className="px-4 mt-4 flex flex-col gap-3">
        {reports?.map((report) => {
          const isExpanded = expandedId === report._id;
          const colors = statusColors(report.status, isDarkMode);
          const KindIcon = report.kind === "bug" ? Bug : Lightbulb;
          return (
            <div
              key={report._id}
              className="rounded-[12px] p-4"
              style={{
                backgroundColor: "var(--c-surface)",
                border: "1px solid var(--c-border-strong)",
              }}
            >
              <div className="flex items-start gap-2">
                <KindIcon
                  size={16}
                  style={{ color: "var(--c-text-muted)", flexShrink: 0, marginTop: "2px" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--c-text)" }}>
                      @{report.discogs_username}
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--c-text-faint)" }}>
                      {formatSyncedAgo(report.created_at) ?? ""}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full"
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        backgroundColor: colors.bg,
                        color: colors.fg,
                      }}
                    >
                      {statusLabel(report.status, report.kind)}
                    </span>
                  </div>
                  <p
                    className="mt-1.5"
                    style={{
                      fontSize: "14px",
                      color: "var(--c-text)",
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {report.message}
                  </p>
                </div>
              </div>

              {report.screenshot_url && (
                <img
                  src={report.screenshot_url}
                  alt="Reporter's screenshot"
                  className="mt-3 rounded-[8px]"
                  style={{
                    maxHeight: "320px",
                    maxWidth: "100%",
                    border: "1px solid var(--c-border)",
                  }}
                />
              )}

              {/* Status controls */}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {STATUSES.map((status) => {
                  const isActive = report.status === status;
                  return (
                    <button
                      key={status}
                      onClick={() => handleStatus(report._id, status)}
                      disabled={busyId === report._id}
                      aria-pressed={isActive}
                      className="px-2.5 py-1 rounded-full cursor-pointer transition-colors disabled:opacity-50"
                      style={{
                        fontSize: "12px",
                        fontWeight: isActive ? 600 : 400,
                        backgroundColor: isActive
                          ? statusColors(status, isDarkMode).bg
                          : "var(--c-chip-bg)",
                        color: isActive
                          ? statusColors(status, isDarkMode).fg
                          : "var(--c-text-secondary)",
                      }}
                    >
                      {statusLabel(status, report.kind)}
                    </button>
                  );
                })}
                {busyId === report._id && (
                  <Disc3 size={14} className="disc-spinner" style={{ color: "var(--c-text-muted)" }} />
                )}
                <button
                  onClick={() => setConfirmDeleteId(report._id)}
                  aria-label="Delete report"
                  className="ml-auto w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ color: "var(--c-text-muted)" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {confirmDeleteId === report._id && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => handleDelete(report._id)}
                    className="px-3 py-1.5 rounded-full"
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      backgroundColor: "var(--c-destructive)",
                      color: "#FFFFFF",
                    }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-3 py-1.5 rounded-full"
                    style={{
                      fontSize: "12px",
                      backgroundColor: "var(--c-chip-bg)",
                      color: "var(--c-text-secondary)",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Diagnostics */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : report._id)}
                aria-expanded={isExpanded}
                className="mt-3 pt-3 w-full flex items-center justify-between cursor-pointer"
                style={{
                  borderTop: "1px solid var(--c-border)",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--c-text-secondary)",
                }}
              >
                Diagnostics
                <motion.span
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
                  className="flex"
                >
                  <ChevronDown size={15} style={{ color: "var(--c-text-muted)" }} />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
                    className="mt-2 flex flex-col gap-1.5"
                  >
                    {report.diagnostics.map((row, i) => (
                      <div key={`${row.label}-${i}`} className="flex gap-3">
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            color: "var(--c-text-faint)",
                            width: "88px",
                            flexShrink: 0,
                          }}
                        >
                          {row.label}
                        </span>
                        <span
                          style={{
                            fontSize: "12px",
                            color: "var(--c-text-secondary)",
                            wordBreak: "break-word",
                            minWidth: 0,
                          }}
                        >
                          {row.value}
                        </span>
                      </div>
                    ))}
                    {report.recent_errors && report.recent_errors.length > 0 && (
                      <div
                        className="mt-2 p-2.5 rounded-[8px]"
                        style={{ backgroundColor: "var(--c-surface-alt)" }}
                      >
                        {report.recent_errors.map((err, i) => (
                          <p
                            key={i}
                            style={{
                              fontSize: "11px",
                              fontFamily: "ui-monospace, monospace",
                              color: "var(--c-destructive-text)",
                              wordBreak: "break-word",
                              lineHeight: 1.5,
                            }}
                          >
                            {err}
                          </p>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
