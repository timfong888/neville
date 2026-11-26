import type { PurchaseClient } from "./types";

export const mockPurchaseClient: PurchaseClient = {
  async purchase(_packId: string): Promise<void> {
    // No-op. The component refreshes credits balance after this resolves.
  },
};
