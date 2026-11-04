// Flow-of-value analytics for the Public swarms tab: spans and layers, project value chain, planned / unplanned / rework,
// WIP and cycle time, variability, constraints, the eight lean wastes and a "bullshit jobs" audit.
// Inspired by The Phoenix Project, The Goal, Factory Physics, There's Got to Be a Better Way, Bullshit Jobs and Theory of Constraints.
(() => {
  'use strict';
  const B = window.SWB, C = window.SWC;
  const { sum, median, share, merge } = B;
  const { L, PAL, plot, tiles, na, b, esc, tok, pct, dur, num, theme, shortT, compressor, lab } = C;
  const NAMES = B.BUCKETS, DARK = '#10131a';
  const ORDER = [0, 3, 1, 2, 4];                      // value-chain order: Research, Coordinate, Build, Verify, Operate
  const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
  const std = a => { if (a.length < 2) return 0; const m = sum(a) / a.length; return Math.sqrt(sum(a.map(x => (x - m) ** 2)) / a.length); };
  const unit = T => T < 7200 ? { k: 60, n: 'minutes' } : { k: 3600, n: 'hours' };
  const grid = (...x) => `<div class="grid2">${x.map(h => `<div>${h}</div>`).join('')}</div>`;
  const h4 = t => `<h4>${esc(t)}</h4>`;

  function bcard(id, title, measures, books, body, read) {
    return C.card(id, 0, title, measures, body, read).replace('</header>', `</header><p class="books">${books.map(x => `<span>${esc(x)}</span>`).join('')}</p>`);
  }
  function renumber(out) { return out.map((h, i) => h.replace(/<span class="n">\d+<\/span>/, `<span class="n">${i + 1}</span>`)); }

  // ---------- work items and flow statistics ----------
  function itemsOf(s) {
    const subs = s.agents.slice(1);
    if (subs.length >= 5) return { kind: 'sub-agent task', items: subs.map(a => ({ s: a.t0, e: Math.max(a.t1, a.t0 + 1), ok: a.status === 'ok', n: a.calls, label: lab(a, false) })) };
    const t = []; s.agents.forEach(a => a.ev.forEach(e => t.push(e[0]))); t.sort((x, y) => x - y);
    const eps = []; let cur = null;
    t.forEach(x => { if (cur && x - cur.e <= 120) { cur.e = x; cur.n++; } else { cur = { s: x, e: x, n: 1 }; eps.push(cur); } });
    return { kind: 'work burst', items: eps.filter(e => e.n >= 3).map(e => ({ s: e.s, e: Math.max(e.e, e.s + 1), ok: true, n: e.n, label: 'burst of ' + e.n + ' calls' })) };
  }
  function cpOf(items) { return compressor(merge(items.map(i => [i.s, i.e]), 1800)); }

  function flowStats(items, cp) {
    const it = items.map(i => Object.assign({}, i, { a: cp.f(i.s), d: cp.f(i.e) })).filter(i => i.d >= i.a);
    const T = Math.max(cp.T, 1), ev = [];
    it.forEach(i => { ev.push([i.a, 1]); ev.push([i.d, -1]); });
    ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const x = [0], y = [0]; let cur = 0, area = 0, last = 0, peak = 0;
    ev.forEach(([t, d]) => { area += cur * (t - last); last = t; cur += d; x.push(t); y.push(cur); peak = Math.max(peak, cur); });
    area += cur * (T - last); x.push(T); y.push(cur);
    const NB = Math.max(8, Math.min(24, it.length)), w = T / NB, arr = Array(NB).fill(0), dep = Array(NB).fill(0), wipBin = Array(NB).fill(0);
    const bin = t => Math.min(NB - 1, Math.floor(t / w));
    it.forEach(i => { arr[bin(i.a)]++; dep[bin(i.d)]++; for (let k = bin(i.a); k <= bin(i.d); k++) wipBin[k] += Math.max(0, Math.min(i.d, (k + 1) * w) - Math.max(i.a, k * w)) / w; });
    const cycle = it.map(i => i.d - i.a), W = cycle.length ? sum(cycle) / cycle.length : 0;
    const arrT = it.map(i => i.a).sort((p, r) => p - r); let batch = 0;
    for (let i = 0, j = 0; i < arrT.length; i++) { while (arrT[i] - arrT[j] > 60) j++; batch = Math.max(batch, i - j + 1); }
    const idle0 = sum(ev.length ? y.slice(0, -1).map((v, i) => v === 0 ? x[i + 1] - x[i] : 0) : []);
    return { it, T, x, y, peak, L: area / T, lam: it.length / T, W, cycle, cv: W ? std(cycle) / W : 0, NB, w, arr, dep, wipBin, batch, serial: idle0 / T, n: it.length };
  }

  // =============== SPANS AND LAYERS ===============
  function spansCard(sc, ctx) {
    const S = sc.sessions, A = sc.agents, T = theme();
    const swarms = S.filter(s => s.agents.length > 1);
    const subsAll = A.filter(a => a.layer > 0);
    const spans = swarms.map(s => s.stats.subs);
    const body0 = tiles([
      [swarms.length ? String(Math.max(...spans)) : '0', 'widest span of control', 'Direct reports of one orchestrator. A human manager typically has 5 to 10.'],
      [spans.length ? num(median(spans)) : 'n/a', 'median span across swarms'],
      ['2', 'layers observed', 'Main agent and the agents it spawned. The logs do not record deeper nesting.'],
      [swarms.length ? String(Math.max(...swarms.map(s => s.stats.peak))) : '1', 'peak agents working at once'],
      [subsAll.length ? pct(share(sum(subsAll.map(a => a.proc)), sum(A.map(a => a.proc)))) : '0%', 'of tokens spent in layer 2'],
      [subsAll.length ? pct(share(sum(subsAll.map(a => a.work)), sum(A.map(a => a.work)))) : '0%', 'of work done in layer 2'],
    ]);
    if (!swarms.length) return bcard('spans', 'Spans and layers', 'How wide and how deep the hierarchy is.', ['Org design'], body0 + na('No sub-agents in this scope: a flat, single-agent organisation. Pick a swarm session above to see its org chart.'), 'Flat organisation: span 0, one layer.');

    // org chart of the biggest swarm in scope
    const big = swarms.slice().sort((p, r) => r.agents.length - p.agents.length)[0];
    const subs = big.agents.slice(1), main = big.agents[0];
    const sq = {}; subs.forEach(a => { (sq[a.squad || 'Direct'] = sq[a.squad || 'Direct'] || []).push(a); });
    const groups = Object.entries(sq).sort((p, r) => r[1].length - p[1].length);
    let xi = 0; const leaves = [], squadPos = [];
    groups.forEach(([k, arr]) => { const x0 = xi; arr.sort((p, r) => p.t0 - r.t0).forEach(a => { leaves.push({ a, x: xi++ }); }); squadPos.push({ k, x: (x0 + xi - 1) / 2, n: arr.length, x0, x1: xi - 1 }); xi += 0.8; });
    const rootX = squadPos.length ? (squadPos[0].x + squadPos[squadPos.length - 1].x) / 2 : 0;
    const ex = [], ey = [];
    squadPos.forEach(s => { ex.push(rootX, rootX, s.x, s.x, null); ey.push(2, 1.5, 1.5, 1, null); });
    leaves.forEach(l => { const s = squadPos.find(p => l.x >= p.x0 && l.x <= p.x1); ex.push(s.x, s.x, l.x, l.x, null); ey.push(1, 0.5, 0.5, 0, null); });
    const traces = [{ type: 'scatter', mode: 'lines', x: ex, y: ey, line: { color: T.line, width: 1.5 }, hoverinfo: 'skip', showlegend: false }];
    NAMES.forEach((n, i) => {
      const lv = leaves.filter(l => l.a.top === i); if (!lv.length) return;
      traces.push({ type: 'scatter', mode: 'markers', name: n, x: lv.map(l => l.x), y: lv.map(() => 0), marker: { size: lv.map(l => 8 + Math.min(16, Math.sqrt(l.a.calls) * 1.6)), color: PAL.bucket[i], line: { color: lv.map(l => l.a.status === 'ok' ? T.panel : PAL.bad), width: lv.map(l => l.a.status === 'ok' ? 1 : 3) } },
        text: lv.map(l => `Sub ${l.a.id.slice(1)} · ${l.a.role}<br>${l.a.calls} calls · ${B.LEVELS[l.a.lvl]}${l.a.status === 'ok' ? '' : '<br>LOST: ' + l.a.status}<br>${esc(shortT(l.a.title, 70))}`), hovertemplate: '%{text}<extra></extra>' });
    });
    const dead = leaves.filter(l => l.a.top < 0);
    if (dead.length) traces.push({ type: 'scatter', mode: 'markers', name: 'No work done (lost)', x: dead.map(l => l.x), y: dead.map(() => 0), marker: { symbol: 'x', size: 11, color: PAL.bad, line: { width: 2, color: PAL.bad } }, text: dead.map(l => `Sub ${l.a.id.slice(1)} · ${l.a.role}<br>LOST: ${l.a.status}<br>${esc(shortT(l.a.title, 70))}`), hovertemplate: '%{text}<extra></extra>' });
    traces.push({ type: 'scatter', mode: 'markers+text', x: squadPos.map(s => s.x), y: squadPos.map(() => 1), marker: { symbol: 'diamond', size: squadPos.map(s => 14 + Math.min(18, s.n)), color: T.accent, line: { color: T.panel, width: 1 } },
      text: squadPos.map(s => s.n), textposition: 'top center', textfont: { color: T.text, size: 11 }, showlegend: false, hovertemplate: squadPos.map(s => (s.k === 'Direct' ? 'Direct reports' : 'Wave ' + String(s.k).replace('wf_', '').slice(0, 6)) + ': ' + s.n + ' agents').map(t => t + '<extra></extra>') });
    traces.push({ type: 'scatter', mode: 'markers+text', x: [rootX], y: [2], marker: { symbol: 'circle', size: 30, color: PAL.level[main.lvl - 1], line: { color: T.panel, width: 2 } }, text: ['Main'], textposition: 'top center', textfont: { color: T.text, size: 12 }, showlegend: false, hovertemplate: `Main agent · ${subs.length} direct reports · ${main.calls} calls<extra></extra>` });
    const orgchart = plot(ctx, 330, traces, L({ showlegend: true, legend: { y: -0.05, x: 0, orientation: 'h' }, margin: { l: 10, r: 10, t: 26, b: 50 }, xaxis: { visible: false, range: [-5, xi + 0.5] }, yaxis: { visible: false, range: [-0.6, 2.6] },
      annotations: [['Layer 1: main', 2], ['Squads', 1], ['Layer 2: agents', 0]].map(([t, y]) => ({ x: -4.8, y, xref: 'x', yref: 'y', text: t, showarrow: false, xanchor: 'left', font: { size: 11, color: T.muted } })) }));

    // span of control per session vs the human 5 to 10 band
    const all = sc.sessions.slice().sort((p, r) => r.stats.subs - p.stats.subs);
    const bars = plot(ctx, 280, [{ type: 'bar', x: all.map(s => s.id), y: all.map(s => s.stats.subs), marker: { color: all.map(s => s.stats.subs > 10 ? PAL.b : s.stats.subs >= 5 ? PAL.good : PAL.a) }, text: all.map(s => s.stats.subs), textposition: 'outside', cliponaxis: false, hovertemplate: '%{x}: %{y} direct reports<extra></extra>' }],
      L({ margin: { t: 24 }, xaxis: { type: 'category', title: { text: 'session' } }, yaxis: { title: { text: 'direct reports (span of control)' }, rangemode: 'tozero' },
        shapes: [{ type: 'rect', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: 5, y1: 10, fillcolor: 'rgba(52,211,153,0.14)', line: { width: 0 }, layer: 'below' }], annotations: [{ xref: 'paper', x: 1, y: 10, yref: 'y', text: 'human norm 5 to 10', showarrow: false, xanchor: 'right', yanchor: 'bottom', font: { size: 11, color: T.muted } }] }));

    // active span over time (sub-agents running at once)
    const sets = swarms.map(s => { const it = itemsOf(s); return { s, st: flowStats(s.agents.slice(1).map(a => ({ s: a.t0, e: Math.max(a.t1, a.t0 + 1), ok: a.status === 'ok' })), compressor(s.stats.clusters)) }; });
    const colors = [PAL.a, PAL.b, PAL.good, '#c084fc', PAL.bad];
    const active = sets.length === 1
      ? plot(ctx, 280, [{ type: 'scatter', mode: 'lines', x: sets[0].st.x.map(v => v / unit(sets[0].st.T).k), y: sets[0].st.y, line: { shape: 'hv', color: PAL.a, width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(111,140,255,0.2)', hovertemplate: '%{y} sub-agents running<extra></extra>' }],
        L({ xaxis: { title: { text: 'working ' + unit(sets[0].st.T).n } }, yaxis: { title: { text: 'sub-agents running at once' }, rangemode: 'tozero' }, shapes: [{ type: 'rect', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: 5, y1: 10, fillcolor: 'rgba(52,211,153,0.14)', line: { width: 0 }, layer: 'below' }] }))
      : plot(ctx, 280, sets.map((p, i) => ({ type: 'scatter', mode: 'lines', name: p.s.id, x: p.st.x.map(v => 100 * v / p.st.T), y: p.st.y, line: { shape: 'hv', color: colors[i % 5], width: 2 }, hovertemplate: p.s.id + ': %{y} running<extra></extra>' })),
        L({ showlegend: true, legend: { y: 1.15, x: 0 }, xaxis: { title: { text: '% of working time' } }, yaxis: { title: { text: 'sub-agents running at once' }, rangemode: 'tozero' }, shapes: [{ type: 'rect', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: 5, y1: 10, fillcolor: 'rgba(52,211,153,0.14)', line: { width: 0 }, layer: 'below' }] }));

    // layer economics
    const l0 = A.filter(a => a.layer === 0), l1 = A.filter(a => a.layer > 0);
    const metrics = [['Tokens', a => a.proc], ['Tool calls', a => a.calls], ['Work output', a => a.work], ['Cost units', a => a.cu]];
    const tot = metrics.map(([, f]) => sum(A.map(f)) || 1);
    const econ = plot(ctx, 280, [['Main (layer 1)', l0, PAL.a], ['Sub-agents (layer 2)', l1, PAL.b]].map(([n, arr, c]) => ({ type: 'bar', name: n, x: metrics.map(m => m[0]), y: metrics.map(([, f], i) => 100 * sum(arr.map(f)) / tot[i]), marker: { color: c }, hovertemplate: n + ': %{y:.0f}%<extra></extra>' })),
      L({ barmode: 'stack', showlegend: true, legend: { y: 1.15, x: 0 }, yaxis: { title: { text: '% of total' }, range: [0, 100] } }));
    const sqSizes = groups.map(([k, arr]) => arr.length);
    const widest = Math.max(...spans);
    const read = `${b(shortT(big.title || big.id, 30))} has ${b(subs.length)} sub-agents in ${b(groups.length)} wave${groups.length === 1 ? '' : 's'} (largest ${b(Math.max(...sqSizes))}). ${widest > 10 ? `A span of ${b(widest)} is beyond the 5 to 10 a person can supervise, but only ${b(Math.max(...sets.map(p => p.st.peak)))} ran at once, so the real working span is smaller than the headline one.` : 'The span stays inside the human norm.'} Layer 2 carries ${b(pct(share(sum(l1.map(a => a.proc)), sum(A.map(a => a.proc)))))} of tokens and ${b(pct(share(sum(l1.map(a => a.work)), sum(A.map(a => a.work)))))} of work.`;
    return bcard('spans', 'Spans and layers', 'How wide and how deep the hierarchy is, who sits where, and where the money and output sit by layer. Each dot is an agent coloured by what it mostly did; a red ring means it was lost.', ['Org design', 'Span of control'],
      body0 + h4(`Org chart (${big.id}, the biggest swarm in scope)`) + orgchart + grid(h4('Span of control per session') + bars, h4('Active span over time') + active) + h4('Where spend and output sit, by layer') + econ, read);
  }

  // =============== VALUE CHAIN (flowchart over time) ===============
  function transitions(A) {
    const M = Array.from({ length: 6 }, () => Array(6).fill(0)), self = Array(6).fill(0), calls = Array(6).fill(0);
    A.forEach(a => { const ev = a.ev; ev.forEach(e => { calls[e[1]]++; }); for (let i = 1; i < ev.length; i++) { const p = ev[i - 1][1], r = ev[i][1]; if (p === r) self[r]++; else M[p][r]++; } });
    return { M, self, calls };
  }

  function processSvg(A) {
    const T = theme(), { M, self, calls } = transitions(A), total = sum(calls) || 1;
    const pos = { 0: [110, 170], 3: [290, 170], 1: [470, 170], 2: [650, 170], 4: [830, 170], 5: [560, 350] }, NW = 132, NH = 60;
    const edges = []; for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if (M[i][j]) edges.push({ i, j, n: M[i][j] });
    edges.sort((p, r) => r.n - p.n);
    const hops = sum(edges.map(e => e.n)), keep = edges.filter((e, k) => k < 12 && e.n >= Math.max(2, 0.02 * hops)), mx = keep.length ? keep[0].n : 1;
    const ord = k => ORDER.indexOf(k);
    const paths = [], labels = [];
    keep.forEach(e => {
      const [xi, yi] = pos[e.i], [xj, yj] = pos[e.j], sw = 1.2 + 9 * Math.sqrt(e.n / mx), col = PAL.bucket[e.i];
      let p0, p1, c;
      if (e.i !== 5 && e.j !== 5) {
        const fwd = ord(e.j) > ord(e.i), dx = Math.abs(xj - xi), off = Math.min(110, 30 + 0.3 * dx), sgn = fwd ? -1 : 1, dir = xj > xi ? 1 : -1;
        p0 = [xi + dir * 14, yi + sgn * NH / 2]; p1 = [xj - dir * 14, yj + sgn * (NH / 2 + 2)]; c = [(p0[0] + p1[0]) / 2, yi + sgn * (NH / 2 + off)];
      } else if (e.j === 5) { p0 = [xi, yi + NH / 2]; p1 = [pos[5][0] + (xi < pos[5][0] ? -30 : 30), pos[5][1] - NH / 2 - 2]; c = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 + 20]; }
      else { p0 = [pos[5][0] + (xj < pos[5][0] ? -14 : 14), pos[5][1] - NH / 2]; p1 = [xj + 6, yj + NH / 2 + 2]; c = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - 20]; }
      paths.push(`<path d="M${p0[0].toFixed(1)},${p0[1].toFixed(1)} Q${c[0].toFixed(1)},${c[1].toFixed(1)} ${p1[0].toFixed(1)},${p1[1].toFixed(1)}" fill="none" stroke="${col}" stroke-opacity="0.6" stroke-width="${sw.toFixed(1)}" marker-end="url(#ah)"><title>${NAMES[e.i]} to ${NAMES[e.j]}: ${e.n} hand-offs</title></path>`);
      if (e.n >= 0.12 * mx) labels.push(`<text x="${(0.25 * p0[0] + 0.5 * c[0] + 0.25 * p1[0]).toFixed(1)}" y="${(0.25 * p0[1] + 0.5 * c[1] + 0.25 * p1[1] + (c[1] < p0[1] ? -4 : 12)).toFixed(1)}" text-anchor="middle" font-size="11" fill="${T.muted}">${e.n}</text>`);
    });
    const nodes = [0, 3, 1, 2, 4, 5].map(k => {
      const [x, y] = pos[k], sub = k === 5 ? 'redo after a failure' : ['find out', '', 'make', 'check', 'run and ship', ''][k] || ['find out', 'plan and delegate', 'make', 'check', 'run and ship'][ORDER.indexOf(k)];
      return `<g><rect x="${x - NW / 2}" y="${y - NH / 2}" width="${NW}" height="${NH}" rx="12" fill="${T.panel}" stroke="${PAL.bucket[k]}" stroke-width="3"/><text x="${x}" y="${y - 8}" text-anchor="middle" font-size="14" font-weight="600" fill="${T.text}">${NAMES[k]}</text><text x="${x}" y="${y + 7}" text-anchor="middle" font-size="11" fill="${T.muted}">${sub}</text><text x="${x}" y="${y + 21}" text-anchor="middle" font-size="11" fill="${T.muted}">${calls[k].toLocaleString()} calls · stays ${pct(calls[k] ? self[k] / calls[k] : 0)}</text></g>`;
    });
    const fwd = sum(keep.filter(e => e.i !== 5 && e.j !== 5 && ord(e.j) > ord(e.i)).map(e => e.n)), back = hops - fwd;
    const top = keep.filter(e => e.i !== 5 && e.j !== 5 && ord(e.j) > ord(e.i))[0] || null;
    const svg = `<svg viewBox="0 0 940 410" width="100%" role="img" aria-label="Value chain process map: ${NAMES.join(', ')}" font-family="IBM Plex Sans, system-ui, sans-serif"><defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${T.muted}"/></marker></defs>
      <text x="14" y="22" font-size="12" fill="${T.muted}">Value chain: left to right is the intended order of work. Arrows over the top move forward, arrows underneath loop back. Thickness is how often.</text>${paths.join('')}${nodes.join('')}${labels.join('')}</svg>`;
    return { svg, hops, back, backShare: hops ? back / hops : 0, top, calls: total, motion: hops / total };
  }

  function ribbon(s) {
    const cp = compressor(s.stats.clusters), NB = 30, w = cp.T / NB, bins = Array.from({ length: NB }, () => Array(6).fill(0));
    s.agents.forEach(a => a.ev.forEach(e => { bins[Math.min(NB - 1, Math.floor(cp.f(e[0]) / w))][e[1]]++; }));
    const dom = bins.map(c => { const m = Math.max(...c); return m ? c.indexOf(m) : -1; });
    const runs = []; dom.forEach((d, i) => { const l = runs[runs.length - 1]; if (l && l.d === d) l.n++; else runs.push({ d, n: 1 }); });
    const chev = runs.map(r => { const wd = 100 * r.n / NB; return `<i class="chev" style="flex:${r.n};background:${r.d < 0 ? 'var(--line)' : PAL.bucket[r.d]}" title="${r.d < 0 ? 'idle' : NAMES[r.d]} for ${dur(r.n * w)}">${wd >= 7 && r.d >= 0 ? `<b>${NAMES[r.d]}</b><span>${dur(r.n * w)}</span>` : ''}</i>`; }).join('');
    return `<div class="ribbon" role="img" aria-label="Phases of work over time">${chev}</div>`;
  }

  function chainSection(sc, ctx) {
    const S = sc.sessions, A = sc.agents, one = S.length === 1 ? S[0] : null, T = theme();
    const pr = processSvg(A), calls = sum(A.map(a => a.calls));
    const phases = one ? ribbon(one) : S.filter(s => s.agents.some(a => a.calls)).map(s => `<div class="rrow"><span>${esc(s.id)} · ${esc(shortT(s.title, 20))}</span>${ribbon(s)}</div>`).join('');
    let stream = '', gantt = '';
    if (one) {
      const cp = compressor(one.stats.clusters), NB = 40, w = cp.T / NB, k = unit(cp.T).k;
      const bins = Array.from({ length: NB }, () => Array(6).fill(0)), done = Array(NB).fill(0);
      one.agents.forEach(a => a.ev.forEach(e => { const i = Math.min(NB - 1, Math.floor(cp.f(e[0]) / w)); bins[i][e[1]]++; if (e[1] === 1 || (e[1] === 2 && !e[2])) done[i]++; }));
      let cum = 0; const cumul = done.map(v => (cum += v));
      const xs = bins.map((_, i) => (i + 0.5) * w / k);
      stream = plot(ctx, 300, NAMES.map((n, i) => ({ type: 'scatter', mode: 'lines', name: n, x: xs, y: bins.map(r => r[i]), stackgroup: 'one', groupnorm: 'percent', line: { width: 0.5, color: PAL.bucket[i] }, fillcolor: PAL.bucket[i], hovertemplate: n + ': %{y:.0f}% of calls<extra></extra>' })).concat([{ type: 'scatter', mode: 'lines', name: 'Cumulative build actions and passing checks', x: xs, y: cumul, yaxis: 'y2', line: { color: T.text, width: 2, dash: 'dot' }, hovertemplate: '%{y} delivered so far<extra></extra>' }]),
        L({ showlegend: true, legend: { y: -0.22, x: 0 }, xaxis: { title: { text: 'working ' + unit(cp.T).n + ' (breaks over 30 min removed)' } }, yaxis: { title: { text: '% of calls in each slice' }, range: [0, 100] }, yaxis2: { overlaying: 'y', side: 'right', showgrid: false, title: { text: 'delivered so far (dotted)' }, rangemode: 'tozero' }, margin: { r: 60 } }));
      const subs = one.agents.slice(1);
      if (subs.length >= 3) {
        const rows = one.agents.filter(a => a.calls > 0).sort((p, r) => p.t0 - r.t0).slice(0, 48);
        gantt = h4('Who worked when (each bar is an agent, coloured by what it mostly did)') + plot(ctx, Math.max(240, rows.length * 13 + 60), [{ type: 'bar', orientation: 'h', y: rows.map(a => shortT(lab(a, false), 28)), x: rows.map(a => Math.max(0.002, (cp.f(a.t1) - cp.f(a.t0)) / k)), base: rows.map(a => cp.f(a.t0) / k),
          marker: { color: rows.map(a => a.layer === 0 ? T.line : PAL.bucket[a.top < 0 ? 4 : a.top]), line: { color: rows.map(a => a.status === 'ok' ? T.panel : PAL.bad), width: rows.map(a => a.status === 'ok' ? 0.5 : 2) } }, hovertemplate: '%{y}<br>starts %{base:.2f}, lasts %{x:.2f}<extra></extra>' }],
          L({ margin: { l: 190 }, yaxis: { autorange: 'reversed', tickfont: { size: 10 } }, xaxis: { title: { text: 'working ' + unit(cp.T).n } }, bargap: 0.15 }));
      }
    }
    const best = pr.top ? `${NAMES[pr.top.i]} → ${NAMES[pr.top.j]}` : 'n/a';
    const body = tiles([[num(100 * pr.motion), 'stage hand-offs per 100 calls', 'How often the next call belongs to a different stage. High = a lot of context switching.'], [pct(pr.backShare), 'of hand-offs go backwards', 'Back-flow: work returning to an earlier stage or to Rework'], [best, 'most common forward hand-off'], [pct(share(sum(A.map(a => a.ras[5])), calls)), 'of calls are rework']])
      + h4('The value chain, as actually worked') + `<div class="proc">${pr.svg}</div>` + h4(one ? 'Phases over time' : 'Phases over time, one row per session') + `<div class="phases">${phases}</div>` + (one ? h4('Stage mix over time, with cumulative output') + stream : '') + gantt;
    const mid = pr.back / (pr.hops || 1);
    return bcard('chain', 'Project value chain over time', 'The path work took from discovery to delivery. Boxes are stages, arrows are how work moved between them, and the chevrons show the order the phases actually happened in.', ['The Goal', 'The Phoenix Project'],
      body, `${b(pct(mid))} of stage changes are loops back, mostly into ${b(NAMES[(() => { const t = [0, 0, 0, 0, 0, 0]; const m = transitions(A).M; for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if (ORDER.indexOf(j) < ORDER.indexOf(i) || j === 5) t[j] += m[i][j]; return t.indexOf(Math.max(...t)); })()])}. The chain is not a pipeline: it is a loop of try, check and fix.`);
  }

  // =============== PLANNED / UNPLANNED / REWORK ===============
  function workSection(sc, ctx) {
    const S = sc.sessions, A = sc.agents, one = S.length === 1 ? S[0] : null;
    const cls = a => { let pl = 0, rw = 0, un = 0; a.ev.forEach(e => { if (e[2]) un++; else if (e[1] === 5) rw++; else pl++; }); return [pl, rw, un]; };
    const tot = A.reduce((t, a) => { const c = cls(a); return [t[0] + c[0], t[1] + c[1], t[2] + c[2]]; }, [0, 0, 0]), calls = sum(tot) || 1;
    const rows = one ? A.filter(a => a.calls >= 10).sort((p, r) => r.calls - p.calls).slice(0, 16).map(a => ({ n: shortT(lab(a, false), 32), c: cls(a) })) : S.map(s => ({ n: s.id + ' · ' + shortT(s.title, 18), c: s.agents.map(cls).reduce((t, c) => [t[0] + c[0], t[1] + c[1], t[2] + c[2]], [0, 0, 0]) })).filter(r => sum(r.c));
    const defs = [['Planned (first-time work)', PAL.good], ['Rework (redo after a failure)', PAL.b], ['Unplanned (failed calls)', PAL.bad]];
    const stack = plot(ctx, Math.max(220, rows.length * 26 + 80), defs.map(([n, c], i) => ({ type: 'bar', orientation: 'h', name: n, y: rows.map(r => r.n).reverse(), x: rows.map(r => 100 * r.c[i] / (sum(r.c) || 1)).reverse(), marker: { color: c }, hovertemplate: n + ': %{x:.0f}%<extra></extra>' })),
      L({ barmode: 'stack', showlegend: true, legend: { y: -0.22, x: 0 }, margin: { l: 210 }, xaxis: { range: [0, 100], title: { text: '% of tool calls' } } }));
    // Phoenix Project four types of work
    const four = [0, 0, 0, 0]; A.forEach(a => a.ev.forEach(e => { if (e[2] || e[1] === 5) four[3]++; else if (e[1] === 0 || e[1] === 1) four[0]++; else if (e[1] === 3 || e[1] === 4) four[1]++; else four[2]++; }));
    const fl = ['Business projects (research, build)', 'Internal projects (plan, operate)', 'Changes (verify)', 'Unplanned work (failures, redo)'];
    const donut = plot(ctx, 280, [{ type: 'pie', hole: 0.55, labels: fl, values: four, sort: false, marker: { colors: [PAL.a, PAL.mute, '#c084fc', PAL.bad], line: { color: theme().panel, width: 2 } }, textinfo: 'percent', hovertemplate: '%{label}: %{value} calls<extra></extra>' }], L({ showlegend: true, legend: { orientation: 'h', y: -0.05, x: 0 }, margin: { l: 4, r: 4, t: 4, b: 80 } }));
    // over time
    let over = '', trend = '';
    if (one) {
      const cp = compressor(one.stats.clusters), NB = 24, w = cp.T / NB, pl = Array(NB).fill(0), un = Array(NB).fill(0);
      A.forEach(a => a.ev.forEach(e => { const i = Math.min(NB - 1, Math.floor(cp.f(e[0]) / w)); if (e[2] || e[1] === 5) un[i]++; else pl[i]++; }));
      const sh = pl.map((p, i) => p + un[i] > 4 ? 100 * un[i] / (p + un[i]) : null), k = unit(cp.T).k, xs = pl.map((_, i) => (i + 0.5) * w / k);
      over = h4('Is unplanned work eating the plan as the project ages?') + plot(ctx, 250, [{ type: 'bar', name: 'Planned calls', x: xs, y: pl, marker: { color: 'rgba(52,211,153,0.55)' }, yaxis: 'y2', hovertemplate: '%{y} planned calls<extra></extra>' }, { type: 'scatter', mode: 'lines+markers', name: 'Rework + failures, % of calls', x: xs, y: sh, connectgaps: true, line: { color: PAL.bad, width: 3 }, hovertemplate: '%{y:.0f}% unplanned or redone<extra></extra>' }],
        L({ showlegend: true, legend: { y: 1.18, x: 0 }, xaxis: { title: { text: 'working ' + unit(cp.T).n } }, yaxis: { title: { text: '% unplanned or redone' }, rangemode: 'tozero' }, yaxis2: { overlaying: 'y', side: 'right', showgrid: false, title: { text: 'planned calls' }, rangemode: 'tozero' }, bargap: 0.1 }));
      const early = sum(sh.slice(0, NB / 2).filter(v => v != null)) / Math.max(1, sh.slice(0, NB / 2).filter(v => v != null).length), late = sum(sh.slice(NB / 2).filter(v => v != null)) / Math.max(1, sh.slice(NB / 2).filter(v => v != null).length);
      trend = ` The first half of the work was ${b(num(early) + '%')} unplanned or redone, the second half ${b(num(late) + '%')}.`;
    }
    const dis = sum(S.map(s => s.corr + s.interrupts + s.compactions)) + sum(A.map(a => a.apiErr));
    const body = tiles([[pct(tot[0] / calls), 'planned work', 'Calls that were first-time research, build, verify, coordination or ops'], [pct(tot[1] / calls), 'rework', 'Calls made within two calls after a failure, trying again'], [pct(tot[2] / calls), 'unplanned work', 'Calls that failed outright'], [String(dis), 'disruptions', 'Human corrections and interrupts, context compactions and API errors'], [pct((tot[1] + tot[2]) / calls), 'capacity to reserve', 'Share of effort a plan would need to hold back for unplanned work']])
      + `<div class="grid2 wide"><div>${stack}</div><div>${h4('The four types of work')}${donut}</div></div>` + over;
    return bcard('work', 'Planned work, unplanned work and rework', 'How much effort went into the plan versus into failures and doing things twice. Unplanned work is the work that starves planned work.', ['The Phoenix Project', "There's Got to Be a Better Way"],
      body, `${b(pct((tot[1] + tot[2]) / calls))} of calls were unplanned or redone, so a plan that assumes 100% capacity for planned work is wrong by about that much.${trend} Hold that share back as a buffer instead of promising it away.`);
  }

  // =============== FLOW: WIP, THROUGHPUT, CYCLE TIME ===============
  function flowBody(sets, ctx, noun) {
    const one = sets.length === 1, st = sets[0].st;
    const T = theme();
    if (one) {
      const u = unit(st.T), xs = st.x.map(v => v / u.k);
      const wip = plot(ctx, 250, [{ type: 'scatter', mode: 'lines', x: xs, y: st.y, line: { shape: 'hv', color: PAL.a, width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(111,140,255,0.2)', hovertemplate: '%{y} ' + noun + 's in progress<extra></extra>' }],
        L({ xaxis: { title: { text: 'working ' + u.n } }, yaxis: { title: { text: noun + 's in progress (WIP)' }, rangemode: 'tozero' }, shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: st.L, y1: st.L, line: { color: T.muted, width: 1, dash: 'dash' } }], annotations: [{ xref: 'paper', x: 1, y: st.L, yref: 'y', text: 'average ' + num(st.L), showarrow: false, xanchor: 'right', yanchor: 'bottom', font: { size: 11, color: T.muted } }] }));
      const xb = st.arr.map((_, i) => (i + 0.5) * st.w / u.k);
      const io = plot(ctx, 250, [{ type: 'bar', name: 'Started', x: xb, y: st.arr, marker: { color: PAL.b }, hovertemplate: '%{y} started<extra></extra>' }, { type: 'bar', name: 'Finished', x: xb, y: st.dep, marker: { color: PAL.good }, hovertemplate: '%{y} finished<extra></extra>' }],
        L({ barmode: 'group', showlegend: true, legend: { y: 1.18, x: 0 }, xaxis: { title: { text: 'working ' + u.n } }, yaxis: { title: { text: noun + 's per slice' } } }));
      const aT = st.it.map(i => i.a).sort((p, r) => p - r).map(v => v / u.k), dT = st.it.map(i => i.d).sort((p, r) => p - r).map(v => v / u.k);
      const cfd = plot(ctx, 250, [{ type: 'scatter', mode: 'lines', name: 'Finished', x: [0].concat(dT), y: [0].concat(dT.map((_, i) => i + 1)), line: { shape: 'hv', color: PAL.good, width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(52,211,153,0.35)', hovertemplate: '%{y} finished<extra></extra>' },
        { type: 'scatter', mode: 'lines', name: 'Started', x: [0].concat(aT), y: [0].concat(aT.map((_, i) => i + 1)), line: { shape: 'hv', color: PAL.b, width: 2 }, fill: 'tonexty', fillcolor: 'rgba(240,180,41,0.3)', hovertemplate: '%{y} started<extra></extra>' }],
        L({ showlegend: true, legend: { y: 1.18, x: 0 }, xaxis: { title: { text: 'working ' + u.n } }, yaxis: { title: { text: 'cumulative ' + noun + 's' } } }));
      const sc = st.NB >= 8 ? plot(ctx, 250, [{ type: 'scatter', mode: 'markers', x: st.wipBin, y: st.dep.map(d => d / (st.w / 3600)), marker: { color: PAL.a, size: 10, opacity: 0.75 }, hovertemplate: 'average WIP %{x:.1f}<br>%{y:.1f} finished per hour<extra></extra>' }],
        L({ xaxis: { title: { text: 'average WIP in the slice' }, rangemode: 'tozero' }, yaxis: { title: { text: 'throughput (finished per hour)' }, rangemode: 'tozero' } })) : na('Too few items for a WIP-versus-throughput scatter.');
      return tiles([[num(st.L), 'average WIP', 'Items in progress, averaged over working time'], [String(st.peak), 'peak WIP'], [num(st.lam * 3600) + '/h', 'throughput', 'Items finished per working hour'], [dur(st.W), 'average cycle time', 'Start to finish of one item'], [String(st.batch), 'largest batch started at once', 'Most items started within one minute: batching instead of pulling'], [pct(st.serial), 'of the time with nothing in flight']])
        + `<p class="sub">Little's Law ties these together: average WIP (${num(st.L)}) equals throughput (${num(st.lam * 3600)}/h) times cycle time (${dur(st.W)}). Halve WIP at the same throughput and cycle time halves.</p>` + grid(h4('Work in progress over time') + wip, h4('Started and finished per slice') + io) + grid(h4('Cumulative flow: the gap is WIP') + cfd, h4('Does more WIP buy more throughput?') + sc);
    }
    // multi: overlay
    const colors = [PAL.a, PAL.b, PAL.good, '#c084fc', PAL.bad, PAL.mute, '#2aa7ae', '#f472b6'];
    const wip = plot(ctx, 270, sets.map((p, i) => ({ type: 'scatter', mode: 'lines', name: p.name, x: p.st.x.map(v => 100 * v / p.st.T), y: p.st.y, line: { shape: 'hv', color: colors[i % 8], width: 2 }, hovertemplate: p.name + ': %{y} in progress<extra></extra>' })),
      L({ showlegend: true, legend: { y: 1.2, x: 0 }, xaxis: { title: { text: '% of working time' } }, yaxis: { title: { text: noun + 's in progress (WIP)' }, rangemode: 'tozero' } }));
    const box = plot(ctx, 270, sets.map((p, i) => ({ type: 'box', name: p.name, y: p.st.cycle.map(v => v / 60), marker: { color: colors[i % 8] }, boxpoints: false, hovertemplate: '%{y:.1f} min<extra></extra>' })),
      L({ yaxis: { type: 'log', title: { text: 'cycle time (minutes, log)' } }, margin: { b: 70 } }));
    const rows = sets.map(p => `<tr><td>${esc(p.name)}</td><td>${p.st.n}</td><td>${p.st.peak}</td><td>${num(p.st.L)}</td><td>${num(p.st.lam * 3600)}/h</td><td>${dur(q(p.st.cycle, 0.5))}</td><td>${dur(q(p.st.cycle, 0.9))}</td><td>${num(p.st.cv)}</td></tr>`).join('');
    return tiles([[String(sum(sets.map(p => p.st.n))), noun + 's across ' + sets.length + ' sessions'], [num(median(sets.map(p => p.st.L))), 'median average WIP'], [num(median(sets.map(p => p.st.lam * 3600))) + '/h', 'median throughput'], [dur(median(sets.map(p => p.st.W))), 'median cycle time']])
      + grid(h4('WIP over normalised time') + wip, h4('Cycle time per session') + box) + `<div class="scroll"><table class="m"><thead><tr><th>Session</th><th>Items</th><th>Peak WIP</th><th>Avg WIP</th><th>Throughput</th><th>Median cycle</th><th>p90 cycle</th><th>CV</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function flowSections(sets, ctx, noun, what) {
    const good = sets.filter(p => p.st.n >= 4);
    if (!good.length) return [bcard('flow', 'Flow: WIP, throughput and cycle time', 'Work in progress against work finished.', ['Factory Physics', 'The Phoenix Project'], na('Fewer than four work items in this scope, so no flow measures.'), ''),
      bcard('variability', 'Variability, utilisation and capacity buffer', 'What makes cycle time swing.', ['Factory Physics'], na('Needs at least four work items.'), '')];
    const one = good.length === 1, st = good[0].st, all = good.flatMap(p => p.st.cycle);
    const flowCard = bcard('flow', 'Flow: WIP, throughput and cycle time', `Optimise the whole stream, not any one agent's busyness. A work item here is a ${what}. WIP is how many are open at once, throughput how many finish, cycle time how long one takes.`, ['Factory Physics', 'The Phoenix Project', "There's Got to Be a Better Way"],
      flowBody(good, ctx, noun), one ? `Average WIP was ${b(num(st.L))} with a peak of ${b(st.peak)}, and ${b(num(st.lam * 3600))} items finished per hour. The largest batch started at once was ${b(st.batch)}: work is ${st.batch >= 5 ? 'pushed in bursts' : 'pulled one at a time'}, not smoothly pulled when capacity frees up.` : `Median average WIP is ${b(num(median(good.map(p => p.st.L))))} items; throughput and cycle time differ widely between sessions, so see the table.`);

    // variability
    const mn = Math.max(1, Math.min(...all)), mxv = Math.max(...all, mn * 2), nb = 12, lo = Math.log10(mn), hi = Math.log10(mxv), edges = Array.from({ length: nb + 1 }, (_, i) => Math.pow(10, lo + (hi - lo) * i / nb));
    const counts = Array(nb).fill(0); all.forEach(v => { let i = 0; while (i < nb - 1 && v >= edges[i + 1]) i++; counts[i]++; });
    const lbl = i => dur(edges[i]) + ' to ' + dur(edges[i + 1]);
    const hist = plot(ctx, 260, [{ type: 'bar', x: counts.map((_, i) => lbl(i)), y: counts, marker: { color: PAL.a }, hovertemplate: '%{x}: %{y} items<extra></extra>' }],
      L({ xaxis: { type: 'category', title: { text: 'cycle time (log-spaced bins)' }, tickangle: -35 }, yaxis: { title: { text: noun + 's' } }, margin: { b: 80 } }));
    const withN = good.flatMap(p => p.st.it.filter(i => i.n)), size = withN.length >= 6 ? plot(ctx, 260, [{ type: 'scatter', mode: 'markers', x: withN.map(i => i.n), y: withN.map(i => (i.d - i.a) / 60), text: withN.map(i => shortT(i.label, 40)), marker: { color: withN.map(i => i.ok ? PAL.a : PAL.bad), size: 9, opacity: 0.7 }, hovertemplate: '%{text}<br>%{x} calls, %{y:.1f} min<extra></extra>' }],
      L({ xaxis: { type: 'log', title: { text: 'size of the item (tool calls, log)' } }, yaxis: { type: 'log', title: { text: 'cycle time (minutes, log)' } } })) : na('Item sizes unavailable.');
    const p50 = q(all, 0.5), p90 = q(all, 0.9), cv = std(all) / (sum(all) / all.length || 1);
    const failShare = share(good.flatMap(p => p.st.it).filter(i => !i.ok).length, good.flatMap(p => p.st.it).length);
    const varCard = bcard('variability', 'Variability, utilisation and the capacity buffer', 'Variation in how long items take is what makes the whole stream slow and unpredictable. Smooth the sizes, hold spare capacity, and the queue stops growing.', ['Factory Physics', 'The Goal', 'The Phoenix Project'],
      tiles([[dur(p50), 'median cycle time'], [dur(p90), 'p90 cycle time'], [num(p90 / (p50 || 1)) + 'x', 'p90 over median', 'The long tail: how much slower the slow items are'], [num(cv), 'coefficient of variation', 'Standard deviation divided by the mean. Above 1 is highly variable.'], [pct(failShare), 'items that never finished']])
      + grid(h4('Cycle time distribution') + hist, h4('Is it size? Item size vs cycle time') + size) + (sets._extra || ''),
      `Cycle time is ${cv > 1 ? 'highly' : 'moderately'} variable (CV ${b(num(cv))}): the slowest tenth take ${b(num(p90 / (p50 || 1)) + 'x')} the median. The tail, not the average, sets when the project is done.`);
    return [flowCard, varCard];
  }

  // =============== DEEP-DIVE FLOW SECTIONS ===============
  function deepFlow(sc, ctx) {
    const S = sc.sessions, A = sc.agents, T = theme(), out = [];
    out.push(chainSection(sc, ctx));
    out.push(workSection(sc, ctx));

    // flow + variability from items
    const sets = S.map(s => { const it = itemsOf(s); return { name: s.id + ' · ' + shortT(s.title, 16), kind: it.kind, st: flowStats(it.items, compressor(s.stats.clusters)), sw: it.kind === 'sub-agent task' && it.items.length ? flowStats(it.items, cpOf(it.items)) : null, s }; });
    const kinds = [...new Set(sets.filter(p => p.st.n >= 4).map(p => p.kind))];
    const noun = kinds.length === 1 ? kinds[0] : 'work item';
    const what = kinds.length === 1 ? (kinds[0] === 'sub-agent task' ? 'task handed to a sub-agent' : 'burst of activity between pauses of two minutes or more') : 'task handed to a sub-agent (swarms) or a burst of activity (single-agent sessions)';
    // utilisation vs queueing wait (Factory Physics): where each agent sits on u/(1-u)
    const ag = A.filter(a => a.dur > 300 && a.calls > 20);
    const utils = ag.map(a => Math.max(0, Math.min(0.995, 1 - a.idle / a.dur)));
    const xs = Array.from({ length: 96 }, (_, i) => i / 100), curve = plot(ctx, 280, [{ type: 'scatter', mode: 'lines', name: 'relative wait = u / (1 - u)', x: xs.map(v => 100 * v), y: xs.map(v => v / (1 - v)), line: { color: PAL.mute, width: 2 }, hoverinfo: 'skip' },
      { type: 'scatter', mode: 'markers', name: 'agents', x: utils.map(u => 100 * u), y: utils.map(u => Math.min(60, u / (1 - u))), text: ag.map(a => shortT(lab(a, S.length > 1), 40)), marker: { size: 9, color: ag.map(a => a.layer === 0 ? PAL.a : PAL.b), opacity: 0.8 }, hovertemplate: '%{text}<br>busy %{x:.0f}% of its life<extra></extra>' }],
      L({ showlegend: true, legend: { y: 1.18, x: 0 }, xaxis: { title: { text: 'utilisation: % of an agent\'s life not idle' }, range: [0, 100] }, yaxis: { title: { text: 'queue wait, in service times' }, range: [0, 40] }, shapes: [{ type: 'rect', xref: 'x', yref: 'paper', x0: 70, x1: 85, y0: 0, y1: 1, fillcolor: 'rgba(52,211,153,0.14)', line: { width: 0 }, layer: 'below' }] }));
    const fl = flowSections(sets.filter(p => p.st.n >= 1).map(p => ({ name: p.name, st: p.st })), ctx, noun, what);
    const mains = A.filter(a => a.layer === 0 && a.dur > 300), mainIdle = mains.length ? share(sum(mains.map(a => a.idle)), sum(mains.map(a => a.dur))) : null;
    const subsA = A.filter(a => a.layer > 0 && a.dur > 60), subBusy = subsA.length ? 1 - share(sum(subsA.map(a => a.idle)), sum(subsA.map(a => a.dur))) : null;
    const util = `<h4>Utilisation against waiting</h4><p class="sub">The curve is the textbook queueing result: waiting explodes above about 85% utilisation. Dots are the agents, placed by how much of their life was not idle.</p>${curve}`;
    fl[1] = fl[1].replace('</section>', `${util}<p class="read">${mainIdle != null ? `Main sessions were idle ${b(pct(mainIdle))} of their lives (mostly waiting for a person), so agent capacity is rarely the limit: ` : ''}${subBusy != null ? `sub-agents ran ${b(pct(subBusy))} busy while alive, but they are spawned on demand so they never queue. ` : ''}The scarce resource is attention and approvals, not compute. That idle share is your capacity buffer.</p></section>`);
    out.push(...fl);
    out.push(constraintSection(sc, ctx, sets));
    out.push(wasteSection(sc, ctx));
    out.push(bsSection(sc, ctx));
    out.push(readingSection());
    return out;
  }

  // =============== CONSTRAINTS (Theory of Constraints) ===============
  function constraintSection(sc, ctx, sets) {
    const S = sc.sessions, A = sc.agents, T = theme();
    const sec = [0, 0, 0, 0, 0, 0], n = [0, 0, 0, 0, 0, 0];
    A.forEach(a => { for (let i = 1; i < a.ev.length; i++) { const g = a.ev[i][0] - a.ev[i - 1][0]; if (g > 0 && g <= 1800) { sec[a.ev[i][1]] += g; n[a.ev[i][1]]++; } } });
    const secT = sum(sec) || 1, nT = sum(n) || 1;
    const ratio = sec.map((v, i) => n[i] ? v / n[i] : 0), cons = ratio.indexOf(Math.max(...ratio)), perCall = secT / nT;
    const bars = plot(ctx, 270, [{ type: 'bar', name: 'Share of clock time', x: NAMES, y: sec.map(v => 100 * v / secT), marker: { color: PAL.b }, hovertemplate: '%{x}: %{y:.0f}% of clock time<extra></extra>' }, { type: 'bar', name: 'Share of calls', x: NAMES, y: n.map(v => 100 * v / nT), marker: { color: PAL.a }, hovertemplate: '%{x}: %{y:.0f}% of calls<extra></extra>' }],
      L({ barmode: 'group', showlegend: true, legend: { y: 1.18, x: 0 }, yaxis: { title: { text: '% of total' } } }));
    const swarmSets = sets.filter(p => p.sw).map(p => Object.assign({}, p, { st: p.sw, full: p.st }));
    const buckets = [['Main alone', 0, 0], ['1 to 5 helpers', 1, 5], ['6 to 10 helpers', 6, 10], ['More than 10', 11, 1e9]];
    const par = swarmSets.length ? plot(ctx, 260, buckets.map(([nm, lo, hi], i) => ({ type: 'bar', name: nm, orientation: 'h', y: swarmSets.map(p => p.name), x: swarmSets.map(p => { const st = p.st; let t = 0; for (let k = 0; k < st.x.length - 1; k++) { const w = st.y[k]; if (w >= lo && w <= hi) t += st.x[k + 1] - st.x[k]; } return 100 * t / st.T; }), marker: { color: ['#94a3b8', PAL.a, PAL.good, PAL.b][i] }, hovertemplate: nm + ': %{x:.0f}% of working time<extra></extra>' })),
      L({ barmode: 'stack', showlegend: true, legend: { y: -0.35, x: 0 }, margin: { l: 150 }, xaxis: { range: [0, 100], title: { text: '% of working time' } } })) : na('No swarm in this scope to profile.');
    const serial = swarmSets.length ? median(swarmSets.map(p => p.st.serial)) : null;
    const cu = sum(A.map(a => a.cu)), work = sum(A.map(a => a.work)), inv = sum(A.filter(a => a.status !== 'ok').map(a => a.cu)), pctInv = share(inv, cu);
    const body = tiles([[NAMES[cons], 'the constraint (slowest stage per call)', `${NAMES[cons]} calls took ${num(ratio[cons])}s of clock time each, against ${num(perCall)}s for the average call`], [num(ratio[cons] / perCall) + 'x', 'its time per call vs average'], [serial != null ? pct(serial) : 'n/a', 'of swarm time with no helper running', 'While helpers were engaged, the share of time only the orchestrator was working: the serial part'], [swarmSets.length ? pct(median(swarmSets.map(p => p.st.T / p.full.T))) : 'n/a', 'of session time the swarm was engaged', 'Helpers ran in short bursts inside a much longer session'], [serial ? num(1 / serial) + 'x' : 'n/a', 'ceiling on speed-up from more helpers', 'Amdahl: if a fraction s of the work is serial, speed-up can never exceed 1/s'],
      [String(work), 'throughput (T): work units delivered', 'Goldratt\'s throughput: units of output, not activity'], [num(cu), 'operating expense (OE): cost units', 'About US$ at list price: 1 cost unit is a Haiku-priced million input tokens, scaled by level'], [pct(pctInv), 'inventory (I): spend that delivered nothing', 'Cost units spent by agents that were lost or cut off, i.e. money tied up in unfinished work']])
      + grid(h4('Where the clock time goes, by stage') + bars, h4('How much of the swarm ran in parallel') + par)
      + `<div class="steps"><h4>The five focusing steps, applied</h4><ol><li><b>Identify</b> the constraint: ${esc(NAMES[cons])} (${num(ratio[cons])}s per call against ${num(perCall)}s on average).</li><li><b>Exploit</b> it: keep that stage supplied with ready work so it never waits, and strip anything from it that is not essential.</li><li><b>Subordinate</b> everything else: cap WIP so other stages only feed the constraint at the rate it can absorb${serial ? `; with ${pct(serial)} of swarm time serial, more helpers will not help unless the orchestrator's share shrinks` : ''}.</li><li><b>Elevate</b> it: only now add capacity, a faster check, a stronger model, or a second reviewer.</li><li><b>Repeat</b>: once it moves, the constraint moves elsewhere.</li></ol></div>`;
    return bcard('constraint', 'Constraints and bottlenecks', 'Map the value chain and find the stage that sets the pace. Throughput accounting: throughput (T), inventory (I) and operating expense (OE).', ['The Goal', 'Theory of Constraints', 'Factory Physics'],
      body, `${b(NAMES[cons])} is the slowest stage per call, ${b(num(ratio[cons] / perCall) + 'x')} the average, so that is where a fix pays off first.${serial ? ` The orchestrator works alone for ${b(pct(serial))} of swarm time, which caps the benefit of adding helpers at about ${b(num(1 / serial) + 'x')}.` : ''} Local efficiency elsewhere does not move the finish line.`);
  }

  // =============== EIGHT WASTES ===============
  function wasteSection(sc, ctx) {
    const S = sc.sessions, A = sc.agents, T = theme(), graded = A.filter(a => a.calls > 0), calls = sum(A.map(a => a.calls)) || 1;
    // 1 defects
    const defects = sum(A.map(a => a.errs)) / calls;
    // 2 unproven output: build actions after the last passing check
    let builds = 0, unproven = 0;
    A.forEach(a => { let lastPass = -1; a.ev.forEach((e, i) => { if (e[1] === 2 && !e[2]) lastPass = i; }); a.ev.forEach((e, i) => { if (e[1] === 1) { builds++; if (i > lastPass) unproven++; } }); });
    // 3 waiting
    let wait = 0, att = 0; A.forEach(a => { for (let i = 1; i < a.ev.length; i++) { const g = a.ev[i][0] - a.ev[i - 1][0]; if (g > 0 && g <= 1800) { att += g; if (g > 120) wait += g; } } });
    // 4 non-utilised talent
    const over = graded.filter(a => a.lvl - a.implied >= 2), cuAll = sum(graded.map(a => a.cu)) || 1, talent = sum(over.map(a => a.cu * (1 - B.RATE[a.implied] / B.RATE[a.lvl]))) / cuAll;
    // 5 transportation
    const transport = sum(A.map(a => a.coord)) / calls;
    // 6 inventory
    const inventory = sum(A.filter(a => a.status !== 'ok').map(a => a.cu)) / (sum(A.map(a => a.cu)) || 1);
    // 7 motion
    const tr = transitions(A), motion = sum(tr.M.map(r => sum(r))) / calls;
    // 8 extra processing
    const extra = sum(A.map(a => a.ras[5])) / calls;
    const rows = [
      ['Defects', defects, 'Failed calls', 'Rework, scrap and warranty claims', pct(defects) + ' of calls failed'],
      ['Overproduction', builds ? unproven / builds : 0, 'Build actions never followed by a passing check', 'Building ahead of demand, unproven output', unproven + ' of ' + builds + ' edits and writes unproven'],
      ['Waiting', att ? wait / att : 0, 'Time in pauses over 2 minutes (a person to answer, a long job to finish), of time attributable to work', 'Idle time between steps', dur(wait) + ' of ' + dur(att)],
      ['Non-utilised talent', talent, 'Spend that goes on a model tier above what the work needs', 'Senior people doing junior work', over.length + ' agents over-levelled'],
      ['Transportation', transport, 'Coordination calls: delegating, polling, handing off', 'Moving material between stations', sum(A.map(a => a.coord)) + ' coordination calls'],
      ['Inventory', inventory, 'Spend by agents that were lost or cut off before finishing', 'Half-finished work sitting around', A.filter(a => a.status !== 'ok').length + ' agents lost'],
      ['Motion', motion, 'Stage hops per call: switching between kinds of work', 'Walking around, searching for tools', num(100 * motion) + ' stage hops per 100 calls'],
      ['Extra processing', extra, 'Calls spent redoing earlier work', 'Polishing beyond what the customer values', sum(A.map(a => a.ras[5])) + ' redo calls']];
    const bar = plot(ctx, 330, [{ type: 'bar', orientation: 'h', y: rows.map(r => r[0]).reverse(), x: rows.map(r => 100 * r[1]).reverse(), marker: { color: rows.map(r => r[1] > 0.5 ? PAL.bad : r[1] > 0.2 ? PAL.b : PAL.good).reverse() }, text: rows.map(r => Math.round(100 * r[1]) + '%').reverse(), textposition: 'outside', cliponaxis: false, hovertemplate: '%{y}: %{x:.0f}%<extra></extra>' }],
      L({ margin: { l: 130, r: 40 }, xaxis: { range: [0, 105], title: { text: 'share of the relevant base (calls, spend or time)' } } }));
    const worst = rows.slice().sort((p, r) => r[1] - p[1])[0];
    const tbl = `<div class="scroll"><table class="m wastes"><thead><tr><th>Waste</th><th>In a factory</th><th>How it is measured here</th><th>Result</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td class="txt">${esc(r[3])}</td><td class="txt">${esc(r[2])}</td><td class="txt">${esc(r[4])}</td></tr>`).join('')}</tbody></table></div>`;
    const loud = rows.filter(r => r[1] > 0.5).map(r => r[0]);
    return bcard('waste', 'The eight wastes (muda)', 'Lean manufacturing\'s eight kinds of waste, measured on agent work. Defects, Overproduction, Waiting, Non-utilised talent, Transportation, Inventory, Motion, Extra processing (DOWNTIME).', ['Lean manufacturing', 'The Goal'],
      tiles([[worst[0], 'largest waste'], [pct(worst[1]), 'of its base'], [String(rows.filter(r => r[1] > 0.2).length), 'of 8 wastes above 20%']]) + bar + tbl,
      `${b(worst[0])} is the biggest waste at ${b(pct(worst[1]))}.${loud.length ? ` ${loud.length > 1 ? 'These' : 'This'} (${esc(loud.join(', '))}) ${loud.length > 1 ? 'are' : 'is'} above half of its base.` : ''} Several of these are measured loosely, so use them to rank where to look, not as exact percentages.`);
  }

  // =============== BULLSHIT JOBS AUDIT ===============
  function bsSection(sc, ctx) {
    const A = sc.agents.filter(a => a.calls > 0 || a.turns > 0), S = sc.sessions, multi = S.length > 1;
    const classify = a => {
      if (a.status !== 'ok' || a.work === 0) return 'Ghost';
      if ((a.errs + a.ras[5]) / (a.calls || 1) >= 0.25) return 'Duct taper';
      if (a.layer > 0 && ['Verifier', 'Reviewer', 'Tester'].includes(a.role) && a.edits + a.writes + a.commits === 0 && a.errs === 0) return 'Box ticker';
      if (a.delegations >= 3 && a.ras[1] / (a.calls || 1) < 0.1) return 'Taskmaster';
      if (a.polls >= 5 && a.polls / (a.calls || 1) >= 0.4) return 'Flunky';
      return 'Load-bearing';
    };
    const kinds = ['Load-bearing', 'Ghost', 'Duct taper', 'Box ticker', 'Taskmaster', 'Flunky'];
    const desc = { 'Load-bearing': 'Delivered something the project kept.', Ghost: 'Paid, but lost or delivered no output at all.', 'Duct taper': 'A quarter or more of its calls were failures or redoing earlier work: patching problems that should not exist.', 'Box ticker': 'Verifier, reviewer or tester that changed nothing and hit no errors. Whether its sign-off mattered cannot be seen in a log, so it is flagged, not condemned.', Taskmaster: 'Delegates but builds almost nothing itself.', Flunky: 'Mostly polling the status of other agents.' };
    const grp = {}; kinds.forEach(k => { grp[k] = []; }); A.forEach(a => grp[classify(a)].push(a));
    const cuT = sum(A.map(a => a.cu)) || 1, tokT = sum(A.map(a => a.proc)) || 1;
    const bars = plot(ctx, 280, [{ type: 'bar', name: 'Share of agents', y: kinds, x: kinds.map(k => 100 * grp[k].length / A.length), orientation: 'h', marker: { color: PAL.a }, hovertemplate: '%{y}: %{x:.0f}% of agents<extra></extra>' }, { type: 'bar', name: 'Share of spend', y: kinds, x: kinds.map(k => 100 * sum(grp[k].map(a => a.cu)) / cuT), orientation: 'h', marker: { color: PAL.b }, hovertemplate: '%{y}: %{x:.0f}% of spend<extra></extra>' }],
      L({ barmode: 'group', showlegend: true, legend: { y: 1.12, x: 0 }, margin: { l: 110 }, yaxis: { autorange: 'reversed' }, xaxis: { range: [0, 100], title: { text: '%' } } }));
    const tbl = `<div class="scroll"><table class="m wastes"><thead><tr><th>Type</th><th>Agents</th><th>Spend</th><th>Meaning</th></tr></thead><tbody>${kinds.map(k => `<tr><td>${esc(k)}</td><td>${grp[k].length}</td><td>${pct(sum(grp[k].map(a => a.cu)) / cuT)}</td><td class="txt">${esc(desc[k])}</td></tr>`).join('')}</tbody></table></div>`;
    const tick = grp['Box ticker'], bad = A.filter(a => !['Load-bearing', 'Box ticker'].includes(classify(a))), badCu = sum(bad.map(a => a.cu)) / cuT;
    const ex = bad.sort((p, r) => r.cu - p.cu).slice(0, 5).map(a => `${shortT(lab(a, multi), 36)} (${classify(a)})`);
    return bcard('bsjobs', 'The bullshit-jobs audit', 'Graeber asked whether a role would be missed if it vanished. Here that is measured by output: every agent is sorted into load-bearing work or one of the empty-role types.', ['Bullshit Jobs'],
      tiles([[pct(grp['Load-bearing'].length / (A.length || 1)), 'of agents are load-bearing'], [pct(badCu), 'of spend on clearly empty roles', 'Ghosts, duct tapers, taskmasters and flunkies'], [String(grp.Ghost.length), 'ghosts: paid, delivered nothing'], [String(tick.length), 'sign-off-only agents', 'Reviewers and verifiers that changed nothing and hit no errors'], [pct(sum(tick.map(a => a.cu)) / cuT), 'of spend on sign-off-only agents']]) + bars + tbl,
      `${b(bad.length)} of ${b(A.length)} agents (${b(pct(badCu))} of spend) held clearly empty roles: lost before delivering, or busy patching failures.${tick.length ? ` Another ${b(tick.length)} only signed off (${b(pct(sum(tick.map(a => a.cu)) / cuT))} of spend), which is cheap, but a sign-off that never changes anything is worth a question.` : ''}${ex.length ? ' Costliest: ' + esc(ex.slice(0, 3).join('; ')) + '.' : ''} This is an output test, not a judgement.`);
  }

  function readingSection() {
    const rows = [['The Phoenix Project (Gene Kim)', 'Four types of work, unplanned work, WIP limits, flow of value', 'Planned, unplanned and rework; Flow; Value chain'], ['The Goal (Eliyahu Goldratt)', 'Constraints, throughput, inventory and operating expense, five focusing steps', 'Constraints; Value chain'], ['Factory Physics for Managers', 'Little\'s Law, variability, utilisation versus waiting, buffers', 'Flow; Variability'], ["There's Got to Be a Better Way (Repenning, Kieffer)", 'Flow of work through the whole system; limit work in progress; stop firefighting', 'Planned, unplanned and rework; Flow'], ['Bullshit Jobs (David Graeber)', 'Roles that would not be missed: flunkies, duct tapers, box tickers, taskmasters', 'Bullshit-jobs audit'], ['Theory of Constraints', 'Identify, exploit, subordinate, elevate, repeat', 'Constraints'], ['Lean manufacturing: the eight wastes', 'Defects, overproduction, waiting, non-utilised talent, transportation, inventory, motion, extra processing', 'Eight wastes']];
    return bcard('reading', 'Where these ideas come from', 'The reading list behind the last seven sections, and where each idea shows up.', ['Reading list'],
      `<div class="scroll"><table class="m wastes"><thead><tr><th>Source</th><th>Idea used</th><th>Where on this page</th></tr></thead><tbody>${rows.map(r => `<tr><td class="txt">${esc(r[0])}</td><td class="txt">${esc(r[1])}</td><td class="txt">${esc(r[2])}</td></tr>`).join('')}</tbody></table></div>`, '');
  }

  // =============== GENERIC ITEM FLOW (fleet and production lenses) ===============
  function itemFlow(sets, ctx, noun, what) { return flowSections(sets.map(s => ({ name: s.name, st: flowStats(s.items, cpOf(s.items)) })), ctx, noun, what); }

  window.SWW = { deepFlow, spansCard, itemFlow, renumber, bcard, flowStats, cpOf, readingSection, itemsOf };
})();
