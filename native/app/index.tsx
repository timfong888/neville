import { useCallback, useEffect, useState } from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { PACES, TONES } from "@/lib/delivery";
import type { AccountState } from "@/lib/api/client";
import { api, API_URL, appVersion } from "../src/api";
import { authClient, signInWithApple } from "../src/auth";

// Phase 0 home: proves the app reaches the real API, runs shared lib/ code, and signs in.
export default function Home() {
  const [account, setAccount] = useState<AccountState | null>(null);
  const [note, setNote] = useState("Checking the server…");
  const [appleOk, setAppleOk] = useState(false);

  const refresh = useCallback(() => {
    api
      .account()
      .then((a) => {
        setAccount(a);
        // Only the server's state here; a sign-in error stays until the next attempt.
        setNote((n) => (!a.enabled ? "Accounts are off on this server." : n === "Checking the server…" || n.startsWith("Could not reach") ? "" : n));
      })
      .catch((e: Error) => setNote(`Could not reach the server: ${e.message}`));
  }, []);

  useEffect(() => {
    refresh();
    AppleAuthentication.isAvailableAsync().then(setAppleOk).catch(() => setAppleOk(false));
  }, [refresh]);

  const apple = async () => {
    const r = await signInWithApple();
    setNote(!r.ok && !r.cancelled ? r.message : "");
    refresh();
  };
  const signOut = async () => {
    await authClient.signOut();
    refresh();
  };

  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.card}>
        <Text style={s.h1}>Neville</Text>
        <Text style={s.p}>Version {appVersion} · {API_URL}</Text>
        <Text style={s.p}>Shared lib/: {PACES.length} paces, {TONES.length} tones.</Text>
        {account?.user ? (
          <>
            <Text style={s.p}>Signed in as {account.user.name || account.user.email}.</Text>
            <Pressable onPress={signOut} style={s.btn}>
              <Text style={s.btnText}>Sign out</Text>
            </Pressable>
          </>
        ) : account?.enabled && appleOk ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={8}
            style={s.apple}
            onPress={apple}
          />
        ) : null}
        {note ? <Text style={s.p}>{note}</Text> : null}
        <Link href="/spike" style={s.link}>Audio spike</Link>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: "center", padding: 24, backgroundColor: "#151820" },
  card: { gap: 12 },
  h1: { color: "#fff", fontSize: 34, fontWeight: "600" },
  link: { color: "#8ab4ff", fontSize: 16 },
  p: { color: "#c9ced8", fontSize: 16 },
  apple: { height: 48, width: "100%" },
  btn: { borderColor: "#c9ced8", borderWidth: 1, borderRadius: 8, padding: 12, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16 },
});
