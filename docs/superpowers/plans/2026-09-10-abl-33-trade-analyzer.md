# ABL-33 Trade Analyzer Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evaluate fantasy trades by their deterministic before/after effect on the user's roster while keeping market fairness separate from roster benefit.

**Architecture:** Add a pure `season-core/trade-analyzer.js` engine that clones the canonical LeagueSnapshot in memory, validates ownership/counts, applies the proposed exchange, and reuses the existing Lineup Optimizer and Roster Doctor plus ABL-32 rest-of-season values. Trade Hunter remains the discovery engine but delegates final deal evaluation to the analyzer. Season Intelligence renders the analyzer's before/after deltas without submitting transactions.

**Tech Stack:** JavaScript UMD/CommonJS modules, Node `node:test`, existing LeagueSnapshot contracts, Lineup Optimizer, Roster Doctor, Data Confidence Matrix™, Rest-of-Season Value Matrix™.

**Spec:** `docs/superpowers/specs/2026-09-09-abl-27-36-fantasy-intelligence-design.md`

## Global Constraints

- No Vercel preview deployments.
- No production deployment until Brett explicitly approves the completed ABL batch.
- Keep production deployment lock intact during implementation and QA.
- Do not introduce service workers.
- Preserve current successful production deployment as rollback candidate.
- Mobile-first UI, including narrow Android and Samsung Galaxy Z Fold layouts.
- Every recommendation must degrade safely when upstream data is stale or unavailable.
- Prefer deterministic, explainable scoring over opaque model outputs.
- Do not add a database, payment dependency, or automatic Sleeper transaction.

---

### Task 1: Pure Trade Analyzer

**Files:**
- Create: `season-core/trade-analyzer.js`
- Create: `tests/trade-analyzer.test.js`

**Interfaces:**
- Consumes: `analyzeTrade(snapshot, rosterId, deal, playerValues, context?)` where `deal={counterpartRosterId,givePlayerIds,getPlayerIds}`.
- Produces: immutable analysis containing `valid`, `fairness`, `rosterBenefit`, `before`, `after`, `deltas`, `confidence`, `risk`, `reasons`, `risks`, `freshness`, and `affectedPlayerIds`.

- [ ] **Step 1: Write failing unit tests**

Cover these behaviors with real module imports:

```js
const result=analyzeTrade(snapshot,'ME',{counterpartRosterId:'THEM',givePlayerIds:['RB1'],getPlayerIds:['WR2']},values);
assert.equal(result.fairness.label,'FAIR');
assert.equal(result.rosterBenefit.label,'HURTS_TEAM');
assert.ok(result.deltas.lineupPoints<0);
```

Add separate tests proving: a beneficial trade improves optimized lineup/ROS output; a 2-for-2 trade preserves each roster count and remains legal; wrong ownership/duplicate IDs are rejected; identical inputs return deep-equal output; snapshot/playerValues are not mutated; playoff outlook is `null` when no playoff factor exists rather than invented.

- [ ] **Step 2: Run RED gate**

Run: `node --test tests/trade-analyzer.test.js`
Expected: FAIL because `season-core/trade-analyzer.js` does not exist.

- [ ] **Step 3: Implement minimal analyzer**

Required structure:

```js
analyzeTrade(snapshot, rosterId, deal, playerValues, context={})
```

Validation must require both rosters, non-empty unique give/get lists, correct current ownership, no overlap, and equal player counts unless an explicit roster-space transaction is supplied in a future ABL. Apply the trade only to cloned roster arrays. Compute before/after optimized lineup points via `lineupOptimizer.optimizeLineup`, roster/positional/depth state via `rosterDoctor.evaluateRoster`, mean roster ROS value from `restOfSeasonValue`, and optional playoff score only when `rosFactors.playoffSchedule` exists. Reject a trade that converts a previously legal lineup into an illegal one.

Fairness must use market value only. Roster benefit must use lineup, depth, position resilience, ROS value, and available playoff context. They must be separate objects so a `FAIR` trade can still be `HURTS_TEAM`.

- [ ] **Step 4: Run GREEN gate**

Run: `node --test tests/trade-analyzer.test.js`
Expected: all Task 1 tests PASS.

- [ ] **Step 5: Commit Task 1**

Commit message: `feat: add deterministic trade analyzer`

---

### Task 2: Make Trade Hunter Use Roster Outcome

**Files:**
- Modify: `season-core/trade-hunter.js`
- Modify: `tests/trade-hunter.test.js`
- Create: `tests/trade-analyzer-wiring.test.js`

**Interfaces:**
- Trade Hunter continues to expose `findTradeOpportunities(snapshot, rosterId, playerValues)`.
- Each returned opportunity gains `analysis` and uses analyzer roster-benefit output as the final acceptance/ranking authority.

- [ ] **Step 1: Write failing integration tests**

Assert that every returned Trade Hunter opportunity has a valid analyzer result, `fairness` and `rosterBenefit` remain separate, and a market-fair candidate that hurts the user's optimized roster is excluded even if raw player values look equal.

- [ ] **Step 2: Run RED gate**

Run: `node --test tests/trade-hunter.test.js tests/trade-analyzer-wiring.test.js`
Expected: FAIL because Trade Hunter does not delegate to Trade Analyzer.

- [ ] **Step 3: Wire analyzer into Trade Hunter**

Require/inject `trade-analyzer` before candidate finalization. For each candidate, call:

```js
const analysis=tradeAnalyzer.analyzeTrade(snapshot,mineId,{
  counterpartRosterId:otherId,
  givePlayerIds:[give.id],
  getPlayerIds:[get.id]
},playerValues);
```

Keep only `analysis.valid===true` and `analysis.rosterBenefit.label!=='HURTS_TEAM'`. Preserve existing buy-low/sell-high signals. Expose analyzer `fairness`, `rosterBenefit`, `before`, `after`, `deltas`, `confidence`, and `risk` on the returned opportunity. Rank by roster benefit/composite edge first, then confidence, then existing deterministic tie-breakers.

- [ ] **Step 4: Run GREEN gate**

Run: `node --test tests/trade-hunter.test.js tests/trade-analyzer-wiring.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit Task 2**

Commit message: `feat: rank trades by roster outcome`

---

### Task 3: Runtime and Season Intelligence UI

**Files:**
- Modify: `api/app.js`
- Modify: `season-intelligence.js`
- Extend: `tests/trade-analyzer-wiring.test.js`

**Interfaces:**
- Browser global: `window.FFMTradeAnalyzer`.
- Load order: `lineup-optimizer.js` and `rest-of-season-value.js` before `trade-analyzer.js`, and `trade-analyzer.js` before `trade-hunter.js` / `weekly-attack-plan.js`.

- [ ] **Step 1: Write failing wiring/UI tests**

Assert runtime load order and visible Trade Hunter copy for `FAIRNESS`, `ROSTER BENEFIT`, `LINEUP`, `ROS VALUE`, `DEPTH`, and optional `PLAYOFF` when available. Assert no automatic transaction method or service-worker registration is introduced.

- [ ] **Step 2: Run RED gate**

Run: `node --test tests/trade-analyzer-wiring.test.js`
Expected: FAIL on missing runtime/UI integration.

- [ ] **Step 3: Implement UI wiring**

Update `renderTrade()` to show the deal headline followed by separate fairness and roster-benefit labels and compact before→after/delta metrics. Omit playoff metric when analyzer returns `null`; never display a fabricated playoff number. Keep recommendation-only copy.

- [ ] **Step 4: Run GREEN gate**

Run: `node --test tests/trade-analyzer-wiring.test.js`
Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Commit message: `feat: show trade roster impact in season intelligence`

---

### Task 4: Full Regression and Hygiene

**Files:**
- Temporary only: `.github/workflows/abl-33-trade-qa.yml`

- [ ] **Step 1: Run full repository suite**

Run: `node --test tests/*.test.js`
Expected: all tests PASS, including Sleeper ownership, health fallback, matchup, injury, FAAB, ROS, lineup, waiver, trade, opponent, and replay tests.

- [ ] **Step 2: Verify release guardrails**

Confirm `vercel.json` still contains `"deploymentEnabled":false`, app version authority remains `1.5.5`, and no new service-worker registration exists.

- [ ] **Step 3: Remove temporary QA workflow**

Delete `.github/workflows/abl-33-trade-qa.yml` after capturing final GREEN evidence.

- [ ] **Step 4: Compare branch to main**

Verify changes remain on `abl-sleeper-id-crosswalk`; do not merge, deploy, or change production.

After this clean checkpoint, continue to ABL-34 Playoff Path™.