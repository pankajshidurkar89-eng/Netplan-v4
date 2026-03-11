/**
 * GET /api/route?olat=&olng=&dlat=&dlng=
 * Returns road distance (km) and duration (hrs) between two points.
 * Cached in Vercel KV for 30 days — roads change slowly.
 *
 * Response shape:
 *   { dist, dur, live }    live=true means fresh API call
 *
 * Cache key: route:<olat_3dp>,<olng_3dp>|<dlat_3dp>,<dlng_3dp>
 * (3 decimal places ≈ 111m resolution — fine for city-level routing)
 *
 * MapmyIndia routing API (REST key, no OAuth needed):
 *   https://apis.mappls.com/advancedmaps/v1/{REST_KEY}/route_adv/driving/{olng},{olat};{dlng},{dlat}
 *
 * Required env vars:
 *   MAPPLS_REST_KEY — separate from OAuth, found in same console
 */

const { kv } = require('@vercel/kv');

const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Haversine fallback when API fails
function haversineRoad(la1, lo1, la2, lo2) {
  const R = 6371;
  const x = (la2 - la1) * Math.PI / 180;
  const y = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(x/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(y/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 1.3);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const olat = parseFloat(req.query.olat);
  const olng = parseFloat(req.query.olng);
  const dlat = parseFloat(req.query.dlat);
  const dlng = parseFloat(req.query.dlng);

  if ([olat, olng, dlat, dlng].some(isNaN)) {
    return res.status(400).json({ error: 'olat, olng, dlat, dlng required' });
  }

  // Same-point guard
  if (Math.abs(olat - dlat) < 0.001 && Math.abs(olng - dlng) < 0.001) {
    return res.json({ dist: 0, dur: 0, live: true });
  }

  // Cache key — 3 decimal places
  const cacheKey = `route:${olat.toFixed(3)},${olng.toFixed(3)}|${dlat.toFixed(3)},${dlng.toFixed(3)}`;

  // ── KV cache hit ─────────────────────────────────────────────────────────
  const cached = await kv.get(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json({ ...cached, live: true }); // live=true means a real distance
  }

  // ── Cache miss → MapmyIndia Route API ────────────────────────────────────
  const restKey = process.env.MAPPLS_REST_KEY;

  if (!restKey) {
    // Fallback to haversine if key not configured
    const dist = haversineRoad(olat, olng, dlat, dlng);
    return res.json({ dist, dur: 0, live: false, fallback: true });
  }

  try {
    // MapmyIndia route_adv: coordinates in lng,lat order
    const url = `https://apis.mappls.com/advancedmaps/v1/${restKey}/route_adv/driving/${olng},${olat};${dlng},${dlat}?region=IND&rtype=0&bearings=&overview=false`;

    const mmiRes = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!mmiRes.ok) throw new Error(`Route API ${mmiRes.status}`);
    const data = await mmiRes.json();

    const route = data?.routes?.[0] || data?.route;
    if (!route) throw new Error('No route in response');

    const result = {
      dist: Math.round((route.distance || 0) / 1000),  // metres → km
      dur:  Math.round((route.duration || 0) / 3600 * 10) / 10, // seconds → hrs
    };

    // Sanity check — if API returns 0 fall back to haversine
    if (result.dist === 0) {
      result.dist = haversineRoad(olat, olng, dlat, dlng);
      result.fallback = true;
    }

    // Cache for 30 days
    await kv.set(cacheKey, result, { ex: TTL_SECONDS });

    res.setHeader('X-Cache', 'MISS');
    res.json({ ...result, live: true });

  } catch (err) {
    console.error('route error:', err.message);
    // Graceful fallback — don't crash the UI
    const dist = haversineRoad(olat, olng, dlat, dlng);
    res.json({ dist, dur: 0, live: false, fallback: true, error: err.message });
  }
};
