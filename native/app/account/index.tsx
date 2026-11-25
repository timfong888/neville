import { useCallback, useEffect, useState } from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AccountState } from "@/lib/api/client";
import { ACCOUNT_DELETED, type DeviceData, deleteAccountPrompt } from "@/lib/deviceDataCopy";
import { api } from "../../src/api";
import { appleCodeForDeletion, authClient, signInWithApple, signInWithAppleOnWeb } from "../../src/auth";
import { deviceData } from "../../src/deviceData";

const WEB = Platform.OS === "web";

// Account (#121): Sign in with Apple, who is signed in, sign out, delete the account.
export default function Account() {
  const [account, setAccount] = useState<AccountState | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [sheet, setSheet] = useState(false);
  // Set while the delete prompt is open: what is on the phone, when it can be counted.
  const [confirming, setConfirming] = useState<{ device?: DeviceData } | null>(null);

  const refresh = useCallback(
    () =>
      api
        .account()
        .then(setAccount)
        .catch((e: Error) => setNote(`Could not reach the server: ${e.message}`)),
    [],
  );

  useEffect(() => {
    void refresh();
    if (!WEB) AppleAuthentication.isAvailableAsync().then(setSheet).catch(() => setSheet(false));
  }, [refresh]);

  const signIn = async () => {
    setBusy("Opening Apple…");
    const r = await (WEB ? signInWithAppleOnWeb() : signInWithApple());
    setBusy("");
    setNote(!r.ok && !r.cancelled ? r.message : "");
    await refresh();
  };

  const signOut = async () => {
    setBusy("Signing out…");
    await authClient.signOut().catch(() => undefined);
    setBusy("");
    setNote("");
    await refresh();
  };

  const askDelete = async () => setConfirming({ device: await deviceData().catch(() => undefined) });

  const deleteAccount = async () => {
    setConfirming(null);
    // Apple asks once more, so the server can revoke the Apple grant along with the account.
    const apple = await appleCodeForDeletion();
    if (apple.cancelled) return setNote("Nothing was deleted.");
    setBusy("Deleting your account…");
    try {
      await api.deleteAccount(apple.code ? { appleAuthorizationCode: apple.code } : {});
    } catch {
      setBusy("");
      return setNote("Your account could not be deleted just now. Nothing was removed.");
    }
    // The server session is gone; this clears the copy kept on the phone.
    await authClient.signOut().catch(() => undefined);
    setBusy("");
    setNote(ACCOUNT_DELETED);
    await refresh();
  };

  const user = account?.enabled ? account.user : null;
  const canSignIn = !!account?.enabled && !!account.providers?.includes("apple") && (WEB || sheet);

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text accessibilityRole="header" style={s.h1}>{user ? "Your account" : "Account"}</Text>

      {!account ? null : user ? (
        <View style={s.card}>
          <Text style={s.p}>Signed in as <Text style={s.b}>{user.name || user.email}</Text></Text>
          {user.name ? <Text style={s.muted}>{user.email}</Text> : null}
          <Pressable accessibilityRole="button" onPress={signOut} disabled={!!busy} style={s.btn}>
            <Text style={s.btnText}>Sign out</Text>
          </Pressable>
        </View>
      ) : (
        <View style={s.card}>
          <Text style={s.p}>Sign in to make an account. You can delete it here at any time.</Text>
          {!account.enabled ? (
            <Text style={s.muted}>Sign-in is not switched on here yet. You can keep using everything without an account.</Text>
          ) : !canSignIn ? (
            <Text style={s.muted}>Sign in with Apple is not available on this device.</Text>
          ) : WEB ? (
            <Pressable accessibilityRole="button" onPress={signIn} disabled={!!busy} style={[s.btn, s.appleWeb]}>
              <Text style={s.appleWebText}>Continue with Apple</Text>
            </Pressable>
          ) : (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={8}
              style={s.apple}
              onPress={signIn}
            />
          )}
        </View>
      )}

      {busy ? <Text accessibilityLiveRegion="polite" style={s.muted}>{busy}</Text> : null}
      {note ? <Text accessibilityLiveRegion="polite" style={s.muted}>{note}</Text> : null}

      {user ? (
        <View style={s.card}>
          <Text accessibilityRole="header" style={s.h2}>Delete my account</Text>
          {confirming ? (
            <>
              <Text style={s.p}>{deleteAccountPrompt(confirming.device)}</Text>
              <Pressable accessibilityRole="button" onPress={deleteAccount} style={[s.btn, s.danger]}>
                <Text style={s.dangerText}>Delete my account</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setConfirming(null)} style={s.btn}>
                <Text style={s.btnText}>Keep my account</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={s.muted}>Removes your account and everything saved in it. You will be asked to confirm.</Text>
              <Pressable accessibilityRole="button" onPress={askDelete} disabled={!!busy} style={[s.btn, s.dangerOutline]}>
                <Text style={s.dangerOutlineText}>Delete my account…</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flexGrow: 1, padding: 24, paddingTop: 64, gap: 16, backgroundColor: "#151820" },
  card: { gap: 12, padding: 16, borderRadius: 12, backgroundColor: "#1d2230" },
  h1: { color: "#fff", fontSize: 30, fontWeight: "600" },
  h2: { color: "#fff", fontSize: 20, fontWeight: "600" },
  p: { color: "#e6e9ef", fontSize: 16, lineHeight: 22 },
  b: { fontWeight: "600", color: "#fff" },
  muted: { color: "#aab1bf", fontSize: 15, lineHeight: 21 },
  apple: { height: 48, width: "100%" },
  appleWeb: { backgroundColor: "#fff", borderColor: "#fff" },
  appleWebText: { color: "#000", fontSize: 17, fontWeight: "600" },
  btn: { minHeight: 48, borderColor: "#c9ced8", borderWidth: 1, borderRadius: 8, padding: 12, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontSize: 16 },
  danger: { backgroundColor: "#c93b3b", borderColor: "#c93b3b" },
  dangerText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  dangerOutline: { borderColor: "#e06c6c" },
  dangerOutlineText: { color: "#f0a0a0", fontSize: 16 },
});
