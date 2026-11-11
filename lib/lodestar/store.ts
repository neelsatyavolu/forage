import type { Db } from "../db/client";
import { deleteLodestarLink, getLodestarLink, lockLodestarLink, saveLodestarLink } from "../db/links";
import { deriveKey, seal, unseal } from "../ai/seal";
import { LodestarError } from "./errors";
import { TokensSchema, type Tokens } from "./tokens";

// The account's Lodestar tokens, sealed (AES-GCM, bound to the account) in
// lodestar_links. Refreshing locks the row: Lodestar rotates refresh tokens
// and revokes the grant if one is spent twice, so a second request that
// finds the tokens already refreshed uses the new ones instead.

export const tokenKey = (secret: string): Buffer => deriveKey(secret, "lodestar-tokens");

const aad = (userId: string) => `lodestar-tokens:${userId}`;

export const sealTokens = (key: Buffer, userId: string, t: Tokens): string => seal(key, JSON.stringify(t), aad(userId));

export function openTokens(key: Buffer, userId: string, sealed: string): Tokens | null {
  const plain = unseal(key, sealed, aad(userId));
  if (!plain) return null;
  try {
    const parsed = TokensSchema.safeParse(JSON.parse(plain));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Where the client gets tokens: the saved ones, and new ones after the saved ones were refused or expired. */
export type TokenSource = { current(): Promise<Tokens>; refresh(stale: Tokens): Promise<Tokens> };

const NOT_LINKED = () => new LodestarError("not_linked", "Connect Lodestar from Account first.");

export function saveTokens(db: Db, key: Buffer, userId: string, tokens: Tokens, label: string | null, now: number): Promise<void> {
  return saveLodestarLink(db, userId, sealTokens(key, userId, tokens), label, now);
}

export function dbTokenSource(db: Db, key: Buffer, userId: string, refresher: (refreshToken: string) => Promise<Tokens>, now: () => number): TokenSource {
  return {
    async current() {
      const link = await getLodestarLink(db, userId);
      const tokens = link && openTokens(key, userId, link.sealedTokens);
      if (!tokens) throw NOT_LINKED();
      return tokens;
    },
    async refresh(stale) {
      const outcome = await db.transaction(async (tx): Promise<Tokens | "gone" | "revoked"> => {
        const sealed = await lockLodestarLink(tx, userId);
        const saved = sealed && openTokens(key, userId, sealed);
        if (!saved) return "gone";
        // Another request refreshed while this one waited: use its tokens.
        if (saved.refreshToken !== stale.refreshToken) return saved;
        try {
          const fresh = await refresher(saved.refreshToken);
          await saveLodestarLink(tx, userId, sealTokens(key, userId, fresh), null, now());
          return fresh;
        } catch (err) {
          if (err instanceof LodestarError && err.code === "revoked") return "revoked";
          throw err;
        }
      });
      if (outcome === "gone") throw NOT_LINKED();
      if (outcome === "revoked") {
        await deleteLodestarLink(db, userId);
        throw new LodestarError("revoked", "Lodestar ended this connection. Connect again from Account.");
      }
      return outcome;
    },
  };
}
