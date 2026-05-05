/**
 * api/review/proposal.js
 * Content review proposal for the OMG social media scheduling board.
 *
 * GET  /api/review/proposal — returns this week's signals + proposed topics
 *                             (mock data for MVP; state merged from /tmp store)
 * PATCH /api/review/proposal — saves per-card decisions (approve/edit/reject)
 *                              Body: { updates: [{ id, status, editedText? }] }
 *
 * Auth: HOST_SECRET via Authorization: Bearer <secret>
 */

const fs = require('fs');
const path = require('path');
const { isValidHostSecret } = require('../../lib/auth');

const STATE_FILE = '/tmp/omg-review-state.json';

// ---------------------------------------------------------------------------
// Mock data — MVP static inputs
// ---------------------------------------------------------------------------
const MOCK_INPUTS = {
  weather: {
    summary: 'Partly cloudy, highs 68–74°F. Chance of afternoon showers Wed & Thu. Clear and warm Fri–Sun.',
    days: [
      { date: '2026-05-05', label: 'Tue', high: 71, low: 54, condition: 'Sunny' },
      { date: '2026-05-06', label: 'Wed', high: 68, low: 55, condition: 'Showers' },
      { date: '2026-05-07', label: 'Thu', high: 66, low: 53, condition: 'Partly cloudy' },
      { date: '2026-05-08', label: 'Fri', high: 72, low: 57, condition: 'Sunny' },
      { date: '2026-05-09', label: 'Sat', high: 74, low: 59, condition: 'Sunny' },
      { date: '2026-05-10', label: 'Sun', high: 73, low: 58, condition: 'Mostly sunny' },
    ],
  },
  events: [
    { name: 'Trivia Night', day: 'Wednesday', time: '7:00 PM', location: 'All locations' },
    { name: 'Live Music — The River Bends', day: 'Friday', time: '8:00 PM', location: 'Main Street' },
    { name: 'Sunday Brunch', day: 'Sunday', time: '10 AM–2 PM', location: 'All locations' },
    { name: 'Cinco de Mayo Specials', day: 'Tuesday', time: 'All day', location: 'All locations' },
  ],
  sports: [
    { team: 'Cubs', opponent: 'vs. Cardinals', date: '2026-05-05', time: '1:20 PM', venue: 'Wrigley Field' },
    { team: 'Cubs', opponent: 'vs. Cardinals', date: '2026-05-06', time: '7:05 PM', venue: 'Wrigley Field' },
    { team: 'Bulls', opponent: 'Playoffs Game 3 vs. Celtics', date: '2026-05-07', time: '7:30 PM', venue: 'United Center' },
    { team: 'Cubs', opponent: 'vs. Brewers', date: '2026-05-08', time: '1:20 PM', venue: 'Wrigley Field' },
    { team: 'Bulls', opponent: 'Playoffs Game 4 vs. Celtics', date: '2026-05-09', time: '3:30 PM', venue: 'United Center' },
  ],
  holidays: [
    { name: 'Cinco de Mayo', date: '2026-05-05', note: 'Strong engagement opportunity for specials + margaritas' },
    { name: "Mother's Day (upcoming)", date: '2026-05-10', note: 'Promote Sunday Brunch — gift cards, reservations' },
  ],
  specials: [
    { item: 'Half-priced apps during game days', type: 'Promotion' },
    { item: 'Rotating tap: Goose Island 312 Urban Wheat', type: 'Beer feature' },
    { item: 'Rotating tap: Revolution Anti-Hero IPA', type: 'Beer feature' },
    { item: 'Cinco de Mayo Margarita Flight', type: 'Limited seasonal' },
    { item: 'Mother\'s Day Brunch Prix Fixe $38', type: 'Seasonal event menu' },
  ],
};

const MOCK_TOPICS = [
  {
    id: 'topic-001',
    platform: 'Instagram',
    proposedDate: '2026-05-05',
    proposedTime: '10:00',
    topic: "Cinco de Mayo is here 🌮 — come celebrate with our limited Margarita Flight and half-price apps all day!",
    angle: 'Cinco de Mayo holiday + seasonal special',
    postType: 'Promotional',
  },
  {
    id: 'topic-002',
    platform: 'Facebook',
    proposedDate: '2026-05-05',
    proposedTime: '11:00',
    topic: "Cubs kick off their home stand today at Wrigley — catch the game on our screens with cold 312 Urban Wheat in hand.",
    angle: 'Cubs game day tie-in + beer feature',
    postType: 'Engaging',
  },
  {
    id: 'topic-003',
    platform: 'Instagram',
    proposedDate: '2026-05-06',
    proposedTime: '14:00',
    topic: "It's Trivia Night at Grain tonight — grab your crew and put your brain to the test. Doors open at 6:30, first question at 7.",
    angle: 'Trivia Night event promo',
    postType: 'Event promo',
  },
  {
    id: 'topic-004',
    platform: 'Facebook',
    proposedDate: '2026-05-07',
    proposedTime: '16:00',
    topic: "Bulls Playoffs tonight 🐂 — Game 3 vs. the Celtics. The patio lights are on, the beer is cold, and every point counts.",
    angle: 'Bulls playoff game day energy + patio',
    postType: 'Engaging',
  },
  {
    id: 'topic-005',
    platform: 'Instagram',
    proposedDate: '2026-05-08',
    proposedTime: '09:00',
    topic: "Friday feels good — tonight, The River Bends takes the stage at our Main Street location. Live music starts at 8.",
    angle: 'Live Music event promo',
    postType: 'Event promo',
  },
  {
    id: 'topic-006',
    platform: 'Facebook',
    proposedDate: '2026-05-08',
    proposedTime: '12:00',
    topic: "Cubs Friday afternoon game + half-price apps = the ideal way to end your work week. Come early, grab a spot at the bar.",
    angle: 'Cubs game day + happy hour crossover',
    postType: 'Promotional',
  },
  {
    id: 'topic-007',
    platform: 'Instagram',
    proposedDate: '2026-05-09',
    proposedTime: '10:00',
    topic: "Bulls Playoffs Game 4 is TODAY. 🏀 We're opening early with game-day drink specials and a big screen for every seat.",
    angle: 'Bulls game day + specials urgency',
    postType: 'Promotional',
  },
  {
    id: 'topic-008',
    platform: 'Facebook',
    proposedDate: '2026-05-10',
    proposedTime: '08:00',
    topic: "Happy Mother's Day! Treat mom to Sunday Brunch — our Prix Fixe menu is $38 and includes a mimosa. Reservations recommended.",
    angle: "Mother's Day Brunch promotion",
    postType: 'Event promo',
  },
];

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------
function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// Merge saved decisions into fresh mock topics
function buildTopics(savedState) {
  return MOCK_TOPICS.map((t) => {
    const saved = savedState[t.id];
    if (!saved) return { ...t, status: 'pending' };
    return { ...t, ...saved };
  });
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
async function handleGet(req, res) {
  const state = loadState();
  const topics = buildTopics(state);
  return res.status(200).json({
    weekOf: '2026-05-04',
    inputs: MOCK_INPUTS,
    topics,
  });
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------
async function handlePatch(req, res) {
  if (!isValidHostSecret(req.headers['authorization'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { updates } = req.body || {};
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'updates array is required' });
  }

  const validStatuses = ['approved', 'rejected', 'pending'];
  const state = loadState();

  for (const update of updates) {
    const { id, status, editedText } = update;
    if (!id) continue;
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status "${status}". Must be one of: ${validStatuses.join(', ')}` });
    }
    state[id] = {
      ...(state[id] || {}),
      ...(status ? { status } : {}),
      ...(editedText !== undefined ? { editedText } : {}),
    };
  }

  saveState(state);
  return res.status(200).json({ ok: true, saved: updates.length });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET')   return await handleGet(req, res);
    if (req.method === 'PATCH') return await handlePatch(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[review/proposal] error:', err.message);
    return res.status(500).json({ error: 'Review proposal operation failed', details: err.message });
  }
};
