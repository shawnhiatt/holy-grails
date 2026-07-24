import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Bug, ChevronDown, Disc3, Lightbulb, Paperclip, X } from "./icons";
import { SlideOutPanel } from "./slide-out-panel";
import { useApp } from "./app-context";
import { EASE_OUT, DURATION_FAST } from "./motion-tokens";
import { getRecentErrors } from "../lib/report-error";
import { getScreenTrail } from "../lib/screen-trail";
import { formatSyncedAgo } from "../utils/format";
import { version as APP_VERSION } from "../../../package.json";

type ReportKind = "bug" | "idea";

/* Screenshots are downscaled before upload — a modern phone screenshot is
   2–4 MB and none of that detail survives being read on a laptop. 1600px on
   the long edge keeps UI text legible, which is the whole point of the image.
   Deliberately NOT shared with the Look It Up cover scanner's downscale: that
   one crops a centered square out of a live video frame for the vision model.
   Different input, different geometry, different target. */
const MAX_DIMENSION = 1600;
const SKIP_DOWNSCALE_BELOW_BYTES = 300 * 1024;

async function prepareScreenshot(file: File): Promise<Blob> {
  if (file.size < SKIP_DOWNSCALE_BELOW_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );
    return blob ?? file;
  } catch {
    // Decode failed (an exotic format, a permissions quirk) — send the original.
    return file;
  }
}

interface BugReportSheetProps {
  onClose: () => void;
}

export function BugReportSheet({ onClose }: BugReportSheetProps) {
  const {
    isDarkMode,
    sessionToken,
    colorMode,
    formatScope,
    albums,
    wants,
    lastSyncedAt,
    accounts,
    collectionPrivate,
    wantlistPrivate,
  } = useApp();

  const submit = useMutation(api.bugReports.submit);
  const generateUploadUrl = useMutation(api.bugReports.generateUploadUrl);

  const [kind, setKind] = useState<ReportKind>("bug");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Snapshot of the app's state, captured fresh each render of the sheet. This
  // exact list is what the disclosure shows — the honest way to ask for it.
  const diagnostics = useMemo(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari predates the display-mode media query for installed PWAs
      (window.navigator as { standalone?: boolean }).standalone === true;

    const rows: { label: string; value: string }[] = [
      { label: "Version", value: APP_VERSION },
      { label: "Where", value: getScreenTrail() || "unknown" },
      { label: "Installed", value: standalone ? "Home screen app" : "Browser tab" },
      { label: "Device", value: navigator.userAgent },
      {
        label: "Screen",
        value: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
      },
      { label: "Theme", value: `${colorMode} (${isDarkMode ? "dark" : "light"})` },
      { label: "Formats", value: formatScope },
      { label: "Collection", value: `${albums.length} records` },
      { label: "Wantlist", value: `${wants.length} records` },
      {
        label: "Last synced",
        value: formatSyncedAgo(lastSyncedAt) ?? "never",
      },
      { label: "Connection", value: navigator.onLine ? "online" : "offline" },
    ];
    if (accounts.length > 1) {
      rows.push({ label: "Accounts", value: `${accounts.length} on this device` });
    }
    if (collectionPrivate || wantlistPrivate) {
      rows.push({
        label: "Discogs privacy",
        value: [
          collectionPrivate ? "collection private" : null,
          wantlistPrivate ? "wantlist private" : null,
        ]
          .filter(Boolean)
          .join(", "),
      });
    }
    return rows;
  }, [
    colorMode,
    isDarkMode,
    formatScope,
    albums.length,
    wants.length,
    lastSyncedAt,
    accounts.length,
    collectionPrivate,
    wantlistPrivate,
  ]);

  const recentErrors = useMemo(() => getRecentErrors(), []);

  const handlePickFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setFile(picked);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(picked);
    });
  }, []);

  const clearFile = useCallback(() => {
    setFile(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed || isSending || !sessionToken) return;
    setIsSending(true);
    try {
      let screenshotId: Id<"_storage"> | undefined;
      if (file) {
        const blob = await prepareScreenshot(file);
        const uploadUrl = await generateUploadUrl({ sessionToken });
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": blob.type || "image/jpeg" },
          body: blob,
        });
        if (!res.ok) throw new Error("Screenshot upload failed");
        const uploaded = (await res.json()) as { storageId: Id<"_storage"> };
        screenshotId = uploaded.storageId;
      }

      await submit({
        sessionToken,
        kind,
        message: trimmed,
        diagnostics,
        recentErrors: recentErrors.length > 0 ? recentErrors : undefined,
        screenshotId,
      });

      toast.success(kind === "bug" ? "Report sent." : "Idea sent.");
      clearFile();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(/too many/i.test(msg) ? "Too many reports. Try later." : "Couldn't send that.");
    } finally {
      setIsSending(false);
    }
  }, [
    message,
    isSending,
    sessionToken,
    file,
    generateUploadUrl,
    submit,
    kind,
    diagnostics,
    recentErrors,
    clearFile,
    onClose,
  ]);

  const canSend = message.trim().length > 0 && !isSending;

  return (
    <SlideOutPanel
      onClose={onClose}
      title={kind === "bug" ? "Report a problem" : "Share an idea"}
      backdropZIndex={80}
      sheetZIndex={85}
      footer={
        <button
          onClick={handleSubmit}
          disabled={!canSend}
          className="w-full flex items-center justify-center gap-2 rounded-full transition-colors tappable disabled:opacity-50"
          style={{
            height: "48px",
            fontSize: "15px",
            fontWeight: 600,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            backgroundColor: "#EBFD00",
            color: "#16181C",
          }}
        >
          {isSending && <Disc3 size={16} className="disc-spinner" />}
          {isSending ? "Sending..." : "Send"}
        </button>
      }
    >
      <div className="px-4 pt-3 flex flex-col gap-4">
        {/* Kind toggle — bugs first, ideas welcome */}
        <div className="flex gap-2">
          {(["bug", "idea"] as const).map((value) => {
            const isActive = kind === value;
            const Icon = value === "bug" ? Bug : Lightbulb;
            return (
              <button
                key={value}
                onClick={() => setKind(value)}
                aria-pressed={isActive}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full transition-colors cursor-pointer"
                style={{
                  fontSize: "13px",
                  fontWeight: isActive ? 600 : 400,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  backgroundColor: isActive
                    ? isDarkMode
                      ? "rgba(172,222,242,0.2)"
                      : "rgba(172,222,242,0.5)"
                    : "var(--c-chip-bg)",
                  color: isActive
                    ? isDarkMode
                      ? "#ACDEF2"
                      : "#00527A"
                    : "var(--c-text-secondary)",
                }}
              >
                <Icon size={15} weight={isActive ? "fill" : "regular"} />
                {value === "bug" ? "Something broke" : "An idea"}
              </button>
            );
          })}
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder={
            kind === "bug"
              ? "What happened, and what did you tap right before?"
              : "What would make this better?"
          }
          className="w-full rounded-[10px] px-3 py-2.5 resize-none"
          style={{
            // 16px minimum — anything smaller makes iOS Safari zoom the viewport
            fontSize: "16px",
            fontFamily: "'DM Sans', system-ui, sans-serif",
            color: "var(--c-text)",
            backgroundColor: "var(--c-input-bg)",
            border: "1px solid var(--c-border-strong)",
            outline: "none",
          }}
        />

        {/* Screenshot */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePickFile}
            className="hidden"
          />
          {previewUrl ? (
            <div className="flex items-center gap-3">
              <img
                src={previewUrl}
                alt="Screenshot to send"
                className="rounded-[8px]"
                style={{
                  width: "56px",
                  height: "56px",
                  objectFit: "cover",
                  border: "1px solid var(--c-border-strong)",
                }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: "13px",
                  color: "var(--c-text-secondary)",
                  display: "block",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  WebkitTextOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                {file?.name}
              </span>
              <button
                onClick={clearFile}
                aria-label="Remove screenshot"
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ color: "var(--c-text-muted)", border: "1px solid var(--c-border-strong)" }}
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 rounded-full cursor-pointer tappable"
              style={{
                fontSize: "13px",
                fontWeight: 500,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                backgroundColor: "var(--c-chip-bg)",
                color: "var(--c-text-secondary)",
              }}
            >
              <Paperclip size={15} />
              Add a screenshot
            </button>
          )}
        </div>

        {/* What gets sent — the list below IS the payload */}
        <div style={{ borderTop: "1px solid var(--c-border)" }} className="pt-3">
          <button
            onClick={() => setShowDiagnostics((v) => !v)}
            aria-expanded={showDiagnostics}
            className="w-full flex items-center justify-between cursor-pointer"
            style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text-secondary)" }}
          >
            What gets sent
            <motion.span
              animate={{ rotate: showDiagnostics ? 180 : 0 }}
              transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
              className="flex"
            >
              <ChevronDown size={16} style={{ color: "var(--c-text-muted)" }} />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {showDiagnostics && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
                className="mt-3 flex flex-col gap-2"
              >
                {diagnostics.map((row) => (
                  <div key={row.label} className="flex gap-3">
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "var(--c-text-faint)",
                        width: "92px",
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
                {recentErrors.length > 0 && (
                  <div className="flex gap-3">
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "var(--c-text-faint)",
                        width: "92px",
                        flexShrink: 0,
                      }}
                    >
                      Errors
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--c-text-secondary)" }}>
                      {recentErrors.length} from this session
                    </span>
                  </div>
                )}
                <p className="mt-1" style={{ fontSize: "12px", color: "var(--c-text-muted)", lineHeight: 1.5 }}>
                  Your records, notes, and Discogs login are never included.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </SlideOutPanel>
  );
}
