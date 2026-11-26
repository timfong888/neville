import { useCallback } from "react";
import { Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { EXAMPLES, MAX_NAME, MAX_WANT } from "@/lib/create";
import { freeNote, isSignedIn, showResetDemo } from "@/lib/createGate";
import { refreshAccount, useAccount } from "../../src/accountStore";
import { create, edit, load, reset, useCreate } from "../../src/create/session";
import { colors } from "../../src/theme";
import { Button, Gate, s } from "../../src/create/ui";
import { Screen } from "../../src/ui/Screen";

// Create, step 1: the wish. One tap makes the script and the recording (step 2 shows progress).
export default function Wish() {
  const c = useCreate();
  const router = useRouter();
  // The same sign-in state the Account tab keeps; it updates here when that changes (#164).
  const signedIn = isSignedIn(useAccount());
  // Each visit: the draft, the count, the voice, and who is signed in may have changed.
  useFocusEffect(
    useCallback(() => {
      void load();
      refreshAccount().catch(() => undefined);
    }, []),
  );
  const go = () => {
    if (create()) router.push("/create/script");
  };

  return (
    // The Create button is the footer: it stays in sight and sits just above the keyboard (#149).
    // The gate shows with it, so a tap that is refused is answered where the tap was.
    <Screen
      title="Type what you want. Hear it as already yours."
      footer={
        <>
          {c.gate ? <Gate signedIn={signedIn} /> : null}
          <Button label="Create my manifestation" disabled={!c.want.trim()} onPress={go} />
        </>
      }
    >
      <Text style={s.muted}>No sign-up. One tap. A short affirmation written and recorded for you.</Text>
      <View style={s.card}>
        <Text nativeID="want" style={s.muted}>What do you want?</Text>
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
        <Text nativeID="name" style={s.muted}>Your first name (optional)</Text>
        <TextInput
          accessibilityLabelledBy="name"
          aria-labelledby="name"
          style={s.input}
          value={c.name}
          maxLength={MAX_NAME}
          autoComplete="given-name"
          returnKeyType="done"
          placeholder="Tim"
          placeholderTextColor={colors.muted}
          onChangeText={(name) => edit({ name })}
        />
        <View style={s.row}>
          <Text style={s.muted}>
            Voice: <Text style={s.p}>{c.voiceName}</Text>
          </Text>
          <Button small label="Change voice" onPress={() => router.push("/create/voice")} />
        </View>
        <View style={s.row}>
          {freeNote(signedIn, c.used) ? <Text style={s.muted}>{freeNote(signedIn, c.used)}</Text> : null}
          {showResetDemo(__DEV__, c.used) ? <Button small label="Reset demo" onPress={reset} /> : null}
        </View>
      </View>
    </Screen>
  );
}
