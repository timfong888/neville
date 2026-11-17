// Single source for the numbers shown on /architecture and in the demo's cost meter.
// Keep in step with docs/specs/architecture.md.

/** Free creations before the sign-up gate (script variations count). */
export const FREE_ANON_GENERATIONS = 2;

/** Per-call list prices used by the demo's cost meter (USD). PROVISIONAL. */
export const DEMO_UNIT_COST = {
  script: 0.001,
  ttsPer1kChars: 0.015,
  image: 0.003,
};
