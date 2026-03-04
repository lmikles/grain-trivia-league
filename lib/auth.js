/**
 * lib/auth.js
 * Shared auth helper — accepts any valid host secret.
 * Returns true if the Authorization header matches HOST_SECRET,
 * MAIN_STREET_SECRET, EXCHANGE_SECRET, or H2O_SECRET.
 */

function isValidHostSecret(authHeader) {
  const bearer = (authHeader || '').trim();
  if (!bearer.startsWith('Bearer ')) return false;
  const secret = bearer.slice(7);
  if (!secret) return false;

  const valid = [
    process.env.HOST_SECRET,
    process.env.MAIN_STREET_SECRET,
    process.env.EXCHANGE_SECRET,
    process.env.H2O_SECRET,
  ].filter(Boolean);

  return valid.includes(secret);
}

module.exports = { isValidHostSecret };
