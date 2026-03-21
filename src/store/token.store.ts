export type TokenRecord = {
  userId: string;
  token: string;
  updatedAt: number;
};

class TokenStore {
  // token -> record
  private byToken = new Map<string, TokenRecord>();
  // userId -> tokens
  private byUser = new Map<string, Set<string>>();

  upsert(userId: string, token: string) {
    const now = Date.now();
    this.byToken.set(token, { userId, token, updatedAt: now });

    if (!this.byUser.has(userId)) this.byUser.set(userId, new Set());
    this.byUser.get(userId)!.add(token);
  }

  getTokensByUser(userId: string): string[] {
    return Array.from(this.byUser.get(userId) ?? []);
  }

  removeToken(token: string) {
    const rec = this.byToken.get(token);
    if (rec) {
      const set = this.byUser.get(rec.userId);
      set?.delete(token);
      if (set && set.size === 0) this.byUser.delete(rec.userId);
    }
    this.byToken.delete(token);
  }

  listAllTokens(): string[] {
    return Array.from(this.byToken.keys());
  }
}

export const tokenStore = new TokenStore();
