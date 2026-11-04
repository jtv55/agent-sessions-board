// Deployment settings. Both are optional: with neither set the site is a fully working single-player grader.
//   API          Base URL of the board API (see backend/worker.js). Enables claim-a-handle and the community leaderboard.
//   STRIPE_LINK  A Stripe Payment Link for Swarm Pro. Enables the upgrade buttons.
window.SWARM_CONFIG = {
  API: '',
  STRIPE_LINK: '',
  PRICE: '$19/mo',
};
