import { Heart, Plus } from "./icons";

interface WantlistAddIconProps {
  /** true when the album is already in the viewer's wantlist */
  filled: boolean;
  size?: number;
  /** heart color — the caller passes brand yellow when filled, faint when not */
  color?: string;
  /** background the + badge sits on, so it masks the heart edge cleanly */
  badgeBg?: string;
}

// Heart = wantlist across the app. In a social/activity context a plain heart
// reads as "favorite this post," so the not-yet-added state carries a small +
// badge to signal "add to my wantlist." Once added it's the standard solid heart.
// Phosphor ships no heart-plus glyph, so this composes Heart + Plus.
export function WantlistAddIcon({
  filled,
  size = 18,
  color = "var(--c-text-faint)",
  badgeBg = "var(--c-surface)",
}: WantlistAddIconProps) {
  if (filled) {
    return <Heart size={size} weight="fill" color={color} />;
  }
  const badge = Math.round(size * 0.62);
  return (
    <span style={{ position: "relative", display: "inline-flex", lineHeight: 0 }}>
      <Heart size={size} weight="light" color={color} />
      <span
        style={{
          position: "absolute",
          right: -3,
          bottom: -3,
          width: badge,
          height: badge,
          borderRadius: "50%",
          backgroundColor: badgeBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Plus size={Math.round(size * 0.52)} weight="bold" color={color} />
      </span>
    </span>
  );
}
