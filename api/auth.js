/**
 * api/auth.js
 * Per-store login endpoint.
 *
 * POST /api/auth
 * Body: { secret: string }
 *
 * Returns: { ok: true, role: 'admin'|'host', location: null|'Main Street'|'Exchange'|'H2O' }
 * or 401 on failure.
 *
 * Env vars:
 *   HOST_SECRET         — admin login (all locations, full access)
 *   MAIN_STREET_SECRET  — Main Street host login
 *   EXCHANGE_SECRET     — Exchange host login
 *   H2O_SECRET          — H2O host login
 */

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { secret } = req.body || {};
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ error: 'secret is required' });
  }

  const s = secret.trim();

  // Admin — full access, picks their own location
  if (process.env.HOST_SECRET && s === process.env.HOST_SECRET) {
    return res.status(200).json({ ok: true, role: 'admin', location: null });
  }

  // Per-store host logins
  if (process.env.MAIN_STREET_SECRET && s === process.env.MAIN_STREET_SECRET) {
    return res.status(200).json({ ok: true, role: 'host', location: 'Main Street' });
  }
  if (process.env.EXCHANGE_SECRET && s === process.env.EXCHANGE_SECRET) {
    return res.status(200).json({ ok: true, role: 'host', location: 'Exchange' });
  }
  if (process.env.H2O_SECRET && s === process.env.H2O_SECRET) {
    return res.status(200).json({ ok: true, role: 'host', location: 'H2O' });
  }

  return res.status(401).json({ error: 'Invalid secret' });
};
