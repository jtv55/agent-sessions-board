// Board API for "Do you even swarm?": a Cloudflare Worker with one KV namespace (bind it as BOARD).
//   GET  /board    -> { rows: [{ h, n, s: {outcome,...}, t }] }  public rows only
//   POST /submit   -> { handle, token, email?, s, n, type }       claims a handle on first use, then updates it
// A handle is owned by whoever holds its token (generated in the browser, stored hashed here). No passwords, no logs, scores only.
// Deploy: npx wrangler kv namespace create BOARD, bind it in wrangler.toml, then npx wrangler deploy. Put the URL in ../config.js.
const DIMS = ['outcome', 'reliability', 'efficiency', 'flow', 'coord'];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...CORS } });
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/board' && req.method === 'GET') {
      const list = await env.BOARD.list({ prefix: 'u:', limit: 1000 });
      const rows = (await Promise.all(list.keys.map(k => env.BOARD.get(k.name, 'json')))).filter(Boolean).map(({ h, n, s, t }) => ({ h, n, s, t }));
      return json({ rows });
    }
    if (url.pathname === '/submit' && req.method === 'POST') {
      let b; try { b = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
      if (!/^[A-Za-z0-9_]{3,20}$/.test(b.handle || '')) return json({ error: 'bad handle' }, 400);
      if (typeof b.token !== 'string' || b.token.length < 16) return json({ error: 'bad token' }, 400);
      const s = {}; for (const k of DIMS) { const v = b.s && b.s[k]; s[k] = typeof v === 'number' && v >= 0 && v <= 100 ? Math.round(v * 10) / 10 : null; }
      if (DIMS.every(k => s[k] == null)) return json({ error: 'no scores' }, 400);
      const key = 'u:' + b.handle.toLowerCase(), prev = await env.BOARD.get(key, 'json'), th = await sha(b.token);
      if (prev && prev.th !== th) return json({ error: 'handle taken' }, 409);
      const row = { h: b.handle, th, n: Math.max(1, Math.min(500, b.n | 0)), s, t: Date.now(), e: b.email && /^[^@\s]+@[^@\s]+$/.test(b.email) ? b.email.slice(0, 120) : (prev && prev.e) || null };
      await env.BOARD.put(key, JSON.stringify(row));
      return json({ ok: true, token: b.token });
    }
    return json({ error: 'not found' }, 404);
  },
};
