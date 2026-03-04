/**
 * api/history.js
 * Return previously used questions from the QuestionLog sheet.
 * Used by the generator to auto-populate the avoid list.
 *
 * GET /api/history?location=Main+Street&limit=200
 *
 * Query params:
 *   location  (optional) — filter to a specific location
 *   round     (optional) — filter to a specific round key (e.g. 'round3')
 *   limit     (optional) — max questions to return (default 200, max 500)
 *
 * Requires: Authorization: Bearer <HOST_SECRET>
 *
 * Returns: { questions: string[], count: number }
 *   questions — flat array of question text strings (for pasting into avoidList)
 */

const { readRange } = require('../lib/sheets');
const { isValidHostSecret } = require('../lib/auth');

// QuestionLog column indices (0-based)
// LogID(0) Week(1) SavedAt(2) Location(3) Round(4) RoundTitle(5) Category(6) Q#(7) Question(8) Answer(9)
const COL = { location: 3, round: 4, question: 8 };

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!isValidHostSecret(req.headers['authorization'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { location, round, limit: limitParam } = req.query || {};
  const limit = Math.min(parseInt(limitParam, 10) || 200, 500);

  try {
    // Read all data rows (skip header row 1)
    const rows = await readRange('QuestionLog!A2:J');

    if (!rows || rows.length === 0) {
      return res.status(200).json({ questions: [], count: 0 });
    }

    let filtered = rows;

    if (location) {
      const loc = location.trim().toLowerCase();
      filtered = filtered.filter(r => (r[COL.location] || '').toLowerCase() === loc);
    }

    if (round) {
      const rnd = round.trim().toLowerCase();
      filtered = filtered.filter(r => (r[COL.round] || '').toLowerCase() === rnd);
    }

    // Extract question text, deduplicate, trim
    const seen = new Set();
    const questions = [];
    for (const row of filtered) {
      const q = (row[COL.question] || '').trim();
      if (q && !seen.has(q)) {
        seen.add(q);
        questions.push(q);
        if (questions.length >= limit) break;
      }
    }

    return res.status(200).json({ questions, count: questions.length });

  } catch (err) {
    console.error('[history]', err.message);
    return res.status(500).json({ error: 'Failed to fetch history', details: err.message });
  }
};
