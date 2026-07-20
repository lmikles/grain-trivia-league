/**
 * api/trivia.js
 * Grain Craft Bar + Kitchen — AI Trivia Question Generator
 *
 * POST /api/trivia
 * Requires: Authorization: Bearer <HOST_SECRET>
 *
 * Body: { mode, weekNumber?, avoidList?, ...options }
 *
 * Modes
 * ─────────────────────────────────────────────────────────────────────────────
 * 'round1'     Grain's House Round (food, drink, craft beer, cocktails)
 *              10 questions · 1pt each · same at all locations
 *
 * 'round2'     Weekly Theme (location-specific)
 *              options: { location: string, theme: string }
 *              10 questions · 1pt each
 *
 * 'round3'     General Knowledge (rotating subcategory) — the WEIRD round
 *              options: { subcategory: 'Geography' | 'Science & Nature' | 'History' | 'Current Events' }
 *              10 questions · 1pt each · same at all locations
 *
 * 'lightning'  Lightning Round (rapid-fire, all answers submitted at end)
 *              options: { topic?: string }
 *              8 questions · 2pts each
 *
 * 'lastcall'   Last Call (wagering question — announce category first)
 *              options: { category: string }
 *              1 question · wagered pts
 *
 * 'location-night'  Generate one full location's night at once
 *              options: { location: string, round2Theme: string, round3Subcategory: string,
 *                         lastCallCategory: string, lightningTopic?: string }
 *              Fires 5 parallel API calls (round1, round2, round3, lightning, lastcall)
 *
 * 'theme-night'  All-theme night — every round explores the same theme from a different angle
 *              options: { theme: string, location: string, lastCallCategory?: string }
 *              Fires 5 parallel API calls with theme-specific prompts
 *
 * Shared params (all modes):
 *   weekNumber  number   — Week number in season; used to encourage fresh questions
 *   avoidList   string[] — Questions from previous weeks to avoid repeating
 *
 * Required env vars: OPENAI_API_KEY (primary), OPENROUTER_API_KEY (fallback), HOST_SECRET (+ per-store secrets)
 */

const { isValidHostSecret } = require('../lib/auth');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ─── Accuracy rules — prepended to every prompt via avoidBlock ───────────────

const ACCURACY_RULES = `ACCURACY REQUIREMENTS — CHECK EVERY QUESTION BEFORE WRITING IT:
• ONE CORRECT ANSWER: Before writing each question, ask yourself: "Could a knowledgeable person reasonably give a different answer?" If yes — add specificity (use "only", "first", "most", a specific year, a specific place) or discard the question entirely. BAD: "Which animal can survive being frozen?" (Many can.) GOOD: "What is the only North American frog known to freeze completely solid — heart stopped, no breathing — and revive each spring?" (Wood frog — unique and unambiguous.)
• VERIFY EVERY FACT: If you are not 100% certain a fact is correct and well-documented in reliable sources, do not use it. Write a different question instead.
• NO LOCAL VENUE SUPERLATIVES: Do not describe any specific local venue, bar, theater, restaurant, or institution as "famous for X," "a mecca for Y," "the birthplace of Z," or any similar superlative unless this is a nationally-documented fact appearing in major national publications.
• DELAWARE — VERIFIED FACTS ONLY: Only use Delaware facts that are publicly documented and verifiable: First state to ratify the US Constitution (December 7, 1787) — "The First State"; no state sales tax; Joe Biden represented Delaware in the US Senate for 36 years; DuPont Company founded in Wilmington in 1802; Caesar Rodney's midnight ride to Philadelphia to sign the Declaration of Independence; Blue Hen is the state bird; Dover is the state capital; Fort Delaware on Pea Patch Island was a Civil War prison camp; Delaware has three counties (New Castle, Kent, Sussex). Do not invent Delaware cultural claims or attribute unverified significance to specific local venues.`;

// ─── Repeat-prevention block appended to every prompt ────────────────────────

function avoidBlock(weekNumber, avoidList) {
  const lines = [];

  if (weekNumber && weekNumber > 1) {
    lines.push(
      `SEASON CONTEXT: This is Week ${weekNumber} of an ongoing trivia league season. ` +
      `Questions from prior weeks have already covered the most obvious territory. ` +
      `Push further — go deeper, get more specific, find the less-visited corners of each topic. ` +
      `The longer the season runs, the more important freshness becomes.`
    );
  }

  if (Array.isArray(avoidList) && avoidList.length > 0) {
    // Cap at 30 to keep prompt size reasonable
    const sample = avoidList.slice(0, 30);
    lines.push(
      `QUESTIONS ALREADY USED — do not repeat these or ask about the same specific facts:\n` +
      sample.map(q => `• ${q}`).join('\n')
    );
  }

  const context = lines.length > 0 ? '\n\n' + lines.join('\n\n') : '';
  return '\n\n' + ACCURACY_RULES + context;
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function promptRound1(weekNumber, avoidList) {
  return `You are writing trivia questions for the weekly trivia league at Grain Craft Bar + Kitchen, a craft beer bar and restaurant with three locations in Wilmington, Delaware.

Generate exactly 10 trivia questions for ROUND 1: GRAIN'S HOUSE ROUND.

This round covers three topic areas: food & drink, craft beer & cocktails, and Delaware. It runs the same at all three Grain locations every week and is the signature round of the league. Aim for roughly 3–4 questions per area per night, mixed in no particular order.

TOPIC AREA 1 — FOOD & DRINK: beer styles & brewing process, cocktails & spirits, wine, food & flavor pairing, famous bars & breweries, bar/restaurant culture
TOPIC AREA 2 — CRAFT BEER & COCKTAILS: the craft beer movement, specific brewery history, cocktail origins, spirits production, beer & food pairing, mixology
TOPIC AREA 3 — DELAWARE: Delaware history, geography, and culture — the First State, notable Delawareans, state symbols, Wilmington and its neighborhoods, Delaware firsts, Delaware in American history, unique Delaware laws or facts

REQUIREMENTS:
• Difficulty curve: Q1–3 warm-up (most bar guests can get these), Q4–7 require real knowledge, Q8–10 should stump most people — niche, specific, insider territory
• AVOID the obvious: No "What country does Guinness come from?" or "What is Delaware's nickname?" level questions — go deeper into the second and third layer of each topic
• Think: not just what a thing IS, but HOW it works, WHERE it originated, WHO invented it, WHAT the unusual rule or exception is
• Answers must be clear, specific, and unambiguous
• Short answers strongly preferred (a style name, a country, a number, a name) over long phrases
• Fun, conversational bar-trivia voice — not academic or textbook
• Do NOT write multiple-choice options — this is open-answer bar trivia${avoidBlock(weekNumber, avoidList)}

Return ONLY a valid JSON array with no markdown fences, no explanation, nothing else:
[{"question":"...","answer":"..."},...]`;
}

function promptRound2(location, theme, weekNumber, avoidList) {
  return `You are writing trivia questions for the weekly trivia league at Grain Craft Bar + Kitchen, ${location}, Delaware.

Generate exactly 10 trivia questions for ROUND 2: WEEKLY THEME — "${theme}".

This is the location-specific round. Teams at ${location} were told the theme ("${theme}") in advance on Grain's social media, so some teams will have studied up. This creates competitive tension.

REQUIREMENTS:
• ALL 10 questions must clearly and unambiguously fit the "${theme}" theme — no tangential or loose connections
• Difficulty curve: Q1–4 accessible (casual fans who glanced at the theme can get these), Q5–8 require real knowledge, Q9–10 deep cuts that only true fans or people who seriously prepared will know
• AVOID the most famous facts: Do not write questions about the single most obvious facts about this theme. Everyone writing trivia on "${theme}" reaches for the same 5 questions — avoid all of them. Dig into the second and third layer of the topic.
• Mix question styles: surprising firsts, record-holders, "what was the original name of...", behind-the-scenes facts, obscure but verifiable details, unexpected connections
• Answers must be verifiable, specific, and unambiguous — this is competitive trivia with real stakes
• Short answers preferred (a name, a year, a title, a place)
• Good trivia teaches people something — aim for "oh wow, I never would have guessed that" moments
• Do NOT write multiple-choice options — this is open-answer bar trivia${avoidBlock(weekNumber, avoidList)}

Return ONLY a valid JSON array with no markdown fences, no explanation, nothing else:
[{"question":"...","answer":"..."},...]`;
}

function promptRound3(subcategory, weekNumber, avoidList) {
  const guidance = {
    // Classic knowledge
    'Geography':                    'world geography — countries, capitals, rivers, mountain ranges, borders, national flags, famous landmarks, physical features of Earth',
    'Science & Nature':             'science and nature — biology, chemistry, physics, astronomy/space, geology, the animal kingdom, botany, the human body, famous scientists, major inventions',
    'History':                      'world history and American history — major wars and battles, historical figures, turning point events, treaties, movements, important dates, historical firsts',
    'Current Events':               'news and cultural moments from the past 12–24 months — world news, major political events, science/technology breakthroughs, notable cultural and sports moments',
    // Entertainment
    'Movies & Film':                'film history, directors, actors, Oscar winners, famous movie quotes, box office records, behind-the-scenes facts, cult classics, franchises, and the strange business of Hollywood',
    'TV Shows':                     'television history and culture — iconic shows, memorable characters, spinoffs, network history, ratings records, behind-the-scenes drama, streaming era, and the weird facts only superfans know',
    'Music':                        'music history across all genres — artists, albums, chart records, band histories, famous feuds and collaborations, Grammy facts, music industry trivia, and surprising origin stories behind famous songs',
    'Pop Culture':                  'pop culture moments, internet phenomena, viral trends, fashion moments, tabloid history, celebrity culture, memes, and the things everyone was obsessed with but nobody studied',
    '90s Nostalgia':                'the 1990s — TV shows, movies, music, toys, fashion, slang, video games, sports moments, and the cultural touchstones of a generation',
    'Celebrity Trivia':             'famous people and their surprising real lives — celebrity origin stories, real names, unexpected careers, famous feuds, record-holders, and facts that sound made-up but aren\'t',
    // Sports
    'Sports':                       'sports history across all major sports — records, championships, legendary athletes, rule oddities, famous moments, and surprising facts that even sports fans don\'t know',
    'NFL Football':                 'NFL history — Super Bowl records, legendary players and coaches, rule changes, franchise history, draft stories, and the strange facts behind America\'s most popular sport',
    'Major League Baseball':        'MLB history — records, World Series moments, legendary players, stadium facts, rule oddities, famous trades, and the deep well of weird baseball history',
    'NBA Basketball':               'NBA history — championship runs, legendary players, draft stories, record holders, rule changes, and the surprising facts behind the world\'s best basketball league',
    'Sports Records & Firsts':      'records, firsts, and milestones across all sports — the most, the least, the fastest, the slowest, the first ever, and the records that seem impossible but are real',
    // Knowledge & Fun
    '5th Grade Trivia':             'things everyone technically learned in school but mostly forgot — basic math facts, state capitals, famous historical figures, simple science, literary classics, and grade-school knowledge that\'s harder to recall than it should be',
    'Useless but Fascinating Facts':'random, surprising, and delightfully pointless facts — bizarre animal behaviors, absurd historical events, counterintuitive science, strange records, and trivia that serves no practical purpose but is impossible to forget',
    'Famous Firsts':                'historical firsts across every category — first to invent, first to achieve, first to discover, first to win, and the surprising stories behind the very first time something happened',
    'Animals & Nature':             'the animal kingdom and the natural world — bizarre creature behaviors, evolutionary oddities, record-holding animals, surprising facts about common species, and the strange science of the natural world',
    'Tech & Gadgets':               'technology history and culture — who invented what, Silicon Valley stories, famous product failures and successes, internet history, gaming milestones, and the surprising facts behind everyday technology',
    'Food & Cuisine':               'food history, culinary traditions, record-breaking foods, restaurant history, food science, origin stories of famous dishes, and surprising facts about things everyone eats every day',
  }[subcategory] || subcategory;

  return `You are writing trivia questions for the weekly trivia league at Grain Craft Bar + Kitchen, Delaware.

Generate exactly 10 trivia questions for ROUND 3: GENERAL KNOWLEDGE — ${subcategory.toUpperCase()}.

This round covers: ${guidance}. It runs the same at all three Grain locations each week.

Round 3 has a specific personality: it is the WEIRD round. By this point in the night teams need something surprising. These questions should be harder, stranger, and more memorable than anything in Rounds 1 or 2.

REQUIREMENTS:
• ALL 10 questions must belong in the ${subcategory} category — but find the strange, unexpected corners of it
• Difficulty: harder across the board — there are no warm-up questions here. Q1–4 are what would be Q7–9 in a normal round. Q5–10 are genuinely difficult.
• WEIRD means: counterintuitive answers, facts that sound wrong but are right, obscure truths that most people have never encountered, connections nobody would guess, things that make teams say "wait, WHAT?"
• Actively seek out: facts that contradict common assumptions, animals/places/things that defy expectations, historical events most people have never heard of, science facts that seem impossible, records held by unlikely things or people
• Avoid any question that sounds like it belongs in a school quiz, a standard trivia deck, or Wikipedia's front page
• The answer should feel SURPRISING even to people who know the category well
• Answers must still be unambiguous and verifiable — weird does not mean vague
• Short, specific answers preferred
• QUESTION LENGTH: Keep each question TEXT short and punchy — one sentence, 20 words or fewer. Do not use long setups or multi-clause constructions. Bad example: "Although most countries have rivers, there is one nation that uniquely has none at all — what is it?" Good example: "What is the only country in the world with no rivers?" Same weirdness, half the words.
• Do NOT write multiple-choice options — this is open-answer bar trivia${avoidBlock(weekNumber, avoidList)}

Return ONLY a valid JSON array with no markdown fences, no explanation, nothing else:
[{"question":"...","answer":"..."},...]`;
}

function promptLightning(topic, weekNumber, avoidList) {
  const topicLine = topic
    ? `Tonight's Lightning Round theme: "${topic}" — all 8 questions must clearly fit this theme.`
    : 'Draw from a variety of topics — variety makes the Lightning Round feel energetic.';

  return `You are writing questions for the Lightning Round at Grain Craft Bar + Kitchen trivia night, Delaware.

Generate exactly 8 questions for the LIGHTNING ROUND.

Lightning Round rules (important context):
• Teams hear all 8 questions read quickly, then submit ALL answers at once on a single sheet
• Worth 2 points each — no partial credit
• The round is designed to feel fast and exciting when read aloud

${topicLine}

REQUIREMENTS for each question:
• Answers MUST be SHORT — ideally 1–3 words (a name, a number, a year, a place, a single word)
• Questions must be punchy and quick to read aloud — no long setup, no multi-part questions
• Absolute zero ambiguity in the answer — rapid-fire with no discussion, so the answer must be unmistakable
• Each question must be fully self-contained — no building on previous questions
• Avoid questions with multiple defensible answers ("name a..." or "give an example of...")
• AVOID the obvious: Do not write questions where the answer is the first thing everyone thinks of. Push into the less-visited facts — the second city, the lesser-known record, the surprising number, the unexpected connection${avoidBlock(weekNumber, avoidList)}

Return ONLY a valid JSON array with no markdown fences, no explanation, nothing else:
[{"question":"...","answer":"..."},...]`;
}

function promptLastCall(category, weekNumber, avoidList) {
  return `You are writing the final question for trivia night at Grain Craft Bar + Kitchen, Delaware.

Generate exactly 1 LAST CALL question.

Announced category: "${category}"

Last Call rules (critical context):
• Before hearing the question, teams write a secret wager: 1 point up to their full current score
• Teams with zero points wager zero but still participate
• Teams that don't submit a wager card forfeit 5 points
• After wagering is locked, the host reads the question
• Correct = add wager to score; Incorrect = lose wager
• A team down by 10 points CAN win the night. A team in first has a real decision to make.
• Hosts build drama: "This is the moment everything changes."

REQUIREMENTS:
• The question MUST clearly be within the "${category}" category — teams wagered based on this
• Should feel worthy of a finale — meaningful, memorable, not trivial
• The answer must be completely unambiguous — no ties, no "both X and Y are correct", no regional variation
• Genuinely challenging but fair — teams should feel they had a real chance if they knew the category
• Avoid facts so obscure that a team who confidently knows the category would still have no idea${avoidBlock(weekNumber, avoidList)}

Return ONLY a single valid JSON object with no markdown fences, no explanation, nothing else:
{"question":"...","answer":"..."}`;
}

// ─── Theme Night prompt builders ─────────────────────────────────────────────
// Five different lenses on the same theme, used when the host runs an all-theme night.

function promptThemeRound1(theme, weekNumber, avoidList) {
  return `You are writing trivia questions for a special ALL-THEME trivia night at Grain Craft Bar + Kitchen, Delaware. Tonight's theme is: "${theme}".

Generate exactly 10 trivia questions for ROUND 1: FOOD, DRINK & DELAWARE — all filtered through the "${theme}" lens.

This is the House Round, normally covering food/drink and Delaware. Tonight it stays in that world BUT connects everything to the "${theme}" theme.

STRUCTURE: Split your 10 questions across two areas:
• Q1–6: FOOD & DRINK angle on "${theme}" — craft beer, cocktails, food, bar culture connected to the theme. What did they eat/drink? What drinks share their name? What food or drink is famous in the places/era they represent? Did they inspire cocktails, beers, or dishes?
• Q7–10: DELAWARE angle on "${theme}" — any real connection between "${theme}" and Delaware: Did it happen here? Is something from the theme located in Delaware? Did a Delaware person, place, or institution play a role? Delaware firsts or connections to the theme. If no direct connection exists, use Delaware craft beer/food facts that relate loosely to the theme.

REQUIREMENTS FOR ALL QUESTIONS:
• These must be REAL facts — verifiable, specific, unambiguous
• Q1–3: accessible warm-up, Q4–7: require real knowledge, Q8–10: niche insider territory
• Short punchy questions (20 words or fewer ideally)
• No multiple-choice — open-answer bar trivia${avoidBlock(weekNumber, avoidList)}

Return ONLY a valid JSON array with no markdown fences, no explanation, nothing else:
[{"question":"...","answer":"..."},...]`;
}

function promptThemeRound2(theme, location, weekNumber, avoidList) {
  return `You are writing trivia questions for a special ALL-THEME trivia night at Grain Craft Bar + Kitchen, ${location}, Delaware. Tonight's theme is: "${theme}".

Generate exactly 10 trivia questions for ROUND 2: THE CORE THEME ROUND — "${theme}".

Teams were told the theme in advance on social media. This is the straight-ahead deep dive into the theme itself.

REQUIREMENTS:
• ALL 10 questions must be directly about "${theme}" — no loose connections
• Difficulty curve: Q1–4 accessible (casual fans who studied the theme can get these), Q5–8 require real knowledge, Q9–10 deep cuts that only people who seriously know "${theme}" will get
• AVOID the single most famous facts about "${theme}" — every trivia writer reaches for the same obvious questions. Skip the top 5 most Googleable facts and find the second and third layer
• Mix question styles: surprising firsts, record-holders, origin stories, behind-the-scenes facts, unexpected connections, things that sound wrong but are right
• Answers: verifiable, specific, unambiguous, short (a name, a year, a title, a place)
• No multiple-choice — open-answer bar trivia${avoidBlock(weekNumber, avoidList)}

Return ONLY a valid JSON array with no markdown fences, no explanation, nothing else:
[{"question":"...","answer":"..."},...]`;
}

function promptThemeRound3(theme, weekNumber, avoidList) {
  return `You are writing trivia questions for a special ALL-THEME trivia night at Grain Craft Bar + Kitchen, Delaware. Tonight's theme is: "${theme}".

Generate exactly 10 trivia questions for ROUND 3: THE WEIRD SIDE of "${theme}".

This round has a specific personality: it is the WEIRD round. By this point in the night teams need something surprising. These questions take the theme into its strangest, most counterintuitive, most "wait — WHAT?!" corners.

REQUIREMENTS:
• ALL questions must be genuinely about "${theme}" — no loose connections
• Difficulty: harder across the board — no warm-up questions. Start hard, get harder.
• WEIRD means: facts about "${theme}" that sound wrong but are right, the most counterintuitive truths, things even big fans have never heard, unexpected connections, things that happened that defy expectations, the obscure underbelly of the subject
• Actively seek: misconceptions people have about "${theme}", facts that contradict what most people think they know, strange historical details, surprising records or statistics, the dark/weird/funny/unexpected side of the subject
• The answer should feel SURPRISING even to people who know "${theme}" well
• Questions MUST be short and punchy — one sentence, 20 words or fewer. No long setups.
• Answers: unambiguous, verifiable, specific
• No multiple-choice — open-answer bar trivia${avoidBlock(weekNumber, avoidList)}

Return ONLY a valid JSON array with no markdown fences, no explanation, nothing else:
[{"question":"...","answer":"..."},...]`;
}

function promptThemeLightning(theme, weekNumber, avoidList) {
  return `You are writing questions for a LIGHTNING ROUND at a special ALL-THEME trivia night at Grain Craft Bar + Kitchen, Delaware. Tonight's theme is: "${theme}".

Generate exactly 8 questions for the LIGHTNING ROUND — all about "${theme}".

Lightning Round rules:
• Teams hear all 8 questions read quickly, then submit ALL answers at once
• Worth 2 points each — no partial credit
• Read fast — the pace is part of the fun

REQUIREMENTS:
• ALL 8 questions must clearly be about "${theme}"
• Answers MUST be SHORT — 1–3 words (a name, a number, a year, a word)
• Questions must be punchy and fast to read aloud — no long setup, no multi-part questions
• Zero ambiguity in the answer — teams submit all at once with no chance to clarify
• AVOID the most obvious facts about "${theme}" — go for the second and third tier, the surprising specifics
• Each question must be fully self-contained${avoidBlock(weekNumber, avoidList)}

Return ONLY a valid JSON array with no markdown fences, no explanation, nothing else:
[{"question":"...","answer":"..."},...]`;
}

function promptThemeLastCall(theme, lastCallCategory, weekNumber, avoidList) {
  const categoryNote = lastCallCategory && lastCallCategory !== theme
    ? `\n\nThe announced category is: "${lastCallCategory}" (a specific angle within the "${theme}" theme).`
    : `\n\nThe announced category is: "${theme}".`;

  return `You are writing the final question for a special ALL-THEME trivia night at Grain Craft Bar + Kitchen, Delaware. Tonight's theme is: "${theme}".

Generate exactly 1 LAST CALL question — the dramatic finale of the night.${categoryNote}

Last Call rules:
• Before hearing the question, teams wager 1 point up to their full current score
• Teams with zero points wager zero but still participate
• After wagering is locked, the host reads the question
• Correct = add wager to score; Incorrect = lose wager
• A team down by 10 points CAN win the night. A team in first has a real decision to make.
• Hosts build drama: "This is the moment everything changes."

REQUIREMENTS:
• The question must clearly fit within the announced category — teams wagered based on this
• Make it feel worthy of a finale — the most memorable, significant, or dramatic question of the night
• Genuinely challenging but fair — a team who knows "${theme}" well should feel they had a real shot
• The answer must be completely unambiguous — no ties, no regional variation, no "either X or Y"
• Not so obscure that even devoted fans would have zero chance${avoidBlock(weekNumber, avoidList)}

Return ONLY a single valid JSON object with no markdown fences, no explanation, nothing else:
{"question":"...","answer":"..."}`;
}

// ─── Special round prompt builders ───────────────────────────────────────────

function promptMatching(category, weekNumber, avoidList) {
  const guidance = {
    'Documentaries & Subjects':    'Match 10 well-known documentary films to the real person, organization, or event they primarily focus on. Choose documentaries a bar crowd in their 20s–50s would recognise.',
    'Movies & Directors':          'Match 10 well-known films to the director who made them. Choose films a movie-literate bar crowd would recognise.',
    'Cocktails & Base Spirit':     'Match 10 classic cocktails to their primary base spirit (e.g. vodka, gin, rum, tequila, whiskey, bourbon). Choose cocktails any bar-goer would have encountered.',
    'Songs & Original Artists':    'Match 10 famous songs to the original artist who recorded them. Bonus: include some songs famously covered by others — teams must know the ORIGINAL.',
    'Famous Brands & Founders':    'Match 10 well-known companies or brands to the person who founded them.',
    'Famous Quotes & Who Said Them':'Match 10 famous quotes to the real person who said them. Mix historical figures, celebrities, and pop culture.',
    'World Capitals':              'Match 10 countries to their capital city. Include some surprising or lesser-known capitals alongside recognisable ones.',
    'Beers & Breweries':           'Match 10 well-known beers (craft or classic) to the brewery that produces them.',
    'US States & Nicknames':       'Match 10 US states to their official state nickname.',
    'Sporting Records & Athletes': 'Match 10 famous sports records or achievements to the athlete who holds them.',
    'TV Shows & Original Networks':'Match 10 iconic TV shows to the network or streaming platform that originally aired them.',
    'Delaware History':            'Match 10 Delaware-related facts, people, or places to their correct answers. Use only verified Delaware facts.',
  }[category] || `Match 10 items related to "${category}" to their correct answers — verified, specific, unambiguous pairs.`;

  return `You are writing a MATCHING ROUND for the weekly trivia league at Grain Craft Bar + Kitchen, Delaware.

Generate exactly 10 matching pairs for the MATCHING ROUND — category: "${category}".

${guidance}

REQUIREMENTS:
• Exactly 10 pairs — numbered items (the clues) and their matching answers
• Every pairing must be UNAMBIGUOUS — only one item can correctly match each answer
• All facts must be verified and accurate
• Pairs should range from accessible to challenging — not all easy, not all obscure
• The category is "${category}" — every pair must clearly fit
• No trick questions — teams should feel satisfaction from knowing or learning, not tricked${avoidBlock(weekNumber, avoidList)}

Return ONLY a valid JSON array with no markdown fences, no explanation, nothing else:
[{"number":1,"item":"...","answer":"..."},...]`;
}

function promptMysteryTheme(weekNumber, avoidList) {
  return `You are writing a MYSTERY THEME ROUND for the weekly trivia league at Grain Craft Bar + Kitchen, Delaware.

Generate a MYSTERY THEME ROUND: 5 questions where each answer contains a hidden keyword that, together, reveal a secret connecting theme.

HOW IT WORKS:
• You choose a secret theme — a set of things (e.g., card suits, planets, cocktails)
• Each of the 5 questions has a short, unambiguous answer that is a member of that theme
• After all 5 answers are revealed, teams who correctly name the connecting theme earn 5 bonus points
• The theme should only become clear once 2–3 answers are visible — not from the first question alone

EXAMPLE (do not reuse):
• Theme: "Suits in a standard deck of cards"
• Q1: "What organ pumps blood through the body?" → HEART
• Q2: "What shape is a baseball infield?" → DIAMOND
• Q3: "In golf, what is the stick used to hit the ball called?" → CLUB (clubs)
• Q4: "What is the pointed tool used to dig in a garden?" → SPADE
(Only 4 questions for a 4-item theme — choose themes with exactly 5 members)

STRONG THEME IDEAS — pick one or invent your own:
• Planets in our solar system (pick any 5)
• Dances: TANGO, WALTZ, FOXTROT, SALSA, RUMBA
• Beer styles: LAGER, STOUT, PORTER, PILSNER, WHEAT
• Classic cocktails: MOJITO, NEGRONI, MARTINI, DAIQUIRI, MANHATTAN
• Colors of the rainbow (pick any 5)
• Olympic sports
• Types of pasta
• Animals in the Chinese Zodiac (pick any 5)
• US Presidents' last names (pick any 5 iconic ones)

REQUIREMENTS:
• Exactly 5 questions
• Each answer must be a single word (or 2-word max short phrase)
• Questions must be legitimate trivia with genuinely correct, unambiguous answers
• The connecting theme should feel satisfying once revealed — an "aha!" moment
• All facts must be verified and accurate${avoidBlock(weekNumber, avoidList)}

Return ONLY a valid JSON object with no markdown fences, no explanation, nothing else:
{"theme":"...","themeReveal":"...","questions":[{"number":1,"question":"...","answer":"...","themeWord":"..."},{"number":2,"question":"...","answer":"...","themeWord":"..."},{"number":3,"question":"...","answer":"...","themeWord":"..."},{"number":4,"question":"...","answer":"...","themeWord":"..."},{"number":5,"question":"...","answer":"...","themeWord":"..."}]}`;
}

// ─── LLM API calls — GPT-4o primary, OpenRouter (Gemini 2.5 Flash) fallback ──

async function callOpenAI(prompt) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = (data.choices?.[0]?.message?.content || '').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

async function callOpenRouter(prompt) {
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenRouter API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = (data.choices?.[0]?.message?.content || '').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

async function callClaude(prompt) {
  try {
    return await callOpenAI(prompt);
  } catch (err) {
    console.error('[trivia] GPT-4o failed, falling back to OpenRouter:', err.message);
    return await callOpenRouter(prompt);
  }
}

// ─── Round generation ─────────────────────────────────────────────────────────

const ROUND_META = {
  round1:    { title: "Grain's House Round",  pointsEach: 1 },
  round2:    { title: 'Weekly Theme',          pointsEach: 1 },
  round3:    { title: 'General Knowledge',     pointsEach: 1 },
  lightning: { title: 'Lightning Round',       pointsEach: 2 },
  lastcall:  { title: 'Last Call',             pointsEach: 'wagered' },
};

async function generateRound(mode, opts = {}, weekNumber, avoidList) {
  let prompt;
  switch (mode) {
    case 'round1':    prompt = promptRound1(weekNumber, avoidList);                              break;
    case 'round2':    prompt = promptRound2(opts.location, opts.theme, weekNumber, avoidList);   break;
    case 'round3':    prompt = promptRound3(opts.subcategory, weekNumber, avoidList);            break;
    case 'lightning': prompt = promptLightning(opts.topic, weekNumber, avoidList);              break;
    case 'lastcall':  prompt = promptLastCall(opts.category, weekNumber, avoidList);            break;
    default: throw new Error(`Unknown mode: ${mode}`);
  }

  let raw = await callClaude(prompt);

  // Last Call returns a single object — normalize to array
  if (!Array.isArray(raw)) raw = [raw];

  const questions = raw.map((q, i) => {
    if (!q.question || !q.answer) throw new Error(`Question ${i + 1} missing question or answer`);
    return {
      number: i + 1,
      question: String(q.question).trim(),
      answer: String(q.answer).trim(),
    };
  });

  const category =
    mode === 'round1'    ? 'Food, Drink & Delaware' :
    mode === 'round2'    ? (opts.theme || 'Weekly Theme') :
    mode === 'round3'    ? (opts.subcategory || 'General Knowledge') :
    mode === 'lightning' ? (opts.topic || 'Mixed Topics') :
    mode === 'lastcall'  ? (opts.category || 'General Knowledge') : '';

  return {
    round: mode,
    title: ROUND_META[mode].title,
    category,
    pointsEach: ROUND_META[mode].pointsEach,
    questionCount: questions.length,
    questions,
    ...(mode === 'round2' ? { location: opts.location } : {}),
    ...(mode === 'lastcall' ? {
      lastCallNotes: 'Announce category only first. Teams wager before hearing the question.',
    } : {}),
    generatedAt: new Date().toISOString(),
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!isValidHostSecret(req.headers['authorization'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
  const { mode, weekNumber, avoidList } = body;

  // Normalize avoidList: accept a string (newline-separated) or array
  let avoid = [];
  if (Array.isArray(avoidList)) {
    avoid = avoidList.filter(Boolean);
  } else if (typeof avoidList === 'string') {
    avoid = avoidList.split('\n').map(s => s.trim()).filter(Boolean);
  }

  const VALID_MODES = ['round1', 'round2', 'round3', 'lightning', 'lastcall', 'location-night', 'theme-night', 'matching', 'mystery-theme'];
  if (!VALID_MODES.includes(mode)) {
    return res.status(400).json({
      error: `Invalid mode. Must be one of: ${VALID_MODES.join(', ')}`,
    });
  }

  try {
    // ── Location night: one location's full set, 5 parallel calls ───────────
    if (mode === 'location-night') {
      const {
        location,
        round2Theme,
        round3Subcategory = 'Geography',
        lastCallCategory = 'General Knowledge',
        lightningTopic,
      } = body;

      if (!location) return res.status(400).json({ error: 'location is required for location-night mode' });

      const gen = (m, opts) => generateRound(m, opts, weekNumber, avoid)
        .then(d => ({ ok: true, data: d }))
        .catch(err => ({ ok: false, error: err.message, round: m }));

      const [round1, round2, round3, lightning, lastcall] = await Promise.all([
        gen('round1',    {}),
        gen('round2',    { location, theme: round2Theme || 'General Knowledge' }),
        gen('round3',    { subcategory: round3Subcategory }),
        gen('lightning', { topic: lightningTopic }),
        gen('lastcall',  { category: lastCallCategory }),
      ]);

      const failed = [round1, round2, round3, lightning, lastcall].filter(r => !r.ok).length;

      return res.status(200).json({
        mode: 'location-night',
        location,
        week: weekNumber || null,
        generatedAt: new Date().toISOString(),
        scoring: {
          round1: '10 × 1pt = 10pts',
          round2: '10 × 1pt = 10pts',
          round3: '10 × 1pt = 10pts',
          lightning: '8 × 2pts = 16pts',
          maxBaseScore: 46,
          lastCall: 'Wager 1–full score',
        },
        rounds: {
          round1:    round1.ok    ? round1.data    : { error: round1.error },
          round2:    round2.ok    ? round2.data    : { error: round2.error },
          round3:    round3.ok    ? round3.data    : { error: round3.error },
          lightning: lightning.ok ? lightning.data : { error: lightning.error },
          lastcall:  lastcall.ok  ? lastcall.data  : { error: lastcall.error },
        },
        failed,
      });
    }

    // ── Theme night: all 5 rounds share one theme ─────────────────────────────
    if (mode === 'theme-night') {
      const { theme, location, lastCallCategory } = body;
      if (!theme) return res.status(400).json({ error: 'theme is required for theme-night mode' });
      if (!location) return res.status(400).json({ error: 'location is required for theme-night mode' });

      const lcCategory = lastCallCategory || theme;

      const gen = (label, promptFn) => promptFn()
        .then(async prompt => {
          let raw = await callClaude(prompt);
          if (!Array.isArray(raw)) raw = [raw];
          const questions = raw.map((q, i) => ({
            number: i + 1,
            question: String(q.question).trim(),
            answer: String(q.answer).trim(),
          }));
          return { ok: true, data: { round: label, ...questions } };
        })
        .catch(err => ({ ok: false, error: err.message, round: label }));

      // Build individual results with full metadata
      const makeResult = async (roundKey, title, category, pointsEach, prompt, loc) => {
        try {
          let raw = await callClaude(prompt);
          if (!Array.isArray(raw)) raw = [raw];
          const questions = raw.map((q, i) => ({
            number: i + 1,
            question: String(q.question).trim(),
            answer: String(q.answer).trim(),
          }));
          return {
            ok: true,
            data: {
              round: roundKey,
              title,
              category,
              pointsEach,
              questionCount: questions.length,
              questions,
              themeNight: true,
              theme,
              ...(loc ? { location: loc } : {}),
              ...(roundKey === 'lastcall' ? {
                lastCallNotes: 'Announce category only first. Teams wager before hearing the question.',
              } : {}),
              generatedAt: new Date().toISOString(),
            },
          };
        } catch (err) {
          return { ok: false, error: err.message, round: roundKey };
        }
      };

      const [round1, round2, round3, lightning, lastcall] = await Promise.all([
        makeResult('round1',    `Food, Drink & Delaware: ${theme}`, `${theme} — Food, Drink & Delaware`, 1, promptThemeRound1(theme, weekNumber, avoid)),
        makeResult('round2',    `Theme Round: ${theme}`,          theme,                           1,          promptThemeRound2(theme, location, weekNumber, avoid), location),
        makeResult('round3',    `The Weird Side: ${theme}`,       `${theme} — Strange Facts`,      1,          promptThemeRound3(theme, weekNumber, avoid)),
        makeResult('lightning', `Lightning Round: ${theme}`,      theme,                           2,          promptThemeLightning(theme, weekNumber, avoid)),
        makeResult('lastcall',  'Last Call',                       lcCategory,                      'wagered',  promptThemeLastCall(theme, lcCategory, weekNumber, avoid)),
      ]);

      const failed = [round1, round2, round3, lightning, lastcall].filter(r => !r.ok).length;

      return res.status(200).json({
        mode: 'theme-night',
        theme,
        location,
        week: weekNumber || null,
        generatedAt: new Date().toISOString(),
        rounds: {
          round1:    round1.ok    ? round1.data    : { error: round1.error },
          round2:    round2.ok    ? round2.data    : { error: round2.error },
          round3:    round3.ok    ? round3.data    : { error: round3.error },
          lightning: lightning.ok ? lightning.data : { error: lightning.error },
          lastcall:  lastcall.ok  ? lastcall.data  : { error: lastcall.error },
        },
        failed,
      });
    }

    // ── Matching round ────────────────────────────────────────────────────────
    if (mode === 'matching') {
      const { category = 'Movies & Directors' } = body;
      const prompt = promptMatching(category, weekNumber, avoid);
      const raw = await callClaude(prompt);

      const items = raw.map((p, i) => {
        if (!p.item || !p.answer) throw new Error(`Pair ${i + 1} missing item or answer`);
        return { number: i + 1, item: String(p.item).trim(), answer: String(p.answer).trim() };
      });

      // Fisher-Yates shuffle for word bank
      const wordBank = items.map(p => p.answer);
      for (let i = wordBank.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wordBank[i], wordBank[j]] = [wordBank[j], wordBank[i]];
      }

      return res.status(200).json({
        round: 'matching',
        title: 'Matching Round',
        category,
        pointsEach: 1,
        questionCount: items.length,
        items,
        wordBank,
        generatedAt: new Date().toISOString(),
      });
    }

    // ── Mystery Theme round ───────────────────────────────────────────────────
    if (mode === 'mystery-theme') {
      const prompt = promptMysteryTheme(weekNumber, avoid);
      const raw = await callClaude(prompt);

      if (!raw.theme || !raw.questions || !Array.isArray(raw.questions)) {
        throw new Error('Mystery theme response missing theme or questions');
      }

      const questions = raw.questions.map((q, i) => {
        if (!q.question || !q.answer) throw new Error(`Mystery question ${i + 1} missing question or answer`);
        return {
          number: i + 1,
          question: String(q.question).trim(),
          answer: String(q.answer).trim(),
          themeWord: String(q.themeWord || q.answer).trim(),
        };
      });

      return res.status(200).json({
        round: 'mystery-theme',
        title: 'Mystery Theme Round',
        theme: String(raw.theme).trim(),
        themeReveal: String(raw.themeReveal || raw.theme).trim(),
        bonusPoints: 5,
        questionCount: questions.length,
        questions,
        generatedAt: new Date().toISOString(),
      });
    }

    // ── Single round ─────────────────────────────────────────────────────────
    const result = await generateRound(mode, body, weekNumber, avoid);
    return res.status(200).json(result);

  } catch (err) {
    console.error('[trivia]', err.message);
    return res.status(500).json({ error: 'Failed to generate questions', details: err.message });
  }
};
// 1779800529
