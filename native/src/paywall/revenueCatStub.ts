import type { PurchaseClient } from "./types";

export const revenueCatPurchaseClient: PurchaseClient = {
  async purchase(_packId: string): Promise<void> {
    throw new Error("RevenueCat is not configured.");
  },
};
