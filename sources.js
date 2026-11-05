(() => {
  'use strict';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const GROUPS = [
    { title: 'Teams that have run big swarms', sub: 'They describe real multi-agent runs but have not published the logs. We are asking.', items: [
      ['Axiom: Stacks Project in Lean', 'https://axiommath.ai/research/the-stacks-project-formalized/', 'About 16 million lines of Lean from a hierarchical system of agents working on thousands of theorems in parallel. No agent count or logs published.'],
      ['Axiom: Classification of Finite Simple Groups', 'https://axiommath.ai/research/the-enormous-theorem-formalized/', 'Swarms of dozens of agents over 24 days, 108 milestones and about 380 tasks. Lead, proof and integration agents coordinated through GitHub issues and Slack. Roles are described; no logs.'],
      ['Axiom: Stacks and CFSG code', 'https://github.com/AxiomMath/CFSG', 'The finished Lean code and certificates. The repos hold the output of the swarm, not its sessions.']
    ] },
    { title: 'Researchers who studied swarms', sub: 'Papers with real multi-agent runs behind them. Authors often have traces on hand.', items: [
      ['SwarmResearch', 'https://arxiv.org/html/2607.02807v1', 'A shepherd agent spawns and steers a population of search agents, built on Claude Code skills.'],
      ['Cheating and whistleblowing in a research swarm', 'https://arxiv.org/html/2609.04170v1', 'One hundred autonomous agents working on 71 formalized math conjectures: the largest swarm we found.'],
      ['SwarmBench', 'https://arxiv.org/pdf/2608.30661', 'A benchmark of whether language models can orchestrate agent swarms.'],
      ['CoAgent: concurrency control', 'https://arxiv.org/pdf/2606.15376', 'How parallel agents avoid stepping on each other when editing the same code.'],
      ['Claim Plane', 'https://arxiv.org/pdf/2608.00947', 'A 30-pair, three-seed study of pre-write admission for parallel coding agents.'],
      ['Eight weeks running a coding-agent swarm', 'https://github.com/mark-hallam/markhallam-website/pull/7', 'A practitioner’s write-up of what went wrong over a two-month run, and why it was shut down.']
    ] },
    { title: 'Places that already share agent logs', sub: 'Public or request-gated collections of coding-agent sessions.', items: [
      ['Trace Commons', 'https://huggingface.co/datasets/trace-commons/agent-traces', 'Public coding-agent sessions donated by contributors, including Claude Code JSONL. Worth checking for sub-agent folders.'],
      ['Agentic Vibecoding Traces', 'https://huggingface.co/datasets/saidutta69/agentic-vibecoding-traces', 'Gated set with about 47 Claude Code segments. Access is by request.'],
      ['Hugging Face: agent traces docs', 'https://huggingface.co/docs/hub/en/agent-traces', 'How the Hub reads Claude Code logs and how to redact them before sharing.']
    ] }
  ];
  const card = ([t, u, d]) => `<a class="card srccard" href="${esc(u)}" target="_blank" rel="noopener noreferrer"><h3>${esc(t)}</h3><p class="sub">${esc(d)}</p><span class="srcurl">${esc(u.replace(/^https?:\/\//, ''))}</span></a>`;
  window.Sources = {
    bind() {},
    open(el) {
      if (el.dataset.ready) return;
      el.dataset.ready = '1';
      el.addEventListener('click', e => { if (e.target.closest('[data-go]')) { e.preventDefault(); document.getElementById('tab-bench').click(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
      el.innerHTML = `<section class="srcs"><h2>Where to find swarm logs</h2><p class="lead">We study how swarms are built and how they perform. These are the teams, papers and archives with real multi-agent runs. If you run one and can share logs, parsed in your browser or sent to us as structure only, <a href="#bn-top" data-go="bench">run a Swarm check</a> or get in touch.</p>${GROUPS.map(g => `<h3>${esc(g.title)}</h3><p class="sub">${esc(g.sub)}</p><div class="srcgrid">${g.items.map(card).join('')}</div>`).join('')}</section>`;
    }
  };
})();
