/**
 * api/setup.js
 * One-time endpoint to write header rows into the three sheet tabs.
 *
 * POST /api/setup
 * Authorization: Bearer <HOST_SECRET>
 *
 * Run once after creating the Google Sheet.
 * Safe to re-run — it just overwrites row 1 in each tab.
 */

const { updateRange } = require('../lib/sheets');

// Column definitions for each tab — order matters; matches lib/sheets helpers.
const TEAMS_HEADERS = [
  'TeamID', 'TeamName', 'CaptainName', 'Email', 'Location', 'RegisteredAt',
];

const SCORES_HEADERS = [
  'ScoreID', 'Date', 'Week', 'Location', 'TeamID', 'TeamName',
  'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'BonusRound', 'Total',
  'SubmittedBy', 'SubmittedAt',
];

const STANDINGS_HEADERS = [
  'Rank', 'TeamID', 'TeamName', 'Location',
  'GamesPlayed', 'TotalPoints', 'BestScore', 'AverageScore', 'LastPlayed',
];

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Protect with HOST_SECRET so only the host can call this.
  const { HOST_SECRET } = process.env;
  const auth = req.headers.authorization;
  if (!HOST_SECRET || auth !== `Bearer ${HOST_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await updateRange('Teams!A1:F1', [TEAMS_HEADERS]);
    await updateRange('Scores!A1:P1', [SCORES_HEADERS]);
    await updateRange('Standings!A1:I1', [STANDINGS_HEADERS]);

    return res.status(200).json({
      success: true,
      message: 'Sheet headers initialized. You can now use the app.',
      sheets: { Teams: TEAMS_HEADERS, Scores: SCORES_HEADERS, Standings: STANDINGS_HEADERS },
    });
  } catch (err) {
    console.error('[setup] error:', err.message);
    return res.status(500).json({ error: 'Setup failed', details: err.message });
  }
};
