import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Per-album market-value drip (Spec 6). Runs once a day at a low-traffic hour;
// each run fetches a small batch of stale prices per user (see marketValueDrip
// in convex/discogs.ts), so the ~monthly refresh never competes with a user's
// own sync against the 60/min Discogs budget.
crons.daily(
  "market value drip",
  { hourUTC: 9, minuteUTC: 0 },
  internal.discogs.marketValueDrip
);

export default crons;
