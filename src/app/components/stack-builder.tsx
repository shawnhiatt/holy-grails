import { useCallback, useMemo, useState } from "react";
import { ChevronDown, Disc3, Plus, Trash2, Zap } from "./icons";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useApp } from "./app-context";
import { SlideOutPanel } from "./slide-out-panel";
import { EASE_OUT, DURATION_NORMAL } from "./motion-tokens";
import { buildStackPresets, type StackPreset } from "../utils/stack-presets";
import {
  availableFields,
  describeRule,
  fieldSpec,
  generateStackName,
  opSpec,
  shouldRegenerateName,
} from "../utils/stack-rule-labels";
import type { StackRule, StackRuleCondition } from "../../../convex/stackRules";

/**
 * The Session Builder — the sheet that creates a session which fills itself.
 *
 * Named for a tool, not a thing: there is no second object type in the app.
 * Some sessions are filled by hand and some fill themselves, and that is a
 * property, not a category. All copy here says "Session"; the mechanism shows
 * up as a verb ("this session fills itself"), never as a noun.
 *
 * Two layers, because a Mailchimp-style condition-row builder on a phone is
 * punishing:
 *   1. **Presets carry the 80%** — and are generated from the real collection
 *      (see stack-presets.ts), so nothing on offer can come back empty.
 *   2. **Build your own** behind a disclosure, reusing the chip vocabulary
 *      from the filter drawer.
 *
 * The live match count is essential and free: it is the same evaluator the
 * saved session will use, so the number on screen cannot disagree with what
 * the session ends up holding.
 */

function emptyRule(defaults: { limit: number | undefined; rotation: "off" | "daily" | "weekly" }): StackRule {
  return {
    match: "all",
    conditions: [],
    sort: "artist-az",
    ...(defaults.limit ? { limit: defaults.limit } : {}),
    rotation: defaults.rotation,
  };
}

export function StackBuilder({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (stackId: string) => void;
}) {
  const { albums, lastPlayed, isDarkMode, createAutoStack, previewStackRule, sessionRuleDefaults } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);

  const presets = useMemo(
    () => buildStackPresets(albums, lastPlayed, sessionRuleDefaults),
    [albums, lastPlayed, sessionRuleDefaults]
  );

  const handlePick = (preset: StackPreset) => {
    if (busyId) return;
    setBusyId(preset.id);
    try {
      // The generated name doubles as a readback — the user sees they built
      // what they meant. It stays editable; renaming already works.
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

        {presets.length === 0 && !custom ? (
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
              // Counted through the real evaluator, not the preset's own
              // tally — if the two disagreed, the number here would be a lie
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
                      <p className="line-clamp-1" style={{ fontSize: "15px", fontWeight: 500, color: "var(--c-text)" }}>
                        {preset.name}
                      </p>
                      <p className="mt-0.5 line-clamp-1" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
                        {preset.blurb}
                      </p>
                    </div>
                    {busyId === preset.id ? (
                      <Disc3 className="disc-spinner flex-shrink-0" size={16} style={{ color: "var(--c-text-muted)" }} />
                    ) : (
                      <CountChip count={count} isDarkMode={isDarkMode} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Build your own, behind a disclosure ── */}
        <div className="mt-4" style={{ borderTop: "1px solid var(--c-border)", paddingTop: "16px" }}>
          <button
            onClick={() => setCustom((v) => !v)}
            aria-expanded={custom}
            className="w-full flex items-center justify-between tappable"
            style={{ touchAction: "manipulation" }}
          >
            <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)" }}>
              Build your own
            </span>
            <ChevronDown
              size={16}
              style={{
                color: "var(--c-text-muted)",
                transform: custom ? "rotate(180deg)" : "none",
                transition: "transform 0.2s ease",
              }}
            />
          </button>

          <AnimatePresence initial={false}>
            {custom && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
                className="overflow-hidden"
              >
                <CustomRuleBuilder
                  onCreated={(id) => {
                    onCreated(id);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </SlideOutPanel>
  );
}

function CountChip({ count, isDarkMode }: { count: number; isDarkMode: boolean }) {
  return (
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
  );
}

/* ═══════════════════════════════════════════════════════════
   Custom rule builder — condition rows
   ═══════════════════════════════════════════════════════════ */

function CustomRuleBuilder({ onCreated }: { onCreated: (stackId: string) => void }) {
  const { albums, isDarkMode, createAutoStack, previewStackRule, sessionRuleDefaults } = useApp();
  const [rule, setRule] = useState<StackRule>(() => emptyRule(sessionRuleDefaults));
  const [name, setName] = useState("");
  // The last title the generator produced. While `name` still equals it, the
  // title keeps regenerating; the moment the user types their own it diverges
  // and freezes permanently.
  const [lastGenerated, setLastGenerated] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const fields = useMemo(() => availableFields(albums), [albums]);
  const preview = useMemo(() => previewStackRule(rule), [rule, previewStackRule]);
  const chips = useMemo(() => describeRule(rule), [rule]);

  /**
   * Apply a rule change and let the title follow it, until the user takes
   * over. Computed outside the state updaters on purpose: a functional
   * updater can be invoked more than once, so it must stay pure.
   */
  const applyRule = useCallback(
    (next: StackRule) => {
      setRule(next);
      if (!shouldRegenerateName(name, lastGenerated)) return;
      const generated = generateStackName(next);
      setLastGenerated(generated);
      setName(generated);
    },
    [name, lastGenerated]
  );

  const addCondition = () => {
    const first = fields[0];
    if (!first) return;
    applyRule({
      ...rule,
      conditions: [
        ...rule.conditions,
        { field: first.field, op: first.ops[0].op, value: defaultValue(first.field, first.ops[0].op, albums) },
      ],
    });
  };

  const updateCondition = (index: number, next: StackRuleCondition) => {
    applyRule({
      ...rule,
      conditions: rule.conditions.map((c, i) => (i === index ? next : c)),
    });
  };

  const removeCondition = (index: number) => {
    applyRule({ ...rule, conditions: rule.conditions.filter((_, i) => i !== index) });
  };

  const canSave = rule.conditions.length > 0 && !!name.trim() && !saving;

  const handleSave = () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const id = createAutoStack(name.trim(), rule, lastGenerated || undefined);
      toast.success(`"${name.trim()}" created.`, { duration: 1500 });
      onCreated(id);
    } catch {
      toast.error("Couldn't create that session.");
      setSaving(false);
    }
  };

  return (
    <div className="pt-3 flex flex-col gap-3">
      {/* Match mode */}
      {rule.conditions.length > 1 && (
        <div className="flex items-center gap-2">
          <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>Match</span>
          {(["all", "any"] as const).map((m) => (
            <button
              key={m}
              onClick={() => applyRule({ ...rule, match: m })}
              aria-pressed={rule.match === m}
              className="px-3 py-1 rounded-full transition-all tappable"
              style={
                rule.match !== m
                  ? { fontSize: "12px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text-secondary)" }
                  : { fontSize: "12px", fontWeight: 500, backgroundColor: isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)", color: isDarkMode ? "#ACDEF2" : "#00527A" }
              }
            >
              {m === "all" ? "all rules" : "any rule"}
            </button>
          ))}
        </div>
      )}

      {/* Condition rows */}
      {rule.conditions.map((cond, i) => (
        <ConditionRow
          key={i}
          condition={cond}
          albums={albums}
          onChange={(next) => updateCondition(i, next)}
          onRemove={() => removeCondition(i)}
        />
      ))}

      <button
        onClick={addCondition}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] tappable transition-colors"
        style={{
          fontSize: "13px",
          fontWeight: 500,
          backgroundColor: "var(--c-surface-alt)",
          border: "1px dashed var(--c-border-strong)",
          color: "var(--c-text-secondary)",
          touchAction: "manipulation",
        }}
      >
        <Plus size={14} />
        Add a rule
      </button>

      {rule.conditions.length > 0 && (
        <>
          {/* Live match count — the same evaluator the session will use —
              followed by the rotation disclosure. Rotation defaults ON, which
              is only honest if it is stated before saving, not discovered
              later when a record has apparently gone missing. Read here as
              part of the readback they are already reading. */}
          <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text-secondary)" }}>
            {preview.poolSize} record{preview.poolSize === 1 ? "" : "s"} match
            {preview.poolSize === 1 ? "es" : ""}.
            {rule.limit && preview.poolSize > rule.limit ? (
              preview.rotating ? (
                <> This session plays {rule.limit}, rotating {rule.rotation}.</>
              ) : (
                <> This session plays {rule.limit}.</>
              )
            ) : null}
          </p>

          {/* Name — generated by default, editable, frozen once typed in. */}
          <div>
            <label
              htmlFor="stack-builder-name"
              className="block mb-1.5 uppercase tracking-wider"
              style={{ fontSize: "11px", fontWeight: 600, color: "var(--c-text-muted)", letterSpacing: "0.04em" }}
            >
              Name
            </label>
            <input
              id="stack-builder-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="Name this session..."
              className="w-full rounded-[8px] px-3 py-2 outline-none transition-colors"
              style={{
                fontSize: "16px",
                fontWeight: 400,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                backgroundColor: "var(--c-input-bg)",
                color: "var(--c-text)",
                border: "1px solid var(--c-border-strong)",
              }}
            />
            {/* The full criteria always render here, so a truncated title
                never hides part of what was built. */}
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {chips.map((chip, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-full"
                    style={{
                      fontSize: "11px",
                      fontWeight: 500,
                      backgroundColor: "var(--c-chip-bg)",
                      color: "var(--c-text-secondary)",
                    }}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full py-2.5 rounded-full bg-[#EBFD00] text-[#16181C] hover:bg-[#d9e800] tappable transition-colors disabled:opacity-40"
            style={{ fontSize: "14px", fontWeight: 600, fontFamily: "'DM Sans', system-ui, sans-serif" }}
          >
            {saving ? "Creating..." : "Create Session"}
          </button>
        </>
      )}
    </div>
  );
}

/** A sensible starting value so a freshly added row already matches something. */
function defaultValue(field: string, op: string, albums: { year: number }[]): unknown {
  const spec = opSpec(field, op);
  if (!spec || spec.value === "none") return undefined;
  if (spec.value === "yearRange") return [1970, 1979];
  if (spec.value === "number") {
    if (field === "year") return 1980;
    if (field === "rating") return 4;
    if (field === "playCount") return 1;
    return 365;
  }
  if (spec.value === "select") {
    const options = fieldSpec(field)?.options?.(albums as never) || [];
    if (field === "genre") return options.length ? [options[0]] : [];
    return options[0] ?? "";
  }
  return "";
}

const selectStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 400,
  fontFamily: "'DM Sans', system-ui, sans-serif",
  backgroundColor: "var(--c-input-bg)",
  color: "var(--c-text)",
  border: "1px solid var(--c-border-strong)",
  borderRadius: "8px",
  padding: "8px 36px 8px 10px",
  appearance: "none",
  width: "100%",
  minWidth: 0,
};

function ConditionRow({
  condition,
  albums,
  onChange,
  onRemove,
}: {
  condition: StackRuleCondition;
  albums: Parameters<typeof availableFields>[0];
  onChange: (next: StackRuleCondition) => void;
  onRemove: () => void;
}) {
  const { isDarkMode } = useApp();
  const fields = useMemo(() => availableFields(albums), [albums]);
  const spec = fieldSpec(condition.field);
  const op = opSpec(condition.field, condition.op);
  const options = useMemo(
    () => spec?.options?.(albums) || [],
    [spec, albums]
  );

  // Custom chevron, matching the album-detail edit-mode selects — iOS Safari
  // ignores dark mode on the native arrow.
  const arrow = isDarkMode ? "%23AAAAAA" : "%23333333";
  const chevron = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='none' stroke='${arrow}' stroke-width='1.5' d='M1 1.5 6 6.5 11 1.5'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
  };

  const handleField = (field: string) => {
    const nextSpec = fieldSpec(field);
    const nextOp = nextSpec?.ops[0].op ?? "is";
    onChange({ field, op: nextOp, value: defaultValue(field, nextOp, albums) });
  };

  const handleOp = (nextOp: string) => {
    onChange({ ...condition, op: nextOp, value: defaultValue(condition.field, nextOp, albums) });
  };

  return (
    <div
      className="rounded-[10px] p-2.5 flex flex-col gap-2"
      style={{ backgroundColor: "var(--c-surface-alt)", border: "1px solid var(--c-border)" }}
    >
      <div className="flex items-center gap-2">
        <select
          value={condition.field}
          onChange={(e) => handleField(e.target.value)}
          aria-label="Field"
          className="flex-1"
          style={{ ...selectStyle, ...chevron }}
        >
          {fields.map((f) => (
            <option key={f.field} value={f.field}>{f.label}</option>
          ))}
        </select>
        <button
          onClick={onRemove}
          aria-label="Remove this rule"
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center tappable"
          style={{ color: "var(--c-destructive-text)", touchAction: "manipulation" }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={condition.op}
          onChange={(e) => handleOp(e.target.value)}
          aria-label="Comparison"
          style={{ ...selectStyle, ...chevron, flex: "0 1 auto", width: "auto" }}
        >
          {(spec?.ops || []).map((o) => (
            <option key={o.op} value={o.op}>{o.label}</option>
          ))}
        </select>

        {op?.value === "select" && condition.field === "genre" && (
          <select
            value={(Array.isArray(condition.value) ? condition.value[0] : condition.value) as string}
            onChange={(e) => onChange({ ...condition, value: [e.target.value] })}
            aria-label="Value"
            className="flex-1"
            style={{ ...selectStyle, ...chevron }}
          >
            {options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        )}

        {op?.value === "select" && condition.field !== "genre" && (
          <select
            value={String(condition.value ?? "")}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            aria-label="Value"
            className="flex-1"
            style={{ ...selectStyle, ...chevron }}
          >
            {options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        )}

        {op?.value === "number" && (
          <input
            type="number"
            inputMode="numeric"
            value={String(condition.value ?? "")}
            onChange={(e) => onChange({ ...condition, value: e.target.value === "" ? "" : Number(e.target.value) })}
            aria-label="Value"
            className="flex-1 min-w-0"
            style={{ ...selectStyle, appearance: "auto", padding: "8px 10px" }}
          />
        )}

        {op?.value === "text" && (
          <input
            type="text"
            value={String(condition.value ?? "")}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            aria-label="Value"
            className="flex-1 min-w-0"
            style={{ ...selectStyle, appearance: "auto", padding: "8px 10px" }}
          />
        )}

        {op?.value === "yearRange" && (
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            {[0, 1].map((idx) => (
              <input
                key={idx}
                type="number"
                inputMode="numeric"
                aria-label={idx === 0 ? "From year" : "To year"}
                value={String((condition.value as unknown[])?.[idx] ?? "")}
                onChange={(e) => {
                  const pair = [...((condition.value as unknown[]) || [0, 0])];
                  pair[idx] = e.target.value === "" ? "" : Number(e.target.value);
                  onChange({ ...condition, value: pair });
                }}
                className="flex-1 min-w-0"
                style={{ ...selectStyle, appearance: "auto", padding: "8px 10px" }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
