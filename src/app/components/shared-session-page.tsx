import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Disc3 } from "./icons";
import { getContentTokens } from "./theme";
import logoDark from "../../imports/logo-holy-grails-dark.svg";
import logoLight from "../../imports/logo-holy-grails-light.svg";

/**
 * Public, logged-out read-only view of a shared session (Spec 3). Rendered
 * INSTEAD of the app for /s/{shareId} paths — see App.tsx. The unguessable
 * shareId in the path is the capability; getShared is unauthenticated and
 * returns only whitelisted display fields. No login, no nav, no Discogs links.
 */
export function SharedSessionPage() {
  // System theme only — there's no preference context for an anonymous viewer.
  const [isDark, setIsDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
  );
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const tokens = useMemo(() => getContentTokens(isDark), [isDark]);

  const shareId = useMemo(() => {
    const match = window.location.pathname.match(/^\/s\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }, []);

  const data = useQuery(api.stacks.getShared, shareId ? { share_id: shareId } : "skip");
  const loading = data === undefined && shareId !== "";

  const hasYear = (year: number | null | undefined): year is number =>
    year != null && year !== 0;

  return (
    <div
      style={{
        ...tokens,
        minHeight: "100dvh",
        background: "var(--c-bg)",
        color: "var(--c-text)",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <div
        className="mx-auto w-full max-w-[560px] px-5"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 28px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)",
        }}
      >
        {/* Wordmark */}
        <img
          src={isDark ? logoDark : logoLight}
          alt="Holy Grails"
          draggable={false}
          style={{ height: "24px", width: "auto" }}
        />

        {loading ? (
          <div className="flex flex-col items-center justify-center" style={{ paddingTop: "30vh" }}>
            <Disc3 className="disc-spinner" size={32} style={{ color: "var(--c-text-muted)" }} />
          </div>
        ) : data === null ? (
          <div className="flex flex-col items-center justify-center text-center" style={{ paddingTop: "28vh" }}>
            <p style={{ fontSize: "16px", fontWeight: 500, color: "var(--c-text-secondary)" }}>
              This session is no longer shared.
            </p>
          </div>
        ) : data ? (
          <>
            <h1
              className="line-clamp-3"
              style={{
                marginTop: "28px",
                fontSize: "30px",
                fontWeight: 700,
                lineHeight: 1.2,
                letterSpacing: "-0.5px",
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                color: "var(--c-text)",
              }}
            >
              {data.name}
            </h1>
            <p style={{ marginTop: "6px", fontSize: "13px", fontWeight: 500, color: "var(--c-text-muted)" }}>
              {data.albums.length} record{data.albums.length !== 1 ? "s" : ""}
            </p>

            <div className="flex flex-col" style={{ marginTop: "20px", gap: "10px" }}>
              {data.albums.map((album, i) => (
                <div key={i} className="flex items-center" style={{ gap: "12px" }}>
                  <span
                    className="flex-shrink-0 text-center"
                    style={{ width: "20px", fontSize: "13px", fontWeight: 400, color: "var(--c-text-faint)" }}
                  >
                    {i + 1}
                  </span>
                  {album.thumb || album.cover ? (
                    <img
                      loading="lazy"
                      decoding="async"
                      src={album.thumb || album.cover}
                      alt={album.title}
                      className="flex-shrink-0 object-cover"
                      style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "8px",
                        border: "1px solid var(--c-border)",
                      }}
                    />
                  ) : (
                    <div
                      className="flex-shrink-0"
                      style={{ width: "56px", height: "56px", borderRadius: "8px", background: "var(--c-surface-alt)" }}
                    />
                  )}
                  <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                    <p
                      style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "var(--c-text)",
                        display: "block",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        WebkitTextOverflow: "ellipsis",
                        maxWidth: "100%",
                      } as React.CSSProperties}
                    >
                      {album.title}
                    </p>
                    <p
                      style={{
                        fontSize: "13px",
                        fontWeight: 400,
                        color: "var(--c-text-muted)",
                        display: "block",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        WebkitTextOverflow: "ellipsis",
                        maxWidth: "100%",
                      } as React.CSSProperties}
                    >
                      {album.artist}
                      {hasYear(album.year) ? ` · ${album.year}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <p style={{ marginTop: "32px", fontSize: "12px", fontWeight: 400, color: "var(--c-text-faint)" }}>
              Shared from Holy Grails.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
