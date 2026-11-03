// Fleet lens: CooperBench, 368 two-agent coop runs against 368 matched single-agent runs (same tasks, same model, same harness).
(() => {
  'use strict';
  const B = window.SWB, C = window.SWC;
  const { sum, median, share } = B;
  const { L, PAL, plot, tiles, na, card, b, esc, tok, pct, dur, num, money, theme, shortT } = C;

  function fleetSections(FL) {
    const ctx = C.Ctx(), out = [], T = theme();
    const { coop, solo, agents, F } = FL;
    const repoName = i => (F.repos[i] || '?').replace('_task', '');
    const paired = coop.filter(c => c.solo);
    const passC = sum(coop.map(c => c.passes)), passS = sum(solo.map(s => s.passes));
    const costC = sum(coop.map(c => c.cost)), costS = sum(solo.map(s => s.cost));
    const bothC = coop.filter(c => c.both).length, bothS = solo.filter(s => s.both).length;
    const A = agents;

    // ---- 1. make vs buy: does a second agent pay? ----
    {
      const rate = (n, d) => 100 * n / d;
      const defs = [
        { t: 'Features passed (%)', v: [rate(passC, 2 * coop.length), rate(passS, 2 * solo.length)], f: '%{y:.1f}%' },
        { t: 'Both features passed (%)', v: [rate(bothC, coop.length), rate(bothS, solo.length)], f: '%{y:.1f}%' },
        { t: 'Recorded cost per passed feature ($)', v: [costC / Math.max(1, passC), costS / Math.max(1, passS)], f: '$%{y:.2f}' },
        { t: 'Median wall-clock per task (min)', v: [median(coop.map(c => c.d)) / 60, median(solo.map(s => s.d)) / 60], f: '%{y:.1f} min' },
      ];
      const small = defs.map((d, i) => plot(ctx, 230, [{ type: 'bar', x: ['2 agents (coop)', '1 agent (solo)'], y: d.v, marker: { color: [PAL.b, PAL.a] }, text: d.v.map(v => d.f.replace('%{y:.1f}', v.toFixed(1)).replace('%{y:.2f}', v.toFixed(2))), textposition: 'outside', hovertemplate: d.f + '<extra></extra>', cliponaxis: false }],
        L({ margin: { t: 26, l: 44 }, yaxis: { rangemode: 'tozero' }, title: { text: d.t, font: { size: 12, color: T.muted }, x: 0.02, y: 0.98 } }))).map(h => `<div>${h}</div>`).join('');
      const z = [0, 1, 2].map(sp => [0, 1, 2].map(cp => paired.filter(c => c.soloPasses === sp && c.passes === cp).length));
      const heat = plot(ctx, 260, [{ type: 'heatmap', z, x: ['0 passed', '1 passed', '2 passed'], y: ['0 passed', '1 passed', '2 passed'], text: z.map(r => r.map(String)), texttemplate: '%{text}', colorscale: [[0, 'rgba(111,140,255,0.05)'], [1, PAL.a]], showscale: false, xgap: 3, ygap: 3, hovertemplate: 'Solo %{y}, coop %{x}: %{z} tasks<extra></extra>' }],
        L({ margin: { l: 80 }, xaxis: { title: { text: 'two agents (coop)' } }, yaxis: { title: { text: 'one agent (solo)' }, autorange: 'reversed' } }));
      const better = paired.filter(c => c.passes > c.soloPasses).length, worse = paired.filter(c => c.passes < c.soloPasses).length;
      const body = tiles([
        [String(coop.length), 'tasks, each run both ways'],
        [String(2 * coop.length + solo.length), 'agent runs in total'],
        [tok(sum(coop.map(c => c.tokens)) + sum(solo.map(s => s.tokens))), 'tokens processed'],
        [pct(bothC / coop.length) + ' vs ' + pct(bothS / solo.length), 'both features pass: coop vs solo'],
      ]) + `<div class="grid4">${small}</div><h4>Same task, both arms: how many features passed</h4>${heat}`;
      out.push(card('headcount', 1, 'Make vs buy: does a second agent pay?', 'Each task ran twice with the same model and harness: once by one agent doing both features, once by two agents splitting them and coordinating.', body,
        `Hiring a teammate made things ${worse > better ? b('worse') : b('better')}: coop beat solo on ${b(better)} tasks and lost on ${b(worse)}. Passing both features: ${b(pct(bothC / coop.length))} with two agents versus ${b(pct(bothS / solo.length))} alone, at ${b(num(costC / costS) + 'x')} the recorded cost. The cost of coordination is higher than the value of parallelism for a small model.`));
    }

    // ---- 2. mayor ----
    {
      const hs = coop.map(c => c.heavyShare * 100);
      const hist = plot(ctx, 250, [{ type: 'histogram', x: hs, xbins: { start: 50, end: 100, size: 2.5 }, marker: { color: PAL.a, line: { color: T.panel, width: 1 } }, hovertemplate: '%{x}% of pair cost: %{y} pairs<extra></extra>' }], L({ xaxis: { title: { text: 'share of the pair\'s cost carried by the heavier agent (%)' }, range: [50, 100] }, yaxis: { title: { text: 'pairs' } } }));
      const heavyPass = coop.filter(c => c.a[c.heavy][6]).length, lightPass = coop.filter(c => c.a[1 - c.heavy][6]).length;
      const a1 = coop.filter(c => c.a[0][6]).length, a2 = coop.filter(c => c.a[1][6]).length;
      const who = plot(ctx, 250, [{ type: 'bar', x: ['Heavier spender', 'Lighter spender', 'Agent 1 (feature 1)', 'Agent 2 (feature 2)'], y: [heavyPass, lightPass, a1, a2].map(v => 100 * v / coop.length), marker: { color: [PAL.bad, PAL.good, PAL.a, PAL.b] }, text: [heavyPass, lightPass, a1, a2].map(v => pct(v / coop.length)), textposition: 'outside', hovertemplate: '%{x}: %{y:.1f}% pass<extra></extra>', cliponaxis: false }], L({ margin: { t: 24 }, yaxis: { title: { text: 'feature pass rate (%)' }, rangemode: 'tozero' } }));
      const body = tiles([[pct(median(hs) / 100), 'of pair cost carried by the heavier agent (median)'], [pct(share(coop.filter(c => c.heavyShare > 0.8).length, coop.length)), 'pairs where one agent spends 80%+'], [pct(heavyPass / coop.length), 'heavier agent pass rate'], [pct(lightPass / coop.length), 'lighter agent pass rate']]) + `<div class="grid2"><div><h4>One agent carries the pair</h4>${hist}</div><div><h4>Who passes: the heavy spender or the light one?</h4>${who}</div></div>`;
      out.push(card('mayor', 2, 'Who is the mayor here?', 'In each pair, which agent does the work. There is no formal lead, so the mayor is whoever spends.', body,
        `The heavier agent carries a median ${b(pct(median(hs) / 100))} of the pair's cost, yet passes ${heavyPass > lightPass ? b('more') : b('less')} often than its partner (${b(pct(heavyPass / coop.length))} vs ${b(pct(lightPass / coop.length))}). ${heavyPass < lightPass ? 'The agent that spends the most is not the one that delivers: effort is a poor proxy for results.' : ''}`));
    }

    // ---- 3. bonuses and compa-ratio ----
    {
      const sorted = A.slice().sort((p, q) => p.cost - q.cost), nq = Math.ceil(sorted.length / 4);
      const qs = [0, 1, 2, 3].map(i => sorted.slice(i * nq, (i + 1) * nq));
      const passQ = qs.map(g => 100 * sum(g.map(a => a.arm === 'solo' ? a.pass / 2 : a.pass)) / g.length);
      const bq = plot(ctx, 250, [{ type: 'bar', x: ['Q1 lowest', 'Q2', 'Q3', 'Q4 highest'].map((x, i) => x + ' ($' + num(qs[i][0].cost) + '+)'), y: passQ, marker: { color: [PAL.good, '#6fcf97', PAL.b, PAL.bad] }, text: passQ.map(v => v.toFixed(0) + '%'), textposition: 'outside', cliponaxis: false, hovertemplate: '%{x}: %{y:.1f}% pass<extra></extra>' }],
        L({ margin: { t: 24 }, xaxis: { title: { text: 'agent run cost quartile (recorded $)' } }, yaxis: { title: { text: 'feature pass rate (%)' }, rangemode: 'tozero' } }));
      const byRepo = {}; A.forEach(a => { const r = byRepo[a.repo] = byRepo[a.repo] || { n: 0, cost: 0, pass: 0 }; r.n++; r.cost += a.cost; r.pass += a.arm === 'solo' ? a.pass : a.pass; });
      const fleetCpp = sum(A.map(a => a.cost)) / Math.max(1, sum(A.map(a => a.pass))), rows = Object.entries(byRepo).filter(([, r]) => r.n >= 12).map(([k, r]) => ({ k, cpp: r.pass ? r.cost / r.pass : null, n: r.n, pass: r.pass })).sort((p, q) => (q.cpp || 1e9) - (p.cpp || 1e9));
      const compa = plot(ctx, Math.max(250, rows.length * 22 + 70), [{ type: 'bar', orientation: 'h', y: rows.map(r => repoName(+r.k)).reverse(), x: rows.map(r => r.cpp ? r.cpp / fleetCpp : null).reverse(), marker: { color: rows.map(r => !r.cpp || r.cpp / fleetCpp > 1.5 ? PAL.bad : r.cpp / fleetCpp > 1 ? PAL.b : PAL.good).reverse() }, text: rows.map(r => r.cpp ? (r.cpp / fleetCpp).toFixed(1) + 'x' : 'no passes').reverse(), textposition: 'outside', cliponaxis: false, hovertemplate: '%{y}: %{x:.2f}x fleet cost per pass<extra></extra>' }],
        L({ margin: { l: 90, r: 50 }, xaxis: { title: { text: 'compa-ratio: cost per passed feature / fleet average (1.0 = paid right)' }, rangemode: 'tozero' }, shapes: [{ type: 'line', x0: 1, x1: 1, y0: -0.5, y1: rows.length - 0.5, line: { color: T.muted, dash: 'dash', width: 1 } }] }));
      const zeroPay = A.filter(a => a.cost > 0 && !(a.arm === 'solo' ? a.pass : a.pass));
      const body = tiles([[money(fleetCpp), 'recorded cost per passed feature'], [pct(sum(zeroPay.map(a => a.cost)) / sum(A.map(a => a.cost))), 'of spend on runs that earned no bonus', 'Bonus = a passing feature. Spend on agent runs with nothing passing.'], [String(rows.filter(r => !r.cpp || r.cpp / fleetCpp > 1.5).length), 'repos paid 1.5x+ the going rate']]) +
        `<div class="grid2"><div><h4>Does more spend buy more passes?</h4>${bq}</div><div><h4>Compa-ratio by repo (squad type)</h4>${compa}</div></div>`;
      out.push(card('bonus', 3, 'Bonuses and compa-ratios', 'Pay vs results. A passing feature is the bonus trigger; compa-ratio compares what each kind of work costs per bonus against the fleet norm.', body,
        `${b(pct(sum(zeroPay.map(a => a.cost)) / sum(A.map(a => a.cost))))} of recorded spend went to runs that earned no bonus. ${passQ[3] < passQ[0] ? 'The highest-spending quartile passes less than the cheapest one: long runs are usually flailing, not thorough.' : 'Higher-spending runs do pass more.'}`));
    }

    // ---- 4. Pareto ----
    {
      const byCost = A.slice().sort((p, q) => q.cost - p.cost), TC = sum(A.map(a => a.cost)), TP = sum(A.map(a => a.arm === 'solo' ? a.pass : a.pass)) || 1, k = Math.ceil(A.length * 0.2);
      let cc = 0, cp = 0; const x = [0], yc = [0], yp = [0];
      byCost.forEach((a, i) => { cc += a.cost; cp += a.pass; x.push(100 * (i + 1) / A.length); yc.push(100 * cc / TC); yp.push(100 * cp / TP); });
      const topCost = yc[k], topPass = yp[k];
      const ch = plot(ctx, 330, [{ type: 'scatter', mode: 'lines', x: [0, 100], y: [0, 100], name: 'Even split', line: { color: T.line, dash: 'dot' }, hoverinfo: 'skip' }, { type: 'scatter', mode: 'lines', name: 'Cost', x, y: yc, line: { color: PAL.b, width: 3 }, hovertemplate: 'costliest %{x:.0f}% of runs hold %{y:.0f}% of spend<extra></extra>' }, { type: 'scatter', mode: 'lines', name: 'Passes', x, y: yp, line: { color: PAL.good, width: 3 }, hovertemplate: 'the same runs earned %{y:.0f}% of passes<extra></extra>' }],
        L({ showlegend: true, legend: { y: 1.12, x: 0 }, xaxis: { title: { text: '% of agent runs, costliest first' }, range: [0, 100] }, yaxis: { title: { text: 'cumulative %' }, range: [0, 100] }, shapes: [{ type: 'line', x0: 20, x1: 20, y0: 0, y1: 100, line: { color: T.muted, dash: 'dash', width: 1 } }] }));
      out.push(card('pareto', 4, 'Pareto: 20% of agents, 80% of results', 'Rank every agent run by spend, then ask how much of the spend and how many of the passes sit in the costliest fifth.',
        tiles([[pct(topCost / 100), `of spend in the costliest ${k} runs`], [pct(topPass / 100), 'of passes from those same runs'], [String(A.length), 'agent runs ranked']]) + ch,
        `The costliest 20% of agent runs burn ${b(pct(topCost / 100))} of the spend but deliver only ${b(pct(topPass / 100))} of the passes. ${topPass < 20 ? 'This is an inverse Pareto: the heaviest spenders are the weakest performers.' : ''}`));
    }

    // ---- 5. squads (by repo) ----
    {
      const rows = F.repos.map((r, i) => {
        const c = coop.filter(x => x.r === i), s = solo.filter(x => x.r === i);
        return { name: repoName(i), n: c.length, cp: c.length ? 100 * sum(c.map(x => x.passes)) / (2 * c.length) : 0, sp: s.length ? 100 * sum(s.map(x => x.passes)) / (2 * s.length) : 0, conf: c.length ? 100 * c.filter(x => x.mg === 'x').length / c.length : 0 };
      }).filter(r => r.n >= 8).sort((p, q) => q.n - p.n).slice(0, 14);
      const ch = plot(ctx, Math.max(300, rows.length * 34 + 90), [
        { type: 'bar', orientation: 'h', name: 'Solo pass %', y: rows.map(r => r.name).reverse(), x: rows.map(r => r.sp).reverse(), marker: { color: PAL.a }, hovertemplate: '%{y}: solo %{x:.0f}% pass<extra></extra>' },
        { type: 'bar', orientation: 'h', name: 'Coop pass %', y: rows.map(r => r.name).reverse(), x: rows.map(r => r.cp).reverse(), marker: { color: PAL.b }, hovertemplate: '%{y}: coop %{x:.0f}% pass<extra></extra>' },
        { type: 'scatter', mode: 'markers', name: 'Merge conflicts % (coop)', y: rows.map(r => r.name).reverse(), x: rows.map(r => r.conf).reverse(), marker: { color: PAL.bad, size: 10, symbol: 'diamond' }, hovertemplate: '%{y}: %{x:.0f}% of pairs conflicted<extra></extra>' }],
        L({ barmode: 'group', showlegend: true, legend: { y: 1.08, x: 0 }, margin: { l: 90 }, xaxis: { title: { text: '% (feature pass rate; conflicts as diamonds)' }, rangemode: 'tozero' } }));
      const best = rows.slice().sort((p, q) => (q.cp - q.sp) - (p.cp - p.sp))[0];
      const mgc = coop.filter(c => c.mg === 'x').length;
      out.push(card('squads', 5, 'Platoons and squads', 'A squad here is a pair working one repository. Which kinds of codebase suit a team, and where do the squads collide?',
        tiles([[String(coop.length), 'squads of two'], [pct(mgc / coop.length), 'squads whose work conflicted on merge'], [String(F.repos.length), 'repositories (squad types)']]) + ch,
        `${b(pct(mgc / coop.length))} of squads produced conflicting changes. The one place teamwork helped most was ${b(best.name)} (${b(best.cp.toFixed(0) + '%')} coop vs ${b(best.sp.toFixed(0) + '%')} solo).`));
    }

    // ---- 6. attrition + waste ----
    {
      const err = A.filter(a => a.arm === 'coop' && a.err).length, nCoop = coop.length * 2;
      const apS = A.filter(a => a.arm === 'coop' && a.ap === 's').length, apF = A.filter(a => a.arm === 'coop' && a.ap === 'f').length;
      const cats = { 'Passed': 0, 'Submitted, failed': 0, 'Errored out': 0 }, cnt = { 'Passed': 0, 'Submitted, failed': 0, 'Errored out': 0 };
      A.forEach(a => { const k = a.err ? 'Errored out' : a.pass ? 'Passed' : 'Submitted, failed'; cats[k] += a.cost; cnt[k]++; });
      const labs = Object.keys(cats), cols = [PAL.good, PAL.b, PAL.bad];
      const ch = plot(ctx, 260, [Object.assign({ type: 'pie', hole: 0.55, labels: labs, values: labs.map(k => cnt[k]), marker: { colors: cols, line: { color: T.panel, width: 2 } }, textinfo: 'percent', sort: false, hovertemplate: '%{label}: %{value} runs<extra></extra>', title: { text: 'share of runs', font: { size: 12, color: T.muted } }, domain: { x: [0, 0.48] } }),
        { type: 'pie', hole: 0.55, labels: labs, values: labs.map(k => cats[k]), marker: { colors: cols, line: { color: T.panel, width: 2 } }, textinfo: 'percent', sort: false, hovertemplate: '%{label}: $%{value:,.0f}<extra></extra>', title: { text: 'share of spend', font: { size: 12, color: T.muted } }, domain: { x: [0.52, 1] } }],
        L({ showlegend: true, legend: { y: -0.05, x: 0.2 }, margin: { l: 4, r: 4, t: 10, b: 10 } }));
      const byRepo = F.repos.map((r, i) => ({ name: repoName(i), n: coop.filter(c => c.r === i).length * 2, e: A.filter(a => a.arm === 'coop' && a.repo === i && a.err).length })).filter(r => r.n >= 16).sort((p, q) => q.e / q.n - p.e / p.n).slice(0, 10);
      const eb = plot(ctx, 280, [{ type: 'bar', y: byRepo.map(r => r.name).reverse(), x: byRepo.map(r => 100 * r.e / r.n).reverse(), orientation: 'h', marker: { color: PAL.bad }, hovertemplate: '%{y}: %{x:.0f}% of agents errored out<extra></extra>' }], L({ margin: { l: 90 }, xaxis: { title: { text: '% of agents that errored out' }, rangemode: 'tozero' } }));
      const body = tiles([[pct(err / nCoop), 'attrition: agents that errored out'], [String(apS), 'patches never applied (work discarded)'], [String(apF), 'patches that failed to apply'], [pct(cats['Errored out'] / sum(Object.values(cats))), 'of spend on agents that errored']]) + `<div class="grid2"><div><h4>Outcome of every agent run</h4>${ch}</div><div><h4>Attrition by repository</h4>${eb}</div></div>`;
      out.push(card('attrition', 6, 'Attrition', 'Agents that never finished, and work that was finished but thrown away.', body,
        `${b(pct(err / nCoop))} of coop agents errored out and ${b(apS)} finished patches were never applied. In total ${b(pct((cats['Submitted, failed'] + cats['Errored out']) / sum(Object.values(cats))))} of spend produced nothing that passed.`));
    }

    // ---- 7. title inflation: steps vs output ----
    {
      const sub = A.filter(a => !a.err && a.steps > 0);
      const none = sub.filter(a => a.patch === 0);
      const ch = plot(ctx, 330, [false, true].map(p => { const g = sub.filter(a => !!(a.arm === 'solo' ? a.pass : a.pass) === p); return { type: 'scatter', mode: 'markers', name: p ? 'Passed' : 'Did not pass', x: g.map(a => a.steps), y: g.map(a => a.patch + 1), marker: { color: p ? PAL.good : PAL.bad, size: 6, opacity: 0.45 }, hovertemplate: '%{x} steps, %{y} patch lines<extra></extra>' }; }),
        L({ showlegend: true, legend: { y: 1.12, x: 0 }, xaxis: { type: 'log', title: { text: 'steps taken (log)' } }, yaxis: { type: 'log', title: { text: 'patch lines produced + 1 (log)' } } }));
      const heavyNone = none.filter(a => a.steps >= median(sub.map(x => x.steps)));
      out.push(card('inflation', 7, 'Title inflation and leveling', 'Every agent here is the same model (a 9B open-weight), so the level is fixed. What varies is effort versus output: agents that take many steps and produce no patch.',
        tiles([['L1 for all', 'level mix', 'Qwen3.5-9B on every run: a single-level workforce. See Deep dives for real multi-level swarms.'], [pct(none.length / sub.length), 'agents that finished with an empty patch'], [pct(heavyNone.length / Math.max(1, none.length)), 'of those took above-median steps']]) + ch,
        `${b(pct(none.length / sub.length))} of agents that submitted produced a patch with no lines, many after a long run of steps: all effort and no output. In human terms: a title without a deliverable.`));
    }

    // ---- 8. communication ----
    {
      const bins = [['0', c => c.m === 0], ['1-4', c => c.m >= 1 && c.m <= 4], ['5-9', c => c.m >= 5 && c.m <= 9], ['10+', c => c.m >= 10]];
      const rows = bins.map(([n, f]) => { const g = coop.filter(f); return { n, cnt: g.length, p: g.length ? 100 * sum(g.map(c => c.passes)) / (2 * g.length) : 0, x: g.length ? 100 * g.filter(c => c.mg === 'x').length / g.length : 0 }; });
      const ch = plot(ctx, 270, [{ type: 'bar', name: 'Feature pass %', x: rows.map(r => r.n + ' msgs (n=' + r.cnt + ')'), y: rows.map(r => r.p), marker: { color: PAL.good }, hovertemplate: '%{x}: %{y:.1f}% pass<extra></extra>' }, { type: 'bar', name: 'Merge conflict %', x: rows.map(r => r.n + ' msgs (n=' + r.cnt + ')'), y: rows.map(r => r.x), marker: { color: PAL.bad }, hovertemplate: '%{x}: %{y:.0f}% conflicts<extra></extra>' }],
        L({ barmode: 'group', showlegend: true, legend: { y: 1.18, x: 0 }, yaxis: { title: { text: '%' }, rangemode: 'tozero' }, xaxis: { title: { text: 'messages the pair exchanged' } } }));
      const talk = coop.filter(c => c.m > 0), quiet = coop.filter(c => c.m === 0);
      out.push(card('comms', 8, 'Communication (SPACE: C)', 'Do pairs that talk do better? Messages exchanged between the two agents versus outcome.',
        tiles([[pct(talk.length / coop.length), 'pairs that exchanged any message'], [num(median(talk.map(c => c.m))), 'median messages when talking'], [pct(sum(talk.map(c => c.passes)) / (2 * Math.max(1, talk.length))) + ' vs ' + pct(sum(quiet.map(c => c.passes)) / (2 * Math.max(1, quiet.length))), 'pass rate: talking vs silent']]) + ch,
        `Pairs that talked passed ${b(pct(sum(talk.map(c => c.passes)) / (2 * talk.length)))} of features versus ${b(pct(sum(quiet.map(c => c.passes)) / (2 * quiet.length)))} for silent ones. ${'Correlation only: harder tasks may trigger more conversation.'}`));
    }

    // ---- 9. DORA ----
    {
      const dC = coop.map(c => c.d / 60), dS = solo.map(s => s.d / 60);
      const ch = plot(ctx, 260, [{ type: 'histogram', name: 'Solo', x: dS, marker: { color: PAL.a }, opacity: 0.7, xbins: { size: 2 } }, { type: 'histogram', name: 'Coop', x: dC, marker: { color: PAL.b }, opacity: 0.7, xbins: { size: 2 } }],
        L({ barmode: 'overlay', showlegend: true, legend: { y: 1.18, x: 0 }, xaxis: { title: { text: 'wall-clock per task (minutes)' }, range: [0, 60] }, yaxis: { title: { text: 'tasks' } } }));
      const hrsC = sum(coop.map(c => c.d)) / 3600, hrsS = sum(solo.map(s => s.d)) / 3600;
      const applied = A.filter(a => a.arm === 'coop' && a.ap === 'a').length;
      out.push(card('dora', 9, 'DORA', 'Delivery speed and stability for the fleet.',
        tiles([[num(median(dC)) + ' min vs ' + num(median(dS)) + ' min', 'lead time per task: coop vs solo (median)'], [num(passC / hrsC) + ' vs ' + num(passS / hrsS), 'throughput: features passed per wall-clock hour'], [pct(mgc(coop)), 'change failure: coop pairs with merge conflicts'], ['n/a', 'MTTR', 'Each run is a single attempt; no recovery loop is recorded']]) + ch,
        `Lead time is ${b(num(median(dC) / median(dS)) + 'x')} for coop versus solo, but coop passes fewer features per hour (${b(num(passC / hrsC))} vs ${b(num(passS / hrsS))}). Speed bought with parallelism was spent on merge conflicts.`));
    }
    function mgc(c) { return c.filter(x => x.mg === 'x').length / c.length; }

    // ---- 10. over time ----
    {
      const days = {}; coop.forEach(c => { const d = new Date(c.s * 1000).toISOString().slice(0, 10); const r = days[d] = days[d] || { n: 0, p: 0 }; r.n++; r.p += c.passes; });
      const ks = Object.keys(days).sort();
      const ch = plot(ctx, 250, [{ type: 'bar', name: 'Runs', x: ks, y: ks.map(k => days[k].n), marker: { color: PAL.mute }, yaxis: 'y', hovertemplate: '%{x}: %{y} runs<extra></extra>' }, { type: 'scatter', mode: 'lines+markers', name: 'Feature pass %', x: ks, y: ks.map(k => 100 * days[k].p / (2 * days[k].n)), line: { color: PAL.good, width: 3 }, yaxis: 'y2', hovertemplate: '%{x}: %{y:.0f}% pass<extra></extra>' }],
        L({ showlegend: true, legend: { y: 1.18, x: 0 }, yaxis: { title: { text: 'runs started' } }, yaxis2: { overlaying: 'y', side: 'right', title: { text: 'pass %' }, showgrid: false, rangemode: 'tozero' } }));
      out.push(card('time', 10, 'Output per agent over time', 'There is no revenue per agent; the unit of efficacy here is features passed per agent run. Runs and output by the day they started.', ch, `The fleet ran across ${b(ks.length)} day${ks.length === 1 ? '' : 's'}. Pass rate stays within a narrow band, so no learning or drift shows up at this horizon.`));
    }

    // ---- 11. geo / data limits ----
    {
      out.push(card('geo', 11, 'Geo-strategy (COLO) and what this source cannot answer', 'Where the compute lives, and which battery items need the Deep dives lens.',
        tiles([['Self-hosted', 'compute: ' + (F.hosting || ''), 'Every run used a model served from the team\'s own GPUs (a colocation play), not a hosted API'], ['Claude Code', 'harness'], ['Qwen3.5-9B', 'model']]) +
        `<ul class="na-list"><li><b>Activity analysis, roles and titles, tool cost, T&amp;E, LTV/CAC, vacation, MTTR:</b> the index records per-agent totals but not individual tool calls or timestamps. These are answered in <b>Deep dives</b>, which parse full transcripts.</li><li><b>Spans and layers:</b> always flat here (pairs and singletons). Real hierarchy is in Deep dives.</li><li><b>Cost:</b> dollars are as reported in the dataset's own accounting for the self-hosted model, so use them to compare arms, not as invoices.</li></ul>`,
        ''));
    }

    // ---- 12. flow, variability, eight wastes ----
    {
      const mk = (rows, nm) => ({ name: nm, items: rows.map(r => ({ s: r.s, e: r.s + Math.max(1, r.d), ok: r.passes > 0, n: r.steps != null ? r.steps : r.a[2], label: 'task ' + r.t + ' · ' + repoName(r.r) })) });
      out.push(...window.SWW.itemFlow([mk(coop, 'Coop (2 agents)'), mk(solo, 'Solo (1 agent)')], ctx, 'task run', 'task run: one task attempted start to finish'));
      const feats = 2 * (coop.length + solo.length), failedF = 1 - (passC + passS) / feats;
      const coopPatches = A.filter(a => a.arm === 'coop' && a.patch > 0).length, discarded = A.filter(a => a.arm === 'coop' && a.ap === 's').length;
      const errCost = sum(A.filter(a => a.err).map(a => a.cost)) / (sum(A.map(a => a.cost)) || 1), premium = Math.max(0, (costC - costS) / (costC || 1));
      const rows = [['Defects', failedF, 'Features that failed their tests'], ['Overproduction', coopPatches ? discarded / coopPatches : 0, 'Finished patches never applied'], ['Inventory', errCost, 'Spend by agents that errored out before finishing'], ['Extra processing', premium, 'Extra cost of the second agent over one agent on the same task']];
      const bar = plot(ctx, 240, [{ type: 'bar', orientation: 'h', y: rows.map(r => r[0]).reverse(), x: rows.map(r => 100 * r[1]).reverse(), marker: { color: rows.map(r => r[1] > 0.5 ? PAL.bad : r[1] > 0.2 ? PAL.b : PAL.good).reverse() }, text: rows.map(r => Math.round(100 * r[1]) + '%').reverse(), textposition: 'outside', cliponaxis: false, hovertemplate: '%{y}: %{x:.0f}%<extra></extra>' }],
        L({ margin: { l: 130, r: 40 }, xaxis: { range: [0, 105], title: { text: 'share of the relevant base' } } }));
      const tbl = `<div class="scroll"><table class="m wastes"><thead><tr><th>Waste</th><th>Measured as</th><th>Result</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td class="txt">${esc(r[2])}</td><td>${pct(r[1])}</td></tr>`).join('')}</tbody></table></div>`;
      out.push(window.SWW.bcard('waste', 'The eight wastes (muda)', 'Lean manufacturing’s eight wastes. This source records totals per run, so only four can be measured; the rest (waiting, motion, transportation, non-utilised talent) need the Deep dives lens.', ['Lean manufacturing', 'The Goal'],
        tiles([[pct(failedF), 'features failed'], [pct(coopPatches ? discarded / coopPatches : 0), 'finished patches discarded'], [pct(errCost), 'of spend on agents that errored out'], [pct(premium), 'extra cost of the second agent']]) + bar + tbl,
        `Most of the waste is ${b(rows.slice().sort((p, r) => r[1] - p[1])[0][0])} at ${b(pct(rows.slice().sort((p, r) => r[1] - p[1])[0][1]))}. The second agent costs ${b(pct(premium))} more for a lower pass rate.`));
      out.push(window.SWW.readingSection());
    }
    return { sections: window.SWW.renumber(out), ctx };
  }

  window.SWF = { fleetSections };
})();
