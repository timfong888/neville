# Script setup, old vs new (#170)

Prompt lesson1-v2. Effort low. Judge google/gemini-2.5-flash (0 to 2). Regenerate with `npm run eval:compare`.

| setup | model | from model | words | visual | parses | tense slips | slogans | sexual terms | cost per script | time |
|---|---|---|---|---|---|---|---|---|---|---|
| old | google/gemini-2.5-flash-lite | 12/13 | 62 | 1.42 | 1.92 | 4 | 1 | 0 | $0.0001 | 0.6 s |
| new | x-ai/grok-4.6, anthropic/claude-sonnet-5.5 | 13/13 | 232 | 2.00 | 2.00 | 4 | 0 | 0 | $0.0076 | 16.6 s |

## old · neutral · I want to own a small house by the sea

model: google/gemini-2.5-flash-lite · source: model · 52 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all present tense.)

> You are now home.
> You own your small house.
> Your small house by the sea.
> The ocean air is here.
> You feel the quiet peace.
> The waves whisper outside.
> You trace the warm wood.
> This small house by the sea.
> This is your own place.
> Thank you.
> Thank you.
> It is done.

## new · neutral · I want to own a small house by the sea

model: x-ai/grok-4.6 · source: model · 219 words · $0.0054 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent detail, all present tense, no odd sentences.)

> You stand on the wooden porch of your small house by the sea as dusk settles over the water.
> The house by the sea is yours.
> Cool salt air touches your face and the railing feels smooth under your hands.
> Warm kitchen light spills across the boards and the grain of the wood.
> You hear the slow wash of waves on the stones below the cliff.
> You smell brine and wood smoke mixed with the damp of evening.
> You step inside and shut the door with a soft click.
> The house by the sea is yours.
> You hold a warm mug, the ceramic solid against your palms, and sit by the window.
> A lamp glows on the table and the room is still except for the tide.
> Your shoulders drop and your jaw rests easy as you look at the dark water.
> You are the one who lives here now, in this small house, at this hour.
> You rest your hand on the arm of the chair that belongs to this room.
> Thank you for this house by the sea.
> You breathe in the quiet and feel warmth in your chest.
> The house by the sea is yours.
> You sit alone with it and let the thanks settle like the lamp light.
> Thank you.
> Thank you.
> It is done.

## old · neutral · I want to heal my relationship with my sister

model: google/gemini-2.5-flash-lite · source: model · 66 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 0 (Some images, but also abstractions like 'loving connection'.)

> You and your sister laugh together.
> Your hearts feel light and full.
> You and your sister laugh together.
> A gentle peace settles between you.
> Your sister says, It's so good to feel this again.
> You feel a warmth spread through you.
> You and your sister laugh together.
> This loving connection is restored.
> You are at peace with your sister.
> Thank you. Thank you.
> It is done.

## new · neutral · I want to heal my relationship with my sister

model: x-ai/grok-4.6 · source: model · 238 words · $0.0067 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent, vivid, present-tense script.)

> You stand in the kitchen as late sun lays gold across the counter and the wood grain under your palms.
> Your sister hangs her coat in the hall and her laugh carries in, low and familiar.
> A close friend leans in the doorway, her dark hair pulled back, her cardigan sleeves pushed to the elbows, her eyes warm on you.
> She hears the two of you and her mouth curves as she says you sound like yourselves again.
> You feel the warmth spread through your chest and your jaw rest easy.
> Your relationship with your sister is healed.
> She steps closer and rests a hand on your shoulder, her voice quiet and sure.
> You hear her say it once more, that the old ease is back between you.
> You smell coffee and the faint soap on your sister’s scarf as she comes in.
> Your sister looks at you with the same open face she had as a girl, her shoulders loose in her sweater.
> You hold the mug, cool glass against your fingers, and you nod without needing to explain.
> Your relationship with your sister is healed.
> You are a sister who sits easy in the same room and lets the talk wander.
> Thank you for this ordinary afternoon.
> Thank you that her laugh belongs here.
> Thank you that a friend can see it and say it aloud.
> Your relationship with your sister is healed.
> It is done.

## old · neutral · I want to finish writing my book

model: google/gemini-2.5-flash-lite · source: model · 57 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all sentences are clear.)

> You hold the printed book in your hands.
> You finish writing your book.
> It feels solid and real.
> You turn it over, reading the cover.
> Your name is on the front.
> You finish writing your book.
> You feel a quiet pride.
> This is truly yours.
> You finish writing your book.
> Thank you.
> Thank you.
> It is done.

## new · neutral · I want to finish writing my book

model: x-ai/grok-4.6 · source: model · 228 words · $0.0082 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent detail, all present tense.)

> You sit at the wooden desk with the finished manuscript closed under your palms.
> The lamp lays a warm gold circle across the paper and the dark grain of the table.
> You smell ink and dry paper and the faint coffee left in the mug at your elbow.
> Your book is finished.
> Cool air from the window touches your wrists while the rest of the room stays still.
> Your shoulders drop and your jaw hangs loose as you look down at the title page.
> You lift the stack and feel its solid weight settle in your lap.
> The edges of the pages are slightly rough under your thumbs.
> You turn to the last sheet and see the final line in your own hand.
> A friend stands in the doorway with her hair pulled back and a quiet smile, and she says the book is done.
> You keep the pages in your hands and hear her voice land in the quiet room.
> Your book is finished.
> You are a writer who has written the whole story through to the end.
> Thank you for this finished book.
> You rest the manuscript on the desk again and feel the warmth stay in your chest.
> Evening light sits blue on the window glass.
> Your book is finished.
> You press the pages together once more and let the quiet hold.
> It is done.

## old · neutral · I want to feel calm and confident when I speak in public

model: google/gemini-2.5-flash-lite · source: model · 54 words · $0.0001 · visual 0/2 · parses 2/2 · tense slips 0 (Mostly slogans, no concrete details.)

> You speak with a quiet confidence.
> Your voice is steady and clear.
> You feel calm and confident.
> Your words flow with ease.
> You enjoy sharing your thoughts.
> You feel calm and confident.
> You are a natural speaker.
> You feel calm and confident.
> This ease feels so right.
> Thank you.
> Thank you.
> It is done.

## new · neutral · I want to feel calm and confident when I speak in public

model: anthropic/claude-sonnet-5.5 · source: model · 253 words · $0.0082 · visual 2/2 · parses 2/2 · tense slips 2 (Two sentences are in the past tense.)

> You stand at the front of a small room, and your hands rest easily on the edge of the wooden lectern.
> The wood is smooth and slightly warm under your palms.
> Your breath moves low and slow, and your shoulders sit loose and wide.
> The lamps give a soft gold light, and the faces turned toward you are kind and curious.
> You begin to speak, and your voice comes out steady, round and unhurried.
> Calm and confident in front of a room is what you are.
> The talk is over now, and the room has emptied, and you are alone with the quiet.
> You sit in a chair by the window with a cup of tea warming your fingers.
> The street outside is dim, and a few lights shine in the windows across the road.
> You feel a gentle glow in your chest, and your jaw is soft, and your belly is easy.
> You remember the pause you took in the middle, and how the silence felt like a friend.
> A small doubt drifts through, and it passes like a cloud, and you return to the quiet room.
> Speaking in public is easy for you, and you rest in that knowing.
> You are a person whose words land gently and clearly, and people lean in to listen.
> Thank you, you say softly, and the words settle in the room like warm light.
> Thank you for this calm, thank you for this steady voice.
> Speaking in public is easy for you.
> It is done.

## old · neutral · I want to sleep deeply through the night

model: google/gemini-2.5-flash-lite · source: model · 58 words · $0.0001 · visual 0/2 · parses 1/2 · tense slips 1 ('You hold this deep rest' is odd.)

> You sleep deeply through the night.
> Your breathing is slow and even.
> You sleep deeply through the night.
> No thought breaks the calm.
> You feel so rested this morning.
> Your body is at peace.
> You sleep deeply through the night.
> You hold this deep rest.
> You are so thankful for this.
> Thank you.
> Thank you.
> It is done.

## new · neutral · I want to sleep deeply through the night

model: x-ai/grok-4.6 · source: model · 160 words · $0.0070 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent, very concrete and present tense.)

> You open your eyes to a pale wash of morning on the ceiling.
> The pillow holds the shape of your head and the room is still.
> You sleep deeply through the night.
> Cool air from the window touches your cheek.
> Your shoulders rest low against the mattress.
> You hear the faint tick of the clock and no other sound from the dark.
> Your phone lies dark on the table.
> You stretch one hand and feel the sheet smooth beside you.
> You are someone who rests all the way until morning.
> You sleep deeply through the night.
> Warmth pools in your chest as you lie there a moment longer.
> The first light makes a soft square on the wall.
> You look at the time and see a full night of rest.
> A bird calls once outside.
> You thank this deep sleep.
> You sleep deeply through the night.
> Your breath is slow and even.
> Thank you for this rest.
> It is done.

## old · neutral · I want to run a marathon this year

model: google/gemini-2.5-flash-lite · source: model · 68 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 3 (Repetitive, but no bad sentences.)

> You are a marathon runner now.
> You feel strong and steady.
> You run your marathon this year.
> You cross the finish line with ease.
> Your body feels light and capable.
> You run your marathon this year.
> You are so proud of yourself.
> A deep sense of peace washes over you.
> You run your marathon this year.
> Thank you, thank you.
> Thank you for this strength.
> It is done.

## new · neutral · I want to run a marathon this year

model: x-ai/grok-4.6 · source: model · 157 words · $0.0111 · visual 2/2 · parses 2/2 · tense slips 2 (Two sentences are in the past tense)

> You sit on the sofa in the quiet of your living room this evening.
> A small lamp lights the table in a warm gold.
> You hold the medal in your open hand and the metal is cool against your skin.
> You have run the marathon this year.
> Your legs rest easy on the cushion and your breath moves slowly.
> Cool night air from the open window touches your face.
> You hear the clock and then the hush of the street.
> You look at the paper on the table with your name and the time.
> You set the medal beside the cool glass of water.
> You have run the marathon this year.
> Warmth sits in your chest as you rest alone with it.
> You smell clean cotton from the shirt on your shoulders.
> You are a marathoner now.
> Thank you.
> You have run the marathon this year.
> The still light of the room holds you.
> It is done.

## old · attraction · I want women to approach me and show interest in me

model: google/gemini-2.5-flash-lite · source: model · 71 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good imagery and grammar throughout.) · SLOGAN: You are a magnet for connection.

> The soft lamplight warms your face.
> Women approach you with a smile.
> They show interest in your conversation.
> You feel an easy connection.
> Their eyes hold your gaze.
> You are sought after and desired.
> This feels so natural now.
> You are a magnet for connection.
> A quiet joy fills you.
> Thank you for this beautiful connection.
> Thank you for this beautiful connection.
> Thank you for this beautiful connection.
> It is done.

## new · attraction · I want women to approach me and show interest in me

model: anthropic/claude-sonnet-5.5 · source: model · 280 words · $0.0087 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent detail, all present tense.)

> The lamp by the window gives the room a soft amber glow, and you notice it first on the back of your hands.
> You are sitting in your favourite chair, the evening quiet around you.
> A cup of tea warms your palms, and the steam smells faintly of honey.
> Your shoulders are loose, and your jaw rests easy.
> You think back over the day, and the day is simply true: women approach you and show interest in you.
> One steps up to you in a bright café, her dark hair tucked behind one ear, a linen shirt rolled at the sleeves.
> She smiles with her whole face and says she has been hoping to talk with you.
> Another touches your arm lightly at a friend's gathering, her laugh low and unhurried, her eyes staying on yours.
> You see these moments again now, slowly, one after another, and a warmth spreads in the middle of your chest.
> You set the cup down on the wooden table and feel how settled you are.
> You are a man who is easy to approach, steady and kind, and people feel it.
> A doubt drifts through like a draft under a door, and you let it pass and keep your eyes on this room.
> Women approach you and show interest in you, and you are glad of it.
> The clock ticks softly in the hall, and the night outside is deep blue.
> Thank you, you say quietly, thank you, thank you.
> Women approach you and show interest in you, and your whole body knows it.
> You breathe in the honey-scented air and feel the thanks settle like a blanket across your knees.
> It is done.

## old · attraction · I want women to find me attractive when I walk into a party

model: google/gemini-2.5-flash-lite · source: model · 61 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all sentences are clear.)

> The room is warm with friendly chatter.
> You feel a gentle hum of admiration.
> Women notice your presence.
> They turn their heads as you enter.
> A woman smiles at you from across the room.
> You feel an easy confidence within you.
> This is your natural state now.
> You are deeply at peace.
> Thank you.
> Thank you.
> Thank you.
> It is done.

## new · attraction · I want women to find me attractive when I walk into a party

model: x-ai/grok-4.6 · source: model · 280 words · $0.0063 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent detail, all present tense, all sentences make sense.)

> The room holds a low gold light from lamps along the walls and the faint scent of citrus and warm wood.
> You stand just inside the doorway with a cool glass in your hand and the floor steady under your shoes.
> Women find you attractive when you walk into a party.
> Laughter rises from a cluster of people near the windows and the music sits easy in the air.
> You feel warmth across your chest and a loose ease in your jaw as you take one more step in.
> A woman with dark hair and a simple black dress looks over from the sofa, her eyes bright, her mouth already forming a smile.
> She leans toward her friend, who glances your way with the same open, unhurried look.
> You hear your name said warmly from a few feet away as if it belongs in this room.
> Women find you attractive when you walk into a party.
> An ordinary evening like this one already feels normal, the kind of night that needs no special effort.
> You walk across the rug and someone hands you another drink without fuss, their fingers brushing the glass as they pass it.
> You catch the easy glance of a woman in a green sweater by the bookshelf, her posture open, her smile small and sure.
> You are the person who walks in and is seen.
> The conversation around you includes you without strain, voices close, the night already yours.
> Women find you attractive when you walk into a party.
> Thank you for this night that simply is.
> You feel the glass cool against your palm and the room hold you as you are.
> It is done.

## old · wealth · I want my business to reach $10k a month

model: google/gemini-2.5-flash-lite · source: unusable · 0 words · $0.0001 · visual 0/2 · parses 0/2 · tense slips 0 (unusable)



## new · wealth · I want my business to reach $10k a month

model: x-ai/grok-4.6 · source: model · 218 words · $0.0062 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent, vivid and present tense.)

> You sit at the kitchen table in the soft morning light, the grain of the wood warm under your palms.
> Your sister stands across from you in a blue jumper, her hair still damp from the shower, her face open and glad.
> She looks straight at you and says your business earns ten thousand a month.
> You feel the heat of the mug in your hands and the quiet ease in your shoulders.
> The window is open a little and the air smells of coffee and toast.
> She laughs once, low, and the sound sits in the room like something already known.
> Your business earns ten thousand a month.
> She leans on the back of the chair and tells you she saw the deposit and she is proud.
> You hear her voice, warm and ordinary, saying the number as if it belongs here.
> The light on the table is pale gold and the chair is solid under you.
> You are the one whose work pays this well, month after month.
> She reaches over and rests her hand on your arm for a moment.
> You smell the soap on her skin and the bread in the toaster.
> Your business earns ten thousand a month.
> Thank you for this morning and this ease.
> Thank you.
> Thank you.
> It is done.

## old · wealth · I want to be debt free and have savings I never worry about

model: google/gemini-2.5-flash-lite · source: model · 60 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all sentences are clear.)

> The soft lamplight fills your room.
> You are debt free, completely free.
> You have savings, a peaceful flow.
> You hold the bank statement now.
> It shows a balance you love.
> A quiet joy settles within.
> You are debt free, at last.
> You have savings, deeply calming.
> You breathe in this freedom.
> You feel a gentle thank you.
> It is done.

## new · wealth · I want to be debt free and have savings I never worry about

model: x-ai/grok-4.6 · source: model · 214 words · $0.0095 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent detail, all present tense, no odd sentences.)

> You notice the lamp on the side table throwing a warm circle of gold across the wooden floor.
> The room is quiet except for the low hum of the fridge.
> You sit in the armchair with a mug of tea in both hands.
> The ceramic is smooth and warm against your palms.
> You are debt free and you have savings you never worry about.
> Evening light rests on the curtains and the air smells of tea and clean cotton.
> Your shoulders rest easy and warmth spreads through your chest.
> You look at the phone on the table and open the banking screen.
> The numbers sit still and the balance is yours with nothing owed.
> You set the phone down and rest your hand on the arm of the chair.
> You are debt free and you have savings you never worry about.
> You hear the clock tick once and then only the quiet of the house.
> You are the person who lives with money that is settled and enough.
> You breathe out and feel thankfulness in your throat and chest.
> Thank you for this quiet evening and this ease.
> You are debt free and you have savings you never worry about.
> You sip the tea and taste the warmth on your tongue.
> It is done.

## old · health · I want to be healthy, strong and full of energy

model: google/gemini-2.5-flash-lite · source: model · 60 words · $0.0001 · visual 1/2 · parses 2/2 · tense slips 0 (A few images, but mostly slogans.)

> You are healthy.
> You feel strong in your body.
> You are full of energy.
> Your friend smiles, You look so well.
> You feel so good today.
> You are healthy.
> You move with ease.
> You are full of energy.
> Your loved one holds your hand.
> You are healthy.
> You feel grateful for this feeling.
> Thank you.
> Thank you.
> It is done.

## new · health · I want to be healthy, strong and full of energy

model: x-ai/grok-4.6 · source: model · 247 words · $0.0089 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent, vivid and present.)

> You stand at the kitchen counter in pale morning light with a warm mug in both hands.
> Your sister sets her bag on the chair, her dark hair still damp from the walk, her coat open, her eyes bright.
> She looks at you the way she does when she is sure of something, and her mouth eases into a real smile.
> She rests her hand on your shoulder and says you look strong and well today.
> You feel the heat of the mug, the solid floor under your feet, and the easy rise of your breath.
> You are healthy, strong and full of energy.
> She stays close and tells you there is colour in your face and a spring in how you stand.
> You hear the small laugh in her voice and the kettle ticking as it cools.
> The air smells of tea and wet leaves from the open window.
> Warmth sits in your chest and your jaw is loose.
> You sip and the steam touches your lip while she watches you with quiet pride.
> You are healthy, strong and full of energy.
> You are the one who moves through the morning with clear eyes and steady limbs.
> Thank you for this strength in your body.
> The light on the counter is soft and the mug is still warm.
> You hear her say it again, simply, as if it is the most ordinary fact.
> You are healthy, strong and full of energy.
> Thank you.
> It is done.

## old · health · I want my back pain to be gone

model: google/gemini-2.5-flash-lite · source: model · 72 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good concrete details, all sentences are clear.)

> The soft light falls on your hands.
> Your back is free from pain.
> You feel a gentle ease.
> Your back is free from pain.
> You reach for the book on the shelf.
> Your movement is smooth and effortless.
> This ease is your natural state.
> Your back is free from pain.
> You are a person of quiet strength.
> Thank you for this deep relief.
> Thank you for this deep relief.
> It is done.

## new · health · I want my back pain to be gone

model: x-ai/grok-4.6 · source: model · 220 words · $0.0062 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent detail, all present tense and grammatical.)

> You notice the pale morning light lying across the kitchen tiles and the quiet shine of the kettle.
> Warm air from the window touches your face as you stand with both feet planted.
> You hold a mug of tea and the heat soaks into your palms.
> Your back is free of pain.
> You feel the length of your spine and the easy drop of your shoulders.
> You walk to the counter and lift a bowl from a high shelf without thinking.
> The reach is simple and your body stays loose.
> You set the bowl down and sit in the wooden chair by the table.
> You lean back and the chair takes your weight while your jaw stays soft.
> You type a short note on your phone with both hands resting easy.
> Your back is free of pain.
> You stand, pick up your keys, and bend to tie a shoe by the door.
> The bend comes and goes like any other ordinary motion.
> A neighbour on the path looks over and smiles as you straighten.
> You return the smile and walk out into the cool air of the street.
> You are a person who moves through the day without guarding your body.
> Thank you for this ease that already belongs to you.
> Your back is free of pain.
> It is done.

## old · intimacy · I want a deeply intimate, passionate evening with my wife

model: google/gemini-2.5-flash-lite · source: model · 70 words · $0.0001 · visual 2/2 · parses 2/2 · tense slips 0 (Good imagery, all sentences are clear and present tense.)

> You notice the soft glow of the lamp.
> Your wife’s hand rests warm in yours.
> You feel a deep, quiet passion.
> Her eyes meet yours with pure love.
> She whispers, This is perfect.
> You share this deeply intimate evening.
> This is your passionate life together.
> You feel this connection so strongly.
> You share this deeply intimate evening.
> You are so present and loving.
> Thank you, thank you.
> It is done.

## new · intimacy · I want a deeply intimate, passionate evening with my wife

model: x-ai/grok-4.6 · source: model · 300 words · $0.0064 · visual 2/2 · parses 2/2 · tense slips 0 (Excellent detail, all present tense, all sentences make sense.)

> You notice the low lamp light pooling gold on the wooden table and the faint scent of her perfume in the still room.
> The curtains hang closed and the house holds a quiet that belongs only to the two of you tonight.
> You sit close to your wife on the sofa with her knee against yours and her hand warm in your palm.
> This intimate evening with your wife is yours.
> She looks at you with dark eyes and a slow smile, her hair falling over one shoulder, her skin warm in the lamplight, her voice low.
> You feel the warmth in your chest and the easy looseness in your jaw as her fingers rest on your arm.
> She leans in and you feel her breath and the soft press of her mouth against yours.
> This intimate evening with your wife is yours.
> She draws back just enough to meet your eyes and she says, I love how close we are tonight, how this evening is only ours.
> You hear the words in her warm voice and you hold her hand a little tighter.
> She rests her head against your shoulder and you feel the weight of her and the slow rise of her breathing.
> The room stays still around that one moment, the lamp, the sofa, her voice still in the air.
> You are the man who shares this night with her, present and open in your own body.
> You taste the last of the wine on your tongue and you smell the clean cotton of her shirt against your cheek.
> Thank you for this night that is already here.
> This intimate evening with your wife is yours.
> You feel her hand on your chest and you stay inside the scene as it is.
> Thank you.
> It is done.
