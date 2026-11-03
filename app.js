(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  let data = null, openId = null;
  const st = { metric: 'cost', vendor: 'all', prices: {} };
  try { st.prices = JSON.parse(localStorage.getItem('prices') || '{}'); } catch (e) { /* storage unavailable */ }

  const money = n => '$' + (n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(2));
  const tok = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(Math.round(n));
  const day = iso => iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const tokensOf = s => Object.values(s.tokens || {}).reduce((a, b) => a + (b || 0), 0);
  const gradeColor = sc => sc >= 90 ? '#16a34a' : sc >= 80 ? '#2563eb' : sc >= 70 ? '#d97706' : sc >= 60 ? '#ea580c' : '#dc2626';

  // Cost: recorded for Claude; estimated for Antigravity once every model it used has a price.
  function costOf(s) {
    if (s.vendor === 'claude') return s.cost == null ? null : { v: s.cost, est: false };
    const ms = Object.entries(s.models || {});
    if (!ms.length) return null;
    let total = 0;
    for (const [name, m] of ms) {
      const p = st.prices[name];
      if (!p || p.in === '' || p.cr === '' || p.out === '' || p.in == null || p.cr == null || p.out == null) return null;
      total += (m.input * +p.in + m.cacheRead * +p.cr + m.output * +p.out) / 1e6;
    }
    return { v: total, est: true };
  }

  async function decrypt(pw, enc) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(enc.salt), iterations: enc.iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  function tile(v, label) { return `<div class="tile"><b>${esc(v)}</b><span>${esc(label)}</span></div>`; }

  function renderTiles() {
    const all = data.sessions, cl = all.filter(s => s.vendor === 'claude'), ag = all.filter(s => s.vendor === 'antigravity');
    const claudeSpend = cl.reduce((a, s) => a + (s.cost || 0), 0);
    const agCosts = ag.map(costOf);
    const agKnown = agCosts.every(Boolean);
    const agSpend = agCosts.reduce((a, c) => a + (c ? c.v : 0), 0);
    const graded = cl.filter(s => s.score != null);
    const avg = graded.length ? Math.round(graded.reduce((a, s) => a + s.score, 0) / graded.length) : null;
    $('tiles').innerHTML = [
      tile(String(all.length), `sessions (${cl.length} Claude, ${ag.length} Antigravity)`),
      tile(money(claudeSpend), 'Claude spend recorded'),
      tile(agKnown ? money(agSpend) : 'n/a', agKnown ? 'Antigravity spend (estimate)' : 'Antigravity: dollars not recorded'),
      tile(tok(all.reduce((a, s) => a + tokensOf(s), 0)), 'tokens processed'),
      tile(avg == null ? 'n/a' : String(avg), 'average Claude score'),
    ].join('');
  }

  function rowHtml(s, rank, max, dim, metric) {
    const c = costOf(s), t = tokensOf(s);
    const useCost = metric === 'cost' && !dim;
    const value = useCost ? c.v : t;
    const w = max > 0 ? Math.max(1, (value / max) * 100) : 0;
    const valTxt = useCost ? money(c.v) + (c.est ? ' est.' : '') : tok(t) + ' tok';
    const grade = s.grade ? `<div class="gr" style="background:${gradeColor(s.score)}" title="${s.score}/100">${esc(s.grade)}</div>` : '<div class="gr none" title="Not graded">-</div>';
    const meta = `<span class="tag ${s.vendor}">${s.vendor === 'claude' ? 'Claude' : 'Antigravity'}</span>${esc(s.proj)} · ${esc(day(s.date))} · ${s.vendor === 'claude' ? esc((s.turns || 0).toLocaleString()) + ' turns' : esc((s.steps || 0).toLocaleString()) + ' steps'}`;
    const open = openId === s.id;
    return `<div class="row" role="button" tabindex="0" aria-expanded="${open}" data-id="${esc(s.id)}">
      <div class="rk">${rank == null ? '' : rank}</div>
      <div class="mid"><div class="ttl">${esc(s.title)}</div><div class="meta">${meta}</div><div class="track"><i class="${s.vendor}${dim ? ' dim' : ''}" style="width:${w}%"></i></div></div>
      <div class="val${dim ? ' dim' : ''}">${valTxt}</div>${grade}</div>${open ? detailHtml(s) : ''}`;
  }

  function detailHtml(s) {
    if (s.vendor === 'antigravity') {
      const ms = Object.entries(s.models || {}).map(([n, m]) => `<tr><td>${esc(n)}</td><td>${m.gens}</td><td>${tok(m.input)}</td><td>${tok(m.cacheRead)}</td><td>${tok(m.output)}</td></tr>`).join('');
      const ctx = s.window ? Math.round(100 * s.maxContext / s.window) + '% of window' : tok(s.maxContext);
      return `<div class="detail">
        <div class="facts"><div><span>Steps </span><b>${(s.steps || 0).toLocaleString()}</b></div><div><span>Generations </span><b>${(s.generations || 0).toLocaleString()}</b></div><div><span>Peak context </span><b>${esc(ctx)}</b></div><div><span>Status </span><b>${esc(s.status)}</b></div></div>
        <div class="scroll"><table class="m"><tr><th>Model</th><th>Calls</th><th>Input</th><th>Cache read</th><th>Output</th></tr>${ms}</table></div>
        <p class="sub">Not graded: Antigravity does not expose tool-level detail. Token fields are decoded from an undocumented format and are approximate.</p></div>`;
    }
    const comps = s.components ? Object.entries({ Reliability: s.components.reliability, Focus: s.components.focus, Efficiency: s.components.efficiency, Leverage: s.components.leverage })
      .map(([k, v]) => `<div class="comp"><span>${k}</span><div class="t"><i style="width:${Math.round(v)}%;background:${gradeColor(v)}"></i></div><b>${Math.round(v)}</b></div>`).join('') : '';
    const tips = (s.tips || []).map((t, i) => `<div class="tip"><b>${esc(t.title)}</b><span>${esc(t.detail)}</span>${t.tryIt ? `<div class="try"><q>${esc(t.tryIt)}</q><button type="button" data-copy="${esc(s.id)}:${i}">Copy</button></div>` : ''}</div>`).join('');
    const models = Object.entries(s.modelTurns || {}).map(([k, v]) => `${esc(k)} (${v})`).join(', ');
    return `<div class="detail">
      <div class="facts"><div><span>Turns </span><b>${(s.turns || 0).toLocaleString()}</b></div><div><span>Tool calls </span><b>${(s.calls || 0).toLocaleString()}</b></div><div><span>Your prompts </span><b>${s.human || 0}</b></div><div><span>Hidden helper </span><b>${s.helperCost ? money(s.helperCost) : 'none'}</b></div><div><span>Sub-agents </span><b>${s.subagents || 0}</b></div></div>
      ${models ? `<div class="sub">Models: ${models}</div>` : ''}
      ${comps ? `<div><h3>Grade</h3>${comps}</div>` : ''}
      ${tips ? `<div><h3>Coach</h3>${tips}</div>` : '<p class="sub">Too short to grade.</p>'}
      ${(s.strengths || []).length ? `<p class="good">Doing well: ${s.strengths.map(esc).join(' ')}</p>` : ''}</div>`;
  }

  function renderBoard() {
    document.querySelectorAll('#seg-metric button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === st.metric)));
    document.querySelectorAll('#seg-vendor button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === st.vendor)));
    $('bh').textContent = st.metric === 'cost' ? 'Leaderboard by cost' : 'Leaderboard by tokens';
    const list = data.sessions.filter(s => st.vendor === 'all' || s.vendor === st.vendor);
    let html = '';
    if (st.metric === 'cost') {
      const priced = list.filter(costOf).sort((a, b) => costOf(b).v - costOf(a).v);
      const rest = list.filter(s => !costOf(s)).sort((a, b) => tokensOf(b) - tokensOf(a));
      const max = priced.length ? costOf(priced[0]).v : 0;
      html += priced.map((s, i) => rowHtml(s, i + 1, max, false, 'cost')).join('');
      if (rest.length) {
        html += `<div class="group">No cost recorded: ranked by tokens${st.vendor !== 'claude' ? '. Add prices below to rank Antigravity by estimated cost.' : '.'}</div>`;
        const mt = tokensOf(rest[0]);
        html += rest.map(s => rowHtml(s, null, mt, true, 'cost')).join('');
      }
    } else {
      const sorted = list.slice().sort((a, b) => tokensOf(b) - tokensOf(a));
      const max = sorted.length ? tokensOf(sorted[0]) : 0;
      html = sorted.map((s, i) => rowHtml(s, i + 1, max, false, 'tokens')).join('');
    }
    $('board').innerHTML = html || '<p class="sub">No sessions.</p>';
  }

  function renderPrices() {
    const names = [...new Set(data.sessions.filter(s => s.vendor === 'antigravity').flatMap(s => Object.keys(s.models || {})))].sort();
    $('prices').innerHTML = `<div class="pm"><span class="h nm">Model</span><span class="h">Input $/M</span><span class="h">Cache read $/M</span><span class="h">Output $/M</span></div>` +
      names.map(n => { const p = st.prices[n] || {}; const f = k => `<input inputmode="decimal" data-model="${esc(n)}" data-k="${k}" value="${p[k] == null ? '' : esc(p[k])}" aria-label="${esc(n)} ${k}">`;
        return `<div class="pm"><span class="nm">${esc(n)}</span>${f('in')}${f('cr')}${f('out')}</div>`; }).join('');
  }

  function renderAll() { renderTiles(); renderBoard(); }

  function mineSummary() {
    const cl = data.sessions.filter(s => s.vendor === 'claude');
    return { claudeSessions: cl.length, withSubs: cl.filter(s => s.subagents > 0).length, totalSubs: cl.reduce((a, s) => a + (s.subagents || 0), 0) };
  }

  function setTab(t) {
    document.querySelectorAll('[role="tab"]').forEach(b => { const on = b.dataset.tab === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $('pane-mine').hidden = t !== 'mine'; $('pane-pub').hidden = t !== 'pub'; $('app').classList.toggle('wide', t === 'pub');
    if (t === 'pub' && data) window.Swarms.open($('pane-pub'), mineSummary());
  }

  function show() {
    setTab('mine');
    $('lock').hidden = true; $('app').hidden = false; $('err').textContent = '';
    $('gen').textContent = 'Snapshot taken ' + new Date(data.generated).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    $('foot').textContent = data.note || '';
    renderPrices(); renderAll();
  }

  function lock() {
    data = null; openId = null; $('app').hidden = true; $('lock').hidden = false; $('pw').value = ''; $('err').textContent = '';
    $('board').innerHTML = $('tiles').innerHTML = $('pane-pub').innerHTML = '';
    $('pw').focus();
  }

  window.Swarms.bind($('pane-pub'));
  $('app').querySelector('[role="tablist"]').addEventListener('click', e => { const b = e.target.closest('[role="tab"]'); if (b) setTab(b.dataset.tab); });
  $('app').querySelector('[role="tablist"]').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = e.target.dataset.tab === 'mine' ? 'pub' : 'mine'; setTab(next); $('tab-' + next).focus();
  });

  $('f').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('go'), pw = $('pw').value;
    if (!pw) return;
    btn.disabled = true; $('err').textContent = 'Unlocking...';
    try {
      const enc = await (await fetch('data.enc.json', { cache: 'no-store' })).json();
      data = await decrypt(pw, enc);
      $('pw').value = '';
      show();
    } catch (err) {
      $('err').textContent = err && err.name === 'OperationError' ? 'Wrong passphrase.' : 'Could not unlock. Check the passphrase and try again.';
    } finally { btn.disabled = false; }
  });

  $('lockbtn').addEventListener('click', lock);
  $('seg-metric').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { st.metric = b.dataset.m; renderBoard(); } });
  $('seg-vendor').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { st.vendor = b.dataset.v; renderBoard(); } });

  function toggleRow(row) { const id = row.dataset.id; openId = openId === id ? null : id; renderBoard(); }
  $('board').addEventListener('click', async e => {
    const cb = e.target.closest('[data-copy]');
    if (cb) {
      const [id, i] = cb.dataset.copy.split(':'); const s = data.sessions.find(x => x.id === id);
      try { await navigator.clipboard.writeText(s.tips[+i].tryIt); cb.textContent = 'Copied'; setTimeout(() => { cb.textContent = 'Copy'; }, 1500); } catch (err) { cb.textContent = 'Select text'; }
      return;
    }
    const row = e.target.closest('.row'); if (row) toggleRow(row);
  });
  $('board').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('row')) { e.preventDefault(); toggleRow(e.target); } });

  $('prices').addEventListener('input', e => {
    const i = e.target.closest('input'); if (!i) return;
    const m = i.dataset.model, k = i.dataset.k, v = i.value.trim();
    st.prices[m] = st.prices[m] || { in: '', cr: '', out: '' };
    st.prices[m][k] = v === '' || isNaN(+v) ? '' : v;
    try { localStorage.setItem('prices', JSON.stringify(st.prices)); } catch (err) { /* ignore */ }
    renderAll();
  });
})();
