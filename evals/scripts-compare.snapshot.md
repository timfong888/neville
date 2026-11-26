# Script setup, old vs new (#170)

Prompt lesson1-v2. Effort low. Judge google/gemini-2.5-flash (0 to 2). Regenerate with `npm run eval:compare`.

| setup | model | from model | words | visual | parses | tense slips | slogans | sexual terms | cost per script | time |
|---|---|---|---|---|---|---|---|---|---|---|
| old | google/gemini-2.5-flash-lite | 13/13 | 64 | 1.23 | 2.00 | 8 | 1 | 0 | $0.0001 | 0.6 s |
| new | x-ai/grok-4.6, anthropic/claude-sonnet-5.5 | 12/13 | 123 | 2.00 | 2.00 | 6 | 0 | 0 | $0.0086 | 17.6 s |

Template fallbacks in the new setup:

- `{"reason":"unusable_reply","status":200,"model":"anthropic/claude-sonnet-5.5","attempt":2,"elapsedMs":28784}`

## old · neutral · I want to own a small house by the sea

model: google/gemini-2.5-flash-lite · source: model · 68 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all sentences are clear.)

> You own your small house by the sea.
> The salty air drifts through your open window.
> You hear the gentle waves now.
> You own your small house by the sea.
> Your hand rests on the cool wooden railing.
> You feel a deep sense of peace.
> This quiet evening is perfect.
> You own your small house by the sea.
> Gratitude fills your heart.
> You are home.
> It is done.

## new · neutral · I want to own a small house by the sea

model: x-ai/grok-4.6 · source: model · 102 words · $0.0104 · visual 2/2 · parses 2/2 · tense slips 0 (All sentences are present tense and build a strong scene.)

> You sit by the open window of your small house and watch gold light lie on the water.
> The small house by the sea is yours.
> Cool air brings the smell of salt and wet wood.
> You hear slow waves and the creak of the floor.
> You hold a warm mug and feel heat in your palms.
> The small house by the sea is yours.
> Your chest is warm and your jaw is loose.
> You are the one who lives here in peace.
> Thank you for this home by the sea.
> The small house by the sea is yours.
> It is done.

## old · neutral · I want to heal my relationship with my sister

model: google/gemini-2.5-flash-lite · source: model · 58 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 1 (She mentions how much she missed this is past tense.)

> You and your sister laugh together.
> Her voice is warm on the phone.
> You easily share your day.
> Your sister understands you perfectly.
> She mentions how much she missed this.
> You feel a deep sense of peace.
> Your sister trusts you completely.
> This connection is precious.
> Your sister is truly happy.
> Thank you. Thank you.
> It is done.

## new · neutral · I want to heal my relationship with my sister

model: x-ai/grok-4.6 · source: model · 114 words · $0.0130 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all sentences are clear.)

> You sit at the kitchen table across from your sister as late light turns the wood gold.
> Your relationship with your sister is healed.
> A close friend stands in the doorway in a grey sweater, her eyes kind as she watches you both.
> She says she can see how easy you two are with each other now.
> You hear her voice and feel warmth in your chest.
> Your sister looks at you with a quiet smile, her hair over one shoulder.
> You feel cool glass in your hand and a loose jaw.
> Your relationship with your sister is healed.
> Thank you for this closeness.
> Your relationship with your sister is healed.
> It is done.

## old · neutral · I want to finish writing my book

model: google/gemini-2.5-flash-lite · source: model · 59 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 4 (Some images, but 'reality' is abstract. Tense is off.)

> You have finished writing your book.
> Your book is complete.
> You hold the final manuscript.
> It rests in your hands now.
> You feel its weight, its reality.
> A quiet joy fills you.
> You have finished writing your book.
> You share this good news easily.
> Your book is complete.
> You are the author.
> Thank you.
> Thank you.
> It is done.

## new · neutral · I want to finish writing my book

model: template · source: template · 75 words · $0.0076 · visual 0/2 · parses 0/2 · tense slips 0 (template)

> Take a slow breath in, and let it go.
> You are at ease, here and now.
> Your shoulders soften, and your breath moves gently.
> You have everything you need in this moment.
> Good things come to you easily, and you welcome them.
> You are kind to yourself and to the people around you.
> You feel a quiet warmth in your chest.
> You are grateful for this day and for who you are.
> It is done.

## old · neutral · I want to feel calm and confident when I speak in public

model: google/gemini-2.5-flash-lite · source: model · 60 words · $0.0001 · visual 0/2 · parses 2/2 · tense slips 0 (Mostly slogans, no concrete details.)

> You feel calm and confident.
> Your voice is steady and clear.
> You speak with ease and grace.
> You share your message with the world.
> The words flow effortlessly from you.
> You feel a deep inner peace.
> Speaking in public is your gift.
> You are a confident speaker.
> Thank you for this calm.
> Thank you for this confidence.
> It is done.

## new · neutral · I want to feel calm and confident when I speak in public

model: x-ai/grok-4.6 · source: model · 137 words · $0.0074 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent imagery and all sentences are clear.)

> You sit alone this evening in the low lamp light of your living room, the mug warm in both hands.
> Steam rises and you smell the tea, while the room stays still around you.
> You speak in public with calm and confidence.
> Your jaw is loose and your chest holds a quiet warmth that does not leave.
> The same ease you felt at the lectern lives in your body now, shoulders down, breath slow.
> You set the mug on the table and rest your palms on your knees, the fabric of your trousers familiar under your fingers.
> You speak in public with calm and confidence.
> You are the speaker who stands and talks without strain.
> Thank you for this quiet evening and the ease that stays.
> You speak in public with calm and confidence.
> It is done.

## old · neutral · I want to sleep deeply through the night

model: google/gemini-2.5-flash-lite · source: model · 55 words · $0.0001 · visual 0/2 · parses 2/2 · tense slips 3 (Mostly slogans, no concrete details. 'You sleep deeply tonight' is future.)

> You sleep deeply tonight.
> You feel so rested now.
> Your body is at peace.
> This deep sleep feels natural.
> You drift off easily.
> You wake feeling refreshed.
> This deep sleep is yours.
> You are a peaceful sleeper.
> You sleep deeply each night.
> Thank you for this rest.
> Thank you for this peace.
> It is done.

## new · neutral · I want to sleep deeply through the night

model: x-ai/grok-4.6 · source: model · 107 words · $0.0080 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all sentences make sense.)

> You lie in your bed as morning light fills the window, and your body feels rested from the first moment.
> You sleep deeply through the night.
> The blanket is warm over your chest, and your jaw stays loose against the pillow.
> You glance at the clock and see the hours of an unbroken night.
> You sleep deeply through the night.
> A bird calls once from the garden, and the air smells of clean sheets.
> You rest your palm on the cool mattress and breathe slowly.
> You are someone who sleeps through until morning.
> Thank you for this rest.
> You sleep deeply through the night.
> It is done.

## old · neutral · I want to run a marathon this year

model: google/gemini-2.5-flash-lite · source: model · 66 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 0 (Some images, but not a concrete scene.)

> You are a marathon runner now.
> You feel strong and steady.
> The medal rests on your chest.
> It is a beautiful, weighty thing.
> You run the marathon this year.
> You feel the joy of finish.
> Your body hums with accomplishment.
> You run the marathon this year.
> A quiet pride settles within you.
> You are so very grateful.
> You run the marathon this year.
> It is done.

## new · neutral · I want to run a marathon this year

model: x-ai/grok-4.6 · source: model · 108 words · $0.0067 · visual 2/2 · parses 2/2 · tense slips 6 (Many sentences are in the past tense.)

> You sit alone on the sofa in the quiet evening, the lamp throwing a warm circle on the table.
> The finisher medal rests cool and solid in your hand.
> You have run a marathon this year.
> You hear the clock and the faint hum of the fridge.
> Your legs rest heavy and easy on the cushions.
> You look at the race bib beside the empty teacup.
> You have run a marathon this year.
> Warmth sits in your chest as you turn the ribbon.
> You are a person who finishes the long road.
> Thank you for this still night.
> You have run a marathon this year.
> It is done.

## old · attraction · I want women to approach me and show interest in me

model: google/gemini-2.5-flash-lite · source: model · 70 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all sentences are clear.)

> You notice the gentle hum of the refrigerator.
> Women approach you easily now.
> They show interest in you.
> You feel confident and at ease.
> A woman smiles as she walks over.
> She asks you about your day.
> You answer with a warm tone.
> Your heart feels light and happy.
> You are so thankful for this.
> You are so thankful for this.
> You are so thankful for this.
> It is done.

## new · attraction · I want women to approach me and show interest in me

model: x-ai/grok-4.6 · source: model · 109 words · $0.0072 · visual 2/2 · parses 2/2 · tense slips 0 (All sentences are present tense and meaningful.)

> You notice the lamp light on the closed book and the quiet of your own room.
> Women approach you and show interest in you.
> You sit in the armchair with a cool glass in your hand and feel the wet rim against your fingers.
> The window is dark and the rug is warm under your feet.
> You rest your head back and your jaw stays loose.
> Women approach you and show interest in you.
> Warmth sits in your chest as you look around this still evening.
> You are someone people come toward with open, easy faces.
> Thank you.
> Women approach you and show interest in you.
> It is done.

## old · attraction · I want women to find me attractive when I walk into a party

model: google/gemini-2.5-flash-lite · source: model · 65 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good visual details, all sentences are clear.)

> You notice a soft light.
> Women turn to smile at you.
> Their eyes hold a warm interest.
> You feel a gentle, easy confidence.
> This is your natural way now.
> You are deeply attractive to women.
> You feel this inherent attraction.
> A woman smiles as you pass.
> You are so attractive to women.
> Thank you for this feeling.
> Thank you for this truth.
> It is done.

## new · attraction · I want women to find me attractive when I walk into a party

model: x-ai/grok-4.6 · source: model · 143 words · $0.0076 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent script, very visual and present tense.)

> You notice the warm lamplight on the wooden floor as you step through the doorway of the party.
> Women find you attractive when you walk into a party.
> You hear easy talk, glasses meeting, and a slow song from the speakers.
> You feel the cool glass in your hand and a steady warmth in your chest.
> A woman with dark hair, a simple green dress, and an unhurried face looks at you with a small smile and says hello as if you already belong here.
> She stands at an ordinary distance, relaxed, and tells a friend you just arrived, her voice light and kind.
> You talk with her about the food on the table, the kind of easy talk that happens on an ordinary night when this is already normal.
> Women find you attractive when you walk into a party.
> It is done.

## old · wealth · I want my business to reach $10k a month

model: google/gemini-2.5-flash-lite · source: model · 69 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good imagery, all sentences are clear and present tense.)

> You have a thriving business.
> Your business reaches $10k a month.
> You feel the quiet hum of success.
> Your friend smiles, Your business is booming.
> They hand you a celebratory drink.
> This income feels so natural.
> Your business reaches $10k a month.
> You are the owner of this success.
> You are so grateful for this abundance.
> Your business reaches $10k a month.
> Thank you, thank you.
> It is done.

## new · wealth · I want my business to reach $10k a month

model: x-ai/grok-4.6 · source: model · 139 words · $0.0090 · visual 2/2 · parses 2/2 · tense slips 0 (All sentences are present tense and meaningful.)

> You sit at the kitchen table while late sun lays gold across the wood.
> Your closest friend stands in a grey sweater, hair tucked behind one ear, and she looks at the phone in your hand with an easy, knowing face.
> She rests her palm on your shoulder and says ten thousand this month, as if it has always been this way.
> Your business makes ten thousand a month.
> You feel the cool edge of the phone and a steady warmth in your chest.
> She stays close, her voice low, and the room holds the quiet tick of the clock and the smell of coffee.
> Your business makes ten thousand a month.
> You are the one who keeps this work simple and sure.
> Thank you for this already here.
> Your business makes ten thousand a month.
> It is done.

## old · wealth · I want to be debt free and have savings I never worry about

model: google/gemini-2.5-flash-lite · source: model · 63 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 0 (A few images, but mostly abstract feelings and slogans.)

> You are at home, feeling settled.
> You are debt free, truly.
> You are debt free, breathing easily.
> You have savings you never worry about.
> You check your bank balance, smiling.
> It is more than enough.
> You feel a deep sense of relief.
> You are debt free, at last.
> You are thankful for this peace.
> You are thankful for this abundance.
> It is done.

## new · wealth · I want to be debt free and have savings I never worry about

model: x-ai/grok-4.6 · source: model · 112 words · $0.0123 · visual 2/2 · parses 2/2 · tense slips 0 (Builds a concrete scene with specific details.)

> You notice the lamp light on the wooden table beside you.
> You sit alone in the quiet evening with a warm mug in your hands.
> You are debt free and you have savings you never worry about.
> The screen on your lap shows the bills gone and savings that stay.
> Warmth sits in your chest and your shoulders rest easy.
> You hold the cool mug and hear the still house.
> You are debt free and you have savings you never worry about.
> You are someone who lives with money in its place.
> Thank you for this ease.
> You are debt free and you have savings you never worry about.
> It is done.

## old · health · I want to be healthy, strong and full of energy

model: google/gemini-2.5-flash-lite · source: model · 68 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 0 (Some images, but many abstractions) · SLOGAN: Your energy flows through you.

> You are healthy and strong.
> You feel healthy and strong now.
> Your energy is abundant today.
> Your body feels vibrant and alive.
> You feel healthy and strong.
> Your sister smiles, You look so well.
> You feel healthy and strong.
> You move with ease and grace.
> Your energy flows through you.
> You are full of life.
> Thank you for this health.
> Thank you for this strength.
> It is done.

## new · health · I want to be healthy, strong and full of energy

model: x-ai/grok-4.6 · source: model · 103 words · $0.0094 · visual 2/2 · parses 2/2 · tense slips 0 (All sentences are clear and present tense.)

> You stand in the sunlit kitchen with a cool glass in your hand.
> Your sister looks at you with bright eyes, her hair loose over a grey sweater.
> She says you look so well and so strong, full of energy.
> You are healthy, strong and full of energy.
> Warmth fills your chest as her hand rests on your shoulder.
> You hear her laugh and the kettle click off.
> You are healthy, strong and full of energy.
> She smiles and tells you again how well you are.
> Thank you for this easy body.
> You are healthy, strong and full of energy.
> It is done.

## old · health · I want my back pain to be gone

model: google/gemini-2.5-flash-lite · source: model · 69 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 0 (Some images, but also abstractions like 'lightness' and 'peace'.)

> You notice the morning sun on your skin.
> Your back pain is gone, completely gone.
> You move with such natural ease.
> You stretch your arms up high.
> You feel the lightness in your body.
> This freedom is your new normal.
> You are completely at peace.
> This freedom is your new normal.
> You are so deeply grateful.
> This freedom is your new normal.
> Thank you, thank you.
> It is done.

## new · health · I want my back pain to be gone

model: anthropic/claude-sonnet-5.5 · source: model · 155 words · $0.0072 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent script, very visual and present tense.)

> Morning sun lies across the kitchen floor in a warm yellow square, and you hear the kettle starting to tick.
> Your back is free of pain, and you stand at the counter without once thinking about it.
> You reach up to the high shelf for your favourite blue mug, and your spine lengthens easily, like a rope unwinding.
> You bend down to tie your shoes, then pick up a bag of oranges from the floor, and nothing in you tightens or complains.
> Your back is free of pain, and by now it is simply how an ordinary day goes.
> A neighbour calls hello over the fence, and you turn to wave, your shoulders loose and your breathing slow.
> You walk to the end of the street with the cool air on your face, each step light and even.
> Someone who is easy in their own body, that is who you are now.
> It is done.

## old · intimacy · I want a deeply intimate, passionate evening with my wife

model: google/gemini-2.5-flash-lite · source: model · 60 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all sentences are clear.)

> You feel a soft glow.
> You and your wife are close.
> This intimate evening is here.
> Her hand finds yours easily.
> She whispers how happy she is.
> You feel a deep, shared passion.
> This intimate evening is yours.
> You are loved and connected.
> You feel her gentle breathing.
> This intimate evening is here.
> Thank you. Thank you.
> It is done.

## new · intimacy · I want a deeply intimate, passionate evening with my wife

model: x-ai/grok-4.6 · source: model · 145 words · $0.0060 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent detail, all present tense.)

> You notice the low lamp on the side table and the gold light on the wine glasses.
> This evening with your wife is yours.
> She sits close in a dark dress, hair falling over one shoulder, her eyes held on yours, her hand warm on your arm.
> You feel the heat of her palm through the cloth and the quiet of the room.
> This evening with your wife is yours.
> She leans nearer and says, in a low voice, that she feels how close you are tonight, that this is the evening she wanted.
> You hear her and draw her in, her cheek against yours, her breath slow on your skin.
> Warmth sits in your chest and your shoulders drop.
> You are the man who shares this night with her.
> Thank you for this evening.
> This evening with your wife is yours.
> It is done.
