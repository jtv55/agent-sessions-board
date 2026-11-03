// Frameworks lens: MAST, 1,642 multi-agent framework traces (ChatDev, MetaGPT, AG2, Magentic-One, AppWorld, HyperAgent, OpenManus)
// with 14 labelled failure modes. Text logs: roles and messages, not tool calls, so a subset of the workforce battery.
(() => {
  'use strict';
  const B = window.SWB, C = window.SWC, W = window.SWW;
  const { sum, median, share } = B;
  const { L, PAL, plot, tiles, na, b, esc, pct, num, dur, tok, theme, shortT } = C;
  const FM = ['Disobey task specification', 'Disobey role specification', 'Step repetition', 'Loss of conversation history', 'Unaware of termination conditions',
    'Conversation reset', 'Fail to ask for clarification', 'Task derailment', 'Information withholding', 'Ignored other agent\'s input', 'Reasoning-action mismatch',
    'Premature termination', 'No or incomplete verification', 'Incorrect verification'];
  const FMK = ['1.1', '1.2', '1.3', '1.4', '1.5', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '3.1', '3.2', '3.3'];
  const CAT = i => i < 5 ? 0 : i < 11 ? 1 : 2, CATN = ['Specification and design', 'Inter-agent misalignment', 'Verification and termination'];
  const COL = ['#6f8cff', '#34d399', '#f0b429', '#c084fc', '#f87171', '#94a3b8', '#2aa7ae'];
  const grid = (...x) => `<div class="grid2">${x.map(h => `<div>${h}</div>`).join('')}</div>`;
  const h4 = t => `<h4>${esc(t)}</h4>`;

  function prep(M) {
    const rows = M.rows.map(r => Object.assign({}, r, { nfm: [...r.fm].filter(c => c === '1').length, nroles: Object.keys(r.r).length, cat: [0, 1, 2].map(k => [...r.fm].some((c, i) => c === '1' && CAT(i) === k)) }));
    return { rows, pairs: M.pairs, fws: [...new Set(rows.map(r => r.f))].sort((p, q) => rows.filter(r => r.f === q).length - rows.filter(r => r.f === p).length) };
  }

  function sections(P, scope) {
    const ctx = C.Ctx(), out = [], T = theme();
    const R = scope === 'all' ? P.rows : P.rows.filter(r => r.f === scope), fws = scope === 'all' ? P.fws : [scope];
    const fcol = f => COL[P.fws.indexOf(f) % COL.length];
    const bc = W.bcard;

    // 1. headcount, span
    {
      const llms = [...new Set(R.map(r => r.m))], bms = [...new Set(R.map(r => r.b))];
      const stack = plot(ctx, 280, llms.map((m, i) => ({ type: 'bar', name: m, x: fws, y: fws.map(f => R.filter(r => r.f === f && r.m === m).length), marker: { color: COL[i % 7] }, hovertemplate: m + ': %{y} traces<extra></extra>' })),
        L({ barmode: 'stack', showlegend: true, legend: { y: 1.18, x: 0 }, yaxis: { title: { text: 'traces' } } }));
      const sp = plot(ctx, 280, fws.map(f => ({ type: 'box', name: f, y: R.filter(r => r.f === f && r.nroles).map(r => r.nroles), marker: { color: fcol(f) }, boxpoints: false, hovertemplate: '%{y} roles<extra></extra>' })),
        L({ yaxis: { title: { text: 'distinct agent roles per trace' }, rangemode: 'tozero' }, margin: { b: 70 } }));
      const msgs = plot(ctx, 280, fws.map(f => ({ type: 'box', name: f, y: R.filter(r => r.f === f && r.n).map(r => r.n), marker: { color: fcol(f) }, boxpoints: false, hovertemplate: '%{y} messages<extra></extra>' })),
        L({ yaxis: { type: 'log', title: { text: 'messages per trace (log)' } }, margin: { b: 70 } }));
      const withR = R.filter(r => r.nroles);
      out.push(bc('m-headcount', 'Headcount, spans and team size', 'Who is on the team: how many traces, which models, how many distinct agent roles collaborate and how much they say.', ['Org design'],
        tiles([[R.length.toLocaleString(), 'traces'], [String(fws.length), fws.length === 1 ? 'framework' : 'frameworks'], [String(llms.length), 'underlying models', llms.join(', ')], [String(bms.length), 'benchmarks'], [num(median(withR.map(r => r.nroles))), 'median agents per team', 'Distinct speaking roles in a trace (the span of control is this minus one)'], [num(median(R.filter(r => r.n).map(r => r.n))), 'median messages per trace']])
        + h4('Traces by framework and model') + stack + grid(h4('Agents per team') + sp, h4('Messages per trace') + msgs),
        `The median team has ${b(num(median(withR.map(r => r.nroles))))} agents, nowhere near the 41-helper swarm in Deep dives. Frameworks here are fixed org charts (a CEO, a CTO, a programmer, a tester), not dynamic fan-out.`));
    }

    // 2. mayor
    {
      const per = fws.map(f => { const t = {}; R.filter(r => r.f === f).forEach(r => Object.entries(r.r).forEach(([k, v]) => { t[k] = (t[k] || 0) + v; })); const T2 = sum(Object.values(t)) || 1; return { f, top: Object.entries(t).sort((p, q) => q[1] - p[1]).slice(0, 5).map(([k, v]) => [k, v / T2]), T2 }; });
      const traces = []; for (let i = 0; i < 5; i++) traces.push({ type: 'bar', orientation: 'h', y: per.map(p => p.f), x: per.map(p => p.top[i] ? 100 * p.top[i][1] : 0), text: per.map(p => p.top[i] ? shortT(p.top[i][0], 18) : ''), textposition: 'inside', insidetextanchor: 'middle', marker: { color: COL[i], line: { color: T.panel, width: 1 } }, hovertemplate: per.map(p => p.top[i] ? p.top[i][0] + ': ' + (100 * p.top[i][1]).toFixed(0) + '% of messages' : '').map(x => x + '<extra></extra>'), showlegend: false });
      const mayorChart = plot(ctx, Math.max(200, per.length * 50 + 70), traces, L({ barmode: 'stack', margin: { l: 90 }, yaxis: { autorange: 'reversed' }, xaxis: { range: [0, 100], title: { text: '% of messages by the five busiest roles' } } }));
      const pf = scope === 'all' ? 'ChatDev' : scope, pr = (P.pairs[pf] || []).slice(0, 12);
      const pairChart = pr.length ? plot(ctx, Math.max(220, pr.length * 26 + 70), [{ type: 'bar', orientation: 'h', y: pr.map(p => shortT(p[0] + ' ↔ ' + p[1], 40)).reverse(), x: pr.map(p => p[2]).reverse(), marker: { color: fcol(pf) }, hovertemplate: '%{y}: %{x} exchanges<extra></extra>' }], L({ margin: { l: 230 }, xaxis: { title: { text: 'exchanges across all ' + pf + ' traces' } } })) : na('No exchange data for this framework.');
      const lead = (per.filter(p => p.top.length > 1).length ? per.filter(p => p.top.length > 1) : per).slice().sort((p, q) => q.top[0][1] - p.top[0][1])[0];
      out.push(bc('m-mayor', 'Who is the mayor?', 'The role that does the most talking in each framework, and who talks to whom most often.', ['Org design', 'Bullshit Jobs'],
        tiles(per.map(p => [pct(p.top[0][1]), p.f + ': ' + shortT(p.top[0][0], 22), 'Share of all messages sent by the busiest role in ' + p.f])) + h4('Share of messages by role') + mayorChart + h4(`Busiest conversations (${pf})`) + pairChart,
        `${b(lead.f)} is the most centralised: ${b(lead.top[0][0])} sends ${b(pct(lead.top[0][1]))} of messages. Where one role dominates, that role is the real mayor whatever the org chart says.`));
    }

    // 3. org sunburst
    {
      const ids = ['root'], labels = ['All traces'], parents = [''], values = [0], colors = [T.line];
      const add = (id, l, p, v, c) => { ids.push(id); labels.push(l); parents.push(p); values.push(v); colors.push(c); };
      fws.forEach(f => {
        add(f, f, 'root', 0, fcol(f));
        [...new Set(R.filter(r => r.f === f).map(r => r.b))].forEach(bm => {
          add(f + '/' + bm, bm, f, 0, T.line);
          const t = {}; R.filter(r => r.f === f && r.b === bm).forEach(r => Object.entries(r.r).forEach(([k, v]) => { t[k] = (t[k] || 0) + v; }));
          Object.entries(t).sort((p, q) => q[1] - p[1]).slice(0, 6).forEach(([k, v]) => add(f + '/' + bm + '/' + k, shortT(k, 20), f + '/' + bm, Math.sqrt(v), fcol(f)));
        });
      });
      const ix = Object.fromEntries(ids.map((id, i) => [id, i])); for (let i = ids.length - 1; i > 0; i--) values[ix[parents[i]]] += values[i];
      const sun = plot(ctx, 500, [{ type: 'sunburst', ids, labels, parents, values, branchvalues: 'total', marker: { colors, line: { width: 1, color: T.panel } }, insidetextorientation: 'radial', hovertemplate: '%{label}<extra></extra>' }], L({ margin: { l: 4, r: 4, t: 4, b: 4 } }));
      out.push(bc('m-org', 'Org chart: framework, benchmark and role', 'Each framework is an organisation; the ring shows which tasks it was given and which roles did the talking (slice size is the square root of messages).', ['Org design'], sun, 'Frameworks differ more in structure than in size: a flat pair of agents, a fixed assembly line of named roles, or a supervisor with specialist app agents.'));
    }

    // 4. failure modes (attrition / defects)
    {
      const z = fws.map(f => { const rr = R.filter(r => r.f === f); return FMK.map((_, i) => 100 * rr.filter(r => r.fm[i] === '1').length / (rr.length || 1)); });
      const heat = plot(ctx, Math.max(220, fws.length * 40 + 140), [{ type: 'heatmap', z, x: FMK.map((k, i) => k + ' ' + shortT(FM[i], 18)), y: fws, text: z.map(r => r.map(v => v >= 1 ? Math.round(v) : '')), texttemplate: '%{text}', colorscale: [[0, 'rgba(111,140,255,0.04)'], [1, PAL.bad]], showscale: false, xgap: 2, ygap: 2, hovertemplate: '%{y}: %{x}: %{z:.0f}% of traces<extra></extra>' }],
        L({ margin: { b: 150, l: 90 }, xaxis: { tickangle: -50, tickfont: { size: 10 } }, yaxis: { autorange: 'reversed' } }));
      const free = R.filter(r => r.nfm === 0).length / (R.length || 1), mean = sum(R.map(r => r.nfm)) / (R.length || 1);
      const totalFm = FMK.map((_, i) => R.filter(r => r.fm[i] === '1').length), worst = totalFm.indexOf(Math.max(...totalFm));
      const catShare = [0, 1, 2].map(k => R.filter(r => r.cat[k]).length / (R.length || 1));
      const byL = [...new Set(R.map(r => r.m))].map(m => { const rr = R.filter(r => r.m === m); return { m, v: sum(rr.map(r => r.nfm)) / rr.length, n: rr.length }; }).sort((p, q) => q.v - p.v);
      const lchart = plot(ctx, Math.max(200, byL.length * 36 + 70), [{ type: 'bar', orientation: 'h', y: byL.map(x => x.m).reverse(), x: byL.map(x => x.v).reverse(), marker: { color: PAL.b }, text: byL.map(x => 'n=' + x.n).reverse(), hovertemplate: '%{y}: %{x:.1f} failure modes per trace<extra></extra>' }], L({ margin: { l: 110 }, xaxis: { title: { text: 'failure modes per trace' } } }));
      const cchart = plot(ctx, 220, [{ type: 'bar', x: CATN, y: catShare.map(v => 100 * v), marker: { color: [PAL.a, PAL.b, PAL.good] }, hovertemplate: '%{x}: %{y:.0f}% of traces<extra></extra>' }], L({ yaxis: { title: { text: '% of traces affected' }, range: [0, 100] } }));
      out.push(bc('m-fail', 'Attrition and defects: how teams fail', 'The 14 failure modes of multi-agent systems (the MAST taxonomy), labelled for every trace. Each cell is the share of traces showing that failure.', ['Lean manufacturing', 'The Goal'],
        tiles([[pct(free), 'traces with no failure mode'], [num(mean), 'failure modes per trace'], [FMK[worst] + ' ' + shortT(FM[worst], 22), 'most common failure', pct(totalFm[worst] / (R.length || 1)) + ' of traces'], [pct(catShare[2]), 'traces fail verification or termination']]) + h4('Failure modes by framework (% of traces)') + heat + grid(h4('By model') + lchart, h4('By failure family') + cchart),
        `${b(pct(1 - free))} of traces show at least one failure. The most common is ${b(FM[worst])}; verification and termination problems touch ${b(pct(catShare[2]))} of traces. Labels are produced by the dataset's LLM annotator, not hand-checked per trace.`));
    }

    // 5. value chain from ChatDev phases
    {
      const cd = P.rows.filter(r => r.f === 'ChatDev' && r.ph.length);
      if (cd.length && (scope === 'all' || scope === 'ChatDev')) {
        const ph = {}; cd.forEach(r => r.ph.forEach(([n, t], i) => { const p = ph[n] = ph[n] || { n, c: 0, t: 0, pos: 0 }; p.c++; p.t += t; p.pos += i; }));
        const rowsP = Object.values(ph).filter(p => p.c >= cd.length * 0.2).map(p => Object.assign(p, { pos: p.pos / p.c })).sort((p, q) => p.pos - q.pos);
        const ch = plot(ctx, Math.max(260, rowsP.length * 30 + 80), [{ type: 'bar', orientation: 'h', y: rowsP.map(p => p.n).reverse(), x: rowsP.map(p => p.t / cd.length).reverse(), marker: { color: rowsP.map((p, i) => COL[i % 7]).reverse() }, text: rowsP.map(p => pct(p.c / cd.length)).reverse(), hovertemplate: '%{y}: %{x:.1f} exchanges per run<extra></extra>' }],
          L({ margin: { l: 150 }, xaxis: { title: { text: 'average exchanges per run (label: share of runs reaching the phase)' } } }));
        const clean = cd.filter(r => r.nfm === 0).length / cd.length;
        out.push(bc('m-chain', 'Project value chain: the ChatDev assembly line', 'ChatDev runs a fixed pipeline of named phases. Bars are listed in the order they typically happen; length is how many exchanges each phase takes.', ['The Goal', 'The Phoenix Project'],
          tiles([[String(rowsP.length), 'phases in the typical run'], [shortT(rowsP.slice().sort((p, q) => q.t - p.t)[0].n, 18), 'busiest phase'], [pct(clean), 'runs without a failure mode']]) + ch,
          `The pipeline is ${b(rowsP.length)} phases long and ${b(rowsP.slice().sort((p, q) => q.t - p.t)[0].n)} soaks up the most exchanges, so that is the constraint to attack first.`));
      }
    }

    // 6. cost
    {
      const cd = R.filter(r => r.tok && r.cost != null);
      if (cd.length >= 10) {
        const loc = cd.filter(r => r.loc);
        const sc = plot(ctx, 300, [{ type: 'scatter', mode: 'markers', x: loc.map(r => r.tok), y: loc.map(r => r.loc), text: loc.map(r => r.b + ' · ' + r.m + (r.nfm ? ' · ' + r.nfm + ' failure modes' : '')), marker: { color: loc.map(r => r.nfm ? PAL.bad : PAL.good), size: 8, opacity: 0.65 }, hovertemplate: '%{text}<br>%{x:,} tokens, %{y} lines<extra></extra>' }],
          L({ xaxis: { type: 'log', title: { text: 'tokens spent (log)' } }, yaxis: { type: 'log', title: { text: 'lines of code delivered (log)' } } }));
        const pc = B.paretoCurve(cd.map(r => r.tok));
        out.push(bc('m-cost', 'Cost per run and output', 'ChatDev reports its own token use, dollar cost and lines of code, so cost can be set against output. Red runs had at least one failure mode.', ['Factory Physics'],
          tiles([[tok(median(cd.map(r => r.tok))), 'median tokens per run'], ['$' + num(median(cd.map(r => r.cost))), 'median cost per run', 'As reported by ChatDev at the model\'s list price'], [num(median(loc.map(r => r.loc))), 'median lines of code delivered'], [num(median(loc.map(r => r.tok / r.loc))), 'tokens per line of code'], [pct(pc.topShare), 'of tokens in the costliest 20% of runs']]) + sc,
          `A median run burns ${b(tok(median(cd.map(r => r.tok))))} tokens for ${b(num(median(loc.map(r => r.loc))))} lines of code; the costliest fifth of runs hold ${b(pct(pc.topShare))} of the tokens.`));
      }
    }

    // 7. flow / cycle time
    {
      const tm = R.filter(r => r.dur);
      if (tm.length >= 10) {
        const grp = [...new Set(tm.map(r => r.f + ' · ' + r.m))].map(g => ({ g, v: tm.filter(r => r.f + ' · ' + r.m === g).map(r => r.dur / 60) })).filter(x => x.v.length >= 5);
        const bx = plot(ctx, 320, grp.map((x, i) => ({ type: 'box', name: x.g, y: x.v, marker: { color: COL[i % 7] }, boxpoints: false, hovertemplate: '%{y:.1f} min<extra></extra>' })), L({ yaxis: { type: 'log', title: { text: 'wall-clock per run (minutes, log)' } }, margin: { b: 110 }, xaxis: { tickangle: -30 } }));
        const all = tm.map(r => r.dur), m = sum(all) / all.length, sd = Math.sqrt(sum(all.map(v => (v - m) ** 2)) / all.length);
        const clean = median(tm.filter(r => r.nfm === 0).map(r => r.dur)), bad = median(tm.filter(r => r.nfm > 0).map(r => r.dur));
        out.push(bc('m-flow', 'Flow: cycle time and variability', 'How long one run takes from start to finish where the logs carry timestamps (ChatDev, MetaGPT, OpenManus), and how much it varies.', ['Factory Physics', 'The Phoenix Project'],
          tiles([[dur(median(all)), 'median cycle time'], [num(sd / m), 'coefficient of variation', 'Above 1 is highly variable'], [clean ? dur(clean) : 'n/a', 'median, runs without failure'], [bad ? dur(bad) : 'n/a', 'median, runs with failure']]) + bx,
          `Cycle time swings with a coefficient of variation of ${b(num(sd / m))}. ${clean && bad ? `Runs with failures take ${b(num(bad / clean) + 'x')} as long as clean ones, so unplanned rework shows up directly in cycle time.` : ''}`));
      }
    }

    // 8. limits
    out.push(bc('m-limits', 'What these logs cannot answer', 'MAST traces are conversation text, not tool-call logs.', ['Method'],
      `<ul class="na-list"><li><b>No tool calls, cost or tokens</b> for most frameworks (only ChatDev reports them), so activity analysis (RAS), tool cost, T&amp;E and LTV/CAC need the Deep dives lens.</li><li><b>Failure labels</b> come from the dataset's LLM annotator. Treat them as a consistent yardstick, not ground truth for any single trace.</li><li><b>Roles</b> are read from speaker headers, so a framework that logs fewer speakers looks smaller than it is (AG2 logs only 30 of its 597 traces in a parseable format).</li><li><b>Success</b> is not recorded, only the absence of failure modes, so scores here measure process quality, not whether the code or answer was right.</li></ul>`, ''));
    return { sections: W.renumber(out), ctx };
  }

  window.SWM = { prep, sections };
})();
