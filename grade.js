// "Swarm check": parse Claude Code session logs entirely in the browser, count the agents in each session,
// and turn the biggest into a rank, a share card, a challenge link and a README badge. Nothing is uploaded.
(() => {
  'use strict';
  const B = window.SWB;
  const $ = (r, s) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CFG = () => window.SWARM_CONFIG || {};
  const R = 0, BU = 1, V = 2, C = 3, O = 4, W = 5;

  // ---------- the same bucket rules as tools/build_public_swarms.py ----------
  const RESEARCH = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch', 'ToolSearch', 'NotebookRead']);
  const BUILD = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);
  const COORD = new Set(['Task', 'Agent', 'Workflow', 'TaskOutput', 'TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList', 'TaskStop', 'TodoWrite', 'Skill', 'ScheduleWakeup', 'SendMessage', 'AskUserQuestion', 'ExitPlanMode', 'EnterPlanMode', 'StructuredOutput', 'SubagentHandback', 'CronCreate', 'CronDelete', 'CronList', 'Monitor']);
  const SHELL = new Set(['Bash', 'PowerShell']);
  const FINAL = new Set(['StructuredOutput', 'SubagentHandback']);   // a sub-agent's last call hands its report back and gets no result
  const TEST_RE = /\b(pytest|unittest|jest|vitest|mocha|cargo\s+(test|check|clippy)|go\s+(test|vet)|npm\s+(run\s+)?(test|lint|build)|yarn\s+(test|lint|build)|pnpm\s+(test|lint|build)|tsc|eslint|ruff|flake8|mypy|make\s+(test|check)|ctest|bun\s+test|verify|validate)\b/i;
  const RESEARCH_SH = /^(ls|cat|head|tail|grep|rg|find|pwd|echo|wc|which|stat|file|tree|df|du|ps|env|date|type|dir|get-content|get-childitem|select-string|git\s+(status|log|diff|show|branch)|sed\s+-n)\b/i;
  const COMMIT_RE = /git\s+commit/;
  const ROLES = [['Verifier', /adversar|verify|confirm|double-?check|validate|reproduce/gi], ['Reviewer', /audit|review|critique|inspect|assess|evaluate/gi], ['Tester', /\btest(s|ing)?\b|\bqa\b/gi],
    ['Planner', /synthes|summari[sz]e|\bplan\b|\brank\b|design|propose|roadmap|decide/gi], ['Builder', /implement|\bwrite\b|\bbuild\b|\bcreate\b|\bfix\b|refactor|\badd\b|generate|port\b/gi], ['Researcher', /analy[sz]e|investigat|research|survey|explore|\bfind\b|look (up|into)|read through|search/gi]];
  const roleOf = t => { let best = 'Generalist', sc = 0; ROLES.forEach(([n, rx]) => { const k = ((t || '').slice(0, 3000).match(rx) || []).length; if (k > sc) { best = n; sc = k; } }); return best; };
  const short = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 1) + '…'; };
  const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => x && x.type === 'text' ? x.text || '' : '').join('\n') : '';

  async function* linesOf(file) {
    const rd = file.stream().pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await rd.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { yield buf.slice(0, i); buf = buf.slice(i + 1); }
    }
    if (buf) yield buf;
  }

  // One file -> one record per agent. A normal log holds one agent; a merged swarm file holds the main agent and its sub-agents,
  // told apart by isSidechain and agentId, so people can hand over a single file.
  const CORR = /^\s*(no[,. !]|nope|wrong|that'?s not|not what|undo|revert|stop|don'?t|why did you|you (broke|missed|forgot)|actually|instead|i (said|meant|asked))/i;
  const newState = () => ({ turns: new Map(), events: [], pend: new Map(), tools: {}, useTs: new Map(), first: null, last: null, brief: null, sid: null, title: null, human: 0, corr: 0, edits: 0, writes: 0, commits: 0, tests: 0, testsFail: 0, apiErr: 0, lastErr: false, sinceErr: 99, lastAssistant: null, cwd: null });

  function consume(st, r, main) {
    const t = r.timestamp ? Date.parse(r.timestamp) / 1000 : NaN;
    if (!isNaN(t)) { st.first = st.first == null ? t : Math.min(st.first, t); st.last = st.last == null ? t : Math.max(st.last, t); }
    if (st.sid == null && r.sessionId) st.sid = r.sessionId;
    st.cwd = st.cwd || r.cwd;
    if (r.type === 'custom-title' && !st.title) st.title = r.customTitle;
    const m = r.message && typeof r.message === 'object' ? r.message : null;
    if (r.type === 'assistant' && m) {
      const mid = m.id || r.uuid, tr = st.turns.get(mid) || { t: isNaN(t) ? null : t, m: null, u: null }; st.turns.set(mid, tr);
      if (m.model) tr.m = m.model;
      if (m.usage && typeof m.usage === 'object') tr.u = m.usage;
      if (r.isApiErrorMessage || m.model === '<synthetic>') st.apiErr++;
      st.lastAssistant = null;
      for (const c of m.content || []) {
        if (!c || c.type !== 'tool_use') continue;
        const name = c.name || '?', inp = c.input || {};
        st.tools[name] = (st.tools[name] || 0) + 1; st.lastAssistant = name;
        let b = O;
        if (RESEARCH.has(name)) b = R; else if (BUILD.has(name)) b = BU; else if (COORD.has(name)) b = C;
        else if (SHELL.has(name)) {
          const cmd = String(inp.command || ''), firstCmd = cmd.trim().replace(/^(cd\s+\S+\s*(&&|;)\s*)+/, '');
          if (TEST_RE.test(cmd)) b = V; else if (RESEARCH_SH.test(firstCmd)) b = R; else b = O;
          if (COMMIT_RE.test(cmd)) st.commits++;
        } else if (name.startsWith('mcp__')) b = O;
        if (name === 'Edit' || name === 'MultiEdit') st.edits++; else if (name === 'Write') st.writes++;
        const rework = st.lastErr && st.sinceErr <= 2 && b !== C;
        st.pend.set(c.id, st.events.length); st.useTs.set(c.id, t);
        st.events.push([isNaN(t) ? null : t, rework ? W : b, 0, b]);
        st.sinceErr++;
      }
    } else if (r.type === 'user' && m) {
      const content = m.content;
      if (Array.isArray(content)) for (const c of content) {
        if (c && c.type === 'tool_result') {
          const idx = st.pend.get(c.tool_use_id); st.pend.delete(c.tool_use_id);
          const err = !!c.is_error;
          if (idx != null) { st.events[idx][2] = err ? 1 : 0; if (st.events[idx][3] === V) { st.tests++; if (err) st.testsFail++; } }
          st.lastErr = err; if (err) st.sinceErr = 0;
        }
      }
      const body = textOf(content), isTool = Array.isArray(content) && content.some(c => c && c.type === 'tool_result');
      if (body && !isTool && !r.isMeta) {
        if (st.brief == null && !body.trimStart().startsWith('<')) st.brief = body;
        if (main && !body.trimStart().startsWith('<') && !body.startsWith('[Request interrupted')) { st.human++; if (CORR.test(body)) st.corr++; }
      }
    }
  }

  async function parseFile(file) {
    const states = new Map(); let n = 0, foreign = null;
    for await (const ln of linesOf(file)) {
      let r; try { r = JSON.parse(ln); } catch (e) { continue; }
      if (!r || typeof r !== 'object') continue;
      if (!foreign && (r.type === 'session_meta' || r.type === 'response_item' || r.type === 'turn_context')) foreign = 'Codex CLI';
      if (++n % 4000 === 0) await new Promise(res => setTimeout(res, 0));
      const key = r.isSidechain === true ? 'sub:' + (r.agentId || r.sessionId || '') : 'main';
      let st = states.get(key); if (!st) { st = newState(); states.set(key, st); }
      consume(st, r, key === 'main');
    }
    const out = [...states.entries()].filter(([, st]) => st.events.length || st.turns.size).map(([key, st]) => Object.assign(st, { sidechain: key !== 'main', name: file.name }));
    if (!out.length && foreign) out.foreign = foreign;
    return out;
  }

  function toAgent(p, t0, main) {
    let tin = 0, tcr = 0, tcc = 0, tout = 0; const mods = {};
    [...p.turns.values()].forEach(tr => { const u = tr.u || {}; tin += u.input_tokens || 0; tcr += u.cache_read_input_tokens || 0; tcc += u.cache_creation_input_tokens || 0; tout += u.output_tokens || 0; if (tr.m && tr.m !== '<synthetic>') mods[tr.m] = (mods[tr.m] || 0) + 1; });
    const ev = p.events.filter(e => e[0] != null).map(e => [Math.round((e[0] - t0) * 10) / 10, e[1], e[2]]).sort((a, b) => a[0] - b[0]);
    const gaps = ev.slice(1).map((e, i) => e[0] - ev[i][0]);
    const model = Object.entries(mods).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || null;
    let status = 'ok';
    const real = [...p.turns.values()].filter(tr => tr.m !== '<synthetic>').length;
    if (p.apiErr && !real) status = 'dead'; else if (!main && p.lastAssistant && !FINAL.has(p.lastAssistant) && p.pend.size) status = 'cut';   // a live or just-ended main session always has a trailing call
    return { title: short(p.title || p.brief, 90), role: main ? 'Orchestrator' : roleOf(p.brief || p.title), model, models: mods, t0: Math.round((p.first - t0) * 10) / 10, t1: Math.round((p.last - t0) * 10) / 10, turns: p.turns.size,
      tok: [tin, tcr, tcc, tout], tools: p.tools, errs: ev.filter(e => e[2]).length, idle: Math.round(gaps.filter(g => g > 120).reduce((a, b) => a + b, 0)), ooo: [], status, ramp: 0,
      edits: p.edits, writes: p.writes, add: 0, del: 0, commits: p.commits, tests: p.tests, testsFail: p.testsFail, ext: 0, toolKB: 0, toolSec: 0, toolOut: {}, extCalls: [], apiErr: p.apiErr, ev };
  }

  // Group parsed files into sessions: a main transcript plus the sub-agent transcripts that carry its sessionId.
  function assemble(parsed) {
    const mains = parsed.filter(p => !p.sidechain && p.events.length && p.first != null), subs = parsed.filter(p => p.sidechain && p.first != null);
    const out = [];
    mains.forEach(m => {
      const mine = subs.filter(s => s.sid && s.sid === m.sid).sort((a, b) => a.first - b.first);
      const t0 = m.first, agents = [Object.assign(toAgent(m, t0, true), { id: 'main', name: 'Main agent', layer: 0, squad: null })];
      let cur = 0, lastT = null;
      mine.forEach((s, i) => {
        if (lastT == null || s.first - lastT > 300) cur++; lastT = s.first;
        if (!s.turns.size) return;
        agents.push(Object.assign(toAgent(s, t0, false), { id: 'a' + (i + 1), name: 'Sub-agent ' + (i + 1), layer: 2, squad: 'S' + cur }));
      });
      const id = (m.sid || m.name).slice(0, 8);
      out.push({ id: 'you-' + id, src: 'you', lens: 'deep', title: short(m.title || m.brief || id, 70), start: new Date(m.first * 1000).toISOString(), platform: 'Unknown', hosting: 'api', human: m.human, corr: m.corr, interrupts: 0, compactions: 0, hours: Array(24).fill(0), agents });
    });
    return out.filter(s => s.agents.reduce((a, x) => a + x.ev.length, 0) >= 5);
  }

  async function readEntries(items) {
    const files = [];
    const walk = async en => {
      if (en.isFile) await new Promise(res => en.file(f => { files.push(f); res(); }, res));
      else if (en.isDirectory) { const rd = en.createReader(); for (;;) { const batch = await new Promise(res => rd.readEntries(res, () => res([]))); if (!batch.length) break; for (const x of batch) await walk(x); } }
    };
    for (const it of items) { const en = it.webkitGetAsEntry && it.webkitGetAsEntry(); if (en) await walk(en); else if (it.getAsFile) { const f = it.getAsFile(); if (f) files.push(f); } }
    return files;
  }

  // ---------- state ----------
  let host = null, api = null, results = [], pick = 0, busy = false, me = null, demo = false;
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } } };
  const b64u = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
  const baseUrl = () => location.origin + location.pathname;

  const tagFor = n => { const u = B.unitOf(n); return [(/^[AEIOU]/.test(u.name) ? 'An ' : 'A ') + u.name.toLowerCase() + '.', `${n} agents. In Army terms, ${u.range} soldiers.`]; };

  function view(r) {
    const e = r.ent, base = { name: e.name, handle: me && me.handle, type: e.type, agents: e.n, calls: e.calls || 0, peak: e.peak || 0 };
    if (e.n <= 1) return Object.assign(base, { na: true, rank: 0, of: 0, tag: 'You don’t even swarm!', sub: 'One agent, no sub-agents. Launch helpers and try again.' });
    const rk = api.place(e), t = tagFor(e.n);
    return Object.assign(base, { rank: rk.rank, of: rk.of, tag: t[0], sub: t[1] });
  }

  function drawCard(cv, d) {
    const ctx = cv.getContext('2d'), Wd = cv.width, H = cv.height;
    const col = d.na ? '#6b7385' : '#7c9cff';
    const g = ctx.createLinearGradient(0, 0, Wd, H); g.addColorStop(0, '#12151c'); g.addColorStop(1, '#1d2230'); ctx.fillStyle = g; ctx.fillRect(0, 0, Wd, H);
    ctx.fillStyle = col; ctx.globalAlpha = 0.12; ctx.beginPath(); ctx.arc(250, 330, 260, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    const F = 'IBM Plex Sans, system-ui, Segoe UI, sans-serif', M = 'IBM Plex Mono, Consolas, monospace';
    ctx.fillStyle = '#9aa3b2'; ctx.font = `600 26px ${M}`; ctx.fillText('SWARM CHECK', 60, 72);
    const num = String(d.agents); let z = 330; do { ctx.font = `700 ${z}px ${F}`; z -= 10; } while (ctx.measureText(num).width > 400 && z > 80);
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(num, 250, 420); ctx.fillStyle = '#9aa3b2'; ctx.font = `600 34px ${M}`; ctx.fillText(d.agents === 1 ? 'AGENT' : 'AGENTS', 250, 490); ctx.textAlign = 'left';
    const fit = (t, w, size, wt) => { let z = size; do { ctx.font = `${wt} ${z}px ${F}`; z -= 2; } while (ctx.measureText(t).width > w && z > 18); };
    ctx.fillStyle = '#e8eaf0'; fit(d.tag, 640, 64, 700); ctx.fillText(d.tag, 500, 190);
    ctx.fillStyle = '#9aa3b2'; fit(d.sub, 640, 28, 400); ctx.fillText(d.sub, 500, 236);
    if (d.na) { ctx.fillStyle = '#9aa3b2'; ctx.font = `400 28px ${F}`; ctx.fillText('Not ranked: 1 agent, 0 sub-agents', 500, 306); }
    else {
      ctx.fillStyle = '#e8eaf0'; ctx.font = `600 44px ${M}`; ctx.fillText(`#${d.rank} of ${d.of}`, 500, 306); ctx.fillStyle = '#9aa3b2'; ctx.font = `400 28px ${F}`; ctx.fillText('public swarms, by agent count', 760, 304);
      [['Tool calls', d.calls.toLocaleString()], ['Most at once', d.peak ? String(d.peak) : '–']].forEach((x, i) => { const y = 380 + i * 56; ctx.fillStyle = '#9aa3b2'; ctx.font = `400 26px ${F}`; ctx.fillText(x[0], 500, y); ctx.fillStyle = '#e8eaf0'; ctx.font = `600 40px ${M}`; ctx.fillText(x[1], 800, y + 2); });
    }
    ctx.fillStyle = '#e8eaf0'; ctx.font = `600 30px ${F}`; ctx.fillText(d.handle ? '@' + d.handle : 'Anonymous swarm', 60, 575);
    ctx.fillStyle = '#7c9cff'; ctx.font = `500 26px ${M}`; ctx.textAlign = 'right'; ctx.fillText(location.host + location.pathname.replace(/\/$/, ''), 1140, 575); ctx.textAlign = 'left';
  }

  function challenge(d) {
    if (d.na) return baseUrl(); return baseUrl() + '#c=' + b64u({ h: d.handle || '', n: d.agents, c: d.calls }); }
  const shareText = d => d.na ? 'I got an N/A on "Do you even swarm?": one agent, no helpers. Can you do better?' : `I run swarms of ${d.agents} agents: #${d.rank} of ${d.of} on "Do you even swarm?" ${d.tag} How big are your swarms?`;

  function resultHtml() {
    if (!results.length) return '';
    const r = results[pick], d = view(r), url = challenge(d);
    const badge = `[![Swarm check: ${d.na ? 'N/A' : d.agents + ' agents'}](https://img.shields.io/badge/swarm%20check-${d.na ? 'N%2FA-6b7385' : d.agents + '%20agents-6f8cff'})](${url})`;
    const rows = results.map((x, i) => { const v = view(x); return `<tr class="${i === pick ? 'sel' : ''}" data-gpick="${i}"><td class="txt"><b>${esc(x.ent.name)}</b></td><td class="bn"><b>${x.ent.n}</b></td><td class="bn">${x.ent.calls || '–'}</td><td class="bn">${v.na ? 'n/a' : '#' + v.rank}</td></tr>`; }).join('');
    const cfg = CFG(), pro = cfg.STRIPE_LINK ? cfg.STRIPE_LINK + (cfg.STRIPE_LINK.includes('?') ? '&' : '?') + 'client_reference_id=' + encodeURIComponent(me ? me.handle : '') + (me && me.email ? '&prefilled_email=' + encodeURIComponent(me.email) : '') : '';
    return `<div class="res" id="gr-res">
      <div class="res-top"><canvas id="gr-card" width="1200" height="630" aria-label="Share card: ${d.agents} agent${d.agents === 1 ? '' : 's'}${d.na ? ', not ranked' : ', rank ' + d.rank + ' of ' + d.of}"></canvas></div>
      <div class="res-act">
        <button type="button" class="primary" data-g="dl">Download card</button>
        <button type="button" data-g="share">Share</button>
        <a class="btn" target="_blank" rel="noopener noreferrer" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText(d))}&url=${encodeURIComponent(url)}">Post on X</a>
        <a class="btn" target="_blank" rel="noopener noreferrer" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}">LinkedIn</a>
        <button type="button" data-copy="${esc(url)}">Copy challenge link</button>
        <button type="button" data-copy="${esc(badge)}">Copy README badge</button>
        ${demo ? '' : '<button type="button" data-g="deep">Open the deep dive for this run</button>'}
      </div>
      <p class="sub" id="gr-msg" role="status"></p>
      ${results.length > 1 ? `<div class="scroll"><table class="m bench"><thead><tr><th>Session</th><th>Agents</th><th>Tool calls</th><th>Rank</th></tr></thead><tbody>${rows}</tbody></table></div><p class="sub">Click a session to switch the card to it. The biggest swarm is picked by default.</p>` : ''}
      ${d.na ? '<div class="claim card"><h3>You don’t even swarm!</h3><p class="sub">Leaderboard spots go to teams of agents. Have your main agent launch sub-agents (the Task tool) on a real task, then drop the new logs here.</p></div>' : `<div class="claim card">${me && me.handle ? `<h3>@${esc(me.handle)} is on the board</h3><p class="sub">${me.synced ? 'Your score is live on the public leaderboard.' : (cfg.API ? 'Saved. Re-submit after your next run to move up.' : 'Saved on this device. Community submissions switch on when the board API is connected.')}</p><button type="button" data-g="submit">${cfg.API ? 'Submit this run to the public board' : 'Save this run'}</button>`
        : `<h3>Claim your spot on the leaderboard</h3><p class="sub">Pick a handle to put this run on the board and track your climb. We store your agent count only, never your logs.</p>
        <form id="gr-claim" autocomplete="off"><input name="handle" placeholder="handle (3-20 letters, numbers, _)" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" required aria-label="Handle"><input name="email" type="email" placeholder="email (optional, for the weekly review)" aria-label="Email"><button class="primary" type="submit">Claim my rank</button></form><p class="sub fine">We store your handle and your agent count. An email is optional and used only for the weekly review and product updates. To delete anything, <a href="https://github.com/jtv55/agent-sessions-board/issues" target="_blank" rel="noopener noreferrer">open an issue</a> and we will remove it.</p>`}</div>`}
      ${d.na ? '' : `<div class="card cohort"><h3>Cohort cuts: ${Math.min(api.commCount(), 30)} of 30 contributions</h3><div class="meter" role="img" aria-label="${Math.min(api.commCount(), 30)} of 30 contributions"><i style="width:${Math.round(100 * Math.min(api.commCount(), 30) / 30)}%"></i></div><p class="sub">Your place against teams like yours (${d.agents} agents, same model, same task type) unlocks once a cut has 30 contributed runs. Submitting your agent count, never your logs, counts as a contribution and puts you first in line.</p></div>`}
      <div class="card pro"><h3>Swarm Members</h3><p class="sub">For people who run swarms and want to learn from other people’s: members share their swarm sessions with each other, so you see where you rank among them, study their swarms and query it all by API. Only session structure is shared: agents, timing and tool names, never prompts, code or output. Founding members get each piece as it ships.</p>
        <a class="btn primary" ${pro ? `href="${esc(pro)}" target="_blank" rel="noopener noreferrer"` : 'aria-disabled="true" href="#"'}>${pro ? 'Join for ' + esc(cfg.PRICE || '') : 'Coming soon'}</a></div>
      <p class="sub">Next: <b>launch more helpers</b> and drop the new logs. Your rank updates the moment you do.</p>
    </div>`;
  }

  function paintResult() {
    const box = $(host, '#gr-result'); if (!box) return;
    box.innerHTML = resultHtml();
    const cv = $(box, '#gr-card'); if (cv && results.length) drawCard(cv, view(results[pick]));
  }

  function msg(t) { const m = $(host, '#gr-msg'); if (m) { m.textContent = t; clearTimeout(msg.t); msg.t = setTimeout(() => { m.textContent = ''; }, 3500); } }

  async function grade(files) {
    if (busy) return;
    files = files.filter(f => /\.jsonl?$/i.test(f.name));
    const st = $(host, '#gr-status');
    if (!files.length) { st.textContent = 'No .jsonl session logs found in what you dropped. Claude Code keeps them in ~/.claude/projects.'; return; }
    busy = true; demo = false;
    try {
      const parsed = [], foreign = new Set(); let done = 0;
      // Biggest first would block the UI longest; parse in dropped order and cap the work at 200 files.
      for (const f of files.slice(0, 200)) {
        st.textContent = `Reading ${++done} of ${Math.min(files.length, 200)}: ${f.name.slice(0, 28)}`;
        const got = await parseFile(f); if (got.foreign) foreign.add(got.foreign); parsed.push(...got);
      }
      const sess = assemble(parsed);
      if (!sess.length && foreign.size) { st.textContent = `That looks like a ${[...foreign][0]} log. Only Claude Code logs are supported so far.`; return; }
      if (!sess.length) { st.textContent = 'These logs have too few tool calls to count (need at least 5). Try a longer session.'; return; }
      const prepped = B.prepDeep(sess);
      window.Swarms.addMine(prepped);
      results = prepped.map(s => ({ ent: api.you(s), sid: s.id }));
      results.sort((a, b) => b.ent.n - a.ent.n || b.ent.calls - a.ent.calls); pick = 0;
      api.setYou(results[0].ent.n > 1 ? results[0].ent : null);
      const top = results[0].ent;
      st.textContent = `Checked ${results.length} session${results.length === 1 ? '' : 's'} from ${files.length} file${files.length === 1 ? '' : 's'}: the largest has ${top.n} agent${top.n === 1 ? '' : 's'} and ${top.calls} tool calls. Nothing was uploaded.` + (top.n <= 1 ? ' No sub-agent records were found in what you picked. If this session used sub-agents, merge their logs into the same file (see the phone tip above).' : '');
      paintResult(); api.repaint();
      const res = $(host, '#gr-res'); if (res && res.scrollIntoView) res.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { console.error(e); st.textContent = 'Could not read those files. Try a single .jsonl from ~/.claude/projects.'; }
    finally { busy = false; }
  }

  function tryDemo() {
    const pickE = api.demoEntrant(); if (!pickE) return;
    demo = true; results = [{ ent: Object.assign({}, pickE, { name: 'Sample: ' + pickE.name }) }]; pick = 0;
    api.setYou(null); $(host, '#gr-status').textContent = 'Showing a public swarm as a sample. Drop your own logs to replace it.'; me && 0;
    paintResult();
  }

  async function submit() {
    const cfg = CFG(); if (!me || !results.length) return;
    const e = results[pick].ent;
    if (!cfg.API) { store.set('swarm.runs', (store.get('swarm.runs') || []).concat([{ t: Date.now(), n: e.n, c: e.calls }]).slice(-50)); msg('Saved on this device.'); return; }
    try {
      const r = await fetch(cfg.API.replace(/\/$/, '') + '/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle: me.handle, token: me.token, email: me.email || undefined, n: e.n, c: e.calls, type: e.type, s: { coord: Math.min(100, e.n) } }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
      me.token = j.token || me.token; me.synced = true; store.set('swarm.me', me); msg('Submitted. You are on the public board.'); paintResult(); api.refreshCommunity();
    } catch (err) { msg('Could not reach the board right now: ' + err.message); }
  }

  function mount(el, a) {
    host = el; api = a; me = store.get('swarm.me');
    const cfg = CFG();
    host.innerHTML = `<section class="hero" aria-labelledby="gh">
      <div class="hero-l">
        <p class="kicker"><i class="dot"></i> Free · 60 seconds · nothing is uploaded</p>
        <h1 id="gh" class="hero-h">Do you even <em>swarm</em>?</h1>
        <p class="lead">Drop your Claude Code logs. We count the agents in your biggest session and rank you among ${api.count()} public swarms. One agent? You don’t even swarm.</p>
        <p class="nothing"><i aria-hidden="true">&#128274;</i> Parsed in this browser tab: open your network panel and watch nothing leave.</p>
        <div id="drop" class="drop" tabindex="0" role="button" aria-label="Drop session logs here or press Enter to choose a folder"><b>Drop a folder or .jsonl files here</b><span>or press Enter to choose</span></div>
        <div class="hero-btns"><button type="button" data-g="folder">Choose folder</button><button type="button" data-g="files">Choose files</button><button type="button" data-g="demo">Try a sample swarm</button></div>
        <details class="phone" id="gr-phone"><summary>Can’t find your log? Ask Claude with this prompt</summary><p class="sub">Paste this into your Claude Code session. It hands you one file with everything in it, sub-agents included, so a swarm still counts. Save the file, then tap or click <b>Choose files</b> and pick it.</p><pre class="prompt" id="gr-prompt">Find this session's log: the newest .jsonl file for this project in ~/.claude/projects/. Merge it and every sub-agent log in the subagents folder beside it into ONE file by concatenating them, name it swarm-session.json, and send it to me as a downloadable file.</pre><button type="button" data-copy="__PROMPT__">Copy prompt</button></details>
        <input id="gr-fi" type="file" accept=".jsonl,.json" multiple hidden><input id="gr-fo" type="file" webkitdirectory hidden>
        <p class="sub" id="gr-status" role="status">Claude Code saves each session as a .jsonl file in the <code>.claude/projects</code> folder inside your home folder, with sub-agent transcripts in a <code>subagents</code> folder beside it. Not sure where that is? Use the prompt above.</p>
        <p class="nasay"><b>No sub-agents in your logs?</b> You get an N/A: <em>you don’t even swarm!</em></p>
      </div>
      <div class="hero-r" id="gr-result"></div></section>
      <section class="proof" aria-label="What the check is built from">${api.stats().map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('')}</section>
      <ol class="steps3"><li><b>Drop</b><span>A folder or a .jsonl. Parsed locally, never uploaded.</span></li><li><b>Get counted</b><span>We count your agents and rank you against every public swarm. No sub-agents? N/A.</span></li><li><b>Flex or fix</b><span>Download the card, send a challenge link, paste a README badge.</span></li></ol>`;
    const drop = $(host, '#drop');
    $(host, '[data-copy="__PROMPT__"]').dataset.copy = $(host, '#gr-prompt').textContent;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) { $(host, '#gr-phone').open = true; drop.querySelector('b').textContent = 'Tap to choose your log files'; drop.querySelector('span').textContent = 'JSON or JSONL from Claude Code'; }
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', async e => { const items = [...(e.dataTransfer.items || [])]; const files = items.length && items[0].webkitGetAsEntry ? await readEntries(items) : [...e.dataTransfer.files]; grade(files); });
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $(host, '#gr-fo').click(); } });
    drop.addEventListener('click', () => $(host, '#gr-fo').click());
    $(host, '#gr-fi').addEventListener('change', e => grade([...e.target.files]));
    $(host, '#gr-fo').addEventListener('change', e => grade([...e.target.files]));
    host.addEventListener('click', async e => {
      const g = e.target.closest('[data-g]');
      if (g) {
        const k = g.dataset.g;
        if (k === 'folder') $(host, '#gr-fo').click(); else if (k === 'files') $(host, '#gr-fi').click(); else if (k === 'demo') tryDemo();
        else if (k === 'dl') { const cv = $(host, '#gr-card'); const a2 = document.createElement('a'); a2.download = 'do-you-even-swarm.png'; a2.href = cv.toDataURL('image/png'); a2.click(); msg('Card saved. Attach it to your post.'); }
        else if (k === 'share') {
          const d = view(results[pick]), cv = $(host, '#gr-card');
          cv.toBlob(async blob => {
            const file = new File([blob], 'do-you-even-swarm.png', { type: 'image/png' });
            try { if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: shareText(d), url: challenge(d) }); else if (navigator.share) await navigator.share({ text: shareText(d), url: challenge(d) }); else { await navigator.clipboard.writeText(shareText(d) + ' ' + challenge(d)); msg('Post text copied. Paste it and attach the card.'); } } catch (err) { /* share cancelled */ }
          });
        } else if (k === 'submit') submit();
        else if (k === 'deep') { window.Swarms.showMine(results[pick].sid); document.getElementById('tab-pub').click(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        return;
      }
      const c = e.target.closest('[data-copy]'); if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); msg('Copied.'); } catch (err) { msg('Select and copy from the address bar.'); } return; }
      const p = e.target.closest('[data-gpick]'); if (p) { pick = +p.dataset.gpick; api.setYou(demo || results[pick].ent.n <= 1 ? null : results[pick].ent); paintResult(); api.repaint(); }
    });
    host.addEventListener('submit', e => {
      if (e.target.id !== 'gr-claim') return; e.preventDefault();
      const f = new FormData(e.target), handle = String(f.get('handle') || '').trim(), email = String(f.get('email') || '').trim();
      if (!/^[A-Za-z0-9_]{3,20}$/.test(handle)) { msg('Handle: 3-20 letters, numbers or underscore.'); return; }
      me = { handle, email: email || null, token: (crypto.getRandomValues(new Uint32Array(4)).join('-')), synced: false }; store.set('swarm.me', me);
      api.setHandle(handle); paintResult(); submit();
    });
    if (results.length) paintResult(); else previewSample();
  }

  // Before anyone drops anything, show what they will get: the card of the top public swarm.
  function previewSample() {
    const e = api.demoEntrant(), box = $(host, '#gr-result'); if (!e || !box) return;
    const d = view({ ent: e }); d.handle = api.owner(e).replace(/^@/, '');
    box.innerHTML = `<div class="res"><div class="res-top"><canvas id="gr-card" width="1200" height="630" aria-label="Sample share card"></canvas></div><p class="sub sample">Sample: the top public swarm, ${esc(api.owner(e))}. Yours could be right here.</p></div>`;
    drawCard($(box, '#gr-card'), d);
  }

  window.Grade = { mount, parseFile, assemble, challenge, unb64u, b64u, me: () => me };
})();
