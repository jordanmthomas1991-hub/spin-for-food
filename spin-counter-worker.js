/**
 * SpinForFood — Spin Counter Worker
 * Cloudflare Worker + KV Storage
 *
 * SETUP INSTRUCTIONS (5 minutes):
 * ─────────────────────────────────────────────────
 * 1. Go to Cloudflare Dashboard → Workers & Pages → Create Application → Create Worker
 * 2. Name it: spin-counter
 * 3. Paste this entire file into the editor and click Deploy
 * 4. Go to Workers & Pages → KV → Create a namespace called: SPIN_COUNTER
 * 5. Go back to your Worker → Settings → Bindings → Add binding:
 *      Variable name: SPIN_STORE
 *      KV Namespace: SPIN_COUNTER
 * 6. Click Save & Deploy
 * 7. Your Worker URL will be: https://spin-counter.<your-subdomain>.workers.dev
 * 8. Update WORKER_URL in index.html with that URL
 * ─────────────────────────────────────────────────
 */

export default {
  async fetch(request, env) {

    // ── CORS headers — allow spinforfood.com to call this ──
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://www.spinforfood.com',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {

      // ── GET /count — return current count without incrementing ──
      if (request.method === 'GET' && path === '/count') {
        const current = await env.SPIN_STORE.get('total_spins');
        const count = current ? parseInt(current) : 0;
        return new Response(JSON.stringify({ count }), { headers: corsHeaders });
      }

      // ── POST /spin — increment count and return new value ──
      if (request.method === 'POST' && path === '/spin') {

        // Simple rate limiting — check IP-based key in KV
        // Allows max 10 increments per IP per hour
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const hourKey = `ratelimit:${ip}:${Math.floor(Date.now() / 3600000)}`;
        const hitCount = await env.SPIN_STORE.get(hourKey);
        const hits = hitCount ? parseInt(hitCount) : 0;

        if (hits >= 10) {
          // Rate limited — return current count without incrementing
          const current = await env.SPIN_STORE.get('total_spins');
          const count = current ? parseInt(current) : 0;
          return new Response(JSON.stringify({ count, rateLimited: true }), {
            headers: corsHeaders,
          });
        }

        // Increment the rate limit key (expires after 2 hours)
        await env.SPIN_STORE.put(hourKey, String(hits + 1), { expirationTtl: 7200 });

        // Increment total spin count
        const current = await env.SPIN_STORE.get('total_spins');
        const newCount = (current ? parseInt(current) : 0) + 1;
        await env.SPIN_STORE.put('total_spins', String(newCount));

        return new Response(JSON.stringify({ count: newCount }), { headers: corsHeaders });
      }

      // Unknown route
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: corsHeaders,
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  },
};
