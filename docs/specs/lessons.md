# Lessons

Status: proposed, 2026-11-20. Tracks issue #43. The PRD (Google Doc "Neville") is the source of truth for scope. This is a product spec, not a technical design.

> **Rights gate.** Lessons quote Neville Goddard word for word. Tim has not yet ruled on whether that is allowed (#43, options a, b and c). Until he does, lesson audio exists only as a dev sample, and no lesson content is merged for production.

## Requirement

Tim, 2026-11-20: "Add as a requirement to the Neville app is to have some AI lessons on "how" to approach one's thining thorugh clear Neville quotes. For example, this PDF should be used as the basis for key short audio quotes: https://realneville.com/pdf/lesson1.pdf"

Manifestations tell you *what* to hear. Lessons teach *how* to think while you hear it, in Neville's own words.

## What a Lesson is

A Lesson is a 2 to 4 minute audio piece with this shape:

1. **Title line.** The narrator names the lesson and its one theme, for example "Assume the feeling of the wish fulfilled".
2. **2 to 4 quotes.** Each one has three parts:
   - a one-line lead-in from the narrator ("First, where to put your attention.");
   - the quote, word for word, read in a **second calm voice** that is used only for quotes, so the listener always knows when Neville is speaking;
   - a short AI-written explanation, about 2 to 4 sentences, of how to apply the quote to your thinking *today*. It is concrete and in the second person, and it promises no outcome.
3. **Practice.** One line that tells you what to do today or tonight.

| Rule | Value |
|---|---|
| Length | 2 to 4 minutes at the Slow pace |
| Themes | One per lesson |
| Quotes | 2 to 4, each at most about 3 sentences |
| Quote share | Under about a third of the running time. The explanation is the bulk of the lesson. |
| Voices | Narrator: the listener's chosen voice. Quotes: one fixed calm voice, chosen per lesson set and different from the narrator. |
| Attribution | Spoken ("Neville said") and shown on screen: "Neville Goddard, *Five Lessons*, Lesson 1 (1948)", with page references in the metadata. |
| Source text | Take quotes only from the original transcript (for lesson 1, the 1948 class), never from a modern edition with its own additions. |

## Where Lessons live

- **Library.** Lessons appear in the library next to manifestations, marked as Lessons, with their title, theme, length and source.
- **Playlists.** A lesson can be added to any playlist like a manifestation. A good default is a short "Lesson then manifestations" playlist: the lesson sets the frame and the person's own manifestations follow.
- **Modes.** Lessons play in all three modes (Calm, Sleep, Active) with that mode's pace, tone, music and gap. One lesson can be recorded per mode, or recorded in Calm and offered in all three.
  - In **Sleep**, the practice line comes last and the music carries on after it, so the lesson ends drowsy.
  - In **Active**, quotes that ask you to lie still or become drowsy are left out or swapped. Lessons have a tag for this (`needsStillness`).
- **Read-along.** The script is shown line by line as it plays, as for manifestations, with quotes styled differently and their attribution shown.
- **Not editable.** People can't edit a lesson's script. Lessons are curated content, not user content.

## How lessons are made

1. **A person picks the quotes.** Quotes come from a candidate list drawn from the source. Each list gives page references and is checked against the source (see `lessons/lesson-01.md`).
2. **The AI writes the explanations and practice.** It writes from the chosen quotes and the theme, under the rules below.
3. **A person reviews the whole script.** See the review gates.
4. **The script is recorded** with the existing voice pipeline (OpenRouter, `lib/server/tts.ts`), using the mode's pace and tone. It is stored as a fixed recording: lessons are recorded once, not per listener, so they cost almost nothing per play.

Script rules for the AI-written parts:
- Second person, present tense, calm, with no exclamation marks and no sales words. These are the same rules as manifestations, in `lib/prompt.ts`.
- Apply the quote to everyday thinking: attention, assumption, worry, self-concept, imagination, rest.
- Never promise an outcome ("this will heal you", "money will come"). Neville's words are quoted as his. The app does not repeat them as guarantees.

## Human review gates (required)

Marked **[REVIEW]** in each lesson script. Nothing is recorded for production until every item below is signed off by a person.

- **[REVIEW: rights]** Tim's decision on #43 allows the use. Each quote is checked word for word against the source, with the page given.
- **[REVIEW: medical]** No medical claims, whether in a quote or in the explanation. Leave out passages that tie illness or health to belief, such as Lesson 1 page 5 ("Pills will not do it. Diet or climate will not do it.") and page 7 ("If you are now ill and you become well").
- **[REVIEW: financial]** No financial claims. Leave out passages about money or wealth outcomes, such as Lesson 1 page 7 ("suddenly you roll in wealth").
- **[REVIEW: outcome claims]** No success rates or guarantees. Leave out passages like Lesson 1 page 10 ("at least 35 out of a class of 135") and "What you feel that you have, you will have."
- **[REVIEW: religion]** Lesson 1 reads the Bible as allegory and calls consciousness God. Quotes that need that frame to make sense are left out unless the lesson is about that frame. Neutral quotes are preferred.
- **[REVIEW: tone]** Listen once in each mode the lesson is offered in.

## Out of scope for now

- Lessons the user creates, or AI picking quotes with no person involved.
- Lessons from any source but Neville.
- A quiz or progress tracking.

## Open questions

1. **Rights (#43).** Option (a), (b) or (c). Recommended: (a), short verbatim quotes, plus an hour of a lawyer's time on when *Five Lessons* was first published.
2. **Quote voice.** One fixed voice for all of Neville's quotes, or one that suits each narrator? The dev sample uses HeyGen "Lucian" for quotes and "Nadine" as narrator.
3. **How many lessons at launch?** *Five Lessons* gives five themes, one per night of the 1948 class. That is enough for a first set if (a) holds.
4. **PRD.** Add Lessons to the PRD and to `prd-coverage.md` once Tim agrees with this shape.
