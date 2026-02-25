/**
 * api/teams.js
 * Read registered teams — used by the host tool to populate the team dropdown.
 *
 * GET /api/teams
 * GET /api/teams?location=Main+Street
 *
 * Returns: { teams: [{ teamId, teamName, captainName, email, location, registeredAt }] }
 * Sorted alphabetically by teamName.
 */

const { readRange } = require('../lib/sheets');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { location } = req.query;

    const rows = await readRange('Teams!A:F');
    if (rows.length <= 1) {
      // No data rows (only header, or totally empty)
      return res.status(200).json({ teams: [] });
    }

    let teams = rows
      .slice(1)
      .filter((row) => row[0]) // skip blank rows
      .map((row) => ({
        teamId: row[0],
        teamName: row[1],
        captainName: row[2],
        email: row[3],
        location: row[4],
        registeredAt: row[5],
      }));

    if (location) {
      teams = teams.filter((t) => t.location === location);
    }

    teams.sort((a, b) => (a.teamName || '').localeCompare(b.teamName || ''));

    return res.status(200).json({ teams });
  } catch (err) {
    console.error('[teams] error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch teams', details: err.message });
  }
};
