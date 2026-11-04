(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ORDER = ['bench', 'pub'];

  function setTab(t) {
    document.querySelectorAll('[role="tab"]').forEach(b => { const on = b.dataset.tab === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $('pane-bench').hidden = t !== 'bench'; $('pane-pub').hidden = t !== 'pub';
    if (t === 'bench') window.Bench.open($('pane-bench'));
    if (t === 'pub') window.Swarms.open($('pane-pub'));
  }

  window.Swarms.bind($('pane-pub')); window.Bench.bind($('pane-bench'));
  const tl = document.querySelector('[role="tablist"]');
  tl.addEventListener('click', e => { const b = e.target.closest('[role="tab"]'); if (b) setTab(b.dataset.tab); });
  tl.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = ORDER[(ORDER.indexOf(e.target.dataset.tab) + 1) % ORDER.length]; setTab(next); $('tab-' + next).focus();
  });
  document.querySelectorAll('[data-go]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); if (a.dataset.go === 'pro') $('pro').scrollIntoView({ behavior: 'smooth' }); else { setTab('bench'); const t = $('bn-top') || $('pane-bench'); t.scrollIntoView({ behavior: 'smooth' }); } }));

  // Stripe Payment Link from config.js; stays disabled until one is set.
  const cfg = window.SWARM_CONFIG || {}, cta = $('pro-cta');
  if (cfg.STRIPE_LINK) { cta.href = cfg.STRIPE_LINK; cta.target = '_blank'; cta.rel = 'noopener noreferrer'; cta.textContent = 'Upgrade with Stripe'; $('pro-price').textContent = cfg.PRICE || ''; $('nav-pro').hidden = false; }
  else { cta.setAttribute('aria-disabled', 'true'); cta.textContent = 'Coming soon'; }

  setTab('bench');
})();
