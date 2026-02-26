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
 * Shared params (all modes):
 *   weekNumber  number   — Week number in season; used to encourage fresh questions
 *   avoidList   string[] — Questions from previous weeks to avoid repeating
 *
 * Required env vars: ANTHROPIC_API_KEY, HOST_SECRET
 */

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

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

  return lines.length > 0 ? '\n\n' + lines.join('\n\n') : '';
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function promptRound1(weekNumber, avoidList) {
  return `You are writing trivia questions for the weekly trivia league at Grain Craft Bar + Kitchen, a craft beer bar and restaurant with three locations in Delaware.

Generate exactly 10 trivia questions for ROUND 1: GRAIN'S HOUSE ROUND.

This round covers food, drink, craft beer, cocktails, and bar/restaurant culture. It runs the same at all three Grain locations every week and is the signature round of the league.

REQUIREMENTS:
• Mix topics across the round: beer styles & brewing process, cocktails & spirits, wine, food & flavor pairing, famous bars/breweries, bar/restaurant culture
• Difficulty curve: Q1–3 warm-up questions most people at a bar night would get, Q4–7 require real knowledge (a regular craft beer drinker, not just anyone), Q8–10 should stump most people — specific, niche, insider knowledge about brewing, spirits, or food
• AVOID the obvious: Do not write questions that appear in standard pub trivia packs or trivia apps. No "What country does Guinness come from?" level questions — go deeper
• Think second and third layer: not just what a thing IS, but HOW it works, WHERE it originated, WHO invented it, WHAT the unusual rule or exception is
• Answers must be clear, specific, and unambiguous — no "it depends", no "various answers accepted"
• Short answers strongly preferred (a style name, a country, a number, a term) over long phrases
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
    'Geography':        'world geography — countries, capitals, rivers, mountain ranges, borders, national flags, famous landmarks, physical features of Earth',
    'Science & Nature': 'science and nature — biology, chemistry, physics, astronomy/space, geology, the animal kingdom, botany, the human body, famous scientists, major inventions',
    'History':          'world history and American history — major wars and battles, historical figures, turning point events, treaties, movements, important dates, historical firsts',
    'Current Events':   'news and cultural moments from the past 12–24 months — world news, major political events, science/technology breakthroughs, notable cultural and sports moments',
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

// ─── Anthropic API call ───────────────────────────────────────────────────────

async function callClaude(prompt) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = (data.content?.[0]?.text || '').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return JSON.parse(cleaned);
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
    mode === 'round1'    ? 'Food, Drink & Craft Beer' :
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

  const auth = (req.headers['authorization'] || '').trim();
  if (!process.env.HOST_SECRET || auth !== `Bearer ${process.env.HOST_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized — valid HOST_SECRET required' });
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

  const VALID_MODES = ['round1', 'round2', 'round3', 'lightning', 'lastcall', 'location-night'];
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

    // ── Single round ─────────────────────────────────────────────────────────
    const result = await generateRound(mode, body, weekNumber, avoid);
    return res.status(200).json(result);

  } catch (err) {
    console.error('[trivia]', err.message);
    return res.status(500).json({ error: 'Failed to generate questions', details: err.message });
  }
};
