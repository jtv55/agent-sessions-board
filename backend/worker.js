// Board API for "Do you even swarm?": a Cloudflare Worker with one KV namespace (bind it as BOARD).
//   GET  /board    -> { rows: [{ h, n, c, t }] }  public rows only (n = agents in the biggest swarm, c = its tool calls)
//   POST /submit   -> { handle, token, email?, n, c, type }  claims a handle on first use, then updates it
// A handle is owned by whoever holds its token (generated in the browser, stored hashed here). No passwords, no logs, scores only.
//   GET  STATS_PATH -> daily unique visitors and submitters (private: set STATS_PATH to a long random string in your deployed copy)
// Visits are counted as one-way hashes of IP + day (expire after 90 days); no raw IPs or cookies are kept.
// Deploy: npx wrangler kv namespace create BOARD, bind it in wrangler.toml, then npx wrangler deploy. Put the URL in ../config.js.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' };
const STATS_PATH = '/stats/CHANGE-ME-TO-A-LONG-RANDOM-STRING';
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const count = async (env, prefix) => { let n = 0, cursor; do { const r = await env.BOARD.list({ prefix, cursor }); n += r.keys.length; cursor = r.list_complete ? null : r.cursor; } while (cursor); return n; };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...CORS } });
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const ip = req.headers.get('cf-connecting-ip') || 'unknown';
    if (url.pathname === STATS_PATH && !STATS_PATH.includes('CHANGE-ME') && req.method === 'GET') {
      const days = [];
      for (let i = 0; i < 14; i++) { const d = day(Date.now() - i * 864e5); days.push({ day: d, visitors: await count(env, 'v:' + d + ':'), submitters: await count(env, 's:' + d + ':') }); }
      return json({ days, handles: await count(env, 'u:') });
    }
    if (url.pathname === '/board' && req.method === 'GET') {
      ctx.waitUntil((async () => { const k = 'v:' + day() + ':' + (await sha(ip + day())).slice(0, 16); if (!(await env.BOARD.get(k))) await env.BOARD.put(k, '1', { expirationTtl: 90 * 864e3 }); })());
      const list = await env.BOARD.list({ prefix: 'u:', limit: 1000 });
      const rows = (await Promise.all(list.keys.map(k => env.BOARD.get(k.name, 'json')))).filter(Boolean).map(({ h, n, c, t }) => ({ h, n, c, t }));
      return json({ rows });
    }
    if (url.pathname === '/submit' && req.method === 'POST') {
      const rk = 'r:' + (await sha(ip)).slice(0, 16) + ':' + Math.floor(Date.now() / 36e5), used = +(await env.BOARD.get(rk)) || 0;
      if (used >= 30) return json({ error: 'slow down' }, 429);
      await env.BOARD.put(rk, String(used + 1), { expirationTtl: 3600 });
      let b; try { b = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
      if (!/^[A-Za-z0-9_]{3,20}$/.test(b.handle || '')) return json({ error: 'bad handle' }, 400);
      if (typeof b.token !== 'string' || b.token.length < 16) return json({ error: 'bad token' }, 400);
      if (!(b.n >= 2)) return json({ error: 'not a swarm' }, 400);
      const key = 'u:' + b.handle.toLowerCase(), prev = await env.BOARD.get(key, 'json'), th = await sha(b.token);
      if (prev && prev.th !== th) return json({ error: 'handle taken' }, 409);
      const row = { h: b.handle, th, n: Math.min(500, b.n | 0), c: Math.max(0, Math.min(1e7, b.c | 0)), t: Date.now(), e: b.email && /^[^@\s]+@[^@\s]+$/.test(b.email) ? b.email.slice(0, 120) : (prev && prev.e) || null };
      await env.BOARD.put(key, JSON.stringify(row));
      ctx.waitUntil(env.BOARD.put('s:' + day() + ':' + b.handle.toLowerCase(), '1', { expirationTtl: 90 * 864e3 }));
      return json({ ok: true, token: b.token });
    }
    return json({ error: 'not found' }, 404);
  },
};
