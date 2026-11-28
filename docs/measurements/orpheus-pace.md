# Orpheus pace measurement

Measured 2026-11-28 against OpenRouter `canopylabs/orpheus-3b-0.1-ft`.

**Sentence (20 words):** "You are standing in a bright open field where the morning sun gently touches each flower and warms the earth."

## Results

| Voice | Format | Speed sent | Speed field | Duration | PCM rate |
| --- | --- | --- | --- | --- | --- |
| orpheus-tara | mp3 | 0.75 | accepted | 6.35 s | — |
| orpheus-tara | mp3 | 0.88 | accepted | 7.21 s | — |
| orpheus-tara | mp3 | — (1.0 skipped) | accepted | 5.53 s | — |
| orpheus-tara | mp3 | 1.05 | accepted | 7.28 s | — |
| orpheus-tara | pcm | 0.75 | accepted | 7.42 s | 24000 Hz |
| orpheus-tara | pcm | 0.88 | accepted | 5.72 s | 24000 Hz |
| orpheus-tara | pcm | — (1.0 skipped) | accepted | 6.14 s | 24000 Hz |
| orpheus-tara | pcm | 1.05 | accepted | 6.66 s | 24000 Hz |
| orpheus-leah | mp3 | 0.75 | accepted | 7.24 s | — |
| orpheus-leah | mp3 | 0.88 | accepted | 6.25 s | — |
| orpheus-leah | mp3 | — (1.0 skipped) | accepted | 6.85 s | — |
| orpheus-leah | mp3 | 1.05 | accepted | 6.78 s | — |
| orpheus-leah | pcm | 0.75 | accepted | 6.40 s | 24000 Hz |
| orpheus-leah | pcm | 0.88 | accepted | 7.34 s | 24000 Hz |
| orpheus-leah | pcm | — (1.0 skipped) | accepted | 6.23 s | 24000 Hz |
| orpheus-leah | pcm | 1.05 | accepted | 6.23 s | 24000 Hz |

## Analysis

**Speed honoured?** **No — speed is ignored.**

The `speed` field is accepted (no HTTP 400/422), but duration does not correlate inversely with speed.
For Tara PCM, `0.88` produces the *shortest* audio (5.72 s) while `0.75` (slower) produces the *longest* (7.42 s).
For Leah PCM, `0.88` is *longer* than `0.75`. Both patterns are the reverse of speed-honoured behaviour.

Expected duration ratio at `speed=0.75` vs `speed=1.05` if honoured: ≥ 1.4×.
Observed ratio (Tara PCM): 7.42 / 6.23 ≈ 1.19×, within natural model variance.
No monotonic relationship between speed setting and audio length in either voice or format.

**PCM works?** Yes — both voices return raw 16-bit mono PCM at **24000 Hz**.

**Consequence for the app:**
- Orpheus voices should have `format: "pcm"` in `config/voices.json` so lines are stitched with real silence (pauses work).
- Orpheus voices should have `paceSupport: "ignores"` so `X-Speed-Applied: 0` is sent and the UI shows the note:
  *"Tara keeps her own pace; pauses are adjustable."*

## Notes

- Speed `1.0` is not sent (the app skips it, matching `tts.ts` behaviour; "— (1.0 skipped)" in Speed sent).
- "refused" = HTTP 400/422 on the speed field; "accepted" = field sent with no refusal (may still be ignored).
- MP3 duration is estimated from byte size at ~32 kbps; treat as approximate.
- PCM duration is exact: `byteLength / (rate × 2)` for 16-bit mono.

## Recommendations

1. **Do not build a time stretch.** The model's natural pace is consistent (~6–7 s per 20 words); stretching risks artefacts on a voice that already has a good natural cadence.
2. **Sample idea for Tim.** Record the script "I am calm and focused now." at `speed=0.75` with `pauseMs=2600` (Very slow, long pauses) in Tara — the stitched silence between lines will be audible and correct even though the speaking speed is unaffected. This demonstrates that Pauses work, Speed does not.
