import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { PACES, TONES } from "@/lib/delivery";
import { api, API_URL, appVersion } from "../src/api";

// Phase 0 home: proves the app reaches the real API and runs the shared lib/ code.
export default function Home() {
  const [status, setStatus] = useState("Checking the server…");

  useEffect(() => {
    api
      .account()
      .then((a) => setStatus(a.enabled ? "Accounts are on." : "Accounts are off here."))
      .catch((e: Error) => setStatus(`Could not reach the server: ${e.message}`));
  }, []);

  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.card}>
        <Text style={s.h1}>Neville</Text>
        <Text style={s.p}>Version {appVersion}</Text>
        <Text style={s.p}>{API_URL}</Text>
        <Text style={s.p}>{status}</Text>
        <Link href="/spike" style={s.link}>Audio spike</Link>
        <Text style={s.p}>Shared lib/: {PACES.length} paces, {TONES.length} tones.</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: "center", padding: 24, backgroundColor: "#151820" },
  card: { gap: 10 },
  h1: { color: "#fff", fontSize: 34, fontWeight: "600" },
  link: { color: "#8ab4ff", fontSize: 16 },
  p: { color: "#c9ced8", fontSize: 16 },
});
