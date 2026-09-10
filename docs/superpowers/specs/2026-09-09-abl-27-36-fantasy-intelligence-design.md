# Fantasy Football Matrix™ — ABL-27 through ABL-36 Design

Date: 2026-09-09
Branch: `abl-sleeper-id-crosswalk`
Status: Approved design; implementation not started

## Objective

Turn Fantasy Football Matrix™ from a collection of strong individual tools into a single decision system that continuously answers: **What is the best move I can make to improve my chances of winning?**

This batch builds on the existing Sleeper sync, Season Intelligence, Roster Doctor, Maximum Edge lineup optimizer, Waiver Assassin, Trade Hunter, Opponent Exploiter, Weekly Attack Plan, nflverse data engine, and current ownership-sync work. It must not duplicate those systems; new modules should consume their canonical outputs where possible.

## Constraints

- No Vercel preview deployments.
- No production deployment until Brett explicitly approves the completed ABL batch.
- Keep production deployment lock intact during implementation and QA.
- Do not introduce service workers.
- Preserve current successful production deployment as rollback candidate.
- Keep Fantasy Football Matrix™ isolated from other CactusByte apps except future centralized entitlement integration.
- Mobile-first UI, including narrow Android and Samsung Galaxy Z Fold layouts.
- Every recommendation must degrade safely when upstream data is stale or unavailable.
- Prefer deterministic, explainable scoring over opaque model outputs.
- No payment integration in this batch; ABL-36 only defines the Pro boundary and entitlement hooks.
- Do not add a new database or durable backend solely for this batch.

## Shared Architecture

### Canonical inputs

All ABL-27–36 modules should consume the existing canonical structures rather than calling providers independently:

- `state.players` / nflverse-backed player pool
- Sleeper league snapshot and ownership state
- season-provider reliability/freshness state
- Roster Doctor output
- lineup optimizer output
- Waiver Assassin output
- Trade Hunter output
- Opponent Exploiter output
- Weekly Attack Plan output

### Shared decision envelope

New recommendation-producing modules should return a common envelope:

```js
{
  actionType,
  headline,
  summary,
  confidence,
  expectedEdge,
  reasons: [],
  risks: [],
  freshness,
  affectedPlayerIds: []
}
```

This prevents each screen from inventing its own recommendation semantics and lets the Weekly Team Report Card and future Pro layer reuse the same results.

### Fail-safe behavior

- If ownership data is contradictory, `owned` wins over `free`.
- If provider freshness is stale, recommendations remain visible but confidence is reduced and the UI clearly labels stale inputs.
- If a required input is missing, do not fabricate a recommendation; return an unavailable/degraded state with the missing dependency named.
- Locked players and already-started games must never be proposed for invalid lineup moves.

---

## ABL-27 — Live Data Health Parity

### Goal

Make health reporting reflect the same fallback chain and runtime behavior as the actual data engine.

### Design

- Extract or share the nflverse source-selection logic used by `api/nfl-data.js` so `api/health.js` tests the same candidate feeds in the same order.
- Health states: `LIVE`, `DEGRADED`, `STALE`, `OFFLINE`.
- Record request-time source freshness plus the latest successful timestamp available from the existing runtime/cache; do not add durable storage just for health history.
- Distinguish primary-feed failure with successful fallback from total outage.
- ESPN scoreboard health must be based on the actual request behavior used by the runtime, not a separate probe that can produce false 403s.

### Acceptance

- Health endpoint cannot report a performance outage while the data engine is successfully serving fallback performance data.
- Health response identifies active source and fallback state.
- Regression tests cover primary success, fallback success, stale fallback, and total failure.

---

## ABL-28 — Data Confidence Matrix™

### Goal

Attach an explainable confidence score to decisions.

### Inputs

- source freshness
- player game sample size
- injury/availability status
- role/opportunity stability
- ownership certainty
- projection disagreement/volatility where available

### Output

0–100 confidence plus categorical label: `HIGH`, `MEDIUM`, `LOW`, `UNAVAILABLE`.

Confidence is not the same as player quality. A high-value but uncertain player can have high expected upside and low confidence.

### Acceptance

- Identical decision with stale data scores lower than with fresh data.
- Limited-sample rookies do not receive artificially high certainty.
- Confidence reasons are human-readable.

---

## ABL-29 — Matchup Simulator™

### Goal

Estimate the user's weekly win probability and identify the highest-impact legal lineup changes.

### Design

Use a deterministic seeded Monte Carlo simulation. Each starter is sampled from a bounded distribution derived from floor, average, ceiling, volatility, status, and opponent context. The same canonical inputs and seed must produce the same result in tests and replays. Reuse the current lineup optimizer and opponent snapshot rather than creating a second lineup model.

Outputs:

- baseline win probability
- projected team score range
- opponent score range
- best legal lineup alternative
- expected win-probability delta
- primary swing players

Do not simulate unavailable information as certainty; confidence comes from ABL-28.

### Acceptance

- Same deterministic seed produces repeatable test output.
- Illegal/locked swaps are excluded.
- Suggested lineup cannot reduce expected edge unless explicitly labeled as a high-variance comeback strategy.

---

## ABL-30 — Late-Swap / Injury Command Center

### Goal

Surface urgent lineup problems before they cost a matchup.

### Design

Generate prioritized alerts for:

- OUT / IR player in starting slot
- doubtful starter
- questionable starter with weak backup coverage
- bye-week starter
- locked lineup conflicts
- replacement candidate whose game starts earlier than the injured player's game

UI is an in-app command center only. No service worker.

### Acceptance

- No alert for healthy legal lineup.
- OUT starter produces critical alert and best legal replacement if available.
- Locked players are never recommended as movable.

---

## ABL-31 — FAAB / Waiver Bid Optimizer

### Goal

Upgrade Waiver Assassin from player selection to actionable acquisition strategy.

### Inputs

- player rest-of-season value
- roster need
- positional scarcity
- league size
- remaining FAAB budget when available
- replacement value
- opportunity trend
- ownership availability
- confidence

### Output

- recommended bid percentage/range
- aggressiveness: `CONSERVATIVE`, `TARGET`, `AGGRESSIVE`
- rationale
- suggested drop
- resulting roster/lineup edge

If the league does not use FAAB or budget information is unavailable, gracefully fall back to waiver priority advice without inventing a dollar value.

### Acceptance

- Rostered players never receive bids.
- Higher roster need and scarcity can increase bid recommendation.
- Low confidence constrains aggressive bid recommendations.

---

## ABL-32 — Rest-of-Season Value Matrix™

### Goal

Rank players by expected value from now through the fantasy postseason rather than historical production alone.

### Components

- recent production
- opportunity/role trend
- floor and ceiling
- availability risk
- positional scarcity
- remaining schedule strength when schedule data is available
- fantasy-playoff schedule weighting
- replacement value

Use position-aware normalization so QB, RB, WR, TE, K, and DST are not compared with naive raw-point scales.

### Acceptance

- A short hot streak cannot dominate the score without opportunity support.
- Injured/high-risk players receive appropriate risk adjustment.
- Output includes explainable factor breakdown.

---

## ABL-33 — Trade Analyzer Upgrade

### Goal

Evaluate trades by roster outcome, not simple player-for-player fairness.

### Design

For each proposed or Trade Hunter-generated deal, compute before/after:

- optimized starting lineup points/week
- bench/depth resilience
- positional scarcity
- rest-of-season roster value
- playoff outlook when available
- confidence/risk

Output should explicitly separate `fairness` from `benefit to my roster`.

### Acceptance

- A statistically fair trade can still be labeled bad for the user's roster.
- Multi-player trades preserve valid roster counts and positions.
- Before/after deltas are testable and deterministic.

---

## ABL-34 — Playoff Path™

### Goal

Show what must happen for the user's team to reach and succeed in the fantasy playoffs.

### Inputs

- league standings/records when available from Sleeper
- remaining schedule
- weekly matchup estimates
- roster strength
- future opponent strength
- playoff-week player schedules when available

### Output

- playoff probability
- must-win / leverage weeks
- remaining schedule difficulty
- roster weakness most likely to hurt playoff odds
- recommended improvement target

If standings or schedule data is unavailable, degrade to a playoff-readiness score instead of fabricating a probability.

### Acceptance

- Probability is only shown when required league data exists.
- Degraded mode is clearly labeled.
- Recommendations tie back to an actionable roster weakness.

---

## ABL-35 — What-If Matrix™

### Goal

Let users test a move without changing Sleeper.

### Supported scenarios

- start/sit
- add/drop
- trade

### Design

Clone the canonical league/roster state in memory, apply the proposed transaction to the clone, then rerun only affected intelligence modules. Never persist the simulated state as the real league snapshot.

Outputs:

- lineup edge delta
- roster-value delta
- matchup win-probability delta when available
- positional-depth delta
- confidence/risk delta
- recommendation: `IMPROVES TEAM`, `NEUTRAL`, `HURTS TEAM`

### Acceptance

- Original synced state remains byte-for-byte unchanged after simulation.
- Invalid transactions are rejected before recomputation.
- A reset returns instantly to canonical synced state.

---

## ABL-36 — Weekly Team Report Card + Pro Intelligence Boundary

### Goal

Create the single summary surface that tells the user what matters now, while defining future premium boundaries without adding billing yet.

### Weekly Report Card

Grades:

- QB
- RB
- WR
- TE
- FLEX
- bench/depth
- overall roster

Summary cards:

- Best Move
- Biggest Mistake / Risk
- Biggest Opportunity
- Player to Sell
- Player to Buy
- Waiver Priority
- Next Action

Each card consumes the shared decision envelope and displays confidence/freshness.

### Pro boundary

No checkout or Stripe work in this batch. Add entitlement-ready feature identifiers only, so the centralized CactusByte entitlement system can gate them later.

Pro candidates:

- Matchup Simulator™ advanced output
- FAAB / Waiver Bid Optimizer
- What-If Matrix™
- advanced Trade Analyzer deltas
- Playoff Path™

Core live data, basic ownership sync, basic rankings, health state, and safety-critical injury/lineup warnings remain ungated.

### Acceptance

- Weekly report can render even when some advanced modules are unavailable.
- Missing module output is omitted/degraded rather than blocking the report.
- No payment dependency is introduced.
- Feature IDs are centralized and deterministic for future CactusByte entitlement wiring.

---

## UI Integration

Avoid adding ten new top-level navigation buttons. New intelligence should be grouped into the existing season workflow:

1. **This Week** — Weekly Report Card, Matchup Simulator, Injury Command Center
2. **Improve Team** — Waiver/FAAB, Trade Analyzer, What-If Matrix
3. **Season Outlook** — Rest-of-Season Value, Playoff Path
4. **Data Status** — compact health/freshness indicator, with detailed status available on demand

On narrow screens, actionable recommendation cards come before charts. Explanations should be collapsible so the first screen answers the decision quickly.

## Implementation Order

Dependency order is fixed:

1. ABL-27 Live Data Health Parity
2. ABL-28 Data Confidence Matrix™
3. ABL-32 Rest-of-Season Value Matrix™
4. ABL-29 Matchup Simulator™
5. ABL-30 Late-Swap / Injury Command Center
6. ABL-31 FAAB / Waiver Bid Optimizer
7. ABL-33 Trade Analyzer Upgrade
8. ABL-34 Playoff Path™
9. ABL-35 What-If Matrix™
10. ABL-36 Weekly Team Report Card + Pro boundary

This order builds shared primitives first and prevents later modules from duplicating scoring logic.

## QA Strategy

Every ABL item follows RED → GREEN regression coverage before implementation is considered complete.

Required gates before release approval:

- unit tests for each new scoring/decision module
- Sleeper ownership regression suite
- season snapshot/reliability suite
- full repository `node --test tests/*.test.js`
- deterministic fixture replay for one complete league week
- stale/offline provider replay
- contradictory ownership replay
- locked-player lineup replay
- narrow mobile layout smoke test
- Z Fold unfolded layout smoke test
- no service-worker registration
- version/footer/legal/branding regression
- production URL remains untouched until explicit deployment approval

## Out of Scope for ABL-27–36

- multi-league dashboard (future ABL-37)
- Stripe/payment checkout
- centralized CactusByte entitlement backend implementation
- push notifications/service workers
- ESPN/Yahoo league integrations
- AI-generated opaque recommendations
- social/chat/community features

## Release Definition

ABL-27–36 is Ready only when all ten items pass their individual tests plus the full-system regression and UI smoke gates. At that point Brett receives the completed ABL summary and explicitly decides whether to merge/deploy. No deployment occurs automatically.
