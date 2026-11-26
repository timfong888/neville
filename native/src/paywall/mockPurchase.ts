import type { PurchaseClient } from "./types";
import { grantMockCredits } from "../creditsStore";

export const mockPurchaseClient: PurchaseClient = {
  async purchase(packId: string): Promise<void> {
    // RevenueCat is intentionally not installed yet. Keep this development client
    // useful by applying the configured pack credits to the local balance.
    grantMockCredits(packId);
  },
};
