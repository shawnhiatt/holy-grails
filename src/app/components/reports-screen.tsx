import { useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { ChevronRight, Disc3, ImageSquare } from "./icons";
import { motion, AnimatePresence, useInView, useReducedMotion } from "motion/react";
import { DURATION_FAST, DURATION_NORMAL, DURATION_SLOW, EASE_OUT } from "./motion-tokens";
import { useApp, type Screen } from "./app-context";
import { mediaType, type Album, type MediaType } from "./discogs-api";
import { conditionGradeColor } from "../../lib/condition-colors";
import { getCachedCollectionValue } from "./discogs-api";
import { bucketAddsByYear, cumulativeAddsByYear } from "../utils/insights";
import { purgeTagColor, purgeTagBg, purgeTagBorder } from "./purge-colors";
import { formatDateShort } from "./last-played-utils";
import { formatSyncedAgo } from "../utils/format";
import { NoDiscogsCard } from "./no-discogs-card";
import { api } from "../../../convex/_generated/api";

/* ─── Daily rotation utilities ─── */
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(array: T[], seed: number): T[] {
  const arr = [...array];
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getDailySeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/* ─── Track which screen opened Reports ─── */
let _entryScreen: Screen = "settings";
export function setReportEntryScreen(s: Screen) {
  _entryScreen = s;
}

/* ─── Helpers ─── */

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Whole-dollar formatting for market asks — matches the album-detail Value
 *  section convention (rounded, no cents). Callers prefix `~` where the number
 *  is an approximation. */
function formatWhole(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

/** True when the album carries a usable market ask (a priced number > 0).
 *  `null` (no listings) and `undefined` (never fetched) are both excluded. */
function hasMarketValue(a: Album): a is Album & { marketValue: number } {
  return typeof a.marketValue === "number" && a.marketValue > 0;
}

function getDecade(year: number): string {
  const d = Math.floor(year / 10) * 10;
  return `${d}s`;
}

function normalizeConditionLabel(mc: string): string {
  if (mc.includes("Mint") && !mc.includes("Near")) return "M";
  if (mc.includes("Near Mint")) return "NM";
  if (mc.includes("Very Good Plus") || mc === "VG+") return "VG+";
  if (mc.includes("Very Good") || mc === "VG") return "VG";
  if (mc.includes("Good Plus") || mc === "G+") return "G+";
  if (mc.includes("Good") || mc === "G") return "G";
  if (mc.includes("Fair")) return "F";
  if (mc.includes("Poor")) return "P";
  return mc;
}

const CONDITION_ORDER = ["M", "NM", "VG+", "VG", "G+", "G", "F", "P"];

/* ─── Section header style ─── */
const sectionHeaderStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  letterSpacing: "-0.3px",
  color: "var(--c-text)",
  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
};

/* ─── Chart palette ─── */
const CHART_GREEN = "#009A32";
const CHART_PINK = "#FF33B6";
const CHART_BLUE = "#0DB1F2";

/* ─── In-view animation variants ───
   Bars and stat tiles draw themselves when scrolled into view. Transform +
   opacity only (the design rule) — bar growth is scaleX with a left origin,
   never a width animation. MotionConfig reducedMotion="user" in App.tsx
   disables the transforms for reduced-motion users automatically. */
const VIEWPORT_ONCE = { once: true, amount: 0.25 } as const;

const fillGroup = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const fillBar = {
  hidden: { scaleX: 0 },
  show: { scaleX: 1, transition: { duration: DURATION_SLOW, ease: EASE_OUT } },
};
const fadeDot = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION_NORMAL, ease: EASE_OUT } },
};

const riseGroup = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const riseItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION_NORMAL, ease: EASE_OUT } },
};

/* ─── Shared chip-tab row (Breakdown, Listening) ─── */
function ChipTabs<T extends string>({ tabs, active, onSelect, isDark, className }: {
  tabs: { id: T; label: string }[];
  active: T;
  onSelect: (id: T) => void;
  isDark: boolean;
  className?: string;
}) {
  return (
    <div className={`flex gap-2 overflow-x-auto no-scrollbar ${className ?? ""}`}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          aria-pressed={t.id === active}
          className="px-3 py-1.5 rounded-full whitespace-nowrap transition-all flex-shrink-0"
          style={{
            fontSize: "12px",
            fontWeight: active === t.id ? 600 : 400,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            backgroundColor: active === t.id ? (isDark ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)") : (isDark ? "var(--c-chip-bg)" : "#EFF1F3"),
            color: active === t.id ? (isDark ? "#ACDEF2" : "#00527A") : "var(--c-text-muted)",
            border: "1px solid transparent",
            touchAction: "manipulation",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Custom Tooltip ─── */
function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-[8px] px-3 py-2 shadow-lg"
      style={{
        backgroundColor: "var(--c-surface)",
        border: "1px solid var(--c-border)",
      }}
    >
      {label && (
        <p style={{ fontSize: "11px", fontWeight: 500, color: "var(--c-text-faint)", marginBottom: 2 }}>
          {label}
        </p>
      )}
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ fontSize: "13px", fontWeight: 600, color: "var(--c-text)" }}>
          {formatter ? formatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
}

/* ─────────────────── SECTION 1: Collection Value ─────────────────── */

function CollectionValueSection(_props: { albums: Album[] }) {

  // Use the API-fetched collection value — null means unavailable (no sync or API failure)
  const collectionValue = getCachedCollectionValue();
  const hasValue = collectionValue !== null;
  const median = collectionValue?.median ?? 0;
  const minimum = collectionValue?.minimum ?? 0;
  const maximum = collectionValue?.maximum ?? 0;

  return (
    <div
      className="rounded-[12px] p-4 lg:p-5"
      style={{
        backgroundColor: "var(--c-surface)",
        border: "1px solid var(--c-border-strong)",
        boxShadow: "var(--c-card-shadow)",
      }}
    >
      <p style={sectionHeaderStyle}>
        Collection Value
      </p>

      {!hasValue ? (
        /* Unavailable state — no mock fallback, explicit messaging */
        <div className="mt-4 mb-2 text-center py-6">
          <p
            style={{
              fontSize: "15px",
              fontWeight: 500,
              color: "var(--c-text-muted)",
              lineHeight: 1.5,
            }}
          >
            Collection value unavailable.
          </p>
          <p
            className="mt-1"
            style={{
              fontSize: "13px",
              fontWeight: 400,
              color: "var(--c-text-muted)",
              lineHeight: 1.5,
            }}
          >
            Sync to try again.
          </p>
        </div>
      ) : (
        <>
          {/* Hero value — median from Discogs collection/value API */}
          <div className="text-center mt-4 mb-1">
            <p
              style={{
                fontSize: "56px",
                fontWeight: 700,
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                color: CHART_GREEN,
                lineHeight: 1.1,
                letterSpacing: "-2px",
              }}
            >
              {formatCurrency(median)}
            </p>
            <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)", marginTop: 4 }}>
              Estimated median value
            </p>
          </div>

          {/* Range strip — where the median sits between the low and high
              Discogs estimates. A range is a position, not a sentence, so it
              gets a track + marker instead of the old "min – max" text line. */}
          {maximum > minimum ? (
            <div className="mt-4 mb-1 px-1">
              <div style={{ position: "relative", height: 6, borderRadius: 999, backgroundColor: "var(--c-chip-bg)" }}>
                <motion.div
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={VIEWPORT_ONCE}
                  transition={{ duration: DURATION_SLOW, ease: EASE_OUT }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${Math.min(100, Math.max(0, ((median - minimum) / (maximum - minimum)) * 100))}%`,
                    borderRadius: 999,
                    backgroundColor: CHART_GREEN,
                    opacity: 0.35,
                    transformOrigin: "left",
                  }}
                />
                <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={VIEWPORT_ONCE}
                  transition={{ duration: DURATION_NORMAL, ease: EASE_OUT, delay: DURATION_SLOW * 0.6 }}
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: `${Math.min(100, Math.max(0, ((median - minimum) / (maximum - minimum)) * 100))}%`,
                    transform: "translate(-50%, -50%)",
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    backgroundColor: CHART_GREEN,
                    border: "2px solid var(--c-surface)",
                  }}
                />
              </div>
              <div className="flex justify-between mt-1.5">
                <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>{formatCurrency(minimum)}</span>
                <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>{formatCurrency(maximum)}</span>
              </div>
            </div>
          ) : (
            <p className="text-center mb-1" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
              {formatCurrency(minimum)} – {formatCurrency(maximum)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ─────────────────── SECTION: Top Shelf ─────────────────── */

/* The five most valuable records by lowest marketplace ask, from the shared
   market-value drip (Spec 6A.1 → 6B). Gated at 10+ valued albums so a nearly
   empty drip doesn't render a lopsided list. `marketValue` is merged onto the
   albums in ReportsScreen from market_values.getForUser. */
function TopShelfSection({ albums, onAlbumTap }: { albums: Album[]; onAlbumTap: (id: string) => void }) {
  const { valued, top } = useMemo(() => {
    const valued = albums.filter(hasMarketValue);
    const top = [...valued].sort((a, b) => b.marketValue - a.marketValue).slice(0, 5);
    return { valued, top };
  }, [albums]);

  // Gate: needs a real spread of priced records before a "top" is meaningful.
  if (valued.length < 10) return null;

  return (
    <div
      className="rounded-[12px] p-4 lg:p-5"
      style={{
        backgroundColor: "var(--c-surface)",
        border: "1px solid var(--c-border-strong)",
        boxShadow: "var(--c-card-shadow)",
      }}
    >
      <p style={sectionHeaderStyle}>Top Shelf</p>
      <p className="mt-1" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
        Your priciest pressings by lowest marketplace ask.
      </p>

      <motion.div
        className="mt-3 flex flex-col gap-2"
        variants={riseGroup}
        initial="hidden"
        whileInView="show"
        viewport={VIEWPORT_ONCE}
      >
        {top.map((a) => (
          <motion.button
            key={a.id}
            variants={riseItem}
            onClick={() => onAlbumTap(a.id)}
            className="flex items-center gap-3 rounded-[8px] p-2 transition-colors text-left tappable"
            style={{ backgroundColor: "var(--c-surface-alt)", border: "1px solid var(--c-border)", touchAction: "manipulation" }}
          >
            <div className="w-10 h-10 rounded-[6px] overflow-hidden flex-shrink-0">
              <img loading="lazy" decoding="async" src={a.thumb || a.cover} alt={a.title} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
              <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{a.title}</p>
              <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-secondary)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{a.artist}</p>
            </div>
            <span
              className="shrink-0"
              style={{ fontSize: "15px", fontWeight: 700, color: CHART_GREEN, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}
            >
              ~{formatWhole(a.marketValue)}
            </span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

/* ─────────────────── SECTION: Condition ─────────────────── */

function ConditionSection({ albums }: { albums: Album[] }) {
  const { isDarkMode } = useApp();

  const { conditionData, topConditionPct } = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of albums) {
      const label = normalizeConditionLabel(a.mediaCondition);
      map.set(label, (map.get(label) || 0) + 1);
    }
    const conditionData = CONDITION_ORDER
      .filter((c) => map.has(c))
      .map((c) => ({ condition: c, count: map.get(c)! }));

    const topCount = (map.get("M") || 0) + (map.get("NM") || 0);
    const topConditionPct = albums.length > 0 ? Math.round((topCount / albums.length) * 100) : 0;

    return { conditionData, topConditionPct };
  }, [albums]);

  const maxCount = Math.max(...conditionData.map((d) => d.count), 1);

  function conditionBarColor(condition: string): string {
    return conditionGradeColor(condition, isDarkMode) ?? (isDarkMode ? "#FF98DA" : "#9A207C");
  }

  return (
    <div
      className="rounded-[12px] p-4 lg:p-5"
      style={{
        backgroundColor: "var(--c-surface)",
        border: "1px solid var(--c-border-strong)",
        boxShadow: "var(--c-card-shadow)",
      }}
    >
      <p style={sectionHeaderStyle}>Condition</p>

      {/* Quality ratio */}
      <div
        className="mt-3 mb-4 rounded-[10px] px-4 py-3 flex items-center gap-3"
        style={{
          backgroundColor: isDarkMode ? "rgba(62,152,66,0.08)" : "rgba(62,152,66,0.06)",
          border: `1px solid ${isDarkMode ? "rgba(62,152,66,0.2)" : "rgba(62,152,66,0.15)"}`,
        }}
      >
        <span
          style={{
            fontSize: "28px",
            fontWeight: 700,
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            color: isDarkMode ? "#3E9842" : "#2D7A31",
            letterSpacing: "-1px",
            lineHeight: 1,
          }}
        >
          {topConditionPct}%
        </span>
        <p style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-secondary)", lineHeight: 1.4 }}>
          of your collection is NM or better
        </p>
      </div>

      {/* Condition distribution — bars draw in on scroll (scaleX, left origin) */}
      <motion.div
        className="flex flex-col gap-2.5"
        variants={fillGroup}
        initial="hidden"
        whileInView="show"
        viewport={VIEWPORT_ONCE}
      >
        {conditionData.map((d) => (
          <div key={d.condition} className="flex items-center gap-3">
            <span
              className="shrink-0 text-right"
              style={{
                width: 36,
                fontSize: "12px",
                fontWeight: 600,
                color: conditionBarColor(d.condition),
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >
              {d.condition}
            </span>
            <div className="flex-1 h-[18px] rounded-[4px] overflow-hidden" style={{ backgroundColor: "var(--c-input-bg)" }}>
              <motion.div
                className="h-full rounded-[4px]"
                variants={fillBar}
                style={{
                  width: `${(d.count / maxCount) * 100}%`,
                  backgroundColor: conditionBarColor(d.condition),
                  minWidth: 4,
                  transformOrigin: "left",
                }}
              />
            </div>
            <span className="shrink-0" style={{ width: 28, fontSize: "12px", fontWeight: 600, color: "var(--c-text)", textAlign: "right" }}>
              {d.count}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

/* ─────────────────── SECTION 3: Collection Breakdown ─────────────────── */

type BreakdownTab = "folder" | "decade" | "format";

function CollectionBreakdownSection({ albums }: { albums: Album[] }) {
  const { isDarkMode } = useApp();
  const [tab, setTab] = useState<BreakdownTab>("decade");

  const tabs: { id: BreakdownTab; label: string }[] = [
    { id: "decade", label: "By Decade" },
    { id: "format", label: "By Format" },
    { id: "folder", label: "By Folder" },
  ];

  return (
    <div
      className="rounded-[12px] p-4 lg:p-5"
      style={{
        backgroundColor: "var(--c-surface)",
        border: "1px solid var(--c-border-strong)",
        boxShadow: "var(--c-card-shadow)",
      }}
    >
      <p style={sectionHeaderStyle}>
        Breakdown
      </p>

      {/* Tab chips */}
      <ChipTabs tabs={tabs} active={tab} onSelect={setTab} isDark={isDarkMode} className="mt-3 mb-4" />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
        >
          {tab === "folder" && <ByFolderChart albums={albums} isDark={isDarkMode} />}
          {tab === "decade" && <ByDecadeChart albums={albums} isDark={isDarkMode} />}
          {tab === "format" && <ByFormatChart albums={albums} isDark={isDarkMode} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ByFolderChart({ albums }: { albums: Album[]; isDark: boolean }) {
  const { data, showValue } = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    for (const a of albums) {
      const entry = map.get(a.folder) || { count: 0, value: 0 };
      entry.count += 1;
      if (hasMarketValue(a)) entry.value += a.marketValue;
      map.set(a.folder, entry);
    }
    const data = [...map.entries()]
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([folder, v]) => ({ folder, count: v.count, value: v.value }));
    // Only surface a value column once most of the collection is priced —
    // otherwise per-folder totals read as artificially low.
    const valuedShare = albums.length > 0
      ? albums.filter(hasMarketValue).length / albums.length
      : 0;
    return { data, showValue: valuedShare >= 0.7 };
  }, [albums]);

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <motion.div
      className="flex flex-col gap-2.5"
      variants={fillGroup}
      initial="hidden"
      whileInView="show"
      viewport={VIEWPORT_ONCE}
    >
      {data.map((d) => (
        <div key={d.folder} className="flex items-center gap-3" style={{ minHeight: 32 }}>
          <span
            className="shrink-0 text-right"
            style={{
              width: 110,
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--c-text-secondary)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              display: "block",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              WebkitTextOverflow: "ellipsis",
            } as React.CSSProperties}
          >
            {d.folder}
          </span>
          <div className="flex-1 h-[10px] rounded-[4px] overflow-hidden" style={{ backgroundColor: "var(--c-input-bg)" }}>
            <motion.div
              className="h-full rounded-[4px]"
              variants={fillBar}
              style={{
                width: `${(d.count / maxCount) * 100}%`,
                backgroundColor: CHART_BLUE,
                minWidth: 4,
                transformOrigin: "left",
              }}
            />
          </div>
          <div className="flex flex-col items-end flex-shrink-0" style={{ minWidth: 36 }}>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 700,
                color: "var(--c-text)",
                fontFamily: "'DM Sans', system-ui, sans-serif",
                lineHeight: 1.2,
              }}
            >
              {d.count}
            </span>
            {showValue && d.value > 0 && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "var(--c-text-muted)",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}
              >
                ~{formatWhole(d.value)}
              </span>
            )}
          </div>
        </div>
      ))}
    </motion.div>
  );
}

function ByDecadeChart({ albums, isDark }: { albums: Album[]; isDark: boolean }) {
  // Mount the chart only once it scrolls into view so the recharts draw-in
  // animation plays where the user can see it (not at screen mount, far
  // above the fold). Reduced motion renders immediately, no animation.
  const chartRef = useRef<HTMLDivElement>(null);
  const inView = useInView(chartRef, { once: true, amount: 0.3 });
  const reduceMotion = useReducedMotion();
  const showChart = inView || !!reduceMotion;

  const data = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of albums) {
      if (!a.year || a.year < 1900) continue;
      const decade = getDecade(a.year);
      map.set(decade, (map.get(decade) || 0) + 1);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([decade, count]) => ({ decade, count }));
  }, [albums]);

  const goldenEra = useMemo(() => {
    if (data.length < 3) return null;
    let peak = data[0];
    for (const d of data) {
      if (d.count > peak.count) peak = d;
    }
    return peak.decade;
  }, [data]);

  // No datable years → render nothing (recharts otherwise paints an empty gray
  // box). Matches the By Format / By Folder tabs, which show nothing when empty.
  if (data.length === 0) return null;

  return (
    <div>
      <div ref={chartRef} style={{ height: 180 }}>
        {showChart && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 4, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="decade"
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={{ fontSize: 10, fill: "var(--c-text-faint)" }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--c-text-faint)" }}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip formatter={(v: number) => `${v} albums`} />} />
            <Bar dataKey="count" fill={CHART_BLUE} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={!reduceMotion} animationDuration={600} animationEasing="ease-out">
              {/* Peak bar light mode: keep the true brand yellow as the fill and
                  edge it with the brass gold accent so it holds on a white card —
                  a solid dark-yellow bar reads olive/muddy */}
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={goldenEra && entry.decade === goldenEra ? "#EBFD00" : CHART_BLUE}
                  stroke={goldenEra && entry.decade === goldenEra && !isDark ? "#8C6800" : undefined}
                  strokeWidth={goldenEra && entry.decade === goldenEra && !isDark ? 1.5 : undefined}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        )}
      </div>
      {goldenEra && (
        <div
          className="mt-3 rounded-[10px] px-4 py-3 flex items-center gap-3"
          style={{
            backgroundColor: isDark ? "rgba(235, 253, 0, 0.08)" : "rgba(235, 253, 0, 0.28)",
            border: isDark ? "1px solid rgba(235, 253, 0, 0.2)" : "1px solid rgba(140, 104, 0, 0.4)",
          }}
        >
          <span
            style={{
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              color: "var(--c-accent-yellow)",
              letterSpacing: "-1px",
              lineHeight: 1,
            }}
          >
            {goldenEra}
          </span>
          <p style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-secondary)", lineHeight: 1.4, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            is your most collected decade
          </p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────── SECTION: Artists ─────────────────── */

function ArtistsSection({ albums }: { albums: Album[] }) {
  const [showAll, setShowAll] = useState(false);

  const data = useMemo(() => {
    const exclude = new Set(["various", "various artists", "unknown artist", "unknown"]);
    const map = new Map<string, number>();
    for (const a of albums) {
      const name = a.artist.replace(/\s*\(\d+\)$/, "");
      if (exclude.has(name.trim().toLowerCase())) continue;
      map.set(name, (map.get(name) || 0) + 1);
    }
    return [...map.entries()]
      .filter(([, count]) => count >= 2)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([artist, count]) => ({ artist, count }));
  }, [albums]);

  if (data.length < 3) return null;

  const visible = showAll ? data : data.slice(0, 10);

  return (
    <div
      className="rounded-[12px] p-4 lg:p-5"
      style={{
        backgroundColor: "var(--c-surface)",
        border: "1px solid var(--c-border-strong)",
        boxShadow: "var(--c-card-shadow)",
      }}
    >
      <p style={sectionHeaderStyle}>Top Artists</p>
      <div className="flex flex-col mt-4">
        {visible.map((d, i) => {
          const rankColor = i === 0 ? "var(--c-accent-yellow)" : i < 3 ? "var(--c-text-muted)" : "var(--c-text-faint)";
          return (
            <div
              key={d.artist}
              className="flex items-center py-2.5"
              style={i < visible.length - 1 ? { borderBottom: "1px solid var(--c-border)" } : undefined}
            >
              <span
                className="shrink-0"
                style={{
                  width: 28,
                  fontSize: "13px",
                  fontWeight: 700,
                  color: rankColor,
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                }}
              >
                #{i + 1}
              </span>
              <span
                className="flex-1 mx-3"
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--c-text)",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  display: "block",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  WebkitTextOverflow: "ellipsis",
                } as React.CSSProperties}
              >
                {d.artist}
              </span>
              <span
                className="shrink-0"
                style={{ width: 28, fontSize: "13px", fontWeight: 700, color: "var(--c-text-muted)", textAlign: "right", fontFamily: "'DM Sans', system-ui, sans-serif" }}
              >
                {d.count}
              </span>
            </div>
          );
        })}
      </div>
      {data.length > 10 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 tappable transition-colors"
          style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-link)" }}
        >
          {showAll ? "Show less" : "Show more"}
        </button>
      )}
      <p className="mt-3" style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-faint)" }}>
        Artists with 2+ records
      </p>
    </div>
  );
}

/* ─────────────────── SECTION: Labels ─────────────────── */

function LabelsSection({ albums }: { albums: Album[] }) {
  const data = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of albums) {
      if (a.label) map.set(a.label, (map.get(a.label) || 0) + 1);
    }
    return [...map.entries()]
      .filter(([, count]) => count >= 2)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([label, count]) => ({ label, count }));
  }, [albums]);

  if (data.length < 3) return null;

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div
      className="rounded-[12px] p-4 lg:p-5"
      style={{
        backgroundColor: "var(--c-surface)",
        border: "1px solid var(--c-border-strong)",
        boxShadow: "var(--c-card-shadow)",
      }}
    >
      <p style={sectionHeaderStyle}>Top Labels</p>
      <motion.div
        className="flex flex-col gap-2.5 mt-4"
        variants={fillGroup}
        initial="hidden"
        whileInView="show"
        viewport={VIEWPORT_ONCE}
      >
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-3" style={{ height: 32 }}>
            <span
              className="shrink-0 text-right"
              style={{
                width: 140,
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--c-text-secondary)",
                fontFamily: "'DM Sans', system-ui, sans-serif",
                display: "block",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                WebkitTextOverflow: "ellipsis",
              } as React.CSSProperties}
            >
              {d.label}
            </span>
            <div className="flex-1 relative flex items-center">
              <motion.div
                className="absolute"
                variants={fillBar}
                style={{
                  left: 0,
                  width: `calc(${(d.count / maxCount) * 100}% - 3px)`,
                  height: 3,
                  backgroundColor: "var(--c-border-strong)",
                  borderRadius: 2,
                  minWidth: 4,
                  transformOrigin: "left",
                }}
              />
              <motion.div
                className="absolute"
                variants={fadeDot}
                style={{
                  left: `calc(${(d.count / maxCount) * 100}% - 3px)`,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: CHART_BLUE,
                  transform: "translateX(-50%)",
                }}
              />
            </div>
            <span
              className="shrink-0"
              style={{ width: 28, fontSize: "12px", fontWeight: 600, color: "var(--c-text)", textAlign: "right" }}
            >
              {d.count}
            </span>
          </div>
        ))}
      </motion.div>
      <p className="mt-3" style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-faint)" }}>
        Labels with 2+ records
      </p>
    </div>
  );
}

// Descriptor words stripped when tokenizing a format string down to its
// meaningful descriptor (LP, 12", 7", Box Set …). Medium names are handled
// separately via mediaType so any majority medium name drops out too.
const FORMAT_STRIP = new Set(["Album", "All Media", "Record Store Day", "Reissue", "Compilation", "Stereo", "Mono", "Promo", "Limited Edition", "Deluxe Edition", "Remaster", "Special Edition", "Club Edition", "Transcription", "Unofficial Release", "White Label"]);

// Plural media-type labels for the "plus N …" footer line.
const MEDIA_PLURAL: Record<MediaType, string> = {
  Vinyl: "vinyl", Shellac: "shellac", CD: "CDs", Cassette: "cassettes",
  Tape: "tapes", DVD: "DVDs", "Blu-ray": "Blu-rays", Digital: "digital",
  "Box Set": "box sets", Other: "other",
};

/** Descriptor breakdown (LP, 12", 7" …) for albums of one media type. The
 *  medium name itself is dropped via mediaType so it never dominates. */
function descriptorBreakdown(albums: Album[], type: MediaType) {
  const map = new Map<string, number>();
  for (const a of albums) {
    if (!a.format || mediaType(a.format) !== type) continue;
    const tokens = a.format
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter((t) => t && !FORMAT_STRIP.has(t) && mediaType(t) !== type);
    const key = tokens.length > 0 ? tokens[0] : type;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([format, count]) => ({ format, count }));
}

const MAJORITY_THRESHOLD = 0.9;

function StatGrid({ data }: { data: { format: string; count: number }[] }) {
  return (
    <motion.div
      className={data.length <= 3 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}
      variants={riseGroup}
      initial="hidden"
      whileInView="show"
      viewport={VIEWPORT_ONCE}
    >
      {data.map((d) => (
        <motion.div
          key={d.format}
          variants={riseItem}
          className="rounded-[10px] py-3 px-3 text-center"
          style={{ backgroundColor: "var(--c-surface-alt)", border: "1px solid var(--c-border)" }}
        >
          <div
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--c-text-secondary)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              marginBottom: 4,
            }}
          >
            {d.format}
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "var(--c-text)",
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              letterSpacing: "-0.5px",
              lineHeight: 1,
            }}
          >
            {d.count}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

function ByFormatChart({ albums }: { albums: Album[]; isDark: boolean }) {
  const { typeEntries, majorityType, majorityShare, descriptor } = useMemo(() => {
    const typeMap = new Map<MediaType, number>();
    let total = 0;
    for (const a of albums) {
      if (!a.format) continue;
      const t = mediaType(a.format);
      typeMap.set(t, (typeMap.get(t) || 0) + 1);
      total++;
    }
    const entries = [...typeMap.entries()].sort(([, a], [, b]) => b - a);
    const top = entries[0];
    const majType = top ? top[0] : ("Vinyl" as MediaType);
    return {
      typeEntries: entries,
      majorityType: majType,
      majorityShare: top && total ? top[1] / total : 1,
      descriptor: descriptorBreakdown(albums, majType),
    };
  }, [albums]);

  // Single-medium collection: descriptor grid only — matches the old look.
  if (typeEntries.length <= 1) {
    return <StatGrid data={descriptor} />;
  }

  // Mixed but one type dominates (the common case, e.g. mostly vinyl): keep
  // the descriptor grid for the majority type, with a footer naming the rest.
  if (majorityShare >= MAJORITY_THRESHOLD) {
    const rest = typeEntries.filter(([t]) => t !== majorityType);
    return (
      <>
        <StatGrid data={descriptor} />
        {rest.length > 0 && (
          <p className="mt-3" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
            plus {rest.map(([t, n]) => `${n} ${MEDIA_PLURAL[t]}`).join(", ")}
          </p>
        )}
      </>
    );
  }

  // Genuinely mixed media: media-type breakdown on top, majority descriptor
  // grid beneath.
  const typeData = typeEntries.slice(0, 8).map(([t, count]) => ({ format: t, count }));
  return (
    <div className="flex flex-col gap-4">
      <StatGrid data={typeData} />
      {descriptor.length > 0 && (
        <div>
          <p className="mb-2" style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--c-text-faint)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            {majorityType} breakdown
          </p>
          <StatGrid data={descriptor} />
        </div>
      )}
    </div>
  );
}

/* ─────────────────── SECTION 5: Listening Activity ─────────────────── */

type ListeningTab = "top" | "recent" | "unplayed";

function ListeningActivitySection({
  albums,
  lastPlayed,
  allPlayTimestamps,
  playCounts,
  isDarkMode,
  onNeverPlayedTap,
  onAlbumTap,
}: {
  albums: Album[];
  lastPlayed: Record<string, string>;
  allPlayTimestamps: number[];
  playCounts: Record<string, number>;
  isDarkMode: boolean;
  markPlayed: (id: string) => void;
  onNeverPlayedTap: () => void;
  onAlbumTap: (id: string) => void;
}) {
  // Played this month
  const playedThisMonth = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return albums.filter((a) => {
      const lp = lastPlayed[a.id];
      return lp && new Date(lp).getTime() >= monthStart;
    }).length;
  }, [albums, lastPlayed]);

  // Streak calculation — consecutive days with at least one play
  const { currentStreak, longestStreak } = useMemo(() => {
    if (allPlayTimestamps.length === 0) return { currentStreak: 0, longestStreak: 0 };

    // Collect unique calendar days (YYYY-MM-DD) from all play timestamps
    const daySet = new Set<string>();
    for (const ts of allPlayTimestamps) {
      const d = new Date(ts);
      daySet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }

    // Sort days descending
    const sortedDays = Array.from(daySet).sort().reverse();

    // Walk backward from today for current streak
    const now = new Date();
    const dayMs = 86400000;

    let current = 0;
    let checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Allow streak to start from today or yesterday
    const checkStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
    if (!daySet.has(checkStr)) {
      // Check yesterday — streak can still count if you haven't played today yet
      checkDate = new Date(checkDate.getTime() - dayMs);
      const yStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
      if (!daySet.has(yStr)) {
        // No play today or yesterday — current streak is 0
      } else {
        current = 1;
        checkDate = new Date(checkDate.getTime() - dayMs);
      }
    } else {
      current = 1;
      checkDate = new Date(checkDate.getTime() - dayMs);
    }
    if (current > 0) {
      while (true) {
        const s = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
        if (!daySet.has(s)) break;
        current++;
        checkDate = new Date(checkDate.getTime() - dayMs);
      }
    }

    // Longest streak — scan all sorted days for max consecutive run
    let longest = 0;
    if (sortedDays.length > 0) {
      let run = 1;
      for (let i = 1; i < sortedDays.length; i++) {
        const prev = new Date(sortedDays[i - 1]).getTime();
        const curr = new Date(sortedDays[i]).getTime();
        if (prev - curr === dayMs) {
          run++;
        } else {
          longest = Math.max(longest, run);
          run = 1;
        }
      }
      longest = Math.max(longest, run);
    }

    return { currentStreak: current, longestStreak: longest };
  }, [allPlayTimestamps]);

  // Last listened
  const lastListenedInfo = useMemo(() => {
    const dates = Object.values(lastPlayed).map((d) => new Date(d).getTime()).sort((a, b) => b - a);
    if (dates.length === 0) return { lastDaysAgo: null as number | null };
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayMs = 86400000;
    const lastDate = new Date(dates[0]);
    const lastDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate()).getTime();
    const lastDaysAgo = Math.round((today - lastDay) / dayMs);
    return { lastDaysAgo };
  }, [lastPlayed]);

  // Never played count
  const neverPlayedCount = useMemo(() => {
    return albums.filter((a) => !lastPlayed[a.id]).length;
  }, [albums, lastPlayed]);

  // Daily rotation of never-played albums
  const neglected = useMemo(() => {
    const pool = albums.filter((a) => !lastPlayed[a.id]);
    return seededShuffle(pool, getDailySeed()).slice(0, 5).map((album) => ({
      album,
      neverPlayed: true,
      label: `Added ${formatDateShort(album.dateAdded)}, no plays recorded`,
    }));
  }, [albums, lastPlayed]);

  // Top played — top 5 albums by play count (only if 5+ albums have plays)
  const topPlayed = useMemo(() => {
    const withPlays = albums
      .filter((a) => (playCounts[a.id] ?? 0) >= 1)
      .map((a) => ({ album: a, count: playCounts[a.id] }))
      .sort((a, b) => b.count - a.count);
    if (withPlays.length < 5) return [];
    return withPlays.slice(0, 5);
  }, [albums, playCounts]);

  // Recently played
  const recentlyPlayed = useMemo(() => {
    return albums
      .filter((a) => !!lastPlayed[a.id])
      .sort((a, b) => new Date(lastPlayed[b.id]).getTime() - new Date(lastPlayed[a.id]).getTime())
      .slice(0, 5);
  }, [albums, lastPlayed]);

  // Tabbed lists — replaces the old stacked Top Played / Recently Played /
  // No Spins scroll. Only tabs with data appear; if the stored tab loses its
  // data (e.g. hydration order), fall to the first available.
  const [tab, setTab] = useState<ListeningTab>("top");
  const listTabs = useMemo(() => {
    const t: { id: ListeningTab; label: string }[] = [];
    if (topPlayed.length >= 5) t.push({ id: "top", label: "Top Played" });
    if (recentlyPlayed.length > 0) t.push({ id: "recent", label: "Recently Played" });
    if (neglected.length > 0) t.push({ id: "unplayed", label: "No Spins" });
    return t;
  }, [topPlayed, recentlyPlayed, neglected]);
  const activeTab = listTabs.some((t) => t.id === tab) ? tab : listTabs[0]?.id;

  const monthName = new Date().toLocaleDateString("en-US", { month: "long" });

  return (
    <div
      className="rounded-[12px] p-4 lg:p-5"
      style={{
        backgroundColor: "var(--c-surface)",
        border: "1px solid var(--c-border-strong)",
        boxShadow: "var(--c-card-shadow)",
      }}
    >
      <p style={sectionHeaderStyle}>
        Listening
      </p>

      {/* Stats row */}
      <motion.div
        className="grid grid-cols-3 gap-3 mt-4"
        variants={riseGroup}
        initial="hidden"
        whileInView="show"
        viewport={VIEWPORT_ONCE}
      >
        {/* Played this month */}
        <motion.div
          variants={riseItem}
          className="rounded-[10px] py-3 px-3 text-center"
          style={{
            backgroundColor: purgeTagBg("keep", isDarkMode),
            border: `1px solid ${purgeTagBorder("keep", isDarkMode)}`,
          }}
        >
          <span
            style={{
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              color: purgeTagColor("keep", isDarkMode),
              lineHeight: 1.1,
            }}
          >
            {playedThisMonth}
          </span>
          <p style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", marginTop: 2 }}>
            played in<br/> {monthName}
          </p>
        </motion.div>

        {/* Days since last played */}
        <motion.div
          variants={riseItem}
          className="rounded-[10px] py-3 px-3 text-center"
          style={{
            backgroundColor: isDarkMode ? "rgba(172,222,242,0.08)" : "rgba(172,222,242,0.2)",
            border: `1px solid ${isDarkMode ? "rgba(172,222,242,0.15)" : "rgba(172,222,242,0.35)"}`,
          }}
        >
          {lastListenedInfo.lastDaysAgo === 0 || lastListenedInfo.lastDaysAgo === 1 ? (
            <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--c-text-muted)", margin: "auto", display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
              {lastListenedInfo.lastDaysAgo === 0 ? "Last played earlier today" : "Last played yesterday"}
            </p>
          ) : (
            <>
              <span
                style={{
                  fontSize: "28px",
                  fontWeight: 700,
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                  color: isDarkMode ? "#ACDEF2" : "#00527A",
                  lineHeight: 1.1,
                }}
              >
                {lastListenedInfo.lastDaysAgo === null ? "—" : lastListenedInfo.lastDaysAgo}
              </span>
              <p style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", marginTop: 2 }}>
                {lastListenedInfo.lastDaysAgo === null ? "no plays yet" : "days since last played"}
              </p>
            </>
          )}
        </motion.div>

        {/* No play recorded */}
        <motion.button
          variants={riseItem}
          onClick={onNeverPlayedTap}
          className="rounded-[10px] py-3 px-3 text-center transition-colors"
          style={{
            backgroundColor: isDarkMode ? "rgba(255,51,182,0.08)" : "rgba(255,51,182,0.12)",
            border: `1px solid ${isDarkMode ? "rgba(255,51,182,0.2)" : "rgba(255,51,182,0.3)"}`,
            touchAction: "manipulation",
          }}
        >
          <span
            style={{
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              color: CHART_PINK,
              lineHeight: 1.1,
            }}
          >
            {neverPlayedCount}
          </span>
          <p style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", marginTop: 2 }}>
            no plays<br/> recorded
          </p>
        </motion.button>
      </motion.div>

      {/* Streak row — only when at least one streak >= 1 */}
      {(currentStreak >= 1 || longestStreak >= 1) && (
        <motion.div
          className="grid grid-cols-2 gap-3 mt-3"
          variants={riseGroup}
          initial="hidden"
          whileInView="show"
          viewport={VIEWPORT_ONCE}
        >
          {/* A live streak (2+ days) earns the yellow accent treatment
              (golden-era pill convention); otherwise neutral. */}
          <motion.div
            variants={riseItem}
            className="rounded-[10px] py-3 px-3 text-center"
            style={
              currentStreak >= 2
                ? {
                    backgroundColor: isDarkMode ? "rgba(235, 253, 0, 0.08)" : "rgba(235, 253, 0, 0.28)",
                    border: isDarkMode ? "1px solid rgba(235, 253, 0, 0.2)" : "1px solid rgba(140, 104, 0, 0.4)",
                  }
                : {
                    backgroundColor: "var(--c-surface-alt)",
                    border: "1px solid var(--c-border)",
                  }
            }
          >
            <span
              style={{
                fontSize: "28px",
                fontWeight: 700,
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                color: currentStreak >= 2 ? "var(--c-accent-yellow)" : "var(--c-text)",
                lineHeight: 1.1,
              }}
            >
              {currentStreak}
            </span>
            <p style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", marginTop: 2 }}>
              current streak days
            </p>
          </motion.div>
          <motion.div
            variants={riseItem}
            className="rounded-[10px] py-3 px-3 text-center"
            style={{
              backgroundColor: "var(--c-surface-alt)",
              border: "1px solid var(--c-border)",
            }}
          >
            <span
              style={{
                fontSize: "28px",
                fontWeight: 700,
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                color: "var(--c-text)",
                lineHeight: 1.1,
              }}
            >
              {longestStreak}
            </span>
            <p style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", marginTop: 2 }}>
              longest streak days
            </p>
          </motion.div>
        </motion.div>
      )}

      {/* Tabbed lists — Top Played / Recently Played / No Spins. One list at
          a time instead of the old triple-stacked scroll. */}
      {listTabs.length > 0 && activeTab && (
        <div className="mt-5">
          <ChipTabs tabs={listTabs} active={activeTab} onSelect={setTab} isDark={isDarkMode} className="mb-3" />

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              variants={riseGroup}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, transition: { duration: DURATION_FAST, ease: EASE_OUT } }}
            >
              {activeTab === "top" && (
                <div className="flex flex-col gap-2">
                  {topPlayed.map((item) => (
                    <motion.button
                      key={item.album.id}
                      variants={riseItem}
                      onClick={() => onAlbumTap(item.album.id)}
                      className="flex items-center gap-3 rounded-[10px] p-2.5 transition-colors text-left"
                      style={{
                        backgroundColor: isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(22,24,28,0.04)",
                        touchAction: "manipulation",
                      }}
                    >
                      <div className="w-[72px] h-[72px] rounded-[8px] overflow-hidden flex-shrink-0">
                        <img loading="lazy" decoding="async" src={item.album.cover || item.album.thumb} alt={item.album.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
                        <p
                          style={{ fontSize: "15px", fontWeight: 600, color: "var(--c-text)", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}
                        >
                          {item.album.title}
                        </p>
                        <p
                          className="mt-0.5"
                          style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-secondary)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}
                        >
                          {item.album.artist}
                        </p>
                        <p className="mt-1" style={{ fontSize: "13px", fontWeight: 600, color: "#3E9842", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                          {item.count} {item.count === 1 ? "play" : "plays"}
                        </p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}

              {activeTab === "recent" && (
                <div className="flex flex-col gap-2">
                  {recentlyPlayed.map((a) => (
                    <motion.button
                      key={a.id}
                      variants={riseItem}
                      onClick={() => onAlbumTap(a.id)}
                      className="flex items-center gap-3 rounded-[8px] p-2 transition-colors text-left"
                      style={{
                        backgroundColor: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(22,24,28,0.03)",
                        touchAction: "manipulation",
                      }}
                    >
                      <div className="w-11 h-11 rounded-[6px] overflow-hidden flex-shrink-0">
                        <img loading="lazy" decoding="async" src={a.thumb || a.cover} alt={a.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
                        <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>
                          {a.title}
                        </p>
                        <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-secondary)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>
                          {a.artist}
                        </p>
                        <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
                          Played {formatDateShort(lastPlayed[a.id])}
                        </p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}

              {activeTab === "unplayed" && (
                <>
                  <div className="flex flex-col gap-2">
                    {neglected.map((item) => (
                      <motion.button
                        key={item.album.id}
                        variants={riseItem}
                        onClick={() => onAlbumTap(item.album.id)}
                        className="flex items-center gap-3 rounded-[8px] p-2 transition-colors text-left"
                        style={{
                          backgroundColor: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(22,24,28,0.03)",
                          touchAction: "manipulation",
                        }}
                      >
                        <div className="w-10 h-10 rounded-[6px] overflow-hidden flex-shrink-0">
                          <img loading="lazy" decoding="async" src={item.album.thumb || item.album.cover} alt={item.album.title} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
                          <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>
                            {item.album.title}
                          </p>
                          <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-secondary)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>
                            {item.album.artist}
                          </p>
                          <p style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>
                            {item.label}
                          </p>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                  {neverPlayedCount > neglected.length && (
                    <button
                      onClick={onNeverPlayedTap}
                      className="mt-3 tappable transition-colors"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-link)", background: "none", border: "none", padding: 0, touchAction: "manipulation" }}
                    >
                      See all {neverPlayedCount}
                    </button>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

    </div>
  );
}

/* ─────────────────── SECTION 4: Purge Progress ─────────────────── */

function PurgeProgressSection({ albums }: { albums: Album[] }) {
  const { isDarkMode, setScreen } = useApp();
  const hasCollectionValue = getCachedCollectionValue() !== null;

  const stats = useMemo(() => {
    const keep = albums.filter((a) => a.purgeTag === "keep").length;
    const cut = albums.filter((a) => a.purgeTag === "cut").length;
    const maybe = albums.filter((a) => a.purgeTag === "maybe").length;
    const unrated = albums.filter((a) => a.purgeTag === null).length;
    const total = albums.length;
    const rated = total - unrated;
    const pct = total > 0 ? (rated / total) * 100 : 0;
    // Market ask summed over Cut records that carry a priced value (Spec 6B) —
    // upgrades the count-only "Cutting deadweight" callout to a dollar figure.
    const cutValue = albums
      .filter((a) => a.purgeTag === "cut" && hasMarketValue(a))
      .reduce((sum, a) => sum + (a.marketValue as number), 0);
    return { keep, cut, maybe, unrated, total, rated, pct, cutValue };
  }, [albums]);

  // Verdict segments for the progress bar (evaluated portion, left-aligned)
  // plus the legend below it. Unrated is the remaining track — a neutral,
  // theme-following fill — so the bar reads as "how far into the purge" while
  // the colored slice carries the verdict mix. Replaces the old radial ring
  // (which stacked its center text vertically) with a linear read.
  const segments: { tag: string; label: string; count: number }[] = [
    { tag: "keep", label: "Keep", count: stats.keep },
    { tag: "maybe", label: "Maybe", count: stats.maybe },
    { tag: "cut", label: "Cut", count: stats.cut },
  ];
  const legend = [...segments, { tag: "unrated", label: "Unrated", count: stats.unrated }];

  return (
    <div
      className="rounded-[12px] p-4 lg:p-5"
      style={{
        backgroundColor: "var(--c-surface)",
        border: "1px solid var(--c-border-strong)",
        boxShadow: "var(--c-card-shadow)",
      }}
    >
      <div className="flex items-center justify-between">
        <p style={sectionHeaderStyle}>Purge Progress</p>
        <button
          onClick={() => setScreen("purge")}
          className="cursor-pointer"
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--c-link)",
            fontFamily: "'DM Sans', system-ui, sans-serif",
            background: "none",
            border: "none",
            padding: 0,
          }}
        >
          Open Purge
        </button>
      </div>

      {/* Headline — horizontal, replaces the stacked ring center */}
      <div className="flex items-baseline justify-between mt-4 mb-3">
        <div className="flex items-baseline" style={{ gap: "7px", minWidth: 0 }}>
          <span
            style={{
              fontSize: "30px",
              fontWeight: 700,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              color: "var(--c-text)",
              lineHeight: 1,
            }}
          >
            {stats.rated}
          </span>
          <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text-muted)" }}>
            of {stats.total} evaluated
          </span>
        </div>
        <span
          style={{
            fontSize: "18px",
            fontWeight: 700,
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            color: "var(--c-text-secondary)",
            flexShrink: 0,
          }}
        >
          {Math.round(stats.pct)}%
        </span>
      </div>

      {/* Segmented progress bar — verdict slices over a neutral unrated track.
          The evaluated slice sweeps in from the left on scroll (scaleX on the
          group, so the segments hold their relative sizes while growing). */}
      <div
        className="w-full overflow-hidden"
        style={{ height: "14px", borderRadius: "999px", backgroundColor: "var(--c-chip-bg)" }}
      >
        {stats.total > 0 && stats.rated > 0 && (
          <motion.div
            className="h-full flex overflow-hidden"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={VIEWPORT_ONCE}
            transition={{ duration: DURATION_SLOW, ease: EASE_OUT }}
            style={{
              width: `${(stats.rated / stats.total) * 100}%`,
              borderRadius: "999px",
              transformOrigin: "left",
            }}
          >
            {segments.map((s) =>
              s.count > 0 ? (
                <div
                  key={s.tag}
                  style={{
                    width: `${(s.count / stats.rated) * 100}%`,
                    backgroundColor: purgeTagColor(s.tag, isDarkMode),
                  }}
                />
              ) : null,
            )}
          </motion.div>
        )}
      </div>

      {/* Legend — carries the exact counts the old 2×2 grid held */}
      <div className="flex flex-wrap items-center mt-3" style={{ columnGap: "16px", rowGap: "6px" }}>
        {legend.map((l) => (
          <div key={l.tag} className="flex items-center" style={{ gap: "6px" }}>
            <span
              style={{
                width: "9px",
                height: "9px",
                borderRadius: "999px",
                backgroundColor: l.tag === "unrated" ? "var(--c-text-muted)" : purgeTagColor(l.tag, isDarkMode),
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "15px",
                fontWeight: 700,
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                color: "var(--c-text)",
                lineHeight: 1,
              }}
            >
              {l.count}
            </span>
            <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Empty-state nudge only when nothing's been evaluated */}
      {stats.rated === 0 && (
        <p className="mt-3" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
          No verdicts yet. Open Purge to start.
        </p>
      )}

      {/* Cut-pile callout — dollar figure once the drip has priced the Cut
          records (Spec 6B), otherwise count only. */}
      {hasCollectionValue && stats.cut >= 3 && (
        <p className="mt-3" style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text-secondary)" }}>
          {stats.cutValue > 0
            ? `Cutting deadweight: ${stats.cut} tagged Cut, ~${formatWhole(stats.cutValue)} at lowest ask.`
            : `Cutting deadweight: ${stats.cut} records tagged Cut.`}
        </p>
      )}
    </div>
  );
}

/* ─────────────────── SECTION: Collection Growth ─────────────────── */

type GrowthTab = "year" | "all";

function CollectionGrowthSection({ albums }: { albums: Album[] }) {
  const { isDarkMode } = useApp();
  const [growthTab, setGrowthTab] = useState<GrowthTab>("year");

  // In-view chart mount — same pattern as ByDecadeChart.
  const chartRef = useRef<HTMLDivElement>(null);
  const inView = useInView(chartRef, { once: true, amount: 0.3 });
  const reduceMotion = useReducedMotion();
  const showChart = inView || !!reduceMotion;

  const data = useMemo(() => bucketAddsByYear(albums), [albums]);
  const cumulative = useMemo(() => cumulativeAddsByYear(albums), [albums]);
  const total = useMemo(() => data.reduce((sum, d) => sum + d.count, 0), [data]);
  const peak = useMemo(() => {
    if (data.length === 0) return null;
    let p = data[0];
    for (const d of data) if (d.count > p.count) p = d;
    return p;
  }, [data]);

  // Gate: needs a couple of years and enough records to read as a trend.
  if (data.length < 2 || total < 10 || !peak) return null;

  const currentYear = new Date().getFullYear();
  const allTimeTotal = cumulative.length > 0 ? cumulative[cumulative.length - 1].total : 0;

  const growthTabs: { id: GrowthTab; label: string }[] = [
    { id: "year", label: "Per Year" },
    { id: "all", label: "All Time" },
  ];

  return (
    <div
      className="rounded-[12px] p-4 lg:p-5"
      style={{
        backgroundColor: "var(--c-surface)",
        border: "1px solid var(--c-border-strong)",
        boxShadow: "var(--c-card-shadow)",
      }}
    >
      <p style={sectionHeaderStyle}>Collection Growth</p>

      {/* Per Year = adds per year (last 10). All Time = the cumulative curve —
          the actual size of the collection over time. */}
      <ChipTabs tabs={growthTabs} active={growthTab} onSelect={setGrowthTab} isDark={isDarkMode} className="mt-3" />

      <div ref={chartRef} className="mt-4" style={{ height: 180 }}>
        {showChart && (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={growthTab}
              className="h-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
            >
              {growthTab === "year" ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 16, right: 4, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="year"
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      tick={{ fontSize: 10, fill: "var(--c-text-faint)" }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--c-text-faint)" }}
                      allowDecimals={false}
                    />
                    <Tooltip content={<ChartTooltip formatter={(v: number) => `${v} added`} />} />
                    <Bar dataKey="count" fill={CHART_BLUE} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={!reduceMotion} animationDuration={600} animationEasing="ease-out">
                      {/* Current-year bar in the brand yellow, edged with brass gold in
                          light mode so it holds on a white card (matches the peak-decade
                          convention in ByDecadeChart). */}
                      {data.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.year === currentYear ? "#EBFD00" : CHART_BLUE}
                          stroke={entry.year === currentYear && !isDarkMode ? "#8C6800" : undefined}
                          strokeWidth={entry.year === currentYear && !isDarkMode ? 1.5 : undefined}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cumulative} margin={{ top: 16, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_BLUE} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={CHART_BLUE} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="year"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                      tick={{ fontSize: 10, fill: "var(--c-text-faint)" }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--c-text-faint)" }}
                      allowDecimals={false}
                    />
                    <Tooltip content={<ChartTooltip formatter={(v: number) => `${v} records`} />} />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke={CHART_BLUE}
                      strokeWidth={2}
                      fill="url(#growthFill)"
                      dot={false}
                      activeDot={{ r: 4, fill: CHART_BLUE, strokeWidth: 0 }}
                      isAnimationActive={!reduceMotion}
                      animationDuration={700}
                      animationEasing="ease-out"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
      <div
        className="mt-3 rounded-[10px] px-4 py-3"
        style={{
          backgroundColor: isDarkMode ? "rgba(235, 253, 0, 0.08)" : "rgba(235, 253, 0, 0.28)",
          border: isDarkMode ? "1px solid rgba(235, 253, 0, 0.2)" : "1px solid rgba(140, 104, 0, 0.4)",
        }}
      >
        <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text-secondary)", lineHeight: 1.4, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          {growthTab === "all"
            ? `${allTimeTotal} records deep.`
            : peak.year === currentYear
              ? "Your biggest year yet"
              : `${peak.count} records added in ${peak.year}`}
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════ MAIN REPORTS SCREEN ═══════════════════ */

/* ─────────────────── Collection Maintenance ─────────────────── */

function CollectionMaintenanceSection({ albums, onAlbumTap }: { albums: Album[]; onAlbumTap: (id: string) => void }) {
  const { isDarkMode } = useApp();
  const [activeId, setActiveId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const unset = (v?: string) => !v || !v.trim();
    const list = [
      { id: "media", label: "Media Condition", Icon: Disc3, items: albums.filter((a) => unset(a.mediaCondition)) },
      { id: "sleeve", label: "Sleeve Condition", Icon: ImageSquare, items: albums.filter((a) => unset(a.sleeveCondition)) },
    ];
    return list.filter((c) => c.items.length > 0);
  }, [albums]);

  if (categories.length === 0) return null;

  const active = categories.find((c) => c.id === activeId) ?? null;
  const accent = isDarkMode ? "#ACDEF2" : "#00527A";
  const tileBg = isDarkMode ? "rgba(172,222,242,0.12)" : "rgba(172,222,242,0.35)";

  return (
    <div
      className="rounded-[12px] p-4 lg:p-5"
      style={{
        backgroundColor: "var(--c-surface)",
        border: "1px solid var(--c-border-strong)",
        boxShadow: "var(--c-card-shadow)",
      }}
    >
      <p style={sectionHeaderStyle} className="mb-3">Missing Details</p>

      <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        {categories.map(({ id, label, Icon, items }) => {
          const isActive = id === activeId;
          return (
            <button
              key={id}
              onClick={() => setActiveId(isActive ? null : id)}
              className="flex-shrink-0 flex items-center gap-3 rounded-[10px] p-3 transition-colors text-left"
              style={{
                width: "240px",
                backgroundColor: isActive ? tileBg : (isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(22,24,28,0.04)"),
                border: `1px solid ${isActive ? accent : "transparent"}`,
                touchAction: "manipulation",
              }}
            >
              <div className="flex items-center justify-center rounded-[10px] flex-shrink-0" style={{ width: 40, height: 40, backgroundColor: tileBg, color: accent }}>
                <Icon size={20} />
              </div>
              <div className="flex-1" style={{ minWidth: 0 }}>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{label}</p>
                <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
                  Not set for {items.length} {items.length === 1 ? "album" : "albums"}
                </p>
              </div>
              <ChevronRight size={18} style={{ color: "var(--c-text-faint)", flexShrink: 0, transform: isActive ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {active && (
          <motion.div
            key={active.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DURATION_NORMAL }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex flex-col gap-2">
              {active.items.slice(0, 50).map((a) => (
                <button
                  key={a.id}
                  onClick={() => onAlbumTap(a.id)}
                  className="flex items-center gap-3 rounded-[8px] p-2 transition-colors text-left"
                  style={{ backgroundColor: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(22,24,28,0.03)", touchAction: "manipulation" }}
                >
                  <div className="w-10 h-10 rounded-[6px] overflow-hidden flex-shrink-0">
                    <img loading="lazy" decoding="async" src={a.thumb || a.cover} alt={a.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
                    <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{a.title}</p>
                    <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-secondary)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{a.artist}</p>
                  </div>
                </button>
              ))}
              {active.items.length > 50 && (
                <p className="text-center mt-1" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-faint)" }}>
                  +{active.items.length - 50} more
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ReportsScreen() {
  const { albums: rawAlbums, wants, lastSynced, setScreen, isDarkMode, lastPlayed, allPlayTimestamps, playCounts, markPlayed, setNeverPlayedFilter, setSelectedAlbumId, setShowAlbumDetail, isAuthenticated, sessionToken } = useApp();

  // Shared per-release market values from the drip (Spec 6A.1 → 6B). Subscribed
  // here (not in app-context) so the query stays scoped to the lazy-loaded
  // Insights chunk and off every other consumer. "skip" until authed.
  const marketValues = useQuery(
    api.market_values.getForUser,
    sessionToken ? { sessionToken } : "skip"
  );

  // Merge value + fetchedAt onto the albums by release_id. Same array identity
  // as rawAlbums until values arrive, so no extra section re-renders on load.
  const albums = useMemo(() => {
    if (!marketValues || marketValues.length === 0) return rawAlbums;
    const byRelease = new Map(marketValues.map((m) => [m.releaseId, m]));
    return rawAlbums.map((a) => {
      const mv = byRelease.get(a.release_id);
      return mv ? { ...a, marketValue: mv.value, marketValueFetchedAt: mv.fetchedAt } : a;
    });
  }, [rawAlbums, marketValues]);

  // Freshness of the value data — newest fetchedAt across the caller's priced
  // releases. Null until any value has been collected.
  const valuesFreshAt = useMemo(() => {
    if (!marketValues || marketValues.length === 0) return null;
    return marketValues.reduce((mx, m) => Math.max(mx, m.fetchedAt), 0);
  }, [marketValues]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center px-[16px] lg:px-[24px] pt-[2px] pb-[8px] lg:pt-[8px] lg:pb-[20px]"
      >
        <div className="flex flex-col">
          <p
            className="mt-1"
            style={{
              fontSize: "13px",
              fontWeight: 500,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              color: "var(--c-text-muted)",
            }}
          >
            {albums.length} collected · {wants.length} on wantlist
          </p>
        </div>
      </div>

      {/* No Discogs connected */}
      {albums.length === 0 && !isAuthenticated ? (
        <NoDiscogsCard
          heading="No data yet."
          subtext="Connect your Discogs collection to see insights about your records."
        />
      ) : albums.length === 0 ? (
        /* Connected but no collection to analyze (empty or private on Discogs)
           — one clean notice instead of a stack of $0.00 / 0 / 0% cards. */
        <div
          className="flex-1 flex flex-col items-center justify-center px-8"
          style={{ paddingBottom: "var(--nav-clearance, 0px)" }}
        >
          <p style={{ fontSize: "15px", fontWeight: 500, color: "var(--c-text-muted)", fontFamily: "'DM Sans', system-ui, sans-serif", textAlign: "center" }}>
            No insights yet.
          </p>
          <p className="mt-1" style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-muted)", fontFamily: "'DM Sans', system-ui, sans-serif", textAlign: "center" }}>
            Sync your Discogs collection to see stats about your records.
          </p>
          <button
            onClick={() => setScreen("settings")}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full transition-colors cursor-pointer"
            style={{ fontSize: "13px", fontWeight: 500, fontFamily: "'DM Sans', system-ui, sans-serif", backgroundColor: isDarkMode ? "rgba(172,222,242,0.15)" : "rgba(172,222,242,0.4)", color: isDarkMode ? "#ACDEF2" : "#00527A" }}
          >
            Sync your Discogs account →
          </button>
        </div>
      ) : (
      /* Scrollable content */
      <div className="flex-1 overflow-y-auto overlay-scroll px-[16px] lg:px-[24px] pt-[16px]" style={{ paddingBottom: "calc(32px + var(--nav-clearance, 0px))" }}>
        {/* Desktop 2x2 grid / Mobile vertical stack */}
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-5 lg:gap-6">
          {/* Collection Value — full width */}
          <div className="lg:col-span-2">
            <CollectionValueSection albums={albums} />
          </div>

          {/* Top Shelf — most valuable records (hidden until 10+ are priced) */}
          <div className="lg:col-span-2">
            <TopShelfSection
              albums={albums}
              onAlbumTap={(id) => { setSelectedAlbumId(id); setShowAlbumDetail(true); }}
            />
          </div>

          {/* Listening Activity */}
          <div className="lg:col-span-2">
            <ListeningActivitySection
              albums={albums}
              lastPlayed={lastPlayed}
              allPlayTimestamps={allPlayTimestamps}
              playCounts={playCounts}
              isDarkMode={isDarkMode}
              markPlayed={markPlayed}
              onNeverPlayedTap={() => { setNeverPlayedFilter(true); setScreen("crate"); }}
              onAlbumTap={(id) => { setSelectedAlbumId(id); setShowAlbumDetail(true); }}
            />
          </div>

          {/* Purge Progress */}
          <div className="lg:col-span-2 lg:max-w-[50%] lg:mx-auto lg:w-full">
            <PurgeProgressSection albums={albums} />
          </div>

          {/* Breakdown — full width */}
          <div className="lg:col-span-2">
            <CollectionBreakdownSection albums={albums} />
          </div>

          {/* Condition — full width on mobile, half on desktop */}
          <div className="lg:col-span-2">
            <ConditionSection albums={albums} />
          </div>

          {/* Missing Details — surfaces albums missing grading/data */}
          <div className="lg:col-span-2">
            <CollectionMaintenanceSection
              albums={albums}
              onAlbumTap={(id) => { setSelectedAlbumId(id); setShowAlbumDetail(true); }}
            />
          </div>

          {/* Collection Growth — after Breakdown, before Top Artists */}
          <div className="lg:col-span-2">
            <CollectionGrowthSection albums={albums} />
          </div>

          {/* Artists */}
          <div className="lg:col-span-2">
            <ArtistsSection albums={albums} />
          </div>

          {/* Labels */}
          <div className="lg:col-span-2">
            <LabelsSection albums={albums} />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pb-4 text-center flex flex-col gap-1 items-center">
          <p className="max-w-xs" style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", textWrap: "pretty" }}>
            Collection value from Discogs{lastSynced ? `, updated ${lastSynced}` : ""}.
          </p>
          {valuesFreshAt !== null && (
            <p className="max-w-xs" style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", textWrap: "pretty" }}>
              Market asks updated {formatSyncedAgo(valuesFreshAt)}.
            </p>
          )}
        </div>
      </div>
      )}
    </div>
  );
}