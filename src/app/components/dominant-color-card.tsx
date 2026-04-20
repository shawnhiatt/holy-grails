import { useState, useEffect, useRef } from "react";
import type { ReactNode, CSSProperties } from "react";

/* ─── Color utilities ─── */

/** Relative luminance (WCAG 2.1) from an [r, g, b] tuple (0-255 each) */
function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** True when the background is perceptually light (text should be dark) */
function isLightColor(r: number, g: number, b: number): boolean {
  return relativeLuminance(r, g, b) > 0.35;
}

/** Darken an RGB color by a factor (0-1) */
function darken(r: number, g: number, b: number, amount: number): [number, number, number] {
  const f = 1 - amount;
  return [Math.round(r * f), Math.round(g * f), Math.round(b * f)];
}

/**
 * Extract dominant color by sampling a downscaled canvas.
 * Uses k=1 simplified quantization: sample pixels at regular intervals,
 * then pick the most common color bucket (rounded to 32-value steps).
 */
function extractDominantFromCanvas(img: HTMLImageElement): [number, number, number] | null {
  try {
    const canvas = document.createElement("canvas");
    const size = 50; // Downsample to 50x50
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    // Bucket colors into 8x8x8 grid (32-step buckets)
    const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
    const step = 32;
    for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 128) continue; // Skip transparent
      const key = `${Math.floor(r / step)}-${Math.floor(g / step)}-${Math.floor(b / step)}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
        bucket.count++;
      } else {
        buckets.set(key, { r, g, b, count: 1 });
      }
    }

    // Find the largest bucket
    let best: { r: number; g: number; b: number; count: number } | null = null;
    for (const bucket of buckets.values()) {
      if (!best || bucket.count > best.count) best = bucket;
    }
    if (!best) return null;

    return [
      Math.round(best.r / best.count),
      Math.round(best.g / best.count),
      Math.round(best.b / best.count),
    ];
  } catch {
    return null;
  }
}

/**
 * Convert a Discogs CDN URL to a same-origin proxy path so canvas reads work.
 * Falls through for non-Discogs URLs.
 */
function toProxyUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "i.discogs.com") {
      return `/img-proxy${u.pathname}${u.search}`;
    }
  } catch {
    // not a valid URL
  }
  return url;
}

/* ─── Cache ─── */

interface CachedColor {
  rgb: [number, number, number];
  isLight: boolean;
}

const colorCache = new Map<string, CachedColor>();

/* ─── Component ─── */

export interface DominantColorCardProps {
  /** Image URL to extract the dominant color from */
  imageUrl: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: React.MouseEventHandler;
  onTouchStart?: React.TouchEventHandler;
  onTouchMove?: React.TouchEventHandler;
  onTouchEnd?: React.TouchEventHandler;
  /** Fallback background color if extraction fails. Default: var(--c-surface) */
  fallbackColor?: string;
  /** Border radius. Default: 12px */
  borderRadius?: string;
}

/**
 * A card whose background is tinted with the dominant color extracted from an image.
 *
 * Uses a same-origin canvas approach (no CORS headers needed from the image CDN).
 * The image is loaded without crossOrigin, drawn to a tiny canvas, and sampled.
 *
 * Sets CSS custom properties on the container for children to consume:
 * - `--dc-bg`              — dominant color as rgb()
 * - `--dc-bg-dark`         — darkened variant (good for gradient bottoms)
 * - `--dc-text`            — white or dark text depending on luminance
 * - `--dc-text-secondary`  — secondary text with reduced opacity
 * - `--dc-text-muted`      — muted text with further reduced opacity
 * - `--dc-is-light`        — "1" if light background, "0" if dark
 */
export function DominantColorCard({
  imageUrl,
  children,
  className = "",
  style,
  onClick,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  fallbackColor = "var(--c-surface)",
  borderRadius = "12px",
}: DominantColorCardProps) {
  const [cached, setCached] = useState<CachedColor | null>(
    () => colorCache.get(imageUrl) ?? null,
  );
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    // Already cached
    if (colorCache.has(imageUrl)) {
      setCached(colorCache.get(imageUrl)!);
      return;
    }

    let stale = false;
    const img = new Image();
    imgRef.current = img;

    img.onload = () => {
      if (stale) return;
      const rgb = extractDominantFromCanvas(img);
      if (!rgb) return;
      const entry: CachedColor = {
        rgb,
        isLight: isLightColor(...rgb),
      };
      colorCache.set(imageUrl, entry);
      setCached(entry);
    };
    img.onerror = () => {}; // silent fallback
    img.src = toProxyUrl(imageUrl);

    return () => {
      stale = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [imageUrl]);

  const light = cached?.isLight ?? false;
  const [r, g, b] = cached?.rgb ?? [0, 0, 0];
  const [dr, dg, db] = cached ? darken(...cached.rgb, 0.35) : [0, 0, 0];

  const vars: Record<string, string> = cached
    ? {
        "--dc-bg": `rgb(${r}, ${g}, ${b})`,
        "--dc-bg-dark": `rgb(${dr}, ${dg}, ${db})`,
        "--dc-text": light ? "#0C284A" : "#FFFFFF",
        "--dc-text-secondary": light ? "rgba(12, 40, 74, 0.7)" : "rgba(255, 255, 255, 0.7)",
        "--dc-text-muted": light ? "rgba(12, 40, 74, 0.5)" : "rgba(255, 255, 255, 0.5)",
        "--dc-is-light": light ? "1" : "0",
      }
    : {};

  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{
        backgroundColor: cached ? `rgb(${r}, ${g}, ${b})` : fallbackColor,
        borderRadius,
        transition: "background-color 0.3s ease",
        ...vars,
        ...style,
      } as CSSProperties}
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </div>
  );
}
