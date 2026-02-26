import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ExternalLink, Info, Coins } from "lucide-react";
import {
  fetchMarketData,
  getCachedMarketData,
  normalizeCondition,
  CONDITION_GRADES,
  CONDITION_SHORT,
  type MarketData,
} from "./discogs-api";
import type { Album } from "./discogs-api";
import { useApp } from "./app-context";
import { AccordionSection } from "./accordion-section";

/* ─── Condition grade → color spectrum ─── */
function conditionGradeColor(grade: string, isDarkMode: boolean): string | undefined {
  // Extract abbreviation from parentheses BEFORE stripping (handles "NM or M-" etc.)
  const rawParen = grade.match(/\(([^)]+)\)/);
  let key: string;
  if (rawParen) {
    // Take first token from parenthetical: "NM or M-" → "NM", "VG+" → "VG+"
    key = rawParen[1].trim().split(/\s/)[0].toUpperCase();
  } else {
    key = grade.trim().toUpperCase().replace(/[\s-]/g, "");
  }
  const spectrum: Record<string, { dark: string; light: string }> = {
    "M":    { dark: "#3E9842", light: "#2D7A31" },
    "MINT": { dark: "#3E9842", light: "#2D7A31" },
    "NM":   { dark: "#3E9842", light: "#2D7A31" },
    "NEARMINT": { dark: "#3E9842", light: "#2D7A31" },
    "VG+":  { dark: "#5FBFA0", light: "#1A7A5A" },
    "VG":   { dark: "#ACDEF2", light: "#00527A" },
    "VERYGOOD+": { dark: "#5FBFA0", light: "#1A7A5A" },
    "VERYGOOD":  { dark: "#ACDEF2", light: "#00527A" },
    "G+":   { dark: "#C9A0E0", light: "#7A3A9A" },
    "GOOD+": { dark: "#C9A0E0", light: "#7A3A9A" },
    "G":    { dark: "#E88CC4", light: "#9A207C" },
    "GOOD": { dark: "#E88CC4", light: "#9A207C" },
    "F":    { dark: "#FF98DA", light: "#9A207C" },
    "FAIR": { dark: "#FF98DA", light: "#9A207C" },
    "P":    { dark: "#FF98DA", light: "#9A207C" },
    "POOR": { dark: "#FF98DA", light: "#9A207C" },
  };
  const entry = spectrum[key];
  if (!entry) return undefined;
  return isDarkMode ? entry.dark : entry.light;
}

/**
 * Get the price at the user's condition grade from market data.
 * Returns null if no match found.
 */
export function getPriceAtCondition(
  album: Album,
  marketData: MarketData | null
): { value: number; currency: string; conditionShort: string } | null {
  if (!marketData || marketData.prices.length === 0) return null;
  const normalized = normalizeCondition(album.mediaCondition);
  if (!normalized) return null;
  const match = marketData.prices.find((p) => p.condition === normalized);
  if (!match) return null;
  return {
    value: match.value,
    currency: match.currency,
    conditionShort: CONDITION_SHORT[normalized] || normalized,
  };
}

function formatPrice(value: number, currency: string): string {
  if (currency === "USD") return `$${value.toFixed(2)}`;
  if (currency === "EUR") return `\u20AC${value.toFixed(2)}`;
  if (currency === "GBP") return `\u00A3${value.toFixed(2)}`;
  return `${value.toFixed(2)} ${currency}`;
}

function formatPriceShort(value: number, currency: string): string {
  const rounded = Math.round(value);
  if (currency === "USD") return `$${rounded}`;
  if (currency === "EUR") return `\u20AC${rounded}`;
  if (currency === "GBP") return `\u00A3${rounded}`;
  return `${rounded} ${currency}`;
}

export function MarketValueSection({ album, token }: { album: Album; token: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [marketData, setMarketData] = useState<MarketData | null>(
    () => getCachedMarketData(album.release_id)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(
    () => getCachedMarketData(album.release_id) !== null
  );

  // Reset state when album changes
  useEffect(() => {
    const cached = getCachedMarketData(album.release_id);
    setMarketData(cached);
    setHasAttempted(cached !== null);
    setIsExpanded(false);
    setIsLoading(false);
  }, [album.release_id]);

  const loadData = useCallback(async () => {
    if (isLoading || hasAttempted) return;
    setIsLoading(true);
    try {
      const data = await fetchMarketData(album.release_id, token);
      setMarketData(data);
    } catch (e) {
      console.warn("[MarketValue] Failed to fetch:", e);
    } finally {
      setIsLoading(false);
      setHasAttempted(true);
    }
  }, [album.release_id, token, isLoading, hasAttempted]);

  const handleToggle = useCallback(() => {
    const willExpand = !isExpanded;
    setIsExpanded(willExpand);
    if (willExpand && !hasAttempted) {
      loadData();
    }
  }, [isExpanded, hasAttempted, loadData]);

  // Compute the preview price for collapsed state
  const previewPrice = getPriceAtCondition(album, marketData);

  const normalizedCondition = normalizeCondition(album.mediaCondition);
  const hasPrices = marketData && marketData.prices.length > 0;

  return (
    <AccordionSection
      label="What It's Worth"
      icon={<Coins size={16} style={{ color: "var(--c-text-secondary)" }} />}
      isExpanded={isExpanded}
      onToggle={handleToggle}
      trailingContent={
        previewPrice && !isExpanded ? (
          <span
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--c-text)",
              marginRight: "4px",
            }}
          >
            ~{formatPriceShort(previewPrice.value, previewPrice.currency)} at{" "}
            {previewPrice.conditionShort}
          </span>
        ) : undefined
      }
    >
      {isLoading ? (
        <LoadingSkeleton />
      ) : !hasPrices ? (
        <UnavailableState album={album} />
      ) : (
        <>
          <YourCopyValue
            album={album}
            marketData={marketData!}
            normalizedCondition={normalizedCondition}
          />
          <ConditionPriceTable
            prices={marketData!.prices}
            normalizedCondition={normalizedCondition}
          />
          <OutlierNote />
          {marketData!.stats.numForSale > 0 ? (
            <div className="mt-3">
              <a
                href={`https://www.discogs.com/sell/release/${album.release_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 transition-opacity hover:opacity-80"
                style={{
                  fontSize: "13px",
                  fontWeight: 400,
                  color: "var(--c-text-secondary)",
                }}
              >
                <span>
                  {marketData!.stats.numForSale} {marketData!.stats.numForSale === 1 ? "copy" : "copies"} listed from{" "}
                  {marketData!.stats.lowestPrice !== null
                    ? formatPrice(
                        marketData!.stats.lowestPrice,
                        marketData!.stats.currency
                      )
                    : "\u2014"}
                </span>
                <ExternalLink size={12} style={{ flexShrink: 0 }} />
              </a>
            </div>
          ) : (
            <div className="mt-3">
              <p
                style={{
                  fontSize: "13px",
                  fontWeight: 400,
                  color: "var(--c-text-muted)",
                }}
              >
                No copies currently listed
              </p>
            </div>
          )}
          <ResearchLinks album={album} />
        </>
      )}
    </AccordionSection>
  );
}

/**
 * Hero display for the user's copy value — shows median price at their condition
 * and marketplace low price side by side.
 */
function YourCopyValue({
  album,
  marketData,
  normalizedCondition,
}: {
  album: Album;
  marketData: MarketData;
  normalizedCondition: string | null;
}) {
  const { isDarkMode } = useApp();
  const conditionPrice = getPriceAtCondition(album, marketData);
  const lowestPrice = marketData.stats.lowestPrice;
  const currency = marketData.stats.currency || marketData.prices[0]?.currency || "USD";
  const conditionShort = normalizedCondition ? CONDITION_SHORT[normalizedCondition] : null;

  if (!conditionPrice) return null;

  return (
    <div className="mb-3">
      {/* Primary: median at your condition */}
      <div
        className="rounded-[8px] p-3"
        style={{
          backgroundColor: isDarkMode ? "rgba(172, 222, 242, 0.08)" : "rgba(172, 222, 242, 0.1)",
        }}
      >
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-2">
            <span
              style={{
                fontSize: "24px",
                fontWeight: 700,
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                color: isDarkMode ? "#ACDEF2" : "#00527A",
                letterSpacing: "-0.5px",
              }}
            >
              {formatPrice(conditionPrice.value, conditionPrice.currency)}
            </span>
          </div>
          <span
            className="px-2 py-0.5 rounded-full"
            style={{
              fontSize: "11px",
              fontWeight: 600,
              backgroundColor: isDarkMode ? "rgba(172,222,242,0.2)" : "#ACDEF2",
              color: isDarkMode ? "#ACDEF2" : "#0C284A",
            }}
          >
            YOUR COPY &middot; {conditionShort}
          </span>
        </div>
        <p
          className="mt-1"
          style={{
            fontSize: "11px",
            fontWeight: 400,
            color: "var(--c-text-muted)",
          }}
        >
          Median sold price at {conditionShort} condition
        </p>
      </div>

      {/* Secondary: marketplace low */}
      {lowestPrice != null && lowestPrice > 0 && (
        <div className="flex items-center gap-2 mt-2 px-1">
          <span
            style={{
              fontSize: "12px",
              fontWeight: 400,
              color: "var(--c-text-muted)",
            }}
          >
            Lowest listing:
          </span>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--c-text-secondary)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            {formatPrice(lowestPrice, currency)}
          </span>
        </div>
      )}
    </div>
  );
}

function ConditionPriceTable({
  prices,
  normalizedCondition,
}: {
  prices: { condition: string; value: number; currency: string }[];
  normalizedCondition: string | null;
}) {
  const { isDarkMode } = useApp();
  const [showAllGrades, setShowAllGrades] = useState(false);
  const priceMap = new Map(prices.map((p) => [p.condition, p]));

  // Theme-aware colors
  const mutedColor = isDarkMode ? "var(--c-text-muted)" : "#6B6560";
  const highlightColor = isDarkMode ? "#ACDEF2" : "var(--c-text)";

  // Determine which grades to show: user's condition +/- 1, or all if expanded
  const userGradeIndex = normalizedCondition
    ? CONDITION_GRADES.indexOf(normalizedCondition)
    : -1;

  // "Nearby" grades: 1 above and 1 below the user's condition (that have price data)
  const nearbyGrades = CONDITION_GRADES.filter((grade, i) => {
    if (grade === normalizedCondition) return true;
    if (userGradeIndex >= 0) {
      const distance = Math.abs(i - userGradeIndex);
      if (distance <= 1) return true;
    }
    return false;
  });

  const gradesToShow = showAllGrades ? CONDITION_GRADES : nearbyGrades;
  const hasHiddenGrades = nearbyGrades.length < CONDITION_GRADES.filter((g) => priceMap.has(g)).length;

  return (
    <div>
      {/* Section label */}
      <p
        className="mb-1.5"
        style={{
          fontSize: "11px",
          fontWeight: 500,
          color: "var(--c-text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {showAllGrades ? "All condition grades" : "Nearby grades"}
      </p>

      <div className="flex flex-col">
        {gradesToShow.map((grade, i) => {
          const price = priceMap.get(grade);
          const isMatch = normalizedCondition === grade;
          const short = CONDITION_SHORT[grade];

          return (
            <div key={grade}>
              {i > 0 && (
                <div
                  style={{
                    height: "1px",
                    backgroundColor: isMatch
                      ? "var(--c-border-strong)"
                      : "var(--c-border)",
                    opacity: 0.5,
                  }}
                />
              )}
              <div
                className="flex items-center justify-between py-2 px-1 rounded-[6px]"
                style={{
                  backgroundColor: isMatch
                    ? `color-mix(in srgb, ${conditionGradeColor(grade, isDarkMode) || highlightColor} ${isDarkMode ? "12%" : "14%"}, transparent)`
                    : "transparent",
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: isMatch ? 600 : 500,
                      color: isMatch
                        ? (conditionGradeColor(grade, isDarkMode) || highlightColor)
                        : (conditionGradeColor(grade, isDarkMode) || mutedColor),
                      minWidth: "32px",
                    }}
                  >
                    {short}
                  </span>
                  {isMatch && (
                    <span
                      className="px-1.5 py-0.5 rounded-full"
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        backgroundColor: `color-mix(in srgb, ${conditionGradeColor(grade, isDarkMode) || highlightColor} ${isDarkMode ? "22%" : "30%"}, transparent)`,
                        color: conditionGradeColor(grade, isDarkMode) || (isDarkMode ? "#ACDEF2" : "#0C284A"),
                      }}
                    >
                      YOUR COPY
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: isMatch ? 600 : 400,
                    color: isMatch
                      ? (conditionGradeColor(grade, isDarkMode) || highlightColor)
                      : mutedColor,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >
                  {price ? formatPrice(price.value, price.currency) : "\u2014"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toggle to show/hide all grades */}
      {hasHiddenGrades && (
        <button
          onClick={() => setShowAllGrades(!showAllGrades)}
          className="flex items-center gap-1 mt-1.5 transition-opacity hover:opacity-80"
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--c-text-muted)",
          }}
        >
          <ChevronDown
            size={13}
            className={`transition-transform ${showAllGrades ? "rotate-180" : ""}`}
          />
          {showAllGrades ? "Show fewer" : "Show all grades"}
        </button>
      )}
    </div>
  );
}

/**
 * Small note explaining that M/NM prices can be outliers.
 */
function OutlierNote() {
  return (
    <div className="flex items-start gap-1.5 mt-3 px-1">
      <Info size={12} style={{ color: "var(--c-text-muted)", flexShrink: 0, marginTop: 2 }} />
      <p
        style={{
          fontSize: "11px",
          fontWeight: 400,
          color: "var(--c-text-muted)",
          lineHeight: 1.5,
        }}
      >
        Prices are median sold values from Discogs. Mint and Near Mint prices
        often reflect rare or premium sales and may not represent typical
        market value.
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      <p
        className="mb-1"
        style={{
          fontSize: "13px",
          fontWeight: 400,
          color: "var(--c-text-muted)",
        }}
      >
        Fetching market data...
      </p>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="flex items-center justify-between">
          <div
            className="rounded-[4px] animate-pulse"
            style={{
              width: `${30 + (i % 3) * 10}px`,
              height: "14px",
              backgroundColor: "var(--c-border)",
            }}
          />
          <div
            className="rounded-[4px] animate-pulse"
            style={{
              width: `${40 + (i % 2) * 15}px`,
              height: "14px",
              backgroundColor: "var(--c-border)",
            }}
          />
        </div>
      ))}
    </div>
  );
}

function UnavailableState({ album }: { album: Album }) {
  return (
    <div className="flex flex-col gap-3">
      <p
        style={{
          fontSize: "13px",
          fontWeight: 400,
          color: "var(--c-text-muted)",
          lineHeight: 1.5,
        }}
      >
        No pricing data on Discogs for this pressing.
      </p>
      <ResearchLinks album={album} />
    </div>
  );
}

function ResearchLinks({ album }: { album: Album }) {
  const popsikeQuery = encodeURIComponent(
    `${album.artist} ${album.title}`
  );

  return (
    <div className="flex flex-col gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--c-border)" }}>
      <a
        href={`https://www.discogs.com/sell/history/${album.release_id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 transition-opacity hover:opacity-80"
        style={{
          fontSize: "13px",
          fontWeight: 400,
          color: "var(--c-text-muted)",
        }}
      >
        Sold history on Discogs
        <ExternalLink size={11} style={{ flexShrink: 0 }} />
      </a>
      <a
        href={`https://www.popsike.com/php/quicksearch.php?searchtext=${popsikeQuery}&x=0&y=0`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 transition-opacity hover:opacity-80"
        style={{
          fontSize: "13px",
          fontWeight: 400,
          color: "var(--c-text-muted)",
        }}
      >
        Auction history on Popsike
        <ExternalLink size={11} style={{ flexShrink: 0 }} />
      </a>
    </div>
  );
}