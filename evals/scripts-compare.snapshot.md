# Script setup, old vs new (#170)

Prompt lesson1-v2. Effort low. Judge google/gemini-2.5-flash (0 to 2). Regenerate with `npm run eval:compare`.

| setup | model | from model | words | visual | parses | tense slips | slogans | sexual terms | cost per script | time |
|---|---|---|---|---|---|---|---|---|---|---|
| old | google/gemini-2.5-flash-lite | 13/13 | 63 | 1.23 | 1.92 | 8 | 0 | 0 | $0.0001 | 0.7 s |
| new | x-ai/grok-4.6, anthropic/claude-sonnet-5.5 | 13/13 | 129 | 2.00 | 1.92 | 3 | 0 | 0 | $0.0084 | 15.5 s |

## old · neutral · I want to own a small house by the sea

model: google/gemini-2.5-flash-lite · source: model · 75 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (All sentences are present tense and build a clear scene.)

> You own your small house by the sea.
> The salt air drifts through your open window.
> You feel the cool wood floor underfoot.
> You see the gentle waves from your porch.
> This small house by the sea is yours.
> You hear the soft rhythm of the ocean.
> It is so peaceful here.
> You have a deep sense of gratitude.
> Thank you, thank you.
> Your beautiful home is here.
> Thank you, thank you.
> It is done.

## new · neutral · I want to own a small house by the sea

model: x-ai/grok-4.6 · source: model · 111 words · $0.0124 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent, vivid, present-tense script.)

> You stand at the open window of your small house by the sea, evening air cool on your face.
> The house by the sea is yours.
> Salt and wood smoke mix, last light gold on the walls.
> You hold a cool glass and hear the slow wash of waves below.
> Your other hand rests on the painted sill, wood smooth under your fingers.
> A lamp throws a quiet circle on the floor.
> The house by the sea is yours.
> You are the one who lives here now, chest warm.
> You thank this quiet evening for the house you own.
> The house by the sea is yours.
> Thank you.
> It is done.

## old · neutral · I want to heal my relationship with my sister

model: google/gemini-2.5-flash-lite · source: model · 72 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 0 (Some images, but also abstractions like 'this healing')

> You and your sister share an easy smile.
> Your sister laughs, a warm, familiar sound.
> You feel this closeness, deeply settled.
> Your sister calls, and you answer.
> This healing is so natural now.
> Your sister's voice is soft and loving.
> You feel this peace, truly present.
> This healing is a gentle unfolding.
> You embrace this sisterly connection.
> This healing flows between you both.
> Thank you. Thank you. Thank you.
> It is done.

## new · neutral · I want to heal my relationship with my sister

model: x-ai/grok-4.6 · source: model · 123 words · $0.0084 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent detail, all present tense and grammatical.)

> Your sister stands beside you in a cream sweater, dark hair loose on her shoulders, brown eyes easy as she looks at you.
> Your friend notices and says it is good to see you two like this again.
> You feel her hand rest on your shoulder and the warmth in your chest.
> You hear her laugh close by and the clink of cups on the wooden table.
> You and your sister are close again.
> Soft kitchen light lies on the grain of the table and the air smells of coffee.
> You and your sister are close again.
> You are the sister who sits easy with her.
> Thank you for this ease between you.
> You and your sister are close again.
> It is done.

## old · neutral · I want to finish writing my book

model: google/gemini-2.5-flash-lite · source: model · 62 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 3 (Sentences 4, 5, 6 are past or future tense.)

> You hold the finished book.
> You feel the weight of the book.
> Your book is now complete.
> You sent the manuscript to your agent.
> She replies with her congratulations.
> This book is finally done.
> You feel a deep peace.
> Your book is now complete.
> This book is finally done.
> You feel so much gratitude.
> You feel so much gratitude.
> It is done.

## new · neutral · I want to finish writing my book

model: x-ai/grok-4.6 · source: model · 130 words · $0.0079 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent imagery and all sentences are clear.)

> You rest the last warm page on the stack and the paper rasps softly under your thumb.
> Your book is finished.
> Late light lies on the title page where your name already stands in clean black type.
> You close the folder and the cardboard is smooth and a little heavy in both hands.
> A friend in the doorway looks at you with an easy smile and says your name as if the work is already known.
> Your book is finished.
> You lift the mug and the coffee smells familiar while the quiet of the kitchen holds the whole story.
> You are the writer who has completed the book.
> Your book is finished.
> Thank you for this ordinary evening that only exists after the last chapter is done.
> It is done.

## old · neutral · I want to feel calm and confident when I speak in public

model: google/gemini-2.5-flash-lite · source: model · 61 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 0 (A few images, but mostly abstractions)

> You speak with a quiet confidence.
> Your voice is steady and clear.
> You feel calm as you speak.
> You feel calm.
> Your words flow easily now.
> You hold the microphone with ease.
> You feel calm and confident.
> You speak with a quiet confidence.
> A deep peace fills you.
> Thank you for this feeling.
> Thank you for this feeling.
> It is done.

## new · neutral · I want to feel calm and confident when I speak in public

model: x-ai/grok-4.6 · source: model · 97 words · $0.0133 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all sentences are clear.)

> You sit in the armchair this quiet evening, warm lamplight on the floor.
> Cool air from the window touches your face.
> You feel calm and confident when you speak in public.
> You hold the warm mug and smell mint tea.
> Your shoulders rest and your breath is even.
> You are the speaker with a clear, steady voice.
> The clock ticks in the hush of the house.
> You feel calm and confident when you speak in public.
> Thank you for this calm that is yours.
> You feel calm and confident when you speak in public.
> It is done.

## old · neutral · I want to sleep deeply through the night

model: google/gemini-2.5-flash-lite · source: model · 62 words · $0.0001 · visual 0/2 · parses 1/2 · tense slips 2 (No fog or grogginess at all is not a sentence.)

> You sleep deeply through the night.
> Your breath is slow and even.
> You sleep deeply through the night.
> You feel so rested and peaceful.
> Your alarm gently wakes you.
> No fog or grogginess at all.
> You sleep deeply through the night.
> You feel a quiet strength within.
> Thank you, thank you, thank you.
> Thank you, thank you, thank you.
> It is done.

## new · neutral · I want to sleep deeply through the night

model: x-ai/grok-4.6 · source: model · 119 words · $0.0053 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all present tense.)

> You open your eyes to pale morning light on the wall and a quiet room that held you until now.
> You sleep deeply through the night.
> The sheet is warm against your chest and your jaw sits loose as you lie still for a moment.
> Your feet find the cool floor and no heaviness sits behind your eyes.
> A mug warms your palms and steam rises in the still air while the house stays quiet.
> You sleep deeply through the night.
> You stand at the window and the street sounds reach you only as a soft far hum.
> You are someone who rests all the way until morning.
> Thank you.
> You sleep deeply through the night.
> It is done.

## old · neutral · I want to run a marathon this year

model: google/gemini-2.5-flash-lite · source: model · 56 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 2 (Two sentences are in the past tense.)

> You are a marathon runner.
> You completed the marathon.
> Your body feels strong now.
> You rest in quiet contentment.
> The medal hangs on your wall.
> You feel a deep gratitude.
> You are a marathon runner.
> You feel proud of yourself.
> You are a marathon runner.
> You are at peace.
> Thank you.
> Thank you.
> It is done.

## new · neutral · I want to run a marathon this year

model: x-ai/grok-4.6 · source: model · 129 words · $0.0055 · visual 2/2 · parses 2/2 · tense slips 3 (3 sentences are in the past tense)

> You sit alone on the sofa in the still evening, the medal cool and solid in your hand.
> The lamp lights the room in a soft gold, and the window shows only dark glass.
> You have run the marathon this year.
> You feel the quiet in your legs and the easy rise of your breath.
> You turn the medal once, read the date, and rest it on the table beside the empty cup.
> You have run the marathon this year.
> Steam from the shower still hangs in the hall, and the tea smells of lemon.
> You lean back, close your eyes, and let the thanks fill your chest.
> You have run the marathon this year.
> The house is quiet, and you are the one who finished.
> It is done.

## old · attraction · I want women to approach me and show interest in me

model: google/gemini-2.5-flash-lite · source: model · 56 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 1 (One future tense sentence, 'You are walking home this evening.')

> You are walking home this evening.
> Women approach you with easy smiles.
> They show interest in you.
> You feel a gentle warmth within.
> You are radiant and confident.
> This is your natural state.
> You feel this deep gratitude.
> Thank you for this connection.
> Thank you for this feeling.
> This is your new reality.
> It is done.

## new · attraction · I want women to approach me and show interest in me

model: anthropic/claude-sonnet-5.5 · source: model · 151 words · $0.0074 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent, vivid and present tense.)

> The café patio hums with low voices, and the string lights overhead turn the dusk the color of honey.
> A woman with dark curls pinned loosely back and a green linen jacket crosses the bricks toward your table, smiling as if she has already decided to.
> She stops beside you, her brown eyes steady on yours, and says she noticed you from across the patio and wanted to say hello.
> Her voice is easy and warm, and you feel your shoulders drop and your jaw loosen.
> Women come over to you, and it is simple and kind.
> Later the patio empties, and you sit alone with your tea cooling in your hands, the ceramic still faintly warm against your palms.
> Her name sits in your phone, and the evening is quiet around you.
> You are a man people like to talk to, open, relaxed and easy to approach.
> It is done.

## old · attraction · I want women to find me attractive when I walk into a party

model: google/gemini-2.5-flash-lite · source: model · 52 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all sentences are clear.)

> You notice the soft light.
> You feel a gentle warmth.
> Women turn to smile at you.
> Their eyes hold an easy interest.
> You feel completely at ease.
> This is simply who you are.
> They find you attractive.
> You find them attractive.
> You find yourself attractive.
> Thank you.
> Thank you.
> It is done.

## new · attraction · I want women to find me attractive when I walk into a party

model: x-ai/grok-4.6 · source: model · 152 words · $0.0088 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent, vivid, present-tense script.)

> The lantern light pools on the wooden floor and the air smells of citrus and warm spice.
> A woman with dark hair and an open, easy face looks toward you as you step through the door, her eyes kind, her voice low when she greets you.
> Women find you attractive when you walk into a party.
> You feel the cool glass in your hand and the loose ease across your shoulders.
> You stand by the table as music plays softly and a friend beside you says this is simply how evenings go now.
> Another woman with fair skin and a quiet smile nods as she passes, her glance warm, her posture easy.
> You hear your name spoken from across the room with ordinary fondness.
> Women find you attractive when you walk into a party.
> You are the one who walks in and the room already meets you with ease.
> It is done.

## old · wealth · I want my business to reach $10k a month

model: google/gemini-2.5-flash-lite · source: model · 75 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 0 (Some images, but also abstractions like 'thriving and strong'.)

> Your business now reaches $10k a month.
> You see the numbers clearly today.
> Your business is thriving and strong.
> A loved one smiles and says, This is wonderful.
> They see your success and feel proud.
> Your business brings you such joy.
> You are a master of your craft.
> You feel the ease of this abundance.
> Your business is a true blessing.
> You feel deep gratitude now.
> Thank you, thank you, thank you.
> It is done.

## new · wealth · I want my business to reach $10k a month

model: x-ai/grok-4.6 · source: model · 147 words · $0.0074 · visual 2/2 · parses 1/2 · tense slips 0 (Your work already meets the month is odd.)

> Your closest friend sits opposite you at the small oak table, her curly brown hair loose, warm brown skin, dark eyes shining, a rust jumper on her sturdy frame, and she looks at you with a wide, knowing smile.
> She points at the bank app on your phone and speaks it as fact.
> Your business makes ten thousand a month.
> Sunlight through the window warms the back of your hand, and the coffee smells rich.
> You feel the wooden chair under you and the quiet ease in your chest.
> She laughs and squeezes your wrist as she says she saw this already.
> You are the owner whose work already meets the month.
> The gold light sits on the cups, and traffic murmurs outside.
> Your business makes ten thousand a month.
> Thank you for this month already full.
> Your business makes ten thousand a month.
> It is done.

## old · wealth · I want to be debt free and have savings I never worry about

model: google/gemini-2.5-flash-lite · source: model · 58 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 0 (Some images, but mostly abstractions)

> You are debt free.
> You are debt free, and at peace.
> You feel the weight lift.
> Your savings are secure now.
> You are debt free, finally.
> You smile, alone and content.
> This quiet evening is yours.
> You feel the deep peace.
> Your savings are real.
> You are debt free, and grateful.
> Thank you. Thank you.
> It is done.

## new · wealth · I want to be debt free and have savings I never worry about

model: x-ai/grok-4.6 · source: model · 110 words · $0.0098 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all sentences are clear.)

> You notice the lamp on the table and cool glass in your hand.
> You are debt free and your savings rest easy.
> The evening is quiet in this room.
> You sit and the phone shows accounts that belong to you with nothing owed.
> You scroll once and the numbers sit still.
> You are debt free and your savings rest easy.
> Your shoulders drop as you set the phone on the wood.
> You hear the fridge and smell tea beside you.
> You rest a hand on the table with warmth in your chest.
> You are debt free and your savings rest easy.
> You give thanks for this evening.
> It is done.

## old · health · I want to be healthy, strong and full of energy

model: google/gemini-2.5-flash-lite · source: model · 66 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 0 (A few images, but mostly slogans.)

> You are healthy and strong now.
> Your body is full of energy.
> You feel so healthy and strong.
> Your sister smiles, You look wonderful.
> She can see your vibrant energy.
> You are so healthy and strong.
> You feel energy flowing easily.
> This radiant health is yours.
> You are so healthy and strong.
> Thank you for this vitality.
> Thank you for this vibrant life.
> It is done.

## new · health · I want to be healthy, strong and full of energy

model: x-ai/grok-4.6 · source: model · 135 words · $0.0067 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent script, very visual and present tense.)

> Your friend stands in the kitchen doorway, dark hair over one shoulder, kind eyes, and she looks at you with a slow smile.
> She says in a warm voice that you look so well, so strong, and full of energy.
> You hold cool glass in your hand on the pale tile while morning light rests on the wooden table.
> You are healthy, strong and full of energy.
> Her hand rests on your shoulder and you feel the solid warmth of it.
> You hear her laugh close by as you set the glass down with easy limbs.
> Breath moves freely in your ribs and your jaw stays loose.
> You are healthy, strong and full of energy.
> Thank you for this living strength in you now.
> You are healthy, strong and full of energy.
> It is done.

## old · health · I want my back pain to be gone

model: google/gemini-2.5-flash-lite · source: model · 70 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all sentences are clear.)

> You notice the soft light of morning.
> Your back feels completely at ease.
> You move with simple freedom.
> This freedom is yours now.
> You stretch your arms upward.
> No stiffness holds you back.
> Your back is completely at ease.
> You breathe deeply and smile.
> This ease is your natural state.
> Your back is completely at ease.
> Thank you for this relief.
> Thank you for this deep ease.
> It is done.

## new · health · I want my back pain to be gone

model: x-ai/grok-4.6 · source: model · 123 words · $0.0089 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent, vivid, present-tense script.)

> You notice the pale morning light on the kitchen tiles as you stand barefoot at the counter.
> Your back is free and easy.
> You lift the kettle and pour, the mug warm in both hands, and your spine feels long and quiet inside you.
> You smell the coffee and you hear the clock, and your jaw is loose.
> Your back is free and easy.
> You walk across the room and you bend to pick up a dropped spoon, and you straighten without a thought.
> You sit and lean back in the wooden chair and rest there, comfortable on an ordinary day.
> You are someone who moves through the house without guarding yourself.
> Your back is free and easy.
> Thank you.
> It is done.

## old · intimacy · I want a deeply intimate, passionate evening with my wife

model: google/gemini-2.5-flash-lite · source: model · 54 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all sentences are clear.)

> You are here now.
> The soft light warms your skin.
> You feel deeply connected.
> Your wife’s hand rests on yours.
> She smiles, a knowing look.
> This passion is real.
> You share this deep intimacy.
> Your evening unfolds with ease.
> You feel so loved.
> This intimacy is yours.
> Thank you.
> Thank you.
> It is done.

## new · intimacy · I want a deeply intimate, passionate evening with my wife

model: x-ai/grok-4.6 · source: model · 147 words · $0.0070 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent detail, all present tense.)

> You notice the low lamp light on the two glasses and the faint scent of her perfume in the quiet room.
> Your wife stands close, dark hair falling over her shoulders, warm skin, brown eyes that rest on yours, a simple dress, a slow smile, her voice low as she looks at you.
> This evening with your wife is yours.
> She rests her hand on your arm and says that you two have this whole night, and her words land in your chest.
> You feel the warmth of her palm and the weight of her nearness.
> This evening with your wife is yours.
> She leans in until her forehead meets yours, and you hear her thank you for being here with her.
> You are the man who comes home to this closeness.
> Thank you for this night.
> This evening with your wife is yours.
> It is done.
