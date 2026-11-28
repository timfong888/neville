// Horizontal image gallery for one manifestation. Only rendered when EXPO_PUBLIC_IMAGES=1.
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { IMAGE_GUIDANCE, imageGate } from "@/lib/image/gate";
import { imagePrompt } from "@/lib/image/prompt";
import { mockProvider } from "@/lib/image/provider";
import { colors, radius, space, type } from "../theme";

// 9:16 tile at a small but readable size
const TILE_W = 108;
const TILE_H = 192;

type GalleryItem =
  | { kind: "loading" }
  | { kind: "image"; uri: string }
  | { kind: "withheld"; guidance: string };

function bytesToDataUri(bytes: Uint8Array, mime: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // btoa is available in React Native's JS engine
  return `data:${mime};base64,${btoa(binary)}`;
}

/** A gallery that generates one image for `wish` and shows it inline. */
export function ImageGallery({ wish, relaxed }: { wish: string; relaxed?: boolean }) {
  const [items, setItems] = useState<GalleryItem[]>([{ kind: "loading" }]);

  useEffect(() => {
    const gate = imageGate(wish, { relaxed });
    if (!gate.allowed) {
      setItems([{ kind: "withheld", guidance: IMAGE_GUIDANCE[gate.reason] }]);
      return;
    }
    setItems([{ kind: "loading" }]);
    let live = true;
    mockProvider
      .generate(imagePrompt(wish), "9:16")
      .then(({ bytes, mime }) => {
        if (!live) return;
        setItems([{ kind: "image", uri: bytesToDataUri(bytes, mime) }]);
      })
      .catch((err: unknown) => {
        if (!live) return;
        console.warn("[ALERT] Image generation failed:", err);
        setItems([]);
      });
    return () => {
      live = false;
    };
  }, [wish, relaxed]);

  if (items.length === 0) return null;

  return (
    <View style={s.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {items.map((item, i) => (
          <View key={i} style={s.tile}>
            {item.kind === "loading" ? (
              <ActivityIndicator color={colors.accent} />
            ) : item.kind === "image" ? (
              <Image source={{ uri: item.uri }} style={s.img} resizeMode="cover" accessibilityLabel="Generated image for your wish" />
            ) : (
              <Text style={[type.muted, s.withheld]}>{item.guidance}</Text>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginVertical: space.sm },
  row: { gap: space.sm, paddingHorizontal: 1 },
  tile: {
    width: TILE_W,
    height: TILE_H,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  img: { width: TILE_W, height: TILE_H },
  withheld: { textAlign: "center", paddingHorizontal: space.sm, fontSize: 12, lineHeight: 16 },
});
