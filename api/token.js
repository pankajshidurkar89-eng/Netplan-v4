/**
 * GET /api/token
 * Internal helper — not called directly by frontend.
 * Returns a valid MapmyIndia OAuth access_token.
 * Token is cached in Vercel KV for 23 hours (MapmyIndia tokens last 24h).
 *
 * Required env vars:
 *   MAPPLS_CLIENT_ID     — from https://apis.mappls.com/console/
 *   MAPPLS_CLIENT_SECRET — from the same console
 */

const { kv } = require('@vercel/kv');

const CACHE_KEY = 'mappls:oauth_token';
const TOKEN_URL = 'https://outpost.mappls.com/api/security/oauth/token';
const TTL_SECONDS = 23 * 60 * 60; // 23 hours

async function fetchFreshToken() {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     process.env.MAPPLS_CLIENT_ID,
      client_secret: process.env.MAPPLS_CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MapmyIndia token error ${res.status}: ${text}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('No access_token in response');
  return data.access_token;
}

/**
 * Exported helper — use this in other api/*.js files.
 * Returns a valid token string, hitting cache first.
 */
async function getToken() {
  const cached = await kv.get(CACHE_KEY);
  if (cached) return cached;

  const token = await fetchFreshToken();
  await kv.set(CACHE_KEY, token, { ex: TTL_SECONDS });
  return token;
}

module.exports = { getToken };

// Also expose as HTTP endpoint for debugging
module.exports.default = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const token = await getToken();
    // Never expose full token to browser — just confirm it's working
    res.json({ ok: true, preview: token.slice(0, 8) + '…' });
  } catch (err) {
    console.error('token error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
