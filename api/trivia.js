/**
 * api/trivia.js
 * Grain Craft Bar + Kitchen — AI Trivia Question Generator
 *
 * POST /api/trivia
 * Requires: Authorization: Bearer <HOST_SECRET>
 *
 * Body: { mode, ...options }
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
 * 'round3'     General Knowledge (rotating subcategory)
 *              options: { subcategory: 'Geography' | 'Science & Nature' | 'History' | 'Current Events' }
 *              10 questions · 1pt each · same at all locations
 *
 * 'lightning'  Lightning Round (rapid-fire, all answers at end)
 *              options: { topic?: string }
 *              8 questions · 2pts each
 *
 * 'lastcall'   Last Call (wagering question — announce category first)
 *              options: { category: string }
 *              1 question · wagered pts
 *
 * 'full-night' Generate all rounds in one call
 *              options: { week?, round2Themes: {location: theme}, round3Subcategory, lastCallCategory, lightningTopic? }
 *
 * Required env var: ANTHROPIC_API_KEY, HOST_SECRET
 */

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function promptRound1() {
  return `You are writing trivia questions for the weekly trivia league at Grain Craft Bar + Kitchen, a craft beer bar and restaurant with three locations in Delaware.

Generate exactly 10 trivia questions for ROUND 1: GRAIN'S HOUSE ROUND.

This round covers food, drink, craft beer, cocktails, and bar/restaurant culture. It runs the same at all three Grain locations every week and is the signature round of the league.

REQUIREMENTS:
• Mix topics across the round: beer styles & brewing process, cocktails & spirits, wine, food & flavor pairing, famous bars/breweries, bar/restaurant culture
• Difficulty curve: Q1–3 should be accessible crowd-pleasers that most people at a bar would enjoy, Q4–7 moderate (some specific knowledge needed), Q8–10 genuinely challenging for craft beer enthusiasts
• Answers must be clear, specific, and unambiguous — no "it depends", no "various answers accepted"
• Short answers are strongly preferred (a style name, a country, a number, a term) over long phrase answers
• Write in a fun, conversational bar-trivia voice — not academic or textbook dry
• Do NOT write multiple-choice options — this is open-answer bar trivia
• Avoid questions where the correct answer is disputed, has changed recently, or is regionally variable

Return ONLY a valid JSON array with no markdown fences, no explanation, nothing else:
[{"question":"...","answer":"..."},...]`;
}

function promptRound2(location, theme) {
  return `You are writing trivia questions for the weekly trivia league at Grain Craft Bar + Kitchen, ${location}, Delaware.

Generate exactly 10 trivia questions for ROUND 2: WEEKLY THEME — "${theme}".

This is the location-specific round. Teams at ${location} were told the theme ("${theme}") in advance on Grain's social media, so some teams will have studied up. This creates fun competitive tension.

REQUIREMENTS:
• ALL 10 questions must clearly and unambiguously fit the "${theme}" theme — no tangential or loose connections
• Difficulty curve: Q1–4 accessible (even casual fans who glanced at the theme get these), Q5–8 moderate, Q9–10 genuinely challenging for the most prepared teams
• Mix question styles: notable firsts, record-holders, names, years, connections, "what was the name of...", "which film/song/person..."
• Answers must be verifiable, specific, and unambiguous — this is competitive trivia with real stakes
• Short answers preferred (a name, a year, a title, a place)
• Fun factor: good trivia teaches you something interesting when the answer is revealed — aim for "oh wow" moments
• Do NOT write multiple-choice options — this is open-answer bar trivia

Return ONLY a valid JSON array with no markdown fences, no explanation, nothing else:
[{"question":"...","answer":"..."},...]`;
}

function promptRound3(subcategory) {
  const guidance = {
    'Geography':        'world geography — countries, capitals, rivers, mountain ranges, borders, national flags, famous landmarks, physical features of Earth',
    'Science & Nature': 'science and nature — biology, chemistry, physics, astronomy/space, geology, the animal kingdom, botany, the human body, famous scientists, major inventions',
    'History':          'world history and American history — major wars and battles, historical figures, turning point events, treaties, movements, important dates, historical firsts',
    'Current Events':   'news and cultural moments from the past 12–24 months — world news, major political events, science/technology breakthroughs, notable cultural and sports moments',
  }[subcategory] || subcategory;

  return `You are writing trivia questions for the weekly trivia league at Grain Craft Bar + Kitchen, Delaware.

Generate exactly 10 trivia questions for ROUND 3: GENERAL KNOWLEDGE — ${subcategory.toUpperCase()}.

This round covers: ${guidance}. It runs the same at all three Grain locations each week.

REQUIREMENTS:
• ALL 10 questions must clearly belong in the ${subcategory} category — no stretching
• Difficulty curve: Q1–3 accessible (solid general knowledge gets these), Q4–7 moderate, Q8–10 challenging but fair
• Mix question types: "What is...", "Who was the first to...", "In what country/year...", "Which..." — vary the structure
• Answers must be unambiguous and verifiable — one correct answer, not open to interpretation
• Avoid questions so obscure that no reasonable bar team anywhere would know them
• Avoid questions where the answer has changed (e.g., current record holders) unless the change is itself famous
• Short, specific answers preferred
• Do NOT write multiple-choice options — this is open-answer bar trivia

Return ONLY a valid JSON array with no markdown fences, no explanation, nothing else:
[{"question":"...","answer":"..."},...]`;
}

function promptLightning(topic) {
  const topicLine = topic
    ? `Tonight's Lightning Round theme: "${topic}" — all 8 questions must clearly fit this theme.`
    : 'Draw from a variety of topics — mix makes the Lightning Round feel energetic.';

  return `You are writing questions for the Lightning Round at Grain Craft Bar + Kitchen trivia night, Delaware.

Generate exactly 8 questions for the LIGHTNING ROUND.

Lightning Round rules (important context for writing):
• Teams hear all 8 questions read quickly, then submit ALL answers at once on a single sheet
• Worth 2 points each — no partial credit
• The round is designed to feel fast and exciting when read aloud

${topicLine}

REQUIREMENTS for each question:
• Answers MUST be SHORT — ideally 1–3 words (a name, a number, a year, a place, a single word)
• Questions must be punchy and quick to read aloud — no long setup, no multi-part questions
• Absolute zero ambiguity in the answer — this is rapid-fire with no discussion, so the answer must be unmistakable
• Each question must be fully self-contained — no "building on the previous question" constructions
• Avoid questions with multiple defensible answers (e.g., "name a..." or "give an example of...")

Return ONLY a valid JSON array with no markdown fences, no explanation, nothing else:
[{"question":"...","answer":"..."},...]`;
}

function promptLastCall(category) {
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
• Hosts are directed to build drama: "This is the moment everything changes."

REQUIREMENTS:
• The question MUST clearly be within the "${category}" category — teams wagered based on this announced category, so any deviation feels like a betrayal
• The question should feel worthy of a finale — meaningful, memorable, not trivial
• The answer must be completely unambiguous — no ties, no "both X and Y are correct", no regional variation
• Should be genuinely challenging but fair — teams should feel they had a real chance if they knew the category
• Avoid facts so obscure that a team who confidently knows the category would still have no idea
• One correct answer, clearly defensible if anyone argues

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

  // Strip accidental markdown fences
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

async function generateRound(mode, opts = {}) {
  let prompt;
  switch (mode) {
    case 'round1':    prompt = promptRound1();                              break;
    case 'round2':    prompt = promptRound2(opts.location, opts.theme);    break;
    case 'round3':    prompt = promptRound3(opts.subcategory);             break;
    case 'lightning': prompt = promptLightning(opts.topic);                break;
    case 'lastcall':  prompt = promptLastCall(opts.category);              break;
    default: throw new Error(`Unknown mode: ${mode}`);
  }

  let raw = await callClaude(prompt);

  // Last Call returns a single object — normalize to array
  if (!Array.isArray(raw)) raw = [raw];

  // Validate and clean each question
  const questions = raw.map((q, i) => {
    if (!q.question || !q.answer) throw new Error(`Question ${i + 1} is missing question or answer fields`);
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

  // Auth — HOST_SECRET required (this endpoint costs money to run)
  const auth = (req.headers['authorization'] || '').trim();
  if (!process.env.HOST_SECRET || auth !== `Bearer ${process.env.HOST_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized — valid HOST_SECRET required' });
  }

  const body = req.body || {};
  const { mode } = body;

  const VALID_MODES = ['round1', 'round2', 'round3', 'lightning', 'lastcall', 'full-night'];
  if (!VALID_MODES.includes(mode)) {
    return res.status(400).json({
      error: `Invalid mode. Must be one of: ${VALID_MODES.join(', ')}`,
    });
  }

  try {
    // ── Full night: generate all rounds in parallel ──────────────────────────
    if (mode === 'full-night') {
      const {
        week,
        round2Themes = {},
        round3Subcategory = 'Geography',
        lastCallCategory = 'General Knowledge',
        lightningTopic,
      } = body;

      const [round1, round3, lightning, lastcall, r2Main, r2Exchange, r2H2O] = await Promise.all([
        generateRound('round1'),
        generateRound('round3', { subcategory: round3Subcategory }),
        generateRound('lightning', { topic: lightningTopic || '' }),
        generateRound('lastcall', { category: lastCallCategory }),
        generateRound('round2', { location: 'Main Street', theme: round2Themes['Main Street'] || 'General Knowledge' }),
        generateRound('round2', { location: 'Exchange',    theme: round2Themes['Exchange']    || 'General Knowledge' }),
        generateRound('round2', { location: 'H2O',         theme: round2Themes['H2O']         || 'General Knowledge' }),
      ]);

      return res.status(200).json({
        mode: 'full-night',
        week: week || null,
        generatedAt: new Date().toISOString(),
        scoring: {
          round1: '10 questions × 1pt = 10pts',
          round2: '10 questions × 1pt = 10pts (per location)',
          round3: '10 questions × 1pt = 10pts',
          lightning: '8 questions × 2pts = 16pts',
          maxBaseScore: 46,
          lastCall: 'Wager 1–full score; correct = +wager, wrong = −wager',
        },
        rounds: {
          round1,
          round2: {
            'Main Street': r2Main,
            'Exchange': r2Exchange,
            'H2O': r2H2O,
          },
          round3,
          lightning,
          lastcall,
        },
      });
    }

    // ── Single round ─────────────────────────────────────────────────────────
    const result = await generateRound(mode, body);
    return res.status(200).json(result);

  } catch (err) {
    console.error('[trivia]', err.message);
    return res.status(500).json({ error: 'Failed to generate questions', details: err.message });
  }
};
