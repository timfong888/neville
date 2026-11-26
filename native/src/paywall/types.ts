export interface PurchaseClient {
  purchase(packId: string): Promise<void>;
}
