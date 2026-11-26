import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { CreditsResponse } from "@/lib/api/client";
import { isBestValue } from "@/lib/paywall";
import { colors, radius, space, type as T } from "../theme";
import type { PurchaseClient } from "./types";

export interface PaywallSheetProps {
  credits: CreditsResponse;
  purchaseClient: PurchaseClient;
  onClose: () => void;
  onPurchased: () => void;
}

function packLabel(id: string): string {
  if (id === "pack10") return "Pack 10";
  if (id === "starter") return "Starter";
  // Fallback: capitalise first letter
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function PaywallSheet({ credits, purchaseClient, onClose, onPurchased }: PaywallSheetProps) {
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePurchase(packId: string) {
    setBuying(packId);
    setError(null);
    try {
      await purchaseClient.purchase(packId);
      onPurchased();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Purchase failed. Please try again.");
    } finally {
      setBuying(null);
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <Text style={s.title}>Get more recordings</Text>
          {credits.packs.map((pack) => {
            const best = isBestValue(pack);
            const isLoading = buying === pack.id;
            return (
              <Pressable
                key={pack.id}
                style={[s.pack, best && s.packBest]}
                onPress={() => void handlePurchase(pack.id)}
                disabled={buying !== null}
                accessibilityRole="button"
                accessibilityLabel={`${packLabel(pack.id)}: ${pack.credits} credits for ${pack.price}${best ? ", best value" : ""}`}
              >
                <View style={s.packRow}>
                  <View>
                    <Text style={s.packName}>{packLabel(pack.id)}</Text>
                    <Text style={s.packDetail}>{pack.credits} credits · {pack.price}</Text>
                  </View>
                  <View style={s.packRight}>
                    {best ? <Text style={s.badge}>Best value</Text> : null}
                    {isLoading ? <ActivityIndicator color={colors.accentInk} /> : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Pressable style={s.cancel} onPress={onClose} disabled={buying !== null} accessibilityRole="button">
            <Text style={s.cancelText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    padding: space.xl,
    gap: space.md,
  },
  title: {
    ...T.h2,
    marginBottom: space.sm,
  },
  pack: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
  },
  packBest: {
    borderColor: colors.accent,
  },
  packRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  packName: {
    ...T.body,
  },
  packDetail: {
    ...T.muted,
  },
  packRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  badge: {
    backgroundColor: colors.accent,
    color: colors.accentInk,
    fontSize: 12,
    fontWeight: "600",
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    overflow: "hidden",
  },
  error: {
    color: colors.warn,
    fontSize: 14,
    lineHeight: 20,
  },
  cancel: {
    alignItems: "center",
    paddingVertical: space.md,
    marginTop: space.sm,
  },
  cancelText: {
    ...T.muted,
  },
});
