// Swarm check tab: how many agents does each user run at once-ish? Entrants are ranked by the agent count of their biggest
// swarm. One agent, no helpers: not ranked, listed as "didn't even swarm". There is no quality grade: counting agents is a fact,
// scoring how well they worked would be a judgement the data cannot back.
(() => {
  'use strict';
  const B = window.SWB, C = window.SWC, W = window.SWW;
  const { sum, median } = B;
  const { L, plot, na, b, esc, num, theme, shortT } = C;

  const TYPES = { swarm: 'Swarm (Claude Code)', single: 'Single agent (Claude Code)', coop: 'Agent pair (CooperBench)', solo: 'Single agent (CooperBench)', mast: 'Framework team (MAST)', pool: 'Single-agent population (MiMo)', prod: 'Production traces', user: 'Community submission', you: 'You', chal: 'Challenger' };
  const TCOL = { swarm: '#6f8cff', single: '#94a3b8', coop: '#f0b429', solo: '#c9b27a', mast: '#c084fc', prod: '#2aa7ae', pool: '#8b9bb4', user: '#fb923c', you: '#f472b6', chal: '#f472b6' };
  const tk = e => e.you ? 'you' : e.chal ? 'chal' : e.type;
  const dname = e => e.disp ? e.disp : e.you ? ((window.Grade && window.Grade.me() && window.Grade.me().handle) ? '@' + window.Grade.me().handle : 'You') + ' · ' + e.name : e.name;
  const ownerOf = e => { if (e.you || e.chal) return null; if (e.type === 'user') return e.name.replace(/^@/, ''); if (e.src === 'mast') return e.mf; const so = D && D.corpus.sources[e.src]; return so ? so.repo.split('/')[0] : e.name; };
  const disp = e => e.you ? dname(e) : e.chal ? e.name : e.type === 'mast' ? ownerOf(e) : '@' + ownerOf(e);
  const byN = (p, q) => q.n - p.n || (q.calls || 0) - (p.calls || 0);
  // One row per user: their biggest swarm.
  const bestPerOwner = list => { if (!byUser) return list; const seen = new Set(); return list.slice().sort(byN).filter(e => { const k = e.owner; if (k == null) return true; if (seen.has(k)) return false; seen.add(k); return true; }); };
  const mean = a => a.length ? sum(a) / a.length : null;

  let byUser = true, D = null, E = [], host = null, filt = 'all', YOU = null, CHAL = null, COMM = [];
  const CFG = () => window.SWARM_CONFIG || {};
  const ag = n => n + (n === 1 ? ' agent' : ' agents');

  // ---------- entrants: n is the number of agents in the biggest unit (session, pair, framework run) ----------
  function deepEntrant(s) {
    const A = s.agents, calls = sum(A.map(a => a.calls)) || 1;
    return { id: 'd' + s.id, src: s.src, calls, peak: s.stats && s.stats.peak, name: B_short(s.title || s.id, 30) + ' (' + ag(A.length) + ')', type: A.length > 1 ? 'swarm' : 'single', n: A.length, nLabel: ag(A.length) + ', ' + calls + ' calls' };
  }
  const B_short = (t, n) => shortT(t, n);

  function fleetEntrants(F) {
    const nTasks = F.coop.length, nSolo = F.solo.length;
    return [
      { id: 'fcall', src: 'coop', name: 'Coop pairs', type: 'coop', n: 2, nLabel: nTasks + ' tasks, 2 agents each' },
      { id: 'fsolo', src: 'solo', name: 'Solo agent', type: 'solo', n: 1, nLabel: nSolo + ' tasks, 1 agent each' }];
  }

  // A framework run's agents are its distinct named roles (CEO, Reviewer, ...). One entry per framework: its biggest run.
  function mastEntrants(M) {
    const g = {}; M.rows.forEach(r => { (g[r.f] = g[r.f] || []).push(r); });
    return Object.entries(g).filter(([, rr]) => rr.length >= 10).map(([f, rr]) => {
      const sizes = rr.map(r => r.nroles != null ? r.nroles : Object.keys(r.r || {}).length), n = Math.max(...sizes);
      return { id: 'm' + f, src: 'mast', mf: f, name: f, type: 'mast', n, nLabel: 'up to ' + ag(n) + ', median ' + Math.round(median(sizes)) + ' in ' + rr.length + ' runs' };
    });
  }

  function poolEntrants(P) {
    if (!P || !P.rows) return [];
    return [{ id: 'plall', src: 'mimo', name: P.model + ' sessions', type: 'pool', n: 1, nLabel: P.rows.length + ' sessions, 1 agent each' }];
  }

  function prodEntrants(P) {
    return P.map(p => ({ id: 'p' + p.id, src: 'semi', name: 'Production ' + p.id, type: 'prod', n: p.agents, nLabel: ag(p.agents) + ', ' + p.reqs + ' requests' }));
  }

  // ---------- ranking ----------
  function ranked() {
    let list = E.concat(COMM, CHAL ? [CHAL] : [], YOU ? [YOU] : []).map(e => { const o = Object.assign({}, e, { owner: ownerOf(e) }); o.disp = disp(o); return o; });
    const keep = e => e.you || e.chal;
    if (filt !== 'all') list = list.filter(e => keep(e) || e.type === filt);
    const swarmers = list.filter(e => e.n > 1).sort(byN), cnt = {}; swarmers.forEach(e => { if (e.owner != null) cnt[e.owner] = (cnt[e.owner] || 0) + 1; });
    const nas = list.filter(e => e.n <= 1 && !keep(e));
    const rk = bestPerOwner(swarmers); rk.forEach(e => { e.more = e.owner != null && byUser ? cnt[e.owner] - 1 : 0; e.rank = 1 + rk.filter(x => x.n > e.n).length; });
    return { rk, nas };
  }

  // Rank a prospective entrant among everyone else: one place per agent count above theirs.
  function place(e) {
    const others = bestPerOwner(E.concat(COMM, CHAL ? [CHAL] : []).filter(x => x.id !== e.id && x.n > 1).map(x => Object.assign({}, x, { owner: ownerOf(x) })));
    const better = others.filter(x => x.n > e.n).length;
    return { rank: better + 1, of: others.length + 1, n: e.n };
  }

  // ---------- rendering ----------
  const gcolHex = '6f8cff';
  function datasetCards() {
    if (!D || !D.corpus) return '';
    const by = {}; E.filter(e => e.src).forEach(e => { (by[e.src] = by[e.src] || []).push(e); });
    const base = location.origin + location.pathname;
    const rows = Object.entries(by).map(([k, es]) => ({ k, es, max: Math.max(...es.map(e => e.n)), so: D.corpus.sources[k] })).sort((p, q) => q.max - p.max).map(r => {
      const md = `[![Swarm check: ${ag(r.max)}](https://img.shields.io/badge/swarm%20check-${r.max}%20agent${r.max === 1 ? '' : 's'}-${gcolHex})](${base}#d=${r.k})`;
      return `<tr><td class="txt"><b>${r.so ? `<a href="${esc(r.so.url)}" target="_blank" rel="noopener noreferrer">${esc(r.so.repo)}</a>` : esc(r.k)}</b><br><span class="sub">${esc(r.so ? r.so.license : '')} · ${r.es.length} entr${r.es.length === 1 ? 'y' : 'ies'}</span></td><td class="bn"><b>${r.max}</b></td><td class="txt">${r.max > 1 ? '' : '<span class="sub">didn’t even swarm</span>'}</td><td class="txt"><button type="button" data-copy="${esc(md)}">Copy badge</button></td></tr>`;
    }).join('');
    return `<div class="swc"><header><h3>Dataset swarm sizes</h3><p class="sub">Publishing agent traces on Hugging Face? Every public dataset in this check has a biggest swarm. Paste the badge into the dataset card.</p></header><div class="scroll"><table class="m bench"><thead><tr><th>Dataset</th><th>Biggest swarm</th><th></th><th>README badge</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function podium(rk) {
    const top = rk.filter(e => !e.you && !e.chal).slice(0, 3); if (top.length < 3) return '';
    const order = [top[1], top[0], top[2]], place = { 0: 2, 1: 1, 2: 3 };
    return `<div class="podium" aria-label="Top three">${order.map((e, i) => `<div class="pod p${place[i]}"><i class="medal">${place[i]}</i><span class="pg" style="color:${TCOL[tk(e)]}">${e.n}</span><b>${esc(dname(e))}</b><span class="ps">agents</span><span class="sub">${esc(TYPES[tk(e)])}</span></div>`).join('')}</div>`;
  }

  function naCard(nas) {
    if (!nas.length) return '';
    const by = {}; nas.forEach(e => { (by[e.owner] = by[e.owner] || []).push(e); });
    const li = Object.entries(by).sort((p, q) => q[1].length - p[1].length).map(([o, es]) => `<li><b>@${esc(o)}</b> <span class="sub">${es.map(e => e.nLabel).join('; ')}. You don’t even swarm!</span></li>`).join('');
    return `<div class="swc"><header><h3>You don’t even swarm!</h3><p class="sub">One agent, no helpers: no rank, just N/A.</p></header><ul class="na-list">${li}</ul></div>`;
  }

  function challengeBanner() {
    return `<div class="chalbar" role="status"><b>${esc(CHAL.name)}</b> runs a swarm of <b>${CHAL.n}</b> agents and is challenging you. Drop your logs above to see if you can beat it.</div>`;
  }

  function mastCard(M) {
    const g = {}; M.rows.forEach(r => { (g[r.f] = g[r.f] || []).push(r); });
    const ents = Object.entries(g).filter(([, rr]) => rr.length >= 10).map(([f, rr]) => {
      const sizes = rr.map(r => r.nroles != null ? r.nroles : Object.keys(r.r || {}).length), n = rr.length;
      return { name: f, n, max: Math.max(...sizes), med: median(sizes), clean: rr.filter(r => r.nfm === 0).length / n, mis: rr.filter(r => r.cat[1]).length / n };
    }).sort((p, q) => q.max - p.max || q.med - p.med);
    const row = (e, i) => `<tr><td>${i + 1}</td><td class="txt"><b>${esc(e.name)}</b></td><td class="bn"><b>${e.max}</b></td><td class="bn">${Math.round(e.med)}</td><td class="bn">${Math.round(100 * e.clean)}%</td><td class="bn">${Math.round(100 * e.mis)}%</td><td class="bn">${e.n}</td></tr>`;
    return `<div class="swc" id="sw-rank"><header><h3>Swarm ranking: frameworks</h3><p class="sub">Ranked by agents: the most distinct roles (CEO, Reviewer, Tester and so on) in one run. Failure columns come from MAST’s labels and are context, not a score.</p></header>
      <div class="scroll"><table class="m bench"><thead><tr><th>#</th><th>Framework</th><th>Most agents</th><th>Typical</th><th title="Runs with none of the 14 labelled failure modes">Failure-free</th><th title="Runs showing inter-agent misalignment">Misaligned</th><th>Runs</th></tr></thead><tbody>${ents.map(row).join('')}</tbody></table></div></div>`;
  }

  function paint() {
    const el = host.querySelector('#bn-results'); if (!el) return;
    const { rk, nas } = ranked(), ctx = C.Ctx(), narrow = (el.clientWidth || window.innerWidth) < 640;
    const rows = rk.map(e => `<tr class="${e.you ? 'you' : ''}${e.chal ? ' chal' : ''}"><td>${e.rank}</td><td class="txt"><b>${esc(dname(e))}</b><br><span class="sub" title="${esc(e.name)}">${esc(e.you ? (TYPES[e.type] || '') + ' · your run' : TYPES[tk(e)])} · ${esc(e.nLabel)}${e.more ? ' · +' + e.more + ' more run' + (e.more > 1 ? 's' : '') : ''}</span></td><td class="bn"><b>${e.n}</b></td><td class="bn">${e.calls ? num(e.calls) : '–'}</td><td class="bn">${e.peak ? e.peak : '–'}</td></tr>`).join('');
    const bar = rk.length ? plot(ctx, Math.max(260, rk.length * 22 + 80), [{ type: 'bar', orientation: 'h', y: rk.map(e => shortT(dname(e), narrow ? 16 : 44)).reverse(), x: rk.map(e => e.n).reverse(), marker: { color: rk.map(e => TCOL[tk(e)]).reverse() }, text: rk.map(e => e.n).reverse(), textposition: 'outside', cliponaxis: false,
      customdata: rk.map(e => TYPES[tk(e)] + ' · ' + e.nLabel).reverse(), hovertemplate: '%{y}<br>%{x} agents (%{customdata})<extra></extra>' }],
      L({ margin: { l: narrow ? 110 : 280, r: narrow ? 44 : 50 }, xaxis: { title: { text: 'agents in the biggest swarm' }, rangemode: 'tozero' }, yaxis: { tickfont: { size: 11 } } })) : na('Nobody under this filter has more than one agent.');
    const top = rk[0], med = rk.length ? median(rk.map(e => e.n)) : 0;
    const read = rk.length ? `${b(dname(top))} runs the biggest swarm: ${b(ag(top.n))}. The median ranked user runs ${b(Math.round(med))}.${nas.length ? ` ${b(new Set(nas.map(e => e.owner)).size)} more ${new Set(nas.map(e => e.owner)).size === 1 ? 'user' : 'users'} didn’t even swarm.` : ''}` : '';
    el.innerHTML = `${podium(rk)}<div class="swc"><header><h3>Leaderboard</h3><p class="sub">${rk.length} ${byUser ? 'users' : 'swarms'} ranked by agents in their biggest swarm. ${YOU ? 'Your run is highlighted.' : 'Drop your logs above to add yours.'}</p></header>
      <div class="scroll"><table class="m bench"><thead><tr><th>#</th><th>User</th><th title="Agents in the biggest swarm: the lead plus every helper">Agents</th><th>Tool calls</th><th title="Most sub-agents working at the same time">At once</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Nothing to rank under this filter.</td></tr>'}</tbody></table></div>
      ${read ? `<p class="read">${read}</p>` : ''}</div>
      <div class="swc"><header><h3>Agents per swarm</h3><p class="sub">Colour is the kind of swarm.</p></header>${bar}</div>
      ${naCard(nas)}${datasetCards()}`;
    W && window.Swarms.loadPlotly().then(() => ctx.draws.forEach(f => { try { f(); } catch (e) { console.error(e); } })).catch(() => { el.insertAdjacentHTML('afterbegin', '<p class="err">Charts could not load.</p>'); });
  }

  function shell() {
    const chip = (v, t) => `<button type="button" data-bf="${v}" aria-pressed="${filt === v}">${esc(t)}</button>`;
    host.querySelector('#bn-main').innerHTML = `<span id="bn-top"></span>${CHAL ? challengeBanner() : ''}<details id="intro" class="intro"><summary>What this ranks and how agents are counted</summary><div class="grid3">
      <div><h3>In plain English</h3><p>A swarm is a team of AI agents on one job: a lead agent with helpers, a pair, or a ready-made framework with a CEO and a tester. This check counts the agents and ranks users by the biggest swarm they have run. One agent is not a swarm: it gets N/A, and a “You don’t even swarm!”.</p></div>
      <div><h3>How agents are counted</h3><p><b>Claude Code:</b> the lead agent plus every sub-agent transcript in the session. <b>Frameworks (MAST):</b> distinct named roles in one run. <b>CooperBench:</b> two agents per task. <b>Production traces:</b> agents seen in the trace.</p></div>
      <div><h3>What it does not say</h3><p>There is no grade. More agents is not better, only bigger; whether a swarm worked is a separate question the deep dives explore. Each user is ranked by one swarm, their biggest.</p></div></div></details>
      <div class="lenses" role="group" aria-label="Filter">${chip('all', 'All')}${chip('swarm', 'Claude Code swarms')}${chip('mast', 'Framework teams (MAST)')}${chip('coop', 'CooperBench pairs')}${chip('prod', 'Production traces')}<button type="button" data-bu="1" aria-pressed="${!byUser}" title="Show every swarm instead of one row per user">Every swarm</button>${COMM.length ? chip('user', 'Community (' + COMM.length + ')') : ''}</div>
      <div id="bn-results"></div>
      <details id="how"><summary>Method and caveats</summary><ul>
      <li><b>Sub-agents.</b> A Claude Code session counts one agent for the lead plus one per sub-agent transcript that carries the session id. A log with no sub-agent records counts as one agent, even if the session used helpers elsewhere.</li>
      <li><b>Roles are not always agents.</b> For MAST, a role is a named participant in the conversation; one process can play several. The count is a proxy for team size.</li>
      <li><b>At once.</b> The most sub-agents running at the same time, from overlapping start and end times in the log.</li>
      <li><b>Sample size.</b> Few public swarms have full transcripts, so the Claude Code rows are a handful of sessions, not a population. The ranking only covers what is public.</li></ul></details>`;
    paint();
  }

  async function open(el) {
    host = el;
    if (!D) {
      el.innerHTML = '<p class="sub">Counting public swarms...</p>';
      try {
        D = await window.Swarms.ensure();
        E = D.deep.map(deepEntrant).concat(fleetEntrants(D.fleet), mastEntrants(D.mast), poolEntrants(D.corpus.pool), prodEntrants(D.prod));
        const m = /[#&]c=([\w-]+)/.exec(location.hash);
        if (m) { try { const c = window.Grade.unb64u(m[1]); CHAL = { id: 'chal', chal: true, name: '@' + (c.h || 'a challenger'), type: c.n > 1 ? 'swarm' : 'single', n: c.n || 1, calls: c.c || 0, nLabel: ag(c.n || 1) + ' (challenge link)' }; } catch (err) { /* ignore malformed link */ } }
        refreshCommunity();
      } catch (e) { console.error(e); el.innerHTML = '<p class="err">Could not load the public logs.</p>'; return; }
    }
    if (!host.querySelector('#gr-host')) {
      host.innerHTML = '<div id="gr-host"></div><div id="bn-main"></div>';
      window.Grade.mount(host.querySelector('#gr-host'), apiObj());
    }
    shell();
  }

  async function refreshCommunity() {
    const api = CFG().API; if (!api) return;
    try { const r = await (await fetch(api.replace(/\/$/, '') + '/board')).json(); COMM = (r.rows || []).map(x => ({ id: 'u' + x.h, name: '@' + x.h, type: 'user', n: x.n || 1, calls: x.c || 0, nLabel: ag(x.n || 1) + ', community' })); if (host && host.querySelector('#bn-results')) paint(); } catch (e) { /* board offline */ }
  }

  function apiObj() {
    const commCount = () => COMM.length;
    const statsFn = () => { const a = D.deep.flatMap(s => s.agents); return [[String(E.filter(e => e.n > 1).length), 'public swarms counted'], [String(D.deep.length), 'Claude Code sessions'], [sum(a.map(x => x.calls)).toLocaleString(), 'tool calls read'], [String(Object.keys(D.corpus.sources).length), 'open datasets']]; };
    return { commCount, stats: statsFn, owner: e => disp(Object.assign({}, e, { owner: ownerOf(e) })), place, count: () => bestPerOwner(E.filter(x => x.n > 1).map(x => Object.assign({}, x, { owner: ownerOf(x) }))).length,
      you: s => Object.assign(deepEntrant(s), { you: true, id: 'you' }), setYou: e => { YOU = e; }, setHandle: () => paint(), repaint: paint, refreshCommunity,
      demoEntrant: () => { const r = E.filter(e => e.type === 'swarm').sort(byN)[0]; return r ? Object.assign({}, r) : null; } };
  }

  function bind(el) {
    el.addEventListener('click', e => {
      if (e.target.closest('[data-bu]')) { byUser = !byUser; shell(); return; }
      const f = e.target.closest('[data-bf]'); if (f) { filt = f.dataset.bf; shell(); }
    });
  }

  window.Bench = { open, bind, mastCard };
})();
