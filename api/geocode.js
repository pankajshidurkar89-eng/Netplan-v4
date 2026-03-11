/**
 * GET /api/geocode?eloc=ELOC
 * Converts a MapmyIndia eLoc code to lat/lng coordinates.
 * Cached FOREVER in Vercel KV — cities and places don't move.
 *
 * Response shape:
 *   { lat, lng, placeName, placeAddress, eLoc }
 *
 * Cache key: geo:<lowercase_eloc>
 *
 * Required env vars: MAPPLS_CLIENT_ID, MAPPLS_CLIENT_SECRET
 */

const { kv }      = require('@vercel/kv');
const { getToken } = require('./token');

const GEO_URL = 'https://atlas.mappls.com/api/places/geocode';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const eloc = (req.query.eloc || '').trim().toUpperCase();
  if (!eloc) return res.status(400).json({ error: 'eloc required' });

  const cacheKey = `geo:${eloc.toLowerCase()}`;

  // ── KV cache hit ─────────────────────────────────────────────────────────
  const cached = await kv.get(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(cached);
  }

  // ── Cache miss → call MapmyIndia ─────────────────────────────────────────
  try {
    const token = await getToken();

    const url = new URL(GEO_URL);
    url.searchParams.set('address', eloc);
    url.searchParams.set('region',  'IND');
    url.searchParams.set('access_token', token);

    const mmiRes = await fetch(url.toString());
    if (!mmiRes.ok) throw new Error(`Geocode API ${mmiRes.status}`);
    const data = await mmiRes.json();

    const loc = data?.copResults || data?.results?.[0] || data?.[0];
    if (!loc) throw new Error('No geocode result for eLoc: ' + eloc);

    const result = {
      lat:          parseFloat(loc.latitude  || loc.lat),
      lng:          parseFloat(loc.longitude || loc.lng),
      placeName:    loc.placeName    || loc.name || eloc,
      placeAddress: loc.placeAddress || loc.formattedAddress || '',
      eLoc:         eloc,
    };

    // Cache forever — no TTL (pass undefined / omit ex)
    await kv.set(cacheKey, result);

    res.setHeader('X-Cache', 'MISS');
    res.json(result);
  } catch (err) {
    console.error('geocode error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
