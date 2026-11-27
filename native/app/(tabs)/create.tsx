import { useCallback, useEffect } from "react";
import { Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { EXAMPLES, MAX_WANT } from "@/lib/create";
import { createAccess, freeNoteFor, isSignedIn, showResetDemo } from "@/lib/createGate";
import { refreshAccount, useAccountView } from "../../src/accountStore";
import { create, clearPaywallError, edit, load, pickCadence, pickSpeed, pickVoice, reset, setScriptMode, useCreate } from "../../src/create/session";
import { VoiceSection } from "../../src/ui/VoiceSection";
import { PAYWALL_ENABLED } from "../../src/config";
import { shouldShowPaywall } from "@/lib/paywall";
import { refreshCredits, useCredits } from "../../src/creditsStore";
import { mockPurchaseClient } from "../../src/paywall/mockPurchase";
import { PaywallSheet } from "../../src/paywall/PaywallSheet";
import { colors } from "../../src/theme";
import { Button, Gate, s } from "../../src/create/ui";
import { Screen } from "../../src/ui/Screen";

// Create, step 1: the wish. One tap makes the script and the recording (step 2 shows progress).
export default function Wish() {
  const c = useCreate();
  const router = useRouter();
  // The same sign-in state the Account tab keeps; it updates here when that changes (#164).
  const { account, checked } = useAccountView();
  const signedIn = isSignedIn(account);
  const access = createAccess(account, checked, c.used);
  const checking = access === "checking";
  const note = freeNoteFor(access, signedIn, c.used);
  // Always call hook unconditionally; ignore result when paywall is off.
  const credits = useCredits();
  // A 402 has no result, so wait for one before leaving this screen. This keeps the
  // paywall visible instead of briefly opening Script and being redirected back.
  useEffect(() => {
    if (PAYWALL_ENABLED && c.made) router.push("/create/script");
  }, [c.made, router]);
  // Each visit: the draft, the count, the voice, and who is signed in may have changed.
  useFocusEffect(
    useCallback(() => {
      void load();
      refreshAccount().catch(() => undefined);
      if (PAYWALL_ENABLED) refreshCredits().catch(() => undefined);
    }, []),
  );
  const go = () => {
    if (create() && !PAYWALL_ENABLED) router.push("/create/script");
  };

  return (
    <>
      {/* The Create button is the footer: it stays in sight and sits just above the keyboard (#149).
          The gate shows with it, so a tap that is refused is answered where the tap was. */}
      <Screen
        title="Type what you want. Hear it as already yours."
        footer={
          <>
            {PAYWALL_ENABLED && c.paywallError?.type === "sign_in" ? (
              <Text style={s.muted}>Sign in to continue recording.</Text>
            ) : null}
            {PAYWALL_ENABLED && c.paywallError?.type === "timeout" ? (
              <Text style={s.muted}>
                {c.paywallError.creditReturned ? "Recording timed out. Your credit was returned." : "Recording timed out."}
              </Text>
            ) : null}
            {c.gate ? <Gate signedIn={signedIn} /> : null}
            {checking ? <Text accessibilityLiveRegion="polite" style={s.muted}>Checking your account…</Text> : null}
            <Button label="Create my manifestation" disabled={!c.want.trim() || checking} onPress={go} />
          </>
        }
      >
        <Text style={s.muted}>No sign-up. One tap. A short affirmation written and recorded for you.</Text>
        <View style={s.card}>
          {PAYWALL_ENABLED && credits?.paywallEnabled ? (
            <View style={s.row}>
              <Text style={s.muted} accessibilityLabel="credits balance">
                {credits.unlimited ? "Unlimited" : `${credits.balance} credit${credits.balance !== 1 ? "s" : ""}`}
              </Text>
            </View>
          ) : null}
          <Text nativeID="want" style={s.muted}>What is already yours?</Text>
          <Text style={[s.muted, { fontStyle: "italic", fontSize: 12 }]}>
            {"To feel I will be is to confess I am not. — Neville Goddard, Feeling Is the Secret."}
          </Text>
          <TextInput
            accessibilityLabelledBy="want"
            aria-labelledby="want"
            style={[s.input, s.area]}
            multiline
            // Return ends typing and puts the keyboard away; a wish is one thought, not paragraphs.
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            value={c.want}
            maxLength={MAX_WANT}
            placeholder={EXAMPLES[0]}
            placeholderTextColor={colors.muted}
            onChangeText={(want) => edit({ want })}
          />
          <View style={s.row} accessibilityLabel="Examples">
            {EXAMPLES.map((e) => (
              <Button key={e} small label={e} onPress={() => edit({ want: e })} />
            ))}
          </View>
          <View style={s.row}>
            <Text style={s.muted}>Script</Text>
            <Button small label="Enhance with AI" disabled={c.scriptMode === "enhance"} onPress={() => setScriptMode("enhance")} />
            <Button small label="Exactly my words" disabled={c.scriptMode === "exact"} onPress={() => setScriptMode("exact")} />
          </View>
          <VoiceSection
            voiceId={c.voiceId}
            voiceName={c.voiceName}
            speedStep={c.speedStep}
            cadenceStep={c.cadenceStep}
            onPickVoice={(id) => void pickVoice(id)}
            onPickSpeed={(id) => void pickSpeed(id)}
            onPickCadence={(id) => void pickCadence(id)}
          />
          <View style={s.row}>
            {note ? <Text style={s.muted}>{note}</Text> : null}
            {showResetDemo(__DEV__, c.used) ? <Button small label="Reset demo" onPress={reset} /> : null}
          </View>
        </View>
      </Screen>
      {PAYWALL_ENABLED && c.paywallError?.type === "no_credits" && credits !== null && shouldShowPaywall(credits) ? (
        <PaywallSheet
          credits={credits}
          purchaseClient={mockPurchaseClient}
          onClose={clearPaywallError}
          onPurchased={clearPaywallError}
        />
      ) : null}
    </>
  );
}
