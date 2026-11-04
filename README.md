# Do you even swarm?

A public benchmark for AI agent teams. Grade your own Claude Code session logs against 60+ public swarms: a letter grade, a rank, a share card, a challenge link and a README badge. Static site (GitHub Pages), no build step.

- **Swarm benchmark tab**: drop a folder of session logs (parsed in the browser, nothing uploaded), see your composite grade and rank, tune the weights, browse dataset report cards with copyable badges.
- **Public swarm deep dives tab**: Claude Code transcripts, CooperBench fleet, MAST frameworks (with a framework ranking), production timing traces, flow-of-value analytics.
- **Data**: nine open Hugging Face datasets pinned to a revision (see `tools/build_public_swarms.py`; rebuild with `python -I tools/build_public_swarms.py`).

## Turning on the business side
Edit `config.js`:
- `STRIPE_LINK`: a Stripe Payment Link for Swarm Index. Enables the upgrade buttons.
- `API`: URL of the board API (`backend/worker.js`, a Cloudflare Worker + KV). Enables claim-a-handle and the community leaderboard. Also allow its origin in the CSP `connect-src` in `index.html` (`*.workers.dev` is already allowed).

Without either, the site is a complete single-player grader.
