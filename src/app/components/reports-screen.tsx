import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { useApp, type Screen } from "./app-context";
import type { Album } from "./discogs-api";
import { conditionGradeColor } from "../../lib/condition-colors";
import { getCachedCollectionValue } from "./discogs-api";
import { purgeTagColor, purgeTagBg, purgeTagBorder, purgeTagLabel } from "./purge-colors";
import { formatDateShort } from "./last-played-utils";
import { toast } from "sonner";
import { NoDiscogsCard } from "./no-discogs-card";
import { useHaptic } from "@/hooks/useHaptic";

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

function CollectionValueSection({ albums }: { albums: Album[] }) {
  const { isDarkMode } = useApp();

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
            <p className="mt-1" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
              {formatCurrency(minimum)} – {formatCurrency(maximum)}
            </p>
          </div>

        </>
      )}
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

      {/* Condition distribution */}
      <div className="flex flex-col gap-2.5">
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
              <div
                className="h-full rounded-[4px]"
                style={{
                  width: `${(d.count / maxCount) * 100}%`,
                  backgroundColor: conditionBarColor(d.condition),
                  minWidth: 4,
                }}
              />
            </div>
            <span className="shrink-0" style={{ width: 28, fontSize: "12px", fontWeight: 600, color: "var(--c-text)", textAlign: "right" }}>
              {d.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────── SECTION 3: Collection Breakdown ─────────────────── */

type BreakdownTab = "folder" | "decade" | "format";

function CollectionBreakdownSection({ albums }: { albums: Album[] }) {
  const { isDarkMode } = useApp();
  const [tab, setTab] = useState<BreakdownTab>("folder");

  const tabs: { id: BreakdownTab; label: string }[] = [
    { id: "folder", label: "By Folder" },
    { id: "decade", label: "By Decade" },
    { id: "format", label: "By Format" },
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
      {tab === "format" && <ByFormatChart albums={albums} isDark={isDarkMode} />}
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

  return (
    <div className="flex flex-col">
      {data.map((d, i) => (
        <div
          key={d.folder}
          className="flex items-center justify-between py-2.5"
          style={i < data.length - 1 ? { borderBottom: "1px solid var(--c-border)" } : undefined}
        >
          <span
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--c-text)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            {d.folder}
          </span>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: "var(--c-text)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
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
      if (!a.year || a.year < 1900) continue;
      const decade = getDecade(a.year);
      map.set(decade, (map.get(decade) || 0) + 1);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([decade, count]) => ({ decade, count }));
  }, [albums]);

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  const goldenEra = useMemo(() => {
    if (data.length < 3) return null;
    let peak = data[0];
    for (const d of data) {
      if (d.count > peak.count) peak = d;
    }
    return peak.decade;
  }, [data]);

  return (
    <div>
      <div style={{ height: 180 }}>
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
            <Bar dataKey="count" fill={CHART_BLUE} radius={[4, 4, 0, 0]} maxBarSize={36}>
              {data.map((entry, i) => (
                <Cell key={i} fill={goldenEra && entry.decade === goldenEra ? "#EBFD00" : CHART_BLUE} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {goldenEra && (
        <div
          className="mt-3 rounded-[10px] px-4 py-3 flex items-center gap-3"
          style={{
            backgroundColor: "rgba(235, 253, 0, 0.08)",
            border: "1px solid rgba(235, 253, 0, 0.2)",
          }}
        >
          <span
            style={{
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              color: "#EBFD00",
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
      .slice(0, 10)
      .map(([artist, count]) => ({ artist, count }));
  }, [albums]);

  if (data.length < 3) return null;

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
        {data.map((d, i) => {
          const rankColor = i === 0 ? "#EBFD00" : i < 3 ? "var(--c-text-muted)" : "var(--c-text-faint)";
          return (
            <div
              key={d.artist}
              className="flex items-center py-2.5"
              style={i < data.length - 1 ? { borderBottom: "1px solid var(--c-border)" } : undefined}
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
      <div className="flex flex-col gap-2.5 mt-4">
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
              <div
                className="absolute"
                style={{
                  left: 0,
                  width: `calc(${(d.count / maxCount) * 100}% - 3px)`,
                  height: 3,
                  backgroundColor: "var(--c-border-strong)",
                  borderRadius: 2,
                  minWidth: 4,
                }}
              />
              <div
                className="absolute"
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
      </div>
      <p className="mt-3" style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-faint)" }}>
        Labels with 2+ records
      </p>
    </div>
  );
}

function ByFormatChart({ albums, isDark }: { albums: Album[]; isDark: boolean }) {
  const strip = new Set(["Vinyl", "Album", "All Media", "Record Store Day", "Reissue", "Compilation", "Stereo", "Mono", "Promo", "Limited Edition", "Deluxe Edition", "Remaster", "Special Edition", "Club Edition", "Transcription", "Unofficial Release", "White Label"]);

  const data = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of albums) {
      if (!a.format) continue;
      const tokens = a.format.split(/[,;]/).map((t) => t.trim()).filter((t) => t && !strip.has(t));
      const key = tokens.length > 0 ? tokens[0] : "Vinyl";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([format, count]) => ({ format, count }));
  }, [albums]);

  return (
    <div className={data.length <= 3 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
      {data.map((d) => (
        <div
          key={d.format}
          className="rounded-[10px] py-3 px-3 text-center"
          style={{ backgroundColor: "var(--c-surface-alt)", border: "1px solid var(--c-border)" }}
        >
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
          <div
            style={{
              fontSize: "11px",
              fontWeight: 500,
              color: "var(--c-text-muted)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              marginTop: 2,
            }}
          >
            {d.format}
          </div>
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
    if (dates.length === 0) return { streak: 0, lastDaysAgo: null as number | null };
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
    const lastDaysAgo = Math.floor((today - Math.floor(dates[0] / dayMs) * dayMs) / dayMs);
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
        label: lp ? `Last played ${formatDateShort(lp)}` : `Added ${formatDateShort(a.dateAdded)}, no plays recorded`,
      };
    }).sort((a, b) => a.sortKey - b.sortKey);
    return candidates.slice(0, 4);
  }, [albums, lastPlayed]);

  // Recently played
  const recentlyPlayed = useMemo(() => {
    return albums
      .filter((a) => !!lastPlayed[a.id])
      .sort((a, b) => new Date(lastPlayed[b.id]).getTime() - new Date(lastPlayed[a.id]).getTime())
      .slice(0, 5);
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
            {lastListenedInfo.streak > 1 ? lastListenedInfo.streak : lastListenedInfo.lastDaysAgo === null ? "—" : lastListenedInfo.lastDaysAgo}
          </span>
          <p style={{ fontSize: "11px", fontWeight: 400, color: "var(--c-text-muted)", marginTop: 2 }}>
            {lastListenedInfo.streak > 1 ? "day streak" : lastListenedInfo.lastDaysAgo === null ? "no plays yet" : "days since last played"}
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
            no plays recorded
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
                <img src={item.album.thumb || item.album.cover} alt="" className="w-full h-full object-cover" />
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

      {/* Recently Played */}
      {recentlyPlayed.length > 0 && (
        <div className="mt-4">
          <p
            className="mb-2"
            style={{
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              color: "var(--c-text-faint)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            Recently Played
          </p>
          <div className="flex flex-col gap-2">
            {recentlyPlayed.map((a) => (
              <button
                key={a.id}
                onClick={() => onAlbumTap(a.id)}
                className="flex items-center gap-3 rounded-[8px] p-2 transition-colors text-left"
                style={{
                  backgroundColor: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(12,40,74,0.03)",
                }}
              >
                <div className="w-11 h-11 rounded-[6px] overflow-hidden flex-shrink-0">
                  <img src={a.thumb || a.cover} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
                  <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>
                    {a.artist} — {a.title}
                  </p>
                  <p style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
                    Played {formatDateShort(lastPlayed[a.id])}
                  </p>
                </div>
              </button>
            ))}
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
              stroke={"var(--c-border-strong)"}
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
  const { albums, wants, lastSynced, setScreen, isDarkMode, lastPlayed, markPlayed, setNeverPlayedFilter, setSelectedAlbumId, setShowAlbumDetail, isAuthenticated } = useApp();
  const triggerHaptic = useHaptic('medium');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center px-[16px] lg:px-[24px] pt-[2px] pb-[8px] lg:pt-[8px] lg:pb-[20px]"
      >
        <div className="flex flex-col">
          <h2
            className="screen-title"
            style={{
              fontSize: "28px",
              fontWeight: 600,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              letterSpacing: "-0.5px",
              lineHeight: 1.25,
              color: "var(--c-text)",
            }}
          >
            Insights
          </h2>
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
      ) : (
      /* Scrollable content */
      <div className="flex-1 overflow-y-auto overlay-scroll px-[16px] lg:px-[24px] pt-[16px]" style={{ paddingBottom: "calc(32px + var(--nav-clearance, 0px))" }}>
        {/* Desktop 2x2 grid / Mobile vertical stack */}
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-5 lg:gap-6">
          {/* Collection Value — full width */}
          <div className="lg:col-span-2">
            <CollectionValueSection albums={albums} />
          </div>

          {/* Condition — full width on mobile, half on desktop */}
          <div className="lg:col-span-2">
            <ConditionSection albums={albums} />
          </div>

          {/* Breakdown — full width */}
          <div className="lg:col-span-2">
            <CollectionBreakdownSection albums={albums} />
          </div>

          {/* Artists */}
          <div className="lg:col-span-2">
            <ArtistsSection albums={albums} />
          </div>

          {/* Labels */}
          <div className="lg:col-span-2">
            <LabelsSection albums={albums} />
          </div>

          {/* Section 5: Listening Activity */}
          <div className="lg:col-span-2">
            <ListeningActivitySection
              albums={albums}
              lastPlayed={lastPlayed}
              isDarkMode={isDarkMode}
              markPlayed={markPlayed}
              onNeverPlayedTap={() => { setNeverPlayedFilter(true); setScreen("crate"); }}
              onAlbumTap={(id) => { triggerHaptic(); setSelectedAlbumId(id); setShowAlbumDetail(true); }}
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
        </div>
      </div>
      )}
    </div>
  );
}