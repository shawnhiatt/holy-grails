/* Multi-account list manipulation (Spec 5). Pure array/JSON helpers with no
   localStorage or React — the actual storage I/O lives in app-context.tsx
   (the only file permitted web storage, lint-enforced). Kept here so the
   dedupe / remove / promote-next / defensive-parse logic is unit-testable in
   the node environment. */

export interface StoredAccount {
  username: string;
  avatarUrl: string;
  sessionToken: string;
  addedAt: number;
}

/**
 * Defensively parse the stored `hg_accounts` JSON into a clean list.
 * Corrupt JSON, a non-array payload, or malformed entries all degrade to an
 * empty/filtered list rather than throwing.
 */
export function parseAccounts(raw: string | null | undefined): StoredAccount[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: StoredAccount[] = [];
  for (const item of parsed) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as StoredAccount).username === "string" &&
      typeof (item as StoredAccount).sessionToken === "string" &&
      (item as StoredAccount).username &&
      (item as StoredAccount).sessionToken
    ) {
      const a = item as Partial<StoredAccount>;
      out.push({
        username: a.username as string,
        avatarUrl: typeof a.avatarUrl === "string" ? a.avatarUrl : "",
        sessionToken: a.sessionToken as string,
        addedAt: typeof a.addedAt === "number" ? a.addedAt : 0,
      });
    }
  }
  return out;
}

/**
 * Insert or update an account, deduped by username. Re-adding an existing
 * account replaces its token/avatar in place (preserving list position and
 * original `addedAt`); a new account is appended.
 */
export function upsertAccount(
  accounts: StoredAccount[],
  account: StoredAccount,
): StoredAccount[] {
  let found = false;
  const updated = accounts.map((a) => {
    if (a.username === account.username) {
      found = true;
      return { ...account, addedAt: a.addedAt };
    }
    return a;
  });
  if (!found) updated.push(account);
  return updated;
}

/** Remove an account by username. */
export function removeAccount(
  accounts: StoredAccount[],
  username: string,
): StoredAccount[] {
  return accounts.filter((a) => a.username !== username);
}

/**
 * The account to promote after removing `username` — the first remaining
 * account, or null when none are left.
 */
export function nextAccount(
  accounts: StoredAccount[],
  username: string,
): StoredAccount | null {
  return removeAccount(accounts, username)[0] ?? null;
}
