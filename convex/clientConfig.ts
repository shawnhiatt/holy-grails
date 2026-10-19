import { query } from "./_generated/server";
import { parseMinNativeBuild } from "./minNativeBuild";

/**
 * Launch-time config for native clients. Deliberately unauthenticated: the
 * native app checks it before (and regardless of) sign-in, so a build too old
 * to talk to the backend can say so instead of failing at login. It returns
 * one deployment-wide number and nothing about any user — add a field here
 * only if it is just as public.
 */
export const get = query({
  args: {},
  handler: async () => {
    return {
      minNativeBuild: parseMinNativeBuild(process.env.HG_MIN_NATIVE_BUILD),
    };
  },
});
