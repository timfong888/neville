import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Redirect, Stack, useRouter } from "expo-router";
import { freeLeft } from "@/lib/create";
import { leave, newVariation, useCreate } from "../../src/create/session";
import { Button, Gate, s } from "../../src/create/ui";
import { Screen } from "../../src/ui/Screen";

// Create, step 2: the script. While the one request runs it shows progress; then the lines,
// or the server's refusal with a script the listener can still use.
export default function Script() {
  const c = useCreate();
  const router = useRouter();
  // The request does both; tick the first step after a moment.
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!c.making) return setStep(0);
    const t = setTimeout(() => setStep(1), 3000);
    return () => clearTimeout(t);
  }, [c.making]);

  if (c.making) {
    const steps = ["Writing your script in “You” statements", `Recording it in the voice of ${c.voiceName}`];
    return (
      <Screen title="Making it yours…">
        <Stack.Screen options={{ title: "Your script" }} />
        <Text style={s.muted}>This takes up to half a minute. Keep this page open.</Text>
        <View style={s.card} accessibilityLiveRegion="polite">
          {steps.map((label, i) => (
            <Text key={label} style={[s.line, i === step && s.now]}>
              {i < step ? "✓ " : i === step ? "… " : ""}
              {label}
            </Text>
          ))}
        </View>
      </Screen>
    );
  }
  // Opened directly, or after a reload: there is nothing to show yet.
  if (!c.made) return <Redirect href="/create" />;

  const back = () => {
    leave();
    router.dismissTo("/create");
  };
  return (
    <Screen title={c.made.title}>
      <Stack.Screen options={{ title: "Your script" }} />
      {c.made.note ? <Text style={s.muted}>{c.made.note}</Text> : null}
      <View style={s.card}>
        {c.made.lines.map((l, i) => (
          <Text key={i} style={s.line}>{l}</Text>
        ))}
      </View>
      <Text style={s.muted}>
        {c.made.recording ? `Recorded in the voice of ${c.made.recording.voiceName}. Not kept unless you save it.` : "Nothing was recorded."}
      </Text>
      <View style={s.row}>
        <Button label={c.made.recording ? "▶ Listen" : "▶ Read along"} onPress={() => router.push("/create/recording")} />
        <Button small label="New variation" onPress={newVariation} />
        <Button small label="← Create another" onPress={back} />
      </View>
      {c.gate || freeLeft(c.used) === 0 ? <Gate /> : null}
    </Screen>
  );
}
