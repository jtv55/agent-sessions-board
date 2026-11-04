// Swarm benchmark tab: one composite score and letter grade per public swarm, ranked. Five dimensions, each 0 to 100,
// weighted by sliders; dimensions a source cannot measure are left out and the score is renormalised over what exists.
(() => {
  'use strict';
  const B = window.SWB, C = window.SWC, W = window.SWW;
  const { sum, median } = B;
  const { L, PAL, plot, na, b, esc, pct, num, theme, shortT } = C;

  const DIMS = [
    ['outcome', 'Outcome', 'Did the work get done and hold up?'],
    ['reliability', 'Reliability', 'Did agents survive and calls succeed?'],
    ['efficiency', 'Efficiency', 'How little spend was wasted?'],
    ['flow', 'Flow', 'How predictable was the time to finish?'],
    ['coord', 'Coordination', 'Did the team function as a team?']];
  const DEFAULT_W = { outcome: 35, reliability: 20, efficiency: 20, flow: 15, coord: 10 };
  const GRADES = [[80, 'A'], [65, 'B'], [50, 'C'], [35, 'D'], [0, 'F']];
  const grade = s => GRADES.find(g => s >= g[0])[1];
  const GCOL = { A: '#34d399', B: '#7fd8a2', C: '#f0b429', D: '#f59e6b', F: '#f87171' };
  const TYPES = { swarm: 'Swarm (Claude Code)', single: 'Single agent (Claude Code)', coop: 'Agent pair (CooperBench)', solo: 'Single agent (CooperBench)', mast: 'Framework team (MAST)', pool: 'Single-agent population (MiMo)', prod: 'Production (timing only)', user: 'Community submission', you: 'You', chal: 'Challenger' };
  const TCOL = { swarm: '#6f8cff', single: '#94a3b8', coop: '#f0b429', solo: '#c9b27a', mast: '#c084fc', prod: '#2aa7ae', pool: '#8b9bb4', user: '#fb923c', you: '#f472b6', chal: '#f472b6' };
  const tk = e => e.you ? 'you' : e.chal ? 'chal' : e.type;
  const dname = e => e.disp ? e.disp : e.you ? ((window.Grade && window.Grade.me() && window.Grade.me().handle) ? '@' + window.Grade.me().handle : 'You') + ' · ' + e.name : e.name;
  const ownerOf = e => { if (e.you || e.chal) return null; if (e.type === 'user') return e.name.replace(/^@/, ''); if (e.src === 'mast') return e.mf; const so = D && D.corpus.sources[e.src]; return so ? so.repo.split('/')[0] : e.name; };
  const disp = e => e.you ? dname(e) : e.chal ? e.name : e.type === 'mast' ? ownerOf(e) : '@' + ownerOf(e);
  // One row per user: their best-scoring entry. Scored entries only; callers pass composite-enriched objects.
  const bestPerOwner = list => { if (!byUser) return list; const seen = new Set(); return list.slice().sort((p, q) => q.score - p.score).filter(e => { const k = e.owner; if (k == null) return true; if (seen.has(k)) return false; seen.add(k); return true; }); };
  const mean = a => a.length ? sum(a) / a.length : null;
  const cv = a => { if (a.length < 5) return null; const m = mean(a); return m ? Math.sqrt(sum(a.map(x => (x - m) ** 2)) / a.length) / m : null; };
  const flowScore = a => { const c = cv(a); return c == null ? null : 100 / (1 + c); };
  const sc = x => x == null ? null : Math.max(0, Math.min(100, 100 * x));

  let byUser = true, D = null, E = [], host = null, filt = 'all', weights = Object.assign({}, DEFAULT_W), sel = null, YOU = null, CHAL = null, COMM = [];
  const CFG = () => window.SWARM_CONFIG || {};

  // ---------- entrants ----------
  function deepEntrant(s) {
    const A = s.agents, calls = sum(A.map(a => a.calls)) || 1, errs = sum(A.map(a => a.errs)), lost = A.filter(a => a.status !== 'ok').length;
    const ver = s.stats.verifies, vf = s.stats.verifyFails, delivered = A.filter(a => a.status === 'ok' && a.work > 0).length / A.length;
    const rework = sum(A.map(a => a.ras[5])), cu = sum(A.map(a => a.cu)) || 1, ghostCu = sum(A.filter(a => a.status !== 'ok').map(a => a.cu)) / cu;
    const items = W.itemsOf(s).items.map(i => i.e - i.s);
    let coord = null;
    if (A.length > 1) {
      const bad = A.filter(a => a.status !== 'ok' || a.work === 0 || (a.errs + a.ras[5]) / (a.calls || 1) >= 0.25 || (a.delegations >= 3 && a.ras[1] / (a.calls || 1) < 0.1) || (a.polls >= 5 && a.polls / (a.calls || 1) >= 0.4)).length;
      coord = sc((1 - bad / A.length) * (s.stats.peak <= 10 ? 1 : 10 / s.stats.peak));
    }
    return { id: 'd' + s.id, src: s.src, calls, name: shortT(s.title || s.id, 30) + ' (' + A.length + (A.length === 1 ? ' agent)' : ' agents)'), type: A.length > 1 ? 'swarm' : 'single', n: A.length, nLabel: A.length + (A.length === 1 ? ' agent, ' : ' agents, ') + calls + ' calls',
      s: { outcome: sc(0.5 * (ver >= 3 ? 1 - vf / ver : 0.5) + 0.5 * delivered), reliability: sc((1 - lost / A.length) * (1 - Math.min(1, 2 * errs / calls))), efficiency: sc(1 - Math.min(1, (errs + rework) / calls + ghostCu)), flow: flowScore(items), coord },
      note: `Outcome: ${ver >= 3 ? pct(1 - vf / ver) + ' of ' + ver + ' verifications passed' : 'no checks run, so correctness is unproven'}; ${pct(delivered)} of agents delivered.` };
  }

  function fleetEntrants(F) {
    const out = [];
    const coopE = (rows, name, id) => {
      const n = rows.length, ags = rows.flatMap(c => c.a), passed = sum(rows.map(c => c.passes)), cost = sum(ags.map(a => a[1])) || 1, waste = sum(ags.filter(a => !a[6]).map(a => a[1])) / cost;
      return { id, src: 'coop', name, type: 'coop', n, nLabel: n + ' tasks, ' + 2 * n + ' agents', s: { outcome: sc(passed / (2 * n)), reliability: sc(1 - ags.filter(a => a[0]).length / ags.length), efficiency: sc(1 - waste), flow: flowScore(rows.map(c => c.d)), coord: sc(1 - rows.filter(c => c.mg === 'x').length / n) },
        note: `${pct(passed / (2 * n))} of features passed; ${pct(waste)} of spend produced no pass; ${pct(rows.filter(c => c.mg === 'x').length / n)} of pairs conflicted on merge.` };
    };
    const repoName = i => (F.F.repos[i] || '?').replace('_task', '');
    F.F.repos.forEach((_, i) => { const rows = F.coop.filter(c => c.r === i); if (rows.length >= 16) out.push(coopE(rows, 'Coop pairs · ' + repoName(i), 'fc' + i)); });
    out.push(coopE(F.coop, 'Coop pairs · all repos', 'fcall'));
    const so = F.solo, n = so.length, cost = sum(so.map(s => s.a[1])) || 1;
    out.push({ id: 'fsolo', src: 'solo', name: 'Solo agent · all repos', type: 'solo', n, nLabel: n + ' tasks, ' + n + ' agents', s: { outcome: sc(sum(so.map(s => s.passes)) / (2 * n)), reliability: sc(1 - so.filter(s => s.a[0]).length / n), efficiency: sc(1 - sum(so.filter(s => !s.passes).map(s => s.a[1])) / cost), flow: flowScore(so.map(s => s.d)), coord: null },
      note: `${pct(sum(so.map(s => s.passes)) / (2 * n))} of features passed on the same tasks, same model.` });
    return out;
  }

  function mastEntrants(M) {
    const g = {}; M.rows.forEach(r => { (g[r.f + '|' + r.b + '|' + r.m] = g[r.f + '|' + r.b + '|' + r.m] || []).push(r); });
    return Object.entries(g).filter(([, rr]) => rr.length >= 10).map(([k, rr]) => {
      const [f, bm, m] = k.split('|'), n = rr.length, spec = rr.filter(r => r.cat[0] || r.cat[2]).length / n, inter = rr.filter(r => r.cat[1]).length / n;
      return { id: 'm' + k, src: 'mast', mf: f, name: `${f} · ${bm} · ${m}`, type: 'mast', n, nLabel: n + ' runs', s: { outcome: sc(1 - spec), reliability: sc(1 - Math.min(1, mean(rr.map(r => r.nfm)) / 5)), efficiency: null, flow: flowScore(rr.filter(r => r.dur).map(r => r.dur)), coord: sc(1 - inter) },
        note: `${pct(1 - spec)} of runs are free of specification and verification failures; ${pct(inter)} show inter-agent misalignment.` };
    });
  }

  function poolEntrants(P) {
    if (!P || !P.rows) return [];
    const c = {}; P.cols.forEach((k, i) => { c[k] = i; });
    const mk = (rows, name, id) => {
      const n = rows.length, g = k => rows.map(r => r[c[k]]), calls = sum(g('calls')) || 1, errs = sum(g('errs')), ver = sum(g('tests')), vf = sum(g('testsFail')), delivered = rows.filter(r => r[c.work] > 0).length / n;
      return { id, src: 'mimo', name, type: 'pool', n, nLabel: n + ' sessions, 1 agent each', s: { outcome: sc(0.5 * (ver >= 3 ? 1 - vf / ver : 0.5) + 0.5 * delivered), reliability: sc((1 - sum(g('lost')) / n) * (1 - Math.min(1, 2 * errs / calls))), efficiency: sc(1 - Math.min(1, (errs + sum(g('rework'))) / calls)), flow: flowScore(g('dur')), coord: null },
        note: `${pct(delivered)} of sessions produced a file change, commit or passing check; ${ver ? pct(1 - vf / ver) + ' of ' + ver + ' checks passed' : 'no checks were run'}.` };
    };
    const by = {}; P.rows.forEach(r => { (by[r[c.cat]] = by[r[c.cat]] || []).push(r); });
    return Object.entries(by).filter(([, r]) => r.length >= 16).map(([k, r]) => mk(r, `${P.model} · ${k.replace(/_/g, ' ')}`, 'pl' + k)).concat([mk(P.rows, `${P.model} · all tasks`, 'plall')]);
  }

  function prodEntrants(P) {
    return P.map(p => ({ id: 'p' + p.id, src: 'semi', name: 'Production ' + p.id + ' (' + p.agents + ' agents)', type: 'prod', n: p.agents, nLabel: p.agents + ' agents, ' + p.reqs + ' requests', s: { outcome: null, reliability: null, efficiency: null, flow: flowScore(p.t.subs.map(x => x.t1 - x.t0)), coord: null }, note: 'Timing only: no outcomes, errors or tool names are recorded.' }));
  }

  function composite(e) {
    let tw = 0, aw = 0, ws = 0;
    DIMS.forEach(([k]) => { const w = weights[k]; tw += w; if (e.s[k] != null) { aw += w; ws += w * e.s[k]; } });
    const cov = tw ? aw / tw : 0, raw = aw ? ws / aw : null;
    return { raw, score: raw == null ? null : 50 + (raw - 50) * cov, cov };   // unmeasured dimensions pull the score toward 50
  }

  // ---------- rendering ----------
  const cell = v => v == null ? '<td class="bn">–</td>' : `<td class="bn" style="background:${v >= 65 ? 'rgba(52,211,153,' : v >= 40 ? 'rgba(240,180,41,' : 'rgba(248,113,113,'}${(0.12 + 0.28 * Math.abs(v - 50) / 50).toFixed(2)})">${Math.round(v)}</td>`;

  function ranked() {
    let list = E.concat(COMM, CHAL ? [CHAL] : [], YOU ? [YOU] : []).map(e => { const o = Object.assign({}, e, composite(e), { owner: ownerOf(e) }); o.disp = disp(o); return o; });
    const keep = e => e.you || e.chal;
    if (filt === 'teams') list = list.filter(e => keep(e) || ['swarm', 'coop', 'mast'].includes(e.type));
    else if (filt === 'single') list = list.filter(e => keep(e) || ['single', 'solo', 'pool'].includes(e.type));
    else if (filt !== 'all') list = list.filter(e => keep(e) || e.type === filt);
    const all = list.filter(e => e.cov >= 0.5 && e.score != null).sort((p, q) => q.score - p.score), cnt = {}; all.forEach(e => { if (e.owner != null) cnt[e.owner] = (cnt[e.owner] || 0) + 1; });
    const isSolo = e => ['single', 'solo', 'pool'].includes(e.type) && !e.you && !e.chal;
    const nas = filt === 'single' ? [] : all.filter(isSolo);
    const rk = bestPerOwner(filt === 'single' ? all : all.filter(e => !isSolo(e))); rk.forEach(e => { e.more = e.owner != null && byUser ? cnt[e.owner] - 1 : 0; });
    const un = list.filter(e => !(e.cov >= 0.5 && e.score != null));
    return { rk, un, all, nas };
  }

  const gcolHex = g => GCOL[g].slice(1);
  function datasetCards(rk) {
    if (!D || !D.corpus) return '';
    const by = {}; rk.filter(e => e.src && !e.you && !e.chal).forEach(e => { (by[e.src] = by[e.src] || []).push(e); });
    const base = location.origin + location.pathname;
    const rows = Object.entries(by).map(([k, es]) => { const med = median(es.map(e => e.score)), g = grade(med), so = D.corpus.sources[k]; return { k, es, med, g, so }; }).sort((p, q) => q.med - p.med).map(r => {
      const md = `[![Swarm grade: ${r.g} ${Math.round(r.med)}](https://img.shields.io/badge/swarm%20grade-${r.g}%20${Math.round(r.med)}-${gcolHex(r.g)})](${base}#d=${r.k})`;
      return `<tr><td class="txt"><b>${r.so ? `<a href="${esc(r.so.url)}" target="_blank" rel="noopener noreferrer">${esc(r.so.repo)}</a>` : esc(r.k)}</b><br><span class="sub">${esc(r.so ? r.so.license : '')} · ${r.es.length} ranked</span></td><td><span class="grade" style="background:${GCOL[r.g]}">${r.g}</span></td><td class="bn">${Math.round(r.med)}</td><td class="txt"><button type="button" data-copy="${esc(md)}">Copy badge</button></td></tr>`;
    }).join('');
    return `<div class="swc"><header><h3>Dataset report cards</h3><p class="sub">Publishing agent traces on Hugging Face? Every public dataset in this benchmark has a median grade. Paste the badge into the dataset card so people see how your swarms score.</p></header><div class="scroll"><table class="m bench"><thead><tr><th>Dataset</th><th>Grade</th><th>Median</th><th>README badge</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function podium(rk) {
    const top = rk.filter(e => !e.you && !e.chal).slice(0, 3); if (top.length < 3 || filt === 'single') return '';
    const order = [top[1], top[0], top[2]], place = { 0: 2, 1: 1, 2: 3 };
    return `<div class="podium" aria-label="Top three">${order.map((e, i) => `<div class="pod p${place[i]}" data-ent="${esc(e.id)}"><i class="medal">${place[i]}</i><span class="pg" style="color:${GCOL[grade(e.score)]}">${grade(e.score)}</span><b>${esc(dname(e))}</b><span class="ps">${Math.round(e.score)}/100</span><span class="sub">${esc(TYPES[tk(e)])} · ${esc(e.nLabel)}</span></div>`).join('')}</div>`;
  }

  function naCard(nas) {
    if (!nas.length) return '';
    const by = {}; nas.forEach(e => { (by[e.owner] = by[e.owner] || []).push(e); });
    const li = Object.entries(by).sort((p, q) => q[1].length - p[1].length).map(([o, es]) => `<li><b>@${esc(o)}</b> <span class="sub">N/A: ${es.length} single-agent run${es.length > 1 ? 's' : ''}, no sub-agents. Scored as a control at ${Math.round(median(es.map(e => e.score)))} (${grade(median(es.map(e => e.score)))}).</span></li>`).join('');
    return `<div class="swc"><header><h3>Didn't even swarm</h3><p class="sub">One agent, no helpers: no rank, just N/A. Their scores sit here as the control group, and the "Single agents" filter above shows them ranked.</p></header><ul class="na-list">${li}</ul></div>`;
  }

  function challengeBanner() {
    return `<div class="chalbar" role="status"><b>${esc(CHAL.name)}</b> scored <b>${CHAL.grade}</b> (${Math.round(CHAL.score0)}) and is challenging you. Drop your logs above to see if you can beat it.</div>`;
  }

  // Rank a prospective entrant among everyone else, using the current weights.
  function place(e) {
    const c = composite(e), others = E.concat(COMM, CHAL ? [CHAL] : []).filter(x => x.id !== e.id).map(x => Object.assign(composite(x), { owner: ownerOf(x) })).filter(x => x.cov >= 0.5 && x.score != null);
    const better = bestPerOwner(others).filter(x => x.score > c.score).length;
    return { score: c.score, rank: better + 1, of: others.length + 1, pct: others.length ? 1 - better / others.length : 1 };
  }

  function mastCard(M) {
    const g = {}; M.rows.forEach(r => { (g[r.f] = g[r.f] || []).push(r); });
    const ents = Object.entries(g).filter(([, rr]) => rr.length >= 10).map(([f, rr]) => {
      const n = rr.length, spec = rr.filter(r => r.cat[0] || r.cat[2]).length / n, inter = rr.filter(r => r.cat[1]).length / n;
      return { name: f, n, s: { outcome: sc(1 - spec), reliability: sc(1 - Math.min(1, mean(rr.map(r => r.nfm)) / 5)), efficiency: null, flow: flowScore(rr.filter(r => r.dur).map(r => r.dur)), coord: sc(1 - inter) } };
    }).map(e => Object.assign(e, composite(e))).filter(e => e.score != null).sort((p, q) => q.score - p.score);
    const groups = mastEntrants(M).map(e => Object.assign({}, e, composite(e))).filter(e => e.cov >= 0.5).sort((p, q) => q.score - p.score);
    const row = (e, i, full) => `<tr><td>${i + 1}</td><td class="txt"><b>${esc(e.name)}</b>${full ? '' : `<br><span class="sub">${e.n} runs</span>`}</td><td><span class="grade" style="background:${GCOL[grade(e.score)]}">${grade(e.score)}</span></td><td class="bn"><b>${Math.round(e.score)}</b></td>${DIMS.map(([k]) => cell(e.s[k])).join('')}<td class="bn">${e.n}</td></tr>`;
    const head = `<thead><tr><th>#</th><th>Team</th><th>Grade</th><th>Score</th>${DIMS.map(d => `<th title="${esc(d[2])}">${d[1]}</th>`).join('')}<th>Runs</th></tr></thead>`;
    return `<div class="swc" id="sw-rank"><header><h3>Swarm ranking: frameworks</h3><p class="sub">The same composite grade as the Swarm benchmark tab, built from MAST's failure labels. Efficiency is not measurable here, so scores are pulled toward 50 by the missing share. Weights are the ones set on the benchmark tab.</p></header>
      <div class="scroll"><table class="m bench">${head}<tbody>${ents.map((e, i) => row(e, i, true)).join('')}</tbody></table></div>
      <p class="sub" style="margin-top:12px">Best and worst framework, benchmark and model combinations (at least 10 runs each):</p>
      <div class="scroll"><table class="m bench">${head}<tbody>${groups.slice(0, 6).map((e, i) => row(e, i)).join('')}<tr><td colspan="10" class="sub">…</td></tr>${groups.slice(-6).map((e, i) => row(e, groups.length - 6 + i)).join('')}</tbody></table></div></div>`;
  }

  function paint() {
    const el = host.querySelector('#bn-results'); if (!el) return;
    const { rk, un, all, nas } = ranked(), T = theme(), ctx = C.Ctx(), narrow = (el.clientWidth || window.innerWidth) < 640;
    const rows = rk.map((e, i) => `<tr class="${sel === e.id ? 'sel' : ''}${e.you ? ' you' : ''}${e.chal ? ' chal' : ''}" data-ent="${esc(e.id)}"><td>${i + 1}</td><td class="txt"><b>${esc(dname(e))}</b><br><span class="sub" title="${esc(e.name)}">${esc(e.you ? (TYPES[e.type] || '') + ' · your run' : TYPES[tk(e)])} · ${esc(e.nLabel)}${e.more ? ' · +' + e.more + ' more run' + (e.more > 1 ? 's' : '') : ''}</span></td><td><span class="grade" style="background:${GCOL[grade(e.score)]}">${grade(e.score)}</span></td><td class="bn"><b>${Math.round(e.score)}</b></td>${DIMS.map(([k]) => cell(e.s[k])).join('')}<td class="bn">${pct(e.cov)}</td></tr>`).join('');
    const unRows = un.map(e => `<li><b>${esc(dname(e))}</b> <span class="sub">(${esc(TYPES[e.type])}) · ${esc(e.nLabel)}. Only ${pct(e.cov)} of the score could be measured. ${esc(e.note)}</span></li>`).join('');
    const pick = rk.find(e => e.id === sel) || rk[0];
    const bar = rk.length ? plot(ctx, Math.max(260, rk.length * 22 + 80), [{ type: 'bar', orientation: 'h', y: rk.map(e => shortT(dname(e), narrow ? 16 : 44)).reverse(), x: rk.map(e => e.score).reverse(), marker: { color: rk.map(e => TCOL[tk(e)]).reverse() }, text: rk.map(e => grade(e.score) + ' ' + Math.round(e.score)).reverse(), textposition: 'outside', cliponaxis: false,
      customdata: rk.map(e => TYPES[tk(e)] + ' · ' + e.nLabel).reverse(), hovertemplate: '%{y}<br>%{x:.0f} (%{customdata})<extra></extra>' }],
      L({ margin: { l: narrow ? 110 : 280, r: narrow ? 44 : 50 }, xaxis: { range: [0, 105], title: { text: 'composite score' } }, yaxis: { tickfont: { size: 11 } }, shapes: GRADES.slice(0, 4).map(g => ({ type: 'line', x0: g[0], x1: g[0], yref: 'paper', y0: 0, y1: 1, line: { color: T.muted, width: 1, dash: 'dot' } })) })) : na('No entrant has enough measurable dimensions under the current filter.');
    const heat = rk.length ? plot(ctx, Math.max(260, rk.length * 22 + 100), [{ type: 'heatmap', z: rk.map(e => DIMS.map(([k]) => e.s[k])), x: DIMS.map((d, i) => narrow ? ['Outc.', 'Rel.', 'Eff.', 'Flow', 'Coord.'][i] : d[1]), y: rk.map(e => shortT(dname(e), narrow ? 14 : 40)), text: rk.map(e => DIMS.map(([k]) => e.s[k] == null ? 'n/a' : Math.round(e.s[k]))), texttemplate: '%{text}', zmin: 0, zmax: 100, colorscale: [[0, '#f87171'], [0.5, '#f0b429'], [1, '#34d399']], showscale: false, xgap: 2, ygap: 2, hoverongaps: false, hovertemplate: '%{y}<br>%{x}: %{z:.0f}<extra></extra>' }],
      L({ margin: { l: narrow ? 100 : 250 }, yaxis: { autorange: 'reversed', tickfont: { size: 11 } }, xaxis: { side: 'top' } })) : '';
    const bub = rk.filter(e => e.s.efficiency != null && e.s.outcome != null).length >= 3 ? plot(ctx, 320, Object.keys(TYPES).map(t => { const g = rk.filter(e => tk(e) === t && e.s.efficiency != null && e.s.outcome != null); return g.length ? { type: 'scatter', mode: 'markers', name: TYPES[t], x: g.map(e => e.s.efficiency), y: g.map(e => e.s.outcome), text: g.map(e => shortT(dname(e), 40)), marker: { color: TCOL[t], size: g.map(e => 10 + Math.min(22, Math.sqrt(e.n))), opacity: 0.8, line: { color: T.panel, width: 1 } }, hovertemplate: '%{text}<br>efficiency %{x:.0f}, outcome %{y:.0f}<extra></extra>' } : null; }).filter(Boolean),
      L({ showlegend: true, legend: { y: -0.25, x: 0, orientation: 'h' }, xaxis: { title: { text: 'efficiency (100 = no wasted spend)' }, range: [-2, 102] }, yaxis: { title: { text: 'outcome' }, range: [-2, 102] } })) : na('Efficiency and outcome are both measured for fewer than three entrants.');
    const radar = pick ? plot(ctx, 320, [{ type: 'scatterpolar', r: DIMS.map(([k]) => pick.s[k] == null ? 0 : pick.s[k]).concat([pick.s[DIMS[0][0]] || 0]), theta: DIMS.map(d => d[1]).concat([DIMS[0][1]]), fill: 'toself', fillcolor: 'rgba(111,140,255,0.25)', line: { color: PAL.a, width: 2 }, hovertemplate: '%{theta}: %{r:.0f}<extra></extra>' }],
      L({ margin: { l: 50, r: 50, t: 20, b: 20 }, polar: { bgcolor: 'rgba(0,0,0,0)', radialaxis: { range: [0, 100], gridcolor: T.line, linecolor: T.line, tickfont: { size: 10 } }, angularaxis: { gridcolor: T.line, linecolor: T.line } } })) : '';
    // auto-written read
    const swarms = rk.filter(e => !e.you && !e.chal && ['swarm', 'coop', 'mast'].includes(e.type)), singles = all.filter(e => !e.you && !e.chal && ['single', 'solo', 'pool'].includes(e.type));
    const top = rk[0], bot = rk[rk.length - 1];
    const fr = rk.find(e => e.id === 'fcall'), fs = rk.find(e => e.id === 'fsolo');
    const read = rk.length ? `${b(dname(top))} ranks first with a ${b(grade(top.score) + ' (' + Math.round(top.score) + ')')}; ${b(dname(bot))} is last with ${b(grade(bot.score) + ' (' + Math.round(bot.score) + ')')}. ${swarms.length && singles.length ? `The median multi-agent team scores ${b(Math.round(median(swarms.map(e => e.score))))} against ${b(Math.round(median(singles.map(e => e.score))))} for single agents.` : ''} ${fr && fs ? `On identical tasks, two cooperating agents score ${b(Math.round(fr.score))} against ${b(Math.round(fs.score))} for one agent.` : ''}` : '';
    el.innerHTML = `${podium(rk)}<div class="swc"><header><h3>Leaderboard</h3><p class="sub">${rk.length} ${byUser ? 'users' : 'runs'} ranked, ${un.length} without enough measurable dimensions. Click a row to see its profile. ${YOU ? 'Your run is highlighted.' : 'Drop your logs above to add yours.'}</p></header>
      <div class="scroll"><table class="m bench"><thead><tr><th>#</th><th>User</th><th>Grade</th><th>Score</th>${DIMS.map(d => `<th title="${esc(d[2])}">${d[1]}</th>`).join('')}<th title="Share of the weighted score that could be measured; missing share pulls the score toward 50">Coverage</th></tr></thead><tbody>${rows || '<tr><td colspan="10">Nothing to rank under this filter.</td></tr>'}</tbody></table></div>
      ${read ? `<p class="read">${read}</p>` : ''}</div>
      <div class="swc"><header><h3>Composite score</h3><p class="sub">Dotted lines mark grade boundaries (35, 50, 65, 80). Colour is the kind of swarm.</p></header>${bar}</div>
      <div class="grid2 wide"><div class="swc"><header><h3>Score by dimension</h3></header>${heat}</div><div class="swc"><header><h3>${pick ? esc(shortT(dname(pick), 40)) : 'Profile'}</h3><p class="sub">${pick ? esc(pick.note) : ''}</p></header>${radar}</div></div>
      <div class="swc"><header><h3>Efficiency against outcome</h3><p class="sub">Up and to the right is better: more of the work holds up, and less spend is wasted.</p></header>${bub}</div>
      ${unRows ? `<div class="swc"><header><h3>Not enough data to rank</h3></header><ul class="na-list">${unRows}</ul></div>` : ''}${naCard(nas)}${datasetCards(all)}`;
    W && window.Swarms.loadPlotly().then(() => ctx.draws.forEach(f => { try { f(); } catch (e) { console.error(e); } })).catch(() => { el.insertAdjacentHTML('afterbegin', '<p class="err">Charts could not load.</p>'); });
  }

  function shell() {
    const chip = (v, t) => `<button type="button" data-bf="${v}" aria-pressed="${filt === v}">${esc(t)}</button>`;
    const sliders = DIMS.map(([k, n, d]) => `<label class="slider"><span><b>${n}</b> <i id="bw-${k}">${weights[k]}</i></span><input type="range" min="0" max="100" step="5" value="${weights[k]}" data-w="${k}" aria-label="${esc(n)} weight"><span class="sub">${esc(d)}</span></label>`).join('');
    host.querySelector('#bn-main').innerHTML = `<span id="bn-top"></span>${CHAL ? challengeBanner() : ''}<details id="intro" class="intro"><summary>What this ranks and how the score works</summary><div class="grid3">
      <div><h3>In plain English</h3><p>Every public swarm in the Public swarms tab gets one score from 0 to 100 and a letter grade, so they can be ranked against each other. A swarm is any team of AI agents working one task: a lead agent with helpers, a pair, or a ready-made framework with a CEO and a tester.</p></div>
      <div><h3>How the score works</h3><p>Five dimensions, each scored 0 to 100 from the logs: <b>Outcome</b>, <b>Reliability</b>, <b>Efficiency</b>, <b>Flow</b> and <b>Coordination</b>. The score is their weighted average. If a source cannot measure a dimension (a text-only log has no cost, say), it is left out and the weights of the others are rescaled. Swarms with under half of the weight measurable are listed but not ranked, and a score built from fewer dimensions is pulled toward 50 in proportion to what is missing, so thinly measured swarms cannot top the table on proxies alone.</p></div>
      <div><h3>Grades</h3><p><b>A</b> 80 and up, <b>B</b> 65 to 79, <b>C</b> 50 to 64, <b>D</b> 35 to 49, <b>F</b> under 35. Move the sliders to decide what matters: the leaderboard re-ranks instantly. Scores compare swarms inside this sample; they are not a grade against the whole world.</p></div></div>
      <div class="weights" role="group" aria-label="Weights">${sliders}<button type="button" data-reset="1">Reset weights</button></div></details>
      <div class="lenses" role="group" aria-label="Filter">${chip('all', 'All')}${chip('teams', 'Multi-agent teams')}${chip('single', 'Single agents')}${chip('swarm', 'Claude Code swarms')}${chip('coop', 'CooperBench pairs')}${chip('mast', 'Framework teams (MAST)')}${chip('prod', 'Production traces')}<button type="button" data-bu="1" aria-pressed="${!byUser}" title="Show every run instead of one row per user">Every run</button>${COMM.length ? chip('user', 'Community (' + COMM.length + ')') : ''}</div>
      <div id="bn-results"></div>
      <details id="how"><summary>Method, formulas and caveats</summary><ul>
      <li><b>Outcome.</b> Claude Code swarms: half the share of verification runs that passed (50% if none were run, since correctness is then unproven) plus half the share of agents that delivered anything. CooperBench: share of required features that passed. MAST: share of runs free of specification and verification failure modes.</li>
      <li><b>Reliability.</b> Claude Code: share of agents not lost, times one minus twice the failed-call rate. CooperBench: share of agents that did not error out. MAST: one minus mean failure modes per run divided by five.</li>
      <li><b>Efficiency.</b> One minus the share of spend or effort that produced nothing: failed and redone calls plus spend by lost agents (Claude Code); spend on agents whose work did not pass (CooperBench). Not measurable for MAST or production traces.</li>
      <li><b>Flow.</b> 100 divided by one plus the coefficient of variation of cycle times (sub-agent task or work-burst durations, task durations, or run durations): the steadier the time to finish, the higher.</li>
      <li><b>Coordination.</b> Claude Code swarms: share of agents with a load-bearing role (not lost, not mostly failing, not a pure taskmaster or poller), reduced when more than 10 run at once. CooperBench: share of pairs whose changes merged cleanly. MAST: share of runs without inter-agent misalignment failures. Not defined for single agents.</li>
      <li><b>Caveats.</b> Only a few real swarms with full transcripts exist, so the Claude Code entries are a handful of sessions, not a population. Different sources measure different things, so a score is best compared within the same kind first; the coverage column shows how much of each score is measured. Outcome measures differ: for MAST it is a process-quality proxy, not task correctness. The weights are a judgement, which is why they are sliders.</li></ul></details>`;
    paint();
  }

  async function open(el) {
    host = el;
    if (!D) {
      el.innerHTML = '<p class="sub">Scoring public swarms...</p>';
      try {
        D = await window.Swarms.ensure();
        E = D.deep.map(deepEntrant).concat(fleetEntrants(D.fleet), mastEntrants(D.mast), poolEntrants(D.corpus.pool), prodEntrants(D.prod));
        const m = /[#&]c=([\w-]+)/.exec(location.hash);
        if (m) { try { const c = window.Grade.unb64u(m[1]); CHAL = { id: 'chal', chal: true, name: '@' + (c.h || 'a challenger'), type: c.n > 1 ? 'swarm' : 'single', n: c.n || 1, nLabel: (c.n || 1) + ' agents (challenge link)', grade: c.g, score0: c.s, s: Object.fromEntries(DIMS.map(([k], i) => [k, c.d && c.d[i] != null ? +c.d[i] : null])), note: 'From a shared challenge link.' }; } catch (err) { /* ignore malformed link */ } }
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
    try { const r = await (await fetch(api.replace(/\/$/, '') + '/board')).json(); COMM = (r.rows || []).map(x => ({ id: 'u' + x.h, name: '@' + x.h, type: 'user', n: x.n || 1, nLabel: (x.n || 1) + ' agents, community', s: Object.fromEntries(DIMS.map(([k]) => [k, x.s && x.s[k] != null ? +x.s[k] : null])), note: 'Submitted by a community member.' })); if (host && host.querySelector('#bn-results')) paint(); } catch (e) { /* board offline */ }
  }

  function apiObj() {
    const commCount = () => COMM.length;
    const statsFn = () => { const a = D.deep.flatMap(s => s.agents); return [[(D.mast.rows.length + D.fleet.agents.length + D.corpus.pool.rows.length).toLocaleString(), 'agent runs scored'], [String(D.deep.length), 'Claude Code sessions'], [sum(a.map(x => x.calls)).toLocaleString(), 'tool calls read'], [String(Object.keys(D.corpus.sources).length), 'open datasets']]; };
    return { commCount, stats: statsFn, owner: e => disp(Object.assign({}, e, { owner: ownerOf(e) })), DIMS, GCOL, grade, place, count: () => bestPerOwner(E.map(x => Object.assign(composite(x), { owner: ownerOf(x) })).filter(x => x.cov >= 0.5 && x.score != null)).length,
      you: s => Object.assign(deepEntrant(s), { you: true, id: 'you' }), setYou: e => { YOU = e; if (e) sel = 'you'; }, setHandle: () => paint(), repaint: paint, refreshCommunity,
      demoEntrant: () => { const r = E.map(e => Object.assign({}, e, composite(e))).filter(e => e.type === 'swarm' && e.cov >= 0.5).sort((p, q) => q.score - p.score)[0]; return r ? Object.assign({}, r) : null; } };
  }

  function bind(el) {
    el.addEventListener('click', e => {
      if (e.target.closest('[data-bu]')) { byUser = !byUser; shell(); return; }
      const f = e.target.closest('[data-bf]'); if (f) { filt = f.dataset.bf; sel = null; shell(); return; }
      if (e.target.closest('[data-reset]')) { weights = Object.assign({}, DEFAULT_W); shell(); return; }
      const r = e.target.closest('[data-ent]'); if (r) { sel = r.dataset.ent; paint(); }
    });
    el.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.w; if (!k) return; weights[k] = +e.target.value; const l = el.querySelector('#bw-' + k); if (l) l.textContent = weights[k]; clearTimeout(bind.t); bind.t = setTimeout(paint, 120); });
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!el.hidden && D) paint(); });
  }

  window.Bench = { open, bind, mastCard };
})();
