import { describe, expect, it } from "vitest";
import {
  parseAccounts,
  upsertAccount,
  removeAccount,
  nextAccount,
  type StoredAccount,
} from "./accounts";

const acct = (username: string, token = `tok-${username}`, addedAt = 1): StoredAccount => ({
  username,
  avatarUrl: `avatar-${username}`,
  sessionToken: token,
  addedAt,
});

describe("parseAccounts", () => {
  it("returns an empty list for null/empty/corrupt JSON", () => {
    expect(parseAccounts(null)).toEqual([]);
    expect(parseAccounts("")).toEqual([]);
    expect(parseAccounts("{not json")).toEqual([]);
    expect(parseAccounts("{}")).toEqual([]); // object, not array
    expect(parseAccounts('"a string"')).toEqual([]);
  });

  it("parses a valid array and drops malformed entries", () => {
    const raw = JSON.stringify([
      { username: "a", avatarUrl: "av", sessionToken: "t1", addedAt: 5 },
      { username: "b", sessionToken: "t2" }, // missing avatarUrl/addedAt → defaulted
      { username: "c" }, // missing token → dropped
      { sessionToken: "t4" }, // missing username → dropped
      42, // not an object → dropped
    ]);
    const result = parseAccounts(raw);
    expect(result).toEqual([
      { username: "a", avatarUrl: "av", sessionToken: "t1", addedAt: 5 },
      { username: "b", avatarUrl: "", sessionToken: "t2", addedAt: 0 },
    ]);
  });
});

describe("upsertAccount", () => {
  it("appends a new account", () => {
    const result = upsertAccount([acct("a")], acct("b"));
    expect(result.map((x) => x.username)).toEqual(["a", "b"]);
  });

  it("dedupes by username, replacing the token in place and keeping addedAt", () => {
    const start = [acct("a", "old-a", 10), acct("b", "tok-b", 20)];
    const result = upsertAccount(start, acct("a", "new-a", 999));
    expect(result.map((x) => x.username)).toEqual(["a", "b"]); // order preserved
    const a = result.find((x) => x.username === "a")!;
    expect(a.sessionToken).toBe("new-a"); // token replaced
    expect(a.addedAt).toBe(10); // original addedAt kept
  });
});

describe("removeAccount / nextAccount", () => {
  it("removes by username", () => {
    const result = removeAccount([acct("a"), acct("b")], "a");
    expect(result.map((x) => x.username)).toEqual(["b"]);
  });

  it("promotes the first remaining account after removing the active one", () => {
    const accounts = [acct("a"), acct("b"), acct("c")];
    expect(nextAccount(accounts, "a")?.username).toBe("b");
  });

  it("returns null when no accounts remain", () => {
    expect(nextAccount([acct("a")], "a")).toBeNull();
  });
});
