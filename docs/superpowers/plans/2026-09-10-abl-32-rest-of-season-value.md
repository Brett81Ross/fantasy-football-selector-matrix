# ABL-32 Rest-of-Season Value Matrix™ Implementation Plan

**Goal:** Produce explainable, position-aware rest-of-season player values from current Matrix data without letting a short hot streak dominate the result.

**Architecture:** Add `season-core/rest-of-season-value.js` as a pure UMD/CommonJS engine. It consumes canonical player values, LeagueSnapshot status/freshness, and optional schedule/scarcity context. It reuses ABL-28 Data Confidence Matrix™ for certainty, but keeps value and confidence separate. The engine normalizes replacement value within each position group, applies a modest position-scarcity factor, and returns deterministic 0–100 ROS scores with factor breakdowns and reasons.

**Spec:** `docs/superpowers/specs/2026-09-09-abl-27-36-fantasy-intelligence-design.md`

## Scoring model

Weighted ROS value (0–100):
- production: 18%
- opportunity/role: 20%
- consistency/floor: 9%
- ceiling: 11%
- trend: 7%
- availability: 12%
- replacement value within position: 10%
- positional scarcity: 5%
- remaining schedule: 4%
- fantasy-playoff schedule: 4%

Opportunity has more weight than trend, preventing unsupported short hot streaks from dominating. Schedule factors are neutral (50) when unavailable and must be labeled as neutral/missing rather than invented.

## Public API

```js
rankRestOfSeason(playerValues, snapshot, context?)
scoreRestOfSeasonPlayer(player, snapshot, context, groupContext?)
enrichPlayerValues(playerValues, snapshot, context?)
```

Rank record:
```js
{
  playerId,
  name,
  position,
  restOfSeasonValue,
  tier,
  risk,
  confidence,
  confidenceLabel,
  factors: {
    production, opportunity, consistency, ceiling, trend,
    availability, replacementValue, scarcity, schedule, playoffSchedule
  },
  reasons: []
}
```

## Task 1 — Pure ROS engine

**Create:** `season-core/rest-of-season-value.js`
**Create:** `tests/rest-of-season-value.test.js`

TDD acceptance:
- supported hot streak with strong opportunity can rank highly;
- unsupported hot streak with weak opportunity cannot beat a similarly talented player with stable role solely on trend;
- injured/high-risk player receives an availability adjustment;
- equivalent raw scores are normalized within their own positions rather than compared naively by raw fantasy points;
- schedule/playoff context changes value only when supplied;
- every result exposes factor breakdown, confidence, reasons, and immutable inputs;
- output order is deterministic.

## Task 2 — Browser/runtime wiring

**Modify:** `api/app.js`
**Create or extend:** runtime wiring test

Load `season-core/rest-of-season-value.js` after `data-confidence.js` and before waiver/trade engines that will consume it in later ABL items. No new top-level UI in ABL-32.

## Task 3 — Compatibility bridge

`enrichPlayerValues()` must preserve every original player field and add only:
- `restOfSeasonValue`
- `rosTier`
- `rosConfidence`
- `rosFactors`

This lets ABL-31 and ABL-33 consume the value authority without mutating canonical NFL data or changing current APIs.

## Task 4 — Verification gate

- RED new ROS tests before implementation.
- GREEN ROS tests after implementation.
- Full `node --test tests/*.test.js` green on temporary branch-only CI.
- Verify old lineup, waiver, trade, opponent, Sleeper ownership, health, and season replay suites still pass.
- Remove temporary workflow after evidence is captured.
- Verify `vercel.json` still has `git.deploymentEnabled=false`.
- No service-worker registration, no preview, no main merge, no deployment.

After this clean checkpoint, continue to ABL-29 Matchup Simulator™.
