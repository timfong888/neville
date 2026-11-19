# Consented voice library

Status: plan only. No code. Answers Tim's question of 19 Nov 2026: "What is the process for creating clones of voices that can be part of the library for usage-based options." Issue: #11. PRD: https://docs.google.com/document/d/1fBH5TIdn_nzCYWX4KSIH9MoJWmm_X4_tYLbhw-mTyWc/edit

Not legal advice. Have a lawyer review the release (section 2) before the first voice is signed.

## 0. Rules that do not bend

1. **No cloning of a real or famous person** (Neville Goddard, Tony Robbins, celebrities, fictional characters voiced by a real actor) **without their, or their estate's, documented written consent.** "Sounds like" prompts and look-alike voices are covered by the same rule.
2. **Every library voice has a signed release on file before its audio exists in the product.** No release, no voice id.
3. **A user may clone only their own voice**, with a live consent check (section 5).
4. Revocation always works: one switch removes a voice from the product (section 4).

## 1. Two ways a voice gets in

| Route | Who | Use |
|---|---|---|
| A. Hired voice talent | A voice actor we pay and who signs the release | The curated library: the voices everyone can choose |
| B. A user's own voice | Any signed-in user, for themselves only | Private to that account; never in the shared library |

Recommendation: build A first. It carries the revenue share and the quality bar, and it is the answer to "voices that can be part of the library". B is a later paid feature.

## 2. Hiring voice talent and the release

**Process**

1. Brief: calm, low-energy, intimate guide voice (the delivery described in issue #10). Audition with the same 60-second affirmation script.
2. Check identity (government ID matched to the person recording) and that they are free to license their voice: not under an exclusive deal, not in a union agreement that forbids it. SAG-AFTRA members need their own contract check.
3. Sign the release (below) **before** recording.
4. Record to the spec in section 3, with the consent statement spoken on tape.
5. We test the clone, send the actor the clip, and the actor approves in writing before it goes live.
6. Store the signed release and the consent recording with the voice record (section 4).

**The release must cover, in plain language and specific terms**

- **AI cloning**: the voice may be used to train or condition a synthetic voice, and by which providers (named, or "our processors").
- **Uses**: generating spoken manifestations and affirmations inside Neville and its apps, including shared links. California AB 2602 makes digital-replica clauses unenforceable unless uses are described with reasonable specificity or the person had a lawyer or union. Name the uses; do not write "any purpose".
- **Commercial use**: users pay for minutes spoken in this voice.
- **Exclusions**: no political, sexual, hateful, medical-claim or endorsement content; no use in other products; no sale or sublicense of the voice.
- **Term and territory**: for example 3 years, worldwide, renewable.
- **Revocation**: the actor may revoke on 30 days' written notice. We stop new generation within 7 days, delete reference audio and provider voices within 30, and do not use the voice again. Recordings already made and saved by users: decision needed (see section 8).
- **Revenue share**: rate, how it is measured (section 6), payment dates, statements, audit right.
- **Name and credit**: the voice's public name; whether the actor is named.
- **Warranties**: the actor owns the voice and the recordings; we warrant security and to delete on request.
- **Deletion and data**: reference audio is kept in private storage and not used to train anything else.
- **Governing law, signatures, date.**

## 3. Recording requirements

Match the clone method; record the longer set once so either works.

| Item | Instant clone | Professional clone |
|---|---|---|
| Audio | 1 to 3 clips of 10 to 30 s each, plus a transcript | 30 min or more of clean speech (ElevenLabs states 30 to 180 min) |
| Format | 48 kHz, 24-bit WAV, mono | same |
| Room | Quiet, dry room or booth; no reverb, fans or traffic | same |
| Mic | Large-diaphragm condenser or good dynamic, pop filter, steady distance | same |
| Content | Calm, low-energy affirmation-style reading, present tense, no acting or commercial voice | same, with varied sentence lengths and pauses |
| Also record | The spoken consent statement | same, plus provider verification samples |

The consent statement, read on tape: "My name is ___. On ___ I agree that Neville may create and use an AI voice from my voice recordings, as set out in the agreement I signed."

Reading in the delivery we want matters: a clone copies the style of its training audio, so a commercial-sounding recording gives a commercial-sounding voice.

## 4. How a voice id is stored and offered

The library today is `config/voices.json`: `id`, `provider`, `model`, `voice`, `name`, `tier`, `enabled`, `generate`. Cloned voices extend it; nothing about how the browser picks a voice changes (it sends an id, the server resolves model and voice).

**Keep the private part server-only.** `config/voices.json` is imported by `lib/voices.ts`, which the browser bundle includes, so anything put there is public. Release ids, reference transcripts, provider voice ids and revenue-share rates must never go in it. Split the record in two:

- **Public voice entry** (stays in `config/voices.json`, safe for the browser): `id`, `name`, `label`, `tier`, `sample`, `enabled`, `generate`, `source`, `priceMultiplier`.
- **Private clone registry** (a `server-only` module, then the database after step 2 of issue #3): every other field below. The server joins the two by `id`; the browser only ever sees the public entry.

New fields per library voice (the private ones live in the registry):

| Field | Meaning |
|---|---|
| `source` | `stock`, `talent` or `self` |
| `talentId`, `releaseId` | Who it is and the signed release (file in private Blob; never public) |
| `consentAudioRef` | The recorded consent statement |
| `cloneMode` | `reference` (stateless) or `provider_voice` (persistent id) |
| `referenceClips` | Private Blob paths + transcripts, for `reference` mode |
| `providerVoiceId` | The provider's id, for `provider_voice` mode (ElevenLabs, Fish `reference_id`) |
| `model` | The model that speaks it |
| `priceMultiplier` | Credit multiplier (section 6) |
| `revShareBps` | Talent share in basis points |
| `status` | `draft`, `approved`, `live`, `suspended`, `revoked` |
| `termEnds` | When the release lapses |

Two ways the provider holds the voice:

- **Stateless (OpenRouter `input_references`)**: each request carries 1 to 3 reference clips (base64 or URL, up to 15 MiB). No clone step, no clone fee, no subscription; the server reads the clips from private Blob and attaches them. Works on Fish and HeyGen models through OpenRouter, using the key we already have. Cost: bigger requests.
- **Persistent**: the provider returns an id we store (`providerVoiceId`). Faster requests; ties us to that provider's account and terms.

Offering it: `generate: true` and `status: live` put the voice in Settings next to the stock voices with a "Studio voice" label, the talent's name if agreed, a pre-made sample, and its price. The server never takes a model, voice or clip from the browser, as now (`resolveVoice`).

**Revocation**: set `status: revoked`. `resolveVoice` then returns the default, so a device that had chosen it falls back with no error. A job deletes the reference clips and the provider voice, and logs the date. Test this path before the first voice goes live.

## 5. A user cloning their own voice (later)

- Only on a paid plan, only for the signed-in account, only usable by that account.
- Liveness check: the user reads a random phrase shown on screen, and we compare it to the uploaded sample, so a stolen recording of someone else is not enough. Provider checks (ElevenLabs professional cloning has its own verification) add to it, not replace it.
- Checkbox with plain wording: "This is my own voice, and I agree to these terms", stored with time and account id.
- Never share a self-cloned voice into the library. Delete it with the account.
- Block cloning when the sample matches a library or known public voice (provider tools, or a manual review queue at first).

## 6. Usage-based pricing options

Per-minute cost of the speech itself at about 825 characters a minute. Stock figures come from the research in issue #3 (list prices, not re-checked by this plan).

| Route | Clone fee | Speech, per minute | Needs a subscription at the provider |
|---|---|---|---|
| OpenRouter `input_references`, Fish or HeyGen model | none | HeyGen Turbo about $0.004; others per model | no |
| Fish Audio direct (`reference_id`) | free | $15 per 1M UTF-8 bytes, about $0.012 | no (own key) |
| MiniMax direct | $1.50 per clone | $60 per 1M characters, about $0.05 | no |
| ElevenLabs | n/a | current rate not verified here | yes: instant clone needs Starter or higher, professional needs Creator or higher |
| Cartesia, Resemble | n/a | not verified here | cloning needs a subscription (per issue #3) |

Conclusion for Tim's earlier question: usage-based billing with clones is possible without a provider subscription on the OpenRouter and Fish routes.

**Options for what the customer pays** (pick one; they combine):

1. **Credits by the minute, with a voice multiplier.** Stock voice 1x, studio voices 2x to 3x. Simple, usage-based, matches the ledger planned in issue #3.
2. **Pay-as-you-go packs, no subscription.** Buy minutes; studio voices use more of them.
3. **Subscription includes N studio-voice minutes**, then credits. (Issue #3 has a subscription for allowance.)
4. **Free tier: stock voices only**; studio voices need credits. Protects the free-try budget.

**Talent revenue share** (decide in section 8): either a share of gross margin on that voice's minutes (for example 20 to 30% of price minus provider cost), or a flat monthly minimum guarantee against that share. Measure it from the usage ledger: minutes generated per voice per month, not plays.

## 7. App Store and right-of-publicity constraints

- **Right of publicity.** Voice is protected in several US states. Tennessee's ELVIS Act names voice and can reach tools whose main purpose is making unauthorised replicas. California AB 2602 makes digital-replica contract terms unenforceable unless the uses are described specifically or the person was represented. Federal: the NO FAKES Act passed Senate Judiciary on 18 June 2026 but is not law at the time of writing; check Congress.gov. The release in section 2 is built to satisfy these; a lawyer should confirm for each state where talent lives.
- **Estates.** A dead person's voice needs the estate's written license. Neville Goddard's voice is excluded until, and unless, a documented estate licence exists. Writings in the public domain are a separate question from voice.
- **Providers.** Each provider's terms require that we hold the rights to a cloned voice; the release is our proof.
- **Apple App Store (when the Expo apps ship).** I found no Apple rule on voice cloning specifically. Relevant: guideline 1.2 for user-generated content (reporting, blocking, moderation) if users can share; the disclosure and consent rules for sending personal data to third-party AI (5.1.2(i)), which covers a user's uploaded voice; and in-app purchase for digital goods (3.1.1), so credits sold in an iOS app would be IAP, not Stripe. Out of scope here; revisit before the iOS build. Re-read Apple's current text then.
- **Disclosure.** Label studio voices as AI voices in the app, on shared pages, and in the store listing.

## 8. Decisions needed from Tim

1. Launch with hired talent (recommended), or start with user self-clones only?
2. Revenue share: gross-margin percentage or flat fee plus minimum; the rate.
3. On revocation, do saved recordings stay playable for the users who made them, or are they deleted? (Recommendation: keep what users already saved, stop new ones, and say so in the release.)
4. How many launch voices (suggest 3: two female, one male), and who sources and contracts the talent.
5. Which route for the first clones: OpenRouter `input_references` on a Fish or HeyGen model (recommended; no clone fee, no subscription), or Fish direct if per-request clips prove slow.
6. Who reviews the release, and the budget for it.

## 9. Proposed PRD changes

For Tim to accept or reject. The PRD body has not been edited. These are written for insertion as blue text with a comment in the Google Doc: this session's tools cannot format the doc, so the exact text is here.

1. **User story 2** ("I want to be able to select from a list of voices"), add: "Some voices are studio voices made with a voice actor's signed consent. They cost more minutes and are labelled as AI voices."
2. **New section under Technology, "Voice library and consent"**: "Every cloned voice is made only from a person's own voice with their signed written consent, or their estate's. We do not clone real or famous people, living or dead, without that consent. A voice can be withdrawn at any time and stops being offered."
3. **New user story**: "As a user, I can pay by the minute for studio voices, with no need for a subscription to use them."
4. **New user story**: "As a user on a paid plan, I can make a private voice from my own recording, after confirming it is my voice."
5. **Delivery**, add under Voice Generation: "The voice should sound like a calm guide, not an advertisement. The listener can set pace and tone."
