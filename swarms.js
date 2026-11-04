// Public swarms tab: shell, lens switching, Plotly loading, and the production-trace lens.
(() => {
  'use strict';
  const C = window.SWC, B = window.SWB;
  const { esc, tok, pct, dur, b } = C;
  const sum = B.sum, median = B.median, merge = B.merge;
  const REAL = 0.6; // Anthropic bills roughly 60% of the proxy tokenizer's count (see the dataset card)

  let corpus = null, deep = [], fleet = null, mast = null, host = null, plotlyP = null, loadP = null;
  const st = { lens: 'deep', scope: null, prod: null, mscope: 'all' };

  function loadPlotly() {
    if (window.Plotly) return Promise.resolve();
    if (!plotlyP) plotlyP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/plotly-strict.min.js'; s.onload = res; s.onerror = () => rej(new Error('plotly')); document.head.appendChild(s); });
    return plotlyP;
  }

  // ---------- production lens (SemiAnalysis timing traces) ----------
  const fam = m => /opus/i.test(m) ? 'Opus' : /sonnet/i.test(m) ? 'Sonnet' : /haiku/i.test(m) ? 'Haiku' : 'Other';
  function analyzeProd(t) {
    const main = t.main, subs = t.subs;
    const mainIn = sum(main.map(r => r[1])), mainOut = sum(main.map(r => r[2]));
    const agents = [{ name: 'main', proc: mainIn + mainOut }].concat(subs.map((s, i) => ({ name: 'sub ' + (i + 1), proc: s.in + s.out, n: s.n })));
    const total = sum(agents.map(a => a.proc));
    const allIv = main.map(r => [r[0], r[0] + r[3]]).concat(...subs.map(s => s.iv));
    const clusters = merge(allIv, 1800), active = sum(clusters.map(c => c[1] - c[0])), busy = sum(merge(allIv, 0).map(c => c[1] - c[0])), work = sum(allIv.map(i => i[1] - i[0]));
    const peak = 1 + B.peakConcurrency(subs.map(s => ({ t0: s.t0, t1: s.t1 })));
    const counts = subs.map(s => s.n);
    const subProc = sum(subs.map(s => s.in + s.out));
    const cheap = subs.length && subProc ? sum(subs.filter(s => !s.models.some(x => /opus/i.test(x))).map(s => s.in + s.out)) / subProc : null;
    const ranked = agents.slice().sort((a, c) => c.proc - a.proc), k = Math.max(1, Math.ceil(agents.length * 0.2));
    return { id: t.id, turns: main.length, subs: subs.length, agents: agents.length, peak, mainShare: agents[0].proc / total, top: sum(ranked.slice(0, k).map(a => a.proc)) / total,
      cheap, medN: median(counts) || 0, maxN: counts.length ? Math.max(...counts) : 0, busyShare: busy / active, speedup: busy ? work / busy : 1, active, breaks: clusters.length - 1,
      cache: sum(main.map(r => r[5])) / mainIn, subCalls: sum(counts), reqs: sum(counts) + main.length, clusters, t,
      profile: !subs.length ? 'Solo' : (subs.length >= 8 && (median(counts) || 0) <= 2) ? 'Wide fan-out' : (Math.max(...counts) >= 20 && subs.length <= 2) ? 'Deep side-quest' : 'Delegating' };
  }

  function prodTable(rows, sel) {
    const head = ['Session', 'Profile', 'Agents', 'Peak at once', 'Main agent share', 'Top 20% hold', 'Smaller-model share', 'Cache reuse', 'Busy of active', 'Agent-time / clock'];
    const body = rows.map(m => `<tr${sel === m.id ? ' class="sel"' : ''}><td><button type="button" class="lnk" data-prod="${esc(m.id)}" aria-expanded="${sel === m.id}">${esc(m.id)}</button></td><td>${esc(m.profile)}</td><td>${m.agents}</td><td>${m.peak}</td><td>${pct(m.mainShare)}</td><td>${m.agents > 1 ? pct(m.top) : 'n/a'}</td><td>${pct(m.cheap)}</td><td>${pct(m.cache)}</td><td>${pct(m.busyShare)}</td><td>${m.speedup.toFixed(1)}x</td></tr>`).join('');
    return `<div class="scroll"><table class="m sw"><thead><tr>${head.map((h, i) => `<th${i > 1 ? '' : ' style="text-align:left"'}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function prodTimeline(m) {
    const t = m.t, cs = m.clusters, cp = C.compressor(cs), L = cp.T;
    const bar = (s, e, cls, tt) => `<i class="${cls}" style="left:${(100 * cp.f(s) / L).toFixed(2)}%;width:${Math.max(0.3, 100 * (cp.f(e) - cp.f(s)) / L).toFixed(2)}%" title="${esc(tt)}"></i>`;
    const rows = [`<div class="tlr"><span>main</span><div class="lane">${merge(t.main.map(r => [r[0], r[0] + r[3]]), 5).map(([s, e]) => bar(s, e, '', 'main agent')).join('')}</div></div>`];
    t.subs.forEach((s, i) => { const cheap = !s.models.some(x => /opus/i.test(x)); rows.push(`<div class="tlr"><span>sub ${i + 1} · ${esc(s.models.map(fam).join('/'))}</span><div class="lane">${bar(s.t0, s.t1, cheap ? 'cheap' : 'sub', `sub ${i + 1}: ${s.n} calls, ${tok(s.in + s.out)} tokens`)}</div></div>`); });
    return `<div class="tl" role="img" aria-label="Timeline of ${t.subs.length + 1} agents">${rows.join('')}</div><p class="sub">Active time ${dur(L)}${m.breaks ? `, ${m.breaks} break${m.breaks > 1 ? 's' : ''} over 30 min removed` : ''}. Blue is the main agent, amber a top-model sub-agent, green a smaller-model sub-agent.</p>`;
  }

  function prodLens() {
    const rows = corpus.prod.map(analyzeProd).sort((a, c) => c.agents - a.agents);
    if (!st.prod) st.prod = rows[0].id;
    const sel = rows.find(r => r.id === st.prod);
    const tiles = C.tiles([[String(rows.length), 'production sessions'], [String(sum(rows.map(r => r.subs))), 'sub-agents'], [pct(sum(rows.map(r => r.subCalls)) / sum(rows.map(r => r.reqs))), 'of model requests came from sub-agents'], [pct(sum(rows.map(r => r.cache * r.turns)) / sum(rows.map(r => r.turns))), 'cache reuse, turn-weighted']]);
    const facts = sel ? [['Span of control', sel.subs ? sel.subs + (sel.subs === 1 ? ' sub-agent' : ' sub-agents') : 'none'], ['Sub-agent calls', pct(sel.subCalls / sel.reqs) + ' of requests'], ['Median calls per sub-agent', String(sel.medN)], ['Longest sub-agent', sel.maxN + ' calls']].map(([k, v]) => `<div><span>${esc(k)} </span><b>${esc(v)}</b></div>`).join('') : '';
    const pctx = C.Ctx();
    let flowHtml = '';
    if (sel && sel.t.subs.length >= 4) flowHtml = window.SWW.renumber(window.SWW.itemFlow([{ name: sel.id, items: sel.t.subs.map((x, i) => ({ s: x.t0, e: Math.max(x.t1, x.t0 + 1), ok: true, n: x.n, label: 'sub ' + (i + 1) + ' · ' + x.n + ' calls' })) }], pctx, 'sub-agent', 'sub-agent run')).join('');
    const html = `<p class="sub"><b>Production traces:</b> timing and token counts only, from real production Claude Code traffic. No message text, tool names or outcomes, so only a reduced battery is possible. Use Deep dives for the full set.</p>${tiles}<div class="head"><h2>Reduced battery</h2></div>${prodTable(rows, st.prod)}
      ${sel ? `<div class="detail"><h3>Session ${esc(sel.id)}</h3><div class="facts">${facts}</div>${prodTimeline(sel)}</div>` : ''}
      <details id="how"><summary>How to read this</summary><p class="note">Token counts use the proxy's tokenizer, about ${(1 / REAL).toFixed(1)} times what Anthropic bills. The six sessions were chosen to span solo, small and wide fan-out and are not a random draw. Source: <a href="${esc(corpus.sources.semi.url)}" rel="noopener noreferrer" target="_blank">${esc(corpus.sources.semi.repo)}</a> (${esc(corpus.sources.semi.license)}).</p></details>${flowHtml}`;
    return { html, ctx: pctx };
  }

  // ---------- shell ----------
  const SEC_LABEL = { mayor: 'Orchestrator power', org: 'Org chart', spans: 'Spans & layers', levels: 'Leveling & compa', contingent: 'Contingent & geo', ras: 'Activity (RAS)', roles: 'Roles', spend: 'Tool cost', makebuy: 'Make vs buy', attrition: 'Attrition & OOO', ltv: 'LTV / CAC', dora: 'DORA / SPACE', pareto: 'Pareto', output: 'Output per agent',
    chain: 'Value chain', work: 'Planned vs unplanned', flow: 'Flow & WIP', variability: 'Variability', constraint: 'Constraints', waste: '8 wastes', bsjobs: 'Bullshit jobs', reading: 'Reading list',
    'm-headcount': 'Headcount & spans', 'm-mayor': 'Mayor', 'm-org': 'Org chart', 'm-fail': 'Failure modes', 'm-chain': 'Value chain', 'm-cost': 'Cost per run', 'm-flow': 'Flow', 'm-limits': 'Limits', headcount: 'Does a 2nd agent pay?', bonus: 'Bonuses & compa', squads: 'Pairs', inflation: 'Title inflation', comms: 'Communication', time: 'Output over time', geo: 'Geo & limits' };

  function sessionLabel(s) { return `${s.id} · ${C.shortT(s.title, 26)} · ${s.agents.length === 1 ? '1 agent' : s.agents.length + ' agents'}`; }

  function summaryTiles(sel) {
    const A = sel.flatMap(s => s.agents);
    return C.tiles([[String(sel.length), sel.length === 1 ? 'session' : 'sessions'], [String(A.length), 'agents'], [String(A.length - sel.length), 'sub-agents'], [tok(sum(A.map(a => a.proc))), 'tokens processed'], [dur(sum(sel.map(s => s.stats.active))), 'active working time', 'Gaps over 30 minutes removed'], [String(sum(sel.map(s => s.human))), 'human prompts']]);
  }

  function deepLens() {
    const sel = st.scope === 'all' ? deep : deep.filter(s => s.id === st.scope);
    const sc = { sessions: sel, agents: sel.flatMap(s => s.agents) };
    const res = C.deepSections(sc);
    const chips = ['all'].concat(deep.map(s => s.id)).map(id => `<button type="button" data-scope="${esc(id)}" aria-pressed="${st.scope === id}">${esc(id === 'all' ? `All ${deep.length} sessions` : sessionLabel(deep.find(s => s.id === id)))}</button>`).join('');
    const jump = res.sections.map(s => { const id = /id="sw-([^"]+)"/.exec(s)[1]; return `<a href="#sw-${id}" data-jump="${id}">${esc(SEC_LABEL[id] || id)}</a>`; }).join('');
    return { html: `<p class="sub"><b>Deep dives:</b> real working sessions of Claude Code, read call by call, so every question on the list can be answered. Choose one session, or all of them.</p><div class="scopes" role="group" aria-label="Session">${chips}</div>${summaryTiles(sel)}<nav class="jump" aria-label="Sections">${jump}</nav>${res.sections.join('')}`, ctx: res.ctx };
  }

  function fleetLens() {
    const res = window.SWF.fleetSections(fleet);
    const jump = res.sections.map(s => { const id = /id="sw-([^"]+)"/.exec(s)[1]; return `<a href="#sw-${id}" data-jump="${id}">${esc(SEC_LABEL[id] || id)}</a>`; }).join('');
    return { html: `<p class="sub"><b>Fleet:</b> CooperBench, a controlled experiment. The same 368 coding tasks were run by two cooperating agents and by one agent alone, 1,104 agent runs in all, so we can ask whether a second agent is worth it.</p><nav class="jump" aria-label="Sections">${jump}</nav>${res.sections.join('')}`, ctx: res.ctx };
  }

  function mastLens() {
    const res = window.SWM.sections(mast, st.mscope);
    const chips = ['all'].concat(mast.fws).map(f => `<button type="button" data-mscope="${esc(f)}" aria-pressed="${st.mscope === f}">${esc(f === 'all' ? 'All frameworks' : f + ' (' + mast.rows.filter(r => r.f === f).length + ')')}</button>`).join('');
    const jump = res.sections.map(x => { const id = /id="sw-([^"]+)"/.exec(x)[1]; return `<a href="#sw-${id}" data-jump="${id}">${esc(SEC_LABEL[id] || id)}</a>`; }).join('');
    return { html: `<p class="sub"><b>Frameworks:</b> MAST, ${mast.rows.length.toLocaleString()} runs of ready-made multi-agent teams (ChatDev, MetaGPT, AG2, Magentic-One and others), each labelled for 14 ways a team can fail. These are conversation logs with named roles like CEO and Reviewer, so we can see org structure and failure, but not tool calls.</p><div class="scopes" role="group" aria-label="Framework">${chips}</div><nav class="jump" aria-label="Sections"><a href="#sw-rank" data-jump="rank">Swarm ranking</a>${jump}</nav>${window.Bench.mastCard(mast)}${res.sections.join('')}`, ctx: res.ctx };
  }

  function provenance() {
    const S = corpus.sources, row = k => `<li><a href="${esc(S[k].url)}" rel="noopener noreferrer" target="_blank">${esc(S[k].repo)}</a> · ${esc(S[k].license)} · rev ${esc(S[k].rev.slice(0, 7))}</li>`;
    return `<details id="how"><summary>Sources, method and caveats</summary>
      <ul>${['wisp', 'fable', 'tc', 'alin', 'mimo', 'coop', 'solo', 'semi', 'mast'].map(row).join('')}</ul>
      <p class="note">Everything is parsed in a build script from pinned dataset revisions (<code>tools/build_public_swarms.py</code>); no message text is kept beyond a short per-agent title. Tool calls are bucketed by name and shell command, so Research, Build, Verify, Coordinate, Operate and Rework are heuristics. Roles come from brief wording; levels from model tier; cost units use a relative rate index (Haiku = 1, Sonnet = 3, Opus and Fable = 5), not invoices. Sessions are a convenience sample of what people published, so read patterns, not population rates. Platform and time-of-day are inferred from paths and timestamps; no real locations are recorded.</p></details>`;
  }

  function intro() {
    const S = corpus.sources, A = deep.flatMap(s => s.agents), calls = sum(A.map(a => a.calls));
    const swarms = deep.filter(s => s.swarm).length, subsProd = sum(corpus.prod.map(t => t.subs.length));
    const bySrc = k => { const ss = deep.filter(s => s.src === k); return `${ss.length} session${ss.length === 1 ? '' : 's'}, ${sum(ss.map(s => s.agents.length))} agents`; };
    const link = k => `<a href="${esc(S[k].url)}" rel="noopener noreferrer" target="_blank">${esc(S[k].repo)}</a>`;
    const rows = [
      ['Deep dives', link('wisp'), 'A developer’s own Claude Code working logs, including a run where one lead agent directed 41 helpers.', bySrc('wisp'), S.wisp.license],
      ['Deep dives', link('fable'), 'Claude Code sessions recorded with the Fable 5 model, including runs where the lead agent hired helpers.', bySrc('fable'), S.fable.license],
      ['Deep dives', link('alin'), 'More Claude Code sessions recorded with the Fable 5 model, published by one developer. Single-agent sessions.', bySrc('alin'), S.alin.license],
      ['Population', link('mimo'), 'About a thousand single-agent coding tasks (algorithms, debugging, refactoring and more) run through the Claude Code harness with the MiMo model. Used as a population to benchmark against, not shown session by session.', `${corpus.pool ? corpus.pool.rows.length : 0} sessions`, S.mimo.license],
      ['Deep dives', link('tc'), 'Agent logs donated by users to a community collection (trace-commons). Single-agent sessions.', bySrc('tc'), S.tc.license],
      ['Fleet', link('coop') + '<br>' + link('solo'), 'CooperBench, a research benchmark: the same coding tasks attempted by two agents working together, and by one agent alone. Same small open model (Qwen3.5-9B) on the team’s own GPUs.', `${fleet.coop.length} tasks, ${fleet.agents.length} agent runs`, S.coop.license],
      ['Frameworks', link('mast'), 'MAST: logs of ready-made multi-agent teams (ChatDev, MetaGPT, AG2, Magentic-One and others) solving coding, maths and web tasks, each labelled for 14 ways a team can fail.', `${mast.rows.length.toLocaleString()} runs, 7 frameworks`, S.mast.license],
      ['Production traces', link('semi'), 'Timing and token counts from real production Claude Code sessions with helpers. No text, no tool names, so only a reduced analysis is possible.', `${corpus.prod.length} sessions, ${subsProd} helpers`, S.semi.license]];
    const table = `<div class="swc" id="sw-sources"><header><h3>Data sources</h3><p class="sub">${deep.length} deep-dive sessions, ${A.length} agents and ${calls.toLocaleString()} tool calls; ${fleet.agents.length} fleet runs; ${mast.rows.length.toLocaleString()} framework runs; ${corpus.prod.length} production sessions. ${swarms} of the ${deep.length} deep-dive sessions are swarms; the rest are single-agent controls.</p></header>
      <div class="scroll"><table class="m wastes"><thead><tr><th>Log set</th><th>Dataset</th><th>What it is</th><th>What is used here</th><th>Licence</th></tr></thead><tbody>${rows.map(r => `<tr><td class="txt">${r[0]}</td><td class="txt">${r[1]}</td><td class="txt">${r[2]}</td><td class="txt">${esc(r[3])}</td><td class="txt">${esc(r[4])}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">Each dataset is pinned to an exact version and used under its open licence. A convenience sample of what people published: read the patterns, not population rates. Tool-call types, roles and levels are heuristics, and cost units are a price index, not invoices.</p></div>`;
    const lite = `<p class="lead-lite">Real working logs of AI agent teams, analysed like the staff of a company: who is in charge, how big the team is, what it costs, where effort is wasted, how work flows. An <b>agent</b> is one AI worker, a <b>sub-agent</b> a helper it launched, a <b>swarm</b> one agent directing several. <a href="#sw-sources" data-jump="sources">Data sources ↓</a></p>`;
    return { lite, table };
  }

  function render() {
    if (!host || !corpus) return;
    const lens = st.lens;
    const body = lens === 'deep' ? deepLens() : lens === 'fleet' ? fleetLens() : lens === 'mast' ? mastLens() : prodLens();
    const you = false ? `<p class="note you">Your ${mine.claudeSessions} Claude sessions used ${mine.totalSubs} sub-agents in total. ${deep.filter(s => s.swarm).length} of these ${deep.length} public sessions were swarms.</p>` : '';
    const lensBtn = (id, label) => `<button type="button" data-lens="${id}" aria-pressed="${lens === id}">${esc(label)}</button>`;
    const it = intro(); host.innerHTML = `${it.lite}${you}<div class="lenses" role="group" aria-label="Log set">${lensBtn('deep', `Deep dives (${deep.length})`)}${lensBtn('fleet', `Fleet (${fleet.agents.length} agents)`)}${lensBtn('mast', `Frameworks (${mast.rows.length.toLocaleString()} traces)`)}${lensBtn('prod', `Production traces (${corpus.prod.length})`)}</div><div id="sw-body">${body.html}</div>${provenance()}${it.table}`;
    if (body.ctx) loadPlotly().then(() => body.ctx.draws.forEach(f => { try { f(); } catch (e) { console.error(e); } })).catch(() => { host.querySelector('#sw-body').insertAdjacentHTML('afterbegin', '<p class="err">Charts could not load.</p>'); });
  }

  async function open(el) {
    host = el;
    if (!corpus) {
      el.innerHTML = '<p class="sub">Loading public logs...</p>';
      try {
        corpus = await (await fetch('public-swarms.json')).json();
        deep = B.prepDeep(corpus.deep); fleet = B.prepFleet(corpus.fleet); mast = window.SWM.prep(corpus.mast);
        st.scope = deep[0].id;
        loadP = null; await ensure();
      } catch (e) { console.error(e); el.innerHTML = '<p class="err">Could not load the public logs.</p>'; return; }
    }
    render();
  }

  function bind(el) {
    el.addEventListener('click', e => {
      const l = e.target.closest('[data-lens]'); if (l) { st.lens = l.dataset.lens; render(); return; }
      const s = e.target.closest('[data-scope]'); if (s) { st.scope = s.dataset.scope; render(); return; }
      const ms = e.target.closest('[data-mscope]'); if (ms) { st.mscope = ms.dataset.mscope; render(); return; }
      const p = e.target.closest('[data-prod]'); if (p) { st.prod = st.prod === p.dataset.prod ? null : p.dataset.prod; render(); return; }
      const j = e.target.closest('[data-jump]'); if (j) { e.preventDefault(); const t = document.getElementById('sw-' + j.dataset.jump); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!el.hidden) render(); });
  }

  async function ensure() {
    if (!loadP) loadP = (async () => {
      if (!corpus) { corpus = await (await fetch('public-swarms.json')).json(); deep = B.prepDeep(corpus.deep); fleet = B.prepFleet(corpus.fleet); mast = window.SWM.prep(corpus.mast); st.scope = st.scope || deep[0].id; }
      return { corpus, deep, fleet, mast, prod: corpus.prod.map(analyzeProd) };
    })();
    return loadP;
  }

  window.Swarms = { open, bind, ensure, loadPlotly };
})();
