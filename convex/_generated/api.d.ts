/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as authHelper from "../authHelper.js";
import type * as collection from "../collection.js";
import type * as discogs from "../discogs.js";
import type * as discogsHelpers from "../discogsHelpers.js";
import type * as following from "../following.js";
import type * as following_feed from "../following_feed.js";
import type * as last_played from "../last_played.js";
import type * as oauth from "../oauth.js";
import type * as preferences from "../preferences.js";
import type * as purge_tags from "../purge_tags.js";
import type * as sessions from "../sessions.js";
import type * as users from "../users.js";
import type * as want_priorities from "../want_priorities.js";
import type * as wantlist from "../wantlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  authHelper: typeof authHelper;
  collection: typeof collection;
  discogs: typeof discogs;
  discogsHelpers: typeof discogsHelpers;
  following: typeof following;
  following_feed: typeof following_feed;
  last_played: typeof last_played;
  oauth: typeof oauth;
  preferences: typeof preferences;
  purge_tags: typeof purge_tags;
  sessions: typeof sessions;
  users: typeof users;
  want_priorities: typeof want_priorities;
  wantlist: typeof wantlist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
