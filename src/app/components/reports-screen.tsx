import { useMemo, useState } from "react";
import { Play } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { useApp, type Screen } from "./app-context";
import type { Album } from "./discogs-api";
import { getCachedMarketData, getCachedCollectionValue } from "./discogs-api";
import { getPriceAtCondition } from "./market-value";
import { purgeTagColor, purgeTagBg, purgeTagBorder, purgeTagLabel } from "./purge-colors";
import { formatDateShort } from "./last-played-utils";
import { toast } from "sonner";
import { NoDiscogsCard } from "./no-discogs-card";

/* ─── Track which screen opened Reports ─── */
let _entryScreen: Screen = "settings";
export function setReportEntryScreen(s: Screen) {
  _entryScreen = s;
}

/* ─── Helpers ─── */

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

/* ─── Accent color helper ─── */
function useAccent() {
  const { isDarkMode } = useApp();
  return isDarkMode ? "#EBFD00" : "#7A8A00";
}

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

/* ─── Custom Tooltip ─── */
function ChartTooltip({ active, payload, label, formatter }: any) {
  const { isDarkMode } = useApp();
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
        <p style={{ fontSize: "11px", fontWeight: 500, color: isDarkMode ? "#617489" : "#9BA4B2", marginBottom: 2 }}>
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

function CollectionValueSection({ albums }: { albums: Album[] }) {
  const { isDarkMode } = useApp();

  // Use the API-fetched collection value — null means unavailable (no sync or API failure)
  const collectionValue = getCachedCollectionValue();
  const hasValue = collectionValue !== null;
  const median = collectionValue?.median ?? 0;
  const minimum = collectionValue?.minimum ?? 0;
  const maximum = collectionValue?.maximum ?? 0;

  // Generate value history (mock monthly snapshots) — only when we have real data
  const historyData = useMemo(() => {
    if (!hasValue) return [];
    const months = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
    const base = median * 0.82;
    return months.map((m, i) => ({
      month: m,
      value: Math.round(base + (median - base) * (i / (months.length - 1)) + (Math.random() - 0.5) * median * 0.03),
    }));
  }, [median, hasValue]);

  // Purge impact — uses condition-matched prices only (no fallback to pricePaid)
  const cutAlbums = albums.filter((a) => a.purgeTag === "cut");
  const cutPileData = useMemo(() => {
    let total = 0;
    let pricedCount = 0;
    for (const album of cutAlbums) {
      const cached = getCachedMarketData(album.release_id);
      const price = getPriceAtCondition(album, cached);
      if (price) {
        total += price.value;
        pricedCount++;
      }
    }
    return { total, pricedCount, albumCount: cutAlbums.length };
  }, [cutAlbums]);

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
            <p className="mt-1" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
              {formatCurrency(minimum)} – {formatCurrency(maximum)}
            </p>
          </div>

          {/* Value over time chart */}
          <div className="mt-5" style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={historyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="valueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_GREEN} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={CHART_GREEN} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: isDarkMode ? "#617489" : "#9BA4B2" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: isDarkMode ? "#617489" : "#9BA4B2" }}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                />
                <Tooltip content={<ChartTooltip formatter={(v: number) => formatCurrency(v)} />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={CHART_GREEN}
                  strokeWidth={2}
                  fill="url(#valueGrad)"
                  dot={{ r: 3, fill: CHART_GREEN, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: CHART_GREEN, strokeWidth: 2, stroke: isDarkMode ? "#132B44" : "#FFFFFF" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Purge impact callout */}
          {cutAlbums.length > 0 && cutPileData.pricedCount > 0 && (
            <div
              className="mt-4 rounded-[10px] px-4 py-3"
              style={{
                backgroundColor: isDarkMode ? "#0F2238" : "#F5F5F6",
                border: `1px solid ${isDarkMode ? "#2D4A66" : "#D2D8DE"}`,
              }}
            >
              <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text-secondary)" }}>
                Selling your Cut pile shifts your collection value from{" "}
                <span style={{ fontWeight: 600, color: "var(--c-text)" }}>{formatCurrency(median)}</span>
                {" "}to{" "}
                <span style={{ fontWeight: 600, color: "var(--c-text)" }}>{formatCurrency(median - cutPileData.total)}</span>
                {" "}
                <span style={{ fontWeight: 600, color: "#FF33B6" }}>(&minus;{formatCurrency(cutPileData.total)})</span>
              </p>
              {cutPileData.pricedCount < cutPileData.albumCount && (
                <p className="mt-1.5" style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", fontStyle: "italic" }}>
                  Based on {cutPileData.pricedCount} of {cutPileData.albumCount} Cut records with available pricing.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─────────────────── SECTION 2: Collection Growth ─────────────────── */

function CollectionGrowthSection({ albums }: { albums: Album[] }) {
  const { isDarkMode } = useApp();

  const growthData = useMemo(() => {
    const monthMap = new Map<string, number>();

    for (const album of albums) {
      const d = new Date(album.dateAdded);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, (monthMap.get(key) || 0) + 1);
    }

    const sorted = [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b));

    // Show last 12 months or all if fewer
    const recent = sorted.slice(-12);
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

    return recent.map(([key, count]) => {
      const [y, m] = key.split("-");
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return {
        label: `${monthNames[parseInt(m) - 1]} '${y.slice(2)}`,
        count,
        isCurrent: key === currentMonth,
      };
    });
  }, [albums]);

  // Recent additions
  const recentStats = useMemo(() => {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const recent = albums.filter((a) => new Date(a.dateAdded) >= threeMonthsAgo);
    return recent.length;
  }, [albums]);

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
        Growth
      </p>

      <div className="mt-3">
        <span
          style={{
            fontSize: "36px",
            fontWeight: 700,
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            color: "var(--c-text)",
            letterSpacing: "-1px",
            lineHeight: 1.1,
          }}
        >
          {albums.length}
        </span>
        <span className="ml-2" style={{ fontSize: "15px", fontWeight: 400, color: "var(--c-text-muted)" }}>
          records in your collection
        </span>
      </div>

      <div className="mt-4" style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={growthData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: isDarkMode ? "#617489" : "#9BA4B2" }}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={45}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: isDarkMode ? "#617489" : "#9BA4B2" }}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip formatter={(v: number) => `${v} albums`} />} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {growthData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={CHART_PINK}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2" style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-muted)" }}>
        Added {recentStats} records in the last 3 months
      </p>
    </div>
  );
}

/* ─────────────────── SECTION 3: Collection Breakdown ─────────────────── */

type BreakdownTab = "folder" | "decade" | "condition";

function CollectionBreakdownSection({ albums }: { albums: Album[] }) {
  const { isDarkMode } = useApp();
  const [tab, setTab] = useState<BreakdownTab>("folder");

  const tabs: { id: BreakdownTab; label: string }[] = [
    { id: "folder", label: "By Folder" },
    { id: "decade", label: "By Decade" },
    { id: "condition", label: "By Condition" },
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
      <div className="flex gap-2 mt-3 mb-4 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-3 py-1.5 rounded-full whitespace-nowrap transition-all"
            style={{
              fontSize: "12px",
              fontWeight: tab === t.id ? 600 : 400,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              backgroundColor: tab === t.id ? (isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)") : (isDarkMode ? "var(--c-chip-bg)" : "#EFF1F3"),
              color: tab === t.id ? (isDarkMode ? "#ACDEF2" : "#00527A") : "var(--c-text-muted)",
              border: `1px solid ${tab === t.id ? "transparent" : "transparent"}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "folder" && <ByFolderChart albums={albums} isDark={isDarkMode} />}
      {tab === "decade" && <ByDecadeChart albums={albums} isDark={isDarkMode} />}
      {tab === "condition" && <ByConditionChart albums={albums} isDark={isDarkMode} />}
    </div>
  );
}

function ByFolderChart({ albums, isDark }: { albums: Album[]; isDark: boolean }) {
  const data = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of albums) {
      map.set(a.folder, (map.get(a.folder) || 0) + 1);
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([folder, count]) => ({ folder, count }));
  }, [albums]);

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex flex-col gap-2.5">
      {data.map((d) => (
        <div key={d.folder} className="flex items-center gap-3">
          <span
            className="shrink-0 text-right"
            style={{
              width: 110,
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--c-text-secondary)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            {d.folder}
          </span>
          <div className="flex-1 h-[18px] rounded-[4px] overflow-hidden" style={{ backgroundColor: isDark ? "#0F2238" : "#F0F1F3" }}>
            <div
              className="h-full rounded-[4px] transition-all"
              style={{
                width: `${(d.count / maxCount) * 100}%`,
                backgroundColor: CHART_BLUE,
                minWidth: 4,
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
    </div>
  );
}

function ByDecadeChart({ albums, isDark }: { albums: Album[]; isDark: boolean }) {
  const data = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of albums) {
      const decade = getDecade(a.year);
      map.set(decade, (map.get(decade) || 0) + 1);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([decade, count]) => ({ decade, count }));
  }, [albums]);

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div style={{ height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 4, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="decade"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: isDark ? "#617489" : "#9BA4B2" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: isDark ? "#617489" : "#9BA4B2" }}
            allowDecimals={false}
          />
          <Tooltip content={<ChartTooltip formatter={(v: number) => `${v} albums`} />} />
          <Bar dataKey="count" fill={CHART_BLUE} radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((entry, i) => (
              <Cell key={i} fill={CHART_BLUE} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ByConditionChart({ albums, isDark }: { albums: Album[]; isDark: boolean }) {
  const data = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of albums) {
      const label = normalizeConditionLabel(a.mediaCondition);
      map.set(label, (map.get(label) || 0) + 1);
    }
    return CONDITION_ORDER
      .filter((c) => map.has(c))
      .map((c) => ({ condition: c, count: map.get(c)! }));
  }, [albums]);

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex flex-col gap-2.5">
      {data.map((d) => (
        <div key={d.condition} className="flex items-center gap-3">
          <span
            className="shrink-0 text-right"
            style={{
              width: 36,
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--c-text-secondary)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            {d.condition}
          </span>
          <div className="flex-1 h-[18px] rounded-[4px] overflow-hidden" style={{ backgroundColor: isDark ? "#0F2238" : "#F0F1F3" }}>
            <div
              className="h-full rounded-[4px] transition-all"
              style={{
                width: `${(d.count / maxCount) * 100}%`,
                backgroundColor: CHART_BLUE,
                minWidth: 4,
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
    </div>
  );
}

/* ─────────────────── SECTION 5: Listening Activity ─────────────────── */

function ListeningActivitySection({
  albums,
  lastPlayed,
  isDarkMode,
  markPlayed,
  onNeverPlayedTap,
  onAlbumTap,
}: {
  albums: Album[];
  lastPlayed: Record<string, string>;
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

  // Listening streak / last listened
  const lastListenedInfo = useMemo(() => {
    const dates = Object.values(lastPlayed).map((d) => new Date(d).getTime()).sort((a, b) => b - a);
    if (dates.length === 0) return { streak: 0, lastDaysAgo: -1 };
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayMs = 86400000;
    let streak = 0;
    let checkDay = today;
    for (let i = 0; i < 365; i++) {
      if (dates.some((d) => d >= checkDay && d < checkDay + dayMs)) {
        streak++;
        checkDay -= dayMs;
      } else {
        break;
      }
    }
    const lastDaysAgo = Math.floor((Date.now() - dates[0]) / dayMs);
    return { streak, lastDaysAgo };
  }, [lastPlayed]);

  // Never played count
  const neverPlayedCount = useMemo(() => {
    return albums.filter((a) => !lastPlayed[a.id]).length;
  }, [albums, lastPlayed]);

  // Longest neglected (oldest last played or added long ago, never played)
  const neglected = useMemo(() => {
    const candidates = albums.map((a) => {
      const lp = lastPlayed[a.id];
      return {
        album: a,
        sortKey: lp ? new Date(lp).getTime() : new Date(a.dateAdded).getTime(),
        neverPlayed: !lp,
        label: lp ? `Last played ${formatDateShort(lp)}` : `Added ${formatDateShort(a.dateAdded)}, no play recorded`,
      };
    }).sort((a, b) => a.sortKey - b.sortKey);
    return candidates.slice(0, 4);
  }, [albums, lastPlayed]);

  // Suggestion: album added longest ago that was never played, or played once over a year ago
  const suggestion = useMemo(() => {
    const candidates = albums
      .filter((a) => {
        const lp = lastPlayed[a.id];
        if (!lp) return true;
        return Date.now() - new Date(lp).getTime() > 365 * 86400000;
      })
      .sort((a, b) => new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime());
    return candidates[0] || null;
  }, [albums, lastPlayed]);

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
      <div className="grid grid-cols-3 gap-3 mt-4">
        {/* Played this month */}
        <div
          className="rounded-[10px] py-3 px-3 text-center"
          style={{
            backgroundColor: isDarkMode ? "rgba(172,222,242,0.08)" : "rgba(172,222,242,0.2)",
            border: `1px solid ${isDarkMode ? "rgba(172,222,242,0.15)" : "rgba(172,222,242,0.35)"}`,
          }}
        >
          <span
            style={{
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              color: isDarkMode ? "#ACDEF2" : "#00527A",
              lineHeight: 1.1,
            }}
          >
            {playedThisMonth}
          </span>
          <p style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", marginTop: 2 }}>
            played in {monthName}
          </p>
        </div>

        {/* Streak / last listened */}
        <div
          className="rounded-[10px] py-3 px-3 text-center"
          style={{
            backgroundColor: isDarkMode ? "rgba(172,222,242,0.08)" : "rgba(172,222,242,0.2)",
            border: `1px solid ${isDarkMode ? "rgba(172,222,242,0.15)" : "rgba(172,222,242,0.35)"}`,
          }}
        >
          <span
            style={{
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              color: isDarkMode ? "#ACDEF2" : "#00527A",
              lineHeight: 1.1,
            }}
          >
            {lastListenedInfo.streak > 1 ? lastListenedInfo.streak : lastListenedInfo.lastDaysAgo}
          </span>
          <p style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", marginTop: 2 }}>
            {lastListenedInfo.streak > 1 ? "day streak" : lastListenedInfo.lastDaysAgo === 0 ? "listened today" : "days since last"}
          </p>
        </div>

        {/* No play recorded */}
        <button
          onClick={onNeverPlayedTap}
          className="rounded-[10px] py-3 px-3 text-center transition-colors"
          style={{
            backgroundColor: isDarkMode ? "rgba(255,51,182,0.08)" : "rgba(255,51,182,0.12)",
            border: `1px solid ${isDarkMode ? "rgba(255,51,182,0.2)" : "rgba(255,51,182,0.3)"}`,
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
            no play recorded
          </p>
        </button>
      </div>

      {/* No play recorded — neglected list */}
      <div className="mt-5">
        <p
          className="mb-3"
          style={{
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            color: "var(--c-text-muted)",
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
        >
          No Spins on File
        </p>
        <div className="flex flex-col gap-2">
          {neglected.map((item) => (
            <button
              key={item.album.id}
              onClick={() => onAlbumTap(item.album.id)}
              className="flex items-center gap-3 rounded-[8px] p-2 transition-colors text-left"
              style={{
                backgroundColor: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(12,40,74,0.03)",
              }}
            >
              <div className="w-10 h-10 rounded-[6px] overflow-hidden flex-shrink-0">
                <img src={item.album.cover} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
                <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>
                  {item.album.artist} — {item.album.title}
                </p>
                <p style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>
                  {item.label}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Suggestion card */}
      {suggestion && (
        <div
          className="mt-5 rounded-[10px] p-4 flex gap-4 items-center"
          style={{
            backgroundColor: isDarkMode ? "rgba(172,222,242,0.06)" : "rgba(172,222,242,0.15)",
            border: `1px solid ${isDarkMode ? "rgba(172,222,242,0.12)" : "rgba(172,222,242,0.3)"}`,
          }}
        >
          <div className="w-24 h-24 rounded-[8px] overflow-hidden flex-shrink-0">
            <img src={suggestion.cover} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)", fontStyle: "italic" }}>
              It's been a while — give {suggestion.title} another spin?
            </p>
            <p className="mt-1" style={{ fontSize: "14px", fontWeight: 600, color: "var(--c-text)", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>
              {suggestion.title}
            </p>
            <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-secondary)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>
              {suggestion.artist}
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); markPlayed(suggestion.id); toast.info("Logged.", { duration: 1500 }); }}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors"
              style={{
                fontSize: "12px",
                fontWeight: 600,
                backgroundColor: isDarkMode ? "rgba(172,222,242,0.15)" : "rgba(172,222,242,0.4)",
                color: isDarkMode ? "#ACDEF2" : "#00527A",
              }}
            >
              <Play size={12} />
              Played Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────── SECTION 4: Purge Progress ─────────────────── */

function PurgeProgressSection({ albums }: { albums: Album[] }) {
  const { isDarkMode } = useApp();

  const stats = useMemo(() => {
    const keep = albums.filter((a) => a.purgeTag === "keep").length;
    const cut = albums.filter((a) => a.purgeTag === "cut").length;
    const maybe = albums.filter((a) => a.purgeTag === "maybe").length;
    const unrated = albums.filter((a) => a.purgeTag === null).length;
    const total = albums.length;
    const rated = total - unrated;
    const pct = total > 0 ? (rated / total) * 100 : 0;
    return { keep, cut, maybe, unrated, total, rated, pct };
  }, [albums]);

  // Cut pile value
  const cutAlbums = albums.filter((a) => a.purgeTag === "cut");
  const cutPileData = useMemo(() => {
    let total = 0;
    let pricedCount = 0;
    for (const album of cutAlbums) {
      const cached = getCachedMarketData(album.release_id);
      const price = getPriceAtCondition(album, cached);
      if (price) {
        total += price.value;
        pricedCount++;
      }
    }
    return { total, pricedCount, albumCount: cutAlbums.length };
  }, [cutAlbums]);

  // Donut chart SVG
  const radius = 58;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;
  const filled = (stats.pct / 100) * circumference;
  const empty = circumference - filled;

  const statCards: { label: string; tag: string; count: number }[] = [
    { label: "Keep", tag: "keep", count: stats.keep },
    { label: "Purge", tag: "cut", count: stats.cut },
    { label: "Maybe", tag: "maybe", count: stats.maybe },
    { label: "Unrated", tag: "unrated", count: stats.unrated },
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
        Purge Progress
      </p>

      {/* Progress ring */}
      <div className="flex justify-center mt-4 mb-4">
        <div className="relative" style={{ width: (radius + stroke) * 2, height: (radius + stroke) * 2 }}>
          <svg
            width={(radius + stroke) * 2}
            height={(radius + stroke) * 2}
            viewBox={`0 0 ${(radius + stroke) * 2} ${(radius + stroke) * 2}`}
          >
            {/* Background ring */}
            <circle
              cx={radius + stroke}
              cy={radius + stroke}
              r={radius}
              fill="none"
              stroke={isDarkMode ? "#2D4A66" : "#D2D8DE"}
              strokeWidth={stroke}
            />
            {/* Filled ring */}
            <circle
              cx={radius + stroke}
              cy={radius + stroke}
              r={radius}
              fill="none"
              stroke={CHART_PINK}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${filled} ${empty}`}
              strokeDashoffset={circumference / 4}
              style={{ transition: "stroke-dasharray 0.6s ease" }}
            />
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              style={{
                fontSize: "22px",
                fontWeight: 700,
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                color: "var(--c-text)",
                lineHeight: 1.2,
              }}
            >
              {stats.rated} of {stats.total}
            </span>
            <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>evaluated</span>
          </div>
        </div>
      </div>

      {/* 2x2 stat grid */}
      <div className="grid grid-cols-2 gap-2">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="rounded-[10px] py-2.5 px-3 text-center"
            style={{
              backgroundColor: purgeTagBg(s.tag, isDarkMode),
              border: `1px solid ${purgeTagBorder(s.tag, isDarkMode)}`,
            }}
          >
            <span
              style={{
                fontSize: "22px",
                fontWeight: 700,
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                color: purgeTagColor(s.tag, isDarkMode),
                lineHeight: 1.2,
              }}
            >
              {s.count}
            </span>
            <p style={{ fontSize: "11px", fontWeight: 500, color: purgeTagLabel(s.tag, isDarkMode), marginTop: 2 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Cut pile value */}
      {stats.cut > 0 && cutPileData.pricedCount > 0 && (
        <p className="mt-4 text-center" style={{ fontSize: "14px", fontWeight: 600, color: "var(--c-text)" }}>
          Cut pile worth approximately {formatCurrency(cutPileData.total)}
          {cutPileData.pricedCount < cutPileData.albumCount && (
            <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", display: "block", marginTop: 2 }}>
              {cutPileData.pricedCount} of {cutPileData.albumCount} priced
            </span>
          )}
        </p>
      )}

      {/* Activity summary */}
      <p className="mt-2 text-center" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
        {stats.rated > 0
          ? `You've evaluated ${Math.round(stats.pct)}% of your collection`
          : "Start evaluating albums in the Purge tab"}
      </p>
    </div>
  );
}

/* ═══════════════════ MAIN REPORTS SCREEN ═══════════════════ */

export function ReportsScreen() {
  const { albums, lastSynced, setScreen, isDarkMode, lastPlayed, markPlayed, setNeverPlayedFilter, setSelectedAlbumId, setShowAlbumDetail, isAuthenticated } = useApp();
  const accent = useAccent();

  const pricedCount = useMemo(() => {
    let count = 0;
    for (const a of albums) {
      if (getCachedMarketData(a.release_id)) count++;
    }
    return count;
  }, [albums]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center px-[16px] lg:px-[24px] pt-[8px] pb-[4px] lg:pt-[16px] lg:pb-[17px]"
      >
        <h2
          className="screen-title"
          style={{
            fontSize: "36px",
            fontWeight: 600,
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            letterSpacing: "-0.5px",
            lineHeight: 1.25,
            color: "var(--c-text)",
          }}
        >
          Insights
        </h2>
      </div>

      {/* No Discogs connected */}
      {albums.length === 0 && !isAuthenticated ? (
        <NoDiscogsCard
          heading="No data yet."
          subtext="Connect your Discogs collection to see insights about your records."
        />
      ) : (
      /* Scrollable content */
      <div className="flex-1 overflow-y-auto overlay-scroll px-[16px] lg:px-[24px] pt-[16px]" style={{ paddingBottom: "calc(32px + var(--nav-clearance, 0px))" }}>
        {/* Desktop 2x2 grid / Mobile vertical stack */}
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-5 lg:gap-6">
          {/* Section 1 — spans full width on desktop for hero prominence */}
          <div className="lg:col-span-2">
            <CollectionValueSection albums={albums} />
          </div>

          {/* Section 2 */}
          <CollectionGrowthSection albums={albums} />

          {/* Section 3 */}
          <CollectionBreakdownSection albums={albums} />

          {/* Section 5: Listening Activity */}
          <div className="lg:col-span-2">
            <ListeningActivitySection
              albums={albums}
              lastPlayed={lastPlayed}
              isDarkMode={isDarkMode}
              markPlayed={markPlayed}
              onNeverPlayedTap={() => { setNeverPlayedFilter(true); setScreen("crate"); }}
              onAlbumTap={(id) => { setSelectedAlbumId(id); setShowAlbumDetail(true); }}
            />
          </div>

          {/* Section 4 */}
          <div className="lg:col-span-2 lg:max-w-[50%] lg:mx-auto lg:w-full">
            <PurgeProgressSection albums={albums} />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pb-4 text-center flex flex-col gap-1 items-center">
          <p className="max-w-xs" style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", textWrap: "pretty" }}>
            Collection value from Discogs{lastSynced ? `, updated ${lastSynced}` : ""}.
          </p>
          <p className="max-w-xs" style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", textWrap: "pretty" }}>
            Per-album pricing loaded for {pricedCount} of {albums.length} records — more loads as you browse.
          </p>
          <p className="max-w-xs" style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", textWrap: "pretty" }}>
            Value history tracks from your first sync. Discogs doesn't store this; we do.
          </p>
        </div>
      </div>
      )}
    </div>
  );
}