import { useCallback, useEffect, useRef, useState } from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { ACCOUNT_DELETED, type DeviceData, deleteAccountPrompt } from "@/lib/deviceDataCopy";
import { validateFirstName, MAX_FIRST_NAME } from "@/lib/firstName";
import { FREE_ANON_GENERATIONS } from "@/lib/architecture";
import { CREDITS } from "@/lib/credits";
import { api } from "../../src/api";
import { clearUser, refreshAccount, useAccount } from "../../src/accountStore";
import { appleCodeForDeletion, authClient, signInWithApple, signInWithAppleOnWeb } from "../../src/auth";
import { deviceData } from "../../src/deviceData";
import { refreshCredits, useCredits } from "../../src/creditsStore";
import { loadProfileName, saveProfileName, useFirstName } from "../../src/profileNameStore";
import { PAYWALL_ENABLED } from "../../src/config";
import { isActive } from "../../src/player/nowPlaying";
import { useNowPlaying } from "../../src/player/nowPlayingStore";
import { colors, radius, space, type } from "../../src/theme";
import { PlaybackBar } from "../../src/ui/PlaybackBar";
import { Screen } from "../../src/ui/Screen";

const WEB = Platform.OS === "web";

export default function Profile() {
  const account = useAccount();
  const firstName = useFirstName();
  const credits = useCredits();
  const np = useNowPlaying();

  const [nameInput, setNameInput] = useState(firstName);
  const [nameError, setNameError] = useState("");
  const [nameSaving, setNameSaving] = useState(false);

  // Keep the text input in sync when the store loads after mount.
  const loaded = useRef(false);
  useEffect(() => {
    if (!loaded.current) {
      setNameInput(firstName);
    }
  }, [firstName]);


  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [sheet, setSheet] = useState(false);
  const [confirming, setConfirming] = useState<{ device?: DeviceData } | null>(null);

  const refresh = useCallback(
    () =>
      refreshAccount().catch((e: Error) => setNote(`Could not reach the server: ${e.message}`)),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void loadProfileName().then(() => { loaded.current = true; });
      void refresh();
      if (PAYWALL_ENABLED) refreshCredits().catch(() => undefined);
      if (!WEB) AppleAuthentication.isAvailableAsync().then(setSheet).catch(() => setSheet(false));
    }, [refresh]),
  );

  // Keep local input in sync after the store loads.
  useEffect(() => {
    if (loaded.current) return;
  }, [firstName]);

  const saveName = async () => {
    const trimmed = nameInput.trim();
    const err = validateFirstName(trimmed);
    if (err) { setNameError(err); return; }
    setNameError("");
    setNameSaving(true);
    await saveProfileName(trimmed).catch(() => setNameError("Could not save. Try again."));
    setNameSaving(false);
  };

  const signIn = async () => {
    setBusy("Opening Apple…");
    const r = await (WEB ? signInWithAppleOnWeb() : signInWithApple());
    setBusy("");
    setNote(!r.ok && !r.cancelled ? r.message : "");
    await refresh();
    // Bring across the device name on sign-in.
    void loadProfileName();
  };

  const signOut = async () => {
    setBusy("Signing out…");
    const r = await authClient.signOut().catch(() => null);
    setBusy("");
    const out = !!r && !r.error;
    if (out) clearUser();
    setNote(out ? "" : "Could not sign out just now. Try again.");
    await refresh();
  };

  const askDelete = async () => setConfirming({ device: await deviceData().catch(() => undefined) });

  const deleteAccount = async () => {
    setConfirming(null);
    const apple = await appleCodeForDeletion();
    if (!apple.proceed) return setNote("Nothing was deleted.");
    setBusy("Deleting your account…");
    try {
      await api.deleteAccount(apple.code ? { appleAuthorizationCode: apple.code } : {});
    } catch {
      setBusy("");
      return setNote("Your account could not be deleted just now. Nothing was removed.");
    }
    await authClient.signOut().catch(() => undefined);
    clearUser();
    setBusy("");
    setNote(ACCOUNT_DELETED);
    await refresh();
  };

  const user = account?.enabled ? account.user : null;
  const canSignIn = !!account?.enabled && !!account.providers?.includes("apple") && (WEB || sheet);
  const signedIn = !!user;

  return (
    <Screen title="Profile" footer={isActive(np) ? <PlaybackBar np={np} /> : undefined}>

      {/* First name */}
      <View style={s.card}>
        <Text accessibilityRole="header" style={s.h2}>Your name</Text>
        <TextInput
          accessibilityLabel="First name"
          style={s.input}
          value={nameInput}
          maxLength={MAX_FIRST_NAME}
          autoComplete="given-name"
          returnKeyType="done"
          placeholder="Your first name"
          placeholderTextColor={colors.muted}
          onChangeText={(v) => { setNameInput(v); setNameError(""); }}
          onSubmitEditing={saveName}
        />
        {nameError ? <Text style={s.error}>{nameError}</Text> : null}
        <Pressable
          accessibilityRole="button"
          onPress={saveName}
          disabled={nameSaving}
          style={[s.btn, nameSaving && s.btnDisabled]}
        >
          <Text style={s.btnText}>{nameSaving ? "Saving…" : "Save"}</Text>
        </Pressable>
        <Text style={s.hint}>New recordings will use this name.</Text>
      </View>

      {/* Plan and entitlements */}
      <PlanCard signedIn={signedIn} credits={credits} />

      {/* Sign-in / sign-out */}
      {!account ? null : user ? (
        <View style={s.card}>
          <Text style={s.p}>Signed in as <Text style={s.b}>{user.email}</Text></Text>
          <Pressable accessibilityRole="button" onPress={signOut} disabled={!!busy} style={s.btn}>
            <Text style={s.btnText}>Sign out</Text>
          </Pressable>
        </View>
      ) : (
        <View style={s.card}>
          <Text style={s.p}>Sign in to keep your name and recordings on every device.</Text>
          {!account.enabled ? (
            <Text style={s.muted}>Sign-in is not switched on here yet.</Text>
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
              <Text style={s.muted}>Removes your account and everything saved in it.</Text>
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

type PlanCardProps = {
  signedIn: boolean;
  credits: ReturnType<typeof useCredits>;
};

function PlanCard({ signedIn, credits }: PlanCardProps) {
  const freeCreations = FREE_ANON_GENERATIONS;

  if (!signedIn) {
    return (
      <View style={s.card}>
        <Text accessibilityRole="header" style={s.h2}>Free on this device</Text>
        <EntitlementRow label="Creations" value={`${freeCreations} to try, then sign in`} />
        <EntitlementRow label="Voices" value="Standard" />
        <EntitlementRow label="Music" value="Included" />
        <EntitlementRow label="Speed and cadence" value="Included" />
        <EntitlementRow label="Library" value="On this device only" />
        <Text style={[s.muted, { marginTop: space.sm }]}>Sign in to keep your work and name across devices.</Text>
      </View>
    );
  }

  const paywallOn = PAYWALL_ENABLED && credits?.paywallEnabled;
  const balance = paywallOn && credits && !credits.unlimited ? credits.balance : null;

  return (
    <View style={s.card}>
      <Text accessibilityRole="header" style={s.h2}>Plan: Free</Text>
      {balance !== null ? (
        <EntitlementRow label="Creations remaining" value={String(balance)} />
      ) : (
        <EntitlementRow label="Creations" value={`${CREDITS.freeCredits} included`} />
      )}
      <EntitlementRow label="Voices" value="Standard" />
      <EntitlementRow label="Music" value="Included" />
      <EntitlementRow label="Speed and cadence" value="Included" />
      <EntitlementRow label="Library" value="Saved to your account" />
    </View>
  );
}

function EntitlementRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.entLabel}>{label}</Text>
      <Text style={s.entValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: space.md, padding: space.lg, borderRadius: radius.md, backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1 },
  h2: type.h2,
  p: type.body,
  b: { fontWeight: "600" },
  muted: type.muted,
  hint: { ...type.muted, fontSize: 12 },
  error: { color: colors.warn, fontSize: 14 },
  apple: { height: 48, width: "100%" },
  appleWeb: { backgroundColor: "#fff", borderColor: "#fff" },
  appleWebText: { color: "#000", fontSize: 17, fontWeight: "600" },
  input: { borderColor: colors.line, borderWidth: 1, borderRadius: radius.sm, padding: space.md, color: colors.text, fontSize: 16, minHeight: 48 },
  btn: { minHeight: 48, borderColor: colors.line, borderWidth: 1, borderRadius: radius.sm, padding: space.md, alignItems: "center", justifyContent: "center" },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: colors.text, fontSize: 16 },
  danger: { backgroundColor: colors.warn, borderColor: colors.warn },
  dangerText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  dangerOutline: { borderColor: colors.warn },
  dangerOutlineText: { color: colors.warn, fontSize: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
  entLabel: { ...type.muted, flex: 1 },
  entValue: { ...type.body, flex: 1, textAlign: "right" },
});
