// Deployment settings. Both are optional: with neither set the site is a fully working single-player grader.
//   API          Base URL of the board API (see backend/worker.js). Enables claim-a-handle and the community leaderboard.
//   STRIPE_LINK  A Stripe Payment Link for Swarm Members. Enables the upgrade buttons.
window.SWARM_CONFIG = {
  API: 'https://swarm-board.swarm-board-jtv.workers.dev',
  STRIPE_LINK: 'https://buy.stripe.com/fZu14ofkZ550gNC3X7dAk02',
  PRICE: '$20/mo',
};
