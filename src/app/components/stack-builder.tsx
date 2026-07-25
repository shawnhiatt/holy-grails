import { useMemo, useState } from "react";
import { Disc3, Zap } from "./icons";
import { toast } from "sonner";
import { useApp } from "./app-context";
import { SlideOutPanel } from "./slide-out-panel";
import { buildStackPresets, type StackPreset } from "../utils/stack-presets";

/**
 * The Session Builder — the sheet that creates a session which fills itself.
 *
 * Named for a tool, not a thing: there is no second object type in the app.
 * Some sessions are filled by hand and some fill themselves, and that is a
 * property, not a category. All copy here says "Session"; the mechanism shows
 * up as a verb ("this session fills itself"), never as a noun.
 *
 * Layer one is presets, which carry the 80% — a condition-row builder on a
 * phone is punishing, and most of what people want is a handful of known
 * shapes. The presets are generated from the real collection (see
 * stack-presets.ts), so nothing on offer here can come back empty.
 */
export function StackBuilder({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (stackId: string) => void;
}) {
  const { albums, lastPlayed, isDarkMode, createAutoStack, previewStackRule } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);

  const presets = useMemo(
    () => buildStackPresets(albums, lastPlayed),
    [albums, lastPlayed]
  );

  const handlePick = (preset: StackPreset) => {
    if (busyId) return;
    setBusyId(preset.id);
    try {
      // The generated name doubles as a readback: the user can see they built
      // what they meant before the session even exists. It stays editable —
      // renaming a session already works.
      const id = createAutoStack(preset.name, preset.rule, preset.name);
      toast.success(`"${preset.name}" created.`, { duration: 1500 });
      onCreated(id);
    } catch {
      toast.error("Couldn't create that session.");
      setBusyId(null);
    }
  };

  return (
    <SlideOutPanel
      onClose={onClose}
      title="Set the rules"
      ariaLabel="Session Builder"
      backdropZIndex={80}
      sheetZIndex={85}
    >
      <div
        className="p-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 120px)" }}
      >
        <p
          className="mb-4"
          style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-secondary)", lineHeight: 1.45 }}
        >
          A session built from rules fills itself. Add a record to your
          collection and it lands here on its own.
        </p>

        {presets.length === 0 ? (
          <div className="py-10 flex flex-col items-center text-center">
            <Zap size={32} weight="light" style={{ color: "var(--c-text-faint)" }} />
            <p className="mt-3" style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text-secondary)" }}>
              Not enough to go on yet.
            </p>
            <p className="mt-1" style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-muted)" }}>
              Sync your collection and try again.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {presets.map((preset) => {
              // Count through the real evaluator, not the preset's own tally —
              // if the two ever disagreed, the number on screen would be a lie
              // about what the session will hold.
              const count = previewStackRule(preset.rule).poolSize;
              return (
                <button
                  key={preset.id}
                  onClick={() => handlePick(preset)}
                  disabled={!!busyId}
                  className="w-full rounded-[12px] p-3.5 text-left tappable transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--c-surface)",
                    border: "1px solid var(--c-border-strong)",
                    touchAction: "manipulation",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p
                        className="line-clamp-1"
                        style={{ fontSize: "15px", fontWeight: 500, color: "var(--c-text)" }}
                      >
                        {preset.name}
                      </p>
                      <p
                        className="mt-0.5 line-clamp-1"
                        style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}
                      >
                        {preset.blurb}
                      </p>
                    </div>
                    {busyId === preset.id ? (
                      <Disc3 className="disc-spinner flex-shrink-0" size={16} style={{ color: "var(--c-text-muted)" }} />
                    ) : (
                      <span
                        className="flex-shrink-0 px-2 py-0.5 rounded-full"
                        style={{
                          fontSize: "12px",
                          fontWeight: 500,
                          backgroundColor: isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)",
                          color: isDarkMode ? "#ACDEF2" : "#00527A",
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </SlideOutPanel>
  );
}
