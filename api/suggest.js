/**
 * GET /api/suggest?q=QUERY
 * Returns up to 7 MapmyIndia autosuggest results for India.
 * Used for the location search dropdown.
 *
 * Response shape:
 *   { results: [{ placeName, placeAddress, eLoc, type }, ...] }
 *
 * NOT cached in KV — search results are transient.
 * Frontend maintains a short in-memory debounce cache.
 *
 * Required env var: MAPPLS_CLIENT_ID, MAPPLS_CLIENT_SECRET (via token.js)
 */

const { getToken } = require('./token');

const SUGGEST_URL = 'https://atlas.mappls.com/api/places/search/json';

module.exports = async function handler(req, res) {
  // CORS for same-domain Vercel deployment
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ results: [] });

  try {
    const token = await getToken();

    const url = new URL(SUGGEST_URL);
    url.searchParams.set('query', q);
    url.searchParams.set('region', 'IND');
    url.searchParams.set('access_token', token);
    url.searchParams.set('pod', 'city');      // bias toward city-level results
    url.searchParams.set('tokenizeAddress', 'true');

    const mmiRes = await fetch(url.toString());
    if (!mmiRes.ok) throw new Error(`Suggest API ${mmiRes.status}`);
    const data = await mmiRes.json();

    const raw = data?.suggestedLocations || data?.results || [];
    const results = raw.slice(0, 7).map(r => ({
      placeName:    r.placeName    || r.name || '',
      placeAddress: r.placeAddress || r.formattedAddress || '',
      eLoc:         r.eLoc         || r.place_id || '',
      type:         r.type         || r.category || '',
    }));

    // Short browser cache — autosuggest results can be cached for 60 seconds
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    res.json({ results });
  } catch (err) {
    console.error('suggest error:', err.message);
    res.status(500).json({ error: err.message, results: [] });
  }
};
