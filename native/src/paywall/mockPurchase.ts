import type { PurchaseClient } from "./types";

export const mockPurchaseClient: PurchaseClient = {
  async purchase(_packId: string): Promise<void> {
    throw new Error("Purchases are not available yet. RevenueCat will be configured in Phase 3.");
  },
};
