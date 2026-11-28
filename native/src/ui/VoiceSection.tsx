// Collapsed "Voice" section for the create screen and library item screen.
// Shows the current choice as a one-line summary; expands to let the user pick
// a voice (with sample playback), speed and cadence.
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CADENCE_OPTIONS, SPEED_OPTIONS, voiceOptionLabel, type CadenceStep, type SpeedStep } from "@/lib/voice/options";
import { resolveVoiceId, useVoices } from "../seams/voiceList";
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
  const { voices, defaultId } = useVoices();
  const pickableVoices = voices.filter((v) => v.generate);

  // Resolve stale stored id against server list; fall back to server default.
  const effectiveId = resolveVoiceId(voiceId, pickableVoices) ?? defaultId;
  const resolvedName = pickableVoices.find((v) => v.id === effectiveId)?.name ?? voiceName;

  // When server list loads and the stored id is gone, update the parent once.
  useEffect(() => {
    if (pickableVoices.length > 0 && effectiveId !== voiceId) {
      onPickVoice(effectiveId, resolvedName);
    }
    // onPickVoice is recreated each render; omit it to avoid infinite loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveId, voiceId, pickableVoices.length]);

  const summary = voiceOptionLabel(resolvedName, speedStep, cadenceStep);

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
            {pickableVoices.map((v) => (
              <OptionRow
                key={v.id}
                label={v.name}
                note={v.desc ?? v.label}
                selected={effectiveId === v.id}
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
