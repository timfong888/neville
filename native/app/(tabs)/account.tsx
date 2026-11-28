import { useCallback, useEffect, useState } from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ACCOUNT_DELETED, type DeviceData, deleteAccountPrompt } from "@/lib/deviceDataCopy";
import { api } from "../../src/api";
import { clearUser, refreshAccount, useAccount } from "../../src/accountStore";
import { appleCodeForDeletion, authClient, signInWithApple, signInWithAppleOnWeb } from "../../src/auth";
import { deviceData } from "../../src/deviceData";
import { isActive } from "../../src/player/nowPlaying";
import { useNowPlaying } from "../../src/player/nowPlayingStore";
import { colors, radius, space, type } from "../../src/theme";
import { PlaybackBar } from "../../src/ui/PlaybackBar";
import { Screen } from "../../src/ui/Screen";

const WEB = Platform.OS === "web";

// Account (#121): Sign in with Apple, who is signed in, sign out, delete the account.
export default function Account() {
  const account = useAccount();
  const np = useNowPlaying();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [sheet, setSheet] = useState(false);
  // Set while the delete prompt is open: what is on the phone, when it can be counted.
  const [confirming, setConfirming] = useState<{ device?: DeviceData } | null>(null);

  const refresh = useCallback(
    () =>
      refreshAccount().catch((e: Error) => setNote(`Could not reach the server: ${e.message}`)),
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
    const r = await authClient.signOut().catch(() => null);
    setBusy("");
    const out = !!r && !r.error;
    // Signed out on this phone now, even if the lookup that follows cannot reach the server.
    if (out) clearUser();
    setNote(out ? "" : "Could not sign out just now. Try again.");
    await refresh();
  };

  const askDelete = async () => setConfirming({ device: await deviceData().catch(() => undefined) });

  const deleteAccount = async () => {
    setConfirming(null);
    // Apple asks once more, so the server can revoke the Apple grant along with the account.
    // Without a code from the sheet (a cancel, an error, an empty answer) nothing is sent to the server.
    const apple = await appleCodeForDeletion();
    if (!apple.proceed) return setNote("Nothing was deleted.");
    setBusy("Deleting your account…");
    try {
      await api.deleteAccount(apple.code ? { appleAuthorizationCode: apple.code } : {});
    } catch {
      setBusy("");
      return setNote("Your account could not be deleted just now. Nothing was removed.");
    }
    // The server session is gone; this clears the copy kept on the phone.
    await authClient.signOut().catch(() => undefined);
    clearUser();
    setBusy("");
    setNote(ACCOUNT_DELETED);
    await refresh();
  };

  const user = account?.enabled ? account.user : null;
  const canSignIn = !!account?.enabled && !!account.providers?.includes("apple") && (WEB || sheet);

  return (
    <Screen title={user ? "Your account" : "Account"} footer={isActive(np) ? <PlaybackBar np={np} /> : undefined}>

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
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { gap: space.md, padding: space.lg, borderRadius: radius.md, backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1 },
  h2: type.h2,
  p: type.body,
  b: { fontWeight: "600" },
  muted: type.muted,
  apple: { height: 48, width: "100%" },
  appleWeb: { backgroundColor: "#fff", borderColor: "#fff" },
  appleWebText: { color: "#000", fontSize: 17, fontWeight: "600" },
  btn: { minHeight: 48, borderColor: colors.line, borderWidth: 1, borderRadius: radius.sm, padding: space.md, alignItems: "center", justifyContent: "center" },
  btnText: { color: colors.text, fontSize: 16 },
  danger: { backgroundColor: colors.warn, borderColor: colors.warn },
  dangerText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  dangerOutline: { borderColor: colors.warn },
  dangerOutlineText: { color: colors.warn, fontSize: 16 },
});
