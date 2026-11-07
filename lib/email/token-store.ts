import { prisma } from "@/lib/prisma";
import type { UsedTokenStore } from "./token-use";

/** Postgres store: the primary key makes "first presentation wins" atomic across requests. */
export const prismaTokenStore: UsedTokenStore = {
  async insert(tokenHash, expiresAt) {
    try {
      await prisma.usedEmailToken.create({ data: { tokenHash, expiresAt } });
      return true;
    } catch (error) {
      if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") return false;
      throw error;
    }
  },
  async prune(now) {
    await prisma.usedEmailToken.deleteMany({ where: { expiresAt: { lte: now } } });
  },
};
