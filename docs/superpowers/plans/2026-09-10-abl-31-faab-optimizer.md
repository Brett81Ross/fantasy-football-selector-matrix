# ABL-31 FAAB / Waiver Bid Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic FAAB bid recommendation layer to Waiver Assassin using real league budget state, roster need, player value, positional scarcity, league size, remaining budget, replacement value, and data confidence.

**Architecture:** Preserve FAAB state in the canonical `LeagueSnapshot` and Sleeper provider without guessing missing values. Build a pure `season-core/faab-optimizer.js` engine that consumes a ranked waiver move plus snapshot/player context and returns a conservative/aggressive bid range, recommended bid, budget share, confidence, risk, and explanation. Then wire the result into Waiver Assassin and Season Intelligence UI while preserving advisory-only behavior.

**Tech Stack:** Node.js CommonJS/UMD browser modules, Node built-in test runner, GitHub Actions branch QA.

**Spec:** Approved ABL-31 scope from the Fantasy Football Matrix Atomic Build List.

## Global Constraints

- Work only on branch `abl-sleeper-id-crosswalk`.
- Do not merge to `main` or deploy to Vercel.
- Keep app version at `1.5.5` during branch implementation.
- Preserve `"deploymentEnabled": false`.
- Do not add or register a service worker.
- Sleeper integration remains read-only and subject to the existing commercial licensing gate.
- Missing FAAB totals must remain unknown; never assume a $100 budget.

---

### Task 1: Canonical FAAB Budget State

**Files:**
- Modify: `season-core/contracts.js`
- Modify: `draft-core/sleeper-provider.js`
- Test: `tests/sleeper-season-snapshot.test.js`

**Interfaces:**
- Consumes Sleeper league `settings.waiver_budget` when numeric and roster `settings.waiver_budget_used`.
- Produces `snapshot.league.waiverBudgetTotal` and per-roster `waiverBudgetUsed`, `waiverBudgetRemaining`, `waiverPosition`.

- [ ] Write failing snapshot assertions for total, used, remaining, and waiver position.
- [ ] Run full tests and verify only new assertions fail.
- [ ] Preserve fields through provider + canonical normalization, with `null` when total is unknown.
- [ ] Run full tests GREEN.
- [ ] Commit.

### Task 2: Pure FAAB Optimizer

**Files:**
- Create: `season-core/faab-optimizer.js`
- Create: `tests/faab-optimizer.test.js`

**Interfaces:**
- Consumes: `optimizeFaabBid(snapshot, rosterId, waiverMove, playerValues, context={})`.
- Produces: `{available, recommendedBid, minBid, maxBid, budgetRemaining, budgetTotal, budgetShare, confidence, risk, aggressiveness, factors, reason}`.

- [ ] Write RED tests proving stronger need/value/scarcity raises bids; low remaining budget caps spend; non-FAAB/unknown budget returns unavailable; stale data reduces confidence; no mutation.
- [ ] Verify RED because module is absent.
- [ ] Implement deterministic scoring and bid range generation.
- [ ] Run full tests GREEN.
- [ ] Commit.

### Task 3: Waiver Assassin + UI Integration

**Files:**
- Modify: `season-core/waiver-assassin.js`
- Modify: `api/app.js`
- Modify: `season-intelligence.js`
- Create: `tests/faab-wiring.test.js`

**Interfaces:**
- Waiver moves gain optional `faab` output from the pure optimizer.
- Browser runtime loads `faab-optimizer.js` before `waiver-assassin.js`.
- Waiver Assassin UI displays bid range only when `faab.available === true`.

- [ ] Write RED browser/integration tests.
- [ ] Wire optimizer into Waiver Assassin and UI.
- [ ] Run full suite GREEN.
- [ ] Confirm version/deploy lock/service-worker constraints remain intact.
- [ ] Remove temporary CI workflow after final GREEN.
