import { useCallback } from "react";
import { Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { EXAMPLES, MAX_NAME, MAX_WANT, freeBanner } from "@/lib/create";
import { create, edit, load, reset, useCreate } from "../../src/create/session";
import { colors } from "../../src/theme";
import { Button, Gate, s } from "../../src/create/ui";
import { Screen } from "../../src/ui/Screen";

// Create, step 1: the wish. One tap makes the script and the recording (step 2 shows progress).
export default function Wish() {
  const c = useCreate();
  const router = useRouter();
  // Each visit: the draft, the count, and the voice may have changed in Settings.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );
  const go = () => {
    if (create()) router.push("/create/script");
  };

  return (
    <Screen title="Type what you want. Hear it as already yours.">
      <Text style={s.muted}>No sign-up. One tap. A short affirmation written and recorded for you.</Text>
      <View style={s.card}>
        <Text nativeID="want" style={s.muted}>What do you want?</Text>
        <TextInput
          accessibilityLabelledBy="want"
          aria-labelledby="want"
          style={[s.input, s.area]}
          multiline
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
          placeholder="Tim"
          placeholderTextColor={colors.muted}
          onChangeText={(name) => edit({ name })}
        />
        <Text style={s.muted}>
          Voice: <Text style={s.p}>{c.voiceName}</Text>
        </Text>
        <Button label="Create my manifestation" disabled={!c.want.trim()} onPress={go} />
        <View style={s.row}>
          <Text style={s.muted}>{freeBanner(c.used)}</Text>
          {c.used > 0 ? <Button small label="Reset demo" onPress={reset} /> : null}
        </View>
        {c.gate ? <Gate /> : null}
      </View>
    </Screen>
  );
}
