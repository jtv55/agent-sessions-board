// Chart + section builders for the Public swarms tab. Each section returns {html, draws[]}; draws run after the DOM is in place.
(() => {
  'use strict';
  const B = window.SWB;
  const { sum, median, share } = B;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const PAL = {
    bucket: ['#6f8cff', '#34d399', '#f0b429', '#c084fc', '#94a3b8', '#f87171'],
    level: ['#8de0cf', '#4fc9bd', '#2aa7ae', '#237f9c', '#2a5686'],
    a: '#6f8cff', b: '#f0b429', good: '#34d399', bad: '#f87171', mute: '#94a3b8',
  };
  const tok = n => n == null ? 'n/a' : n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(Math.round(n));
  const pct = x => x == null || isNaN(x) ? 'n/a' : Math.round(100 * x) + '%';
  const dur = s => s == null ? 'n/a' : s < 90 ? Math.round(s) + 's' : s < 5400 ? Math.round(s / 60) + 'm' : s < 172800 ? (s / 3600).toFixed(1) + 'h' : (s / 86400).toFixed(1) + 'd';
  const num = n => n == null ? 'n/a' : Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : (Math.round(n * 10) / 10).toString();
  const money = n => n == null ? 'n/a' : '$' + (n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(2));

  function theme() { return { text: css('--text') || '#e8eaf0', muted: css('--muted') || '#9aa3b2', line: css('--line') || '#262b36', panel: css('--panel') || '#171a21', accent: css('--accent') || '#7c9cff' }; }
  function merge(a, b) { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else a[k] = b[k]; } return a; }
  function L(extra) {
    const t = theme();
    const ax = () => ({ gridcolor: t.line, zerolinecolor: t.line, linecolor: t.line, tickcolor: t.line, automargin: true, title: { font: { size: 12, color: t.muted } } });
    return merge({
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: { family: 'IBM Plex Sans, system-ui, sans-serif', color: t.text, size: 12 },
      margin: { l: 56, r: 14, t: 10, b: 44 }, xaxis: ax(), yaxis: ax(), hoverlabel: { font: { family: 'IBM Plex Sans, system-ui', size: 12 } },
      legend: { orientation: 'h', y: -0.18, font: { size: 12 } }, showlegend: false,
    }, extra || {});
  }
  const CFG = { displayModeBar: false, responsive: true };

  let uid = 0;
  function Ctx() { return { draws: [] }; }
  // On phones: legends go under the plot instead of floating into it, and long left margins and tick labels shrink.
  function fitNarrow(layout, w, data, el) {
    if (w >= 560) return layout;
    const o = Object.assign({}, layout), m = Object.assign({}, o.margin || {});
    if (o.showlegend) {
      const n = (data || []).filter(d => d.name).length || 1, rows = Math.max(1, Math.ceil(n * 100 / w)), extra = rows * 20 + 12;
      o.legend = Object.assign({}, o.legend, { orientation: 'h', x: 0, y: 0, yref: 'container', yanchor: 'bottom', font: { size: 11 } });
      m.b = Math.max(m.b || 44, 52) + extra; if (el) el.style.height = (el.clientHeight + extra) + 'px';
    }
    if (m.l > 0.4 * w) m.l = Math.round(0.4 * w);
    o.margin = m;
    ['xaxis', 'yaxis'].forEach(k => { if (o[k] && o[k].tickfont == null || !o[k]) o[k] = Object.assign({}, o[k], { tickfont: { size: 10 } }); });
    return o;
  }
  function plot(ctx, h, data, layout, cfg) {
    const id = 'swp' + (++uid);
    ctx.draws.push(() => { const el = document.getElementById(id); window.Plotly.newPlot(id, data, fitNarrow(layout || {}, el ? el.clientWidth : 999, data, el), cfg || CFG); });
    return `<div class="plot" id="${id}" style="height:${h}px" role="img"></div>`;
  }
  const tile = (v, l, t) => `<div class="tile"${t ? ` title="${esc(t)}"` : ''}><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
  const tiles = arr => `<div class="tiles">${arr.filter(Boolean).map(x => tile(...x)).join('')}</div>`;
  const na = msg => `<p class="na">${esc(msg)}</p>`;
  function card(id, n, title, measures, body, read) {
    return `<section class="swc" id="sw-${id}"><header><h3><span class="n">${n}</span>${esc(title)}</h3><p class="sub">${esc(measures)}</p></header>${body}${read ? `<p class="read">${read}</p>` : ''}</section>`;
  }
  const b = s => `<b>${esc(s)}</b>`;
  const lab = (a, multi) => (multi ? a.sid + ' · ' : '') + (a.layer === 0 ? 'Main' : 'Sub ' + a.id.slice(1)) + ' · ' + a.role;
  const lvlName = l => B.LEVELS[l];
  const shortT = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  function compressor(clusters) {
    let T = 0; const off = clusters.map(c => { const o = T; T += c[1] - c[0]; return o; });
    return { T, f: x => { let i = clusters.length - 1; while (i > 0 && x < clusters[i][0]) i--; return off[i] + Math.min(Math.max(x - clusters[i][0], 0), clusters[i][1] - clusters[i][0]); } };
  }

  // ---------- T&E: what an agent pays to leave its sandbox ----------
  const sizeOf = n => B.unitOf(n).name.toLowerCase();
  const TE_CATS = ['Web search', 'Web fetch', 'Browser automation', 'SaaS / MCP connector', 'Network shell'];
  const SEARCH_FEE = 0.01;   // Anthropic web search list price: $10 per 1,000 searches
  const teCat = n => n === 'WebSearch' ? TE_CATS[0] : n === 'WebFetch' ? TE_CATS[1] : /^mcp__(claude-in-chrome|playwright|puppeteer|browser)/.test(n) ? TE_CATS[2] : String(n).startsWith('mcp__') ? TE_CATS[3] : TE_CATS[4];
  const toolCat = n => /^(Read|Grep|Glob|LS|NotebookRead)$/.test(n) ? 'Look' : /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(n) ? 'Change' : /^(Bash|PowerShell)$/.test(n) ? 'Shell' : /^Web/.test(n) ? 'Web' : n.startsWith('mcp__') ? 'MCP connectors' : /^(Task|Agent|Workflow|TaskOutput|TaskCreate|TaskUpdate|TodoWrite|SendMessage|ScheduleWakeup|AskUserQuestion|ToolSearch|Skill|StructuredOutput|SendUserFile)/.test(n) ? 'Management' : 'Other';
  function teAnalysis(A) {
    const calls = [], seats = new Set();
    A.forEach(a => (a.extCalls || []).forEach(([t, name, chars]) => {
      const cat = teCat(name);
      let tokens = chars / 4; if (cat === TE_CATS[2]) tokens = Math.min(tokens, 2500);   // screenshots arrive as base64; an image costs about 1.6K tokens
      const rate = B.RATE[a.lvl] || 3, rem = a.turns * Math.max(0, 1 - (t - a.t0) / Math.max(1, a.t1 - a.t0));   // turns left in the session that re-read it
      const fee = cat === TE_CATS[0] ? SEARCH_FEE : 0, carry = tokens / 1e6 * rate * (1.25 + 0.1 * rem);
      if (cat === TE_CATS[3] || cat === TE_CATS[2]) seats.add(String(name).split('__')[1]);
      calls.push({ a, t, name, cat, kb: chars / 1024, tokens, fee, carry, total: fee + carry });
    }));
    const by = new Map(); calls.forEach(c => { const r = by.get(c.a) || { a: c.a, fee: 0, carry: 0 }; r.fee += c.fee; r.carry += c.carry; by.set(c.a, r); });
    return { calls, seats: [...seats], fees: sum(calls.map(c => c.fee)), carry: sum(calls.map(c => c.carry)), total: sum(calls.map(c => c.total)), byAgent: [...by.values()].sort((p, q) => (q.fee + q.carry) - (p.fee + p.carry)) };
  }

  // =============== DEEP-DIVE SECTIONS ===============
  // sc: {sessions, agents, multi, stats(for single session)}
  function deepSections(sc) {
    const ctx = Ctx(), out = [];
    const A = sc.agents, S = sc.sessions, multi = S.length > 1, one = S.length === 1 ? S[0] : null;
    const swarm = A.length > 1;
    const T = theme();

    // ---- 1. mayor ----
    {
      const ranked = B.mayor(A).slice(0, 8), top = ranked[0];
      const mains = A.filter(a => a.layer === 0);
      const human = sum(S.map(s => s.human)), corr = sum(S.map(s => s.corr)), intr = sum(S.map(s => s.interrupts));
      const turns = sum(mains.map(a => a.turns));
      const Tt = sum(A.map(a => a.proc)) || 1, W = sum(A.map(a => a.work)) || 1, C = sum(A.map(a => a.coord)) || 1;
      const comp = k => ranked.map(r => (k === 0 ? r.a.proc / Tt : k === 1 ? r.a.work / W : r.a.coord / C) / 3 * 100);
      const y = ranked.map(r => shortT(lab(r.a, multi), 38)).reverse();
      const data = ['Tokens', 'Work output', 'Coordination'].map((n, k) => ({ type: 'bar', orientation: 'h', name: n, y, x: comp(k).slice().reverse(), marker: { color: [PAL.a, PAL.good, '#c084fc'][k] }, hovertemplate: n + ': %{x:.1f} pts<extra></extra>' }));
      const body = tiles([
        [top.a.layer === 0 ? 'Main agent' : 'Sub ' + top.a.id.slice(1), 'highest-influence agent (' + top.a.role + ')', 'Influence = average of an agent\'s share of tokens, work output (edits, writes, commits, passing tests) and coordination calls'],
        [pct(top.inf), 'of session influence'],
        [String(sum(A.map(a => a.delegations))), 'delegation calls (Task/Agent/Workflow)'],
        [String(sum(A.map(a => a.polls))), 'status polls (TaskOutput)'],
        [String(human), human === 1 ? 'human prompt' : 'human prompts', 'Prompts typed by a person (excluding tool results and injected context)'],
        [turns && human ? Math.round(turns / human) + ' : 1' : 'n/a', 'agent turns per human prompt'],
      ]) + plot(ctx, Math.max(230, ranked.length * 34 + 70), data, L({ barmode: 'stack', showlegend: true, margin: { l: 220 }, xaxis: { title: { text: 'influence points (stacked = share of total)' } } }));
      const real = swarm ? `${b(lab(top.a, multi))} holds ${b(pct(top.inf))} of the influence${top.a.layer === 0 ? ', so the orchestrator holds the power in fact as well as in name' : ', which is not the orchestrator: a sub-agent is quietly running the show'}.`
        : `Only one agent here, so the person is the real mayor: ${b(human)} prompts steered ${b(num(turns))} agent turns (${b(corr)} corrections, ${b(intr)} interrupts).`;
      out.push(card('mayor', 1, 'Orchestrator power', 'Org-chart power: who spends the tokens, produces the work and does the coordinating.', body, real));
    }

    // ---- 2. org: sunburst, spans, layers, squads ----
    {
      const ids = ['root'], labels = [multi ? 'All sessions' : (one.title ? shortT(one.title, 28) : one.id)], parents = [''], values = [0], colors = [T.line], hov = [''];
      const add = (id, label, parent, v, color, h) => { ids.push(id); labels.push(label); parents.push(parent); values.push(v); colors.push(color); hov.push(h || ''); };
      const sumUp = {};
      S.forEach(s => {
        const sid = s.id; add(sid, multi ? sid : shortT(s.title, 24) || sid, 'root', 0, T.line);
        const m = s.agents[0]; add(sid + '/m', 'Main', sid, Math.sqrt(Math.max(1, m.calls)), PAL.level[m.lvl - 1], `${lvlName(m.lvl)} · ${m.role} · ${m.calls} calls`);
        const sq = {}; s.agents.slice(1).forEach(a => { (sq[a.squad || 'Direct'] = sq[a.squad || 'Direct'] || []).push(a); });
        Object.entries(sq).forEach(([q, arr]) => {
          add(sid + '/' + q, q === 'Direct' ? 'Direct reports' : 'Wave ' + String(q).replace('wf_', '').slice(0, 5), sid, 0, T.line);
          arr.forEach(a => add(sid + '/' + q + '/' + a.id, 'Sub ' + a.id.slice(1) + ' ' + a.role, sid + '/' + q, Math.sqrt(Math.max(1, a.calls)), PAL.level[a.lvl - 1], `${lvlName(a.lvl)} · ${a.role} · ${a.calls} calls · ${shortT(a.title, 60)}`));
        });
      });
      // branchvalues=total: roll leaf values up
      const idx = Object.fromEntries(ids.map((id, i) => [id, i]));
      for (let i = ids.length - 1; i > 0; i--) { const p = parents[i]; if (p !== '') values[idx[p]] += values[i]; }
      const subsAll = A.filter(a => a.layer > 0), mains = A.filter(a => a.layer === 0);
      const squads = []; S.forEach(s => Object.entries(s.stats.squads).forEach(([q, arr]) => squads.push({ s, q, arr })));
      const peak = Math.max(...S.map(s => s.stats.peak));
      const maxSpan = Math.max(...S.map(s => s.stats.subs));
      const body = tiles([
        [swarm ? '2' : '1', 'layers', 'The logs record the main agent and its sub-agents; deeper nesting would not show up'],
        [String(maxSpan), 'span of control (main → sub-agents)', 'Human managers typically run 5 to 10 direct reports'],
        [sizeOf(Math.max(...S.map(s => s.agents.length))), 'swarm size', 'U.S. Army unit sizes by headcount: squad 6 to 10, platoon 18 to 50, company 60 to 200, battalion 300 to 1,000, and so on. A team takes the largest unit it reaches'],
        [String(squads.filter(x => x.q !== '-').length || (subsAll.length ? 1 : 0)), 'waves of helpers', 'A wave is helpers launched together: one workflow run, or a burst started within 5 minutes of each other'],
        [squads.length ? num(median(squads.map(x => x.arr.length))) : 'n/a', 'median wave size'],
        [String(peak), 'peak agents running at once'],
        [String(mains.length), mains.length === 1 ? 'main agent' : 'main agents'],
      ]);
      let tbl = '';
      if (squads.length) {
        tbl = `<div class="scroll"><table class="m"><thead><tr><th>Wave</th><th>Agents</th><th>Starts</th><th>Duration</th><th>Calls</th><th>Errors</th><th>Lost</th></tr></thead><tbody>${squads.slice(0, 12).map(x => {
          const t0 = Math.min(...x.arr.map(a => a.t0)), t1 = Math.max(...x.arr.map(a => a.t1));
          return `<tr><td>${esc((multi ? x.s.id + ' · ' : '') + String(x.q).replace('wf_', 'wf '))}</td><td>${x.arr.length}</td><td>+${dur(t0)}</td><td>${dur(t1 - t0)}</td><td>${sum(x.arr.map(a => a.calls))}</td><td>${sum(x.arr.map(a => a.errs))}</td><td>${x.arr.filter(a => a.status !== 'ok').length}</td></tr>`;
        }).join('')}</tbody></table></div>`;
      }
      const sun = plot(ctx, 470, [{ type: 'sunburst', ids, labels, parents, values, branchvalues: 'total', marker: { colors, line: { width: 1, color: T.panel } }, hovertext: hov, hovertemplate: '%{label}<br>%{hovertext}<extra></extra>', insidetextorientation: 'radial' }],
        L({ margin: { l: 4, r: 4, t: 4, b: 4 } }));
      const sp = swarm ? `The main agent manages ${b(maxSpan)} sub-agents directly${maxSpan > 10 ? `, well past the 5 to 10 a person can supervise. Launching helpers in waves is what makes that span survivable: it behaves like ${b(squads.length || 1)} team${squads.length === 1 ? '' : 's'}, not ${maxSpan} individuals` : ''}.`
        : 'Flat: one agent, no layers, no waves. There is nothing to organise, which is also why nothing can go wrong with delegation.';
      out.push(card('org', 2, 'Swarm size and chain of command', 'Org structure: slice size follows the square root of tool calls, so small sub-agents stay visible; colour is model level (darker = more senior).', body + sun + tbl, sp));
      out.push(window.SWW.spansCard({ sessions: S, agents: A }, ctx));
    }

    // ---- 3. leveling, compa-ratio, position in range, grade creep ----
    {
      const graded = A.filter(a => a.calls > 0), idle = A.length - graded.length;
      const mixShare = [0, 0, 0, 0, 0], mixCu = [0, 0, 0, 0, 0];
      A.forEach(a => Object.entries(a.mix).forEach(([l, w]) => { mixShare[l - 1] += w * a.turns; mixCu[l - 1] += w * a.cu; }));
      const mixT = sum(mixShare) || 1, mixC = sum(mixCu) || 1;
      const lv = [1, 2, 3, 4, 5], names = lv.map(lvlName);
      const mixChart = plot(ctx, 250, [
        { type: 'bar', name: 'Share of turns', x: names, y: mixShare.map(v => 100 * v / mixT), marker: { color: PAL.a }, hovertemplate: '%{x}: %{y:.0f}% of turns<extra></extra>' },
        { type: 'bar', name: 'Share of cost units', x: names, y: mixCu.map(v => 100 * v / mixC), marker: { color: PAL.b }, hovertemplate: '%{x}: %{y:.0f}% of cost<extra></extra>' }],
        L({ barmode: 'group', showlegend: true, yaxis: { title: { text: '% of total' }, range: [0, 100] }, legend: { y: 1.18, x: 0 } }));
      // compa: assigned x implied
      const z = lv.map(() => lv.map(() => 0)); graded.forEach(a => { z[a.lvl - 1][a.implied - 1]++; });
      const compa = graded.map(a => B.RATE[a.lvl] / B.RATE[a.implied]);
      const over = graded.filter(a => a.lvl - a.implied >= 2), under = graded.filter(a => a.implied - a.lvl >= 2);
      const cuAll = sum(graded.map(a => a.cu)) || 1, save = sum(over.map(a => a.cu * (1 - B.RATE[a.implied] / B.RATE[a.lvl])));
      const txt = z.map(r => r.map(v => v ? String(v) : ''));
      const heat = plot(ctx, 300, [{ type: 'heatmap', z, x: lv.map(l => 'L' + l), y: lv.map(l => 'L' + l), text: txt, texttemplate: '%{text}', colorscale: [[0, 'rgba(111,140,255,0.04)'], [1, PAL.a]], showscale: false, hovertemplate: 'Paid as L%{y}, work looks like L%{x}: %{z} agents<extra></extra>', xgap: 3, ygap: 3 }],
        L({ xaxis: { title: { text: 'level the work implies (from observed calls)' }, side: 'bottom' }, yaxis: { title: { text: 'level paid (model tier)' } },
          shapes: [{ type: 'line', xref: 'x', yref: 'y', x0: -0.5, y0: -0.5, x1: 4.5, y1: 4.5, line: { color: PAL.good, width: 2, dash: 'dash' } }] }));
      // position in range
      const byL = {}; graded.forEach(a => { (byL[a.lvl] = byL[a.lvl] || []).push(a); });
      const strips = Object.entries(byL).filter(([, arr]) => arr.length >= 2).map(([l, arr]) => {
        const v = arr.map(a => a.proc);
        return { type: 'scatter', mode: 'markers', name: lvlName(+l), x: arr.map(a => B.percentileInGroup(v, a.proc)), y: arr.map((a, i) => lvlName(+l)), text: arr.map(a => shortT(lab(a, multi), 40) + ' · ' + tok(a.proc) + ' tokens'),
          marker: { size: arr.map(a => 6 + Math.min(14, Math.sqrt(a.calls))), color: PAL.level[+l - 1], opacity: 0.75, line: { color: T.panel, width: 1 } }, hovertemplate: '%{text}<br>%{x:.0%} of level range<extra></extra>' };
      });
      const rng = strips.length ? plot(ctx, Math.max(170, strips.length * 56 + 60), strips, L({ xaxis: { title: { text: 'position in range within level (0% = lightest user, 100% = heaviest)' }, tickformat: '.0%', range: [-0.04, 1.04] }, margin: { l: 110 } })) : na('Position in range needs at least two agents at the same level.');
      // grade creep
      const ord = A.filter(a => a.calls > 0 || a.turns > 0).map(a => { const s = S.find(x => x.id === a.sid); const base = s.start ? Date.parse(s.start) : 0; return { a, t: base + a.t0 * 1000 }; }).sort((p, q) => p.t - q.t);
      let creep = na('Grade creep needs a run of agents over time.');
      let creepRead = '';
      if (ord.length >= 6) {
        const half = Math.floor(ord.length / 2), m1 = sum(ord.slice(0, half).map(o => o.a.lvl)) / half, m2 = sum(ord.slice(half).map(o => o.a.lvl)) / (ord.length - half);
        const win = Math.max(3, Math.round(ord.length / 8)), roll = ord.map((_, i) => { const sl = ord.slice(Math.max(0, i - win + 1), i + 1); return sum(sl.map(o => o.a.lvl)) / sl.length; });
        creep = plot(ctx, 220, [
          { type: 'scatter', mode: 'markers', x: ord.map(o => new Date(o.t)), y: ord.map((o, i) => o.a.lvl + ((i * 37) % 10 - 5) / 40), marker: { color: ord.map(o => PAL.level[o.a.lvl - 1]), size: 7, opacity: 0.7 }, text: ord.map(o => shortT(lab(o.a, multi), 40)), hovertemplate: '%{text}<extra></extra>', name: 'agents' },
          { type: 'scatter', mode: 'lines', x: ord.map(o => new Date(o.t)), y: roll, line: { color: PAL.b, width: 3 }, name: 'rolling mean', hovertemplate: 'mean level %{y:.2f}<extra></extra>' }],
          L({ showlegend: true, legend: { y: 1.2, x: 0 }, yaxis: { title: { text: 'level' }, range: [0.5, 5.5], dtick: 1 }, xaxis: { title: { text: 'agent start time' } } }));
        creepRead = ` Grade creep: the first half of agents averaged L${m1.toFixed(1)}, the second half L${m2.toFixed(1)} (${m2 - m1 > 0.15 ? 'creeping up' : m2 - m1 < -0.15 ? 'drifting down' : 'flat'}).`;
      }
      const body = tiles([
        [num(median(compa)), 'median compa-ratio', 'Rate paid for the model tier / rate of the tier the work implies. 1.0 = paid right.'],
        [pct(share(over.length, graded.length)), 'over-levelled (paid 2+ levels above the work)'],
        [pct(share(under.length, graded.length)), 'under-levelled'],
        [pct(share(save, cuAll)), 'cost if right-sized', 'Share of cost units that moving every over-levelled agent to the level its work implies would remove (heuristic)'],
        [String(idle), 'agents paid but did no work']].filter(x => x)) +
        `<div class="grid2"><div><h4>Level mix</h4>${mixChart}</div><div><h4>Compa-ratio: paid vs work</h4>${heat}</div></div><h4>Position in range</h4>${rng}<h4>Grade creep</h4>${creep}`;
      const read = over.length ? `${b(over.length)} of ${graded.length} agents are paid at least two levels above what their work looks like (title inflation); right-sizing them would cut ${b(pct(share(save, cuAll)))} of cost.${creepRead}` : `No agent is paid 2+ levels above its work.${creepRead}`;
      out.push(card('levels', 3, 'Leveling, compa-ratio, position in range, grade creep', 'Model tier is the level; level rate is the pay; the work actually done implies the level it was worth. The dashed diagonal is paid-right. Rates are a relative index (Haiku = 1, Sonnet = 3, Opus and Fable = 5).', body, read));
    }

    // ---- 4. contingent, geo ----
    {
      const fte = A.filter(a => a.emp === 'FTE'), con = A.filter(a => a.emp === 'Contractor');
      const k = fn => [sum(fte.map(fn)), sum(con.map(fn))];
      const donut = (labels, values, colors, title) => ({ type: 'pie', hole: 0.55, labels, values, marker: { colors, line: { color: T.panel, width: 2 } }, textinfo: 'percent', sort: false, hovertemplate: '%{label}: %{value:,.0f}<extra></extra>', title: { text: title, font: { size: 12, color: T.muted } } });
      const cmix = con.length ? plot(ctx, 260, [Object.assign(donut(['FTE (main session)', 'Contractors (spawned)'], k(a => a.turns), [PAL.a, PAL.b], 'turns'), { domain: { x: [0, 0.48] } }),
        Object.assign(donut(['FTE (main session)', 'Contractors (spawned)'], k(a => a.proc), [PAL.a, PAL.b], 'tokens'), { domain: { x: [0.52, 1] } })], L({ showlegend: true, legend: { y: -0.02, x: 0.1 }, margin: { l: 4, r: 4, t: 10, b: 30 } })) : na('No contractors: every agent here is a long-lived session (FTE).');
      const plat = {}; S.forEach(s => { plat[s.platform] = (plat[s.platform] || 0) + 1; });
      const hours = Array.from({ length: 24 }, (_, h) => sum(S.map(s => s.hours[h])));
      const polar = plot(ctx, 300, [{ type: 'barpolar', r: hours, theta: hours.map((_, h) => h * 15 + 7.5), width: 15, marker: { color: hours.map((_, h) => h < 8 ? PAL.good : h < 16 ? PAL.a : PAL.b), line: { color: T.panel, width: 1 } }, hovertemplate: '%{customdata}:00 UTC: %{r} calls<extra></extra>', customdata: hours.map((_, h) => String(h).padStart(2, '0')) }],
        L({ margin: { l: 30, r: 30, t: 20, b: 20 }, polar: { bgcolor: 'rgba(0,0,0,0)', angularaxis: { rotation: 90, direction: 'clockwise', tickmode: 'array', tickvals: [0, 90, 180, 270], ticktext: ['00 UTC', '06', '12', '18'], gridcolor: T.line, linecolor: T.line }, radialaxis: { gridcolor: T.line, linecolor: T.line, tickfont: { size: 10 } } } }));
      const shift = [sum(hours.slice(0, 8)), sum(hours.slice(8, 16)), sum(hours.slice(16))], shT = sum(shift) || 1;
      const body = tiles([
        [pct(share(con.length, A.length)), 'contingent (spawned) agents', 'A contractor is an agent spawned for a task and released; an FTE is the session that persists'],
        [pct(share(sum(con.map(a => a.proc)), sum(A.map(a => a.proc)))), 'of tokens bought from contractors'],
        ['Anthropic API', 'hosting (all agents)', 'These are Claude Code sessions, so every model call went to a hosted API. The self-hosted contrast is in the Fleet lens.'],
        [Object.entries(plat).sort((x, y) => y[1] - x[1]).map(([k2, v]) => k2 + (multi ? ' ' + v : '')).join(', '), 'office OS', 'Inferred from working-directory paths and shell tool names'],
        [pct(shift[0] / shT) + ' / ' + pct(shift[1] / shT) + ' / ' + pct(shift[2] / shT), 'APAC / EMEA / Americas hours', 'UTC hours 0-8, 8-16, 16-24. A proxy for when the agents were working, not where they ran.'],
      ]) + `<div class="grid2"><div><h4>FTE vs contractor</h4>${cmix}</div><div><h4>Follow the sun (UTC hour of tool calls)</h4>${polar}</div></div>`;
      const dom = shift.indexOf(Math.max(...shift));
      out.push(card('contingent', 4, 'Contingent mix and geo-strategy (COLO)', 'Persistent vs spawned workforce, where the compute lives, and when the work happened.', body,
        `${con.length ? `${b(pct(share(con.length, A.length)))} of agents were contractors` : 'No contractors'}; compute is ${b('100% hosted API')} (no COLO: nothing self-hosted in these logs). Work clustered in ${b(['APAC', 'EMEA', 'Americas'][dom])} hours (${pct(shift[dom] / shT)}).`));
    }

    // ---- 5. RAS activity ----
    {
      const tot = [0, 0, 0, 0, 0, 0]; A.forEach(a => a.ras.forEach((v, i) => { tot[i] += v; }));
      const calls = sum(tot) || 1;
      const rows = A.filter(a => a.calls > 0).sort((p, q) => q.calls - p.calls);
      const top = rows.slice(0, 22), rest = rows.slice(22);
      const labels = top.map(a => shortT(lab(a, multi), 36)), pctOf = (a, i) => 100 * a.ras[i] / (a.calls || 1);
      const ys = labels.slice(), xs = i => top.map(a => pctOf(a, i));
      if (rest.length) { ys.push(`${rest.length} more agents`); }
      const stack = plot(ctx, Math.max(240, ys.length * 24 + 80), B.BUCKETS.map((n, i) => ({ type: 'bar', orientation: 'h', name: n, y: ys.slice().reverse(), x: xs(i).concat(rest.length ? [100 * sum(rest.map(a => a.ras[i])) / (sum(rest.map(a => a.calls)) || 1)] : []).reverse(),
        marker: { color: PAL.bucket[i] }, hovertemplate: n + ': %{x:.0f}%<extra></extra>' })), L({ barmode: 'stack', showlegend: true, margin: { l: 210 }, xaxis: { range: [0, 100], title: { text: '% of tool calls' } }, legend: { y: 1.08, x: 0 } }));
      const don = plot(ctx, 280, [{ type: 'pie', hole: 0.55, labels: B.BUCKETS, values: tot, marker: { colors: PAL.bucket, line: { color: T.panel, width: 2 } }, textinfo: 'percent', sort: false, hovertemplate: '%{label}: %{value} calls<extra></extra>' }], L({ showlegend: true, legend: { orientation: 'h', y: -0.05, x: 0 }, margin: { l: 4, r: 4, t: 4, b: 40 } }));
      let heat = '';
      if (one) {
        const cl = one.stats.clusters, cp = compressor(cl), NB = 70, ag = rows.slice(0, 26);
        const zs = ag.map(a => { const bins = Array.from({ length: NB }, () => [0, 0, 0, 0, 0, 0]); a.ev.forEach(e => { const k = Math.min(NB - 1, Math.floor(cp.f(e[0]) / (cp.T || 1) * NB)); bins[k][e[1]]++; }); return bins.map(c => { const m = Math.max(...c); return m ? c.indexOf(m) : null; }); });
        const scale = []; PAL.bucket.forEach((c, i) => { scale.push([i / 6, c], [(i + 1) / 6, c]); });
        heat = `<h4>Activity over working time (each row an agent; gaps over 30 min removed)</h4>` + plot(ctx, Math.max(200, ag.length * 17 + 70),
          [{ type: 'heatmap', z: zs, x: Array.from({ length: NB }, (_, i) => dur(i / NB * cp.T)), y: ag.map(a => shortT(lab(a, false), 30)), colorscale: scale, zmin: -0.5, zmax: 5.5, showscale: false, xgap: 1, ygap: 1, hoverongaps: false, hovertemplate: '%{y}<br>%{x}<br>dominant: %{customdata}<extra></extra>', customdata: zs.map(r => r.map(v => v == null ? '' : B.BUCKETS[v])) }],
          L({ margin: { l: 190 }, yaxis: { autorange: 'reversed' }, xaxis: { title: { text: 'working time' }, nticks: 8 } }));
      }
      const ktlo = share(tot[4] + tot[5], calls);
      const body = tiles([[pct(share(tot[1], calls)), 'Innovation (build)'], [pct(share(tot[0], calls)), 'Research'], [pct(share(tot[2], calls)), 'Verification'], [pct(share(tot[3], calls)), 'Coordination'], [pct(ktlo), 'KTLO (operate + rework)', 'Keep-the-lights-on: shell and ops work plus calls that retried after an error']]) +
        `<div class="grid2 wide"><div>${stack}</div><div>${don}</div></div>` + heat;
      out.push(card('ras', 5, 'Activity analysis (RAS)', 'Where the time goes. Every tool call is classified: Research, Build (innovation), Verify, Coordinate, Operate and Rework (KTLO).', body,
        `${b(pct(ktlo))} of calls are keeping-the-lights-on versus ${b(pct(share(tot[1], calls)))} building. ${tot[3] / calls < 0.03 && swarm ? 'Coordination is a rounding error even with sub-agents: the orchestrator mostly does hands-on work.' : ''}`));
    }

    // ---- 6. roles vs titles ----
    {
      const roles = ['Orchestrator', 'Planner', 'Researcher', 'Reviewer', 'Verifier', 'Tester', 'Builder', 'Generalist'].filter(r => A.some(a => a.role === r));
      const z = roles.map(r => B.BUCKETS.map((_, i) => A.filter(a => a.role === r && a.top === i).length));
      const gradable = A.filter(a => B.EXPECTS[a.role] != null && a.top >= 0), match = gradable.filter(a => B.EXPECTS[a.role].includes(a.top));
      const mism = {}; gradable.filter(a => !B.EXPECTS[a.role].includes(a.top)).forEach(a => { const k = a.role + ' → ' + B.BUCKETS[a.top]; mism[k] = (mism[k] || 0) + 1; });
      const worst = Object.entries(mism).sort((p, q) => q[1] - p[1])[0];
      const heat = plot(ctx, Math.max(200, roles.length * 36 + 80), [{ type: 'heatmap', z, x: B.BUCKETS, y: roles, text: z.map(r => r.map(v => v || '')), texttemplate: '%{text}', colorscale: [[0, 'rgba(111,140,255,0.04)'], [1, PAL.a]], showscale: false, xgap: 3, ygap: 3, hovertemplate: 'Titled %{y}, mostly does %{x}: %{z}<extra></extra>' }],
        L({ margin: { l: 110 }, xaxis: { title: { text: 'what the agent mostly did' }, side: 'bottom' }, yaxis: { title: { text: 'title (inferred from its brief)' }, autorange: 'reversed' } }));
      const body = tiles([[pct(share(match.length, gradable.length)), 'title matches the work', 'Verifier → verifying or reading; Tester → verifying; Reviewer → reading or verifying; Researcher → reading; Planner → reading or coordinating; Builder → building; Orchestrator → coordinating'], [String(gradable.length), 'agents with a gradable title'], [String(roles.length), 'distinct roles']]) + heat;
      out.push(card('roles', 6, 'Roles and responsibilities in the title', 'Sub-agents get a role from their brief. Does what they actually did match what they were hired to do?', body,
        `${b(pct(share(match.length, gradable.length)))} of agents did what their title says.${worst ? ` The biggest gap: ${b(worst[0])} (${worst[1]} agents).` : ''} Titles are inferred from brief wording, so treat this as a heuristic.`));
    }

    // ---- 7. spend: tool cost, T&E, overhead, per agent ----
    {
      const rows = A.slice().sort((p, q) => q.proc - p.proc).slice(0, 14);
      const frac = (a, i) => 100 * a.tok[i] / (a.proc || 1);
      const comp = plot(ctx, Math.max(230, rows.length * 26 + 90), ['Fresh input', 'Cache read', 'Cache write', 'Output'].map((n, i) => ({ type: 'bar', orientation: 'h', name: n, y: rows.map(a => shortT(lab(a, multi), 34)).reverse(), x: rows.map(a => frac(a, i)).reverse(), marker: { color: [PAL.a, PAL.mute, PAL.b, PAL.good][i] }, hovertemplate: n + ': %{x:.1f}%<extra></extra>' })),
        L({ barmode: 'stack', showlegend: true, margin: { l: 210 }, xaxis: { range: [0, 100], title: { text: '% of tokens' } }, legend: { y: 1.1, x: 0 } }));
      const per = A.length || 1, cuT = sum(A.map(a => a.cu));
      const ledger = `<div class="scroll"><table class="m"><thead><tr><th>Agent</th><th>Cost units</th><th>Overhead</th><th>Licences</th><th>Tool output</th><th>Tool time</th><th>External</th></tr></thead><tbody>${rows.slice(0, 10).map(a => `<tr><td>${esc(shortT(lab(a, multi), 40))}</td><td>${num(a.cu)}</td><td>${pct(a.overhead)}</td><td>${a.nTools}</td><td>${num(a.toolKB / 1024)} MB</td><td>${dur(a.toolSec)}</td><td>${a.ext}</td></tr>`).join('')}</tbody></table></div>`;
      // tool belt: which licences actually get used
      const used = {}; A.forEach(a => Object.entries(a.tools).forEach(([n, v]) => { used[n] = (used[n] || 0) + v; }));
      const cats = {}; Object.entries(used).forEach(([n, v]) => { const c = toolCat(n); (cats[c] = cats[c] || []).push([n, v]); });
      const tids = ['belt'], tlab = ['Tool belt'], tpar = [''], tval = [0], tcol = [T.line];
      Object.entries(cats).forEach(([c, arr]) => { tids.push(c); tlab.push(c); tpar.push('belt'); tval.push(0); tcol.push(T.line); arr.forEach(([n, v]) => { tids.push(c + '/' + n); tlab.push(n.replace(/^mcp__/, '').replace(/__/g, ' ')); tpar.push(c); tval.push(v); tcol.push(c === 'Web' || c === 'MCP connectors' ? PAL.b : PAL.a); }); });
      const tix = Object.fromEntries(tids.map((id, i) => [id, i])); for (let i = tids.length - 1; i > 0; i--) { if (tpar[i]) tval[tix[tpar[i]]] += tval[i]; }
      const belt = plot(ctx, 300, [{ type: 'treemap', ids: tids, labels: tlab, parents: tpar, values: tval, branchvalues: 'total', marker: { colors: tcol, line: { width: 1, color: T.panel } }, textinfo: 'label+value', hovertemplate: '%{label}: %{value} calls<extra></extra>' }], L({ margin: { l: 2, r: 2, t: 2, b: 2 } }));
      // External tools cost fees plus the context they add
      const te = teAnalysis(A), spend = cuT || 1;
      const catRows = TE_CATS.map(c => { const xs = te.calls.filter(x => x.cat === c); return { c, n: xs.length, fee: sum(xs.map(x => x.fee)), carry: sum(xs.map(x => x.carry)) }; });
      const catChart = te.calls.length ? plot(ctx, 250, [['Vendor fee', 'fee', PAL.bad], ['Context carried', 'carry', PAL.b]].map(([n, k, c]) => ({ type: 'bar', name: n, x: TE_CATS, y: catRows.map(r => r[k]), marker: { color: c }, hovertemplate: n + ': $%{y:.2f}<extra></extra>' })),
        L({ barmode: 'stack', showlegend: true, legend: { y: 1.18, x: 0 }, yaxis: { title: { text: 'US$ (list price)' } }, xaxis: { tickangle: -15 } })) : na('No outside calls in this scope.');
      const byA = te.byAgent.slice(0, 10);
      const agChart = byA.length ? plot(ctx, Math.max(200, byA.length * 26 + 70), [['Vendor fee', 'fee', PAL.bad], ['Context carried', 'carry', PAL.b]].map(([n, k, c]) => ({ type: 'bar', orientation: 'h', name: n, y: byA.map(r => shortT(lab(r.a, multi), 32)).reverse(), x: byA.map(r => r[k]).reverse(), marker: { color: c }, hovertemplate: n + ': $%{x:.2f}<extra></extra>' })),
        L({ barmode: 'stack', showlegend: true, legend: { y: 1.12, x: 0 }, margin: { l: 210 }, xaxis: { title: { text: 'Tool cost per agent, US$' } } })) : '';
      const ptable = `<div class="scroll"><table class="m wastes"><thead><tr><th>Tool type</th><th>Calls</th><th>Price used</th><th>Fee</th><th>Context carried</th></tr></thead><tbody>${[
        ['Web search', '$0.01 per search (list $10 per 1,000)'], ['Web fetch', 'No vendor fee'], ['Browser automation', 'No fee; screenshots capped at 2,500 tokens'], ['SaaS / MCP connector', 'Seat price not logged'], ['Network shell', 'No fee']]
        .map(([c, pr]) => { const r = catRows.find(x => x.c === c); return `<tr><td class="txt">${esc(c)}</td><td>${r.n}</td><td class="txt">${esc(pr)}</td><td>${money(r.fee)}</td><td>${money(r.carry)}</td></tr>`; }).join('')}</tbody></table></div>`;
      const dear = te.calls.slice().sort((p, q) => q.total - p.total).slice(0, 5);
      const dearT = dear.length ? `<h4>Five most expensive calls</h4><div class="scroll"><table class="m wastes"><thead><tr><th>Agent</th><th>Call</th><th>Result size</th><th>Cost</th></tr></thead><tbody>${dear.map(x => `<tr><td class="txt">${esc(shortT(lab(x.a, multi), 34))}</td><td class="txt">${esc(x.cat)}</td><td>${Math.round(x.kb)} KB</td><td>${money(x.total)}</td></tr>`).join('')}</tbody></table></div>` : '';
      const unpriced = te.calls.filter(x => x.cat !== TE_CATS[0]).length;
      const body = tiles([
        [money(te.total), 'external tool cost', 'Vendor fees plus the cost of carrying each trip\'s results in context for the rest of the session'],
        [pct(te.total / (spend + te.total)), 'of all spend is external tool cost', 'External tool cost divided by model spend plus tool cost'],
        [String(te.calls.length), 'external tool calls'], [money(te.total / per), 'tool cost per agent'],
        [money(te.fees), 'metered vendor fees', 'Only web search carries a published per-call fee'],
        [String(te.seats.length), 'SaaS seats in use' + (te.seats.length ? ' (' + te.seats.join(', ') + ')' : ''), 'Distinct MCP connectors an agent called'],
        [num(cuT / per), 'cost units per agent', '1 cost unit is about US$1 at list price: Haiku, Sonnet and Opus input are $1, $3 and $5 per million tokens, scaled for cache and output'],
        [pct(sum(A.map(a => a.tok[1] + a.tok[2])) / (sum(A.map(a => a.proc)) || 1)), 'overhead (context reloaded each turn)', 'Cache reads and writes as a share of tokens: the price of carrying context'],
      ]) + '<h4>What outside tools cost</h4>' + `<div class="grid2"><div>${catChart}</div><div>${agChart}</div></div>` + ptable
        + `<p class="sub">Sensitivity: the ${unpriced} unpriced calls (connectors, browser, network) carry no vendor fee here. If each cost $0.05, tool cost would rise by ${money(unpriced * 0.05)}.</p>` + dearT
        + '<h4>Tool belt: which licences get used (calls)</h4>' + belt + '<h4>Token composition per agent</h4>' + comp + '<h4>Per-agent ledger (top 10 by tokens)</h4>' + ledger;
      out.push(card('spend', 7, 'Tool cost per agent', 'Licence = distinct tools in use. Tool cost = what an agent pays to use outside tools: a vendor fee per search, plus the weight of whatever the tool returns, which the agent re-reads every turn. Overhead = tokens spent re-reading context rather than thinking.', body,
        `Outside tools cost ${b(money(te.total))}, ${b(pct(te.total / (spend + te.total)))} of spend, from ${b(te.calls.length)} calls; ${b(money(te.fees))} was metered fees and the rest was carrying results around. Overhead is ${b(pct(sum(A.map(a => a.tok[1] + a.tok[2])) / (sum(A.map(a => a.proc)) || 1)))} of all tokens, and only ${b(num(100 * sum(A.map(a => a.tok[3])) / (sum(A.map(a => a.proc)) || 1)) + '%')} is output.`));
    }

    // ---- 8. make vs buy ----
    {
      const mk = A.filter(a => a.layer === 0), by = A.filter(a => a.layer > 0);
      const mkc = [0, 0, 0, 0, 0, 0], byc = [0, 0, 0, 0, 0, 0];
      mk.forEach(a => a.ras.forEach((v, i) => { mkc[i] += v; })); by.forEach(a => a.ras.forEach((v, i) => { byc[i] += v; }));
      const labels = ['Make (orchestrator)', 'Buy (sub-agents)'].concat(B.BUCKETS), src = [], tgt = [], val = [], col = [];
      B.BUCKETS.forEach((_, i) => { if (mkc[i]) { src.push(0); tgt.push(2 + i); val.push(mkc[i]); col.push('rgba(111,140,255,0.35)'); } if (byc[i]) { src.push(1); tgt.push(2 + i); val.push(byc[i]); col.push('rgba(240,180,41,0.4)'); } });
      const buyShare = share(sum(byc), sum(mkc) + sum(byc)), buyTok = share(sum(by.map(a => a.proc)), sum(A.map(a => a.proc)));
      const sk = by.length ? plot(ctx, 320, [{ type: 'sankey', arrangement: 'snap', node: { label: labels, pad: 16, thickness: 16, color: [PAL.a, PAL.b].concat(PAL.bucket), line: { color: T.panel, width: 1 } }, link: { source: src, target: tgt, value: val, color: col } }], L({ margin: { l: 6, r: 6, t: 6, b: 6 } })) : na('Nothing was bought: the orchestrator made everything itself.');
      const mkExt = sum(mk.map(a => a.ext)), byExt = sum(by.map(a => a.ext));
      const body = tiles([[pct(buyShare), 'of tool calls bought (sub-agents)'], [pct(buyTok), 'of tokens bought'], [String(by.length), 'professional-services engagements'], [String(mkExt + byExt), 'outside-service calls (web, MCP, network)']]) + sk;
      out.push(card('makebuy', 8, 'Make vs buy (professional services)', 'Work the orchestrator did itself versus work it outsourced to sub-agents, and the kind of work in each.', body,
        by.length ? `${b(pct(buyShare))} of calls were outsourced. Bought work skews to ${b(B.BUCKETS[byc.indexOf(Math.max(...byc))])} while the orchestrator kept ${b(B.BUCKETS[mkc.indexOf(Math.max(...mkc))])}.` : 'Everything was made in-house.'));
    }

    // ---- 9. attrition and OOO ----
    {
      const st = { ok: 0, cut: 0, dead: 0 }; A.forEach(a => { st[a.status] = (st[a.status] || 0) + 1; });
      const calls = sum(A.map(a => a.calls)) || 1, errs = sum(A.map(a => a.errs));
      const errBy = [0, 0, 0, 0, 0, 0], callBy = [0, 0, 0, 0, 0, 0]; A.forEach(a => a.ev.forEach(e => { callBy[e[1]]++; if (e[2]) errBy[e[1]]++; }));
      const errChart = plot(ctx, 240, [{ type: 'bar', x: B.BUCKETS, y: errBy.map((v, i) => callBy[i] ? 100 * v / callBy[i] : 0), marker: { color: PAL.bucket }, text: errBy.map((v, i) => callBy[i] ? v + '/' + callBy[i] : ''), textposition: 'outside', hovertemplate: '%{x}: %{y:.1f}% failed<extra></extra>', cliponaxis: false }], L({ yaxis: { title: { text: '% of calls that errored' }, rangemode: 'tozero' }, margin: { t: 24 } }));
      const gaps = []; A.forEach(a => (a.ooo || []).forEach(g => gaps.push({ a, t: g[0], d: g[1] })));
      const longest = gaps.sort((p, q) => q.d - p.d).slice(0, 8);
      const idleRows = A.filter(a => a.dur > 600).sort((p, q) => q.idle / (q.dur || 1) - p.idle / (p.dur || 1)).slice(0, 12);
      const ooo = idleRows.length ? plot(ctx, Math.max(200, idleRows.length * 24 + 70), [{ type: 'bar', orientation: 'h', y: idleRows.map(a => shortT(lab(a, multi), 34)).reverse(), x: idleRows.map(a => 100 * Math.min(1, a.idle / (a.dur || 1))).reverse(), marker: { color: PAL.mute }, hovertemplate: '%{x:.0f}% of its lifetime idle<extra></extra>' }], L({ margin: { l: 210 }, xaxis: { range: [0, 100], title: { text: '% of lifetime spent idle (gaps over 2 minutes)' } } })) : na('No agent lived long enough to measure idle time.');
      const body = tiles([
        [pct(share(st.dead + st.cut, A.length)), 'attrition (lost or cut off)', 'Agents that ended on an API error or mid-call without a result'],
        [String(sum(A.map(a => a.apiErr))), 'API errors (sick days)'],
        [String(sum(S.map(s => s.compactions))), 'context compactions (memory loss)'],
        [String(sum(S.map(s => s.interrupts))), 'human interrupts'],
        [num(100 * errs / calls) + '%', 'calls that failed'],
        [dur(gaps.length ? Math.max(...gaps.map(g => g.d)) : 0), 'longest break (vacation)'],
      ]) + `<div class="grid2"><div><h4>Where agents fail</h4>${errChart}</div><div><h4>Out of office</h4>${ooo}</div></div>`;
      out.push(card('attrition', 9, 'Attrition and vacation / OOO', 'Agents that disappear, errors by type of work, and how much of each agent\'s life was spent waiting.', body,
        `${b(st.dead + st.cut)} of ${A.length} agents were lost (${b(st.dead)} dead on API errors, ${b(st.cut)} cut off mid-call). Errors concentrate in ${b(B.BUCKETS[errBy.map((v, i) => callBy[i] > 5 ? v / callBy[i] : 0).reduce((m, v, i, arr) => v > arr[m] ? i : m, 0)])}.`));
    }

    // ---- 10. LTV / CAC ----
    {
      const rows = A.filter(a => a.calls > 0 && a.ramp > 0);
      const ltv = rows.map(a => a.work / (a.ramp / 1e5));
      const sc = rows.length >= 2 ? plot(ctx, 330, [{ type: 'scatter', mode: 'markers', x: rows.map(a => a.ramp), y: rows.map(a => a.work), text: rows.map(a => shortT(lab(a, multi), 40)), marker: { size: rows.map(a => 7 + Math.min(26, Math.sqrt(a.calls) * 1.4)), color: rows.map(a => a.emp === 'FTE' ? PAL.a : PAL.b), opacity: 0.7, line: { color: T.panel, width: 1 } }, hovertemplate: '%{text}<br>onboarding: %{x:,.0f} tokens<br>output: %{y} work units<extra></extra>' }],
        L({ xaxis: { type: 'log', tickvals: [1e3, 1e4, 1e5, 1e6, 1e7, 1e8], ticktext: ['1K', '10K', '100K', '1M', '10M', '100M'], title: { text: 'CAC: tokens spent before the first edit (log)' } }, yaxis: { type: 'log', title: { text: 'LTV: work units delivered (log)' } } })) : na('Needs at least two agents that built something.');
      const best = rows.length ? rows[ltv.indexOf(Math.max(...ltv))] : null;
      const body = tiles([[rows.length ? num(median(ltv)) : 'n/a', 'work units per 100K onboarding tokens (median)', 'Work unit = file edit/write, commit, passing verification, or a sub-agent\'s delivered report. Onboarding = tokens consumed before the first edit (for agents that never edit, before they finish).'], [rows.length ? tok(median(rows.map(a => a.ramp))) : 'n/a', 'median CAC (tokens to first edit)'], [String(A.filter(a => a.calls > 0 && a.edits + a.writes === 0).length), 'agents that never edited a file (read-only workers)']]) + sc;
      out.push(card('ltv', 10, 'LTV of CAC of talent', 'What it costs to bring an agent up to speed against what it then delivers.', body,
        best ? `Best return: ${b(shortT(lab(best, multi), 36))} at ${b(num(Math.max(...ltv)))} work units per 100K onboarding tokens. Orchestrators pay a big up-front context bill but amortise it over hundreds of turns; short-lived sub-agents pay it every time.` : 'Not enough agents with measurable build output.'));
    }

    // ---- 11. DORA / SPACE ----
    {
      const mains = A.filter(a => a.layer === 0);
      const verifies = sum(S.map(s => s.stats.verifies)), fails = sum(S.map(s => s.stats.verifyFails));
      const commits = sum(S.map(s => s.stats.commits)), days = sum(S.map(s => s.stats.workDays)), active = sum(S.map(s => s.stats.active));
      const mttr = median(S.map(s => s.stats.mttr).filter(x => x != null));
      const human = sum(S.map(s => s.human)), corr = sum(S.map(s => s.corr)), intr = sum(S.map(s => s.interrupts));
      const calls = sum(A.map(a => a.calls)), coordShare = share(sum(A.map(a => a.coord)), calls);
      const cache = sum(A.map(a => a.tok[1])) / (sum(A.map(a => a.tok[0] + a.tok[1] + a.tok[2])) || 1);
      const dims = [
        ['Satisfaction', human ? Math.max(0, 1 - (corr + intr) / human) : null, 'No corrections or interrupts per human prompt'],
        ['Performance', verifies ? 1 - fails / verifies : null, 'Verification runs that passed'],
        ['Activity', active ? Math.min(1, calls / (active / 3600) / 150) : null, 'Tool calls per active hour, scaled so 150/h = 100%'],
        ['Communication', Math.min(1, coordShare * 8), 'Coordination calls, scaled so 12.5% = 100%'],
        ['Efficiency', cache, 'Share of input served from cache'],
      ].filter(d => d[1] != null);
      const radar = dims.length >= 3 ? plot(ctx, 300, [{ type: 'scatterpolar', r: dims.map(d => d[1]).concat([dims[0][1]]), theta: dims.map(d => d[0]).concat([dims[0][0]]), fill: 'toself', fillcolor: 'rgba(111,140,255,0.25)', line: { color: PAL.a, width: 2 }, hovertemplate: '%{theta}: %{r:.0%}<extra></extra>' }],
        L({ margin: { l: 40, r: 40, t: 20, b: 20 }, polar: { bgcolor: 'rgba(0,0,0,0)', radialaxis: { range: [0, 1], tickformat: '.0%', gridcolor: T.line, linecolor: T.line, tickfont: { size: 10 } }, angularaxis: { gridcolor: T.line, linecolor: T.line } } })) : na('Not enough signals for a SPACE profile.');
      const body = `<h4>DORA</h4>` + tiles([
        [commits ? num(active / 3600 / commits) + 'h' : 'n/a', 'lead time proxy: active hours per commit', 'The logs record commits as counts, not timestamps, so true commit lead time is not measurable'],
        [commits ? num(commits / days) : '0', 'deploy frequency: commits per working day'],
        [verifies ? pct(fails / verifies) : 'n/a', 'change failure rate (failed verifications)', verifies + ' verification runs: tests, linters, builds'],
        [mttr != null ? dur(mttr) : 'n/a', 'MTTR (failed check to next pass)'],
      ]) + `<h4>SPACE</h4><div class="grid2"><div>${radar}</div><div class="dimlist">${dims.map(d => `<p><b>${esc(d[0])}</b> ${pct(d[1])}<br><span class="sub">${esc(d[2])}</span></p>`).join('')}</div></div>`;
      out.push(card('dora', 11, 'DORA / SPACE', 'Delivery health (speed, stability, recovery) and developer-experience dimensions, translated for agents.', body,
        `${verifies ? `Change failure rate is ${b(pct(fails / verifies))} across ${b(verifies)} verifications${mttr != null ? `, recovering in a median ${b(dur(mttr))}` : ''}.` : 'These sessions ran no recognisable verification step.'} ${human ? `People corrected or interrupted on ${b(pct(Math.min(1, (corr + intr) / human)))} of their prompts.` : ''}`));
    }

    // ---- 12. Pareto ----
    {
      const rows = A.filter(a => a.calls > 0);
      if (rows.length >= 5) {
        const pt = B.paretoCurve(rows.map(a => a.proc)), pw = B.paretoCurve(rows.map(a => a.work)), pc = B.paretoCurve(rows.map(a => a.calls));
        const tr = (p, n, c) => ({ type: 'scatter', mode: 'lines', name: n, x: p.x.map(v => v * 100), y: p.y.map(v => v * 100), line: { color: c, width: 3 }, hovertemplate: n + ': top %{x:.0f}% of agents hold %{y:.0f}%<extra></extra>' });
        const ch = plot(ctx, 330, [{ type: 'scatter', mode: 'lines', x: [0, 100], y: [0, 100], line: { color: T.line, dash: 'dot' }, hoverinfo: 'skip', name: 'equal' }, tr(pt, 'Tokens', PAL.a), tr(pc, 'Tool calls', PAL.b), tr(pw, 'Work output', PAL.good)],
          L({ showlegend: true, legend: { y: 1.12, x: 0 }, xaxis: { title: { text: '% of agents (ranked)' }, range: [0, 100] }, yaxis: { title: { text: 'cumulative % of total' }, range: [0, 100] }, shapes: [{ type: 'line', x0: 20, x1: 20, y0: 0, y1: 100, line: { color: T.muted, width: 1, dash: 'dash' } }, { type: 'line', x0: 0, x1: 100, y0: 80, y1: 80, line: { color: T.muted, width: 1, dash: 'dash' } }] }));
        out.push(card('pareto', 12, 'Pareto: 20% of agents, 80% of results', 'Cumulative share held by the busiest agents. The dashed lines mark 20% of agents and 80% of output.',
          tiles([[pct(pt.topShare), `of tokens by the top ${pt.k} agents`], [pct(pc.topShare), 'of tool calls'], [pct(pw.topShare), 'of work output']]) + ch,
          `The top ${b(pt.k)} of ${b(pt.n)} agents hold ${b(pct(pw.topShare))} of the work output${pw.topShare >= 0.8 ? ': a textbook Pareto' : ''}.`));
      } else {
        out.push(card('pareto', 12, 'Pareto: 20% of agents, 80% of results', 'Cumulative share held by the busiest agents.', na('A Pareto curve needs at least five agents. Pick a swarm or "All sessions" above.'), ''));
      }
    }

    // ---- 13. output over time ----
    {
      let body, read;
      if (multi) {
        const rows = S.map(s => ({ s, work: sum(s.agents.map(a => a.work)), n: s.agents.length, t: Date.parse(s.start), cu: sum(s.agents.map(a => a.cu)), act: s.stats.active })).sort((p, q) => p.t - q.t);
        const ch = plot(ctx, 300, [
          { type: 'bar', name: 'Work units per agent', x: rows.map(r => r.s.id), y: rows.map(r => r.work / r.n), marker: { color: PAL.good }, hovertemplate: '%{x}: %{y:.0f} per agent<extra></extra>', yaxis: 'y' },
          { type: 'scatter', mode: 'lines+markers', name: 'Cost units per work unit', x: rows.map(r => r.s.id), y: rows.map(r => r.work ? r.cu / r.work : null), line: { color: PAL.b, width: 3 }, hovertemplate: '%{y:.3f} CU per work unit<extra></extra>', yaxis: 'y2' }],
          L({ showlegend: true, legend: { y: 1.18, x: 0 }, xaxis: { title: { text: 'sessions in date order' }, type: 'category' }, yaxis: { title: { text: 'work units per agent' } }, yaxis2: { overlaying: 'y', side: 'right', title: { text: 'cost units per work unit' }, showgrid: false, rangemode: 'tozero' } }));
        body = ch; read = `Output per agent varies ${b(num(Math.max(...rows.map(r => r.work / r.n)) / Math.max(1, Math.min(...rows.map(r => r.work / r.n)))) + 'x')} across sessions. Swarm sessions spread work over more agents, so per-agent output is lower, but total output is higher.`;
      } else {
        const cp = compressor(one.stats.clusters);
        const evs = []; A.forEach(a => a.ev.forEach(e => { if (e[1] === 1) evs.push(cp.f(e[0])); })); evs.sort((x, y) => x - y);
        if (evs.length < 3) { body = na('Fewer than three build actions; nothing to plot.'); read = ''; }
        else {
          body = plot(ctx, 260, [{ type: 'scatter', mode: 'lines', x: evs.map(v => v / 3600), y: evs.map((_, i) => i + 1), line: { color: PAL.good, width: 3, shape: 'hv' }, fill: 'tozeroy', fillcolor: 'rgba(52,211,153,0.12)', hovertemplate: '%{y} edits by hour %{x:.1f}<extra></extra>' }],
            L({ xaxis: { title: { text: 'working hours (breaks over 30 min removed)' } }, yaxis: { title: { text: 'cumulative file edits and writes' } } }));
          const half = evs[Math.floor(evs.length / 2)];
          read = `${b(num(evs.length))} edits over ${b(dur(cp.T))} of working time; half of them landed in the first ${b(pct(half / cp.T))} of that window.`;
        }
      }
      const wk = sum(A.map(a => a.work)), cuw = sum(A.map(a => a.cu));
      body = tiles([[num(wk / (A.length || 1)), 'work units per agent', 'The unit of efficacy: file changes, commits, passing checks and delivered sub-agent reports per agent'], [num(wk / (cuw || 1)), 'work units per cost unit', 'Cost units are about US$ at list price'], [num(cuw / (wk || 1)), 'cost units per work unit']]) + body;
      out.push(card('output', 13, 'Output per agent over time', 'There is no revenue per agent; the unit of efficacy is work delivered per agent (and per dollar). This shows output per agent across sessions, or how output accumulated during one session.', body, read));
    }
    out.push(...window.SWW.deepFlow({ sessions: S, agents: A }, ctx));
    return { sections: window.SWW.renumber(out), ctx };
  }

  window.SWC = { teAnalysis, TE_CATS, deepSections, L, PAL, Ctx, plot, tile, tiles, na, card, b, esc, tok, pct, dur, num, money, theme, CFG, merge, shortT, compressor, lab };
})();
