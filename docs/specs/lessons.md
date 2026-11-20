# Lessons: Neville quote sets

Status: proposed, 2026-11-20. Tracks issue #43. The PRD (Google Doc "Neville") is the source of truth for scope. This is a product spec, not a technical design.

> **Rights gate.** A lesson is Neville's exact words and nothing else, so the rights decision decides whether this ships at all. Tim has not yet ruled (#43, options a, b and c). Until he does, lesson audio exists only as a dev sample, and no lesson content is merged for production.

## Requirement

Tim, 2026-11-20, verbatim, in order:

1. "Add as a requirement to the Neville app is to have some AI lessons on "how" to approach one's thining thorugh clear Neville quotes. For example, this PDF should be used as the basis for key short audio quotes: https://realneville.com/pdf/lesson1.pdf"
2. "no need to have AI explanations, we need strong quotes that allow someone to remember how to apply these big ideas in addition to hearing the actual programming"
3. "Yes, provide me the strongest quotes, I believe they are a short set before or after a playlist and we have an option just to be a neville learning session"

Manifestations are the programming. Lessons are short, memorable reminders, in Neville's own words, of *how* to hold the big ideas while you listen.

## What a lesson is

A **quote set**: Neville's exact words only, read by one calm voice.

| Rule | Value |
|---|---|
| Content | 5 to 8 short quotes per source lesson, ranked strongest first. No AI-written text, no narrator, no explanations. |
| Quote length | At most about 3 sentences each. Each one says how to apply one big idea. |
| Chosen for | Recall and use the same day, not to cover the whole source |
| Big-idea label | 3 to 5 words per quote, shown on screen, never spoken (for example "Make elsewhere here, now") |
| Voice | One fixed calm voice for all quotes, chosen per mode. The dev sample uses Gemini Vindemiatrix, which honours pace and style. |
| Delivery | The mode's pace and music. A longer pause between quotes than between manifestation lines (sample: 3.5 s). |
| Attribution | On screen: "Neville Goddard, *Five Lessons*, Lesson 1 (1948), p. 9". Kept with each quote in the metadata. |
| Source text | Original transcript only (for lesson 1, the 1948 class), never a modern edition with its own additions |
| Recording | Recorded once per quote and stored. Quotes are curated, not per listener, so a play costs nothing. |

Each quote is stored and recorded on its own, so a set can be cut to a different length or mix for each mode and placement.

## Where quotes play

### 1. Before or after a playlist (decided)

A **short quote set** plays before or after the person's own playlist. A setting on each playlist offers **Before**, **After** or **Off**.

- **Before** frames the session: 2 or 3 quotes, about 30 to 60 seconds, then the manifestations.
- **After** lets it settle: 2 or 3 quotes once the last manifestation ends, with the music carrying on.
- Default: **Before** in Calm and Active, **After** in Sleep, so a sleep session ends on Neville's words rather than starting on them.
- The quotes rotate through the ranked set, so the same pair doesn't play every night. The strongest quotes come up most often.

### 2. Neville learning session (decided)

A standalone session that is **quotes only**, with no manifestations, in Calm, Sleep or Active.

- It plays the whole ranked set for a lesson (5 to 8 quotes, about 2 to 3 minutes), or several lessons back to back.
- It uses the mode's pace, music and gap, as a playlist does.
- In Sleep it can loop with the sleep timer.

### Mode rules

- **Calm.** Any quote.
- **Sleep.** Very slow pace with longer gaps. Prefer quotes tagged for rest, such as lesson 1's quotes 2, 6 and 7.
- **Active.** Brisk pace. Leave out quotes tagged `needsStillness`, which ask the listener to lie still or become drowsy (lesson 1 quote 6). Prefer quotes about action, such as lesson 1's quotes 1, 4 and 5.

### Options considered and not chosen

- **A quote between every track.** Interrupts the programming too often. It may come back later as an option, "one quote every N tracks".
- **Quotes in the library like manifestations.** The learning session already covers playing quotes alone. Lessons appear in the library as **sets**, which start a learning session, not as single tracks.

## Read-along

While a quote plays, the screen shows the quote, its big-idea label and its attribution. The text cannot be edited.

## How quote sets are made

1. **A person picks the quotes** from the source and ranks them, with page references and big-idea labels. See `lessons/lesson-01.md`.
2. **A person reviews the set** against the gates below.
3. **Each quote is recorded** with the existing voice pipeline (OpenRouter, `lib/server/tts.ts`) in the mode's pace and tone, then stored.

The AI writes nothing that is spoken. At most it may suggest candidate quotes for a person to choose from.

## Human review gates (required)

Marked **[REVIEW]** in each lesson file. Nothing is recorded for production until every item below is signed off by a person.

- **[REVIEW: rights]** Tim's decision on #43 allows the use. Each quote is checked word for word against the source, with the page given.
- **[REVIEW: medical]** No quote ties health or illness to belief or advises against treatment. Lesson 1 page 5 ("Pills will not do it") and page 7 ("If you are now ill") are left out.
- **[REVIEW: financial]** No quote promises money or wealth. Lesson 1 page 7 ("roll in wealth") is left out.
- **[REVIEW: outcome claims]** No success rates or guarantees: lesson 1 page 10 ("35 out of a class of 135", "What you feel that you have, you will have") is left out. Where a chosen quote states Neville's own claim, it is shown as his, and the app adds nothing to it.
- **[REVIEW: religion]** Lesson 1 reads the Bible as allegory and calls consciousness God. Quotes that need that frame to make sense are left out. Neutral quotes are preferred.
- **[REVIEW: tone]** Listen once in each mode the set is offered in.

## Out of scope for now

- Spoken AI explanations or commentary of any kind (dropped by Tim on 2026-11-20)
- Quote sets the user creates
- Sources other than Neville
- Quizzes or progress tracking

## Open questions

1. **Rights (#43).** Option (a), (b) or (c). Recommended: (a), short verbatim quotes, plus an hour of a lawyer's time on when *Five Lessons* was first published. This decides whether the feature ships.
2. **Quote voice.** One voice in every mode, or one per mode? The sample uses Gemini Vindemiatrix in Calm.
3. **Spoken attribution.** Should a set open with a single spoken line naming Neville, such as "Neville Goddard, 1948"? That would be the only words in a set that are not his. Not done in the sample.
4. **How many sets at launch?** *Five Lessons* gives five, one per night of the 1948 class, if (a) holds.
5. **PRD.** Add quote sets to the PRD and to `prd-coverage.md` once Tim agrees with this shape.
