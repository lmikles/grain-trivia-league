/**
 * api/questions.js
 * Save generated trivia questions to the QuestionLog sheet tab.
 * Called automatically when the host prints from the generator.
 *
 * POST /api/questions
 * Requires: Authorization: Bearer <HOST_SECRET>
 *
 * Body: {
 *   week?:     number          — week number in season
 *   location?: string          — location for this trivia night
 *   rounds:    Array<{
 *     round:     string        — 'round1' | 'round2' | etc.
 *     title:     string        — display title
 *     category:  string        — category/theme
 *     location?: string        — for round2
 *     questions: Array<{ number, question, answer }>
 *   }>
 * }
 *
 * Creates the QuestionLog tab automatically on first use.
 * Appends one row per question.
 */

const { readRange, appendRows, updateRange, createSheetTab } = require('../lib/sheets');

const HEADERS = [
  'LogID', 'Week', 'SavedAt', 'Location', 'Round', 'RoundTitle', 'Category', 'Q#', 'Question', 'Answer',
];

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Ensure the QuestionLog tab exists and has headers in row 1.
 * Safe to call repeatedly — createSheetTab ignores "already exists" errors.
 */
async function ensureTab() {
  await createSheetTab('QuestionLog');

  // Write headers if row 1 is empty
  const existing = await readRange('QuestionLog!A1:J1');
  if (!existing || existing.length === 0 || !existing[0][0]) {
    await updateRange('QuestionLog!A1:J1', [HEADERS]);
  }
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = (req.headers['authorization'] || '').trim();
  if (!process.env.HOST_SECRET || auth !== `Bearer ${process.env.HOST_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { week, location, rounds } = req.body || {};

  if (!Array.isArray(rounds) || rounds.length === 0) {
    return res.status(400).json({ error: 'rounds array is required and must not be empty' });
  }

  try {
    await ensureTab();

    const savedAt = new Date().toISOString();
    const rows = [];

    for (const round of rounds) {
      if (!Array.isArray(round.questions)) continue;
      const roundLocation = location || round.location || '';

      for (const q of round.questions) {
        const logId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        rows.push([
          logId,
          week ?? '',
          savedAt,
          roundLocation,
          round.round   ?? '',
          round.title   ?? '',
          round.category ?? '',
          q.number      ?? '',
          q.question    ?? '',
          q.answer      ?? '',
        ]);
      }
    }

    if (rows.length > 0) {
      await appendRows('QuestionLog', rows);
    }

    return res.status(200).json({ success: true, saved: rows.length });

  } catch (err) {
    console.error('[questions]', err.message);
    return res.status(500).json({ error: 'Failed to save questions', details: err.message });
  }
};
