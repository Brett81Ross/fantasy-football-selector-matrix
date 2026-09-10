# ABL-29 — Matchup Simulator™ Implementation Plan

## Objective
Build a deterministic seeded Monte Carlo engine that estimates the current-week win probability for the user's optimized lineup against the current opponent and identifies legal start/sit swaps that materially improve that probability.

## Constraints
- Pure deterministic module: no network, browser, storage, or transaction side effects.
- Same snapshot + player values + seed + iteration count must return the same result.
- Use canonical LeagueSnapshot roster-slot eligibility; never hard-code a standard lineup.
- Reuse Lineup Optimizer for legal baseline lineups.
- Reuse Data Confidence Matrix for recommendation confidence.
- Risk and confidence remain separate concepts.
- No external roster transactions; recommendations are advisory only.
- No service worker changes, deployment changes, preview deployment, main merge, or production release in this ABL item.

## Simulation model
1. Optimize both weekly lineups using `season-core/lineup-optimizer.js`.
2. Build a weekly scoring distribution for each starter from:
   - weekly projection (`weeklyProjection`, then `projection`, then `value`)
   - explicit floor/ceiling when supplied
   - explicit `weeklyStdDev`/`stdDev`/`volatility` when supplied
   - conservative position-based volatility defaults only when the player has no variance inputs
   - existing lineup risk to widen uncertainty without inventing a categorical play probability
3. Sample each starter with a seeded PRNG + Box-Muller normal draw, clamped to the player's floor/ceiling.
4. Aggregate team totals per simulation and report win/tie/loss probability plus score/margin summaries.
5. Evaluate legal one-for-one bench-to-starter swaps for the user's lineup. Re-simulate each candidate with a seed derived from the base seed so comparisons are reproducible. Return only swaps that improve win probability by a material threshold.
6. Combine starter confidence assessments through the Data Confidence Matrix for overall simulation confidence.

## Public API
`simulateMatchup(snapshot, rosterId, playerValues, options={})`

Expected output includes:
- `myRosterId`, `opponentRosterId`, `week`
- `seed`, `iterations`
- `winProbability`, `tieProbability`, `lossProbability`
- `myAverageScore`, `opponentAverageScore`, `averageMargin`
- `myLineup`, `opponentLineup`
- `confidence`, `confidenceLabel`, `risk`
- `recommendedSwaps[]` with starter, bench replacement, probability delta, confidence, risk, and reason

## TDD gates
- RED: module absent and simulator contract tests fail.
- GREEN: deterministic seeded results, stronger-team probability, stale-confidence penalty, legal upside swap, immutable inputs.
- Integration: browser runtime loads Matchup Simulator after lineup/confidence dependencies.
- Full regression: `node --test tests/*.test.js`.
- Cleanup: remove temporary branch-only CI workflow after final GREEN.
