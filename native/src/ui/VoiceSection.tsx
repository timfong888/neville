// Collapsed "Voice" section for the create screen and library item screen.
// Shows the current choice as a one-line summary; expands to let the user pick
// a voice (with sample playback), speed and cadence.
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CADENCE_OPTIONS, CURATED_VOICE_IDS, SPEED_OPTIONS, voiceOptionLabel, type CadenceStep, type SpeedStep } from "@/lib/voice/options";
import { useVoices } from "../seams/voiceList";
import { useSample } from "../create/useSample";
import { OptionRow, SmallButton } from "./OptionRow";
import { colors, radius, space, type as ty } from "../theme";

type Props = {
  voiceId: string;
  voiceName: string;
  speedStep: SpeedStep;
  cadenceStep: CadenceStep;
  onPickVoice: (id: string, name: string) => void;
  onPickSpeed: (id: SpeedStep) => void;
  onPickCadence: (id: CadenceStep) => void;
};

export function VoiceSection({ voiceId, voiceName, speedStep, cadenceStep, onPickVoice, onPickSpeed, onPickCadence }: Props) {
  const [open, setOpen] = useState(false);
  const { playing, toggle, stop } = useSample();
  const { voices } = useVoices();
  const curatedVoices = voices.filter((v) => CURATED_VOICE_IDS.includes(v.id) && v.generate);

  const summary = voiceOptionLabel(voiceName, speedStep, cadenceStep);

  const close = () => {
    stop();
    setOpen(false);
  };

  return (
    <View style={s.wrap}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Voice settings: ${summary}. Tap to ${open ? "collapse" : "expand"}.`}
        onPress={() => (open ? close() : setOpen(true))}
        style={s.header}
      >
        <Text style={ty.muted}>Voice</Text>
        <Text style={[ty.body, s.summary]} numberOfLines={1}>{summary}</Text>
        <Text style={ty.muted}>{open ? "▲" : "▼"}</Text>
      </TouchableOpacity>

      {open && (
        <View style={s.panel}>
          <Text style={ty.muted}>Choose a voice — samples are pre-made, so listening is free.</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Voice" style={s.list}>
            {curatedVoices.map((v) => (
              <OptionRow
                key={v.id}
                label={v.name}
                note={v.desc ?? v.label}
                selected={voiceId === v.id}
                onPress={() => onPickVoice(v.id, v.name)}
                right={
                  <SmallButton
                    label={playing === v.id ? "Stop" : "Play"}
                    a11y={`${playing === v.id ? "Stop" : "Play"} sample of ${v.name}`}
                    onPress={() => toggle(v.id, v.sample)}
                  />
                }
              />
            ))}
          </View>

          <Text style={[ty.muted, s.sectionLabel]}>Speed</Text>
          <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel="Speed">
            {SPEED_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: speedStep === opt.id }}
                accessibilityLabel={opt.label}
                style={[s.chip, speedStep === opt.id && s.chipOn]}
                onPress={() => onPickSpeed(opt.id)}
              >
                <Text style={[s.chipText, speedStep === opt.id && s.chipTextOn]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[ty.muted, s.sectionLabel]}>Pauses</Text>
          <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel="Pauses">
            {CADENCE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: cadenceStep === opt.id }}
                accessibilityLabel={opt.label}
                style={[s.chip, cadenceStep === opt.id && s.chipOn]}
                onPress={() => onPickCadence(opt.id)}
              >
                <Text style={[s.chipText, cadenceStep === opt.id && s.chipTextOn]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, backgroundColor: colors.card },
  summary: { flex: 1 },
  panel: { padding: space.md, gap: space.md, backgroundColor: colors.bg },
  list: { gap: space.sm },
  sectionLabel: { marginBottom: -space.sm / 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipOn: { borderColor: colors.text, backgroundColor: colors.text },
  chipText: { color: colors.text, fontSize: 14 },
  chipTextOn: { color: colors.bg },
});
