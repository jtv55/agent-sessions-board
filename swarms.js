(() => {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BREAK = 1800; // a gap over 30 minutes is a break, not working time
  const REAL = 0.6;   // Anthropic bills roughly 60% of the proxy tokenizer's count (see dataset card)

  const fam = m => /opus/i.test(m) ? 'Opus' : /sonnet/i.test(m) ? 'Sonnet' : /haiku/i.test(m) ? 'Haiku' : 'Other';
  const tok = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(Math.round(n));
  const pct = x => x == null ? 'n/a' : Math.round(100 * x) + '%';
  const dur = s => s < 90 ? Math.round(s) + 's' : s < 5400 ? Math.round(s / 60) + 'm' : (s / 3600).toFixed(1) + 'h';
  const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  const sum = a => a.reduce((x, y) => x + y, 0);

  // Merge intervals; with slack > 0 also merges across gaps up to that size.
  function merge(iv, slack) {
    const a = iv.slice().sort((x, y) => x[0] - y[0]), out = [];
    for (const [s, e] of a) { const l = out[out.length - 1]; if (l && s <= l[1] + slack) l[1] = Math.max(l[1], e); else out.push([s, e]); }
    return out;
  }

  function analyze(t) {
    const main = t.main, subs = t.subs;
    const mainIn = sum(main.map(r => r[1])), mainOut = sum(main.map(r => r[2]));
    const agents = [{ name: 'main', kind: 'main', proc: mainIn + mainOut, out: mainOut }]
      .concat(subs.map((s, i) => ({ name: 'sub ' + (i + 1), kind: 'sub', proc: s.in + s.out, out: s.out, n: s.n, models: s.models })));
    const total = sum(agents.map(a => a.proc));

    const mainIv = main.map(r => [r[0], r[0] + r[3]]);
    const allIv = mainIv.concat(...subs.map(s => s.iv));
    const clusters = merge(allIv, BREAK);                 // active windows
    const active = sum(clusters.map(c => c[1] - c[0]));
    const busy = sum(merge(allIv, 0).map(c => c[1] - c[0]));
    const work = sum(allIv.map(i => i[1] - i[0]));        // agent-seconds
    const wall = clusters[clusters.length - 1][1] - clusters[0][0];

    // Peak agents alive at once: the main agent plus overlapping sub-agent spans.
    const ev = [];
    subs.forEach(s => { ev.push([s.t0, 1]); ev.push([s.t1, -1]); });
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let cur = 0, peakSub = 0;
    for (const [, d] of ev) { cur += d; peakSub = Math.max(peakSub, cur); }

    const ranked = agents.slice().sort((a, b) => b.proc - a.proc);
    const k = Math.max(1, Math.ceil(agents.length * 0.2));
    const top = sum(ranked.slice(0, k).map(a => a.proc)) / total;

    const mix = {};
    main.forEach(r => { mix[fam(r[6])] = (mix[fam(r[6])] || 0) + r[1] + r[2]; });
    const subMix = {};
    subs.forEach(s => s.models.forEach(m => { subMix[fam(m)] = (subMix[fam(m)] || 0) + (s.in + s.out) / s.models.length; }));
    Object.entries(subMix).forEach(([f, v]) => { mix[f] = (mix[f] || 0) + v; });
    const subProc = sum(Object.values(subMix));
    const cheap = subs.length && subProc ? 1 - (subMix.Opus || 0) / subProc : null;

    const counts = subs.map(s => s.n);
    const med = median(counts), maxN = counts.length ? Math.max(...counts) : 0;
    const deepIdx = counts.indexOf(maxN);
    const m = {
      id: t.id, turns: main.length, subs: subs.length, agents: agents.length, layers: subs.length ? 2 : 1,
      peak: 1 + peakSub, total, mainShare: agents[0].proc / total, mayor: ranked[0].name, mayorShare: ranked[0].proc / total,
      top, topK: k, mix, cheap, medN: med, maxN, deepShare: subs.length ? agents[1 + deepIdx].proc / total : 0,
      wall, active, busy, work, busyShare: busy / active, speedup: busy ? work / busy : 1, breaks: clusters.length - 1,
      cache: sum(main.map(r => r[5])) / mainIn,
      inherit: subs.length ? sum(subs.map(s => s.reuse0)) / Math.max(1, sum(subs.map(s => s.firstIn))) : null,
      firstIn: subs.length ? median(subs.map(s => s.firstIn)) : 0,
      peakCtx: Math.max(...main.map(r => r[1])),
      subCalls: sum(counts), reqs: sum(counts) + main.length,
      subShareOfCalls: subs.length ? sum(counts) / (sum(counts) + main.length) : 0,
      clusters, agentsList: agents,
    };
    m.profile = !subs.length ? 'Solo'
      : (subs.length >= 8 && med <= 2) ? 'Wide fan-out'
      : (maxN >= 20 && subs.length <= 2) ? 'Deep side-quest' : 'Delegating';
    return m;
  }

  function reads(m) {
    const tips = [], good = [];
    if (!m.subs && m.turns >= 100) tips.push({ title: `Solo run of ${m.turns} turns`, detail: 'One agent did everything in sequence. That is right for dependent work; fan-out pays off when three or more independent searches or edits can run side by side.', tryIt: 'Before starting, list the sub-tasks. If three or more do not depend on each other, run them as parallel sub-agents and keep the plan in the main thread.' });
    if (m.subs >= 8 && m.medN <= 2) tips.push({ title: `${m.subs} sub-agents, median ${m.medN} call${m.medN === 1 ? '' : 's'}`, detail: `Each one starts with about ${tok(m.firstIn)} tokens of context (proxy count) and ${pct(m.inherit)} of it matched the parent, so tiny jobs pay setup cost. Batch related lookups into fewer sub-agents.`, tryIt: 'Group these into at most four sub-agents, each handling several related lookups, and run them in parallel.' });
    if (m.maxN >= 20 && m.deepShare >= 0.2) tips.push({ title: `One sub-agent ran ${m.maxN} calls`, detail: `It took ${pct(m.deepShare)} of the session's tokens. A long side-quest cannot be steered from the main thread, so give it a stopping point.`, tryIt: 'Cap this sub-agent at 15 tool calls and report what it found so far. I will decide whether it continues.' });
    if (m.subs >= 2 && m.cheap === 0 && m.medN <= 3) tips.push({ title: 'Every sub-agent ran on the top model', detail: 'These were short lookups. A smaller model on that work is the cheapest efficiency gain in a swarm.', tryIt: 'Run the exploration sub-agents on the smallest model available and keep the top model for the main thread.' });
    if (m.cache < 0.7) tips.push({ title: 'Context tax', detail: `Only ${pct(m.cache)} of each turn's input matched the previous turn, so most of it was read fresh. Editing earlier context, or switching topics mid-session, breaks reuse.`, tryIt: 'Summarise where we are in ten lines, then I will start a fresh session for the next topic.' });
    if (m.peakCtx * REAL > 300000) tips.push({ title: `Context reached about ${tok(m.peakCtx * REAL)} tokens`, detail: 'Very long contexts cost more per turn and degrade recall. Compacting or splitting at a natural boundary keeps later turns cheaper.', tryIt: 'Compact the conversation now, keeping the current task, open decisions and file paths.' });
    if (m.busyShare < 0.35) tips.push({ title: `Agents were busy ${pct(m.busyShare)} of the active window`, detail: 'The rest was waiting on you or on tools. If that is review time, fine; if it is slow commands, run them in the background while the agent continues.' });
    if (m.peak >= 4) good.push(`Real parallelism: up to ${m.peak} agents at once, ${m.speedup.toFixed(1)}x more agent-time than clock time.`);
    if (m.cheap != null && m.cheap > 0.5) good.push(`${pct(m.cheap)} of delegated work ran on a smaller model.`);
    if (m.cache >= 0.9) good.push(`Cache-friendly: ${pct(m.cache)} of input reused turn to turn.`);
    return { tips, good };
  }

  function timeline(t, m) {
    const cs = m.clusters; let L = 0; const off = cs.map(c => { const o = L; L += c[1] - c[0]; return o; });
    const cx = x => { let i = cs.length - 1; while (i > 0 && x < cs[i][0]) i--; return off[i] + Math.min(Math.max(x - cs[i][0], 0), cs[i][1] - cs[i][0]); };
    const bar = (s, e, cls, tt) => { const l = 100 * cx(s) / L, w = Math.max(0.3, 100 * (cx(e) - cx(s)) / L); return `<i class="${cls}" style="left:${l.toFixed(2)}%;width:${w.toFixed(2)}%" title="${esc(tt)}"></i>`; };
    const mainBars = merge(t.main.map(r => [r[0], r[0] + r[3]]), 5).map(([s, e]) => bar(s, e, '', 'main agent')).join('');
    const rows = [`<div class="tlr"><span>main</span><div class="lane">${mainBars}</div></div>`];
    t.subs.forEach((s, i) => {
      const f = s.models.map(fam).join('/'), cheap = !s.models.some(x => /opus/i.test(x));
      rows.push(`<div class="tlr"><span>sub ${i + 1} · ${esc(f)}</span><div class="lane">${bar(s.t0, s.t1, cheap ? 'cheap' : 'sub', `sub ${i + 1}: ${s.n} calls, ${tok(s.in + s.out)} tokens`)}</div></div>`);
    });
    return `<div class="tl" role="img" aria-label="Timeline of ${t.subs.length + 1} agents over ${dur(L)} of active time">${rows.join('')}</div>
      <p class="sub">Active time ${dur(L)}${m.breaks ? `, ${m.breaks} break${m.breaks > 1 ? 's' : ''} over 30 min removed` : ''}. Blue is the main agent, amber a top-model sub-agent, green a smaller-model sub-agent.</p>`;
  }

  function mixText(mix) {
    const tot = sum(Object.values(mix));
    return Object.entries(mix).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${pct(v / tot)}`).join(', ');
  }

  function detail(t, m) {
    const r = reads(m);
    const tips = r.tips.map((x, i) => `<div class="tip"><b>${esc(x.title)}</b><span>${esc(x.detail)}</span>${x.tryIt ? `<div class="try"><q>${esc(x.tryIt)}</q><button type="button" data-copy="${esc(m.id)}:${i}">Copy</button></div>` : ''}</div>`).join('');
    const facts = [
      ['Mayor', m.subs ? `${m.mayor === 'main' ? 'main agent' : m.mayor} (${pct(m.mayorShare)} of tokens)` : 'main agent (all)'],
      ['Span of control', m.subs ? m.subs + (m.subs === 1 ? ' sub-agent' : ' sub-agents') : 'none'],
      ['Layers', String(m.layers)],
      ['Sub-agent calls', pct(m.subShareOfCalls) + ' of requests'],
      ['Model mix', mixText(m.mix)],
      ['Context inherited by sub-agents', m.inherit == null ? 'n/a' : pct(m.inherit)],
      ['Peak context', tok(m.peakCtx) + ' proxy (~' + tok(m.peakCtx * REAL) + ' billed)'],
    ].map(([k, v]) => `<div><span>${esc(k)} </span><b>${v}</b></div>`).join('');
    return `<div class="detail" id="swd">
      <h3>Session ${esc(m.id)}</h3>
      <div class="facts">${facts}</div>
      ${timeline(t, m)}
      ${tips ? `<div><h3>Coach</h3>${tips}</div>` : '<p class="sub">Nothing to flag from timing and token data.</p>'}
      ${r.good.length ? `<p class="good">Doing well: ${r.good.map(esc).join(' ')}</p>` : ''}</div>`;
  }

  function table(rows, sel) {
    const head = ['Session', 'Profile', 'Agents', 'Peak at once', 'Main agent share', 'Top 20% hold', 'Smaller-model share', 'Cache reuse', 'Busy of active', 'Agent-time / clock'];
    const body = rows.map(({ t, m }) => `<tr${sel === m.id ? ' class="sel"' : ''}>
      <td><button type="button" class="lnk" data-sw="${esc(m.id)}" aria-expanded="${sel === m.id}">${esc(m.id)}</button></td>
      <td>${esc(m.profile)}</td><td>${m.agents}</td><td>${m.peak}</td><td>${pct(m.mainShare)}</td>
      <td>${m.agents > 1 ? pct(m.top) : 'n/a'}</td><td>${pct(m.cheap)}</td><td>${pct(m.cache)}</td><td>${pct(m.busyShare)}</td><td>${m.speedup.toFixed(1)}x</td></tr>`).join('');
    return `<div class="scroll"><table class="m sw"><thead><tr>${head.map((h, i) => `<th${i > 1 ? '' : ' style="text-align:left"'}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  let corpus = null, rows = [], host = null, selected = null, mine = null;

  function render() {
    const tiles = [
      [String(rows.length), 'sessions sampled'],
      [String(sum(rows.map(r => r.m.agents))), 'agents in total'],
      [String(sum(rows.map(r => r.m.subs))), 'sub-agents'],
      [pct(sum(rows.map(r => r.m.subCalls)) / sum(rows.map(r => r.m.reqs))), 'of model requests came from sub-agents'],
      [pct(sum(rows.map(r => r.m.total * (1 - r.m.mainShare))) / sum(rows.map(r => r.m.total))), 'of tokens went to sub-agents'],
    ].map(([v, l]) => `<div class="tile"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
    const withSubs = rows.filter(r => r.m.subs).length;
    const you = mine && mine.claudeSessions ? `Your ${mine.claudeSessions} Claude sessions used ${mine.totalSubs} sub-agents in total (${mine.withSubs} session${mine.withSubs === 1 ? '' : 's'}). ${withSubs} of these ${rows.length} public sessions did.` : '';
    const sel = rows.find(r => r.m.id === selected);
    host.innerHTML = `
      <p class="sub">Real Claude Code sessions that used sub-agents, run through the workforce battery. Anonymised and published by SemiAnalysis under ${esc(corpus.license)}.</p>
      ${you ? `<p class="note you">${esc(you)}</p>` : ''}
      <section class="tiles" aria-label="Public sample totals" style="margin-top:16px">${tiles}</section>
      <div class="head"><h2>Workforce battery</h2></div>
      ${table(rows, selected)}
      ${sel ? detail(sel.t, sel.m) : '<p class="note">Select a session to see its timeline and coaching.</p>'}
      <details id="how"><summary>How to read this</summary>
        <ul>
          <li><b>Mayor and main agent share</b>: who handled the tokens, input plus output per agent. The main thread re-reads its whole context every turn, so it dominates tokens even when sub-agents make many of the requests.</li>
          <li><b>Top 20% hold</b>: the Pareto check. Share of tokens held by the busiest fifth of agents (at least one).</li>
          <li><b>Smaller-model share</b>: portion of sub-agent tokens that ran on something other than Opus.</li>
          <li><b>Cache reuse</b>: how much of each main-agent turn's input matched the previous turn's prefix, counted in 64-token blocks.</li>
          <li><b>Busy of active</b>: time with at least one request in flight, over the working window. Gaps over 30 minutes are breaks and are removed.</li>
          <li><b>Agent-time / clock</b>: summed request time over busy clock time. Above 1 means agents overlapped.</li>
          <li><b>Layers</b> is at most 2 here: the source records the main agent and its Task-tool sub-agents, not deeper nesting.</li>
        </ul>
        <p class="note">Token counts use the proxy's tokenizer, which reads about 1.6 times the count Anthropic bills. The data has timing, tokens and models only, with no message text or tool names, so there is no prompt or error grading and no dollar estimate. The sample is six sessions chosen to span solo, small and wide fan-out. It is not a random draw, so do not read the percentages as population rates.</p>
        <p class="note">Across the full set of ${esc(String(219))} sessions, the dataset card reports 40,367 of 78,099 model requests (52%) came from sub-agents. Source: <a href="${esc(corpus.url)}" rel="noopener noreferrer" target="_blank">${esc(corpus.source)}</a>, revision ${esc(corpus.rev.slice(0, 7))}.</p>
      </details>`;
  }

  async function open(el, mineSummary) {
    host = el; mine = mineSummary;
    if (!corpus) {
      el.innerHTML = '<p class="sub">Loading public sessions...</p>';
      try {
        corpus = await (await fetch('public-swarms.json')).json();
        rows = corpus.traces.map(t => ({ t, m: analyze(t) })).sort((a, b) => b.m.agents - a.m.agents);
        selected = rows[0].m.id;
      } catch (e) { el.innerHTML = '<p class="err">Could not load the public sessions.</p>'; return; }
    }
    render();
  }

  function bind(el) {
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-sw]');
      if (b) { selected = selected === b.dataset.sw ? null : b.dataset.sw; render(); return; }
      const c = e.target.closest('[data-copy]');
      if (c) {
        const [id, i] = c.dataset.copy.split(':'), r = rows.find(x => x.m.id === id);
        try { await navigator.clipboard.writeText(reads(r.m).tips[+i].tryIt); c.textContent = 'Copied'; setTimeout(() => { c.textContent = 'Copy'; }, 1500); } catch (err) { c.textContent = 'Select text'; }
      }
    });
  }

  window.Swarms = { open, bind, analyze };
})();
