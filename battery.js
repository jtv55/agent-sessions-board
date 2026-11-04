// Workforce battery: pure computation over public-swarms.json (no DOM). Each function maps a human-workforce metric onto agent logs.
(() => {
  'use strict';
  const sum = a => a.reduce((x, y) => x + y, 0);
  const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  const share = (a, total) => total ? a / total : 0;
  const BUCKETS = ['Research', 'Build', 'Verify', 'Coordinate', 'Operate', 'Rework'];
  const KTLO = [4, 5];            // Operate + Rework: keeping the lights on
  const RATE = { 1: 0.3, 2: 1, 3: 2, 4: 3, 5: 5 };   // relative list-price index per level; Haiku = 1 (Anthropic's Haiku:Sonnet:Opus input ratio is 1:3:5)
  const LEVELS = { 1: 'L1 Intern', 2: 'L2 Associate', 3: 'L3 Mid', 4: 'L4 Senior', 5: 'L5 Principal' };
  // Activities that count as doing the job the title names. A verifier may verify by running checks or by reading code.
  const EXPECTS = { Verifier: [2, 0], Tester: [2], Reviewer: [0, 2], Researcher: [0], Planner: [0, 3], Builder: [1], Orchestrator: [3] };

  function tierOf(model) {
    const m = String(model || '').toLowerCase();
    if (!m) return 3;
    if (/qwen|llama|mistral|gemma|\b\d+b\b|small/.test(m)) return 1;
    if (/haiku/.test(m)) return 2;
    if (/sonnet/.test(m)) return 4;
    if (/opus|fable|mythos/.test(m)) return 5;
    return 3;
  }

  function merge(iv, slack) {
    const a = iv.slice().sort((x, y) => x[0] - y[0]), out = [];
    for (const [s, e] of a) { const l = out[out.length - 1]; if (l && s <= l[1] + slack) l[1] = Math.max(l[1], e); else out.push([s, e]); }
    return out;
  }

  // ---------- deep dives: real Claude Code transcripts ----------
  function enrich(s, a) {
    const ras = [0, 0, 0, 0, 0, 0];
    (a.ev || []).forEach(e => { ras[e[1]]++; });
    const calls = sum(ras), [tin, tcr, tcc, tout] = a.tok, proc = tin + tcr + tcc + tout;
    const lvl = tierOf(a.model);
    const mix = {};
    const turnsTotal = sum(Object.values(a.models || {})) || 1;
    Object.entries(a.models || {}).forEach(([m, n]) => { const l = tierOf(m); mix[l] = (mix[l] || 0) + n / turnsTotal; });
    if (!Object.keys(mix).length) mix[lvl] = 1;
    // A work unit is a file change, a commit, a passing check, or a sub-agent's delivered report.
    const work = a.edits + a.writes + a.commits + Math.max(0, a.tests - a.testsFail) + (a.layer > 0 && a.status === 'ok' && calls > 0 ? 1 : 0);
    const cx = 2 * (a.edits + a.writes) + 2 * a.commits + ras[2] + 0.5 * (ras[0] + ras[4]) + 0.5 * ras[5];
    // On a hosted API the cheapest rung is Haiku (L2); L1 only exists for self-hosted small models.
    const implied = Math.max(s.hosting === 'api' ? 2 : 1, cx < 4 ? 1 : cx < 12 ? 2 : cx < 40 ? 3 : cx < 120 ? 4 : 5);
    const cu = Object.entries(mix).reduce((acc, [l, w]) => acc + w * (tin + 0.1 * tcr + 1.25 * tcc + 5 * tout) / 1e6 * RATE[l], 0);
    const top = ras.indexOf(Math.max(...ras));
    return Object.assign({}, a, {
      sid: s.id, ras, calls, proc, lvl, mix, work, cx, implied, cu, top: calls ? top : -1, dur: Math.max(0, a.t1 - a.t0),
      emp: a.layer === 0 ? 'FTE' : 'Contractor', hosting: s.hosting, nTools: Object.keys(a.tools).length,
      overhead: share(tcr + tcc, proc), coord: ras[3], delegations: (a.tools.Task || 0) + (a.tools.Agent || 0) + (a.tools.Workflow || 0), polls: a.tools.TaskOutput || 0,
    });
  }

  function sessionStats(s) {
    const A = s.agents;
    const times = [];
    A.forEach(a => (a.ev || []).forEach(e => times.push([e[0], e[0] + 2])));
    const clusters = merge(times, 1800);
    const active = sum(clusters.map(c => c[1] - c[0]));
    const subs = A.slice(1), main = A[0];
    const squads = {};
    subs.forEach(a => { (squads[a.squad || '-'] = squads[a.squad || '-'] || []).push(a); });
    // verification outcomes and recovery time (verify failed -> next verify passed, same agent)
    let verifies = 0, verifyFails = 0; const mttr = [];
    A.forEach(a => {
      const ev = (a.ev || []).filter(e => e[1] === 2 || e[1] === 5);
      for (let i = 0; i < ev.length; i++) {
        if (ev[i][1] !== 2) continue;
        verifies++;
        if (ev[i][2]) { verifyFails++; for (let j = i + 1; j < ev.length; j++) if (ev[j][1] === 2 && !ev[j][2]) { if (ev[j][0] - ev[i][0] < 14400) mttr.push(ev[j][0] - ev[i][0]); break; } }
      }
    });
    const days = Math.max(1, Math.ceil(active / 28800));  // 8-hour working days
    const commits = sum(A.map(a => a.commits));
    return { clusters, active, squads, subs: subs.length, agents: A.length, verifies, verifyFails, mttr: median(mttr), commits, workDays: days,
      peak: peakConcurrency(subs) + 1, delegated: share(sum(subs.map(a => a.proc)), sum(A.map(a => a.proc))), main };
  }

  function peakConcurrency(subs) {
    const ev = [];
    subs.forEach(a => { ev.push([a.t0, 1]); ev.push([a.t1, -1]); });
    ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    let cur = 0, pk = 0;
    for (const [, d] of ev) { cur += d; pk = Math.max(pk, cur); }
    return pk;
  }

  function prepDeep(deep) {
    return deep.map(s => {
      const o = Object.assign({}, s, { agents: s.agents.map(a => enrich(s, a)) });
      o.stats = sessionStats(o);
      o.swarm = o.agents.length > 1;
      return o;
    }).sort((a, b) => b.agents.length - a.agents.length || b.stats.active - a.stats.active);
  }

  // Influence: who actually runs things. Tokens, outputs and coordination, equally weighted.
  function mayor(agents) {
    const T = sum(agents.map(a => a.proc)) || 1, W = sum(agents.map(a => a.work)) || 1, C = sum(agents.map(a => a.coord)) || 1;
    const ranked = agents.map(a => ({ a, inf: (a.proc / T + a.work / W + a.coord / C) / 3 })).sort((x, y) => y.inf - x.inf);
    return ranked;
  }

  function paretoCurve(vals) {
    const v = vals.slice().sort((a, b) => b - a), T = sum(v) || 1;
    let c = 0; const x = [0], y = [0];
    v.forEach((q, i) => { c += q; x.push((i + 1) / v.length); y.push(c / T); });
    const k = Math.max(1, Math.ceil(v.length * 0.2));
    return { x, y, topShare: sum(v.slice(0, k)) / T, k, n: v.length };
  }

  function percentileInGroup(vals, v) {
    if (vals.length < 2) return null;
    const mn = Math.min(...vals), mx = Math.max(...vals);
    return mx === mn ? 0.5 : (v - mn) / (mx - mn);
  }

  // ---------- fleet: CooperBench coop vs solo ----------
  function prepFleet(F) {
    const key = r => r.r + '|' + r.t + '|' + r.f;
    const soloBy = {}; F.solo.forEach(s => { soloBy[key(s)] = s; });
    const coop = F.coop.map(c => {
      const s = soloBy[key(c)];
      const passes = sum(c.a.map(x => x[6] ? 1 : 0)), cost = sum(c.a.map(x => x[1]));
      const heavy = c.a[0][1] >= c.a[1][1] ? 0 : 1;
      return Object.assign({}, c, { passes, cost, tokens: sum(c.a.map(x => x[3] + x[4])), steps: sum(c.a.map(x => x[2])), both: passes === 2, heavy,
        heavyShare: share(c.a[heavy][1], cost), solo: s || null, soloPasses: s ? s.p[0] + s.p[1] : null });
    });
    const solo = F.solo.map(s => Object.assign({}, s, { passes: s.p[0] + s.p[1], cost: s.a[1], tokens: s.a[3] + s.a[4], both: s.p[0] && s.p[1] ? 1 : 0 }));
    const agents = [];
    coop.forEach(c => c.a.forEach((a, i) => agents.push({ arm: 'coop', idx: i, row: c, err: a[0], cost: a[1], steps: a[2], tin: a[3], tout: a[4], patch: a[5], pass: a[6], ap: c.ap[i], repo: c.r })));
    solo.forEach(s => agents.push({ arm: 'solo', idx: 0, row: s, err: s.a[0], cost: s.a[1], steps: s.a[2], tin: s.a[3], tout: s.a[4], patch: s.a[5], pass: s.passes, ap: null, repo: s.r }));
    return { F, coop, solo, agents };
  }

  // Team size in U.S. Army units (thirteen.org, "U.S. Army Units Explained"). A team takes the largest unit whose lower bound it reaches,
  // so the gaps between the article's ranges fall to the smaller unit. "Fire team" is not in the article; it fills the 2 to 5 below a squad.
  const UNITS = [[2, 'Fire team', '2 to 5'], [6, 'Squad', '6 to 10'], [18, 'Platoon', '18 to 50'], [60, 'Company', '60 to 200'], [300, 'Battalion', '300 to 1,000'], [2000, 'Brigade', '2,000 to 5,000'], [10000, 'Division', '10,000 to 15,000'], [20000, 'Corps', '20,000 to 45,000'], [50000, 'Field army', '50,000 and more']];
  const unitOf = n => { let u = null; UNITS.forEach(x => { if (n >= x[0]) u = x; }); return u ? { name: u[1], range: u[2] } : { name: 'Lone agent', range: '1' }; };
  window.SWB = { unitOf, BUCKETS, KTLO, RATE, LEVELS, EXPECTS, tierOf, merge, sum, median, share, enrich, prepDeep, mayor, paretoCurve, percentileInGroup, prepFleet, peakConcurrency };
})();
