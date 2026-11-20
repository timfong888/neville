# Lesson 1 dev samples

Dev audio for issue #43. The app does not serve these files: they live under `docs/`, not `public/`. Tim asked on 2026-11-20 that every voice and file be kept ("don't lose the information or the files, we can use all of the voices"), so nothing here is deleted.

| File | Voice | What it is |
|---|---|---|
| `lesson-01-quotes-calm-sadaltager.mp3` | Gemini Sadaltager, the **default** quote voice | All 9 quotes, Calm music, 3.5 s gaps, 2 min 33 s |
| `lesson-01-quotes-calm-george.mp3` | ElevenLabs George, an alternate | All 9 quotes, Calm music, 2 min 22 s |
| `lesson-01-clip1-calm-{sadaltager,george,daniel}.mp3` | C, A and B | About 15 s audition clips of quote 1, used for Tim's pick |
| `lesson-01-quotes-calm-vindemiatrix.mp3` | Gemini Vindemiatrix | Superseded first take: quotes 1 to 6, recorded before the lecturer-voice brief. Kept for the record. Its JSON uses the older metadata shape. |

Each `.json` file holds the voice, model, prompt, quotes and cost of its clip. `spentUsd` reads OpenRouter's usage figure, which updates late, so older files show 0. Newer files also record `committedUsd`, the recorder's own estimate.

Re-record with `scripts/record-lesson-sample.mjs --voice=<sadaltager|george|daniel|vindemiatrix> [--clip=N]`.
