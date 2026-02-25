/**
 * api/scores.js
 * Score submission (host-only) and retrieval (public).
 *
 * POST /api/scores  — submit a team's score for a game night
 *   Authorization: Bearer <HOST_SECRET>
 *   Body (JSON): {
 *     teamId, teamName, location, week, date,
 *     rounds: [r1, r2, r3, r4, r5, r6],  // up to 6 round scores
 *     bonusRound,                          // optional bonus points
 *     submittedBy                          // host name
 *   }
 *
 * GET /api/scores                — all scores
 * GET /api/scores?teamId=X       — filter by team
 * GET /api/scores?location=Y     — filter by location
 * GET /api/scores?week=N         — filter by week number
 * GET /api/scores?date=YYYY-MM-DD — filter by date
 *
 * Sheet columns (A–P):
 *   ScoreID | Date | Week | Location | TeamID | TeamName |
 *   R1 | R2 | R3 | R4 | R5 | R6 | BonusRound | Total | SubmittedBy | SubmittedAt
 */

const { readRange, appendRow } = require('../lib/sheets');

const VALID_LOCATIONS = ['Main Street', 'Exchange', 'H2O'];

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function generateScoreId() {
  return `score_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Map a raw sheet row (index 0 = A) to a score object. */
function rowToScore(row) {
  const rounds = [row[6], row[7], row[8], row[9], row[10], row[11]]
    .map((v) => (v !== undefined && v !== '' ? Number(v) : null))
    .filter((v) => v !== null);

  return {
    scoreId: row[0],
    date: row[1],
    week: row[2],
    location: row[3],
    teamId: row[4],
    teamName: row[5],
    rounds,
    bonusRound: row[12] !== undefined && row[12] !== '' ? Number(row[12]) : 0,
    total: row[13] !== undefined && row[13] !== '' ? Number(row[13]) : 0,
    submittedBy: row[14] || '',
    submittedAt: row[15] || '',
  };
}

// ---------------------------------------------------------------------------
// GET handler — public
// ---------------------------------------------------------------------------
async function handleGet(req, res) {
  const { teamId, location, week, date } = req.query;

  const rows = await readRange('Scores!A:P');
  if (rows.length <= 1) {
    return res.status(200).json({ scores: [] });
  }

  let scores = rows.slice(1).filter((row) => row[0]).map(rowToScore);

  if (teamId) scores = scores.filter((s) => s.teamId === teamId);
  if (location) scores = scores.filter((s) => s.location === location);
  if (week) scores = scores.filter((s) => s.week === String(week));
  if (date) scores = scores.filter((s) => s.date === date);

  return res.status(200).json({ scores });
}

// ---------------------------------------------------------------------------
// POST handler — host-only
// ---------------------------------------------------------------------------
async function handlePost(req, res) {
  // Auth check
  const { HOST_SECRET } = process.env;
  if (!HOST_SECRET || req.headers.authorization !== `Bearer ${HOST_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized — valid HOST_SECRET required' });
  }

  const { teamId, teamName, location, week, date, rounds, bonusRound, submittedBy } = req.body || {};

  // Required fields
  const missing = ['teamId', 'teamName', 'location', 'week', 'date'].filter((f) => !req.body?.[f]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  if (!VALID_LOCATIONS.includes(location)) {
    return res.status(400).json({
      error: `Invalid location. Must be one of: ${VALID_LOCATIONS.join(', ')}`,
    });
  }

  // Date must be YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD format' });
  }

  const roundScores = Array.isArray(rounds) ? rounds.slice(0, 6).map(Number) : [];
  const bonus = bonusRound !== undefined && bonusRound !== '' ? Number(bonusRound) : 0;
  const total = roundScores.reduce((sum, r) => sum + r, 0) + bonus;

  const scoreId = generateScoreId();
  const submittedAt = new Date().toISOString();

  // Build row: pad round columns to always have 6 slots
  const roundCells = Array.from({ length: 6 }, (_, i) =>
    roundScores[i] !== undefined ? roundScores[i] : ''
  );

  await appendRow('Scores', [
    scoreId,
    date,
    String(week),
    location,
    teamId,
    teamName,
    ...roundCells,
    bonus || '',
    total,
    submittedBy || '',
    submittedAt,
  ]);

  return res.status(201).json({
    success: true,
    score: { scoreId, teamId, teamName, location, week: String(week), date, rounds: roundScores, bonusRound: bonus, total, submittedBy: submittedBy || '', submittedAt },
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[scores] error:', err.message);
    return res.status(500).json({ error: 'Scores operation failed', details: err.message });
  }
};
