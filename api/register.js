/**
 * api/register.js
 * Public endpoint for team self-registration.
 *
 * POST /api/register
 * Body (JSON): { teamName, captainName, email, location }
 *
 * Locations: 'Main Street' | 'Exchange' | 'H2O'
 *
 * Returns: { success, team: { teamId, teamName, captainName, email, location, registeredAt } }
 */

const { readRange, appendRow } = require('../lib/sheets');

const VALID_LOCATIONS = ['Main Street', 'Exchange', 'H2O'];

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function generateTeamId() {
  return `team_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { teamName, captainName, email, location } = req.body || {};

    // --- Validation ---
    const missing = ['teamName', 'captainName', 'email', 'location'].filter(
      (f) => !req.body?.[f]?.trim()
    );
    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    if (!VALID_LOCATIONS.includes(location)) {
      return res.status(400).json({
        error: `Invalid location. Must be one of: ${VALID_LOCATIONS.join(', ')}`,
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // --- Duplicate team name check (case-insensitive) ---
    const rows = await readRange('Teams!A:B');
    const normalised = teamName.trim().toLowerCase();
    const duplicate = rows.slice(1).find(
      (row) => row[1]?.toLowerCase() === normalised
    );
    if (duplicate) {
      return res.status(409).json({ error: 'A team with this name is already registered' });
    }

    // --- Write to sheet ---
    const teamId = generateTeamId();
    const registeredAt = new Date().toISOString();

    await appendRow('Teams', [
      teamId,
      teamName.trim(),
      captainName.trim(),
      email.trim().toLowerCase(),
      location,
      registeredAt,
    ]);

    return res.status(201).json({
      success: true,
      team: { teamId, teamName: teamName.trim(), captainName: captainName.trim(), email: email.trim().toLowerCase(), location, registeredAt },
    });
  } catch (err) {
    console.error('[register] error:', err.message);
    return res.status(500).json({ error: 'Registration failed', details: err.message });
  }
};
