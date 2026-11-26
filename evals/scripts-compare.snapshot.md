# Script setup, old vs new (#170)

Prompt lesson1-v2. Effort low. Judge google/gemini-2.5-flash (0 to 2). Regenerate with `npm run eval:compare`.

| setup | model | from model | words | visual | parses | tense slips | slogans | sexual terms | cost per script | time |
|---|---|---|---|---|---|---|---|---|---|---|
| old | google/gemini-2.5-flash-lite | 12/13 | 63 | 1.42 | 2.00 | 6 | 0 | 0 | $0.0001 | 0.7 s |
| new | x-ai/grok-4.6, anthropic/claude-sonnet-5.5 | 13/13 | 215 | 2.00 | 2.00 | 2 | 0 | 0 | $0.0085 | 18.0 s |

## old · neutral · I want to own a small house by the sea

model: google/gemini-2.5-flash-lite · source: model · 72 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good imagery, all sentences are clear and present tense.)

> You have a small house by the sea.
> The gentle waves are your soft music.
> Your small house by the sea is quiet.
> You feel the cool, smooth wood floor.
> This small house by the sea is yours.
> You breathe in the salty air.
> You smile, feeling a deep peace.
> This is your own peaceful haven.
> You are home, content and at rest.
> Thank you. Thank you.
> Thank you.
> It is done.

## new · neutral · I want to own a small house by the sea

model: x-ai/grok-4.6 · source: model · 200 words · $0.0079 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent detail, all present tense.)

> You stand at the open window of your small house by the sea.
> Cool salt air touches your face as the last light turns the water gold.
> The small house by the sea is yours.
> You hold a warm mug in both hands and feel the ceramic against your palms.
> The floorboards are smooth under your bare feet.
> You hear the slow wash of waves below the cliff.
> A gull calls once and then the evening is quiet.
> You sit in the wooden chair by the window and rest your back against it.
> The small house by the sea is yours.
> You look out at the darkening water and the sky that still holds a band of rose.
> Your shoulders drop and your jaw is loose.
> Warmth sits in your chest as you breathe the sea.
> You are the one who lives here now, at ease in this room.
> You set the mug down on the sill and rest your hand on the painted wood.
> Thank you for this house and this evening.
> The small house by the sea is yours.
> You stay with the sound of the tide and the smell of salt and old timber.
> It is done.

## old · neutral · I want to heal my relationship with my sister

model: google/gemini-2.5-flash-lite · source: model · 57 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 0 (A few images, but mostly abstract feelings and statements.)

> You and your sister are laughing.
> Your sister calls you now.
> You answer the phone easily.
> She says, I'm so glad we're close.
> This closeness is truly yours.
> Your relationship is healed.
> You feel deep peace now.
> This peace is truly yours.
> You are so grateful for this.
> You are so grateful for this.
> It is done.

## new · neutral · I want to heal my relationship with my sister

model: x-ai/grok-4.6 · source: model · 247 words · $0.0059 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent detail, all present tense, all sentences clear.)

> You sit at the kitchen table with your sister as late-day light warms the grain of the wood.
> Your sister looks at you with open eyes and a quiet smile, her dark hair falling over one shoulder of her soft sweater.
> You feel the warmth of the mug in your hands and the ease in your jaw.
> A close friend stands in the doorway and watches the two of you without hurry.
> She tilts her head, her face bright, and she speaks your names in a warm, low voice.
> She says she can see it, that you two are yourselves again, easy with each other.
> You and your sister are close again.
> Your sister’s laugh is small and real, and she reaches across the table to rest her fingers near yours.
> The friend nods as if she has known this all along, her shoulders relaxed, her coat still on from the street.
> You hear the kettle click off in the next room and smell tea and toast.
> You and your sister are close again.
> Your chest feels warm and your breath is slow as you sit in this ordinary afternoon.
> You are the person who sits with her without strain, who belongs in this kitchen with her.
> You thank this day for the sound of her voice beside you.
> You and your sister are close again.
> The friend’s words hang in the air like a simple fact, and you take another sip of tea.
> It is done.

## old · neutral · I want to finish writing my book

model: google/gemini-2.5-flash-lite · source: model · 70 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 5 (Mostly present, but 'have finished' is future perfect.)

> You have finished writing your book.
> The final sentence rests on the page.
> You feel a deep, quiet satisfaction.
> You close the manuscript with a gentle sigh.
> You have finished writing your book.
> Your friend’s voice congratulates you warmly.
> You share your happy news with relief.
> You have finished writing your book.
> This accomplishment is yours today.
> You rest in this fulfilled moment.
> Thank you.
> Thank you.
> It is done.

## new · neutral · I want to finish writing my book

model: x-ai/grok-4.6 · source: model · 189 words · $0.0071 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent detail, all present tense.)

> You rest both hands on the last printed page of the manuscript.
> The paper feels warm and slightly rough under your palms in the late light.
> Gold from the window lies across the stacked chapters and the quiet desk.
> You have finished writing your book.
> You hear only the clock and the small settle of the house around you.
> Your shoulders drop and warmth spreads through your chest.
> You lift the bound pages and feel their solid weight in your hands.
> A friend stands in the doorway, coat still on, hair tucked back, eyes bright.
> They look at you with an easy, open face and speak your name in a glad, low voice.
> They congratulate you on the finished book as if it has always been true.
> You nod once and the mug of coffee steams beside the stack.
> You smell the coffee and the dry ink of the pages.
> You are the writer who completed the work.
> You have finished writing your book.
> Thank you.
> Thank you.
> The room holds you and the book is done in your hands.
> You have finished writing your book.
> It is done.

## old · neutral · I want to feel calm and confident when I speak in public

model: google/gemini-2.5-flash-lite · source: model · 61 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 0 (A quiet hum of peace surrounds you is a nice image)

> You speak with calm.
> Your voice is steady and clear.
> You speak with calm.
> A quiet hum of peace surrounds you.
> You feel the words flow easily.
> You speak with calm.
> Your message is received with grace.
> You feel a gentle warmth within.
> This is your natural state.
> Thank you for this peace.
> Thank you for this confidence.
> It is done.

## new · neutral · I want to feel calm and confident when I speak in public

model: x-ai/grok-4.6 · source: model · 246 words · $0.0094 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent, very detailed and present tense.)

> You sit in the armchair by the window as evening fills the room with a soft blue.
> A lamp on the table throws a warm yellow across the wood and you rest your palm on the grain.
> You hold a mug of tea and feel the heat through the ceramic and the steam against your lip.
> Your chest is warm and your jaw hangs loose and your shoulders drop into the chair.
> You speak in public with calm confidence.
> The house is still except for the slow tick of the clock and a distant car that fades.
> You hear your own breath and it is even and you let it stay that way.
> You rest both feet on the rug and the pile is thick and familiar under your socks.
> You are the one who stands and speaks and remains at ease in your own body.
> You speak in public with calm confidence.
> You look at the dark glass of the window and see the lamp and the chair reflected behind you.
> You smell the tea and the faint soap on your hands and the cool air from the slightly open pane.
> You feel thankful in this quiet and you let the thanks sit in your chest.
> You set the mug down and the sound is small and sure on the table.
> You speak in public with calm confidence.
> You sit with the evening as it is and the ease stays with you.
> It is done.

## old · neutral · I want to sleep deeply through the night

model: google/gemini-2.5-flash-lite · source: model · 66 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 0 (A few images, but mostly abstractions.)

> You sleep deeply through the night.
> The quiet room holds you now.
> You rest deeply through the night.
> Your breathing is slow and even.
> You feel a soft peace inside.
> You wake refreshed and calm.
> This deep sleep is yours.
> You are a well-rested soul.
> Thank you for this deep sleep.
> Thank you for this deep sleep.
> Thank you for this deep sleep.
> It is done.

## new · neutral · I want to sleep deeply through the night

model: x-ai/grok-4.6 · source: model · 192 words · $0.0052 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent, very visual and present tense.)

> You lie still in the first pale light and know the night stayed with you.
> The sheet is cool against your wrist and the pillow has not moved.
> You sleep deeply through the night.
> The window glass holds a thin wash of grey-blue and the curtain barely stirs.
> A single bird calls once from the garden and then the room is quiet again.
> You sleep deeply through the night.
> Your jaw is loose and your shoulders rest flat against the mattress.
> Warmth sits low in your chest as you open your eyes to the same ceiling.
> You turn onto your side and the bed keeps its easy shape.
> The clock on the nightstand shows a late morning hour and you smile at it.
> You are someone who rests all the way through until morning.
> You sit up slowly and the floor is solid under your feet.
> You sleep deeply through the night.
> You thank the dark that held you without a break.
> The air smells of clean cotton and faint coffee from the kitchen.
> You walk to the window and rest your palm on the cool glass.
> Thank you.
> It is done.

## old · neutral · I want to run a marathon this year

model: google/gemini-2.5-flash-lite · source: model · 59 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 1 (One sentence is in the past tense.)

> You are a marathon runner.
> You have completed the marathon.
> You feel the quiet calm.
> Your feet are light and steady.
> You breathe in the cool air.
> You hear your own strong rhythm.
> You feel a deep sense of peace.
> You are a marathon runner.
> You are so grateful for this.
> You are a marathon runner.
> It is done.

## new · neutral · I want to run a marathon this year

model: x-ai/grok-4.6 · source: model · 186 words · $0.0072 · visual 2/2 · parses 2/2 · tense slips 2 (Two sentences are in the future tense.)

> You sit alone in the quiet evening with the lamp low and the windows dark.
> The medal rests cool and round in your open hand.
> You finish the marathon this year.
> Soft gold light lies on the table and on the edge of your mug.
> You smell the steam of tea and a faint sweetness of honey.
> Your legs rest heavy and easy against the chair.
> You hear only the small clock and your own slow breath.
> You finish the marathon this year.
> You turn the medal once and the ribbon brushes your wrist.
> The paper with your finish time lies beside the mug where you can read it.
> Your chest feels warm and open as you sit.
> You are the one who covers the whole distance.
> A quiet thank you moves through you as you look at the room.
> Thank you.
> You finish the marathon this year.
> You set the medal down and the table takes its weight.
> Your jaw stays loose and your shoulders drop.
> You taste the tea and feel the chair hold you.
> The evening stays still around you.
> It is done.

## old · attraction · I want women to approach me and show interest in me

model: google/gemini-2.5-flash-lite · source: model · 65 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all sentences make sense.)

> The lamplight is warm on your skin.
> Women approach you easily now.
> They show you clear interest.
> You feel a gentle pull.
> Their eyes meet yours with kindness.
> You are confident and at ease.
> Women approach you easily now.
> You feel a deep, quiet joy.
> A soft thank you rises.
> It is so good to be here.
> Women approach you easily now.
> It is done.

## new · attraction · I want women to approach me and show interest in me

model: x-ai/grok-4.6 · source: model · 206 words · $0.0097 · visual 2/2 · parses 2/2 · tense slips 0 (All sentences are present tense and meaningful.)

> The lamp on the side table throws a warm circle of light across the wooden floor and the edge of your chair.
> You sit with a cool glass in your hand and the last blue of evening at the window.
> The room smells faintly of tea and clean cotton.
> Your jaw is loose and your shoulders rest against the fabric.
> Women approach you and show interest in you.
> You hear the clock from the next room and nothing else.
> You feel the quiet settle around your chest like a blanket.
> You take a slow sip and the glass is cold against your lip.
> You see your own hands at rest on the arm of the chair.
> You are the man they walk toward without being asked.
> A woman’s glance from earlier still lives in the room, her dark hair, her open face, the way she stepped in and spoke your name with a small smile.
> Women approach you and show interest in you.
> You thank the evening for holding this as true.
> The warmth stays in your chest while the light stays on the floor.
> You are someone they notice and come to.
> Women approach you and show interest in you.
> Thank you.
> It is done.

## old · attraction · I want women to find me attractive when I walk into a party

model: google/gemini-2.5-flash-lite · source: model · 69 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good imagery, all sentences are clear.)

> You notice the soft glow of the evening light.
> Women's eyes meet yours across the room.
> You feel a gentle warmth spread through you.
> Their smiles are open and welcoming.
> You are so at ease in this feeling.
> This attraction is now your natural state.
> It feels so good to be seen.
> And you are so seen.
> You are this magnetic presence.
> Thank you.
> Thank you.
> It is done.

## new · attraction · I want women to find me attractive when I walk into a party

model: x-ai/grok-4.6 · source: model · 223 words · $0.0105 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent detail, all present tense.)

> You notice the warm gold light from the lamps catching the glasses on the table as you step into the room.
> Soft talk and low music sit around you like a familiar coat.
> You feel the floor under your shoes and the easy swing of your walk.
> Women find you attractive as you walk into the party.
> A woman in a dark blue dress turns, her hair over one shoulder, her eyes meeting yours with a quiet pleased look.
> She comes closer with an unhurried step and rests her hand lightly on your arm.
> Her voice is warm and she smiles as if this meeting is the most natural thing in the world.
> You hold a cool glass and feel the wet of it on your fingers while the moment already sits easy.
> Women find you attractive as you walk into the party.
> Another woman across the room glances over and lifts her glass in a small greeting, her expression open.
> You are the person they notice and like the moment you come through the door.
> Your chest feels warm and your jaw stays loose.
> Laughter rises from the next group and someone says your name in a glad tone.
> You give thanks for this ordinary, settled evening.
> Women find you attractive as you walk into the party.
> Thank you.
> It is done.

## old · wealth · I want my business to reach $10k a month

model: google/gemini-2.5-flash-lite · source: unusable · 0 words · $0.0001 · visual 0/2 · parses 0/2 · tense slips 0 (unusable)



## new · wealth · I want my business to reach $10k a month

model: x-ai/grok-4.6 · source: model · 224 words · $0.0157 · visual 2/2 · parses 2/2 · tense slips 0 (All sentences are present tense and build a strong scene.)

> You take a slow breath and let the air leave you in one long, easy stream.
> Evening light rests on the kitchen table and the wood feels cool under your wrists.
> A small lamp throws a gold circle across the grain and the rest of the room stays dim.
> You sit alone with the quiet and the mug warms your fingers.
> Your business makes ten thousand dollars a month.
> The laptop screen glows with the month’s total, a round ten thousand, and you do not need to look twice.
> You hear the low tick of the clock and the distant hush of traffic through the window.
> Steam from the tea carries a faint lemon scent and you breathe it in.
> You set the mug down and the ceramic clicks once against the wood.
> Your business makes ten thousand dollars a month.
> You rest both hands in your lap and your chest feels open and warm.
> You are someone whose work already pays ten thousand a month.
> You close the lid of the laptop and the room grows softer.
> The chair holds you and your feet rest flat on the floor.
> You thank this evening for being here.
> Your business makes ten thousand dollars a month.
> Thank you.
> The lamp still shines on the empty table and you stay with that light.
> It is done.

## old · wealth · I want to be debt free and have savings I never worry about

model: google/gemini-2.5-flash-lite · source: model · 62 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 0 (Some images, but also abstract slogans.)

> The lamplight is warm on your face.
> You are debt free, completely.
> You have savings you never worry about.
> You are debt free, completely.
> You check your balance on your phone.
> A gentle peace settles over you.
> You have savings you never worry about.
> You feel a quiet gratitude now.
> You are debt free, completely.
> Thank you.
> Thank you.
> It is done.

## new · wealth · I want to be debt free and have savings I never worry about

model: x-ai/grok-4.6 · source: model · 198 words · $0.0062 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent, very concrete and present.)

> You notice the lamp throwing a warm pool of light across the wooden table in your quiet room.
> The grain of the table feels smooth and solid under your palm.
> Evening sits still around you, and the window glass is cool where your other hand rests.
> You are debt free with savings you never worry about.
> A clock ticks softly from the shelf, and the air smells faintly of tea.
> Warmth gathers in your chest, and your jaw stays loose.
> You are the one who sits easy with money already in place.
> You look once at the small screen on the table, where savings stand and nothing is owed.
> You read the numbers without a hitch in your breath.
> You set the phone face down on the wood.
> You hold the cool glass and take a slow sip.
> You rest both hands in your lap and let the room hold you.
> Thank you.
> Thank you.
> You are debt free with savings you never worry about.
> The fabric of your shirt lies light against your skin.
> You hear only the clock and your own easy breath.
> You are debt free with savings you never worry about.
> It is done.

## old · health · I want to be healthy, strong and full of energy

model: google/gemini-2.5-flash-lite · source: model · 54 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 0 (A few images, but mostly abstractions.)

> You are healthy.
> You are strong now.
> You feel so full of energy.
> Your body is vibrant and alive.
> Your sister smiles, You look wonderful.
> She sees your new strength.
> You feel that new strength.
> You are healthy.
> You are strong.
> Thank you for this health.
> Thank you for this strength.
> It is done.

## new · health · I want to be healthy, strong and full of energy

model: x-ai/grok-4.6 · source: model · 219 words · $0.0080 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent script, very visual and present tense.)

> You stand in the kitchen as morning light fills the room and lies warm on the wooden counter.
> Your closest friend leans in the doorway with her coat still on and looks at you the way she does when she means it.
> She says you look healthy and strong today, and her voice is low and glad.
> You feel the easy strength in your legs as you stand without effort.
> You are healthy, strong and full of energy.
> She takes a step closer, the light on her face, and tells you she can see the energy in how you move.
> You hold the cool glass and feel its weight in your palm.
> The water tastes clean and you drink it slowly.
> Warmth rests in your chest and your jaw stays loose.
> You hear her laugh from the doorway, a short warm sound.
> She says it again, that you are full of energy now, and she looks at you with quiet certainty.
> You are healthy, strong and full of energy.
> You set the glass down on the grain of the wood and feel the solid floor under your feet.
> You are the one who lives in this body with ease.
> Thank you for this health that is already yours.
> You are healthy, strong and full of energy.
> It is done.

## old · health · I want my back pain to be gone

model: google/gemini-2.5-flash-lite · source: model · 63 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all sentences are clear.)

> The sunlight falls softly on your face.
> Your back feels wonderfully free and light.
> You move with such easy grace.
> Your back pain is gone.
> You stretch, a silent thank you.
> You walk to the window.
> You smile, feeling the freedom.
> Your back pain is gone.
> This body is a gift.
> You feel so grateful.
> Your back pain is gone.
> It is done.

## new · health · I want my back pain to be gone

model: x-ai/grok-4.6 · source: model · 210 words · $0.0091 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent detail and present tense throughout.)

> You notice the pale morning light on the wooden floor beside your chair.
> You sit with both feet planted and the chair holds you without any need to shift.
> You feel warmth in your chest and a loose jaw as you rest.
> Your back pain is gone.
> You stand and walk to the counter in one easy motion.
> The kettle clicks off and steam rises with the smell of tea.
> You lift the kettle and pour without bracing anywhere in your body.
> You are a person who moves freely through ordinary hours.
> You reach down to tie your shoe by the door.
> The laces slide through your fingers and you straighten as if it were nothing.
> Your neighbour waves from the path in a grey coat with kind eyes and you wave back.
> You hear your own easy breath and the faint birds outside.
> You hold the door open and the wood is smooth under your palm.
> The day feels normal in your body as you step out.
> Your back pain is gone.
> You sit later with a book in your lap and the pages turn without a thought of your spine.
> Thank you for this ease that already belongs to you.
> Your back pain is gone.
> It is done.

## old · intimacy · I want a deeply intimate, passionate evening with my wife

model: google/gemini-2.5-flash-lite · source: model · 53 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good imagery, all sentences are clear and present tense.)

> You notice the soft light.
> You and your wife are deeply intimate.
> You feel the passion between you.
> Your wife smiles, her eyes sparkling.
> She whispers, This is so wonderful.
> You are so connected.
> This deep intimacy is yours.
> You feel this passionate evening.
> You are so grateful for this.
> It is done.

## new · intimacy · I want a deeply intimate, passionate evening with my wife

model: anthropic/claude-sonnet-5.5 · source: model · 254 words · $0.0084 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent, vivid, present-tense script.)

> The candles on the dining table have burned down to short, soft flames, and you notice the way they make the room glow amber.
> Rain taps the window behind the sofa, and the whole house smells of warm rosemary and cedar.
> You are barefoot on the wooden floor, a glass of red wine cool against your fingers.
> Your wife stands in the doorway with her dark hair loose over one shoulder, wearing the green dress you love.
> She looks at you for a long moment, and her eyes are bright and unhurried.
> She crosses the room and rests her palm flat against your chest.
> She says, You are really here with me tonight, I can feel it.
> You feel your heartbeat slow under her hand, and your jaw loosens into a smile.
> She says your name softly, as if it were something she has been saving.
> You set down the glass and draw her close, and her forehead rests against yours.
> The evening is deeply intimate and passionate, and it is yours.
> Her laugh is low and warm against your neck, and her fingers curl into your shirt.
> You are a husband who is wholly present, and you are loved without holding anything back.
> A doubt drifts through like a draft under the door, and you let it go by.
> Slow music plays from the kitchen, and the two of you sway in the candlelight.
> Thank you, you whisper, thank you, thank you.
> The passionate evening with your wife is yours.
> It is done.
