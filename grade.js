// "Grade my swarm": parse Claude Code session logs entirely in the browser, score them with the benchmark's own formulas,
// and turn the result into a rank, a share card, a challenge link and a README badge. Nothing is uploaded.
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
  const COORD = new Set(['Task', 'Agent', 'Workflow', 'TaskOutput', 'TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList', 'TaskStop', 'TodoWrite', 'Skill', 'ScheduleWakeup', 'SendMessage', 'AskUserQuestion', 'ExitPlanMode', 'EnterPlanMode', 'StructuredOutput', 'CronCreate', 'CronDelete', 'CronList', 'Monitor']);
  const SHELL = new Set(['Bash', 'PowerShell']);
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

  // One transcript -> compact agent record (same shape as public-swarms.json agents).
  async function parseFile(file, main) {
    const turns = new Map(), events = [], pend = new Map(), tools = {}, useTs = new Map();
    let first = null, last = null, brief = null, sid = null, sidechain = null, title = null, human = 0, corr = 0, edits = 0, writes = 0, commits = 0, tests = 0, testsFail = 0, apiErr = 0, lastErr = false, sinceErr = 99, lastAssistant = null, cwd = null, n = 0;
    const CORR = /^\s*(no[,. !]|nope|wrong|that'?s not|not what|undo|revert|stop|don'?t|why did you|you (broke|missed|forgot)|actually|instead|i (said|meant|asked))/i;
    for await (const ln of linesOf(file)) {
      let r; try { r = JSON.parse(ln); } catch (e) { continue; }
      if (!r || typeof r !== 'object') continue;
      if (++n % 4000 === 0) await new Promise(res => setTimeout(res, 0));
      const t = r.timestamp ? Date.parse(r.timestamp) / 1000 : NaN;
      if (!isNaN(t)) { first = first == null ? t : Math.min(first, t); last = last == null ? t : Math.max(last, t); }
      if (sid == null && r.sessionId) sid = r.sessionId;
      if (sidechain == null && typeof r.isSidechain === 'boolean') sidechain = r.isSidechain;
      cwd = cwd || r.cwd;
      if (r.type === 'custom-title' && !title) title = r.customTitle;
      const m = r.message && typeof r.message === 'object' ? r.message : null;
      if (r.type === 'assistant' && m) {
        const mid = m.id || r.uuid, tr = turns.get(mid) || { t: isNaN(t) ? null : t, m: null, u: null }; turns.set(mid, tr);
        if (m.model) tr.m = m.model;
        if (m.usage && typeof m.usage === 'object') tr.u = m.usage;
        if (r.isApiErrorMessage || m.model === '<synthetic>') apiErr++;
        lastAssistant = null;
        for (const c of m.content || []) {
          if (!c || c.type !== 'tool_use') continue;
          const name = c.name || '?', inp = c.input || {};
          tools[name] = (tools[name] || 0) + 1; lastAssistant = name;
          let b = O;
          if (RESEARCH.has(name)) b = R; else if (BUILD.has(name)) b = BU; else if (COORD.has(name)) b = C;
          else if (SHELL.has(name)) {
            const cmd = String(inp.command || ''), firstCmd = cmd.trim().replace(/^(cd\s+\S+\s*(&&|;)\s*)+/, '');
            if (TEST_RE.test(cmd)) b = V; else if (RESEARCH_SH.test(firstCmd)) b = R; else b = O;
            if (COMMIT_RE.test(cmd)) commits++;
          } else if (name.startsWith('mcp__')) b = O;
          if (name === 'Edit' || name === 'MultiEdit') edits++; else if (name === 'Write') writes++;
          const rework = lastErr && sinceErr <= 2 && b !== C;
          pend.set(c.id, events.length); useTs.set(c.id, t);
          events.push([isNaN(t) ? null : t, rework ? W : b, 0, b]);
          sinceErr++;
        }
      } else if (r.type === 'user' && m) {
        const content = m.content;
        if (Array.isArray(content)) for (const c of content) {
          if (c && c.type === 'tool_result') {
            const idx = pend.get(c.tool_use_id); pend.delete(c.tool_use_id);
            const err = !!c.is_error;
            if (idx != null) { events[idx][2] = err ? 1 : 0; if (events[idx][3] === V) { tests++; if (err) testsFail++; } }
            lastErr = err; if (err) sinceErr = 0;
          }
        }
        const body = textOf(content), isTool = Array.isArray(content) && content.some(c => c && c.type === 'tool_result');
        if (body && !isTool && !r.isMeta) {
          if (brief == null && !body.trimStart().startsWith('<')) brief = body;
          if (main && !r.isSidechain && !body.trimStart().startsWith('<') && !body.startsWith('[Request interrupted')) { human++; if (CORR.test(body)) corr++; }
        }
      }
    }
    return { sid, sidechain: !!sidechain, first, last, brief, title, human, corr, cwd, tools, edits, writes, commits, tests, testsFail, apiErr, events, turns, pend, lastAssistant, name: file.name };
  }

  function toAgent(p, t0, main) {
    let tin = 0, tcr = 0, tcc = 0, tout = 0; const mods = {};
    [...p.turns.values()].forEach(tr => { const u = tr.u || {}; tin += u.input_tokens || 0; tcr += u.cache_read_input_tokens || 0; tcc += u.cache_creation_input_tokens || 0; tout += u.output_tokens || 0; if (tr.m && tr.m !== '<synthetic>') mods[tr.m] = (mods[tr.m] || 0) + 1; });
    const ev = p.events.filter(e => e[0] != null).map(e => [Math.round((e[0] - t0) * 10) / 10, e[1], e[2]]).sort((a, b) => a[0] - b[0]);
    const gaps = ev.slice(1).map((e, i) => e[0] - ev[i][0]);
    const model = Object.entries(mods).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || null;
    let status = 'ok';
    const real = [...p.turns.values()].filter(tr => tr.m !== '<synthetic>').length;
    if (p.apiErr && !real) status = 'dead'; else if (p.lastAssistant && p.lastAssistant !== 'StructuredOutput' && p.pend.size) status = 'cut';
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

  const TAGS = { A: ['Certified swarm.', 'It works, it holds up, and nobody is idle.'], B: ['A real team, with loose ends.', 'Most of the work lands. A few agents are coasting.'], C: ['More meeting than swarm.', 'Plenty of agents, not much of it sticks.'], D: ['Your agents are mostly standing around.', 'High spend, shaky results, lots of retries.'], F: ['Have you considered one agent?', 'Most of the spend produced nothing that held up.'] };

  function view(r) {
    const e = r.ent;
    if (e.n <= 1) return { na: true, grade: 'N/A', score: 0, rank: 0, of: 0, pct: 0, dims: api.DIMS.map(([k, n]) => ({ k, n, v: null })), tag: 'You didn’t even swarm.', sub: 'One agent, no sub-agents. Launch helpers and try again.', agents: 1, waste: null, name: e.name, handle: me && me.handle, type: e.type };
    const rk = api.place(e), g = api.grade(rk.score), t = TAGS[g];
    const dims = api.DIMS.map(([k, n]) => ({ k, n, v: e.s[k] }));
    const waste = e.s.efficiency != null ? Math.round(100 - e.s.efficiency) : null;
    return { grade: g, score: Math.round(rk.score), rank: rk.rank, of: rk.of, pct: rk.pct, dims, tag: t[0], sub: t[1], agents: e.n, waste, name: e.name, handle: me && me.handle, type: e.type };
  }

  function drawCard(cv, d) {
    const ctx = cv.getContext('2d'), Wd = cv.width, H = cv.height;
    const col = d.na ? '#6b7385' : { A: '#34d399', B: '#7fd8a2', C: '#f0b429', D: '#f59e6b', F: '#f87171' }[d.grade];
    const g = ctx.createLinearGradient(0, 0, Wd, H); g.addColorStop(0, '#12151c'); g.addColorStop(1, '#1d2230'); ctx.fillStyle = g; ctx.fillRect(0, 0, Wd, H);
    ctx.fillStyle = col; ctx.globalAlpha = 0.12; ctx.beginPath(); ctx.arc(250, 330, 260, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    const F = 'IBM Plex Sans, system-ui, Segoe UI, sans-serif', M = 'IBM Plex Mono, Consolas, monospace';
    ctx.fillStyle = '#9aa3b2'; ctx.font = `600 26px ${M}`; ctx.fillText('DO YOU EVEN SWARM?', 60, 72);
    ctx.fillStyle = col; ctx.font = `700 ${d.na ? 150 : 330}px ${F}`; ctx.textAlign = 'center'; ctx.fillText(d.grade, 250, d.na ? 370 : 440); ctx.textAlign = 'left';
    const fit = (t, w, size, wt) => { let z = size; do { ctx.font = `${wt} ${z}px ${F}`; z -= 2; } while (ctx.measureText(t).width > w && z > 18); };
    ctx.fillStyle = '#e8eaf0'; fit(d.tag, 640, 64, 700); ctx.fillText(d.tag, 500, 190);
    ctx.fillStyle = '#9aa3b2'; fit(d.sub, 640, 28, 400); ctx.fillText(d.sub, 500, 236);
    if (d.na) { ctx.fillStyle = '#9aa3b2'; ctx.font = `400 28px ${F}`; ctx.fillText('Not ranked: 1 agent, 0 sub-agents', 500, 306); }
    else { ctx.fillStyle = '#e8eaf0'; ctx.font = `600 44px ${M}`; ctx.fillText(`${d.score}/100`, 500, 306);
    ctx.fillStyle = '#9aa3b2'; ctx.font = `400 28px ${F}`; ctx.fillText(`#${d.rank} of ${d.of} public swarms · ${d.agents} agent${d.agents === 1 ? '' : 's'}`, 700, 304); }
    d.dims.forEach((x, i) => {
      const y = 350 + i * 40; ctx.fillStyle = '#9aa3b2'; ctx.font = `400 22px ${F}`; ctx.fillText(x.n, 500, y + 20);
      ctx.fillStyle = '#2a303d'; ctx.fillRect(700, y + 4, 400, 14);
      if (x.v != null) { ctx.fillStyle = x.v >= 65 ? '#34d399' : x.v >= 40 ? '#f0b429' : '#f87171'; ctx.fillRect(700, y + 4, 4 * x.v, 14); ctx.fillStyle = '#e8eaf0'; ctx.font = `500 20px ${M}`; ctx.fillText(String(Math.round(x.v)), 1112, y + 20); }
      else { ctx.fillStyle = '#6b7385'; ctx.font = `400 20px ${F}`; ctx.fillText('not measurable', 710, y + 20); }
    });
    ctx.fillStyle = '#e8eaf0'; ctx.font = `600 30px ${F}`; ctx.fillText(d.handle ? '@' + d.handle : 'Anonymous swarm', 60, 575);
    ctx.fillStyle = '#7c9cff'; ctx.font = `500 26px ${M}`; ctx.textAlign = 'right'; ctx.fillText(location.host + location.pathname.replace(/\/$/, ''), 1140, 575); ctx.textAlign = 'left';
  }

  function challenge(d) {
    if (d.na) return baseUrl(); return baseUrl() + '#c=' + b64u({ h: d.handle || '', s: d.score, g: d.grade, n: d.agents, d: d.dims.map(x => x.v == null ? null : Math.round(x.v)) }); }
  const shareText = d => d.na ? 'I got an N/A on "Do you even swarm?": I didn’t even swarm. Can your agents do better?' : `I scored ${d.grade} (${d.score}/100) on "Do you even swarm?": #${d.rank} of ${d.of} public AI agent teams. ${d.tag} Think your agents can beat that?`;

  function resultHtml() {
    if (!results.length) return '';
    const r = results[pick], d = view(r), url = challenge(d);
    const badge = `[![Swarm grade: ${d.grade} ${d.score}](https://img.shields.io/badge/swarm%20grade-${d.na ? 'N%2FA-6b7385' : d.grade + '%20' + d.score + '-' + { A: '34d399', B: '7fd8a2', C: 'f0b429', D: 'f59e6b', F: 'f87171' }[d.grade]})](${url})`;
    const rows = results.map((x, i) => { const v = view(x); return `<tr class="${i === pick ? 'sel' : ''}" data-gpick="${i}"><td class="txt"><b>${esc(x.ent.name)}</b></td><td class="bn">${x.ent.n}</td><td><span class="grade" style="background:${v.na ? '#6b7385' : api.GCOL[v.grade]}">${v.grade}</span></td><td class="bn">${v.na ? '–' : v.score}</td><td class="bn">${v.na ? 'n/a' : '#' + v.rank}</td></tr>`; }).join('');
    const cfg = CFG(), pro = cfg.STRIPE_LINK ? cfg.STRIPE_LINK + (cfg.STRIPE_LINK.includes('?') ? '&' : '?') + 'client_reference_id=' + encodeURIComponent(me ? me.handle : '') + (me && me.email ? '&prefilled_email=' + encodeURIComponent(me.email) : '') : '';
    return `<div class="res" id="gr-res">
      <div class="res-top"><canvas id="gr-card" width="1200" height="630" aria-label="Share card: grade ${d.grade}, ${d.score} out of 100, rank ${d.rank} of ${d.of}"></canvas></div>
      <div class="res-act">
        <button type="button" class="primary" data-g="dl">Download card</button>
        <button type="button" data-g="share">Share</button>
        <a class="btn" target="_blank" rel="noopener noreferrer" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText(d))}&url=${encodeURIComponent(url)}">Post on X</a>
        <a class="btn" target="_blank" rel="noopener noreferrer" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}">LinkedIn</a>
        <button type="button" data-copy="${esc(url)}">Copy challenge link</button>
        <button type="button" data-copy="${esc(badge)}">Copy README badge</button>
      </div>
      <p class="sub" id="gr-msg" role="status"></p>
      ${results.length > 1 ? `<div class="scroll"><table class="m bench"><thead><tr><th>Session</th><th>Agents</th><th>Grade</th><th>Score</th><th>Rank</th></tr></thead><tbody>${rows}</tbody></table></div><p class="sub">Click a session to switch the card to it. The biggest swarm is picked by default.</p>` : ''}
      ${d.na ? '<div class="claim card"><h3>No swarm, no rank</h3><p class="sub">Leaderboard spots go to teams of agents. Have your main agent launch sub-agents (the Task tool) on a real task, then drop the new logs here.</p></div>' : `<div class="claim card">${me && me.handle ? `<h3>@${esc(me.handle)} is on the board</h3><p class="sub">${me.synced ? 'Your score is live on the public leaderboard.' : (cfg.API ? 'Saved. Re-submit after your next run to move up.' : 'Saved on this device. Community submissions switch on when the board API is connected.')}</p><button type="button" data-g="submit">${cfg.API ? 'Submit this run to the public board' : 'Save this run'}</button>`
        : `<h3>Claim your spot on the leaderboard</h3><p class="sub">Pick a handle to put this run on the board and track your climb. We store scores only, never your logs.</p>
        <form id="gr-claim" autocomplete="off"><input name="handle" placeholder="handle (3-20 letters, numbers, _)" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" required aria-label="Handle"><input name="email" type="email" placeholder="email (optional, for the weekly review)" aria-label="Email"><button class="primary" type="submit">Claim my rank</button></form>`}</div>`}
      <div class="card pro"><h3>Swarm Pro</h3><p class="sub">Private runs that stay off the public board, history and trend lines, a weekly workforce review by email or Slack, and a team board for your org. Free stays free: grading, ranking and sharing.</p>
        <a class="btn primary" ${pro ? `href="${esc(pro)}" target="_blank" rel="noopener noreferrer"` : 'aria-disabled="true" href="#"'}>${pro ? 'Upgrade with Stripe · ' + esc(cfg.PRICE || '') : 'Coming soon'}</a></div>
      <p class="sub">Next: <b>run a second swarm</b> with a verifier agent and watch the Reliability bar move. Your rank updates the moment you drop new logs.</p>
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
      const parsed = []; let done = 0;
      // Biggest first would block the UI longest; parse in dropped order and cap the work at 200 files.
      for (const f of files.slice(0, 200)) {
        st.textContent = `Reading ${++done} of ${Math.min(files.length, 200)}: ${f.name.slice(0, 28)}`;
        const isSub = /subagents|agent-/.test(f.webkitRelativePath || f.name);
        parsed.push(await parseFile(f, !isSub));
      }
      const sess = assemble(parsed);
      if (!sess.length) { st.textContent = 'These logs have too few tool calls to grade (need at least 5). Try a longer session.'; return; }
      const prepped = B.prepDeep(sess);
      results = prepped.map(s => ({ ent: api.you(s) }));
      results.sort((a, b) => b.ent.n - a.ent.n || b.ent.calls - a.ent.calls); pick = 0;
      api.setYou(results[0].ent.n > 1 ? results[0].ent : null);
      st.textContent = `Graded ${results.length} session${results.length === 1 ? '' : 's'} from ${files.length} file${files.length === 1 ? '' : 's'} in your browser. Nothing was uploaded.`;
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
    if (!cfg.API) { store.set('swarm.runs', (store.get('swarm.runs') || []).concat([{ t: Date.now(), s: e.s, n: e.n }]).slice(-50)); msg('Saved on this device.'); return; }
    try {
      const r = await fetch(cfg.API.replace(/\/$/, '') + '/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle: me.handle, token: me.token, email: me.email || undefined, s: e.s, n: e.n, type: e.type }) });
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
        <p class="lead">Drop your Claude Code logs. Get a letter grade, a rank among ${api.count()} public agent teams, and a card to flex. Parsed in this tab: open your network panel and watch nothing leave.</p>
        <div id="drop" class="drop" tabindex="0" role="button" aria-label="Drop session logs here or press Enter to choose a folder"><b>Drop a folder or .jsonl files here</b><span>or press Enter to choose</span></div>
        <div class="hero-btns"><button type="button" data-g="folder">Choose folder</button><button type="button" data-g="files">Choose files</button><button type="button" data-g="demo">Try a sample swarm</button></div>
        <input id="gr-fi" type="file" accept=".jsonl,.json" multiple hidden><input id="gr-fo" type="file" webkitdirectory hidden>
        <p class="sub" id="gr-status" role="status">Where are my logs? Claude Code writes them to <code>~/.claude/projects/</code> (on Windows <code>%USERPROFILE%\\.claude\\projects</code>). Sub-agent transcripts live in a <code>subagents</code> folder beside each session.</p>
        <p class="sub">No sub-agents in the logs? You get an N/A: you didn’t even swarm. Single agents are only on the table as the control group.</p>
      </div>
      <div class="hero-r" id="gr-result"></div></section>
      <section class="proof" aria-label="What the benchmark is built from">${api.stats().map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('')}</section>
      <ol class="steps3"><li><b>Drop</b><span>A folder or a .jsonl. Parsed locally, never uploaded.</span></li><li><b>Get graded</b><span>Five dimensions, A to F, ranked against every public swarm. No sub-agents? N/A.</span></li><li><b>Flex or fix</b><span>Download the card, send a challenge link, paste a README badge.</span></li></ol>`;
    const drop = $(host, '#drop');
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
