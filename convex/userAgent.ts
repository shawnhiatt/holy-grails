/* The User-Agent every Holy Grails request to Discogs sends (audit D-07).
   Discogs' API docs require a string that identifies the app, with a URL, and
   warn that generic agents get "more severe ratelimiting". Kept in its own
   plain module (no Convex runtime deps, marketValue.ts pattern) so
   convex/discogs.ts and convex/oauth.ts share ONE definition and tests can
   import it. */

/** Major.minor of the app. Bump with package.json's version. */
export const APP_VERSION = "0.8";

/** The dev deployment's name (it's in the deployment URL, not a secret). */
const DEV_DEPLOYMENT = "adventurous-crow-499";

/**
 * `HolyGrails/0.8 +https://www.holygrails.app`, with `-dev` after the version
 * on the dev deployment so Discogs (and our own logs) can tell the two apart.
 * Convex gives every function `CONVEX_CLOUD_URL` (the deployment's own
 * address); anything that isn't positively the dev deployment reads as prod,
 * so prod never sends a `-dev` agent by accident.
 */
export function userAgentFor(cloudUrl: string | undefined): string {
  const isDev = !!cloudUrl && cloudUrl.includes(DEV_DEPLOYMENT);
  return `HolyGrails/${APP_VERSION}${isDev ? "-dev" : ""} +https://www.holygrails.app`;
}

export const USER_AGENT = userAgentFor(process.env.CONVEX_CLOUD_URL);
