# NETPLAN PRO v4 — Setup Guide

## What you need before deploying
1. MapmyIndia (Mappls) developer account
2. Vercel account (free tier is enough to start)
3. 10 minutes

---

## Step 1 — Get MapmyIndia API keys

1. Go to **https://apis.mappls.com/console/**
2. Sign up / log in
3. Create a new project
4. From the project dashboard, copy three things:
   - **Client ID** (looks like: `a1b2c3d4e5f6g7h8i9j0`)
   - **Client Secret** (longer string)
   - **REST API Key** (also called "Access Token" in older docs — a 32-char hex string)

> The REST API Key is used for routing (`route_adv`).
> Client ID + Secret are used for OAuth (autosuggest + geocode).

---

## Step 2 — Deploy to Vercel

### Option A — GitHub (recommended for your team)
1. Push this folder to a GitHub repo
2. Go to **vercel.com → New Project → Import Git Repository**
3. Select the repo, click Deploy
4. No build settings needed — it's a static HTML file with serverless functions

### Option B — Vercel CLI (fastest)
```bash
npm install -g vercel
cd netplan-v4
vercel deploy --prod
```

---

## Step 3 — Create Vercel KV database

1. In your Vercel project dashboard → **Storage** tab
2. Click **Create Database → KV**
3. Name it `netplan-cache`, region: `Mumbai (BOM1)` ← important for India latency
4. Click **Connect to Project** — this auto-sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` env vars

---

## Step 4 — Set environment variables in Vercel

In your Vercel project → **Settings → Environment Variables**, add:

| Variable              | Value                          |
|-----------------------|--------------------------------|
| `MAPPLS_CLIENT_ID`    | Your Client ID from Step 1     |
| `MAPPLS_CLIENT_SECRET`| Your Client Secret from Step 1 |
| `MAPPLS_REST_KEY`     | Your REST API Key from Step 1  |

> `KV_REST_API_URL` and `KV_REST_API_TOKEN` are already set by Step 3.

After adding vars → **Redeploy** (Settings → Deployments → Redeploy latest).

---

## Step 5 — Verify

Visit your Vercel URL and:
1. Go to **⚙ Config** — the API status panel shows cache types
2. Go to **📥 Lane Master** → type "Mumbai" in Origin → you should see MapmyIndia suggestions
3. Select a result → it geocodes to lat/lng
4. Add a destination → click Compute → MapmyIndia road distance appears

First call to any route will hit MapmyIndia (200–400ms).
Second call to same route (from any team member) = instant KV cache hit.

---

## CSV Upload Format

The CSV uses **eLoc codes** (MapmyIndia's 6-character place IDs) instead of city names.
This is more precise — especially for industrial areas, ports, and plants.

To find an eLoc: type the location in the Lane Master search box and note the eLoc shown in the dropdown.

```csv
origin_eloc,dest_eloc,depot_eloc,monthly_tonnes,fwd_rate,rev_tonnes,rev_rate,lane_type,customer
1T182A,9QGSMN,1T182A,450,4200,0,0,EXISTING,Reliance Jamnagar
9DT6SM,77VZ77,9DT6SM,300,3800,100,2800,EXISTING,Tata Mumbai
MMI000,NDLS01,MMI000,280,3500,0,0,PROBABLE,JSW Steel
```

---

## Cache behaviour

| Data         | Cache location  | TTL       | Notes                              |
|-------------|-----------------|-----------|-----------------------------------|
| OAuth token  | Vercel KV       | 23 hours  | Auto-refreshed                     |
| Geocode      | Vercel KV       | Forever   | Cities don't move                  |
| Routes       | Vercel KV       | 30 days   | Shared across all team members     |
| Suggestions  | Browser memory  | Session   | Transient, no KV needed            |

After first month of use, most of your common routes will be cached.
API costs drop to near zero after the cache warms up.

---

## Monthly cost estimate (50 unique OD pairs, 5-person team)

| Service       | Free tier             | Paid       |
|---------------|-----------------------|------------|
| Vercel KV     | 256MB, 30k req/day    | $10/mo     |
| MapmyIndia    | Check current pricing | ~₹1–2k/mo |
| Vercel hosting| Unlimited static      | Free       |

Most teams will stay within the free KV tier once the route cache warms up.
