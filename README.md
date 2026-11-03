# Agent sessions board

A private dashboard. The data file (`data.enc.json`) is encrypted with AES-256-GCM, with a key derived from a passphrase using PBKDF2-SHA256 (600,000 iterations). Decryption happens in the browser; nothing is sent anywhere.

## Public swarms tab

Three sets of openly licensed public agent logs, run through a workforce battery (mayor, spans and layers, leveling and compa-ratio, contingent mix and geo, activity analysis, roles vs titles, tool cost and T&E, make vs buy, attrition and OOO, LTV/CAC, DORA/SPACE, Pareto, output per agent over time), plus a flow-of-value set (project value chain, planned vs unplanned vs rework, WIP and cycle time, variability, constraints, the eight lean wastes, a bullshit-jobs audit) inspired by The Phoenix Project, The Goal, Factory Physics, Bullshit Jobs and Theory of Constraints:

- **Deep dives**: real Claude Code transcripts with sub-agent hierarchy (crispwisp/wisp-claude-code-sessions, armand0e/claude-fable-5-claude-code, trace-commons/agent-traces).
- **Fleet**: CooperBench, 368 tasks run by two cooperating agents and by one agent alone.
- **Production traces**: SemiAnalysis Claude Code fan-out traces (timing and tokens only).

`public-swarms.json` is built by `python tools/build_public_swarms.py` from pinned dataset revisions. The analysis is in `battery.js`, the charts in `charts.js`, `flow.js` (spans, value chain, flow, constraints, wastes) and `fleet.js`, and the tab shell and plain-English intro in `swarms.js`. T&E is priced from per-call traces (`extCalls`) at list price: $0.01 per web search plus the cost of carrying each result in context; other tools have no vendor fee in the logs.
Charts use Plotly (strict CSP build, MIT) vendored in `vendor/`. Dataset licenses are listed in the tab under "Sources, method and caveats".

## Frameworks lens and Swarm benchmark tab

- **Frameworks** (in Public swarms): MAST (`mcemri/MAST-Data`, CC-BY-4.0), 1,642 traces of ChatDev, MetaGPT, AG2, Magentic-One, AppWorld, HyperAgent and OpenManus with 14 labelled failure modes. Parsed by `build_mast()` in the build script; the view is `mast.js`.
- **Swarm benchmark** (`bench.js`): one 0 to 100 composite and A to F grade per swarm, from five dimensions (outcome, reliability, efficiency, flow, coordination) with adjustable weights. Unmeasurable dimensions are dropped and the score is pulled toward 50 in proportion to what is missing; entrants under 50% coverage are listed but not ranked. Formulas are in the tab under "Method, formulas and caveats".
