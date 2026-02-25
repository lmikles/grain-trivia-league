/**
 * api/standings.js
 * Compute season standings from the Scores tab and (optionally) cache them
 * back to the Standings tab.
 *
 * GET /api/standings                     — all locations combined
 * GET /api/standings?location=Main+Street — single location
 * GET /api/standings?refresh=true        — also write cache to Standings tab
 *
 * Standings are computed fresh from every request (the Scores tab is the
 * source of truth).  Pass ?refresh=true from a host-only action or a cron
 * job to persist the snapshot to the Standings tab for display.
 *
 * Returns:
 * {
 *   standings: [{
 *     rank, teamId, teamName, location,
 *     gamesPlayed, totalPoints, bestScore, averageScore, lastPlayed
 *   }],
 *   lastUpdated: ISO string
 * }
 *
 * Sheet columns (A–I):
 *   Rank | TeamID | TeamName | Location | GamesPlayed | TotalPoints |
 *   BestScore | AverageScore | LastPlayed
 */

const { readRange, updateRange, clearRange } = require('../lib/sheets');

const STANDINGS_HEADERS = [
  'Rank', 'TeamID', 'TeamName', 'Location',
  'GamesPlayed', 'TotalPoints', 'BestScore', 'AverageScore', 'LastPlayed',
];

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Aggregate raw Scores rows into per-team stats.
 * Each Scores row: [ScoreID, Date, Week, Location, TeamID, TeamName, R1..R6, Bonus, Total, ...]
 */
function computeStandings(scoreRows, locationFilter) {
  const data = scoreRows
    .slice(1) // skip header
    .filter((row) => row[0] && row[4]) // must have ScoreID and TeamID
    .map((row) => ({
      date: row[1] || '',
      location: row[3] || '',
      teamId: row[4],
      teamName: row[5] || 'Unknown',
      total: row[13] !== undefined && row[13] !== '' ? Number(row[13]) : 0,
    }));

  const filtered = locationFilter
    ? data.filter((s) => s.location === locationFilter)
    : data;

  // Aggregate
  const teamMap = {};
  for (const score of filtered) {
    if (!teamMap[score.teamId]) {
      teamMap[score.teamId] = {
        teamId: score.teamId,
        teamName: score.teamName,
        location: score.location,
        gamesPlayed: 0,
        totalPoints: 0,
        bestScore: 0,
        lastPlayed: '',
      };
    }
    const t = teamMap[score.teamId];
    t.gamesPlayed += 1;
    t.totalPoints += score.total;
    if (score.total > t.bestScore) t.bestScore = score.total;
    if (!t.lastPlayed || score.date > t.lastPlayed) t.lastPlayed = score.date;
  }

  // Sort: totalPoints desc, then gamesPlayed desc as tiebreaker
  const standings = Object.values(teamMap)
    .sort((a, b) => b.totalPoints - a.totalPoints || b.gamesPlayed - a.gamesPlayed)
    .map((team, i) => ({
      rank: i + 1,
      teamId: team.teamId,
      teamName: team.teamName,
      location: team.location,
      gamesPlayed: team.gamesPlayed,
      totalPoints: team.totalPoints,
      bestScore: team.bestScore,
      averageScore:
        team.gamesPlayed > 0
          ? Math.round((team.totalPoints / team.gamesPlayed) * 10) / 10
          : 0,
      lastPlayed: team.lastPlayed,
    }));

  return standings;
}

/**
 * Write a fresh snapshot to the Standings tab (rows 2+; keeps header row 1).
 */
async function persistToSheet(standings) {
  // Clear existing data rows, then write fresh
  await clearRange('Standings!A2:I1000');

  if (standings.length === 0) return;

  const rows = standings.map((s) => [
    s.rank,
    s.teamId,
    s.teamName,
    s.location,
    s.gamesPlayed,
    s.totalPoints,
    s.bestScore,
    s.averageScore,
    s.lastPlayed,
  ]);

  await updateRange(`Standings!A2:I${standings.length + 1}`, rows);
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { location, refresh } = req.query;

    const scoreRows = await readRange('Scores!A:P');
    if (!scoreRows.length) {
      return res.status(200).json({ standings: [], lastUpdated: new Date().toISOString() });
    }

    const standings = computeStandings(scoreRows, location || null);

    if (refresh === 'true') {
      await persistToSheet(standings);
    }

    return res.status(200).json({
      standings,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[standings] error:', err.message);
    return res.status(500).json({ error: 'Failed to compute standings', details: err.message });
  }
};
